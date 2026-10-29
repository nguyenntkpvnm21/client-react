// Keep seconds in audio/state; show a clock to people. Fractional precision is
// opt-in for samples and fades, with no trailing zeroes or rounded 0:60 values.
export function clockTime(value, precision = 0) {
  const scale = 10 ** precision;
  const ticks = Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * scale);
  const seconds = Math.floor(ticks / scale);
  const fraction = precision ? String(ticks % scale).padStart(precision, '0').replace(/0+$/, '') : '';
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + (fraction ? '.' + fraction : '');
}
