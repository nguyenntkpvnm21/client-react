import { clipRegion } from './clipRegion.js';
import { audibleGain } from './studioState.js';
import { isSequenced, nextHitGap, sequenceMetadata, stepSeconds, STEP_COUNT } from './sequencerState.js';

// Timers refill a short queue. The audio clock determines every audible onset.
export class StepScheduler {
  constructor({ context, output, buffers, setTimer = (callback, delay) => globalThis.setInterval(callback, delay), clearTimer = (timer) => globalThis.clearInterval(timer), onError = () => {} }) {
    Object.assign(this, { context, output, buffers, setTimer, clearTimer, onError });
    this.channels = new Map();
    this.voices = new Set();
    this.running = false;
    this.timer = null;
    this.tracks = [];
  }

  setTracks(tracks) {
    try { this.updateTracks(tracks); }
    catch (error) { this.stop(); this.onError(error); }
  }

  updateTracks(tracks) {
    const changed = tracks.filter((track) => {
      const previous = this.tracks.find((item) => item.id === track.id);
      return JSON.stringify(sequenceMetadata(previous)) !== JSON.stringify(sequenceMetadata(track));
    });
    this.tracks = tracks;
    for (const [id, channel] of this.channels) {
      const track = tracks.find((item) => item.id === id && isSequenced(item));
      if (!track) { this.remove(id); continue; }
      channel.gain.setTargetAtTime(audibleGain(track, tracks), this.context.currentTime, 0.015);
    }
    if (!this.running || !changed.length) return;
    const now = this.context.currentTime;
    // Cancel lookahead voices before rebuilding the queue with the edited pattern.
    for (const voice of [...this.voices]) if (voice.when >= now) this.release(voice);
    this.nextIndex = Math.max(0, Math.ceil(this.indexAt(now) - 1e-8));
    for (const track of changed.filter(isSequenced)) {
      if (!this.channels.has(track.id)) {
        const channel = this.context.createGain();
        channel.gain.value = audibleGain(track, tracks);
        channel.connect(this.output);
        this.channels.set(track.id, channel);
      }
      for (const voice of [...this.voices]) if (voice.id === track.id) {
        const elapsed = voice.elapsed + now - voice.when;
        this.release(voice);
        if (voice.end > now) this.hit(track, voice.index, now, elapsed);
      }
    }
    this.tick();
  }

  indexAt(time) {
    const change = this.tempoChange;
    return change && time >= change.when
      ? change.index + (time - change.when) / change.seconds
      : (time - this.anchor) / this.seconds;
  }

  timeAt(index) {
    const change = this.tempoChange;
    return change && index >= change.index
      ? change.when + (index - change.index) * change.seconds
      : this.anchor + index * this.seconds;
  }

  setBpm(bpm) {
    try { this.queueTempo(bpm); }
    catch (error) { this.stop(); this.onError(error); }
  }

  queueTempo(bpm) {
    if (!this.running) return;
    const now = this.context.currentTime;
    this.commitTempo(now);
    if (bpm === this.bpm && !this.tempoChange) return;
    const index = this.tempoChange?.index ?? Math.max(0, (Math.floor(this.indexAt(now) / STEP_COUNT) + 1) * STEP_COUNT);
    const when = this.timeAt(index);
    this.tempoChange = bpm === this.bpm ? null : { bpm, seconds: stepSeconds(bpm), index, when };
    for (const voice of [...this.voices]) if (voice.when >= when) this.release(voice);
    // Recalculate tails that cross the tempo boundary, including queued hits before it.
    for (const voice of [...this.voices]) {
      const track = this.tracks.find((item) => item.id === voice.id);
      const next = voice.index + nextHitGap(sequenceMetadata(track).steps, voice.index % STEP_COUNT);
      if (next < index || voice.end <= now) continue;
      this.release(voice);
      const start = Math.max(now, voice.when);
      this.hit(track, voice.index, start, voice.elapsed + start - voice.when);
    }
    this.nextIndex = Math.min(this.nextIndex, index);
    this.tick();
  }

  commitTempo(now) {
    const change = this.tempoChange;
    if (!change || now < change.when) return;
    this.anchor = change.when - change.index * change.seconds;
    this.seconds = change.seconds;
    this.bpm = change.bpm;
    this.tempoChange = null;
  }

  captureTails() {
    const now = this.context.currentTime;
    return [...this.voices].filter((voice) => voice.when <= now && voice.end > now)
      .map((voice) => ({ id: voice.id, index: voice.index, elapsed: voice.elapsed + now - voice.when }));
  }

  start(tracks, bpm, anchor, offset, tails = null) {
    this.stop();
    this.tracks = tracks;
    this.anchor = anchor;
    this.seconds = stepSeconds(bpm);
    this.bpm = bpm;
    this.tempoChange = null;
    this.nextIndex = Math.ceil(offset / this.seconds - 1e-8);
    this.running = true;
    for (const track of tracks.filter(isSequenced)) {
      const channel = this.context.createGain();
      channel.gain.value = audibleGain(track, tracks);
      channel.connect(this.output);
      this.channels.set(track.id, channel);
      // Restore the audible tail of the preceding hit when resuming between steps.
      const steps = sequenceMetadata(track).steps;
      if (tails !== null) {
        const tail = tails.find((item) => item.id === track.id && steps[item.index % STEP_COUNT]);
        if (tail) this.hit(track, tail.index, anchor + offset, tail.elapsed);
        continue;
      }
      for (let index = this.nextIndex - 1; index >= Math.max(0, this.nextIndex - STEP_COUNT); index -= 1) {
        if (steps[index % STEP_COUNT]) {
          this.hit(track, index, anchor + offset, offset - index * this.seconds);
          break;
        }
      }
    }
    this.tick();
    if (this.running) {
      this.timer = this.setTimer(() => this.tick(), 25);
      this.timer?.unref?.();
    }
  }

  hit(track, index, when, elapsed = 0) {
    const buffer = this.buffers.get(track.id);
    const channel = this.channels.get(track.id);
    if (!buffer || !channel) return;
    const region = clipRegion(track, buffer.duration);
    const steps = sequenceMetadata(track).steps;
    // One voice per row: a new hit cuts the previous sample instead of stacking it.
    const next = index + nextHitGap(steps, index % STEP_COUNT);
    const length = Math.min(region.length - elapsed, this.timeAt(next) - when);
    if (length <= 0.000001) return;
    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    source.buffer = buffer;
    source.loop = false;
    const fade = Math.min(0.003, length / 4);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(1, when + fade);
    envelope.gain.setValueAtTime(1, when + length - fade);
    envelope.gain.linearRampToValueAtTime(0, when + length);
    source.connect(envelope).connect(channel);
    const voice = { id: track.id, source, envelope, index, when, elapsed, end: when + length };
    this.voices.add(voice);
    source.onended = () => this.release(voice, false);
    source.start(when, region.start + elapsed, length);
  }

  tick() {
    if (!this.running) return;
    try {
      const now = this.context.currentTime;
      this.commitTempo(now);
      // Missed ticks are skipped, never emitted as a burst after a stalled tab.
      this.nextIndex = Math.max(this.nextIndex, Math.ceil(this.indexAt(now) - 1e-8));
      while (this.timeAt(this.nextIndex) <= now + 0.12) {
        const index = this.nextIndex++;
        const when = this.timeAt(index);
        for (const track of this.tracks) {
          const sequence = sequenceMetadata(track);
          if (sequence.enabled && sequence.steps[index % STEP_COUNT]) this.hit(track, index, when);
        }
      }
    } catch (error) {
      this.stop();
      this.onError(error);
    }
  }

  release(voice, stop = true) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    if (stop) { try { voice.source.stop(); } catch { /* A scheduled source may have ended. */ } }
    voice.source.disconnect();
    voice.envelope.disconnect();
  }

  remove(id) {
    for (const voice of [...this.voices]) if (voice.id === id) this.release(voice);
    this.channels.get(id)?.disconnect();
    this.channels.delete(id);
  }

  stop() {
    this.running = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    for (const voice of [...this.voices]) this.release(voice);
    for (const channel of this.channels.values()) channel.disconnect();
    this.channels.clear();
  }
}
