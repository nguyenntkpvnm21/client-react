import { findSoundRegion, waveformPeaks } from './audioSelection.js';
import { rhythmMetadata, rhythmRegion } from './rhythmState.js';
import { arrangementMetadata, arrangementWindow, fitFades, placementMetadata, scheduleWindowEnvelope } from './arrangementState.js';
import { StepScheduler } from './stepScheduler.js';
import { DEFAULT_BPM, isSequenced, validBpm, stepSeconds } from './sequencerState.js';
import { clipRegion, validateRegion } from './clipRegion.js';
import { audibleGain } from './studioState.js';

const MEMORY_LIMIT = 512 * 1024 * 1024;

function waveform(buffer) {
  const samples = buffer.getChannelData(0);
  const peaks = [];
  for (let bar = 0; bar < 48; bar += 1) {
    const start = Math.floor(bar * samples.length / 48);
    const end = Math.max(start + 1, Math.floor((bar + 1) * samples.length / 48));
    const step = Math.max(1, Math.floor((end - start) / 500));
    let peak = 0;
    for (let i = start; i < end && i < samples.length; i += step) peak = Math.max(peak, Math.abs(samples[i]));
    peaks.push(peak);
  }
  const maximum = Math.max(...peaks, 0.001);
  return peaks.map((peak) => peak / maximum);
}

export class AudioEngine {
  constructor({ createContext, onState = () => {}, onTrack = () => {}, onError = () => {} } = {}) {
    this.createContext = createContext || (() => new (window.AudioContext || window.webkitAudioContext)());
    this.onState = onState;
    this.onTrack = onTrack;
    this.onError = onError;
    this.bpm = DEFAULT_BPM;
    this.arrangement = arrangementMetadata();
    this.finishTimer = null;
    this.scheduler = null;
    this.context = null;
    this.buffers = new Map();
    this.pending = new Map();
    this.nodes = new Map();
    this.tracks = [];
    this.master = 75;
    this.offset = 0;
    this.anchor = 0;
    this.playing = false;
    this.request = 0;
    this.disposed = false;
    this.memory = 0;
    this.previewRequest = 0;
    this.previewNode = null;
    this.patternPreview = null;
    this.previewId = null;
    this.previewKind = null;
    this.sequencePhase = null;
    this.sequenceTails = null;
  }

  ensureContext() {
    if (this.disposed) throw new Error('This audio workspace was closed. Reload to continue.');
    if (!this.context) {
      this.context = this.createContext();
      this.masterNode = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      this.compressor = compressor;
      compressor.threshold.value = -3;
      compressor.knee.value = 3;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      this.masterNode.connect(compressor).connect(this.context.destination);
      this.masterNode.gain.value = this.master / 100;
      this.context.onstatechange = () => {
        if (this.context.state !== 'running') { if (this.playing) this.pause(); else this.stopPreview(); }
      };
    }
    return this.context;
  }

  position() {
    return this.playing ? Math.max(0, this.context.currentTime - this.anchor) : this.offset;
  }

  isSequencing() { return this.tracks.some(isSequenced); }

  currentStep() { return this.playing && this.scheduler?.running ? Math.floor(Math.max(0, this.scheduler.indexAt(this.context.currentTime)) + 1e-8) % 16 : null; }

  tempoState() {
    const change = this.scheduler?.running ? this.scheduler.tempoChange : null;
    return { active: this.scheduler?.running ? (change && this.context.currentTime >= change.when ? change.bpm : this.scheduler.bpm) : this.bpm,
      pending: change && this.context.currentTime < change.when ? change.bpm : null };
  }

  setBpm(value) {
    const next = validBpm(value);
    if (next === this.bpm) return;
    this.bpm = next;
    this.scheduler?.setBpm(next);
  }

  maybeFinish() {
    if (this.playing && this.nodes.size === 0 && !this.isSequencing() && !this.arrangement.enabled) this.pause();
  }

  setArrangement(value) {
    const next = arrangementMetadata(value);
    if (JSON.stringify(next) !== JSON.stringify(this.arrangement) && this.playing) this.restart();
    this.arrangement = next;
  }

  checkFinish() {
    if (!this.playing || !this.arrangement.enabled || this.position() < this.arrangement.duration) return;
    this.pause();
    this.offset = this.arrangement.duration;
    this.sequencePhase = 0;
    this.sequenceTails = null;
    this.onState('finished');
  }

  setMaster(value) {
    this.master = value;
    if (this.masterNode) this.masterNode.gain.setTargetAtTime(value / 100, this.context.currentTime, 0.015);
  }

  stopNode(id) {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.delete(id);
    node.source.onended = null;
    try { node.source.stop(); } catch { /* A source may already have ended. */ }
    node.source.disconnect();
    node.gain.disconnect();
    node.envelope?.disconnect();
  }

  startTrack(track, when, offset) {
    if (isSequenced(track)) return;
    const buffer = this.buffers.get(track.id);
    if (!buffer) return;
    const region = clipRegion(track, buffer.duration);
    let localOffset = offset;
    let duration = Infinity;
    let window;
    if (this.arrangement.enabled) {
      window = arrangementWindow(track, this.arrangement);
      if (!track.loop) window = fitFades(window, Math.min(window.end, window.start + region.length));
      if (offset >= window.end || window.end <= window.start) return;
      const entry = Math.max(offset, window.start);
      when += Math.max(0, window.start - offset);
      localOffset = entry - window.start;
      duration = window.end - entry;
    }
    if (!track.loop && localOffset >= region.length) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = track.loop;
    source.loopStart = region.start;
    source.loopEnd = region.end;
    gain.gain.value = audibleGain(track, this.tracks);
    let envelope;
    if (window) {
      envelope = this.context.createGain();
      scheduleWindowEnvelope(envelope.gain, when, Math.max(offset, window.start), window);
      source.connect(gain).connect(envelope).connect(this.masterNode);
    } else source.connect(gain).connect(this.masterNode);
    const node = { source, gain, envelope };
    this.nodes.set(track.id, node);
    source.onended = () => {
      if (this.nodes.get(track.id) !== node) return;
      this.nodes.delete(track.id);
      source.disconnect();
      gain.disconnect();
      envelope?.disconnect();
      this.maybeFinish();
    };
    const position = region.start + (track.loop ? localOffset % region.length : localOffset);
    if (window) source.start(when, position, duration);
    else if (track.loop || region.end === buffer.duration) source.start(when, position);
    else source.start(when, position, region.length - localOffset);
  }

  setTracks(tracks) {
    const moved = this.arrangement.enabled ? tracks.filter((track) => {
      const previous = this.tracks.find((item) => item.id === track.id);
      return previous && JSON.stringify(placementMetadata(previous.placement)) !== JSON.stringify(placementMetadata(track.placement));
    }) : [];
    for (const track of moved) this.stopNode(track.id);
    this.tracks = tracks;
    this.scheduler?.setTracks(tracks);
    if (this.playing && this.isSequencing() && !this.scheduler?.running) this.startSequencer(this.context.currentTime + 0.03, this.position() + 0.03);
    if (!this.isSequencing()) this.scheduler?.stop();
    for (const id of this.nodes.keys()) if (!tracks.some((track) => track.id === id && !isSequenced(track))) this.stopNode(id);
    for (const track of tracks) {
      const node = this.nodes.get(track.id);
      if (node) {
        node.source.loop = track.loop;
        node.gain.gain.setTargetAtTime(audibleGain(track, tracks), this.context.currentTime, 0.015);
      } else if (this.playing) {
        this.startTrack(track, this.context.currentTime + 0.03, this.position() + 0.03);
      }
    }
    this.maybeFinish();
  }

  async load(track, file) {
    if (this.buffers.has(track.id)) return this.buffers.get(track.id);
    if (this.pending.has(track.id)) return this.pending.get(track.id).promise;
    const context = this.ensureContext();
    const controller = new AbortController();
    const operation = {};
    operation.controller = controller;
    operation.promise = (async () => {
      let bytes;
      if (file) bytes = await file.arrayBuffer();
      else {
        const response = await fetch(track.src, { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load ' + track.name + '. Check the audio file and try again.');
        bytes = await response.arrayBuffer();
      }
      let buffer;
      try { buffer = await context.decodeAudioData(bytes); }
      catch { throw new Error('Unable to read ' + track.name + '. Try a valid MP3, WAV or OGG file.'); }
      if (this.disposed || controller.signal.aborted) throw new Error('Audio loading was canceled.');
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 900) {
        throw new Error(track.name + ' must be between 0 and 15 minutes long.');
      }
      const size = buffer.length * buffer.numberOfChannels * 4;
      if (this.memory + size > MEMORY_LIMIT) throw new Error('This mix is too large. Remove a long track or use shorter recordings.');
      this.memory += size;
      this.buffers.set(track.id, buffer);
      this.onTrack(track.id, { duration: buffer.duration, peaks: waveform(buffer) });
      return buffer;
    })().finally(() => { if (this.pending.get(track.id) === operation) this.pending.delete(track.id); });
    this.pending.set(track.id, operation);
    return operation.promise;
  }

  async play(tracks, files, master, bpm = DEFAULT_BPM, arrangement) {
    this.stopPreview();
    this.setBpm(bpm);
    this.setArrangement(arrangement);
    const context = this.ensureContext();
    const request = ++this.request;
    this.setTracks(tracks);
    this.setMaster(master);
    this.onState('loading');
    try {
      await context.resume();
      await Promise.all(tracks.map((track) => this.load(track, files[track.id])));
      if (this.disposed || request !== this.request) return;
      if (context.state !== 'running') throw new Error('Playback is paused by your browser. Press Play again.');
      if (this.arrangement.enabled && this.offset >= this.arrangement.duration) {
        this.offset = 0; this.sequencePhase = 0; this.sequenceTails = null;
      }
      if (!this.arrangement.enabled && !this.isSequencing() && !this.tracks.some((track) => track.loop) && this.tracks.every((track) => this.offset >= clipRegion(track, this.buffers.get(track.id).duration).length)) this.offset = 0;
      const when = context.currentTime + 0.06;
      this.anchor = when - this.offset;
      this.playing = true;
      for (const track of this.tracks) this.startTrack(track, when, this.offset);
      if (this.isSequencing()) this.startSequencer(when, this.offset, this.sequencePhase, this.sequenceTails);
      if (this.playing) {
        if (this.arrangement.enabled) {
          this.finishTimer = globalThis.setInterval(() => this.checkFinish(), 25);
          this.finishTimer?.unref?.();
        }
        this.onState('playing');
      }
    } catch (error) {
      if (this.disposed || request !== this.request) return;
      this.pause();
      throw error;
    }
  }

  startSequencer(when, offset, phase = null, tails = null) {
    this.scheduler ||= new StepScheduler({ context: this.context, output: this.masterNode, buffers: this.buffers,
      onError: () => { this.pause(); this.onError(new Error('Pattern playback stopped. Press Play to try again.')); } });
    const sequenceOffset = phase == null ? offset : phase * stepSeconds(this.bpm);
    this.scheduler.start(this.tracks, this.bpm, when - sequenceOffset, sequenceOffset, tails, { arrangement: this.arrangement, timelineAnchor: this.anchor });
  }

  pause() {
    this.stopPreview();
    this.offset = this.position();
    this.sequencePhase = this.scheduler?.running ? Math.max(0, this.scheduler.indexAt(this.context.currentTime)) : null;
    this.sequenceTails = this.scheduler?.running ? this.scheduler.captureTails() : null;
    this.playing = false;
    if (this.finishTimer !== null) globalThis.clearInterval(this.finishTimer);
    this.finishTimer = null;
    this.scheduler?.stop();
    this.request += 1;
    for (const id of [...this.nodes.keys()]) this.stopNode(id);
    if (!this.disposed) this.onState('paused');
  }

  restart() {
    this.pause();
    this.offset = 0;
    this.sequencePhase = 0;
    this.sequenceTails = null;
  }

  forget(id) {
    if (this.previewId === id) this.stopPreview();
    this.stopNode(id);
    this.scheduler?.remove(id);
    this.pending.get(id)?.controller.abort();
    const buffer = this.buffers.get(id);
    if (buffer) this.memory -= buffer.length * buffer.numberOfChannels * 4;
    this.buffers.delete(id);
  }

  waveformFor(id, start, end, bins) {
    const buffer = this.buffers.get(id);
    return buffer ? waveformPeaks(buffer, start, end, bins) : [];
  }

  findSound(id, from, length) {
    const buffer = this.buffers.get(id);
    return buffer ? findSoundRegion(buffer, from, length) : null;
  }

  stopPreview() {
    this.previewRequest += 1;
    const pattern = this.patternPreview;
    this.patternPreview = null;
    if (pattern) {
      globalThis.clearInterval(pattern.timer);
      pattern.scheduler.stop();
      pattern.gain.disconnect();
    }
    const node = this.previewNode;
    this.previewNode = null;
    this.previewId = null;
    this.previewKind = null;
    if (!node) return;
    node.source.onended = null;
    try { node.source.stop(); } catch { /* Already ended. */ }
    node.source.disconnect();
    node.gain.disconnect();
  }

  previewPosition() {
    const pattern = this.patternPreview;
    if (pattern) {
      const elapsed = Math.max(0, this.context.currentTime - pattern.when);
      return { id: pattern.id, kind: 'pattern', position: elapsed, step: elapsed >= pattern.bar ? null : Math.floor(elapsed / pattern.seconds) % 16 };
    }
    const node = this.previewNode;
    if (!node) return this.previewId ? { id: this.previewId, kind: this.previewKind, loading: true } : null;
    const elapsed = Math.max(0, this.context.currentTime - node.when);
    return { id: node.id, kind: 'sample', position: node.start + (node.loop ? elapsed % node.length : Math.min(elapsed, node.length)) };
  }

  async previewPattern(track, file, bpm) {
    this.pause();
    const request = ++this.previewRequest;
    this.previewId = track.id;
    this.previewKind = 'pattern';
    const context = this.ensureContext();
    await context.resume();
    if (this.disposed || request !== this.previewRequest) return;
    const buffer = await this.load(track, file);
    if (this.disposed || request !== this.previewRequest) return;
    if (context.state !== 'running') throw new Error('Press Preview pattern again to enable audio.');
    const steps = track.sequence.steps;
    if (!steps.some(Boolean)) { this.stopPreview(); return; }
    const seconds = stepSeconds(bpm), bar = seconds * 16;
    const region = rhythmRegion(track, buffer.duration);
    const ring = rhythmMetadata(track).tailMode === 'ring';
    let duration = bar;
    for (let index = 0; index < 16; index += 1) if (steps[index]) {
      let gap = 1;
      while (gap < 16 && !steps[(index + gap) % 16]) gap += 1;
      duration = Math.max(duration, index * seconds + (ring ? region.length : Math.min(region.length, gap * seconds)));
    }
    const gain = context.createGain();
    gain.gain.value = .4;
    gain.connect(this.compressor);
    const scheduler = new StepScheduler({ context, output: gain, buffers: this.buffers,
      onError: () => { this.stopPreview(); this.onError(new Error('Pattern preview stopped. Try again.')); } });
    const when = context.currentTime + .03;
    const pattern = { id: track.id, gain, scheduler, when, seconds, bar, end: when + duration, timer: null };
    this.patternPreview = pattern;
    scheduler.start([{ ...track, volume: 100, muted: false, solo: false, sequence: { ...track.sequence, enabled: true } }], validBpm(bpm), when, 0, [], { maxSteps: 16 });
    if (this.patternPreview !== pattern) return;
    pattern.timer = globalThis.setInterval(() => { if (context.currentTime >= pattern.end) this.stopPreview(); }, 25);
    pattern.timer?.unref?.();
  }

  async preview(track, file, start, end, loop) {
    this.pause();
    const request = ++this.previewRequest;
    this.previewId = track.id;
    this.previewKind = 'sample';
    const context = this.ensureContext();
    await context.resume();
    if (this.disposed || request !== this.previewRequest) return;
    const buffer = await this.load(track, file);
    if (this.disposed || request !== this.previewRequest) return;
    if (context.state !== 'running') throw new Error('Press Preview again to enable audio.');
    const region = validateRegion(start, end, buffer.duration);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.loopStart = region.clipStart;
    source.loopEnd = region.clipEnd;
    gain.gain.value = 0.4;
    source.connect(gain).connect(this.compressor);
    const node = { id: track.id, source, gain, start: region.clipStart,
      length: region.clipEnd - region.clipStart, loop, when: context.currentTime + 0.03 };
    this.previewNode = node;
    source.onended = () => {
      if (this.previewNode !== node) return;
      this.previewNode = null;
      this.previewId = null;
      source.disconnect();
      gain.disconnect();
    };
    if (loop) source.start(node.when, region.clipStart);
    else source.start(node.when, region.clipStart, node.length);
  }

  dispose() {
    this.disposed = true;
    this.pause();
    for (const operation of this.pending.values()) operation.controller.abort();
    this.buffers.clear();
    this.memory = 0;
    if (this.context) {
      this.context.onstatechange = null;
      void this.context.close().catch(() => {});
    }
  }
}
