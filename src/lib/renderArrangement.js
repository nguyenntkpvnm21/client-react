import { arrangementMetadata, validateLength } from './arrangementState.js';
import { createMasterGraph, releaseSource, scheduleNormalTrack } from './audioGraph.js';
import { isSequenced, sequenceMetadata, stepSeconds, validBpm } from './sequencerState.js';
import { StepScheduler } from './stepScheduler.js';

const yieldTask = () => new Promise((resolve) => globalThis.setTimeout(resolve, 0));
export function checkExportCanceled(signal) {
  if (signal?.aborted) throw new DOMException('Export canceled.', 'AbortError');
}

export function exportFilename(value) {
  const name = Array.from(String(value || 'NatureMix arrangement'), (char) => char.charCodeAt(0) < 32 ? '-' : char).join('').replace(/[<>:"/\\|?*]/g, '-').trim().replace(/[. ]+$/g, '').replace(/\.wav$/i, '').slice(0, 100);
  return (name || 'NatureMix arrangement') + '.wav';
}

// Interleave signed 16-bit PCM. Chunking keeps cancellation and the UI responsive.
export async function encodeWav(buffer, { signal, onProgress = () => {} } = {}) {
  checkExportCanceled(signal);
  const channels = buffer.numberOfChannels, frames = buffer.length, rate = buffer.sampleRate;
  const dataSize = frames * channels * 2;
  const bytes = new ArrayBuffer(44 + dataSize), view = new DataView(bytes);
  const ascii = (offset, value) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  ascii(0, 'RIFF');view.setUint32(4, 36 + dataSize, true);ascii(8, 'WAVE');ascii(12, 'fmt ');
  view.setUint32(16, 16, true);view.setUint16(20, 1, true);view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);view.setUint32(28, rate * channels * 2, true);view.setUint16(32, channels * 2, true);view.setUint16(34, 16, true);
  ascii(36, 'data');view.setUint32(40, dataSize, true);
  const samples = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  for (let from = 0; from < frames; from += 65536) {
    checkExportCanceled(signal);
    const end = Math.min(frames, from + 65536);
    for (let frame = from; frame < end; frame += 1) for (let channel = 0; channel < channels; channel += 1) {
      const raw = samples[channel][frame], value = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
      view.setInt16(44 + (frame * channels + channel) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
    onProgress(end / frames);
    await yieldTask();
  }
  checkExportCanceled(signal);
  return new Blob([bytes], { type: 'audio/wav' });
}

// Uses the same source regions, fades, voices and master chain as live playback.
// Session-only audition loops and the transport position are deliberately absent.
export async function renderArrangement({ mix, buffers, signal, onProgress = () => {},
  createContext = (channels, length, rate) => new (globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext)(channels, length, rate) }) {
  checkExportCanceled(signal);
  const duration = validateLength(arrangementMetadata(mix.arrangement).duration, mix.tracks);
  const arrangement = { enabled: true, duration }, rate = 44100;
  const context = createContext(2, Math.ceil(duration * rate), rate);
  const graph = createMasterGraph(context, mix.master);
  const nodes = [];
  const scheduler = new StepScheduler({ context, output: graph.master, buffers, setTimer: () => null });
  try {
    for (const track of mix.tracks) {
      if (!buffers.get(track.id)) throw new Error('Audio is missing for ' + track.name + '.');
      if (!isSequenced(track)) {
        const node = scheduleNormalTrack({ context, output: graph.master, track, tracks: mix.tracks, buffer: buffers.get(track.id), when: 0, offset: 0, arrangement });
        if (node) nodes.push(node);
      }
    }
    const bpm = validBpm(mix.bpm), seconds = stepSeconds(bpm);
    scheduler.start(mix.tracks, bpm, 0, 0, [], { arrangement, maxSteps: 0, stopAt: duration });
    for (let index = 0; index * seconds < duration - 1e-8; index += 1) {
      checkExportCanceled(signal);
      for (const track of mix.tracks) if (isSequenced(track) && sequenceMetadata(track).steps[index % 16]) scheduler.hit(track, index, index * seconds);
      if (index % 256 === 0) { onProgress({ stage: 'Preparing audio', progress: .15 + .1 * index * seconds / duration });await yieldTask(); }
    }
    checkExportCanceled(signal);
    onProgress({ stage: 'Rendering audio', progress: .25 });
    // Browsers cannot abort native offline rendering. A canceled result is discarded.
    const rendered = await context.startRendering();
    checkExportCanceled(signal);
    return await encodeWav(rendered, { signal, onProgress: (value) => onProgress({ stage: 'Encoding WAV', progress: .75 + value * .25 }) });
  } finally {
    scheduler.stop();
    for (const node of nodes) releaseSource(node);
    graph.master.disconnect();graph.compressor.disconnect();
  }
}
