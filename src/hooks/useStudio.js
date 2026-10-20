import { DEFAULT_BPM, sequenceMetadata, validBpm } from '../lib/sequencerState.js';
import { validateRegion } from '../lib/clipRegion.js';
import { useEffect, useRef, useState } from 'react';
import { MAX_TRACKS, SOUNDS, createTrack } from '../data/sounds.js';
import { AudioEngine } from '../lib/audioEngine.js';
import { deleteUnusedAudio, readAudio, readSavedMix, readSavedMixes, saveAudio, writeSavedMix } from '../lib/audioStorage.js';
import { STUDIO_STORAGE_KEY, defaultMix, loadMix, serializeMix, validateAudioFile, validateMix } from '../lib/studioState.js';
import { sameMix } from '../lib/savedMixes.js';

function initialMix() {
  try { return loadMix(localStorage); } catch { return defaultMix(); }
}

function initialProjectId() {
  try { return JSON.parse(localStorage.getItem(STUDIO_STORAGE_KEY))?.projectId || null; } catch { return null; }
}

function withSources(tracks) {
  return tracks.map((track) => ({ ...track, src: SOUNDS.find((sound) => sound.id === track.catalogId)?.src }));
}

export default function useStudio() {
  const [mix, setMix] = useState(initialMix);
  const [status, setStatus] = useState('ready');
  const [elapsed, setElapsed] = useState(0);
  const [currentStep, setCurrentStep] = useState(null);
  const [tempo, setTempo] = useState({ active: DEFAULT_BPM, pending: null });
  const [rhythmBusy, setRhythmBusy] = useState(false);
  const [details, setDetails] = useState({});
  const [notice, setNotice] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [booting, setBooting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [savedMixes, setSavedMixes] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectsBlocked, setProjectsBlocked] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const [editorId, setEditorId] = useState(null);
  const [editorLocation, setEditorLocation] = useState('mixer');
  const [preview, setPreview] = useState(null);
  const engine = useRef(null);
  const files = useRef({});
  const mixRef = useRef(null);
  const alive = useRef(false);
  const importLock = useRef(false);
  const projectLock = useRef(false);
  const statusRef = useRef('ready');

  useEffect(() => {
    alive.current = true;
    let canceled = false;
    const player = new AudioEngine({
      onError: (error) => { if (!canceled) setNotice(error.message); },
      onState: (state) => { if (!canceled) { statusRef.current = state; setStatus(state); } },
      onTrack: (id, metadata) => { if (!canceled) setDetails((previous) => ({ ...previous, [id]: metadata })); },
    });
    engine.current = player;
    const restored = initialMix();
    void (async () => {
      const custom = restored.tracks.filter((track) => !track.catalogId);
      const [results, library] = await Promise.all([
        Promise.allSettled(custom.map((track) => readAudio(track.id))),
        readSavedMixes().then((projects) => ({ projects }), (error) => ({ error })),
      ]);
      if (canceled) return;
      const found = {};
      let missing = false;
      let blocked = false;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value instanceof Blob) found[custom[index].id] = result.value;
        else { missing = true; blocked ||= result.status === 'rejected'; }
      });
      files.current = found;
      setMix({ ...restored, tracks: restored.tracks.filter((track) => track.catalogId || found[track.id]) });
      setStorageBlocked(blocked);
      if (missing) setStorageNotice(blocked
        ? 'Saved audio could not be opened. Your saved workspace has been preserved; try reloading with browser storage enabled.'
        : 'Some saved audio is missing. Import those recordings again.');
      if (library.error) {
        setProjectsBlocked(true);
        setSavedNotice(library.error.message || 'Saved mixes could not be opened. Enable browser storage and reload.');
      } else {
        setSavedMixes(library.projects);
        const id = initialProjectId();
        setActiveProjectId(library.projects.some((project) => project.id === id) ? id : null);
      }
      setBooting(false);
    })();
    const interval = window.setInterval(() => {
      if (!canceled) { setElapsed(player.position()); setPreview(player.previewPosition()); setCurrentStep(player.currentStep()); setTempo(player.tempoState()); }
    }, 50);
    const visibility = () => {
      if (document.hidden && player.playing && player.isSequencing()) {
        player.pause();
        setNotice('Pattern paused while this tab was hidden. Press Play to continue.');
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      canceled = true;
      alive.current = false;
      importLock.current = false;
      projectLock.current = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
      player.dispose();
    };
  }, []);

  useEffect(() => {
    mixRef.current = mix;
    engine.current?.setBpm(mix.bpm ?? DEFAULT_BPM);
    engine.current?.setTracks(withSources(mix.tracks));
    engine.current?.setMaster(mix.master);
  }, [mix]);

  function persistWorkspace(next, projectId) {
    try {
      localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify({ ...serializeMix(next), projectId }));
      return true;
    } catch {
      if (alive.current) setStorageNotice('Settings could not be saved. You can keep mixing in this tab.');
      return false;
    }
  }

  useEffect(() => {
    if (booting || storageBlocked) return;
    persistWorkspace(mix, activeProjectId);
  }, [mix, activeProjectId, booting, storageBlocked]);

  function changeMix(next) {
    mixRef.current = next;
    setMix(next);
  }

  // If the persisted workspace cannot be read, retain files rather than risk deleting a reference.
  async function reclaim(ids, next) {
    if (storageBlocked || projectsBlocked) return;
    let stored;
    try { stored = validateMix(JSON.parse(localStorage.getItem(STUDIO_STORAGE_KEY))); } catch { return; }
    if (!stored) return;
    try { await deleteUnusedAudio(ids, [...next.tracks, ...stored.tracks]); }
    catch { if (alive.current) setStorageNotice('Unused audio could not be cleaned up. Your remaining recordings have been kept.'); }
  }

  function updateTrack(id, changes) {
    if (projectLock.current) return;
    const current = mixRef.current.tracks.find((track) => track.id === id);
    if (current && changes.loop !== undefined && current.clipEnd != null && changes.loop !== current.loop) {
      engine.current.restart();
      setElapsed(0);
    }
    setMix((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === id ? { ...track, ...changes } : track) }));
  }

  function setMaster(master) {
    if (!projectLock.current) setMix((previous) => ({ ...previous, master }));
  }

  async function togglePlayback() {
    if (statusRef.current === 'playing' || statusRef.current === 'loading') {
      engine.current.pause();
      setElapsed(engine.current.position());
      return;
    }
    if (projectLock.current || importLock.current) return;
    setNotice('');
    try { await engine.current.play(withSources(mixRef.current.tracks), files.current, mixRef.current.master, mixRef.current.bpm); }
    catch (error) { if (alive.current) setNotice(error.message); }
  }

  async function restartPlayback() {
    if (projectLock.current) return;
    const wasPlaying = statusRef.current === 'playing';
    engine.current.restart();
    setElapsed(0);
    if (wasPlaying) await togglePlayback();
  }

  async function addSound(sound) {
    if (projectLock.current) return;
    const current = mixRef.current;
    if (current.tracks.some((track) => track.id === sound.id)) return;
    if (current.tracks.length >= MAX_TRACKS) { setNotice('A mix can contain up to 8 layers. Remove one to add another.'); return; }
    setNotice('');
    const track = createTrack(sound);
    if (statusRef.current === 'playing') {
      try { await engine.current.load({ ...track, src: sound.src }); }
      catch (error) { if (alive.current) setNotice(error.message); return; }
    }
    if (alive.current && !projectLock.current) setMix((previous) => previous.tracks.some((item) => item.id === track.id) || previous.tracks.length >= MAX_TRACKS
      ? previous : { ...previous, tracks: [...previous.tracks, track] });
  }

  async function importFiles(selected, role) {
    if (importLock.current || projectLock.current || !selected.length) return;
    importLock.current = true;
    setImporting(true);
    setNotice('');
    const player = engine.current;
    let slots = MAX_TRACKS - mixRef.current.tracks.length;
    const errors = [];
    let imported = 0;
    try {
      for (const file of selected) {
        if (!slots) { errors.push('A mix can contain up to 8 layers.'); break; }
        const id = 'custom-' + crypto.randomUUID();
        try {
          validateAudioFile(file);
          const track = { id, catalogId: null, name: file.name, role, volume: 50, muted: false, solo: false, loop: role === 'nature' };
          await player.load(track, file);
          if (!alive.current || player.disposed) return;
          try { await saveAudio(id, file); }
          catch { if (alive.current) setStorageNotice('An imported sound could not be saved. It is available in this tab; keep the original file to import again.'); }
          if (!alive.current || player.disposed) return;
          files.current[id] = file;
          setMix((previous) => ({ ...previous, tracks: [...previous.tracks, track] }));
          imported += 1;
          slots -= 1;
        } catch (error) {
          player.forget(id);
          errors.push(file.name + ': ' + error.message);
        }
      }
      if (alive.current) setNotice(errors.length ? errors.join(' ') : imported + (imported === 1 ? ' sound added to your mix.' : ' sounds added to your mix.'));
    } finally {
      importLock.current = false;
      if (alive.current) setImporting(false);
    }
  }

  async function removeTrack(id) {
    if (projectLock.current || importLock.current || booting) return;
    projectLock.current = true;
    setProjectBusy(true);
    try {
      if (editorId === id) setEditorId(null);
      engine.current.forget(id);
      delete files.current[id];
      const next = { ...mixRef.current, tracks: mixRef.current.tracks.filter((track) => track.id !== id) };
      changeMix(next);
      setDetails((previous) => { const copy = { ...previous }; delete copy[id]; return copy; });
      if (!storageBlocked && persistWorkspace(next, activeProjectId)) await reclaim([id], next);
    } finally {
      projectLock.current = false;
      if (alive.current) setProjectBusy(false);
    }
  }

  async function projectAction(action, data) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading' || projectsBlocked) return false;
    projectLock.current = true;
    setProjectBusy(true);
    setSavedNotice('');
    const player = engine.current;
    try {
      if (action === 'open') {
        closeClip();
        const loaded = await readSavedMix(data.id);
        if (!alive.current || player.disposed) return false;
        const oldIds = mixRef.current.tracks.filter((track) => !track.catalogId).map((track) => track.id);
        player.restart();
        for (const id of new Set([...player.buffers.keys(), ...player.pending.keys()])) player.forget(id);
        setElapsed(0);
        setDetails({});
        setNotice('');
        files.current = loaded.files;
        const next = validateMix(loaded.project.mix);
        changeMix(next);
        setActiveProjectId(loaded.project.id);
        setStorageBlocked(false);
        setSavedNotice('Opened “' + loaded.project.name + '”. Press Play to listen.');
        if (persistWorkspace(next, loaded.project.id)) await reclaim(oldIds, next);
      } else {
        const previous = savedMixes.find((project) => project.id === data.id);
        const projects = await writeSavedMix(action, { ...data, mix: mixRef.current });
        if (!alive.current || player.disposed) return false;
        setSavedMixes(projects);
        let activeId = activeProjectId;
        if (action === 'save' || action === 'update') activeId = data.id;
        if (action === 'delete' && data.id === activeProjectId) activeId = null;
        setActiveProjectId(activeId);
        const project = projects.find((item) => item.id === data.id);
        setSavedNotice(action === 'delete' ? 'Saved mix deleted. Your current workspace is still here.'
          : action === 'rename' ? 'Renamed to “' + project.name + '”.' : 'Saved “' + project.name + '”.');
        if (persistWorkspace(mixRef.current, activeId) && previous && (action === 'delete' || action === 'update')) {
          await reclaim(previous.mix.tracks.filter((track) => !track.catalogId).map((track) => track.id), mixRef.current);
        }
      }
      return true;
    } catch (error) {
      if (alive.current) setSavedNotice(error.message || 'This action could not be completed. Try again.');
      return false;
    } finally {
      projectLock.current = false;
      if (alive.current) setProjectBusy(false);
    }
  }

  function editPattern(id, change) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return;
    const track = mixRef.current.tracks.find((item) => item.id === id);
    if (!track) return;
    setMix((previous) => ({ ...previous, tracks: previous.tracks.map((item) => item.id === id
      ? { ...item, sequence: change(sequenceMetadata(item)) } : item) }));
    setNotice('');
  }

  function setBpm(value) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return;
    const bpm = validBpm(value);
    if (bpm === (mixRef.current.bpm ?? DEFAULT_BPM)) return;
    setMix((previous) => ({ ...previous, bpm }));
    setNotice('');
  }

  async function createRhythm(id) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return;
    const track = withSources(mixRef.current.tracks).find((item) => item.id === id);
    if (!track) return;
    importLock.current = true;
    setRhythmBusy(true);
    setNotice('');
    try {
      await engine.current.ensureContext().resume();
      const buffer = await engine.current.load(track, files.current[id]);
      if (!alive.current) return;
      const next = { ...mixRef.current, tracks: mixRef.current.tracks.map((item) => item.id === id ? {
        ...item, muted: false, volume: item.volume || 50,
        solo: mixRef.current.tracks.some((layer) => layer.solo) || item.solo,
        ...(item.clipEnd == null ? { clipStart: 0, clipEnd: Math.min(.18, buffer.duration) } : {}),
        sequence: { enabled: true, steps: Array.from({ length: 16 }, (_, index) => index % 4 === 0) },
      } : item) };
      changeMix(next);
      engine.current.setTracks(withSources(next.tracks));
      if (!engine.current.playing) await engine.current.play(withSources(next.tracks), files.current, next.master, next.bpm);
      if (!next.master) setNotice('Your rhythm is ready. Raise Master volume to hear it.');
    } catch (error) { if (alive.current) setNotice(error.message); }
    finally { importLock.current = false; if (alive.current) setRhythmBusy(false); }
  }

  async function previewSample(id) {
    if (preview?.id === id) { stopPreview(); return; }
    if (projectLock.current || importLock.current || booting) return;
    const track = withSources(mixRef.current.tracks).find((item) => item.id === id);
    if (!track) return;
    try {
      const buffer = await engine.current.load(track, files.current[id]);
      if (!alive.current || !mixRef.current.tracks.some((item) => item.id === id)) return;
      await previewClip(id, track.clipStart || 0, track.clipEnd ?? buffer.duration, false);
    } catch (error) { if (alive.current) setNotice(error.message); }
  }

  function resetLevels() {
    if (projectLock.current) return;
    setMix((previous) => ({ ...previous, master: 75, tracks: previous.tracks.map((track) => ({ ...track,
      volume: SOUNDS.find((sound) => sound.id === track.catalogId)?.volume ?? 50, muted: false, solo: false })) }));
  }

  function applyBlend(volumes) {
    if (projectLock.current) return;
    setMix((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.catalogId
      ? { ...track, volume: volumes[track.catalogId], muted: volumes[track.catalogId] === 0, solo: false } : track) }));
  }

  function stopPreview() {
    engine.current?.stopPreview();
    setPreview(null);
  }

  function closeClip() {
    stopPreview();
    setEditorId(null);
  }

  async function openClip(id, location = 'mixer') {
    if (projectLock.current || importLock.current || booting) return;
    stopPreview();
    setEditorId(id);
    setEditorLocation(location);
    setNotice('');
    const track = withSources(mixRef.current.tracks).find((item) => item.id === id);
    if (!track) return;
    try { await engine.current.load(track, files.current[id]); }
    catch (error) { if (alive.current) setNotice(error.message); }
  }

  async function previewClip(id, start, end, loop) {
    if (projectLock.current || importLock.current) return;
    const track = withSources(mixRef.current.tracks).find((item) => item.id === id);
    if (!track) return;
    try {
      await engine.current.preview(track, files.current[id], start, end, loop);
      if (alive.current) { setElapsed(engine.current.position()); setPreview(engine.current.previewPosition()); }
    } catch (error) { if (alive.current) setNotice(error.message); }
  }

  function applyClip(id, start, end, loop, reset = false) {
    if (projectLock.current || importLock.current) return;
    const duration = engine.current.buffers.get(id)?.duration;
    const region = validateRegion(start, end, duration);
    engine.current.restart();
    setElapsed(0);
    setPreview(null);
    updateTrack(id, { ...(reset ? { clipStart: 0, clipEnd: null } : region), loop });
    setNotice(reset ? 'Full recording restored. Press Play to listen.' : 'Clip applied. The mix starts at the beginning of each selected region.');
    setEditorId(null);
  }

  const activeProject = savedMixes.find((project) => project.id === activeProjectId);
  const dirty = activeProject ? !sameMix(mix, activeProject.mix) : mix.tracks.length > 0;
  return { ...mix, bpm: mix.bpm ?? DEFAULT_BPM, currentStep, tempo, status, elapsed, details, notice, storageNotice, booting, importing,
    savedMixes, activeProject, dirty, projectBusy, projectsBlocked, savedNotice,
    editorId, editorLocation, preview, openClip, closeClip, previewClip, previewSample, stopPreview, applyClip, createRhythm,
    busy: booting || importing || rhythmBusy || projectBusy || status === 'loading', updateTrack, setMaster, togglePlayback, restartPlayback,
    setBpm,
    setSequenced: (id, enabled) => editPattern(id, (sequence) => ({ ...sequence, enabled })),
    toggleStep: (id, index) => { if (Number.isInteger(index) && index >= 0 && index < 16) editPattern(id, (sequence) => ({ ...sequence, steps: sequence.steps.map((on, step) => step === index ? !on : on) })); },
    quarterSteps: (id) => editPattern(id, (sequence) => ({ ...sequence, steps: Array.from({ length: 16 }, (_, index) => index % 4 === 0) })),
    clearSteps: (id) => editPattern(id, (sequence) => ({ ...sequence, steps: Array(16).fill(false) })),
    addSound, importFiles, removeTrack, resetLevels, applyBlend,
    saveMix: (name) => projectAction('save', { id: 'mix-' + crypto.randomUUID(), name }),
    updateSavedMix: () => activeProject && projectAction('update', { id: activeProject.id }),
    openMix: (id) => projectAction('open', { id }),
    renameMix: (id, name) => projectAction('rename', { id, name }),
    deleteMix: (id) => projectAction('delete', { id }),
  };
}
