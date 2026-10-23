import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArrangementLooper } from '../src/lib/arrangementLooper.js';
import { AudioEngine } from '../src/lib/audioEngine.js';
import { editLoopRegion, initialLoopRegion, validateLoopRegion } from '../src/lib/loopRegion.js';
import { encodeWav, exportFilename, renderArrangement } from '../src/lib/renderArrangement.js';
import { serializeMix } from '../src/lib/studioState.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, actual + ' != ' + expected);
const steps = (...indices) => Array.from({ length: 16 }, (_, index) => indices.includes(index));
const track = (changes = {}) => ({ id: 'rain', catalogId: 'rain', name: 'Rain', volume: 60, muted: false, solo: false, loop: true,
  clipStart: 2, clipEnd: 5, placement: { start: 0, end: 6, fadeIn: 1, fadeOut: 1 }, ...changes });
const config = { enabled: true, duration: 6 }, region = { start: 2, end: 3, enabled: true };
const audio = { duration: 10, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100).fill(.2) };
function setup() {
  const sources = [], gains = [], timers = new Set();
  const context = { currentTime: 0, state: 'running', destination: {},
    resume: async () => {}, close: async () => {}, decodeAudioData: async () => audio,
    createGain() {
      const gain = { gain: { value: 1, events: [], setTargetAtTime(value) { this.value = value; },
        setValueAtTime(...args) { this.events.push(['set', ...args]); }, linearRampToValueAtTime(...args) { this.events.push(['ramp', ...args]); } },
      connect(target) { return target; }, disconnect() { this.disconnected = true; } };gains.push(gain);return gain;
    },
    createDynamicsCompressor: () => ({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(target) { return target; }, disconnect() {} }),
    createBufferSource() {
      const source = { starts: [], stops: [], connect(target) { return target; }, disconnect() { this.disconnected = true; }, start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); } };sources.push(source);return source;
    },
  };
  const looper = new ArrangementLooper({ context, output: {}, buffers: new Map([['rain', audio], ['birds', audio]]),
    setTimer: (callback) => { timers.add(callback);return callback; }, clearTimer: (callback) => timers.delete(callback) });
  const tick = (time) => { context.currentTime = time;for (const timer of [...timers]) timer(); };
  const engine = new AudioEngine({ createContext: () => context });
  return { context, sources, gains, timers, looper, tick, engine };
}

test('section bounds reject invalid input and drags preserve minimum size, length and beat snapping', () => {
  assert.deepEqual(initialLoopRegion(1), { start: 0, end: 1, enabled: false });
  for (const value of [{ start: '', end: 1 }, { start: -1, end: 1 }, { start: 1, end: 1.1 }, { start: 0, end: 7 }, { start: NaN, end: 2 }]) assert.throws(() => validateLoopRegion(value, 6));
  assert.deepEqual(validateLoopRegion({ start: '1.25', end: '3', enabled: true }, 6), { start: 1.25, end: 3, enabled: true });
  assert.deepEqual(editLoopRegion(region, 'move', 30, 6), { start: 5, end: 6, enabled: true });
  near(editLoopRegion(region, 'start', 10, 6).start, 2.75);
  near(editLoopRegion(region, 'end', -10, 6).end, 2.25);
  near(editLoopRegion(region, 'move', .31, 6, .5).start, 2.5);
});

test('wraps share the audio clock, preserve source offsets, cap the end and release old segments', () => {
  const { looper, sources, tick, timers } = setup();
  looper.start([track()], 120, config, region, .06, 2);
  assert.deepEqual(sources[0].starts[0], [.06, 4, 1]);
  tick(.92);near(sources[1].starts[0][0], 1.06);near(sources[1].starts[0][1], 4);near(sources[1].starts[0][2], 1);
  tick(1.08);near(looper.position(), 2.02);assert.equal(sources[0].disconnected, true);
  tick(1.95);near(sources[2].starts[0][0], 2.06);
  looper.stop();assert.equal(timers.size, 0);assert.ok(sources.every((source) => source.disconnected));
});

test('section audition retains arrangement gain at its original position and delayed layer entries', () => {
  const { looper, sources, gains } = setup();
  looper.start([track({ placement: { start: 2.5, end: 6, fadeIn: 2, fadeOut: 1 } })], 120, config, region, .06, 2);
  near(sources[0].starts[0][0], .56);near(sources[0].starts[0][1], 2);near(sources[0].starts[0][2], .5);
  // The placement fade still reaches full gain at 4.5 s, not at this section's end.
  assert.ok(gains.some((gain) => gain.gain.events.some(([kind, value, time]) => kind === 'ramp' && value === 1 && Math.abs(time - 2.56) < 1e-8)));
  looper.stop();
});

test('rhythm wraps restore only the correct preceding tail and do not schedule beyond the section', () => {
  const { looper, sources, tick } = setup();
  const layer = track({ sequence: { enabled: true, steps: steps(0, 4, 8, 12) }, rhythm: { initialized: true, sampleStart: 1, sampleEnd: 2, tailMode: 'cut' } });
  looper.start([layer], 120, config, { start: .2, end: .7, enabled: true }, .06, .2);
  assert.deepEqual(sources[0].starts[0], [.06, 1.2, .3]);
  tick(.25);near(sources[1].starts[0][0], .36);near(sources[1].starts[0][2], .2);
  tick(.45);near(sources[2].starts[0][0], .56);near(sources[2].starts[0][1], 1.2);near(sources[2].starts[0][2], .3);
  looper.stop();
});

test('live pattern edits cannot emit notes before a prescheduled wrap begins', () => {
  const { looper, sources, tick } = setup();
  const layer = track({ sequence: { enabled: true, steps: steps(0) }, rhythm: { initialized: true, sampleStart: 1, sampleEnd: 1.05 } });
  looper.start([layer], 120, config, { start: 2, end: 2.25, enabled: true }, .06, 2);
  tick(.2);const before = sources.length;
  looper.setTracks([{ ...layer, sequence: { enabled: true, steps: steps(0, 15) } }]);
  const future = looper.segments.find((segment) => segment.when > .2);
  assert.ok(future);
  for (const voice of future.scheduler.voices) assert.ok(voice.when >= future.when - 1e-8);
  assert.ok(sources.length >= before);looper.stop();
});

test('solo and mute update both current and queued wraps without changing their starts', () => {
  const { looper, sources, tick } = setup();
  const tracks = [track(), track({ id: 'birds', solo: false })];
  looper.start(tracks, 120, config, region, .06, 2);tick(.92);
  const starts = sources.map((source) => [...source.starts[0]]);
  looper.setTracks([{ ...tracks[0], solo: true }, tracks[1]]);
  assert.deepEqual(sources.map((source) => source.starts[0]), starts);
  for (const segment of looper.segments) { assert.equal(segment.nodes.get('rain').gain.gain.value, .6);assert.equal(segment.nodes.get('birds').gain.gain.value, 0); }
  looper.stop();
});

test('BPM changes apply at the next section boundary while the audible pass keeps its tempo', () => {
  const { looper, tick } = setup();looper.start([track()], 120, config, region, .06, 2);
  tick(.92);looper.setBpm(90);assert.deepEqual(looper.tempoState(), { active: 120, pending: 90 });
  tick(1.08);assert.deepEqual(looper.tempoState(), { active: 90, pending: null });looper.stop();
});

test('a late loop timer skips missed wraps rather than queuing a burst', () => {
  const { looper, sources, tick } = setup();looper.start([track()], 120, config, region, .06, 2);
  tick(20.2);assert.equal(sources.length, 2);assert.ok(sources[1].starts[0][0] >= 20.2);looper.stop();
});

test('engine loop pause, resume, restart and seek cancel every earlier audio generation', async () => {
  const { engine, sources, context } = setup();engine.setArrangement(config);engine.setLoopRegion(region);
  await engine.play([track()], { rain: { arrayBuffer: async () => new ArrayBuffer(4) } }, 75, 120, config);
  context.currentTime = .46;near(engine.position(), 2.4);engine.pause();assert.ok(sources.every((source) => source.disconnected));
  near(engine.position(), 2.4);await engine.play([track()], {}, 75, 120, config);
  near(sources.at(-1).starts[0][1], 4.4);engine.restart();near(engine.position(), 2);
  engine.setLoopRegion({ ...region, enabled: false });engine.seek(4);await engine.play([track()], {}, 75, 120, config);
  near(sources.at(-1).starts[0][1], 3);engine.dispose();assert.ok(sources.every((source) => source.disconnected));
});

test('session selection is not serialized into a saved mix', () => {
  const mix = { master: 75, bpm: 120, arrangement: config, tracks: [track()], loopSection: region };
  assert.equal(Object.hasOwn(serializeMix(mix), 'loopSection'), false);
});

test('WAV encoding writes correct stereo PCM headers, interleaves channels and clamps nonfinite samples', async () => {
  const buffer = { sampleRate: 44100, length: 4, numberOfChannels: 2, getChannelData: (channel) => channel ? new Float32Array([.5, -.5, NaN, 2]) : new Float32Array([-1, 1, 0, -2]) };
  const blob = await encodeWav(buffer), bytes = await blob.arrayBuffer(), view = new DataView(bytes);
  assert.equal(blob.type, 'audio/wav');assert.equal(bytes.byteLength, 60);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');assert.equal(view.getUint32(4, true), 52);
  assert.equal(view.getUint16(22, true), 2);assert.equal(view.getUint32(24, true), 44100);assert.equal(view.getUint16(34, true), 16);assert.equal(view.getUint32(40, true), 16);
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, 16384, 32767, -16384, 0, 0, -32768, 32767]);
});

test('WAV encoding honors cancellation between chunks and filenames remain download-safe', async () => {
  const controller = new AbortController();
  await assert.rejects(encodeWav({ sampleRate: 44100, length: 100000, numberOfChannels: 1, getChannelData: () => new Float32Array(100000) }, { signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' });
  assert.equal(exportFilename('My / rain.wav'), 'My - rain.wav');assert.equal(exportFilename('\u0000bad:name'), '-bad-name.wav');
});

async function offline(mix, options = {}) {
  const state = setup();let dimensions;
  state.context.startRendering = options.render || (async () => ({ sampleRate: 44100, length: 4, numberOfChannels: 2, getChannelData: () => new Float32Array(4) }));
  const blob = await renderArrangement({ mix, buffers: new Map(mix.tracks.map((layer) => [layer.id, audio])), ...options,
    createContext: (...args) => { dimensions = args;return state.context; } });
  return { ...state, blob, dimensions };
}

test('export renders the full arrangement from zero even in free mode with a session loop selected', async () => {
  const mix = { master: 50, bpm: 120, arrangement: { enabled: false, duration: 6 }, tracks: [track()], loopSection: region };
  const { sources, gains, dimensions } = await offline(mix);
  assert.deepEqual(dimensions, [2, 264600, 44100]);assert.deepEqual(sources[0].starts[0], [0, 2, 6]);assert.equal(gains[0].gain.value, .5);
  assert.ok(gains.some((gain) => gain.gain.events.some(([type, value, time]) => type === 'ramp' && value === 0 && time === 6)));
});

test('offline one-shots end at their selected source, while explicit loops reach Exit', async () => {
  const { sources } = await offline({ master: 75, bpm: 120, arrangement: config, tracks: [track({ loop: false }), track({ id: 'birds', loop: true })] });
  assert.deepEqual(sources[0].starts[0], [0, 2, 3]);assert.deepEqual(sources[1].starts[0], [0, 2, 6]);
});

test('offline rhythm uses its independent sample, exact grid and placement gating', async () => {
  const layer = track({ sequence: { enabled: true, steps: steps(0, 4, 8, 12) }, rhythm: { initialized: true, sampleStart: 7, sampleEnd: 8, tailMode: 'cut' }, placement: { start: 1, end: 2.3, fadeIn: 0, fadeOut: 0 } });
  const { sources } = await offline({ master: 75, bpm: 120, arrangement: config, tracks: [layer] });
  assert.deepEqual(sources.map((source) => source.starts[0][0]), [1, 1.5, 2]);
  for (const source of sources) near(source.starts[0][1], 7);
  near(sources.at(-1).starts[0][2], .3);
});

test('offline rendering honors Solo, explicit Mute and master routing', async () => {
  const { gains } = await offline({ master: 0, bpm: 120, arrangement: config, tracks: [track({ solo: true, muted: true }), track({ id: 'birds' })] });
  assert.equal(gains[0].gain.value, 0);assert.equal(gains[1].gain.value, 0);assert.equal(gains[3].gain.value, 0);
});

test('cancel during native offline rendering discards its result and cleans up scheduled nodes', async () => {
  const controller = new AbortController();const state = setup();
  state.context.startRendering = async () => { controller.abort();return { sampleRate: 44100, length: 1, numberOfChannels: 2, getChannelData: () => new Float32Array(1) }; };
  await assert.rejects(renderArrangement({ mix: { master: 75, bpm: 120, arrangement: config, tracks: [track()] }, buffers: new Map([['rain', audio]]), signal: controller.signal, createContext: () => state.context }), { name: 'AbortError' });
  assert.ok(state.sources.every((source) => source.disconnected));
});

test('render errors and missing audio release the graph rather than yielding a partial download', async () => {
  await assert.rejects(offline({ master: 75, bpm: 120, arrangement: config, tracks: [track()] }, { render: async () => { throw new Error('Render failed'); } }), /Render failed/);
  await assert.rejects(renderArrangement({ mix: { master: 75, arrangement: config, tracks: [track()] }, buffers: new Map(), createContext: () => setup().context }), /Audio is missing/);
});
