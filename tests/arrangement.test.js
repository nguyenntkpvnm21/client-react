import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioEngine } from '../src/lib/audioEngine.js';
import { StepScheduler } from '../src/lib/stepScheduler.js';
import { arrangementMetadata, arrangementWindow, fitFades, placementMetadata, scheduleWindowEnvelope, validateLength, validatePlacement, windowGain } from '../src/lib/arrangementState.js';
import { defaultMix, loadMix, serializeMix, validateMix } from '../src/lib/studioState.js';
import { changeProject, sameMix } from '../src/lib/savedMixes.js';

const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-8, value + ' != ' + expected);
const config = { enabled: true, duration: 6 };
const steps = (...indices) => Array.from({ length: 16 }, (_, index) => indices.includes(index));
const track = (changes = {}) => ({ id: 'rain', catalogId: 'rain', name: 'Rain', volume: 60, muted: false, solo: false, loop: true,
  clipStart: 2, clipEnd: 5, placement: { start: 2, end: 5, fadeIn: .5, fadeOut: .5 }, ...changes });
const file = { arrayBuffer: async () => new ArrayBuffer(4) };
const audio = { duration: 10, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100).fill(.2) };
function setup() {
  const sources = [], gains = [];
  const context = { currentTime: 0, state: 'running', destination: {},
    resume: async () => {}, close: async () => {}, decodeAudioData: async () => audio,
    createGain() { const events = [];
      const gain = { gain: { value: 1, events, setTargetAtTime(value) { this.value = value; },
        setValueAtTime(...args) { events.push(['set', ...args]); }, linearRampToValueAtTime(...args) { events.push(['ramp', ...args]); } },
        connect(target) { return target; }, disconnect() { this.disconnected = true; } };gains.push(gain);return gain; },
    createDynamicsCompressor: () => ({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(target) { return target; } }),
    createBufferSource() { const source = { starts: [], stops: 0, connect(target) { return target; }, disconnect() { this.disconnected = true; }, start(...args) { this.starts.push(args); }, stop() { this.stops += 1; } };sources.push(source);return source; },
  };
  return { context, sources, gains, engine: new AudioEngine({ createContext: () => context }) };
}

// State, migration and musical timing are checked independently of the UI.
test('old workspaces and named mixes keep free playback with default neutral placements', () => {
  const legacy = { version: 1, master: 65, bpm: 120, tracks: [{ id: 'rain', catalogId: 'rain', clipStart: 1, clipEnd: 2 }] };
  const restored = loadMix({ getItem: () => JSON.stringify(legacy) });
  assert.deepEqual(restored.arrangement, { enabled: false, duration: 30 });
  assert.deepEqual(restored.tracks[0].placement, { start: 0, end: null, fadeIn: 0, fadeOut: 0 });
  assert.equal(restored.tracks[0].clipStart, 1);assert.equal(sameMix(defaultMix(), validateMix(serializeMix(defaultMix()))), true);
});

test('invalid persisted arrangement data falls back safely and effective fades fit short windows', () => {
  assert.deepEqual(arrangementMetadata({ enabled: true, duration: Infinity }), { enabled: false, duration: 30 });
  assert.equal(placementMetadata({ start: -2, end: -1, fadeIn: 'bad', fadeOut: -1 }).start, 0);
  assert.deepEqual(fitFades({ start: 1, end: 2, fadeIn: 2, fadeOut: 2 }), { start: 1, end: 2, fadeIn: .5, fadeOut: .5 });
  assert.deepEqual(arrangementWindow(track(), { enabled: false, duration: 6 }), { start: 0, end: Infinity, fadeIn: 0, fadeOut: 0 });
});

test('timing validation rejects blank, reversed, outside and overlapping fade values', () => {
  for (const value of [{ start: '', end: 3, fadeIn: 0, fadeOut: 0 }, { start: 3, end: 2, fadeIn: 0, fadeOut: 0 },
    { start: 0, end: 7, fadeIn: 0, fadeOut: 0 }, { start: 1, end: 1.02, fadeIn: 0, fadeOut: 0 },
    { start: 1, end: 2, fadeIn: .8, fadeOut: .8 }, { start: 1, end: 2, fadeIn: -1, fadeOut: 0 }]) assert.throws(() => validatePlacement(value, 6));
  assert.deepEqual(validatePlacement({ start: '1.25', end: '3', fadeIn: '.5', fadeOut: '0' }, 6), { start: 1.25, end: 3, fadeIn: .5, fadeOut: 0 });
});

test('shortening a composition cannot silently cut configured layer windows', () => {
  assert.throws(() => validateLength(4, [track()]), /Rain/);
  assert.throws(() => validateLength(1, [track({ placement: { start: 0, end: null, fadeIn: 1, fadeOut: 1 } })]), /Rain/);
  for (const value of ['', 0, 301, NaN]) assert.throws(() => validateLength(value, []));
  assert.equal(validateLength('3.5', [track({ placement: undefined })]), 3.5);
});

test('saved arrangements preserve timings, fades and source identity without sharing mutable placement objects', () => {
  const mix = { master: 50, bpm: 140, arrangement: config, tracks: [track()] };
  const project = changeProject([], 'save', { id: 'mix-a', name: 'Forest story', mix })[0];
  mix.tracks[0].placement.start = 3;
  const restored = validateMix(project.mix);assert.equal(restored.tracks[0].placement.start, 2);assert.equal(restored.arrangement.duration, 6);
  assert.equal(restored.tracks[0].id, 'rain');assert.equal(sameMix(mix, restored), false);
  restored.arrangement.enabled = false;assert.equal(sameMix(restored, validateMix(project.mix)), false);
});

test('fade automation resumes at the current gain and schedules only future boundaries', () => {
  const { gains, context } = setup();const param = context.createGain().gain;
  const window = { start: 2, end: 6, fadeIn: 1, fadeOut: 1 };
  close(windowGain(window, 2.5), .5);close(windowGain(window, 5.5), .5);assert.equal(windowGain(window, 1), 0);
  scheduleWindowEnvelope(param, 10, 2.5, window);
  assert.deepEqual(gains[0].gain.events, [['set', .5, 10], ['ramp', 1, 10.5], ['set', 1, 12.5], ['ramp', 0, 13.5]]);
});

test('normal loops enter at the selected source start and stop at the layer exit', async () => {
  const { engine, sources } = setup();await engine.play([track()], { rain: file }, 75, 120, config);
  assert.deepEqual(sources[0].starts[0], [2.06, 2, 3]);
  assert.equal(sources[0].loopStart, 2);assert.equal(sources[0].loopEnd, 5);assert.equal(sources[0].loop, true);
  const events = engine.nodes.get('rain').envelope.gain.events;
  assert.deepEqual(events[0], ['set', 0, 2.06]);close(events.at(-1)[2], 5.06);
  engine.dispose();
});

test('one-shots finish at the shorter source end and scale fades to the audible duration', async () => {
  const { engine, sources } = setup();const layer = track({ loop: false, clipEnd: 2.2, placement: { start: 1, end: 5, fadeIn: 1, fadeOut: 1 } });
  await engine.play([layer], { rain: file }, 75, 120, config);
  close(sources[0].starts[0][0], 1.06);close(sources[0].starts[0][2], .2);
  close(engine.nodes.get('rain').envelope.gain.events.at(-1)[2], 1.26);engine.dispose();
});

test('pause before a future entry cancels it and resume keeps the remaining delay', async () => {
  const { context, engine, sources } = setup();await engine.play([track()], { rain: file }, 75, 120, config);
  context.currentTime = 1.06;engine.pause();assert.equal(sources[0].stops, 1);assert.equal(engine.finishTimer, null);
  context.currentTime = 100;await engine.play([track()], { rain: file }, 75, 120, config);
  close(sources[1].starts[0][0], 101.06);assert.equal(sources[1].starts[0][1], 2);engine.dispose();
});

test('resume inside a placement uses its local source offset without restarting at entry', async () => {
  const { context, engine, sources } = setup();await engine.play([track()], { rain: file }, 75, 120, config);
  context.currentTime = 3.31;engine.pause();context.currentTime = 100;
  await engine.play([track()], { rain: file }, 75, 120, config);
  close(sources[1].starts[0][1], 3.25);close(sources[1].starts[0][2], 1.75);engine.dispose();
});

test('intro and outro silence do not stop the composition clock before its finite end', async () => {
  const { context, engine, sources } = setup();await engine.play([track()], { rain: file }, 75, 120, config);
  context.currentTime = 5.1;sources[0].onended();assert.equal(engine.playing, true);
  engine.checkFinish();assert.equal(engine.playing, true);
  context.currentTime = 6.08;engine.checkFinish();assert.equal(engine.playing, false);assert.equal(engine.position(), 6);assert.equal(engine.finishTimer, null);
  engine.dispose();
});

test('playing a completed arrangement restarts at zero with a fresh sequence phase', async () => {
  const { context, engine, sources } = setup();const states = [];engine.onState = (state) => states.push(state);
  await engine.play([track()], { rain: file }, 75, 120, config);context.currentTime = 6.1;engine.checkFinish();assert.equal(states.at(-1), 'finished');
  await engine.play([track()], { rain: file }, 75, 120, config);close(engine.position(), 0);close(sources[1].starts[0][0], 8.16);engine.dispose();
});

test('gain edits preserve scheduled starts and a separate arrangement fade envelope', async () => {
  const { engine, sources } = setup();await engine.play([track()], { rain: file }, 75, 120, config);
  const envelope = engine.nodes.get('rain').envelope;const events = [...envelope.gain.events];
  engine.setTracks([track({ volume: 90, solo: true })]);engine.setMaster(40);
  assert.equal(sources.length, 1);assert.equal(engine.nodes.get('rain').gain.gain.value, .9);assert.deepEqual(envelope.gain.events, events);
  engine.dispose();assert.equal(envelope.disconnected, true);
});

test('sequenced rows gate hits to their window without playing tails from before entry', () => {
  const { context, sources } = setup();const scheduler = new StepScheduler({ context, output: {}, buffers: new Map([['rain', audio]]), setTimer: () => 1, clearTimer: () => {} });
  const layer = track({ sequence: { enabled: true, steps: steps(0, 4, 8, 12) }, placement: { start: .25, end: 1.1, fadeIn: .1, fadeOut: .1 } });
  scheduler.start([layer], 120, .06, 0, null, { arrangement: { enabled: true, duration: 2 }, timelineAnchor: .06 });assert.equal(sources.length, 0);
  context.currentTime = .5;scheduler.tick();assert.equal(sources.length, 1);close(sources[0].starts[0][0], .56);
  context.currentTime = 1;scheduler.tick();close(sources[1].starts[0][2], .1);
  context.currentTime = 1.5;scheduler.tick();assert.equal(sources.length, 2);
  scheduler.stop();assert.equal(scheduler.windowGains.size, 0);
});

test('live tempo and pattern edits cannot extend a sample beyond the composition window', () => {
  const { context, sources } = setup();const scheduler = new StepScheduler({ context, output: {}, buffers: new Map([['rain', audio]]), setTimer: () => 1, clearTimer: () => {} });
  const layer = track({ sequence: { enabled: true, steps: steps(0, 1) }, placement: { start: 0, end: 2.2, fadeIn: 0, fadeOut: .1 } });
  scheduler.start([layer], 120, .06, 0, null, { arrangement: { enabled: true, duration: 3 }, timelineAnchor: .06 });
  context.currentTime = 1.5;scheduler.setBpm(60);context.currentTime = 2;scheduler.tick();
  scheduler.setTracks([{ ...layer, sequence: { enabled: true, steps: steps(0, 1, 2) } }]);
  context.currentTime = 2.5;scheduler.tick();
  assert.ok(sources.every((source) => source.starts.every(([when, , length]) => when + length <= 2.26 + 1e-8)));
  scheduler.stop();
});

test('preview, project replacement and disposal cancel future entries and completion timers', async () => {
  const { engine, sources } = setup();await engine.play([track()], { rain: file }, 75, 120, config);
  await engine.preview(track(), file, 2, 2.2, false);assert.equal(sources[0].stops, 1);assert.equal(engine.finishTimer, null);
  engine.restart();engine.setArrangement({ enabled: false, duration: 6 });await engine.play([track()], { rain: file }, 75, 120);
  assert.equal(engine.arrangement.enabled, false);assert.equal(sources.at(-1).starts[0][0], .06);
  engine.dispose();assert.equal(engine.finishTimer, null);assert.equal(engine.nodes.size, 0);
});

test('changing arrangement configuration while playing resets the old scheduled sources', async () => {
  const { engine, sources } = setup();await engine.play([track()], { rain: file }, 75, 120, config);
  engine.setArrangement({ enabled: true, duration: 7 });assert.equal(engine.playing, false);assert.equal(engine.position(), 0);assert.equal(sources[0].stops, 1);assert.equal(engine.finishTimer, null);
  engine.dispose();
});

test('canceling a delayed decode cannot schedule entries or a finish callback later', async () => {
  const { context, engine, sources } = setup();let finish;context.decodeAudioData = () => new Promise((resolve) => { finish = resolve; });
  const pending = engine.play([track()], { rain: file }, 75, 120, config);
  await new Promise((resolve) => queueMicrotask(resolve));engine.pause();finish(audio);await pending;
  assert.equal(sources.length, 0);assert.equal(engine.finishTimer, null);engine.dispose();
});

test('seeking cancels old sources and resumes the correct source offset and fade at the chosen time', async () => {
  const { context, engine, sources } = setup();
  await engine.play([track()], { rain: file }, 75, 120, config);
  context.currentTime = 1;const old = sources[0];
  close(engine.seek(4.75), 4.75);
  assert.equal(old.stops, 1);assert.equal(engine.finishTimer, null);
  assert.equal(engine.sequencePhase, null);assert.equal(engine.sequenceTails, null);
  await engine.play([track()], { rain: file }, 75, 120, config);
  close(sources.at(-1).starts[0][1], 4.75);close(sources.at(-1).starts[0][2], .25);
  close(engine.nodes.get('rain').envelope.gain.events[0][1], .5);
  assert.equal(engine.playing, true);engine.dispose();
});

test('seeking before entry preserves its remaining delay and seeking after exit keeps only the composition clock', async () => {
  const { engine, sources, context } = setup();
  engine.setArrangement(config);engine.seek(1);
  await engine.play([track()], { rain: file }, 75, 120, config);
  close(sources[0].starts[0][0], 1.06);close(sources[0].starts[0][1], 2);
  const count = sources.length;engine.seek(5.5);
  await engine.play([track()], { rain: file }, 75, 120, config);
  assert.equal(sources.length, count);assert.equal(engine.playing, true);
  // Hold the requested position during the scheduling lead-in, then advance.
  close(engine.position(), 5.5);context.currentTime = .06;close(engine.position(), 5.5);
  context.currentTime = .26;close(engine.position(), 5.7);engine.dispose();
});

test('seeking resets rhythmic phase to the target timeline and restores only the appropriate sample tail', async () => {
  const { context, engine } = setup();
  const row = track({ placement: { start: 0, end: 6, fadeIn: 0, fadeOut: 0 },
    rhythm: { initialized: true, sampleStart: 1, sampleEnd: 2, tailMode: 'cut' },
    sequence: { enabled: true, steps: steps(0, 4, 8, 12) } });
  await engine.play([row], { rain: file }, 75, 120, config);
  context.currentTime = 1;engine.seek(3.25);
  assert.equal(engine.scheduler.voices.size, 0);
  await engine.play([row], { rain: file }, 75, 120, config);
  context.currentTime += .06;assert.equal(engine.currentStep(), 10);
  const voice = [...engine.scheduler.voices][0];
  close(voice.source.starts[0][1], 1.25);close(voice.source.starts[0][2], .25);
  engine.dispose();
});

test('seeking while audio loads cancels the older request without duplicate playback', async () => {
  const { context, engine, sources } = setup();let finish;
  context.decodeAudioData = () => new Promise((resolve) => { finish = resolve; });
  const first = engine.play([track()], { rain: file }, 75, 120, config);
  await new Promise((resolve) => queueMicrotask(resolve));
  engine.seek(3);
  const latest = engine.play([track()], { rain: file }, 75, 120, config);
  finish(audio);await Promise.all([first, latest]);
  assert.equal(sources.length, 1);close(sources[0].starts[0][1], 3);assert.equal(engine.playing, true);
  engine.dispose();
});

test('seeking to the end stops cleanly; invalid positions do not interrupt playback', async () => {
  const { engine, sources } = setup();const states=[];engine.onState=(state)=>states.push(state);
  await engine.play([track()], { rain: file }, 75, 120, config);
  for (const value of [NaN, Infinity, '3']) assert.throws(() => engine.seek(value));
  assert.equal(engine.playing, true);assert.equal(sources[0].stops, 0);
  assert.equal(engine.seek(100), 6);assert.equal(engine.playing, false);assert.equal(states.at(-1), 'finished');
  assert.equal(engine.seek(-5), 0);assert.equal(engine.finishTimer, null);engine.dispose();
});

test('Solo, Mute and clearing solos change only routing without restarting arrangement sources or fades', async () => {
  const { engine, sources } = setup();const rain=track(), birds=track({id:'birds', name:'Birds'});
  await engine.play([rain,birds], {rain:file,birds:file}, 75, 120, config);
  const envelope=engine.nodes.get('rain').envelope;const events=[...envelope.gain.events];
  engine.setTracks([{...rain,solo:true},birds]);
  assert.equal(engine.nodes.get('rain').gain.gain.value,.6);assert.equal(engine.nodes.get('birds').gain.gain.value,0);
  engine.setTracks([{...rain,solo:true,muted:true},birds]);assert.equal(engine.nodes.get('rain').gain.gain.value,0);
  engine.setTracks([rain,birds]);assert.equal(engine.nodes.get('birds').gain.gain.value,.6);
  assert.equal(sources.length,2);assert.equal(sources.every((source)=>source.stops===0),true);
  assert.deepEqual(envelope.gain.events,events);engine.dispose();
});
