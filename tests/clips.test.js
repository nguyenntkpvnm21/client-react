import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioEngine } from '../src/lib/audioEngine.js';
import { clipMetadata, clipRegion, validateRegion } from '../src/lib/clipRegion.js';
import { defaultMix, serializeMix, validateMix } from '../src/lib/studioState.js';
import { changeProject, sameMix } from '../src/lib/savedMixes.js';

const file = { arrayBuffer: async () => new ArrayBuffer(4) };
const audio = (duration = 10) => ({ duration, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100).fill(.2) });
const track = (changes = {}) => ({ id: 'rain', catalogId: 'rain', name: 'Rain', volume: 0, muted: true, solo: false, loop: false, clipStart: 2, clipEnd: 5, ...changes });
function setup() {
  const sources = [], gains = [];
  const context = { currentTime: 0, state: 'running', destination: {}, sources, gains,
    resume: async () => { context.state = 'running'; }, close: async () => {}, decodeAudioData: async () => audio(),
    createGain() { const gain = { gain: { value: 1, setTargetAtTime(value) { this.value = value; } }, connect(target) { return target; }, disconnect() {} }; gains.push(gain); return gain; },
    createDynamicsCompressor: () => ({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(target) { return target; } }),
    createBufferSource() { const source = { starts: [], stops: 0, connect(target) { return target; }, disconnect() {}, start(...args) { this.starts.push(args); }, stop() { this.stops += 1; } }; sources.push(source); return source; },
  };
  return { context, engine: new AudioEngine({ createContext: () => context }) };
}

test('region input rejects blank, reversed, non-finite, out-of-file and too-short ranges', () => {
  for (const pair of [['', '2'], ['NaN', '2'], ['3', '2'], ['-1', '2'], ['0', '11'], ['1', '1.02']]) {
    assert.throws(() => validateRegion(...pair, 10));
  }
  assert.deepEqual(validateRegion('2.125', '5', 10), { clipStart: 2.125, clipEnd: 5 });
});

test('legacy and invalid metadata fall back to the original recording without altering source identity', () => {
  assert.deepEqual(clipMetadata({}), { clipStart: 0, clipEnd: null });
  assert.deepEqual(clipRegion(track({ clipEnd: 99 }), 10), { start: 0, end: 10, length: 10 });
  const restored = validateMix({ version: 1, master: 50, tracks: [{ id: 'rain', catalogId: 'rain' }] });
  assert.equal(restored.tracks[0].clipStart, 0);
  assert.equal(restored.tracks[0].clipEnd, null);
});

test('snapshots and restored workspace preserve clip bounds and loop with shared audio IDs', () => {
  const mix = { master: 50, tracks: [track({ loop: true })] };
  const saved = changeProject([], 'save', { id: 'mix-a', name: 'Clipped', mix });
  const restored = validateMix(saved[0].mix);
  assert.equal(restored.tracks[0].clipEnd, 5);
  assert.equal(restored.tracks[0].clipStart, 2);
  assert.equal(restored.tracks[0].id, 'rain');
  assert.equal(restored.tracks[0].loop, true);
  assert.deepEqual(serializeMix(restored), saved[0].mix);
});

test('dirty comparison detects region edits and treats old full-track snapshots as unchanged', () => {
  const mix = defaultMix();
  const normalized = validateMix(serializeMix(mix));
  assert.equal(sameMix(mix, normalized), true);
  normalized.tracks[0].clipStart = 2;
  normalized.tracks[0].clipEnd = 4;
  assert.equal(sameMix(mix, normalized), false);
});

test('one-shot crops use original-file offsets and stop at the selected end after resume', async () => {
  const { context, engine } = setup();
  await engine.play([track()], { rain: file }, 50);
  assert.deepEqual(context.sources[0].starts[0], [.06, 2, 3]);
  context.currentTime = 1.06;
  engine.pause();
  await engine.play([track()], { rain: file }, 50);
  assert.deepEqual(context.sources[1].starts[0], [1.12, 3, 2]);
  engine.dispose();
});

test('looped crops wrap offsets within their selected region on the common timeline', async () => {
  const { context, engine } = setup();
  const tracks = [track({ loop: true }), track({ id: 'vocal', loop: true, muted: false })];
  await engine.play(tracks, { rain: file, vocal: file }, 75);
  context.currentTime = 7.06;
  engine.pause();
  await engine.play(tracks, { rain: file, vocal: file }, 75);
  const source = context.sources[2];
  assert.equal(source.loopStart, 2);
  assert.equal(source.loopEnd, 5);
  assert.equal(source.starts[0][1], 3);
  assert.equal(source.starts[0].length, 2);
  assert.deepEqual(source.starts, context.sources[3].starts);
  engine.dispose();
});

test('an ended cropped mix can replay from its selected beginning', async () => {
  const { context, engine } = setup();
  await engine.play([track()], { rain: file }, 75);
  context.currentTime = 3.1;
  context.sources[0].onended();
  assert.equal(engine.playing, false);
  await engine.play([track()], { rain: file }, 75);
  assert.equal(context.sources[1].starts[0][1], 2);
  engine.dispose();
});

test('level and solo changes on a cropped track preserve the active source', async () => {
  const { context, engine } = setup();
  await engine.play([track({ loop: true })], { rain: file }, 75);
  engine.setTracks([track({ loop: true, muted: false, volume: 70, solo: true })]);
  engine.setMaster(20);
  assert.equal(context.sources.length, 1);
  assert.equal(engine.nodes.get('rain').gain.gain.value, .7);
  assert.equal(context.sources[0].loopEnd, 5);
  engine.dispose();
});

test('preview pauses the mix and auditions the draft alone at fixed gain despite mute and master', async () => {
  const { context, engine } = setup();
  await engine.play([track({ loop: true })], { rain: file }, 0);
  context.currentTime = 1.06;
  await engine.preview(track(), file, 6, 7, false);
  assert.equal(engine.playing, false);
  assert.equal(engine.position(), 1);
  assert.equal(engine.nodes.size, 0);
  assert.equal(engine.previewNode.gain.gain.value, .4);
  assert.deepEqual(context.sources[1].starts[0], [1.09, 6, 1]);
  context.currentTime = 1.59;
  assert.equal(engine.previewPosition().position, 6.5);
  engine.dispose();
});

test('canceling pending preview decode prevents delayed sound', async () => {
  const { context, engine } = setup();
  let finish;
  context.decodeAudioData = () => new Promise((resolve) => { finish = resolve; });
  const pending = engine.preview(track(), file, 2, 3, false);
  await new Promise((resolve) => queueMicrotask(resolve));
  engine.stopPreview();
  finish(audio());
  await pending;
  assert.equal(context.sources.length, 0);
  assert.equal(engine.previewNode, null);
  // Removal while the browser is still resuming must cancel the future audition too.
  let resume;
  context.resume = () => new Promise((resolve) => { resume = resolve; });
  const delayed = engine.preview(track(), file, 2, 3, true);
  engine.forget('rain');
  context.decodeAudioData = async () => audio();
  resume();
  await delayed;
  assert.equal(context.sources.length, 0);
  engine.dispose();
});

test('play, forget and dispose release preview nodes and ignore stale ended callbacks', async () => {
  const { context, engine } = setup();
  await engine.preview(track(), file, 2, 3, true);
  const oldEnd = context.sources[0].onended;
  await engine.play([track()], { rain: file }, 75);
  assert.equal(context.sources[0].stops, 1);
  assert.equal(engine.previewNode, null);
  oldEnd();
  assert.equal(engine.playing, true);
  await engine.preview(track(), file, 2, 3, true);
  engine.forget('rain');
  assert.equal(engine.previewNode, null);
  await engine.preview(track(), file, 2, 3, true);
  engine.dispose();
  assert.equal(engine.previewNode, null);
  assert.equal(context.sources.at(-1).stops, 1);
});

test('tiny recordings and rounded end values remain playable without extending source audio', () => {
  assert.deepEqual(validateRegion('0', '.025', .0248), { clipStart: 0, clipEnd: .0248 });
  assert.deepEqual(validateRegion('0', '10.000', 9.9998), { clipStart: 0, clipEnd: 9.9998 });
  assert.throws(() => validateRegion('0', '.01', .0248));
});
