export const DEFAULT_LENGTH = 30;
export const MAX_LENGTH = 300;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const number = (value) => typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;

export function arrangementMetadata(value) {
  const valid = finite(value?.duration) && value.duration >= 1 && value.duration <= MAX_LENGTH;
  return { enabled: valid && value.enabled === true, duration: valid ? value.duration : DEFAULT_LENGTH };
}

export function placementMetadata(value) {
  const start = finite(value?.start) && value.start >= 0 && value.start < MAX_LENGTH ? value.start : 0;
  const end = finite(value?.end) && value.end > start && value.end <= MAX_LENGTH ? value.end : null;
  return { start, end, fadeIn: finite(value?.fadeIn) && value.fadeIn >= 0 && value.fadeIn <= MAX_LENGTH ? value.fadeIn : 0,
    fadeOut: finite(value?.fadeOut) && value.fadeOut >= 0 && value.fadeOut <= MAX_LENGTH ? value.fadeOut : 0 };
}

export function fitFades(window, end = window.end) {
  const length = Math.max(0, end - window.start);
  const sum = window.fadeIn + window.fadeOut;
  const scale = sum > length ? length / sum : 1;
  return { ...window, end, fadeIn: window.fadeIn * scale, fadeOut: window.fadeOut * scale };
}

export function arrangementWindow(track, arrangement) {
  const config = arrangementMetadata(arrangement);
  if (!config.enabled) return { start: 0, end: Infinity, fadeIn: 0, fadeOut: 0 };
  const placement = placementMetadata(track?.placement);
  return fitFades({ ...placement, end: Math.max(placement.start, Math.min(placement.end ?? config.duration, config.duration)) });
}

export function validateLength(value, tracks) {
  const duration = number(value);
  if (!finite(duration) || duration < 1 || duration > MAX_LENGTH) throw new Error('Choose a length from 1 to 300 seconds.');
  for (const track of tracks) {
    const placement = placementMetadata(track.placement);
    if (placement.start >= duration || (placement.end !== null && placement.end > duration + 0.000001)
      || placement.fadeIn + placement.fadeOut > (placement.end ?? duration) - placement.start + 0.000001) {
      throw new Error('Adjust the timing for ' + track.name + ' before shortening this arrangement.');
    }
  }
  return duration;
}

export function validatePlacement(value, duration) {
  const start = number(value.start), end = number(value.end), fadeIn = number(value.fadeIn), fadeOut = number(value.fadeOut);
  if (![start, end, fadeIn, fadeOut].every(finite)) throw new Error('Enter all four timing values in seconds.');
  if (start < 0 || start >= end || end > duration + 0.000001 || end - start < 0.05 - 0.000001) {
    throw new Error('Entry must be before exit, with at least 0.05 seconds inside the arrangement.');
  }
  if (fadeIn < 0 || fadeOut < 0 || fadeIn + fadeOut > end - start + 0.000001) {
    throw new Error('Fades must be positive or zero and fit within this layer’s window.');
  }
  return { start, end: Math.min(end, duration), fadeIn, fadeOut };
}

export function windowGain(window, position) {
  if (position < window.start || position >= window.end) return 0;
  return Math.min(1, window.fadeIn ? (position - window.start) / window.fadeIn : 1,
    window.fadeOut ? (window.end - position) / window.fadeOut : 1);
}

export function scheduleWindowEnvelope(param, when, position, window) {
  param.setValueAtTime(windowGain(window, position), when);
  const at = (point) => when + point - position;
  const fadeInEnd = window.start + window.fadeIn;
  const fadeOutStart = window.end - window.fadeOut;
  if (window.start > position) param.setValueAtTime(window.fadeIn ? 0 : 1, at(window.start));
  if (window.fadeIn && fadeInEnd > position) param.linearRampToValueAtTime(1, at(fadeInEnd));
  // Touching fades already meet at the ramp's peak. A nearly coincident Set
  // event can sort before that ramp and turn the entire fade-in into a jump.
  if (window.fadeOut && fadeOutStart > position && (!window.fadeIn || fadeOutStart > fadeInEnd + 1e-8)) param.setValueAtTime(1, at(fadeOutStart));
  if (window.end > position) {
    if (window.fadeOut) param.linearRampToValueAtTime(0, at(window.end));
    else param.setValueAtTime(0, at(window.end));
  }
}
