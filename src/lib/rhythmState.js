import { clipMetadata, clipRegion } from './clipRegion.js';
import { nextHitGap, sequenceMetadata, stepSeconds } from './sequencerState.js';

export const MAX_RING_VOICES = 32;
export function rhythmMetadata(track) {
  const sequence = sequenceMetadata(track);
  const raw = track?.rhythm;
  const initialized = raw?.initialized === true || sequence.initialized || sequence.enabled || sequence.steps.some(Boolean);
  // Old single-region projects keep their audible sample. Their former normal clip cannot be inferred.
  const legacy = !raw ? sequence.sample ?? (initialized ? clipMetadata(track) : { clipStart: 0, clipEnd: null }) : { clipStart: 0, clipEnd: null };
  const region = clipMetadata({ clipStart: raw?.sampleStart ?? legacy.clipStart,
    clipEnd: raw && Object.hasOwn(raw, 'sampleEnd') ? raw.sampleEnd : legacy.clipEnd });
  return { initialized, sampleStart: region.clipStart, sampleEnd: region.clipEnd, tailMode: raw?.tailMode === 'ring' ? 'ring' : 'cut' };
}
export function rhythmRegion(track, duration) {
  const rhythm = rhythmMetadata(track);
  return clipRegion({ clipStart: rhythm.sampleStart, clipEnd: rhythm.sampleEnd }, duration);
}
export function enableRhythmTrack(track, duration) {
  const rhythm = rhythmMetadata(track);
  if (rhythm.initialized) return { ...track, rhythm, sequence: { ...sequenceMetadata(track), enabled: true } };
  return { ...track, muted: false, volume: track.volume || 50,
    rhythm: { ...rhythm, initialized: true, sampleStart: rhythm.sampleEnd == null ? 0 : rhythm.sampleStart, sampleEnd: rhythm.sampleEnd ?? Math.min(.18, duration) },
    sequence: { enabled: true, steps: Array.from({ length: 16 }, (_, index) => index % 4 === 0) } };
}
export function patternSummary(track, duration, bpm) {
  const steps = sequenceMetadata(track).steps;
  const hits = steps.flatMap((on, index) => on ? [index] : []);
  const sample = rhythmRegion(track, duration);
  const shortest = hits.length ? Math.min(...hits.map((index) => nextHitGap(steps, index))) * stepSeconds(bpm) : null;
  const voices = hits.length ? Math.ceil(sample.length / (stepSeconds(bpm) * 16)) * hits.length : 0;
  return { sample, hits: hits.length, shortest, cut: rhythmMetadata(track).tailMode === 'cut' && shortest !== null && sample.length > shortest + .001,
    crowded: rhythmMetadata(track).tailMode === 'ring' && voices > MAX_RING_VOICES };
}
