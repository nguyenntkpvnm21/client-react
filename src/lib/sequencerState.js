import { clipMetadata, clipRegion } from './clipRegion.js';

export const STEP_COUNT = 16;
export const DEFAULT_BPM = 100;
export const MIN_BPM = 40;
export const MAX_BPM = 240;

export function validBpm(value) {
  return Number.isInteger(value) && value >= MIN_BPM && value <= MAX_BPM ? value : DEFAULT_BPM;
}

export function sequenceMetadata(track) {
  const sequence = track?.sequence;
  const valid = Array.isArray(sequence?.steps) && sequence.steps.length === STEP_COUNT
    && sequence.steps.every((step) => typeof step === 'boolean');
  const steps = valid ? [...sequence.steps] : Array(STEP_COUNT).fill(false);
  const initialized = valid && (sequence.initialized === true || sequence.enabled === true || steps.some(Boolean));
  // Older mixes shared the normal clip with the rhythm. Keep that selection in both
  // slots on migration; its original pre-rhythm range cannot be reconstructed.
  const sample = valid && sequence.sample != null ? clipMetadata(sequence.sample)
    : initialized ? clipMetadata(track) : null;
  return { enabled: valid && sequence.enabled === true, initialized, steps, sample };
}

export function rhythmSample(track) { return sequenceMetadata(track).sample ?? clipMetadata(track); }
export function rhythmRegion(track, duration) { return clipRegion(rhythmSample(track), duration); }

export function enableRhythmTrack(track, duration) {
  const sequence = sequenceMetadata(track);
  if (sequence.initialized) return { ...track, sequence: { ...sequence, enabled: true } };
  const normal = clipMetadata(track);
  const sample = sequence.sample ?? (normal.clipEnd !== null ? normal : { clipStart: 0, clipEnd: Math.min(.18, duration) });
  return { ...track, sequence: { enabled: true, initialized: true, sample,
    steps: Array.from({ length: STEP_COUNT }, (_, index) => index % 4 === 0) } };
}

export function isSequenced(track) { return sequenceMetadata(track).enabled; }
export function stepSeconds(bpm) { return 60 / validBpm(bpm) / 4; }

export function nextHitGap(steps, step) {
  for (let distance = 1; distance <= STEP_COUNT; distance += 1) {
    if (steps[(step + distance) % STEP_COUNT]) return distance;
  }
  return STEP_COUNT;
}

export function patternStep(position, bpm) {
  return Math.floor(Math.max(0, position) / stepSeconds(bpm) + 1e-8) % STEP_COUNT;
}
