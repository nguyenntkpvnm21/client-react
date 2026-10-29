import { clipName, ensureClipSlot, sourceId } from '../lib/audioSources.js';
import { duplicateClip, placedClip, splitClip, trimmedClip } from '../lib/clipInstances.js';
import { initialLoopRegion, validateLoopRegion } from '../lib/loopRegion.js';
import { checkExportCanceled, exportFilename, renderArrangement } from '../lib/renderArrangement.js';
import { enableRhythmTrack, rhythmMetadata, rhythmRegion } from '../lib/rhythmState.js';
import { arrangementMetadata, arrangementWindow, validateLength, validatePlacement } from '../lib/arrangementState.js';
import { DEFAULT_BPM, sequenceMetadata, validBpm } from '../lib/sequencerState.js';
import { validateRegion } from '../lib/clipRegion.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_CLIPS, MAX_TRACKS, SOUNDS, createTrack } from '../data/sounds.js';
import { AUDIO_MEMORY_LIMIT, AudioEngine } from '../lib/audioEngine.js';
import { deleteUnusedAudio, readAudio, readSavedMix, readSavedMixes, restoreSavedMix, saveAudio, writeSavedMix } from '../lib/audioStorage.js';
import { backupFilename, createProjectBackup, inspectProjectBackup, restoredProject } from '../lib/projectBackup.js';
import { SCENES, sceneMix, scenePreviewMix } from '../lib/scenes.js';
import { STUDIO_STORAGE_KEY, defaultMix, loadMix, serializeMix, validateAudioFile, validateMix } from '../lib/studioState.js';
import { MAX_SAVED_MIXES, mixName, referencedAudio, sameMix } from '../lib/savedMixes.js';

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
  const [loopSection, setLoopSectionState] = useState(() => initialLoopRegion(arrangementMetadata(mix.arrangement).duration));
  const loopRef = useRef(loopSection);
  const [exportState, setExportState] = useState(null);
  const exportJob = useRef(null);
  const exportUrl = useRef(null);
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
  const seekIntent = useRef(null);
  const [transfer, setTransfer] = useState(null);
  const [restoreInfo, setRestoreInfo] = useState(null);
  const pendingBackup = useRef(null);
  const backupUrl = useRef(null);
  const transferJob = useRef(null);
  const [scenePreview, setScenePreview] = useState(null);
  const scenePlayer = useRef(null);

  useEffect(() => {
    alive.current = true;
    let canceled = false;
    const player = new AudioEngine({
      onError: (error) => { if (!canceled) setNotice(error.message); },
      onState: (state) => { if (!canceled) {
        if (state === 'playing' || state === 'loading') stopScene();
        statusRef.current = state; setStatus(state);
      } },
      onTrack: (id, metadata) => { if (!canceled) setDetails((previous) => ({ ...previous, [id]: metadata })); },
    });
    engine.current = player;
    const restored = initialMix();
    void (async () => {
      const custom = restored.sources.filter((track) => !track.catalogId);
      const [results, library] = await Promise.all([
        Promise.allSettled(custom.map((track) => readAudio(sourceId(track)))),
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
      setMix({ ...restored, sources: restored.sources.filter((source) => source.catalogId || found[source.id]), tracks: restored.tracks.filter((track) => track.catalogId || found[sourceId(track)]) });
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
      if (document.hidden) stopScene();
      if (document.hidden) player.stopPreview();
      if (document.hidden && player.playing && (player.isSequencing() || player.loopRegion.enabled)) {
        player.pause();
        setNotice((player.loopRegion.enabled ? 'Section playback' : 'Pattern') + ' paused while this tab was hidden. Press Play to continue.');
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
      exportJob.current?.abort();
      if (exportUrl.current) URL.revokeObjectURL(exportUrl.current);
      if (backupUrl.current) URL.revokeObjectURL(backupUrl.current);
      pendingBackup.current = null;
      transferJob.current?.controller.abort();transferJob.current?.validator?.dispose();
      scenePlayer.current?.dispose();
      scenePlayer.current = null;
      player.dispose();
    };
  }, []);

  useEffect(() => {
    mixRef.current = mix;
    engine.current?.setArrangement(mix.arrangement);
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
    try { await deleteUnusedAudio(ids, { sources: [...next.sources, ...stored.sources], tracks: [...next.tracks, ...stored.tracks] }); }
    catch { if (alive.current) setStorageNotice('Unused audio could not be cleaned up. Your remaining recordings have been kept.'); }
  }

  function updateTrack(id, changes) {
    if (projectLock.current) return;
    const current = mixRef.current.tracks.find((track) => track.id === id);
    if (current && changes.loop !== undefined && (current.clipEnd != null || arrangementMetadata(mixRef.current.arrangement).enabled) && changes.loop !== current.loop) {
      engine.current.restart();
      setElapsed(0);
    }
    setMix((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === id ? { ...track, ...changes } : track) }));
  }

  function setMaster(master) {
    scenePlayer.current?.setMaster(master);
    if (!projectLock.current) setMix((previous) => ({ ...previous, master }));
  }

  async function togglePlayback() {
    if (statusRef.current === 'playing' || statusRef.current === 'loading') {
      seekIntent.current = null;
      engine.current.pause();
      setElapsed(engine.current.position());
      return;
    }
    if (projectLock.current || importLock.current) return;
    setNotice('');
    try { await engine.current.play(withSources(mixRef.current.tracks), files.current, mixRef.current.master, mixRef.current.bpm, mixRef.current.arrangement); }
    catch (error) { if (alive.current) setNotice(error.message); }
  }

  async function restartPlayback() {
    if (projectLock.current) return;
    const wasPlaying = statusRef.current === 'playing';
    engine.current.restart();
    setElapsed(engine.current.position());
    if (wasPlaying) await togglePlayback();
  }

  async function addSound(sound) {
    if (projectLock.current) return;
    const current = mixRef.current;
    if (current.tracks.some((track) => track.id === sound.id)) return;
    if (current.sources.some((source) => source.id === sound.id)) return addSourceClip(sound.id);
    if (current.sources.length >= MAX_TRACKS || current.tracks.length >= MAX_CLIPS) { setNotice('A workspace supports 8 source recordings and 32 clips. Remove an unused source or clip first.'); return; }
    setNotice('');
    const track = createTrack(sound);
    if (statusRef.current === 'playing') {
      try { await engine.current.load({ ...track, src: sound.src }); }
      catch (error) { if (alive.current) setNotice(error.message); return; }
    }
    if (alive.current && !projectLock.current) setMix((previous) => previous.tracks.some((item) => item.id === track.id) || previous.sources.length >= MAX_TRACKS || previous.tracks.length >= MAX_CLIPS
      ? previous : { ...previous, sources: [...previous.sources, { id: sound.id, catalogId: sound.id, name: sound.name, role: sound.role }], tracks: [...previous.tracks, { ...track, sourceId: sound.id }] });
  }

  async function importFiles(selected, role) {
    if (importLock.current || projectLock.current || !selected.length) return;
    stopScene();
    importLock.current = true;
    setImporting(true);
    setNotice('');
    const player = engine.current;
    let slots = Math.min(MAX_TRACKS - mixRef.current.sources.length, MAX_CLIPS - mixRef.current.tracks.length);
    const errors = [];
    let imported = 0;
    try {
      for (const file of selected) {
        if (!slots) { errors.push('A workspace supports 8 source recordings and 32 clips. Remove an unused source or clip first.'); break; }
        const id = 'custom-' + crypto.randomUUID();
        try {
          validateAudioFile(file);
          const track = { id, catalogId: null, name: file.name, role, volume: 50, muted: false, solo: false, loop: role === 'nature' };
          await player.load(track, file);
          if (!alive.current || player.disposed) return;
          try { await saveAudio(id, file); }
          catch { if (alive.current) setStorageNotice('An imported sound could not be saved. It is available in this tab; keep the original file to import again.'); }
          if (!alive.current || player.disposed) return;
          files.current[sourceId(track)] = file;
          setMix((previous) => ({ ...previous, sources: [...previous.sources, { id, catalogId: null, name: file.name, role }], tracks: [...previous.tracks, { ...track, sourceId: id }] }));
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
      const next = { ...mixRef.current, tracks: mixRef.current.tracks.filter((track) => track.id !== id) };
      changeMix(next);
      setDetails((previous) => { const copy = { ...previous }; delete copy[id]; return copy; });
      if (!storageBlocked) persistWorkspace(next, activeProjectId);
    } finally {
      projectLock.current = false;
      if (alive.current) setProjectBusy(false);
    }
  }

  async function rescheduleMix(next, position, resume) {
    const player = engine.current;
    player.pause();player.setArrangement(next.arrangement);player.setBpm(next.bpm);
    player.setTracks(withSources(next.tracks));player.setMaster(next.master);player.seek(position);
    if (resume) await player.play(withSources(next.tracks), files.current, next.master, next.bpm, next.arrangement);
  }

  function focusClip(id) {
    requestAnimationFrame(() => {
      const row = document.querySelector('[data-clip-id="' + CSS.escape(id) + '"]');
      row?.scrollIntoView({ block: 'center' });row?.querySelector('button')?.focus({ preventScroll: true });
    });
  }

  async function addSourceClip(id) {
    if (projectLock.current || importLock.current || booting) return;
    projectLock.current = true;setProjectBusy(true);
    try {
      const current = mixRef.current;ensureClipSlot(current);
      const source = current.sources.find((item) => item.id === id);
      if (!source) return;
      const name = current.tracks.some((track) => track.name === source.name) ? clipName(source.name, current.tracks) : source.name;
      const track = { id: 'custom-clip-' + crypto.randomUUID(), sourceId: id, catalogId: source.catalogId, name, role: source.role,
        volume: 50, muted: false, solo: false, loop: source.role === 'nature',
        placement: { start: current.arrangement.enabled && elapsed < current.arrangement.duration - .05 ? elapsed : 0, end: null, fadeIn: 0, fadeOut: 0 } };
      await engine.current.load(withSources([track])[0], files.current[id]);
      if (!alive.current) return;
      changeMix({ ...current, tracks: [...current.tracks, track] });focusClip(track.id);
      setNotice('Added a new clip from ' + source.name + '. Its audio is shared; edits are independent.');
    } catch (error) { if (alive.current) setNotice(error.message); }
    finally { projectLock.current = false;if (alive.current) setProjectBusy(false); }
  }

  async function removeSource(id) {
    if (projectLock.current || importLock.current || booting) return;
    const current = mixRef.current;
    if (current.tracks.some((track) => sourceId(track) === id)) { setNotice('Remove the clips using this source first.');return; }
    projectLock.current = true;setProjectBusy(true);
    try {
      const next = { ...current, sources: current.sources.filter((source) => source.id !== id) };
      for (const [clipId, key] of engine.current.sourceKeys) if (key === id) engine.current.forget(clipId);
      delete files.current[id];changeMix(next);
      if (!storageBlocked && persistWorkspace(next, activeProjectId)) await reclaim([id], next);
    } finally { projectLock.current = false;if (alive.current) setProjectBusy(false); }
  }

  async function editClipInstance(action, id) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return false;
    projectLock.current = true;setProjectBusy(true);stopPreview();
    const player = engine.current;
    try {
      const current = mixRef.current;
      const track = withSources(current.tracks).find((item) => item.id === id);
      if (!track) return false;
      const splitAt = player.position();
      const buffer = action === 'split' ? await player.load(track, files.current[sourceId(track)]) : null;
      if (!alive.current || player.disposed) return false;
      const next = action === 'split' ? splitClip(current, id, splitAt, buffer.duration, 'custom-clip-' + crypto.randomUUID())
        : duplicateClip(current, id, 'custom-clip-' + crypto.randomUUID());
      // Resume/seek against a fresh node schedule; keep the cursor and play/pause intent.
      const position = player.position(), resume = statusRef.current === 'playing';
      changeMix(next);
      await rescheduleMix(next, position, resume);
      setElapsed(player.position());
      const newClip = next.tracks.find((item) => !current.tracks.some((old) => old.id === item.id));
      if (newClip) focusClip(newClip.id);
      setNotice(action === 'split' ? 'Clip split at the playhead. Both parts share the original recording.' : 'Clip duplicated at the same position. Move or edit the copy independently.');
      return true;
    } catch (error) { if (alive.current) setNotice(error.message);return false; }
    finally { projectLock.current = false;if (alive.current) setProjectBusy(false); }
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
        const oldIds = [...referencedAudio(mixRef.current, [])];
        resetLoop(arrangementMetadata(loaded.project.mix.arrangement).duration);
        player.restart();
        player.clearAudio();
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
          await reclaim([...referencedAudio(previous.mix, [])], mixRef.current);
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
    if (engine.current.previewPosition()?.loading) stopPreview();
    setMix((previous) => ({ ...previous, tracks: previous.tracks.map((item) => item.id === id
      ? { ...item, rhythm: { ...rhythmMetadata(item), initialized: true }, sequence: change(sequenceMetadata(item)) } : item) }));
    setNotice('');
  }

  function setBpm(value) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return;
    const bpm = validBpm(value);
    if (bpm === (mixRef.current.bpm ?? DEFAULT_BPM)) return;
    stopPreview();
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
      const buffer = await engine.current.load(track, files.current[sourceId(track)]);
      if (!alive.current) return;
      const first = !rhythmMetadata(track).initialized;
      const next = { ...mixRef.current, tracks: mixRef.current.tracks.map((item) => item.id === id ? {
        ...enableRhythmTrack(item, buffer.duration),
        solo: first && mixRef.current.tracks.some((layer) => layer.solo) ? true : item.solo,
      } : item) };
      changeMix(next);
      engine.current.setTracks(withSources(next.tracks));
      if (first && !engine.current.playing) await engine.current.play(withSources(next.tracks), files.current, next.master, next.bpm, next.arrangement);
      if (!next.master) setNotice('Your rhythm is ready. Raise Master volume to hear it.');
    } catch (error) { if (alive.current) setNotice(error.message); }
    finally { importLock.current = false; if (alive.current) setRhythmBusy(false); }
  }

  async function previewSample(id) {
    if (preview?.id === id && preview.kind !== 'pattern') { stopPreview(); return; }
    if (projectLock.current || importLock.current || booting) return;
    const track = withSources(mixRef.current.tracks).find((item) => item.id === id);
    if (!track) return;
    try {
      const buffer = await engine.current.load(track, files.current[sourceId(track)]);
      if (!alive.current || !mixRef.current.tracks.some((item) => item.id === id)) return;
      const region = rhythmRegion(track, buffer.duration);
      await previewClip(id, region.start, region.end, false);
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
    stopScene();
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
    try { await engine.current.load(track, files.current[sourceId(track)]); }
    catch (error) { if (alive.current) setNotice(error.message); }
  }

  async function previewClip(id, start, end, loop) {
    if (projectLock.current || importLock.current) return;
    const track = withSources(mixRef.current.tracks).find((item) => item.id === id);
    if (!track) return;
    try {
      await engine.current.preview(track, files.current[sourceId(track)], start, end, loop);
      if (alive.current) { setElapsed(engine.current.position()); setPreview(engine.current.previewPosition()); }
    } catch (error) { if (alive.current) setNotice(error.message); }
  }

  async function applyClip(id, start, end, loop, reset = false, location = 'mixer') {
    if (projectLock.current || importLock.current) return;
    const duration = engine.current.buffers.get(id)?.duration;
    const region = validateRegion(start, end, duration);
    if (location === 'arrangement') {
      const current = mixRef.current, position = engine.current.position(), resume = statusRef.current === 'playing';
      const next = { ...current, tracks: current.tracks.map((track) => track.id === id ? { ...track, ...(reset ? { clipStart: 0, clipEnd: null } : region), loop, sourceOffset: undefined, gainEnvelope: undefined } : track) };
      closeClip();changeMix(next);
      try { await rescheduleMix(next, position, resume); }
      catch (error) { if (alive.current) setNotice(error.message); }
      return;
    }
    engine.current.restart();
    setElapsed(0);
    setPreview(null);
    if (location === 'sequencer') {
      const track = mixRef.current.tracks.find((item) => item.id === id);
      updateTrack(id, { rhythm: { ...rhythmMetadata(track), sampleStart: reset ? 0 : region.clipStart, sampleEnd: reset ? null : region.clipEnd } });
    } else updateTrack(id, { ...(reset ? { clipStart: 0, clipEnd: null } : region), sourceOffset: undefined, gainEnvelope: undefined, loop });
    setNotice(reset ? 'Full recording restored. Press Play to listen.' : 'Clip applied. The mix starts at the beginning of each selected region.');
    setEditorId(null);
  }

  function setArrangementLength(value) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return false;
    const duration = validateLength(value, mixRef.current.tracks);
    resetLoop(duration);
    engine.current.restart();
    setElapsed(0);
    setCurrentStep(null);
    setMix((previous) => ({ ...previous, arrangement: { ...arrangementMetadata(previous.arrangement), duration } }));
    setNotice('Arrangement length updated. Press Play arrangement to listen from the beginning.');
    return true;
  }

  function setPlacement(id, value, reset = false, action) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return false;
    const placement = reset ? { start: 0, end: null, fadeIn: 0, fadeOut: 0 }
      : validatePlacement(value, arrangementMetadata(mixRef.current.arrangement).duration);
    stopPreview();
    const track = mixRef.current.tracks.find((item) => item.id === id);
    if (!track) return false;
    const duration = engine.current.buffers.get(id)?.duration;
    if (['start', 'end'].includes(action) && !isNaN(duration)) updateTrack(id, trimmedClip(track, placement, duration, action, arrangementWindow(track, { ...mixRef.current.arrangement, enabled: true })));
    else if (['start', 'end'].includes(action)) throw new Error('Load the waveform before trimming audio.');
    else updateTrack(id, placedClip(track, placement, reset));
    setNotice('Layer timing updated. Playback keeps its position.');
    return true;
  }

  async function playArrangement() {
    if (projectLock.current || importLock.current || booting) return;
    if (loopRef.current.enabled) {
      storeLoop({ ...loopRef.current, enabled: false });
      engine.current.seek(0);setElapsed(0);
      await togglePlayback();return;
    }
    const config = arrangementMetadata(mixRef.current.arrangement);
    if (config.enabled && (statusRef.current === 'playing' || statusRef.current === 'loading')) { await togglePlayback(); return; }
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return;
    if (config.enabled) { await togglePlayback(); return; }
    const duration = validateLength(config.duration, mixRef.current.tracks);
    const next = { ...mixRef.current, arrangement: { enabled: true, duration } };
    engine.current.restart();
    changeMix(next);
    setNotice('');
    try { await engine.current.play(withSources(next.tracks), files.current, next.master, next.bpm, next.arrangement); }
    catch (error) { if (alive.current) setNotice(error.message); }
  }

  async function seekArrangement(value, play = true) {
    if (projectLock.current || importLock.current || booting) return;
    const current = mixRef.current;
    try {
      const duration = validateLength(current.arrangement.duration, current.tracks);
      const next = { ...current, arrangement: { enabled: true, duration } };
      engine.current.pause();
      engine.current.setArrangement(next.arrangement);
      if (loopRef.current.enabled && (value < loopRef.current.start || value >= loopRef.current.end)) storeLoop({ ...loopRef.current, enabled: false });
      const position = engine.current.seek(value);
      changeMix(next);
      setElapsed(position);setCurrentStep(null);setPreview(null);setNotice('');
      if (play && position < duration) await engine.current.play(withSources(next.tracks), files.current, next.master, next.bpm, next.arrangement);
    } catch (error) { if (alive.current) setNotice(error.message); }
  }

  async function seekPlayback(value) {
    if (projectLock.current || importLock.current || booting || !mixRef.current.tracks.length) return false;
    const current = mixRef.current;
    const resume = statusRef.current === 'playing' || (statusRef.current === 'loading' && (seekIntent.current?.resume ?? true));
    if (!Number.isFinite(value) || value < 0) { setNotice('Choose a valid playback position in seconds.');return false; }
    if (current.arrangement.enabled && loopRef.current.enabled && (value < loopRef.current.start || value >= loopRef.current.end)) storeLoop({ ...loopRef.current, enabled: false });
    const job = { resume };seekIntent.current = job;
    setNotice('');setPreview(null);
    try {
      const pending = engine.current.seekTo(value, withSources(current.tracks), files.current, current.master, current.bpm, current.arrangement, resume);
      setElapsed(engine.current.position());
      const applied = await pending;
      if (alive.current && applied) { setElapsed(engine.current.position());setCurrentStep(engine.current.currentStep()); }
      return applied;
    } catch (error) { if (alive.current) setNotice(error.message);return false; }
    finally { if (seekIntent.current === job) seekIntent.current = null; }
  }

  function storeLoop(next) {
    engine.current.setLoopRegion(next);
    loopRef.current = next;setLoopSectionState(next);
  }

  function resetLoop(duration) { storeLoop(initialLoopRegion(duration)); }

  async function setLoopSection(value) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return false;
    const current = mixRef.current;
    const next = validateLoopRegion({ ...loopRef.current, ...value }, arrangementMetadata(current.arrangement).duration);
    const resume = next.enabled && statusRef.current === 'playing';
    storeLoop(next);setPreview(null);
    if (next.enabled) engine.current.seek(next.start);
    setElapsed(engine.current.position());
    if (resume) {
      try { await engine.current.play(withSources(current.tracks), files.current, current.master, current.bpm, current.arrangement); }
      catch (error) { if (alive.current) setNotice(error.message); }
    }
    return true;
  }

  async function playLoop() {
    if (projectLock.current || importLock.current || booting) return;
    if (loopRef.current.enabled && ['playing', 'loading'].includes(statusRef.current)) { await togglePlayback();return; }
    try {
      const current = mixRef.current;
      const next = { ...current, arrangement: { ...arrangementMetadata(current.arrangement), enabled: true } };
      const region = validateLoopRegion({ ...loopRef.current, enabled: true }, next.arrangement.duration);
      const wasLoop = loopRef.current.enabled;
      engine.current.pause();engine.current.setArrangement(next.arrangement);storeLoop(region);
      if (!wasLoop || engine.current.position() < region.start || engine.current.position() >= region.end) engine.current.seek(region.start);
      changeMix(next);setPreview(null);setNotice('');
      await engine.current.play(withSources(next.tracks), files.current, next.master, next.bpm, next.arrangement);
    } catch (error) { if (alive.current) setNotice(error.message); }
  }

  async function disableLoop() {
    if (projectLock.current || importLock.current || booting) return;
    const resume = statusRef.current === 'playing';
    storeLoop({ ...loopRef.current, enabled: false });setElapsed(engine.current.position());
    if (resume) await togglePlayback();
  }

  function cancelExport() {
    if (!exportJob.current) return;
    exportJob.current.abort();
    setExportState((previous) => ({ ...previous, stage: 'Canceling export…', canceling: true }));
  }

  async function exportArrangement(name) {
    if (projectLock.current || importLock.current || booting || !mixRef.current.tracks.length) return;
    const controller = new AbortController();exportJob.current = controller;
    projectLock.current = true;setProjectBusy(true);
    closeClip();engine.current.pause();setElapsed(engine.current.position());setNotice('');
    if (exportUrl.current) { URL.revokeObjectURL(exportUrl.current);exportUrl.current = null; }
    const filename = exportFilename(name);
    setExportState({ active: true, stage: 'Loading audio', progress: 0, filename });
    try {
      const snapshot = serializeMix(mixRef.current);
      const tracks = withSources(snapshot.tracks), buffers = new Map();
      if (!globalThis.OfflineAudioContext && !globalThis.webkitOfflineAudioContext) throw new Error('WAV export is not available in this browser. Try Chrome, Edge, Firefox or Safari.');
      for (let index = 0; index < tracks.length; index += 1) {
        checkExportCanceled(controller.signal);
        buffers.set(tracks[index].id, await engine.current.load(tracks[index], files.current[sourceId(tracks[index])]));
        if (alive.current && !controller.signal.aborted) setExportState({ active: true, stage: 'Loading audio', progress: .15 * (index + 1) / tracks.length, filename });
      }
      const blob = await renderArrangement({ mix: { ...snapshot, tracks }, buffers, signal: controller.signal,
        onProgress: (progress) => { if (alive.current && !controller.signal.aborted) setExportState({ active: true, filename, ...progress }); } });
      checkExportCanceled(controller.signal);
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);exportUrl.current = url;
      setExportState({ active: false, filename, url, stage: 'WAV ready', progress: 1 });
      const link = document.createElement('a');link.href = url;link.download = filename;document.body.append(link);link.click();link.remove();
      setNotice('WAV ready. Playback remains paused at your previous position.');
    } catch (error) {
      if (alive.current) setExportState({ active: false, filename, error: error.name === 'AbortError' ? 'Export canceled. No file was created.' : error.message || 'Export failed. Try again.' });
    } finally {
      exportJob.current = null;projectLock.current = false;
      if (alive.current) setProjectBusy(false);
    }
  }

  function clearSolos() {
    if (projectLock.current) return;
    setMix((previous) => ({ ...previous, tracks: previous.tracks.map((track) => ({ ...track, solo: false })) }));
  }

  function freeMix() {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return;
    resetLoop(arrangementMetadata(mixRef.current.arrangement).duration);
    engine.current.restart();
    setElapsed(0);
    setCurrentStep(null);
    setMix((previous) => ({ ...previous, arrangement: { ...arrangementMetadata(previous.arrangement), enabled: false } }));
    setNotice('Free mix restored. Your layer timings have been kept for the arrangement.');
  }

  async function loadTrackInfo(id) {
    const track = withSources(mixRef.current.tracks).find((item) => item.id === id);
    if (!track) return;
    try { await engine.current.load(track, files.current[sourceId(track)]); }
    catch (error) { if (alive.current) setNotice(error.message); }
  }
  const waveformFor = useCallback((id, start, end, bins = 600) => engine.current?.waveformFor(id, start, end, bins) || [], []);
  const findSound = useCallback((id, from, length) => engine.current?.findSound(id, from, length), []);
  async function previewPattern(id) {
    if (preview?.id === id && preview.kind === 'pattern') { stopPreview(); return; }
    if (projectLock.current || importLock.current || booting) return;
    const track = withSources(mixRef.current.tracks).find((item) => item.id === id);
    if (!track) return;
    try { await engine.current.previewPattern(track, files.current[sourceId(track)], mixRef.current.bpm); }
    catch (error) { engine.current.stopPreview(); if (alive.current) setNotice(error.message); }
  }
  function setTailMode(id, tailMode) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return;
    stopPreview();
    setMix((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === id ? { ...track, rhythm: { ...rhythmMetadata(track), tailMode } } : track) }));
  }

  function stopScene() {
    scenePlayer.current?.dispose();scenePlayer.current = null;
    if (alive.current) setScenePreview(null);
  }

  async function hearScene(id) {
    if (scenePreview?.id === id) { stopScene(); return; }
    if (projectLock.current || importLock.current || booting) return;
    stopScene();seekIntent.current = null;engine.current.pause();setElapsed(engine.current.position());
    const next = scenePreviewMix(id);
    let sharedBytes = 0;
    const player = new AudioEngine({ onTrack: () => {
      if (engine.current.memory + player.memory - sharedBytes > AUDIO_MEMORY_LIMIT) throw new Error('Scene preview needs more playback memory. Remove a layer before previewing. Your workspace has been kept.');
    }, onState: (state) => {
      if (!alive.current || scenePlayer.current !== player) return;
      if (state === 'finished') stopScene();
      else setScenePreview({ id, status: state });
    } });
    // Reuse already decoded library buffers instead of decoding another copy.
    for (const track of next.tracks) {
      const buffer = engine.current.buffers.get(track.id) || [...engine.current.buffers].find(([id]) => engine.current.sourceKeys.get(id) === sourceId(track))?.[1];
      if (!buffer) continue;
      const bytes = buffer.length * buffer.numberOfChannels * 4;
      player.buffers.set(track.id, buffer);player.memory += bytes;sharedBytes += bytes;
    }
    scenePlayer.current = player;
    setNotice('');setScenePreview({ id, status: 'loading' });
    try { await player.play(withSources(next.tracks), {}, mixRef.current.master, next.bpm, next.arrangement); }
    catch (error) { if (scenePlayer.current === player) { stopScene();if (alive.current) setNotice(error.message); } }
  }

  async function useScene(id) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return false;
    projectLock.current = true;setProjectBusy(true);
    try {
      const next = validateMix(sceneMix(id));
      const oldIds = [...referencedAudio(mixRef.current, [])];
      closeClip();engine.current.restart();
      engine.current.clearAudio();
      resetLoop(next.arrangement.duration);setElapsed(0);setDetails({});files.current = {};
      changeMix(next);setActiveProjectId(null);setStorageBlocked(false);
      setNotice('Started ' + SCENES.find((scene) => scene.id === id).name + '. Press Play, or open Arrangement to shape its layers.');
      if (persistWorkspace(next, null)) await reclaim(oldIds, next);
      return true;
    } catch (error) { if (alive.current) setNotice(error.message);return false; }
    finally { projectLock.current = false;if (alive.current) setProjectBusy(false); }
  }

  async function transferAction(action, input) {
    if (projectLock.current || importLock.current || booting || statusRef.current === 'loading') return false;
    projectLock.current = true;setProjectBusy(true);
    stopScene();
    const controller = new AbortController();transferJob.current = { controller, committing: false };
    const progress = (value) => { if (alive.current) setTransfer({ active: true, ...value }); };
    progress({ stage: action === 'backup' ? 'Preparing project' : 'Checking project', progress: 0 });
    let validator;
    try {
      if (action === 'backup') {
        const current = mixRef.current;
        const name = activeProject?.name || 'Untitled mix';
        const blob = await createProjectBackup({ mix: current, name, signal: controller.signal, onProgress: progress, resolveAudio: async (track) => {
          if (!track.catalogId) return files.current[sourceId(track)] || await readAudio(sourceId(track));
          const response = await fetch(SOUNDS.find((sound) => sound.id === track.catalogId).src, { signal: controller.signal });
          if (!response.ok) throw new Error('Could not back up ' + track.name + '. Check your connection and try again.');
          return response.blob();
        } });
        if (!alive.current) return false;
        if (backupUrl.current) URL.revokeObjectURL(backupUrl.current);
        const url = URL.createObjectURL(blob);backupUrl.current = url;
        const filename = backupFilename(name);
        setTransfer({ active: false, stage: 'Project ready', url, filename, progress: 1 });
        const link = document.createElement('a');link.href = url;link.download = filename;document.body.append(link);link.click();link.remove();
      } else if (action === 'inspect') {
        pendingBackup.current = null;setRestoreInfo(null);
        const backup = await inspectProjectBackup(input, progress, controller.signal);
        if (!alive.current) return false;
        pendingBackup.current = backup;
        setRestoreInfo({ name: backup.name, tracks: backup.mix.tracks.length, sources: backup.mix.sources.length, bytes: backup.bytes });
        setTransfer({ active: false, stage: 'Ready to restore', progress: 1 });
      } else if (action === 'restore') {
        if (!pendingBackup.current || projectsBlocked) throw new Error('Choose a project file with browser storage enabled first.');
        const name = mixName(input);
        if (savedMixes.length >= MAX_SAVED_MIXES) throw new Error('Your saved collection is full. Delete a saved entry before restoring.');
        if (savedMixes.some((project) => project.name.toLowerCase() === name.toLowerCase())) throw new Error('A mix with this name already exists. Choose another name.');
        const restored = restoredProject(pendingBackup.current, input);
        // Decode one layer at a time, then discard its PCM. Bad audio never reaches storage.
        validator = new AudioEngine();
        transferJob.current.validator = validator;
        let index = 0, decodedBytes = 0;
        const activeSources = new Set(restored.mix.tracks.map(sourceId));
        for (const track of restored.mix.sources) {
          progress({ stage: 'Verifying ' + track.name, progress: index++ / Math.max(1, restored.mix.sources.length) });
          const buffer = await validator.load(track, restored.files.get(sourceId(track)));
          if (activeSources.has(track.id)) decodedBytes += buffer.length * buffer.numberOfChannels * 4;validator.forget(track.id);
          if (decodedBytes > AUDIO_MEMORY_LIMIT) throw new Error('This project would exceed 1 GiB of decoded audio. Your saved mixes have been kept.');
          if (!alive.current) return false;
          if (controller.signal.aborted) throw new DOMException('Project transfer canceled.', 'AbortError');
        }
        if (controller.signal.aborted) throw new DOMException('Project transfer canceled.', 'AbortError');
        transferJob.current.committing = true;
        if (alive.current) setTransfer({ active: true, stage: 'Saving restored project', progress: 1, committing: true });
        const projects = await restoreSavedMix(restored);
        if (!alive.current) return false;
        setSavedMixes(projects);pendingBackup.current = null;setRestoreInfo(null);
        setTransfer({ active: false, stage: 'Restored “' + restored.name + '”. Open it from Saved mixes when you are ready.', progress: 1 });
      }
      return true;
    } catch (error) {
      if (alive.current) setTransfer(controller.signal.aborted ? { active: false, stage: 'Transfer canceled. Your current workspace and saved mixes have been kept.' }
        : { active: false, error: error.message || 'This project could not be transferred. Try again.' });
      return false;
    } finally {
      validator?.dispose();transferJob.current = null;projectLock.current = false;
      if (alive.current) setProjectBusy(false);
    }
  }

  function discardProjectFile() {
    if (projectLock.current) return;
    pendingBackup.current = null;setRestoreInfo(null);setTransfer(null);
  }

  function cancelTransfer() {
    const job = transferJob.current;
    if (!job || job.committing) return;
    job.controller.abort();job.validator?.dispose();
    setTransfer((previous) => ({ ...previous, canceling: true, stage: 'Canceling project transfer' }));
  }

  const activeProject = savedMixes.find((project) => project.id === activeProjectId);
  const dirty = activeProject ? !sameMix(mix, activeProject.mix) : mix.tracks.length > 0;
  return { ...mix, seekPlayback, loopSection, setLoopSection, playLoop, disableLoop, exportState, exportArrangement, cancelExport, loadTrackInfo, waveformFor, findSound, previewPattern, setTailMode, arrangement: arrangementMetadata(mix.arrangement), setArrangementLength, setPlacement, playArrangement, seekArrangement, clearSolos, freeMix, bpm: mix.bpm ?? DEFAULT_BPM, currentStep, tempo, status, elapsed, details, notice, storageNotice, booting, importing,
    savedMixes, activeProject, dirty, projectBusy, projectsBlocked, savedNotice,
    transfer, restoreInfo, discardProjectFile, cancelTransfer, downloadProject: () => transferAction('backup'),
    inspectProjectFile: (file) => transferAction('inspect', file), restoreProject: (name) => transferAction('restore', name),
    scenePreview, hearScene, stopScene, useScene,
    editorId, editorLocation, preview, openClip, closeClip, previewClip, previewSample, stopPreview, applyClip, createRhythm,
    busy: booting || importing || rhythmBusy || projectBusy || status === 'loading', updateTrack, setMaster, togglePlayback, restartPlayback,
    setBpm,
    setSequenced: (id, enabled) => editPattern(id, (sequence) => ({ ...sequence, enabled })),
    toggleStep: (id, index) => { if (Number.isInteger(index) && index >= 0 && index < 16) editPattern(id, (sequence) => ({ ...sequence, steps: sequence.steps.map((on, step) => step === index ? !on : on) })); },
    quarterSteps: (id) => editPattern(id, (sequence) => ({ ...sequence, steps: Array.from({ length: 16 }, (_, index) => index % 4 === 0) })),
    clearSteps: (id) => editPattern(id, (sequence) => ({ ...sequence, steps: Array(16).fill(false) })),
    addSound, importFiles, removeTrack, addSourceClip, removeSource, duplicateClip: (id) => editClipInstance('duplicate', id), splitClip: (id) => editClipInstance('split', id), resetLevels, applyBlend,
    saveMix: (name) => projectAction('save', { id: 'mix-' + crypto.randomUUID(), name }),
    updateSavedMix: () => activeProject && projectAction('update', { id: activeProject.id }),
    openMix: (id) => projectAction('open', { id }),
    renameMix: (id, name) => projectAction('rename', { id, name }),
    deleteMix: (id) => projectAction('delete', { id }),
  };
}
