import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import { AudioEngine } from '../src/lib/audioEngine.js';

const buffer = (duration = 20) => ({ duration, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100).fill(0.2) });
function fakeContext() {
  const sources = [];
  const context = { currentTime: 0, state: 'suspended', destination: {}, sources,
    resume: async () => { context.state = 'running'; }, close: async () => { context.state = 'closed'; },
    decodeAudioData: async () => buffer(),
    createGain: () => ({ gain: { value: 1, setTargetAtTime(value) { this.value = value; } }, connect(target) { return target; }, disconnect() {} }),
    createDynamicsCompressor: () => ({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(target) { return target; } }),
    createBufferSource: () => {
      const source = { loop: false, onended: null, starts: [], stops: 0, connect(target) { return target; }, disconnect() {},
        start(...args) { this.starts.push(args); }, stop() { this.stops += 1; } };
      sources.push(source);
      return source;
    },
  };
  return context;
}
const track = (id, loop = false) => ({ id, name: id, volume: 50, muted: false, solo: false, loop });
const file = { arrayBuffer: async () => new ArrayBuffer(4) };

test('stems share a scheduled start and pause/resume excludes paused time', async () => {
  const context = fakeContext();
  const engine = new AudioEngine({ createContext: () => context });
  const tracks = [track('beat'), track('vocal')];
  await engine.play(tracks, { beat: file, vocal: file }, 75);
  assert.deepEqual(context.sources[0].starts, context.sources[1].starts);
  context.currentTime = 3.06;
  engine.pause();
  assert.equal(engine.position(), 3);
  assert.equal(context.sources.every((source) => source.stops === 1), true);
  context.currentTime = 100;
  await engine.play(tracks, { beat: file, vocal: file }, 75);
  assert.equal(context.sources[2].starts[0][1], 3);
  assert.deepEqual(context.sources[2].starts, context.sources[3].starts);
  engine.dispose();
});

test('live volume, solo, loop and master changes do not recreate playing sources', async () => {
  const context = fakeContext();
  const engine = new AudioEngine({ createContext: () => context });
  await engine.play([track('rain', true), track('music')], { rain: file, music: file }, 75);
  const changed = [{ ...track('rain', false), volume: 82, solo: true }, track('music')];
  engine.setTracks(changed);
  engine.setMaster(32);
  assert.equal(context.sources.length, 2);
  assert.equal(engine.nodes.get('rain').gain.gain.value, 0.82);
  assert.equal(engine.nodes.get('music').gain.gain.value, 0);
  assert.equal(engine.nodes.get('rain').source.loop, false);
  assert.equal(engine.masterNode.gain.value, 0.32);
  engine.dispose();
});

test('canceling a pending decode cannot start playback later', async () => {
  const context = fakeContext();
  let finish;
  const decoding = new Promise((resolve) => { finish = resolve; });
  context.decodeAudioData = () => decoding;
  const engine = new AudioEngine({ createContext: () => context });
  const pending = engine.play([track('a')], { a: file }, 75);
  engine.pause();
  finish(buffer());
  await pending;
  assert.equal(engine.playing, false);
  assert.equal(context.sources.length, 0);
  engine.dispose();
});

test('a decoding failure stops startup and permits a later retry', async () => {
  const context = fakeContext();
  context.decodeAudioData = async () => { throw new Error('Corrupt'); };
  const engine = new AudioEngine({ createContext: () => context });
  await assert.rejects(engine.play([track('a')], { a: file }, 75), /Unable to read/);
  assert.equal(engine.playing, false);
  context.decodeAudioData = async () => buffer();
  await engine.play([track('a')], { a: file }, 75);
  assert.equal(engine.playing, true);
  engine.dispose();
});

test('removing the final source and restarting leave no orphan playback', async () => {
  const context = fakeContext();
  const engine = new AudioEngine({ createContext: () => context });
  await engine.play([track('a', true)], { a: file }, 75);
  context.currentTime = 4;
  engine.forget('a');
  engine.setTracks([]);
  assert.equal(engine.playing, false);
  assert.equal(engine.nodes.size, 0);
  assert.equal(engine.memory, 0);
  engine.restart();
  assert.equal(engine.position(), 0);
  engine.dispose();
});

test('ended sources cannot pause a new transport generation', async () => {
  const context = fakeContext();
  const engine = new AudioEngine({ createContext: () => context });
  await engine.play([track('a')], { a: file }, 75);
  const oldEnd = context.sources[0].onended;
  engine.restart();
  await engine.play([track('a')], { a: file }, 75);
  oldEnd();
  assert.equal(engine.playing, true);
  assert.equal(engine.nodes.size, 1);
  context.sources[1].onended();
  assert.equal(engine.playing, false);
  engine.dispose();
});

test('long recordings are rejected before they enter the buffer cache', async () => {
  const context = fakeContext();
  context.decodeAudioData = async () => buffer(901);
  const engine = new AudioEngine({ createContext: () => context });
  await assert.rejects(engine.load(track('long'), file), /15 minutes/);
  assert.equal(engine.buffers.size, 0);
  assert.equal(engine.memory, 0);
  engine.dispose();
});

test('decoded audio cannot exceed the working memory budget', async () => {
  const context = fakeContext();
  context.decodeAudioData = async () => ({ ...buffer(), length: 1024 * 1024 * 1024 / 4 + 1 });
  const engine = new AudioEngine({ createContext: () => context });
  await assert.rejects(engine.load(track('large'), file), /exceed 1 GiB/);
  assert.equal(engine.buffers.size, 0);
  assert.equal(engine.memory, 0);
  engine.dispose();
});

test('the browser context uses 44.1 kHz instead of expanding PCM to the hardware sample rate', () => {
  const previousWindow = globalThis.window;
  let options;
  globalThis.window = { AudioContext: class { constructor(value) { options = value; return fakeContext(); } } };
  const engine = new AudioEngine();
  try { engine.ensureContext(); assert.equal(options.sampleRate, 44100); }
  finally { engine.dispose(); if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

test('six four-minute stereo layers above the former limit play, seek and release memory; eight at 44.1 kHz also fit', async () => {
  for (const [count, rate] of [[6, 48000], [8, 44100]]) {
    const context = fakeContext();
    context.decodeAudioData = async () => ({ ...buffer(240), length: 240 * rate, numberOfChannels: 2 });
    const engine = new AudioEngine({ createContext: () => context });
    const tracks = Array.from({ length: count }, (_, i) => track('stem-' + i));
    const files = Object.fromEntries(tracks.map((layer) => [layer.id, file]));
    await engine.play(tracks, files, 75);
    const bytes = count * 240 * rate * 2 * 4;
    assert.ok(bytes > 512 * 1024 * 1024);
    assert.equal(engine.memory, bytes);assert.equal(engine.playing, true);assert.equal(context.sources.length, count);
    await engine.seekTo(90.5, tracks, files, 75, 120, { enabled: false, duration: 30 }, true);
    assert.equal(engine.memory, bytes);assert.equal(engine.nodes.size, count);
    assert.ok(context.sources.slice(count).every((source) => source.starts[0][1] === 90.5));
    engine.forget(tracks[0].id);assert.equal(engine.memory, bytes - 240 * rate * 2 * 4);
    engine.dispose();assert.equal(engine.memory, 0);
  }
});

test('parallel layer loads serialize file reads and decoders while duplicate requests share one load', async () => {
  const context = fakeContext();const reads = [], finishes = [];
  context.decodeAudioData = () => new Promise((resolve) => finishes.push(() => resolve(buffer())));
  const engine = new AudioEngine({ createContext: () => context });
  const source = (id) => ({ arrayBuffer: async () => { reads.push(id);return new ArrayBuffer(4); } });
  const first = engine.load(track('a'), source('a'));
  const duplicate = engine.load(track('a'), source('duplicate'));
  const second = engine.load(track('b'), source('b'));
  const third = engine.load(track('c'), source('c'));
  await new Promise(setImmediate);assert.deepEqual(reads, ['a']);assert.equal(finishes.length, 1);
  finishes[0]();await new Promise(setImmediate);assert.deepEqual(reads, ['a', 'b']);assert.equal(finishes.length, 2);
  finishes[1]();await new Promise(setImmediate);assert.deepEqual(reads, ['a', 'b', 'c']);
  finishes[2]();const results = await Promise.all([first, duplicate, second, third]);
  assert.equal(results[0], results[1]);assert.equal(engine.buffers.size, 3);assert.equal(engine.loadQueue, null);engine.dispose();
});

test('a canceled queued layer is never read or decoded and does not block the next recording', async () => {
  const context = fakeContext();let finish;let decodes = 0;let canceledReads = 0;
  context.decodeAudioData = () => ++decodes === 1 ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(buffer());
  const engine = new AudioEngine({ createContext: () => context });
  const first = engine.load(track('a'), file);
  const canceled = assert.rejects(engine.load(track('b'), { arrayBuffer: async () => { canceledReads += 1;return new ArrayBuffer(4); } }), /loading was canceled/);
  const last = engine.load(track('c'), file);engine.forget('b');
  await new Promise(setImmediate);finish(buffer());await Promise.all([first, canceled, last]);
  assert.equal(canceledReads, 0);assert.equal(decodes, 2);assert.deepEqual([...engine.buffers.keys()], ['a', 'c']);assert.equal(engine.pending.size, 0);engine.dispose();
});

test('memory pressure evicts unused decoded audio, preserving mix layers and the preview', async () => {
  const context = fakeContext();let size = 256 * 1024 * 1024;
  context.decodeAudioData = async () => ({ ...buffer(), length: size / 4 });
  const engine = new AudioEngine({ createContext: () => context });
  await engine.load(track('inspected'), file);size = 768 * 1024 * 1024;await engine.load(track('active'), file);
  engine.setTracks([track('active'), track('new')]);engine.previewId = 'inspected';size = 128 * 1024 * 1024;
  await assert.rejects(engine.load(track('new'), file), /exceed 1 GiB/);
  assert.equal(engine.buffers.has('active'), true);assert.equal(engine.buffers.has('inspected'), true);
  engine.previewId = null;await engine.load(track('new'), file);
  assert.deepEqual([...engine.buffers.keys()], ['active', 'new']);assert.equal(engine.memory, 896 * 1024 * 1024);engine.dispose();
});

test('decoder failure releases the load queue so another layer can still load', async () => {
  const context = fakeContext();let calls = 0;
  context.decodeAudioData = async () => { if (++calls === 1) throw new Error('Corrupt');return buffer(); };
  const engine = new AudioEngine({ createContext: () => context });
  const broken = assert.rejects(engine.load(track('broken'), file), /Unable to read/);
  const next = engine.load(track('valid'), file);await Promise.all([broken, next]);
  assert.deepEqual([...engine.buffers.keys()], ['valid']);assert.equal(engine.loadQueue, null);assert.equal(engine.pending.size, 0);engine.dispose();
});
