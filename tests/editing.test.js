import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enableRhythmTrack, rhythmMetadata, rhythmRegion, patternSummary, MAX_RING_VOICES } from '../src/lib/rhythmState.js';
import { boundSelection, moveSelection, sizedSelection, waveformPeaks, findSoundRegion } from '../src/lib/audioSelection.js';
import { editTimelineWindow } from '../src/lib/timelineEditing.js';
import { serializeMix, validateMix } from '../src/lib/studioState.js';
import { sameMix, changeProject } from '../src/lib/savedMixes.js';
import { StepScheduler } from '../src/lib/stepScheduler.js';
import { AudioEngine } from '../src/lib/audioEngine.js';
const steps = (...hits) => Array.from({ length: 16 }, (_, i) => hits.includes(i));
const track = (changes = {}) => ({ id: 'rain', catalogId: 'rain', name: 'Rain', role: 'nature', volume: 60, muted: false, solo: false, loop: true,
  clipStart: 6, clipEnd: 9, rhythm: { initialized: true, sampleStart: 1, sampleEnd: 5, tailMode: 'cut' }, sequence: { enabled: true, steps: steps(0, 4, 8, 12) }, ...changes });
const audio = (duration = 10) => ({ duration, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100).fill(.2) });
const file = { arrayBuffer: async () => new ArrayBuffer(4) };
function setup() {
 const sources = [], gains = [], timers = new Set();
 const context = { currentTime: 0, state: 'running', destination: {}, resume: async () => {}, close: async () => {}, decodeAudioData: async () => audio(),
  createGain() { const gain = { disconnected: false, gain: { value: 1, setTargetAtTime(value) { this.value = value; }, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect(target) { return target; }, disconnect() { this.disconnected = true; } }; gains.push(gain); return gain; },
  createDynamicsCompressor: () => ({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(target) { return target; } }),
  createBufferSource() { const source = { starts: [], stops: [], disconnected: false, connect(target) { return target; }, disconnect() { this.disconnected = true; }, start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); } }; sources.push(source); return source; },
 };
 const scheduler = new StepScheduler({ context, output: {}, buffers: new Map([['rain', audio()]]), setTimer: (fn) => { timers.add(fn); return fn; }, clearTimer: (fn) => timers.delete(fn) });
 return { context, sources, gains, timers, scheduler, engine: new AudioEngine({ createContext: () => context }) };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('first rhythm creation keeps the normal clip and preserves a sample selected before creation', () => {
 const normal = track({ rhythm: undefined, sequence: { enabled: false, steps: steps() } });
 const created = enableRhythmTrack(normal, 10);
 assert.equal(created.clipStart, 6);assert.equal(created.clipEnd, 9);assert.equal(created.loop, true);
 assert.equal(created.rhythm.sampleEnd, .18);assert.equal(created.sequence.steps.filter(Boolean).length, 4);
 const selected = enableRhythmTrack({ ...normal, rhythm: { sampleStart: 3, sampleEnd: 4 } }, 10);
 assert.equal(selected.rhythm.sampleStart, 3);assert.equal(selected.rhythm.sampleEnd, 4);
});
test('enable rhythm preserves a cleared pattern, its sample and deliberately muted layer', () => {
 const disabled = track({ muted: true, sequence: { enabled: false, steps: steps() } });
 const enabled = enableRhythmTrack(disabled, 10);
 assert.equal(enabled.sequence.enabled, true);assert.equal(enabled.sequence.steps.some(Boolean), false);
 assert.deepEqual(enabled.rhythm, disabled.rhythm);assert.equal(enabled.muted, true);
});
test('legacy single-region rhythm saves preserve their sample and migrate without inventing former clip bounds', () => {
 const old = track({ rhythm: undefined });
 assert.deepEqual(rhythmRegion(old, 10), { start: 6, end: 9, length: 3 });
 const saved = serializeMix({ master: 70, tracks: [old] });
 assert.equal(saved.tracks[0].clipStart, 6);assert.equal(saved.tracks[0].rhythm.sampleStart, 6);
 assert.equal(sameMix({ master: 70, tracks: [old] }, validateMix(saved)), true);
});
test('normal clip and rhythm sample remain independent through snapshots, reload and reset of one region', () => {
 const original = { master: 70, bpm: 120, tracks: [track()] };
 const saved = changeProject([], 'save', { id: 'mix-a', name: 'Independent', mix: original });
 const copy = validateMix(saved[0].mix);
 copy.tracks[0].clipStart = 0;copy.tracks[0].clipEnd = null;
 assert.deepEqual(rhythmRegion(copy.tracks[0], 10), { start: 1, end: 5, length: 4 });
 copy.tracks[0].rhythm.sampleStart = 0;copy.tracks[0].rhythm.sampleEnd = .5;
 assert.equal(saved[0].mix.tracks[0].rhythm.sampleStart, 1);assert.equal(saved[0].mix.tracks[0].clipStart, 6);
});
test('tail policy and initialized empty patterns are persisted and take part in dirty detection', () => {
 const original = { master: 70, tracks: [track({ sequence: { enabled: false, steps: steps() } })] };
 const copy = validateMix(serializeMix(original));assert.equal(copy.tracks[0].rhythm.initialized, true);
 copy.tracks[0].rhythm.tailMode = 'ring';assert.equal(sameMix(original, copy), false);
 assert.equal(rhythmMetadata({ rhythm: { tailMode: 'invalid' } }).tailMode, 'cut');
});
test('a four-second sample warns about half-second hits; ring mode retains the full sample', () => {
 const a = patternSummary(track(), 10, 120);assert.equal(a.cut, true);assert.equal(a.shortest, .5);
 const b = patternSummary(track({ rhythm: { ...track().rhythm, tailMode: 'ring' } }), 10, 120);assert.equal(b.cut, false);assert.equal(b.sample.length, 4);
});
test('waveform selection supports reversed drags, minimum sizes and moving without changing its length', () => {
 assert.deepEqual(boundSelection(5, 2, 10), { start: 2, end: 5 });
 assert.deepEqual(moveSelection(2, 5, -20, 10), { start: 0, end: 3 });
 assert.deepEqual(moveSelection(2, 5, 20, 10), { start: 7, end: 10 });
 close(boundSelection(10, 10, 10).end - boundSelection(10, 10, 10).start, .05);
 assert.deepEqual(sizedSelection(9.8, .5, 10), { start: 9.5, end: 10 });
});
test('zoom waveform uses samples from the visible region and detects sound in either stereo channel', () => {
 const left = new Float32Array(1000), right = new Float32Array(1000);right.fill(.5, 500, 600);
 const buffer = { duration: 10, length: 1000, numberOfChannels: 2, getChannelData: (i) => i ? right : left };
 assert.equal(Math.max(...waveformPeaks(buffer, 0, 4, 100)), 0);
 assert.equal(Math.max(...waveformPeaks(buffer, 5, 6, 100)), 1);
 const found = findSoundRegion(buffer, 0, .5);assert.ok(found.start >= 4.9 && found.start <= 5);close(found.end - found.start, .5);
 assert.equal(findSoundRegion({ ...buffer, getChannelData: () => left }, 0, .5), null);
});
test('timeline drags keep clip length, clamp at composition boundaries and snap to beat positions', () => {
 const window = { start: 2, end: 6, fadeIn: 1, fadeOut: 1 };
 assert.deepEqual(editTimelineWindow(window, 'move', 1.2, 10, .5), { ...window, start: 3, end: 7 });
 assert.deepEqual(editTimelineWindow(window, 'move', 100, 10, .5), { ...window, start: 6, end: 10 });
 const trimmed = editTimelineWindow(window, 'end', -3.5, 10, 0);close(trimmed.end, 2.5);close(trimmed.fadeIn + trimmed.fadeOut, .5);
 const fade = editTimelineWindow(window, 'fadeIn', 100, 10, 0);assert.equal(fade.fadeIn, 3);assert.equal(fade.fadeOut, 1);
});
test('ring policy plays the full sample while cut policy retriggers only the interval before the next hit', () => {
 const { scheduler, sources } = setup();scheduler.start([track()], 120, .06, 0);
 close(sources[0].starts[0][1], 1);close(sources[0].starts[0][2], .5);scheduler.stop();
 scheduler.start([track({ rhythm: { ...track().rhythm, tailMode: 'ring' } })], 120, .06, 0);
 close(sources.at(-1).starts[0][2], 4);scheduler.stop();
});
test('finite pattern audition schedules exactly one loop and rings tails after its final hit', async () => {
 const { context, engine, sources } = setup();
 await engine.previewPattern(track({ muted: true, rhythm: { ...track().rhythm, tailMode: 'ring' }, placement: { start: 9, end: 10 } }), file, 120);
 for (const time of [.5, 1, 1.5, 2, 3]) { context.currentTime = time;engine.patternPreview.scheduler.tick(); }
 assert.equal(sources.length, 4);assert.equal(sources.every((source) => source.starts[0][2] === 4), true);
 close(engine.patternPreview.end, 5.53);assert.equal(engine.patternPreview.gain.gain.value, .4);assert.equal(engine.playing, false);
 engine.dispose();assert.equal(engine.patternPreview, null);assert.equal(sources.every((source) => source.stops.length > 0), true);
});
test('pattern audition pauses and preserves the mix position, bypassing master, mute and arrangement', async () => {
 const { context, engine } = setup();
 await engine.play([track({ sequence: { enabled: false, steps: steps(0) } })], { rain: file }, 0, 120, { enabled: true, duration: 8 });
 context.currentTime = 1.06;await engine.previewPattern(track({ muted: true, placement: { start: 7, end: 8 } }), file, 120);
 close(engine.position(), 1);assert.equal(engine.nodes.size, 0);assert.equal(engine.previewPosition().kind, 'pattern');assert.equal(engine.patternPreview.scheduler.arrangement.enabled, false);
 engine.stopPreview();close(engine.position(), 1);assert.equal(engine.playing, false);engine.dispose();
});
test('canceling pattern loading or removing its layer prevents delayed audition sources', async () => {
 const { context, engine, sources } = setup();let finish;
 context.decodeAudioData = () => new Promise((resolve) => { finish = resolve; });
 const pending = engine.previewPattern(track(), file, 120);await new Promise((resolve) => queueMicrotask(resolve));
 assert.equal(engine.previewPosition().loading, true);engine.stopPreview();finish(audio());await pending;
 assert.equal(sources.length, 0);assert.equal(engine.patternPreview, null);
 await engine.previewPattern(track(), file, 120);engine.forget('rain');assert.equal(engine.patternPreview, null);engine.dispose();
});
test('ring tails remain bounded and resume restores multiple overlapping sample offsets', () => {
 const { context, scheduler, sources } = setup();const ring = track({ rhythm: { initialized: true, sampleStart: 0, sampleEnd: 10, tailMode: 'ring' }, sequence: { enabled: true, steps: Array(16).fill(true) } });
 scheduler.start([ring], 240, .06, 0);
 for (let i = 1; i < 48; i += 1) { context.currentTime = .06 + i / 16;scheduler.tick(); }
 const tails = scheduler.captureTails();assert.ok(tails.length <= MAX_RING_VOICES);assert.ok(tails.length > 1);
 const phase = scheduler.indexAt(context.currentTime), seconds = scheduler.seconds; scheduler.stop();
 const before = sources.length;scheduler.start([ring], 240, context.currentTime + .03 - phase * seconds, phase * seconds, tails);
 assert.ok(sources.length - before > 1);assert.ok(sources.slice(before).some((source) => source.starts[0][1] > 0));scheduler.stop();
});
test('ringing samples are still clipped at arrangement exit and are canceled by disposal', () => {
 const { scheduler, sources } = setup();scheduler.start([track({ rhythm: { ...track().rhythm, tailMode: 'ring' }, placement: { start: 0, end: 1, fadeIn: 0, fadeOut: 0 } })], 120, .06, 0, [], { arrangement: { enabled: true, duration: 2 }, timelineAnchor: .06 });
 close(sources[0].starts[0][2], 1);scheduler.stop();assert.equal(sources[0].disconnected, true);
});
test('a 55-second source in a 70-second arrangement loops only when explicitly enabled', async () => {
 for (const loop of [false, true]) {
  const { engine, sources } = setup();engine.buffers.set('rain', audio(55));
  await engine.play([track({ clipStart: 0, clipEnd: null, loop, sequence: { enabled: false, steps: steps() } })], {}, 75, 120, { enabled: true, duration: 70 });
  assert.equal(sources[0].loop, loop);close(sources[0].starts[0][2], loop ? 70 : 55);engine.dispose();
 }
});

test('queued tempo changes leave already ringing samples intact and replace only future hits', () => {
 const { scheduler, context, sources } = setup();const ring = track({ rhythm: { ...track().rhythm, tailMode: 'ring' } });
 scheduler.start([ring], 120, .06, 0);context.currentTime = .5;scheduler.tick();const first = sources[0];
 context.currentTime = .7;scheduler.setBpm(180);assert.equal(first.stops.length, 0);close(first.starts[0][2], 4);
 context.currentTime = 2.01;scheduler.tick();assert.ok(sources.some((source) => Math.abs(source.starts[0][0] - 2.06) < 1e-7));scheduler.stop();
});

test('pause and resume after a tempo change preserve every overlapping tail source offset', async () => {
 const { context, engine, sources } = setup();const ring = track({ rhythm: { ...track().rhythm, tailMode: 'ring' } });
 await engine.play([ring], { rain: file }, 75, 120);
 for (const time of [.5, 1, 1.5]) { context.currentTime = time;engine.scheduler.tick(); }
 engine.setBpm(180);context.currentTime = 2.01;engine.scheduler.tick();context.currentTime = 2.4;engine.scheduler.tick();engine.pause();
 const expected = engine.sequenceTails.map((tail) => 1 + tail.elapsed).sort((a, b) => a - b);assert.ok(expected.length > 1);
 const before = sources.length;await engine.play([ring], { rain: file }, 75, 180);
 const restored = sources.slice(before, before + expected.length).map((source) => source.starts[0][1]).sort((a, b) => a - b);
 expected.forEach((value, index) => close(restored[index], value));engine.dispose();
});

test('live placement changes reschedule only the affected normal source without resetting the mix clock', async () => {
 const { context, engine } = setup();const a = track({ sequence: { enabled: false, steps: steps() }, placement: { start: 0, end: 10, fadeIn: 0, fadeOut: 0 } });
 const b = { ...a, id: 'birds', name: 'Birds' };
 await engine.play([a, b], { rain: file, birds: file }, 75, 120, { enabled: true, duration: 10 });context.currentTime = 2.06;
 const untouched = engine.nodes.get('birds').source, old = engine.nodes.get('rain').source;
 engine.setTracks([{ ...a, placement: { start: 4, end: 8, fadeIn: 1, fadeOut: 1 } }, b]);
 assert.equal(engine.playing, true);close(engine.position(), 2);assert.equal(engine.nodes.get('birds').source, untouched);assert.equal(untouched.stops.length, 0);assert.equal(old.stops.length, 1);
 close(engine.nodes.get('rain').source.starts[0][0], 4.06);engine.dispose();
});

test('live rhythmic timing edits rebuild the affected window and gate future hits without moving the grid', () => {
 const { scheduler, context, sources } = setup();const a = track({ rhythm: { ...track().rhythm, tailMode: 'ring' }, placement: { start: 0, end: 10, fadeIn: 0, fadeOut: 0 } });
 scheduler.start([a], 120, .06, 0, [], { arrangement: { enabled: true, duration: 10 }, timelineAnchor: .06 });context.currentTime = .26;
 const old = sources[0], index = scheduler.indexAt(context.currentTime);
 scheduler.setTracks([{ ...a, placement: { start: 1, end: 2, fadeIn: .1, fadeOut: .1 } }]);
 assert.equal(scheduler.running, true);close(scheduler.indexAt(context.currentTime), index);assert.equal(old.disconnected, true);
 context.currentTime = .5;scheduler.tick();assert.equal(sources.length, 1);
 context.currentTime = 1;scheduler.tick();const next = sources.at(-1).starts[0];close(next[0], 1.06);close(next[2], 1);scheduler.stop();
});
