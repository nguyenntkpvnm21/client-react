import { MAX_CLIPS } from '../data/sounds.js';
import { sourceId } from './audioSources.js';
import { sequenceMetadata, validBpm } from './sequencerState.js';

export const MAX_PATTERNS = 2;
export const barSeconds = (bpm) => 240 / validBpm(bpm);
export function patternName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 48) throw new Error('Give the pattern a name of 1–48 characters.');
  return name;
}
export function blockMetadata(value) {
  if (!value || typeof value.id !== 'string' || !value.id.startsWith('block-') || value.id.length > 100
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 60
    || !Number.isInteger(value.startBar) || value.startBar < 0 || value.startBar > 299
    || !Number.isInteger(value.bars) || value.bars < 1 || value.bars > 300) return null;
  return { id: value.id, name: value.name, startBar: value.startBar, bars: value.bars,
    volume: Number.isInteger(value.volume) && value.volume >= 0 && value.volume <= 100 ? value.volume : 100, muted: value.muted === true };
}
export function blockWindow(block, bpm) {
  const step = barSeconds(bpm), start = block.startBar * step, end = (block.startBar + block.bars) * step;
  if (end > 300 + 1e-7) throw new Error('This rhythm section goes beyond 5:00. Use fewer bars or an earlier start.');
  return { start, end, fadeIn: 0, fadeOut: 0 };
}
export function patternGroups(tracks, bpm) {
  const groups = new Map();
  for (const track of tracks) if (track.patternBlock) {
    const block = track.patternBlock;
    if (!groups.has(block.id)) groups.set(block.id, { ...block, placement: blockWindow(block, bpm), rows: [] });
    groups.get(block.id).rows.push(track);
  }
  return [...groups.values()].sort((a, b) => a.startBar - b.startBar);
}
export function selectedPart(mix, id) {
  return mix.tracks.find(track => track.id === id) || mix.patterns?.flatMap(pattern => pattern.rows).find(row => row.id === id)
    || mix.tracks.find(track => track.patternBlock?.id === id)?.patternBlock;
}
export function visibleParts(mix) {
  return [...mix.tracks.filter(track => !track.patternBlock), ...patternGroups(mix.tracks, mix.bpm).map(block => ({ ...block, role: block.rows.some(row => row.role === 'nature') ? 'nature' : 'music' }))];
}
export function capturePattern(mix, uuid = () => crypto.randomUUID()) {
  if (mix.patterns?.length) throw new Error('Choose a pattern, or make variation B.');
  const tracks = mix.tracks.filter(track => !track.patternBlock && sequenceMetadata(track).enabled);
  if (!tracks.length) throw new Error('Create a rhythm or choose a short nature sample first.');
  const rows = tracks.map(track => ({ ...structuredClone(track), id: 'custom-pattern-row-' + uuid(), originId: track.id,
    placement: { start: 0, end: null, fadeIn: 0, fadeOut: 0 }, patternBlock: undefined, gainEnvelope: undefined, sourceOffset: undefined,
    sequence: { ...sequenceMetadata(track), enabled: true }, solo: false }));
  return { ...mix, patterns: [{ id: 'pattern-' + uuid(), slot: 'A', name: rows.some(row => row.role === 'nature') ? 'Nature pulse' : 'Main beat', rows }] };
}
export function copyPattern(mix, id, uuid = () => crypto.randomUUID()) {
  if ((mix.patterns?.length || 0) >= MAX_PATTERNS) throw new Error('Patterns A and B are ready. Edit either to make a variation.');
  const pattern = mix.patterns?.find(item => item.id === id);
  if (!pattern) throw new Error('Choose a pattern first.');
  const slot = mix.patterns.some(item => item.slot === 'A') ? 'B' : 'A';
  const copy = { ...structuredClone(pattern), id: 'pattern-' + uuid(), slot, name: 'Variation', rows: pattern.rows.map(row => ({ ...structuredClone(row), id: 'custom-pattern-row-' + uuid() })) };
  return { ...mix, patterns: [...mix.patterns, copy] };
}
export function placePattern(mix, patternId, startBar, bars, uuid = () => crypto.randomUUID()) {
  const pattern = mix.patterns?.find(item => item.id === patternId);
  if (!pattern) throw new Error('Choose a pattern first.');
  const block = blockMetadata({ id: 'block-' + uuid(), name: pattern.slot + ' · ' + pattern.name, startBar, bars, volume: 100, muted: false });
  if (!block) throw new Error('Start at a whole bar and repeat for at least one bar.');
  const placement = blockWindow(block, mix.bpm);
  // First placement moves the original unplaced rhythm rows into the section; later placements copy it.
  const origins = new Set(pattern.rows.map(row => row.originId));
  const kept = mix.tracks.filter(track => track.patternBlock || !origins.has(track.id) || !sequenceMetadata(track).enabled);
  if (kept.length + pattern.rows.length > MAX_CLIPS) throw new Error('Not enough clip slots for another section. Extend or reuse an existing section.');
  const solo = kept.some(track => track.solo);
  const added = pattern.rows.map(row => {
    const track = { ...structuredClone(row), id: 'custom-clip-' + uuid(), patternBlock: { ...block }, placement: { ...placement }, solo };
    delete track.originId;return track;
  });
  return { ...mix, arrangement: { enabled: true, duration: Math.max(mix.arrangement.duration, placement.end) }, tracks: [...kept, ...added] };
}
export function editBlock(mix, id, changes) {
  const original = mix.tracks.find(track => track.patternBlock?.id === id)?.patternBlock;
  const block = original && blockMetadata({ ...original, ...changes });
  if (!block) throw new Error('Choose a rhythm section and valid bar positions.');
  const placement = blockWindow(block, mix.bpm);
  return { ...mix, arrangement: { ...mix.arrangement, duration: Math.max(mix.arrangement.duration, placement.end) },
    tracks: mix.tracks.map(track => track.patternBlock?.id === id ? { ...track, patternBlock: { ...block }, placement: { ...placement } } : track) };
}
export function copyBlock(mix, id, uuid = () => crypto.randomUUID()) {
  const rows = mix.tracks.filter(track => track.patternBlock?.id === id);
  if (!rows.length) throw new Error('Choose a rhythm section first.');
  if (mix.tracks.length + rows.length > MAX_CLIPS) throw new Error('Not enough clip slots. Extend an existing section instead.');
  const original = rows[0].patternBlock, block = { ...original, id: 'block-' + uuid(), name: original.name.slice(0, 51) + ' · copy' };
  return { ...mix, tracks: [...mix.tracks, ...rows.map(row => ({ ...structuredClone(row), id: 'custom-clip-' + uuid(), patternBlock: { ...block } }))] };
}
export function retimeBlocks(mix, bpm) {
  const tracks = mix.tracks.map(track => track.patternBlock ? { ...track, placement: blockWindow(track.patternBlock, bpm) } : track);
  const end = Math.max(mix.arrangement.duration, ...tracks.filter(track => track.patternBlock).map(track => track.placement.end));
  return { ...mix, bpm, tracks, arrangement: { ...mix.arrangement, duration: end } };
}
export function patternSourceCount(mix, id) { return (mix.patterns || []).filter(pattern => pattern.rows.some(row => sourceId(row) === id)).length; }
