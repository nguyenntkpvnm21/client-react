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
  constructor({ createContext, onState = () => {}, onTrack = () => {} } = {}) {
    this.createContext = createContext || (() => new (window.AudioContext || window.webkitAudioContext)());
    this.onState = onState;
    this.onTrack = onTrack;
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
  }

  ensureContext() {
    if (this.disposed) throw new Error('This audio workspace was closed. Reload to continue.');
    if (!this.context) {
      this.context = this.createContext();
      this.masterNode = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -3;
      compressor.knee.value = 3;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      this.masterNode.connect(compressor).connect(this.context.destination);
      this.masterNode.gain.value = this.master / 100;
      this.context.onstatechange = () => {
        if (this.playing && this.context.state !== 'running') this.pause();
      };
    }
    return this.context;
  }

  position() {
    return this.playing ? Math.max(0, this.context.currentTime - this.anchor) : this.offset;
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
  }

  startTrack(track, when, offset) {
    const buffer = this.buffers.get(track.id);
    if (!buffer || (!track.loop && offset >= buffer.duration)) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = track.loop;
    gain.gain.value = audibleGain(track, this.tracks);
    source.connect(gain).connect(this.masterNode);
    const node = { source, gain };
    this.nodes.set(track.id, node);
    source.onended = () => {
      if (this.nodes.get(track.id) !== node) return;
      this.nodes.delete(track.id);
      source.disconnect();
      gain.disconnect();
      if (this.playing && this.nodes.size === 0) this.pause();
    };
    source.start(when, track.loop ? offset % buffer.duration : offset);
  }

  setTracks(tracks) {
    this.tracks = tracks;
    for (const id of this.nodes.keys()) if (!tracks.some((track) => track.id === id)) this.stopNode(id);
    for (const track of tracks) {
      const node = this.nodes.get(track.id);
      if (node) {
        node.source.loop = track.loop;
        node.gain.gain.setTargetAtTime(audibleGain(track, tracks), this.context.currentTime, 0.015);
      } else if (this.playing) {
        this.startTrack(track, this.context.currentTime + 0.03, this.position() + 0.03);
      }
    }
    if (this.playing && this.nodes.size === 0) this.pause();
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

  async play(tracks, files, master) {
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
      if (!this.tracks.some((track) => track.loop) && this.tracks.every((track) => this.offset >= this.buffers.get(track.id)?.duration)) this.offset = 0;
      const when = context.currentTime + 0.06;
      this.anchor = when - this.offset;
      this.playing = true;
      for (const track of this.tracks) this.startTrack(track, when, this.offset);
      this.onState('playing');
    } catch (error) {
      if (this.disposed || request !== this.request) return;
      this.pause();
      throw error;
    }
  }

  pause() {
    this.offset = this.position();
    this.playing = false;
    this.request += 1;
    for (const id of [...this.nodes.keys()]) this.stopNode(id);
    if (!this.disposed) this.onState('paused');
  }

  restart() {
    this.pause();
    this.offset = 0;
  }

  forget(id) {
    this.stopNode(id);
    this.pending.get(id)?.controller.abort();
    const buffer = this.buffers.get(id);
    if (buffer) this.memory -= buffer.length * buffer.numberOfChannels * 4;
    this.buffers.delete(id);
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
