import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioEngine } from '../src/lib/audioEngine.js';
import { parsePlaybackTime, playbackTimeline, precisePlaybackTime } from '../src/lib/playbackTimeline.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, actual + ' != ' + expected);
const file = { arrayBuffer: async () => new ArrayBuffer(4) };
const track = (id = 'a', changes = {}) => ({ id, name: id, volume: 50, muted: false, solo: false, loop: false, ...changes });
const free = { enabled: false, duration: 30 };
const arrangement = { enabled: true, duration: 10 };
const audio = { duration: 20, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100).fill(.1) };
function setup() {
  const sources = [], gains = [], states = [];
  const context = { currentTime: 0, state: 'suspended', destination: {}, resumes: 0,
    async resume() { this.state = 'running';this.resumes += 1; }, async close() {}, decodeAudioData: async () => audio,
    createGain() {
      const gain = { gain: { value: 1, events: [], setTargetAtTime(value) { this.value = value; },
        setValueAtTime(...args) { this.events.push(['set', ...args]); }, linearRampToValueAtTime(...args) { this.events.push(['ramp', ...args]); } },
        connect(target) { return target; }, disconnect() { this.disconnected = true; } };gains.push(gain);return gain;
    },
    createDynamicsCompressor: () => ({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(target) { return target; } }),
    createBufferSource() { const source = { starts: [], stopped: false, connect(target) { return target; }, disconnect() { this.disconnected = true; }, start(...args) { this.starts.push(args); }, stop() { this.stopped = true; } };sources.push(source);return source; },
  };
  const engine = new AudioEngine({ createContext: () => context, onState: (state) => states.push(state) });
  return { engine, context, sources, states, gains };
}

test('timeline uses the composition duration in Arrangement and actual cropped durations for finite Free mix', () => {
  const tracks = [track('a', { clipStart: 2, clipEnd: 5 }), track('b')];
  const details = { a: { duration: 20 }, b: { duration: 7 } };
  assert.deepEqual(playbackTimeline(tracks, details, arrangement, 120), { duration: 10, max: 10, repeating: false, ready: true });
  assert.deepEqual(playbackTimeline(tracks, details, free, 120), { duration: 7, max: 7, repeating: false, ready: true });
});

test('unknown durations stay unknown; repeating Free mix has an expanding seek window without an artificial end', () => {
  assert.equal(playbackTimeline([track()], {}, free, 120).duration, null);
  const looping = playbackTimeline([track('a', { loop: true })], { a: { duration: 20 } }, free, 120, 125);
  assert.equal(looping.duration, null);assert.equal(looping.max, 180);assert.equal(looping.repeating, true);
  const pattern = playbackTimeline([track('a', { sequence: { enabled: true, steps: Array(16).fill(false) } })], { a: { duration: 20 } }, free, 120);
  assert.equal(pattern.repeating, true);assert.equal(pattern.duration, null);
});

test('exact time accepts seconds and minute notation and rejects malformed or out-of-duration input', () => {
  for (const [value, expected] of [['90', 90], ['1:30', 90], ['1:30.5', 90.5], ['0', 0], [' 0:00.1 ', .1], ['125:05', 7505]]) near(parsePlaybackTime(value), expected);
  for (const value of ['', '-1', 'NaN', 'Infinity', '1:60', '1:2:3', '1.2345', '1,5', 'one']) assert.throws(() => parsePlaybackTime(value));
  assert.throws(() => parsePlaybackTime('1:31', 90));near(parsePlaybackTime('1:30', 90), 90);
  assert.equal(precisePlaybackTime(59.96), '1:00.0');assert.equal(precisePlaybackTime(90.5), '1:30.5');
});

test('paused seek loads metadata, selects a position and creates no audible sources or autoplay', async () => {
  const { engine, context, sources, states } = setup();
  assert.equal(await engine.seekTo(2, [track('a', { clipStart: 1, clipEnd: 5 })], { a: file }, 75, 120, free, false), true);
  near(engine.position(), 2);assert.equal(engine.playing, false);assert.equal(context.resumes, 0);assert.equal(sources.length, 0);assert.equal(states.at(-1), 'paused');
  await engine.play(engine.tracks, {}, 75, 120, free);near(sources[0].starts[0][1], 3);engine.dispose();
});

test('playing seek cancels old stems and starts all layers together at the requested common offset', async () => {
  const { engine, context, sources } = setup();const tracks = [track('a'), track('b')];
  await engine.play(tracks, { a: file, b: file }, 75, 120, free);context.currentTime = 1;
  await engine.seekTo(8, tracks, {}, 75, 120, free, true);
  assert.ok(sources.slice(0, 2).every((source) => source.stopped && source.disconnected));
  assert.deepEqual(sources[2].starts[0], sources[3].starts[0]);near(sources[2].starts[0][1], 8);assert.equal(engine.playing, true);engine.dispose();
});

test('arrangement seek restores local source offset and original fade, preserving mode and placement', async () => {
  const { engine, sources, gains } = setup();const layer = track('a', { clipStart: 1, clipEnd: 7, placement: { start: 2, end: 8, fadeIn: 2, fadeOut: 1 } });
  await engine.seekTo(3, [layer], { a: file }, 75, 120, arrangement, true);
  near(sources[0].starts[0][1], 2);near(sources[0].starts[0][2], 5);assert.deepEqual(engine.arrangement, arrangement);assert.equal(engine.tracks[0].placement.start, 2);
  assert.ok(gains.some((gain) => gain.gain.events.some(([kind, value]) => kind === 'set' && value === .5)));engine.dispose();
});

test('seek preserves Free mix mode and repeated source offsets even far beyond the original file', async () => {
  const { engine, sources } = setup();const layer = track('a', { loop: true, clipStart: 2, clipEnd: 5 });
  await engine.seekTo(125, [layer], { a: file }, 75, 120, free, true);
  near(sources[0].starts[0][1], 4);assert.equal(engine.arrangement.enabled, false);near(engine.position(), 125);engine.dispose();
});

test('seeking to a finite end finishes without replaying or emitting new sources', async () => {
  const { engine, sources, states } = setup();
  await engine.seekTo(40, [track('a', { clipStart: 2, clipEnd: 5 })], { a: file }, 75, 120, free, true);
  near(engine.position(), 3);assert.equal(engine.playing, false);assert.equal(states.at(-1), 'finished');assert.equal(sources.length, 0);
  await engine.play(engine.tracks, {}, 75, 120, free);near(sources[0].starts[0][1], 2);engine.dispose();
});

test('rhythmic seek resets grid phase to the destination and releases queued voices from the old position', async () => {
  const { engine, context, sources } = setup();const layer = track('a', { sequence: { enabled: true, steps: Array.from({ length: 16 }, (_, i) => i % 4 === 0) }, rhythm: { initialized: true, sampleStart: 2, sampleEnd: 3, tailMode: 'cut' } });
  await engine.play([layer], { a: file }, 75, 120, arrangement);context.currentTime = .2;
  const old = [...sources];await engine.seekTo(1.2, [layer], {}, 75, 120, arrangement, true);
  assert.ok(old.every((source) => source.stopped));const tail = sources.at(-1).starts[0];near(tail[1], 2.2);near(tail[2], .3);engine.dispose();
});

test('only the newest seek may resume after shared delayed decoding completes', async () => {
  const { engine, context, sources } = setup();let resolve;
  context.decodeAudioData = () => new Promise((done) => { resolve = done; });
  const first = engine.seekTo(3, [track()], { a: file }, 75, 120, free, true);
  await Promise.resolve();await Promise.resolve();
  const second = engine.seekTo(7, [track()], { a: file }, 75, 120, free, true);
  near(engine.position(), 7);resolve(audio);assert.equal(await first, false);assert.equal(await second, true);assert.equal(sources.length, 1);near(sources[0].starts[0][1], 7);engine.dispose();
});

test('canceling a loading seek prevents delayed playback, and a failed decode leaves no scheduled audio', async () => {
  const { engine, context, sources } = setup();let resolve;
  context.decodeAudioData = () => new Promise((done) => { resolve = done; });
  const pending = engine.seekTo(3, [track()], { a: file }, 75, 120, free, true);await Promise.resolve();await Promise.resolve();engine.pause();resolve(audio);
  assert.equal(await pending, false);assert.equal(sources.length, 0);assert.equal(engine.playing, false);engine.dispose();
  const broken = setup();broken.context.decodeAudioData = async () => { throw new Error('invalid'); };
  await assert.rejects(broken.engine.seekTo(2, [track()], { a: file }, 75, 120, free, true), /Unable to read/);assert.equal(broken.sources.length, 0);assert.equal(broken.engine.playing, false);broken.engine.dispose();
});

test('live level, master and solo changes made during seek loading remain applied on resume', async () => {
  const { engine, context } = setup();let resolve;
  context.decodeAudioData = () => new Promise((done) => { resolve = done; });
  const pending = engine.seekTo(3, [track()], { a: file }, 75, 120, free, true);await Promise.resolve();await Promise.resolve();
  engine.setMaster(21);engine.setTracks([track('a', { volume: 12, solo: true })]);resolve(audio);await pending;
  assert.equal(engine.master, 21);assert.equal(engine.nodes.get('a').gain.gain.value, .12);assert.equal(engine.tracks[0].solo, true);engine.dispose();
});

test('invalid seek positions do not interrupt an active mix', async () => {
  const { engine, sources } = setup();await engine.play([track()], { a: file }, 75, 120, free);
  for (const value of [NaN, Infinity, -1]) await assert.rejects(engine.seekTo(value, engine.tracks, {}, 75, 120, free, true));
  assert.equal(engine.playing, true);assert.equal(sources[0].stopped, false);engine.dispose();
});
