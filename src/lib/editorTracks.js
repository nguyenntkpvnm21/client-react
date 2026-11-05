import { arrangementWindow, fitFades, MAX_LENGTH, validateLength, validatePlacement } from './arrangementState.js';
import { clipRegion } from './clipRegion.js';
import { duplicateClip, placedClip, trimmedClip } from './clipInstances.js';
import { sequenceMetadata } from './sequencerState.js';

export const editorLaneId = clip => clip.laneId || clip.id;
export const emptyEditorMix = () => ({ sources: [], tracks: [], master: 75, bpm: 100, arrangement: { enabled: true, duration: 120 } });

// The visible region ends with its audible content. Keep this derived: legacy
// placement windows can include silence and must not be rewritten just to draw
// the editor. Match the fitted fades used by normal playback and WAV export.
export function editorClipWindow(clip, arrangement, sourceDuration) {
  const window = arrangementWindow(clip, { ...arrangement, enabled: true });
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0 || clip.loop || sequenceMetadata(clip).enabled) return window;
  const audible = Math.max(.05, clipRegion(clip, sourceDuration).length - (clip.sourceOffset || 0));
  return fitFades(window, Math.min(window.end, window.start + audible));
}

export function editorLanes(mix) {
  const lanes = new Map();
  for (const clip of mix.tracks.filter(clip => !clip.patternBlock)) {
    const id = editorLaneId(clip);
    if (!lanes.has(id)) lanes.set(id, { id, name: clip.laneName || clip.name, role: clip.role, volume: clip.volume, muted: clip.muted, solo: clip.solo, clips: [] });
    lanes.get(id).clips.push(clip);
  }
  return [...lanes.values()];
}

export function editEditorLane(mix, id, value) {
  const clips = mix.tracks.filter(clip => !clip.patternBlock && editorLaneId(clip) === id);
  if (!clips.length) throw new Error('Choose an audio track first.');
  const changes = {};
  if (value.volume !== undefined) {
    if (!Number.isInteger(value.volume) || value.volume < 0 || value.volume > 100) throw new Error('Track volume must be between 0 and 100.');
    changes.volume = value.volume;
  }
  for (const key of ['muted', 'solo']) if (value[key] !== undefined) {
    if (typeof value[key] !== 'boolean') throw new Error('Choose a valid track setting.');
    changes[key] = value[key];
  }
  if (value.name !== undefined) {
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 160) throw new Error('Enter a track name of 1–160 characters.');
    changes.laneName = value.name.trim();changes.laneId = id;
  }
  const ids = new Set(clips.map(clip => clip.id));
  return { ...mix, tracks: mix.tracks.map(clip => ids.has(clip.id) ? { ...clip, ...changes } : clip) };
}

export function duplicateEditorClipAt(mix, id, at, sourceDuration, newId) {
  const original = mix.tracks.find(clip => clip.id === id && !clip.patternBlock);
  if (!original) throw new Error('Choose an audio clip first.');
  if (!Number.isFinite(at) || at < 0) throw new Error('Choose a valid destination in the song.');
  const window = arrangementWindow(original, { ...mix.arrangement, enabled: true });
  const region = clipRegion(original, sourceDuration);
  const length = original.loop || original.sequence?.enabled ? window.end - window.start : Math.min(window.end - window.start, region.length - (original.sourceOffset || 0));
  const end = at + Math.max(.05, length);
  if (end > MAX_LENGTH + 1e-7) throw new Error('This copy would extend beyond 5:00. Choose an earlier position.');
  const copy = duplicateClip(mix, id, newId);
  const track = copy.tracks.at(-1);
  const placement = fitFades({ ...window, start: at, end: Math.min(end, MAX_LENGTH) });
  let moved = placedClip(track, placement);
  if (length < window.end - window.start - 1e-7) {
    const envelope = track.gainEnvelope || fitFades(window, window.start + length), delta = at - window.start;
    moved = { ...moved, gainEnvelope: { ...envelope, start: envelope.start + delta, end: envelope.end + delta } };
  }
  return { ...copy, arrangement: { ...mix.arrangement, enabled: true, duration: Math.max(mix.arrangement.duration, placement.end) },
    tracks: [...copy.tracks.slice(0, -1), moved] };
}

// Free mix used to ignore timeline windows. Keep saved windows, while giving
// unplaced one-shots enough room when opening them in the unified editor.
export function editorTimelineMix(mix, durations) {
  let duration = mix.arrangement.duration;
  for (const clip of mix.tracks) {
    const start = clip.placement?.start || 0;
    if (Number.isFinite(clip.placement?.end)) duration = Math.max(duration, clip.placement.end);
    else if (!clip.loop && !sequenceMetadata(clip).enabled && Number.isFinite(durations[clip.id])) {
      duration = Math.max(duration, start + clipRegion(clip, durations[clip.id]).length - (clip.sourceOffset || 0));
    }
  }
  return { ...mix, arrangement: { enabled: true, duration: Math.min(MAX_LENGTH, duration) } };
}

export function commitEditorPlacement(mix, id, value, sourceDuration, action = 'move', targetLaneId) {
  const original = mix.tracks.find(clip => clip.id === id && !clip.patternBlock);
  if (!original) throw new Error('Choose an audio clip first.');
  const placement = validatePlacement(value, MAX_LENGTH);
  let next = ['start', 'end'].includes(action)
    ? trimmedClip(original, placement, sourceDuration, action, arrangementWindow(original, { ...mix.arrangement, enabled: true }))
    : placedClip(original, placement);
  if (action === 'repeat') next = { ...next, loop: true };
  let destinationName;
  if (targetLaneId && targetLaneId !== editorLaneId(original)) {
    const lane = mix.tracks.find(clip => !clip.patternBlock && editorLaneId(clip) === targetLaneId);
    if (!lane) throw new Error('Choose an existing audio track as the destination.');
    destinationName = lane.laneName || lane.name;
    next = { ...next, laneId: targetLaneId, laneName: destinationName, role: lane.role, volume: lane.volume, muted: lane.muted, solo: lane.solo };
  }
  return { ...mix, arrangement: { enabled: true, duration: Math.max(mix.arrangement.duration, placement.end) },
    tracks: mix.tracks.map(clip => clip.id === id ? next : destinationName && editorLaneId(clip) === targetLaneId && !clip.patternBlock ? { ...clip, laneId: targetLaneId, laneName: destinationName } : clip) };
}

// The Repeat checkbox changes playback within the current visible region.
// Only the separate repeat handle extends that region further along the song.
export function setEditorClipLoop(mix, id, enabled, sourceDuration) {
  const original = mix.tracks.find(clip => clip.id === id && !clip.patternBlock);
  if (!original) throw new Error('Choose an audio clip first.');
  if (typeof enabled !== 'boolean') throw new Error('Choose a valid Repeat setting.');
  let clip = original;
  if (enabled) {
    if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error('Load the original audio before enabling Repeat.');
    const placement = editorClipWindow(original, mix.arrangement, sourceDuration);
    clip = placedClip(original, placement);
    if (original.gainEnvelope) clip = { ...clip, gainEnvelope: { ...original.gainEnvelope } };
  }
  return { ...mix, tracks: mix.tracks.map(track => track.id === id ? { ...clip, loop: enabled } : track) };
}

// Fit the song to what its regions can play. Keep the source range, phase and
// inherited split envelope; normal playback already fits fades to audible ends.
export function fitEditorSongEnd(mix, durations) {
  let duration = 1;
  const tracks = mix.tracks.map(clip => {
    const window = arrangementWindow(clip, { ...mix.arrangement, enabled: true });
    if (clip.loop || clip.patternBlock || sequenceMetadata(clip).enabled) {
      duration = Math.max(duration, window.end);return clip;
    }
    const sourceDuration = durations[clip.id];
    if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error('Load the original audio for ' + clip.name + ' before fitting the song end.');
    const placement = editorClipWindow(clip, mix.arrangement, sourceDuration);
    duration = Math.max(duration, placement.end);
    return placement.end < window.end - 1e-7 ? { ...clip, placement } : clip;
  });
  validateLength(duration, tracks);
  return { ...mix, tracks, arrangement: { ...mix.arrangement, enabled: true, duration } };
}
