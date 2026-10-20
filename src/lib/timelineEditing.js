import { fitFades } from './arrangementState.js';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function editTimelineWindow(window, action, delta, duration, snap = 0) {
  const round = (value) => snap > 0 ? Math.round(value / snap) * snap : Math.round(value * 1000) / 1000;
  const length = window.end - window.start;
  let next = { ...window };
  if (action === 'move') {
    next.start = clamp(round(window.start + delta), 0, Math.max(0, duration - length));
    next.end = next.start + length;
  } else if (action === 'start') next.start = clamp(round(window.start + delta), 0, window.end - .05);
  else if (action === 'end') next.end = clamp(round(window.end + delta), window.start + .05, duration);
  else if (action === 'fadeIn') next.fadeIn = clamp(round(window.fadeIn + delta), 0, length - window.fadeOut);
  else if (action === 'fadeOut') next.fadeOut = clamp(round(window.fadeOut - delta), 0, length - window.fadeIn);
  next = fitFades(next);
  return { start: next.start, end: next.end, fadeIn: next.fadeIn, fadeOut: next.fadeOut };
}
