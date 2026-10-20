import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioEngine } from '../src/lib/audioEngine.js';
import { StepScheduler } from '../src/lib/stepScheduler.js';
import { DEFAULT_BPM, nextHitGap, patternStep, sequenceMetadata, stepSeconds, validBpm } from '../src/lib/sequencerState.js';
import { defaultMix, loadMix, serializeMix, validateMix } from '../src/lib/studioState.js';
import { changeProject, sameMix } from '../src/lib/savedMixes.js';

const steps = (...indices) => Array.from({ length: 16 }, (_, i) => indices.includes(i));
const track = (changes = {}) => ({ id: 'rain', catalogId: 'rain', name: 'Rain', volume: 60, muted: false, solo: false, loop: true,
  clipStart: 2, clipEnd: 3, sequence: { enabled: true, steps: steps(0, 4, 8, 12) }, ...changes });
const file = { arrayBuffer: async () => new ArrayBuffer(4) };
const audio = { duration: 10, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100).fill(.2) };
function setup() {
  const sources = [], gains = [], timers = new Set();
  const context = { currentTime: 0, state: 'running', destination: {},
    resume: async () => {}, close: async () => {}, decodeAudioData: async () => audio,
    createGain() { const automation = [];
      const param = { value: 1, automation, setTargetAtTime(value) { this.value = value; },
        setValueAtTime(...args) { automation.push(['set', ...args]); }, linearRampToValueAtTime(...args) { automation.push(['ramp', ...args]); } };
      const gain = { gain: param, disconnected: false, connect(target) { return target; }, disconnect() { this.disconnected = true; } }; gains.push(gain); return gain; },
    createDynamicsCompressor: () => ({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(target) { return target; } }),
    createBufferSource() { const source = { starts: [], stops: 0, disconnected: false,
      connect(target) { return target; }, disconnect() { this.disconnected = true; }, start(...args) { this.starts.push(args); }, stop() { this.stops += 1; } };
      sources.push(source); return source; },
  };
  const scheduler = new StepScheduler({ context, output: {}, buffers: new Map([['rain', audio], ['birds', audio]]),
    setTimer: (callback) => { timers.add(callback); return callback; }, clearTimer: (callback) => timers.delete(callback) });
  return { context, sources, gains, timers, scheduler };
}

test('BPM validation and grid math define sixteen sixteenth notes per 4/4 bar', () => {
  assert.equal(validBpm(40), 40); assert.equal(validBpm(240), 240);
  for (const value of [0, 39, 241, 100.5, '120', Infinity]) assert.equal(validBpm(value), DEFAULT_BPM);
  assert.equal(stepSeconds(120), .125);
  assert.equal(patternStep(0, 120), 0); assert.equal(patternStep(1.999, 120), 15); assert.equal(patternStep(2, 120), 0);
  assert.equal(nextHitGap(steps(0, 4), 4), 12); assert.equal(nextHitGap(steps(7), 7), 16);
});

test('invalid sequence metadata falls back to normal playback and valid disabled patterns retain their steps', () => {
  for (const sequence of [undefined, { enabled: true, steps: [true] }, { enabled: true, steps: Array(16).fill(1) }]) {
    assert.deepEqual(sequenceMetadata({ sequence }), { enabled: false, steps: Array(16).fill(false) });
  }
  const stored = { enabled: false, steps: steps(2, 8) };
  const copy = sequenceMetadata({ sequence: stored }); copy.steps[2] = false;
  assert.equal(stored.steps[2], true); assert.equal(copy.enabled, false);
});

test('old workspaces, named mixes and clips migrate to 100 BPM with no sequenced layers', () => {
  const legacy = { version: 1, master: 60, tracks: [{ id: 'rain', catalogId: 'rain', clipStart: 1, clipEnd: 2 }] };
  const mix = loadMix({ getItem: () => JSON.stringify(legacy) });
  assert.equal(mix.bpm, 100); assert.equal(mix.tracks[0].clipStart, 1);
  assert.equal(mix.tracks[0].sequence.enabled, false);
  assert.equal(sameMix(defaultMix(), validateMix(serializeMix(defaultMix()))), true);
});

test('saved patterns preserve tempo, ordered hits and clip offsets without copying audio', () => {
  const mix = { master: 40, bpm: 132, tracks: [track()] };
  const projects = changeProject([], 'save', { id: 'mix-a', name: 'Forest rhythm', mix });
  mix.tracks[0].sequence.steps[0] = false;
  const saved = validateMix(projects[0].mix);
  assert.equal(saved.bpm, 132); assert.equal(saved.tracks[0].sequence.steps[0], true);
  assert.equal(saved.tracks[0].clipStart, 2); assert.equal(saved.tracks[0].id, 'rain');
  assert.equal(sameMix(mix, saved), false);
  const normalized = validateMix(serializeMix(saved));assert.equal(sameMix(saved, normalized), true);
  normalized.bpm = 140;assert.equal(sameMix(saved, normalized), false);
});

test('scheduler starts selected source offsets on audio-clock grid and repeats the bar exactly', () => {
  const { context, scheduler, sources, timers } = setup();
  scheduler.start([track()], 120, .06, 0);
  assert.deepEqual(sources[0].starts[0], [.06, 2, .5]);
  for (let beat = 1; beat <= 4; beat += 1) { context.currentTime = beat * .5; scheduler.tick(); }
  assert.deepEqual(sources.map((source) => source.starts[0][0]), [.06, .56, 1.06, 1.56, 2.06]);
  assert.equal(sources.every((source) => source.loop === false), true);
  scheduler.stop();assert.equal(timers.size, 0);
});

test('all-active rows retrigger monophonically and short clips stop at their own selected end', () => {
  const { context, scheduler, sources } = setup();
  scheduler.start([track({ sequence: { enabled: true, steps: Array(16).fill(true) } })], 120, .06, 0);
  context.currentTime = .1;scheduler.tick();
  assert.equal(sources[0].starts[0][2], .125);assert.equal(sources[1].starts[0][2], .125);
  scheduler.stop();
  scheduler.start([track({ clipEnd: 2.05 })], 120, .16, 0);
  assert.ok(Math.abs(sources.at(-1).starts[0][2] - .05) < .000001);
  scheduler.stop();
});

test('late scheduler callbacks skip old steps instead of bursting accumulated notes', () => {
  const { context, scheduler, sources } = setup();
  scheduler.start([track({ sequence: { enabled: true, steps: Array(16).fill(true) } })], 240, .06, 0);
  context.currentTime = 8.01;scheduler.tick();
  const resumed = sources.slice(1).flatMap((source) => source.starts);
  assert.ok(resumed.length <= 2);assert.ok(resumed.every(([when]) => when >= 8.01 && when <= 8.13));
  scheduler.stop();
});

test('resume restores a cropped hit tail and schedules upcoming steps on the same phase', () => {
  const { context, scheduler, sources } = setup();
  context.currentTime = 10;
  scheduler.start([track()], 120, 9.86, .2);
  assert.deepEqual(sources[0].starts[0].slice(0, 2), [10.059999999999999, 2.2]);
  assert.ok(Math.abs(sources[0].starts[0][2] - .3) < 1e-8);
  context.currentTime = 10.3;scheduler.tick();
  assert.equal(sources[1].starts[0][0], 10.36);
  scheduler.stop();
});

test('volume and solo update row gains without restarting voices or moving the grid', () => {
  const { scheduler, sources } = setup();
  const rain = track(), birds = track({ id: 'birds', name: 'Birds', solo: false });
  scheduler.start([rain, birds], 100, .06, 0);
  const count = sources.length;
  scheduler.setTracks([{ ...rain, volume: 80, solo: true }, birds]);
  assert.equal(scheduler.channels.get('rain').gain.value, .8);assert.equal(scheduler.channels.get('birds').gain.value, 0);
  assert.equal(sources.length, count);
  scheduler.setTracks([{ ...rain, muted: true, solo: true }, birds]);
  assert.equal(scheduler.channels.get('rain').gain.value, 0);
  scheduler.stop();
});

test('stopping or removing a sample cancels scheduled hits and disconnects channels', () => {
  const { scheduler, sources, timers } = setup();
  scheduler.start([track(), track({ id: 'birds' })], 100, .06, 0);
  const channel = scheduler.channels.get('rain');
  scheduler.remove('rain');assert.equal(sources[0].stops, 1);assert.equal(channel.disconnected, true);
  const oldEnd = sources[1].onended;
  scheduler.stop();oldEnd();assert.equal(sources[1].stops, 1);assert.equal(scheduler.voices.size, 0);assert.equal(timers.size, 0);
  scheduler.tick();assert.equal(sources.length, 2);
});

test('audio engine combines continuous stems and sequenced samples without double-playing a row', async () => {
  const { context, sources } = setup();
  const engine = new AudioEngine({ createContext: () => context });
  const rain = track(), birds = track({ id: 'birds', sequence: undefined, loop: true });
  await engine.play([rain, birds], { rain: file, birds: file }, 70, 120);
  assert.equal(engine.nodes.size, 1);assert.equal(engine.nodes.has('rain'), false);assert.equal(engine.scheduler.voices.size, 1);
  assert.equal(sources.length, 2);assert.equal(sources[0].starts[0][0], sources[1].starts[0][0]);
  context.currentTime = .31;assert.equal(engine.currentStep(), 2);
  engine.pause();assert.equal(engine.scheduler.voices.size, 0);assert.equal(engine.scheduler.timer, null);
  await engine.play([rain, birds], { rain: file, birds: file }, 70, 120);
  assert.equal(engine.playing, true);assert.ok(sources.at(-1).starts[0][1] > 2);
  engine.dispose();assert.equal(engine.scheduler.timer, null);
});

test('empty patterns remain silent with a running grid and ending ambience does not end the pattern', async () => {
  const { context, sources } = setup();
  const engine = new AudioEngine({ createContext: () => context });
  const rain = track({ sequence: { enabled: true, steps: steps() } });
  const birds = track({ id: 'birds', sequence: undefined, loop: false });
  await engine.play([rain, birds], { rain: file, birds: file }, 70, 120);
  assert.equal(sources.length, 1);sources[0].onended();assert.equal(engine.playing, true);
  engine.setTracks([rain]);assert.equal(engine.playing, true);
  engine.setTracks([]);assert.equal(engine.playing, false);assert.equal(engine.scheduler.timer, null);
  engine.dispose();
});

test('tempo queues at the next bar while restart, preview and disposal stop voices', async () => {
  const { context } = setup();
  const engine = new AudioEngine({ createContext: () => context });
  await engine.play([track()], { rain: file }, 70, 120);
  context.currentTime = .3;engine.setBpm(140);
  assert.equal(engine.playing, true);assert.equal(engine.position(), .24);
  assert.equal(engine.scheduler.tempoChange.bpm, 140);
  assert.equal(engine.scheduler.tempoChange.when, 2.06);
  await engine.preview(track(), file, 2, 3, false);
  assert.equal(engine.scheduler.timer, null);assert.equal(engine.scheduler.voices.size, 0);assert.ok(engine.previewNode);
  engine.restart();assert.equal(engine.previewNode, null);assert.equal(engine.position(), 0);
  engine.dispose();assert.equal(engine.disposed, true);
});

test('live steps cancel queued hits and preserve continuous playback and transport', async () => {
  const { context, sources } = setup();
  const engine = new AudioEngine({ createContext: () => context });
  const rain = track({ sequence: { enabled: true, steps: steps(0, 1) } });
  const birds = track({ id: 'birds', sequence: undefined });
  await engine.play([rain, birds], { rain: file, birds: file }, 70, 120);
  const ambience = engine.nodes.get('birds').source;
  context.currentTime = .1; engine.scheduler.tick();
  const queued = sources.find((source) => source.starts[0][0] === .185);
  assert.ok(queued);
  const edited = { ...rain, sequence: { enabled: true, steps: steps(0, 2) } };
  engine.setTracks([edited, birds]);
  assert.equal(queued.stops, 1);
  assert.equal(engine.nodes.get('birds').source, ambience);
  assert.equal(ambience.stops, 0);assert.equal(engine.playing, true);assert.equal(engine.anchor, .06);
  context.currentTime = .2;engine.scheduler.tick();
  assert.ok(sources.some((source) => Math.abs(source.starts[0][0] - .31) < 1e-8 && !source.stops));
  engine.dispose();
});

test('tempo boundary replaces queued hits, keeps the grid aligned and can be superseded', () => {
  const { context, scheduler, sources } = setup();
  scheduler.start([track({ sequence: { enabled: true, steps: Array(16).fill(true) } })], 120, .06, 0);
  context.currentTime = 1.96;scheduler.tick();
  const oldBoundary = sources.find((source) => Math.abs(source.starts[0][0] - 2.06) < 1e-8);
  assert.ok(oldBoundary);
  scheduler.setBpm(60);
  assert.equal(oldBoundary.stops, 1);
  scheduler.setBpm(240);
  assert.equal(scheduler.tempoChange.when, 2.06);
  assert.equal(scheduler.tempoChange.bpm, 240);
  context.currentTime = 2.07;scheduler.tick();
  assert.equal(scheduler.bpm, 240);assert.equal(scheduler.tempoChange, null);
  assert.equal(Math.floor(scheduler.indexAt(2.07)) % 16, 0);
  const after = sources.filter((source) => !source.stops && source.starts[0][0] > 2.06);
  assert.ok(after.some((source) => Math.abs(source.starts[0][0] - 2.1225) < 1e-8));
  assert.equal(sources.filter((source) => !source.stops && Math.abs(source.starts[0][0] - 2.06) < 1e-8).length, 1);
  scheduler.stop();
});

test('returning to the current tempo cancels the pending boundary change', () => {
  const { context, scheduler } = setup();
  scheduler.start([track()], 120, .06, 0);
  context.currentTime = .3;scheduler.setBpm(60);scheduler.setBpm(120);
  assert.equal(scheduler.tempoChange, null);
  context.currentTime = 2.1;scheduler.tick();assert.equal(scheduler.bpm, 120);
  scheduler.stop();
});

test('live rhythm mode changes create and release channels without duplicate normal audio', async () => {
  const { context } = setup();
  const engine = new AudioEngine({ createContext: () => context });
  const normal = track({ sequence: undefined });
  await engine.play([normal], { rain: file }, 70, 120);
  const original = engine.nodes.get('rain').source;
  context.currentTime = .2;engine.setTracks([track()]);
  assert.equal(original.stops, 1);assert.equal(engine.nodes.size, 0);
  assert.equal(engine.scheduler.running, true);assert.ok(engine.scheduler.channels.has('rain'));
  engine.setTracks([normal]);
  assert.equal(engine.scheduler.running, false);assert.equal(engine.scheduler.voices.size, 0);
  assert.equal(engine.nodes.size, 1);assert.equal(engine.playing, true);
  engine.dispose();
});

test('pause after a tempo transition preserves rhythmic phase while ambience retains its timeline', async () => {
  const { context } = setup();
  const engine = new AudioEngine({ createContext: () => context });
  await engine.play([track()], { rain: file }, 70, 120);
  context.currentTime = .3;engine.setBpm(60);
  context.currentTime = 2.56;engine.scheduler.tick();
  assert.equal(engine.currentStep(), 2);
  engine.pause();assert.equal(engine.sequencePhase, 18);
  context.currentTime = 10;
  await engine.play([track()], { rain: file }, 70, 60);
  context.currentTime = 10.06;assert.equal(engine.currentStep(), 2);
  engine.dispose();
});

test('resume preserves sample offset for a tail that began before the tempo boundary', async () => {
  const { context, sources } = setup();
  const engine = new AudioEngine({ createContext: () => context });
  const rain = track({ clipEnd: 7, sequence: { enabled: true, steps: steps(14) } });
  await engine.play([rain], { rain: file }, 70, 120);
  context.currentTime = 1.8;engine.scheduler.tick();
  context.currentTime = 1.9;engine.setBpm(60);
  context.currentTime = 2.16;engine.scheduler.tick();engine.pause();
  assert.ok(Math.abs(engine.sequenceTails[0].elapsed - .35) < 1e-8);
  context.currentTime = 10;
  await engine.play([rain], { rain: file }, 70, 60);
  assert.ok(Math.abs(sources.at(-1).starts[0][1] - 2.35) < 1e-8);
  engine.dispose();
});

test('a live edit scheduling failure pauses and releases every queued voice', async () => {
  const { context } = setup();let message = '';
  const engine = new AudioEngine({ createContext: () => context, onError: (error) => { message = error.message; } });
  await engine.play([track()], { rain: file }, 70, 120);
  context.currentTime = .1;
  context.createBufferSource = () => { throw new Error('Audio graph failed'); };
  engine.setTracks([track({ sequence: { enabled: true, steps: steps(0, 1) } })]);
  assert.equal(engine.playing, false);assert.equal(engine.scheduler.voices.size, 0);
  assert.equal(engine.scheduler.timer, null);assert.match(message, /Press Play/);
  engine.dispose();
});

test('canceling a pending pattern decode cannot start scheduler or sound later', async () => {
  const { context, sources } = setup();
  let finish;
  context.decodeAudioData = () => new Promise((resolve) => { finish = resolve; });
  const engine = new AudioEngine({ createContext: () => context });
  const pending = engine.play([track()], { rain: file }, 70, 120);
  await new Promise((resolve) => queueMicrotask(resolve));engine.pause();finish(audio);await pending;
  assert.equal(engine.playing, false);assert.equal(engine.scheduler, null);assert.equal(sources.length, 0);
  engine.dispose();
});

test('scheduler failure cancels its queue and pauses the engine with an actionable error', async () => {
  const { context } = setup();let message = '';
  const engine = new AudioEngine({ createContext: () => context, onError: (error) => { message = error.message; } });
  await engine.play([track()], { rain: file }, 70, 120);
  context.createBufferSource = () => { throw new Error('Audio graph failed'); };
  context.currentTime = .5;engine.scheduler.tick();
  assert.equal(engine.playing, false);assert.equal(engine.scheduler.voices.size, 0);assert.match(message, /Press Play/);
  engine.dispose();
});

test('sample envelopes soften both boundaries and clean up after natural completion', () => {
  const { scheduler, sources } = setup();scheduler.start([track()], 120, .06, 0);
  const voice = [...scheduler.voices][0];
  assert.deepEqual(voice.envelope.gain.automation[0], ['set', 0, .06]);
  assert.deepEqual(voice.envelope.gain.automation.at(-1), ['ramp', 0, .56]);
  sources[0].onended();assert.equal(scheduler.voices.size, 0);assert.equal(voice.envelope.disconnected, true);
  scheduler.stop();
});

test('default timer callbacks support browser receivers and are cleared on stop', () => {
  const { context } = setup();
  const originalSet = globalThis.setInterval, originalClear = globalThis.clearInterval;
  let active = false;
  try {
    globalThis.setInterval = function () { assert.equal(this, globalThis); active = true; return 77; };
    globalThis.clearInterval = function (timer) { assert.equal(this, globalThis); assert.equal(timer, 77); active = false; };
    const scheduler = new StepScheduler({ context, output: {}, buffers: new Map([['rain', audio]]) });
    scheduler.start([track()], 120, .06, 0);assert.equal(active, true);
    scheduler.stop();assert.equal(active, false);
  } finally { globalThis.setInterval = originalSet; globalThis.clearInterval = originalClear; }
});
