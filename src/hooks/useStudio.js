import { useEffect, useRef, useState } from 'react';
import { MAX_TRACKS, SOUNDS, createTrack } from '../data/sounds.js';
import { AudioEngine } from '../lib/audioEngine.js';
import { deleteAudio, readAudio, saveAudio } from '../lib/audioStorage.js';
import { STUDIO_STORAGE_KEY, defaultMix, loadMix, serializeMix, validateAudioFile } from '../lib/studioState.js';

function initialMix() {
  try { return loadMix(localStorage); } catch { return defaultMix(); }
}

function withSources(tracks) {
  return tracks.map((track) => ({ ...track, src: SOUNDS.find((sound) => sound.id === track.catalogId)?.src }));
}

export default function useStudio() {
  const [mix, setMix] = useState(initialMix);
  const [status, setStatus] = useState('ready');
  const [elapsed, setElapsed] = useState(0);
  const [details, setDetails] = useState({});
  const [notice, setNotice] = useState('');
  const [storageNotice, setStorageNotice] = useState('');
  const [booting, setBooting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const engine = useRef(null);
  const files = useRef({});
  const mixRef = useRef(null);
  const alive = useRef(false);
  const importLock = useRef(false);
  const statusRef = useRef('ready');

  useEffect(() => {
    alive.current = true;
    let canceled = false;
    const player = new AudioEngine({
      onState: (state) => { if (!canceled) { statusRef.current = state; setStatus(state); } },
      onTrack: (id, metadata) => { if (!canceled) setDetails((previous) => ({ ...previous, [id]: metadata })); },
    });
    engine.current = player;
    const restored = initialMix();
    void (async () => {
      const custom = restored.tracks.filter((track) => !track.catalogId);
      const results = await Promise.allSettled(custom.map((track) => readAudio(track.id)));
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
        ? 'Saved audio could not be opened. Your saved project has been preserved; try reloading with browser storage enabled.'
        : 'Some saved audio is missing. Import those recordings again.');
      setBooting(false);
    })();
    const interval = window.setInterval(() => {
      if (!canceled) setElapsed(player.position());
    }, 250);
    return () => {
      canceled = true;
      alive.current = false;
      importLock.current = false;
      window.clearInterval(interval);
      player.dispose();
    };
  }, []);

  useEffect(() => {
    mixRef.current = mix;
    engine.current?.setTracks(withSources(mix.tracks));
    engine.current?.setMaster(mix.master);
  }, [mix]);

  useEffect(() => {
    if (booting || storageBlocked) return;
    const save = async () => localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(serializeMix(mix)));
    void save().catch(() => {
      if (alive.current) setStorageNotice('Settings could not be saved. You can keep mixing in this tab.');
    });
  }, [mix, booting, storageBlocked]);

  function updateTrack(id, changes) {
    setMix((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.id === id ? { ...track, ...changes } : track) }));
  }

  function setMaster(master) { setMix((previous) => ({ ...previous, master })); }

  async function togglePlayback() {
    if (statusRef.current === 'playing' || statusRef.current === 'loading') {
      engine.current.pause();
      setElapsed(engine.current.position());
      return;
    }
    setNotice('');
    try { await engine.current.play(withSources(mixRef.current.tracks), files.current, mixRef.current.master); }
    catch (error) { if (alive.current) setNotice(error.message); }
  }

  async function restartPlayback() {
    const wasPlaying = statusRef.current === 'playing';
    engine.current.restart();
    setElapsed(0);
    if (wasPlaying) await togglePlayback();
  }

  async function addSound(sound) {
    const current = mixRef.current;
    if (current.tracks.some((track) => track.id === sound.id)) return;
    if (current.tracks.length >= MAX_TRACKS) { setNotice('A mix can contain up to 8 layers. Remove one to add another.'); return; }
    setNotice('');
    const track = createTrack(sound);
    if (statusRef.current === 'playing') {
      try { await engine.current.load({ ...track, src: sound.src }); }
      catch (error) { if (alive.current) setNotice(error.message); return; }
    }
    if (alive.current) setMix((previous) => previous.tracks.some((item) => item.id === track.id) || previous.tracks.length >= MAX_TRACKS
      ? previous : { ...previous, tracks: [...previous.tracks, track] });
  }

  async function importFiles(selected, role) {
    if (importLock.current || !selected.length) return;
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
    engine.current.forget(id);
    delete files.current[id];
    setMix((previous) => ({ ...previous, tracks: previous.tracks.filter((track) => track.id !== id) }));
    setDetails((previous) => { const next = { ...previous }; delete next[id]; return next; });
    if (id.startsWith('custom-')) {
      try { await deleteAudio(id); }
      catch { if (alive.current) setStorageNotice('The layer was removed, but its saved file could not be deleted. Browser site settings can clear local audio storage.'); }
    }
  }

  function resetLevels() {
    setMix((previous) => ({ master: 75, tracks: previous.tracks.map((track) => ({ ...track,
      volume: SOUNDS.find((sound) => sound.id === track.catalogId)?.volume ?? 50, muted: false, solo: false })) }));
  }

  function applyBlend(volumes) {
    setMix((previous) => ({ ...previous, tracks: previous.tracks.map((track) => track.catalogId
      ? { ...track, volume: volumes[track.catalogId], muted: volumes[track.catalogId] === 0, solo: false } : track) }));
  }

  return { ...mix, status, elapsed, details, notice, storageNotice, booting, importing,
    busy: booting || importing || status === 'loading', updateTrack, setMaster, togglePlayback, restartPlayback,
    addSound, importFiles, removeTrack, resetLevels, applyBlend };
}
