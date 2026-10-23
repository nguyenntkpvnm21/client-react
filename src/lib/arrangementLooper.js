import { placementMetadata } from './arrangementState.js';
import { isSequenced, validBpm } from './sequencerState.js';
import { audibleGain } from './studioState.js';
import { scheduleNormalTrack, releaseSource } from './audioGraph.js';
import { StepScheduler } from './stepScheduler.js';

// Pre-schedule each wrap on the audio clock; a timer never determines its onset.
export class ArrangementLooper {
  constructor({ context, output, buffers, onError, setTimer = (fn, ms) => globalThis.setInterval(fn, ms), clearTimer = (timer) => globalThis.clearInterval(timer) }) {
    Object.assign(this, { context, output, buffers, onError, setTimer, clearTimer });
    this.segments = [];this.running = false;this.timer = null;
  }
  start(tracks, bpm, arrangement, region, when, offset) {
    this.stop();this.tracks = tracks;this.nextBpm = validBpm(bpm);this.arrangement = arrangement;this.region = region;
    this.running = true;this.firstWhen = when;this.firstOffset = offset;
    this.makeSegment(when, offset);this.nextAt = when + region.end - offset;
    this.tick();
    if (this.running) { this.timer = this.setTimer(() => this.tick(), 25);this.timer?.unref?.(); }
  }
  makeSegment(when, offset) {
    const segment = { when, offset, end: when + this.region.end - offset, anchor: when - offset, bpm: this.nextBpm, nodes: new Map(), scheduler: null };
    // Register before scheduling, so failure cleanup also owns partially built nodes.
    this.segments.push(segment);
    for (const track of this.tracks.filter((item) => !isSequenced(item))) this.startNormal(segment, track, when, offset);
    const scheduler = new StepScheduler({ context: this.context, output: this.output, buffers: this.buffers, setTimer: this.setTimer, clearTimer: this.clearTimer,
      onError: (error) => this.fail(error) });
    segment.scheduler = scheduler;
    scheduler.start(this.tracks, segment.bpm, segment.anchor, offset, null, { arrangement: this.arrangement, timelineAnchor: segment.anchor, stopAt: this.region.end });
  }
  startNormal(segment, track, when, offset) {
    const buffer = this.buffers.get(track.id);if (!buffer) return;
    const node = scheduleNormalTrack({ context: this.context, output: this.output, track, tracks: this.tracks, buffer, when, offset, arrangement: this.arrangement, stopAt: this.region.end });
    if (node) {
      segment.nodes.set(track.id, node);
      node.source.onended = () => { if (segment.nodes.get(track.id) === node) { segment.nodes.delete(track.id);releaseSource(node, false); } };
    }
  }
  active() {
    const now = this.context.currentTime;
    return this.segments.find((segment) => segment.when <= now && segment.end > now) || this.segments[0];
  }
  position() {
    const segment = this.active();
    if (!segment) return this.region.start;
    return Math.max(segment.offset, Math.min(this.region.end, this.context.currentTime - segment.anchor));
  }
  tempoState() { const segment = this.active();return { active: segment?.bpm ?? this.nextBpm, pending: segment && segment.bpm !== this.nextBpm ? this.nextBpm : null }; }
  currentStep() {
    const segment = this.active();
    return segment?.scheduler && this.tracks.some(isSequenced) ? Math.floor(Math.max(0, segment.scheduler.indexAt(this.context.currentTime)) + 1e-8) % 16 : null;
  }
  tick() {
    if (!this.running) return;
    try {
      const now = this.context.currentTime;
      while (this.nextAt <= now + .15 && this.running) {
        if (this.nextAt < now - .01) {
          // Skip missed wraps instead of producing a burst after a stalled tab.
          const span = this.region.end - this.region.start;
          const missed = Math.floor((now - this.nextAt) / span);
          this.nextAt += missed * span;
          const offset = this.region.start + (now - this.nextAt);
          const when = now + .02;
          this.makeSegment(when, Math.min(this.region.end - .001, offset));
          this.nextAt = when + this.region.end - Math.min(this.region.end - .001, offset);
        } else {
          const when = this.nextAt;
          this.makeSegment(when, this.region.start);
          this.nextAt = when + this.region.end - this.region.start;
        }
      }
      for (const segment of [...this.segments]) if (segment.end <= now) this.removeSegment(segment);
    } catch (error) { this.fail(error); }
  }
  setBpm(bpm) {
    if (this.nextBpm === bpm) return;
    this.nextBpm = validBpm(bpm);
    // Rebuild future wraps at the new speed; the audible pass finishes unchanged.
    const now = this.context.currentTime;
    for (const segment of [...this.segments]) if (segment.when > now) { this.nextAt = Math.min(this.nextAt, segment.when);this.removeSegment(segment); }
    this.tick();
  }
  setTracks(tracks) {
    const previous = this.tracks;this.tracks = tracks;
    const now = this.context.currentTime;
    for (const segment of this.segments) {
      segment.scheduler.setTracks(tracks);
      for (const [id, node] of segment.nodes) {
        const next = tracks.find((track) => track.id === id && !isSequenced(track));
        const old = previous.find((track) => track.id === id);
        if (!next || JSON.stringify(placementMetadata(old?.placement)) !== JSON.stringify(placementMetadata(next.placement))) {
          releaseSource(node);segment.nodes.delete(id);
        } else { node.gain.gain.setTargetAtTime(audibleGain(next, tracks), now, .015);node.source.loop = next.loop; }
      }
      for (const track of tracks.filter((item) => !isSequenced(item))) if (!segment.nodes.has(track.id)) {
        const when = Math.max(segment.when, now + .015);
        this.startNormal(segment, track, when, when - segment.anchor);
      }
    }
  }
  remove(id) { this.setTracks(this.tracks.filter((track) => track.id !== id)); }
  removeSegment(segment) {
    segment.scheduler?.stop();
    for (const node of segment.nodes.values()) releaseSource(node);
    segment.nodes.clear();this.segments = this.segments.filter((item) => item !== segment);
  }
  fail(error) { this.stop();this.onError?.(error); }
  stop() {
    this.running = false;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    for (const segment of [...this.segments]) this.removeSegment(segment);
  }
}
