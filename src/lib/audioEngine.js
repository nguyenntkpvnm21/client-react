import { ArrangementLooper } from './arrangementLooper.js';
import { validateLoopRegion } from './loopRegion.js';
import { createMasterGraph, releaseSource, scheduleNormalTrack } from './audioGraph.js';
import { findSoundRegion, waveformPeaks } from './audioSelection.js';
import { rhythmMetadata, rhythmRegion } from './rhythmState.js';
import { arrangementMetadata, placementMetadata } from './arrangementState.js';
import { StepScheduler } from './stepScheduler.js';
import { DEFAULT_BPM, isSequenced, validBpm, stepSeconds } from './sequencerState.js';
import { clipRegion, validateRegion } from './clipRegion.js';
import { audibleGain } from './studioState.js';

const MEMORY_LIMIT = 512 * 1024 * 1024;

function auditionTrack(track) { return { ...track, volume: 100, muted: false, solo: false, sequence: { ...track.sequence, enabled: true } }; }
function auditionDuration(track, buffer, bpm) {
  const seconds = stepSeconds(bpm), bar = seconds * 16;
  const steps = track.sequence.steps;
  const region = rhythmRegion(track, buffer.duration);
  let duration = bar;
  for (let index = 0; index < 16; index += 1) if (steps[index]) {
    let gap = 1;
    while (gap < 16 && !steps[(index + gap) % 16]) gap += 1;
    duration = Math.max(duration, index * seconds + (rhythmMetadata(track).tailMode === 'ring' ? region.length : Math.min(region.length, gap * seconds)));
  }
  return duration;
}

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
    this.looper = null;
    this.loopRegion = { start: 0, end: 4, enabled: false };
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
      const graph = createMasterGraph(this.context, this.master);
      this.masterNode = graph.master;this.compressor = graph.compressor;
      this.context.onstatechange = () => {
        if (this.context.state !== 'running') { if (this.playing) this.pause(); else this.stopPreview(); }
      };
    }
    return this.context;
  }

  position() {
    return this.playing && this.looper ? this.looper.position() : this.playing ? Math.max(0, this.context.currentTime - this.anchor) : this.offset;
  }

  isSequencing() { return this.tracks.some(isSequenced); }

  currentStep() { if (this.playing && this.looper) return this.looper.currentStep();return this.playing && this.scheduler?.running ? Math.floor(Math.max(0, this.scheduler.indexAt(this.context.currentTime)) + 1e-8) % 16 : null; }

  tempoState() {
    if (this.playing && this.looper) return this.looper.tempoState();
    const change = this.scheduler?.running ? this.scheduler.tempoChange : null;
    return { active: this.scheduler?.running ? (change && this.context.currentTime >= change.when ? change.bpm : this.scheduler.bpm) : this.bpm,
      pending: change && this.context.currentTime < change.when ? change.bpm : null };
  }

  setBpm(value) {
    const next = validBpm(value);
    if (next === this.bpm) return;
    this.bpm = next;
    if (this.looper) this.looper.setBpm(next);else this.scheduler?.setBpm(next);
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
    if (this.looper || !this.playing || !this.arrangement.enabled || this.position() < this.arrangement.duration) return;
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

  setLoopRegion(value) {
    const next = value.enabled ? validateLoopRegion(value, this.arrangement.duration) : { ...value, enabled: false };
    if (next.enabled || this.loopRegion.enabled) this.pause();
    this.loopRegion = next;
  }

  stopNode(id) {
    const node = this.nodes.get(id);if (!node) return;
    this.nodes.delete(id);releaseSource(node);
  }

  startTrack(track, when, offset) {
    if (isSequenced(track)) return;
    const buffer = this.buffers.get(track.id);if (!buffer) return;
    const node = scheduleNormalTrack({ context: this.context, output: this.masterNode, track, tracks: this.tracks, buffer, when, offset, arrangement: this.arrangement });
    if (!node) return;
    this.nodes.set(track.id, node);
    node.source.onended = () => {
      if (this.nodes.get(track.id) !== node) return;
      this.nodes.delete(track.id);releaseSource(node, false);this.maybeFinish();
    };
  }

  setTracks(tracks) {
    if (this.playing && this.looper) { this.tracks = tracks;this.looper.setTracks(tracks);return; }
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
    if (this.patternPreview) {
      const pattern = this.patternPreview;
      const track = tracks.find((item) => item.id === pattern.id);
      if (!track) this.stopPreview();
      else {
        pattern.end = pattern.when + auditionDuration(track, this.buffers.get(track.id), pattern.bpm);
        pattern.scheduler.setTracks([auditionTrack(track)]);
      }
    }
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
      if (this.arrangement.enabled && this.loopRegion.enabled) {
        const region = validateLoopRegion(this.loopRegion, this.arrangement.duration);
        if (this.offset < region.start || this.offset >= region.end) this.offset = region.start;
        this.playing = true;
        this.looper = new ArrangementLooper({ context, output: this.masterNode, buffers: this.buffers,
          onError: () => { this.pause();this.onError(new Error('Section playback stopped. Press Play loop to try again.')); } });
        this.looper.start(this.tracks, this.bpm, this.arrangement, region, when, this.offset);
        if (this.playing) this.onState('playing');
        return;
      }
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
    this.looper?.stop();this.looper = null;
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
    this.offset = this.arrangement.enabled && this.loopRegion.enabled ? this.loopRegion.start : 0;
    this.sequencePhase = 0;
    this.sequenceTails = null;
  }

  seek(value) {
    if (!Number.isFinite(value)) throw new Error('Choose a valid playback position in seconds.');
    this.pause(); // Cancels old decode requests, queued hits and completion timers.
    this.offset = Math.max(0, Math.min(value, this.arrangement.enabled ? this.arrangement.duration : Infinity));
    this.sequencePhase = null;
    this.sequenceTails = null;
    if (this.arrangement.enabled && this.offset === this.arrangement.duration) this.onState('finished');
    return this.offset;
  }

  forget(id) {
    if (this.previewId === id) this.stopPreview();
    this.stopNode(id);
    this.scheduler?.remove(id);
    this.looper?.remove(id);
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
    const duration = auditionDuration(track, buffer, bpm);
    const gain = context.createGain();
    gain.gain.value = .4;
    gain.connect(this.compressor);
    const scheduler = new StepScheduler({ context, output: gain, buffers: this.buffers,
      onError: () => { this.stopPreview(); this.onError(new Error('Pattern preview stopped. Try again.')); } });
    const when = context.currentTime + .03;
    const pattern = { id: track.id, gain, scheduler, when, seconds, bar, bpm, end: when + duration, timer: null };
    this.patternPreview = pattern;
    scheduler.start([auditionTrack(track)], validBpm(bpm), when, 0, [], { maxSteps: 16 });
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
