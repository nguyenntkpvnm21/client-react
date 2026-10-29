import { encodeWav } from './renderArrangement.js';

export const DRUMS = [
  { id: 'kick', name: 'Kick', duration: .45, volume: 65, hits: [0, 8] },
  { id: 'snare', name: 'Snare', duration: .22, volume: 45, hits: [4, 12] },
  { id: 'hat', name: 'Hi-hat', duration: .08, volume: 30, hits: [0, 2, 4, 6, 8, 10, 12, 14] },
];

// Original synthesized one-shots: no downloads, external samples or live synth voices.
// Persisting ordinary WAVs keeps imports, backups and offline export on the same path.
export function drumBuffer(id) {
  const drum = DRUMS.find((item) => item.id === id);
  if (!drum) throw new Error('Unknown drum sound.');
  const sampleRate = 44100, length = Math.ceil(drum.duration * sampleRate);
  const samples = new Float32Array(length);
  let seed = 1234567, previous = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const attack = Math.min(1, t / .002);
    const release = Math.min(1, (length - 1 - i) / (sampleRate * .01));
    let value;
    if (id === 'kick') value = Math.sin(2 * Math.PI * (48 * t + 100 * .025 * (1 - Math.exp(-t / .025)))) * Math.exp(-t * 12);
    else if (id === 'snare') value = (noise * .7 + Math.sin(2 * Math.PI * 180 * t) * .3) * Math.exp(-t * 24);
    else value = (noise - previous) * .4 * Math.exp(-t * 65);
    samples[i] = value * attack * release * .9;
    previous = noise;
  }
  return { numberOfChannels: 1, sampleRate, length, duration: length / sampleRate, getChannelData: () => samples };
}

export async function drumKit(ids) {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Choose distinct drum sounds.');
  const buffers = ids.map(drumBuffer), gap = 2205, sampleRate = 44100;
  const length = buffers.reduce((total, buffer) => total + buffer.length, 0) + gap * (buffers.length - 1);
  const samples = new Float32Array(length);
  let offset = 0;
  const drums = buffers.map((buffer, index) => {
    samples.set(buffer.getChannelData(0), offset);
    const drum = { ...DRUMS.find((item) => item.id === ids[index]), start: offset / sampleRate, end: (offset + buffer.length) / sampleRate };
    offset += buffer.length + gap;
    return drum;
  });
  const file = new File([await encodeWav({ numberOfChannels: 1, sampleRate, length, getChannelData: () => samples })], 'NatureMix drum beat.wav', { type: 'audio/wav' });
  return { drums, file };
}

export function drumTrack(drum, id, source, solo = false) {
  return { id, sourceId: source, catalogId: null, name: drum.name, role: 'music', volume: drum.volume, muted: false, solo, loop: false,
    clipStart: drum.start, clipEnd: drum.end, placement: { start: 0, end: null, fadeIn: 0, fadeOut: 0 },
    rhythm: { initialized: true, sampleStart: drum.start, sampleEnd: drum.end, tailMode: 'cut' },
    sequence: { enabled: true, steps: Array.from({ length: 16 }, (_, step) => drum.hits.includes(step)) } };
}
