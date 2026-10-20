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
  return { enabled: valid && sequence.enabled === true,
    steps: valid ? [...sequence.steps] : Array(STEP_COUNT).fill(false) };
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
