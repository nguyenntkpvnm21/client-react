import { arrangementMetadata } from './arrangementState.js';
import { clipRegion } from './clipRegion.js';
import { isSequenced, stepSeconds } from './sequencerState.js';

// Free mix can run forever. Its slider is a listening window, not a new clip limit.
export function playbackTimeline(tracks, details, arrangement, bpm, elapsed = 0) {
  const config = arrangementMetadata(arrangement);
  if (config.enabled) return { duration: config.duration, max: config.duration, repeating: false, ready: true };
  const ready = tracks.length > 0 && tracks.every((track) => Number.isFinite(details[track.id]?.duration));
  const repeating = tracks.some((track) => isSequenced(track) || track.loop);
  const lengths = tracks.map((track) => isSequenced(track) ? 16 * stepSeconds(bpm)
    : details[track.id]?.duration ? Math.max(0, clipRegion(track, details[track.id].duration).length - (track.sourceOffset || 0)) : 0);
  const span = Math.max(0, ...lengths);
  const duration = ready && !repeating ? span : null;
  return { duration, max: duration ?? Math.max(60, span, Math.ceil(Math.max(0, elapsed) / 60) * 60), repeating, ready };
}

export function parsePlaybackTime(value, max = Infinity) {
  const text = String(value).trim();
  let seconds;
  if (/^\d+(?:\.\d{1,3})?$/.test(text)) seconds = Number(text);
  else {
    const match = /^(\d+):([0-5]?\d(?:\.\d{1,3})?)$/.exec(text);
    if (match) seconds = Number(match[1]) * 60 + Number(match[2]);
  }
  if (!Number.isFinite(seconds)) throw new Error('Enter seconds or m:ss, for example 90 or 1:30.5.');
  if (seconds > max) throw new Error('Choose a time within the playback duration.');
  return seconds;
}

export function precisePlaybackTime(value) {
  const tenths = Math.round(Math.max(0, value) * 10);
  const seconds = Math.floor(tenths / 10);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + '.' + tenths % 10;
}
