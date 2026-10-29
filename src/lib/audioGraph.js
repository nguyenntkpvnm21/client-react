import { arrangementWindow, fitFades, scheduleWindowEnvelope } from './arrangementState.js';
import { clipRegion } from './clipRegion.js';
import { audibleGain } from './studioState.js';

export function createMasterGraph(context, level) {
  const master = context.createGain();
  master.gain.value = level / 100;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -3;compressor.knee.value = 3;compressor.ratio.value = 12;
  compressor.attack.value = .003;compressor.release.value = .2;
  master.connect(compressor).connect(context.destination);
  return { master, compressor };
}

// Shared by normal playback, section auditions and offline rendering.
export function scheduleNormalTrack({ context, output, track, tracks, buffer, when, offset, arrangement, stopAt = Infinity }) {
  const region = clipRegion(track, buffer.duration);
  const sourceOffset = track.sourceOffset || 0;
  let localOffset = offset, duration = Infinity, window;
  if (arrangement.enabled) {
    window = arrangementWindow(track, arrangement);
    if (!track.loop) window = fitFades(window, Math.min(window.end, window.start + Math.max(0, region.length - sourceOffset)));
    const end = Math.min(window.end, stopAt);
    if (offset >= end || end <= window.start) return null;
    const entry = Math.max(offset, window.start);
    when += Math.max(0, window.start - offset);
    localOffset = entry - window.start;
    duration = end - entry;
  }
  if (!track.loop && localOffset + sourceOffset >= region.length) return null;
  const source = context.createBufferSource(), gain = context.createGain();
  source.buffer = buffer;source.loop = track.loop;source.loopStart = region.start;source.loopEnd = region.end;
  gain.gain.value = audibleGain(track, tracks);
  source.connect(gain);
  let envelope, edge;
  let last = gain;
  if (window) {
    envelope = context.createGain();
    scheduleWindowEnvelope(envelope.gain, when, Math.max(offset, window.start), track.gainEnvelope || window);
    last.connect(envelope);last = envelope;
  }
  if (Number.isFinite(stopAt)) {
    edge = context.createGain();
    const fade = Math.min(.003, duration / 4);
    edge.gain.setValueAtTime(0, when);edge.gain.linearRampToValueAtTime(1, when + fade);
    edge.gain.setValueAtTime(1, when + duration - fade);edge.gain.linearRampToValueAtTime(0, when + duration);
    last.connect(edge);last = edge;
  }
  last.connect(output);
  const position = region.start + (track.loop ? (localOffset + sourceOffset) % region.length : localOffset + sourceOffset);
  const node = { source, gain, envelope, edge };
  try {
    if (window) source.start(when, position, duration);
    else if (track.loop || region.end === buffer.duration) source.start(when, position);
    else source.start(when, position, region.length - sourceOffset - localOffset);
  } catch (error) { releaseSource(node);throw error; }
  return node;
}

export function releaseSource(node, stop = true) {
  node.source.onended = null;
  if (stop) { try { node.source.stop(); } catch { /* Already ended. */ } }
  node.source.disconnect();node.gain.disconnect();node.envelope?.disconnect();node.edge?.disconnect();
}
