import { MIN_CLIP_SECONDS } from './clipRegion.js';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function boundSelection(start, end, duration) {
  const min = Math.min(MIN_CLIP_SECONDS, duration);
  const a = clamp(Math.min(start, end), 0, Math.max(0, duration - min));
  return { start: a, end: clamp(Math.max(start, end), a + min, duration) };
}
export function moveSelection(start, end, delta, duration) {
  const length = end - start;
  const next = clamp(start + delta, 0, Math.max(0, duration - length));
  return { start: next, end: Math.min(duration, next + length) };
}
export function sizedSelection(start, length, duration) {
  const size = clamp(length, Math.min(MIN_CLIP_SECONDS, duration), duration);
  const a = clamp(start, 0, duration - size);
  return { start: a, end: a + size };
}
export function waveformPeaks(buffer, start = 0, end = buffer.duration, bins = 600) {
  const size = Math.max(1, Math.min(1200, Math.floor(bins)));
  const first = Math.floor(clamp(start / buffer.duration, 0, 1) * buffer.length);
  const last = Math.ceil(clamp(end / buffer.duration, 0, 1) * buffer.length);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const peaks = Array.from({ length: size }, (_, i) => {
    const a = Math.floor(first + (last - first) * i / size), b = Math.max(a + 1, Math.floor(first + (last - first) * (i + 1) / size));
    let peak = 0;
    const step = Math.max(1, Math.floor((b - a) / 100));
    for (const channel of channels) for (let j = a; j < b && j < buffer.length; j += step) peak = Math.max(peak, Math.abs(channel[j]));
    return peak;
  });
  const maximum = Math.max(...peaks, .001);
  return peaks.map((peak) => peak / maximum);
}
export function findSoundRegion(buffer, from, length) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const block = Math.max(1, Math.floor(buffer.length / buffer.duration * .005));
  const envelopes = [];
  let max = 0;
  for (let i = 0; i < buffer.length; i += block) {
    let peak = 0;
    for (const channel of channels) for (let j = i; j < Math.min(i + block, buffer.length); j += Math.max(1, Math.floor(block / 50))) peak = Math.max(peak, Math.abs(channel[j]));
    envelopes.push(peak); max = Math.max(max, peak);
  }
  if (max < .0001) return null;
  const threshold = max * .15;
  const index = Math.floor(from / buffer.duration * buffer.length / block);
  let found = envelopes.findIndex((peak, i) => i >= index && peak >= threshold);
  if (found < 0) found = envelopes.findIndex((peak) => peak >= threshold);
  return sizedSelection(Math.max(0, found * block / buffer.length * buffer.duration - .01), length, buffer.duration);
}
