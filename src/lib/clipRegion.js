// Clip positions are seconds in the original recording, never destructive edits.
export const MIN_CLIP_SECONDS = 0.05;

export function clipMetadata(track) {
  const start = Number.isFinite(track?.clipStart) && track.clipStart >= 0 ? track.clipStart : 0;
  const end = Number.isFinite(track?.clipEnd) && track.clipEnd > start ? track.clipEnd : null;
  return end === null ? { clipStart: 0, clipEnd: null } : { clipStart: start, clipEnd: end };
}

export function clipRegion(track, duration) {
  const saved = clipMetadata(track);
  if (saved.clipEnd === null || saved.clipEnd > duration + 0.001 || saved.clipStart >= duration
    || saved.clipEnd - saved.clipStart < Math.min(MIN_CLIP_SECONDS, duration) - 0.001) {
    return { start: 0, end: duration, length: duration };
  }
  const end = Math.min(duration, saved.clipEnd);
  return { start: saved.clipStart, end, length: end - saved.clipStart };
}

export function validateRegion(startValue, endValue, duration) {
  const start = typeof startValue === 'number' ? startValue : startValue.trim() === '' ? NaN : Number(startValue);
  const end = typeof endValue === 'number' ? endValue : endValue.trim() === '' ? NaN : Number(endValue);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Load the recording before editing.');
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Enter both start and end times in seconds.');
  if (start < 0 || end > duration + 0.001 || start >= end) throw new Error('Choose a start before the end, within the recording.');
  const boundedEnd = Math.min(end, duration);
  if (boundedEnd - start < Math.min(MIN_CLIP_SECONDS, duration) - 0.000001) {
    throw new Error('Select at least 0.05 seconds, or the whole recording if shorter.');
  }
  return { clipStart: start, clipEnd: boundedEnd };
}
