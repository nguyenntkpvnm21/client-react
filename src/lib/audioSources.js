import { MAX_CLIPS, MAX_TRACKS, SOUNDS } from '../data/sounds.js';

export const sourceId = (track) => track?.sourceId || track?.id;
export const sourceTracks = (mix) => (Array.isArray(mix.sources) ? mix.sources : undefined) || [...new Map((mix.tracks || []).filter(Boolean).map((track) => [sourceId(track), { id: sourceId(track), catalogId: track.catalogId || null, name: track.name, role: track.role }])).values()];
export function sourceRecords(mix) {
  const ids = new Set();
  return sourceTracks(mix).flatMap((item) => {
    const sound = SOUNDS.find((entry) => entry.id === item?.catalogId);
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || item.id.length > 100
      || (sound ? item.id !== sound.id : !item.id.startsWith('custom-')) || (!sound && (typeof item.name !== 'string' || !item.name.trim())) || ids.size >= MAX_TRACKS) return [];
    ids.add(item.id);
    return [{ id: item.id, catalogId: sound?.id || null, name: sound?.name || item.name.slice(0, 160), role: sound?.role || (['nature', 'music', 'vocal'].includes(item.role) ? item.role : 'nature') }];
  });
}
export function ensureClipSlot(mix) {
  if (mix.tracks.length >= MAX_CLIPS) throw new Error('A workspace can contain up to ' + MAX_CLIPS + ' clips. Remove a clip first.');
}
export function clipName(name, tracks) {
  const base = name.replace(/ \(\d+\)$/, '').slice(0, 145);
  let number = 2;
  while (tracks.some((track) => track.name === base + ' (' + number + ')')) number += 1;
  return base + ' (' + number + ')';
}
