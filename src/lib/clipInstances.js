import { arrangementWindow, fitFades, placementMetadata } from './arrangementState.js';
import { clipRegion } from './clipRegion.js';
import { clipName, ensureClipSlot, sourceId } from './audioSources.js';
import { isSequenced } from './sequencerState.js';

export function duplicateClip(mix, id, newId) {
  ensureClipSlot(mix);
  const track = mix.tracks.find((item) => item.id === id);
  if (!track) throw new Error('Choose a clip first.');
  return { ...mix, tracks: [...mix.tracks, { ...structuredClone(track), id: newId, sourceId: sourceId(track), name: clipName(track.name, mix.tracks) }] };
}

export function splitClip(mix, id, at, sourceDuration, newId) {
  ensureClipSlot(mix);
  const track = mix.tracks.find((item) => item.id === id);
  if (!track) throw new Error('Choose a clip first.');
  if (isSequenced(track)) throw new Error('Switch this clip to normal playback before splitting audio.');
  const window = arrangementWindow(track, { ...mix.arrangement, enabled: true });
  const region = clipRegion(track, sourceDuration);
  const offset = track.sourceOffset || 0;
  const end = track.loop ? window.end : Math.min(window.end, window.start + region.length - offset);
  if (!Number.isFinite(at) || at < window.start + .05 - 1e-8 || at > end - .05 + 1e-8) throw new Error('Place the playhead inside the audible clip, at least 0.05 seconds from each edge.');
  const delta = at - window.start;
  const envelope = track.gainEnvelope || fitFades(window, end);
  const left = { ...track, gainEnvelope: { ...envelope }, placement: fitFades({ ...window, end: at, fadeOut: Math.max(0, at - (window.end - window.fadeOut)) }) };
  const right = { ...structuredClone(track), id: newId, sourceId: sourceId(track), name: clipName(track.name, mix.tracks),
    gainEnvelope: { ...envelope }, placement: fitFades({ ...window, start: at, fadeIn: Math.max(0, window.start + window.fadeIn - at) }) };
  if (track.loop) right.sourceOffset = (offset + delta) % region.length;
  else {
    left.clipEnd = region.start + offset + delta;left.clipStart = region.start + offset;delete left.sourceOffset;
    right.clipStart = region.start + offset + delta;right.clipEnd = region.end;delete right.sourceOffset;
  }
  const index = mix.tracks.indexOf(track);
  return { ...mix, arrangement: { ...mix.arrangement, enabled: true }, tracks: [...mix.tracks.slice(0, index), left, right, ...mix.tracks.slice(index + 1)] };
}

export function placedClip(track, placement, reset = false) {
  if (!track.gainEnvelope || reset) return { ...track, placement, gainEnvelope: undefined };
  const previous = placementMetadata(track.placement);
  const movedOnly = Math.abs((placement.end - placement.start) - ((previous.end ?? placement.end) - previous.start)) < 1e-7
    && placement.fadeIn === previous.fadeIn && placement.fadeOut === previous.fadeOut;
  if (!movedOnly) return { ...track, placement, gainEnvelope: undefined };
  const delta = placement.start - previous.start;
  return { ...track, placement, gainEnvelope: { ...track.gainEnvelope, start: track.gainEnvelope.start + delta, end: track.gainEnvelope.end + delta } };
}

export function trimmedClip(track, placement, sourceDuration, action, previousWindow) {
  const previous = placementMetadata(track.placement);
  const region = clipRegion(track, sourceDuration);
  const delta = placement.start - previous.start;
  if (isSequenced(track)) return placedClip(track, placement);
  if (track.loop) return { ...track, placement, sourceOffset: (((track.sourceOffset || 0) + delta) % region.length + region.length) % region.length };
  const start = region.start + (track.sourceOffset || 0) + (action === 'start' ? delta : 0);
  const previousEnd = previousWindow?.end ?? previous.end ?? previous.start + region.length;
  const padded = previousEnd - previous.start > region.length - (track.sourceOffset || 0) + 1e-7;
  const end = action === 'end' ? Math.min(padded ? region.end : sourceDuration, start + placement.end - placement.start) : region.end;
  if (start < 0 || end - start < .05 - 1e-8) throw new Error('This trim goes beyond the source audio. Move the clip or choose a new range with Edit audio.');
  return { ...track, placement, clipStart: start, clipEnd: end, sourceOffset: undefined };
}
