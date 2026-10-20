import { DEFAULT_BPM, sequenceMetadata, validBpm } from './sequencerState.js';
import { clipMetadata } from './clipRegion.js';
import { MAX_FILE_BYTES, MAX_TRACKS, ROLES, SOUNDS, createTrack } from '../data/sounds.js';

export const STUDIO_STORAGE_KEY = 'naturemix-studio-v1';
const LEGACY_STORAGE_KEY = 'nature-mixer-settings-v1';
const validRole = (role) => ROLES.some((item) => item.id === role);
const level = (value, fallback) => Number.isInteger(value) && value >= 0 && value <= 100 ? value : fallback;

export function defaultMix() {
  return { tracks: SOUNDS.map(createTrack), master: 75, bpm: DEFAULT_BPM };
}

export function validateMix(data) {
  if (data?.version !== 1 || !Array.isArray(data.tracks)) return null;
  const ids = new Set();
  const tracks = [];
  for (const item of data.tracks) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)) continue;
    const sound = SOUNDS.find((entry) => entry.id === item.catalogId);
    if (!sound && (!item.id.startsWith('custom-') || typeof item.name !== 'string' || !item.name.trim())) continue;
    if (sound && item.id !== sound.id) continue;
    ids.add(item.id);
    tracks.push({ ...clipMetadata(item), sequence: sequenceMetadata(item), id: item.id, catalogId: sound?.id || null,
      name: sound?.name || item.name.slice(0, 160),
      role: sound?.role || (validRole(item.role) ? item.role : 'nature'),
      volume: level(item.volume, sound?.volume ?? 50),
      muted: typeof item.muted === 'boolean' ? item.muted : false,
      solo: typeof item.solo === 'boolean' ? item.solo : false,
      loop: typeof item.loop === 'boolean' ? item.loop : (sound?.loop ?? item.role === 'nature'),
    });
    if (tracks.length === MAX_TRACKS) break;
  }
  return { tracks, master: level(data.master, 75), bpm: validBpm(data.bpm) };
}

export function loadMix(storage) {
  const fallback = defaultMix();
  try {
    const current = storage.getItem(STUDIO_STORAGE_KEY);
    if (current) return validateMix(JSON.parse(current)) || fallback;
    const legacy = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY));
    if (Array.isArray(legacy)) {
      fallback.tracks = fallback.tracks.map((track) => {
        const saved = legacy.find((item) => item?.id === track.id);
        return { ...track, volume: level(saved?.volume, track.volume), muted: typeof saved?.muted === 'boolean' ? saved.muted : false };
      });
    }
  } catch { /* Browser storage can be unavailable or contain invalid data. */ }
  return fallback;
}

export function serializeMix(mix) {
  return { version: 1, master: mix.master, bpm: validBpm(mix.bpm), tracks: mix.tracks.map(({ id, catalogId, name, role, volume, muted, solo, loop, clipStart, clipEnd, sequence }) =>
    ({ id, catalogId, name, role, volume, muted, solo, loop, ...clipMetadata({ clipStart, clipEnd }), sequence: sequenceMetadata({ sequence }) })) };
}

export function validateAudioFile(file) {
  if (!file || file.size <= 0) throw new Error('This file is empty. Choose an audio recording.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Each audio file must be 30 MB or smaller.');
  if (!file.type?.startsWith('audio/') && !/\.(mp3|wav|ogg|oga|flac|m4a|aac|webm)$/i.test(file.name || '')) {
    throw new Error('Choose an audio file such as MP3, WAV or OGG.');
  }
}

export function audibleGain(track, tracks) {
  const soloActive = tracks.some((item) => item.solo);
  return track.muted || (soloActive && !track.solo) ? 0 : track.volume / 100;
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return Math.floor(total / 60).toString().padStart(2, '0') + ':' + (total % 60).toString().padStart(2, '0');
}
