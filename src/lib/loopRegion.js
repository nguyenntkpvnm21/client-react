export const MIN_LOOP_SECONDS = .25;
export function validateLoopRegion(value, duration) {
  const number = (v) => typeof v === 'string' && !v.trim() ? NaN : Number(v);
  const start = number(value.start), end = number(value.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration + 1e-6 || end - start < Math.min(MIN_LOOP_SECONDS, duration) - 1e-6) {
    throw new Error('Choose a section of at least 0.25 seconds inside the composition.');
  }
  return { start, end: Math.min(end, duration), enabled: value.enabled === true };
}
export function initialLoopRegion(duration) { return { start: 0, end: Math.min(4, duration), enabled: false }; }

export function editLoopRegion(original, action, delta, duration, snap = 0) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = (value) => snap ? Math.round(value / snap) * snap : value;
  const min = MIN_LOOP_SECONDS, length = original.end - original.start;
  if (action === 'move') {
    const start = clamp(round(original.start + delta), 0, duration - length);
    return { ...original, start, end: start + length };
  }
  if (action === 'start') return { ...original, start: clamp(round(original.start + delta), 0, original.end - min) };
  return { ...original, end: clamp(round(original.end + delta), original.start + min, duration) };
}
