import { blockMetadata, blockWindow, MAX_PATTERNS, patternName } from './patternSections.js';
import { sourceId, sourceRecords } from './audioSources.js';
import { rhythmMetadata } from './rhythmState.js';
import { arrangementMetadata, placementMetadata } from './arrangementState.js';
import { DEFAULT_BPM, sequenceMetadata, validBpm } from './sequencerState.js';
import { clipMetadata } from './clipRegion.js';
import { MAX_FILE_BYTES, MAX_CLIPS, ROLES, SOUNDS, createTrack } from '../data/sounds.js';

export const STUDIO_STORAGE_KEY = 'naturemix-studio-v1';
const LEGACY_STORAGE_KEY = 'nature-mixer-settings-v1';
const validRole = (role) => ROLES.some((item) => item.id === role);
const level = (value, fallback) => Number.isInteger(value) && value >= 0 && value <= 100 ? value : fallback;

export function clipExtras(track) {
  const envelope = track?.gainEnvelope;
  const valid = envelope && [envelope.start, envelope.end, envelope.fadeIn, envelope.fadeOut].every(Number.isFinite)
    && envelope.start >= -300 && envelope.end <= 600 && envelope.end > envelope.start
    && envelope.fadeIn >= 0 && envelope.fadeOut >= 0 && envelope.fadeIn + envelope.fadeOut <= envelope.end - envelope.start + 1e-7;
  const block = blockMetadata(track?.patternBlock);
  return { ...(typeof track?.laneId === 'string' && track.laneId.length > 0 && track.laneId.length <= 100 ? { laneId: track.laneId } : {}),
    ...(typeof track?.laneName === 'string' && track.laneName.trim() && track.laneName.length <= 160 ? { laneName: track.laneName } : {}),
    ...(block ? { patternBlock: block } : {}), ...(Number.isFinite(track?.sourceOffset) && track.sourceOffset > 0 && track.sourceOffset <= 900 ? { sourceOffset: track.sourceOffset } : {}),
    ...(valid ? { gainEnvelope: { start: envelope.start, end: envelope.end, fadeIn: envelope.fadeIn, fadeOut: envelope.fadeOut } } : {}) };
}

function patternsMetadata(items, sources, occupiedIds = new Set()) {
  if (!Array.isArray(items)) return [];
  const ids = new Set(), slots = new Set(), rowIds = new Set(occupiedIds), patterns = [];
  for (const item of items) {
    try {
      if (!item || typeof item.id !== 'string' || !item.id.startsWith('pattern-') || item.id.length > 100 || ids.has(item.id)
        || !['A', 'B'].includes(item.slot) || slots.has(item.slot) || !Array.isArray(item.rows) || !item.rows.length || item.rows.length > MAX_CLIPS
        || item.rows.some(row => rowIds.has(row?.id))) continue;
      const normalized = validateMix({ version: 1, sources, tracks: item.rows });
      if (normalized.tracks.length !== item.rows.length || normalized.tracks.some(row => row.patternBlock || !sequenceMetadata(row).enabled)) continue;
      const rows = serializeMix(normalized).tracks.map((row, index) => ({ ...row,
        ...(typeof item.rows[index].originId === 'string' && item.rows[index].originId.length <= 100 ? { originId: item.rows[index].originId } : {}) }));
      patterns.push({ id: item.id, slot: item.slot, name: patternName(item.name), rows });ids.add(item.id);slots.add(item.slot);
      for (const row of rows) rowIds.add(row.id);
      if (patterns.length === MAX_PATTERNS) break;
    } catch { /* Preserve stored records via the enclosing project/backup validation. */ }
  }
  return patterns.sort((a, b) => a.slot.localeCompare(b.slot));
}

export function defaultMix() {
  return { sources: sourceRecords({ tracks: SOUNDS.map(createTrack) }), tracks: SOUNDS.map((sound) => ({ ...createTrack(sound), sourceId: sound.id })), master: 75, bpm: DEFAULT_BPM, arrangement: arrangementMetadata() };
}

export function validateMix(data) {
  if (data?.version !== 1 || !Array.isArray(data.tracks) || (data.sources !== undefined && !Array.isArray(data.sources)) || (data.patterns !== undefined && !Array.isArray(data.patterns))) return null;
  const sources = sourceRecords(data);
  const ids = new Set();
  const tracks = [];
  for (const item of data.tracks) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)) continue;
    const source = sources.find((entry) => entry.id === sourceId(item));
    if (!source) continue;
    const sound = SOUNDS.find((entry) => entry.id === source.catalogId);
    if (item.id !== source.id && !item.id.startsWith('custom-')) continue;
    if ((!sound || item.id !== source.id) && (typeof item.name !== 'string' || !item.name.trim())) continue;
    const extras = clipExtras(item);
    if (item.patternBlock && !extras.patternBlock) continue;
    let placement = placementMetadata(item.placement);
    if (extras.patternBlock) {
      try { placement = blockWindow(extras.patternBlock, data.bpm);if (placement.end > arrangementMetadata(data.arrangement).duration + 1e-7) continue; } catch { continue; }
    }
    ids.add(item.id);
    tracks.push({ ...extras, ...clipMetadata(item), rhythm: rhythmMetadata(item), sequence: sequenceMetadata(item), placement, id: item.id, sourceId: source.id, catalogId: source.catalogId,
      name: item.id === source.id && sound && !extras.laneId ? sound.name : (typeof item.name === 'string' && item.name.trim() ? item.name : source.name).slice(0, 160),
      role: extras.laneId && validRole(item.role) ? item.role : sound?.role || (validRole(item.role) ? item.role : 'nature'),
      volume: level(item.volume, sound?.volume ?? 50),
      muted: typeof item.muted === 'boolean' ? item.muted : false,
      solo: typeof item.solo === 'boolean' ? item.solo : false,
      loop: typeof item.loop === 'boolean' ? item.loop : (sound?.loop ?? item.role === 'nature'),
    });
    if (tracks.length === MAX_CLIPS) break;
  }
  const groups = new Map(), invalid = new Set();
  for (const track of tracks.filter(track => track.patternBlock)) {
    const block = track.patternBlock, key = JSON.stringify(block);
    if ((groups.has(block.id) && groups.get(block.id) !== key) || !sequenceMetadata(track).enabled) invalid.add(block.id);
    groups.set(block.id, key);
  }
  const patterns = patternsMetadata(data.patterns, sources, ids);
  return { ...(patterns.length ? { patterns } : {}), sources, tracks: tracks.filter(track => !invalid.has(track.patternBlock?.id)), master: level(data.master, 75), bpm: validBpm(data.bpm), arrangement: { ...arrangementMetadata(data.arrangement), ...(tracks.some(track => track.patternBlock && !invalid.has(track.patternBlock.id)) ? { enabled: true } : {}) } };
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
  const sources = sourceRecords(mix), patterns = patternsMetadata(mix.patterns, sources, new Set(mix.tracks.map(track => track.id)));
  return { version: 1, ...(patterns.length ? { patterns } : {}), sources, master: mix.master, bpm: validBpm(mix.bpm), arrangement: arrangementMetadata(mix.arrangement), tracks: mix.tracks.map(({ id, sourceId: source, catalogId, name, role, volume, muted, solo, loop, clipStart, clipEnd, sequence, placement, rhythm, sourceOffset, gainEnvelope, patternBlock, laneId, laneName }) =>
    ({ id, sourceId: source || id, catalogId, name, role, volume, muted, solo, loop, ...clipExtras({ sourceOffset, gainEnvelope, patternBlock, laneId, laneName }), ...clipMetadata({ clipStart, clipEnd }), rhythm: rhythmMetadata({ rhythm, sequence, clipStart, clipEnd }), sequence: sequenceMetadata({ sequence }), placement: patternBlock ? blockWindow(blockMetadata(patternBlock), mix.bpm) : placementMetadata(placement) })) };
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
  return track.muted || track.patternBlock?.muted || (soloActive && !track.solo) ? 0 : track.volume / 100 * (track.patternBlock ? track.patternBlock.volume / 100 : 1);
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return Math.floor(total / 60).toString().padStart(2, '0') + ':' + (total % 60).toString().padStart(2, '0');
}
