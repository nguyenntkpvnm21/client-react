import assert from 'node:assert/strict';
import { test } from 'node:test';
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
  context.decodeAudioData = async () => ({ ...buffer(), length: 512 * 1024 * 1024 / 4 + 1 });
  const engine = new AudioEngine({ createContext: () => context });
  await assert.rejects(engine.load(track('large'), file), /mix is too large/);
  assert.equal(engine.buffers.size, 0);
  assert.equal(engine.memory, 0);
  engine.dispose();
});
