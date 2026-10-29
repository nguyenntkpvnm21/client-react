import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioEngine } from '../src/lib/audioEngine.js';
import { duplicateClip, placedClip, splitClip, trimmedClip } from '../src/lib/clipInstances.js';
import { referencedAudio, changeProject } from '../src/lib/savedMixes.js';
import { defaultMix, serializeMix, validateMix } from '../src/lib/studioState.js';
import { createProjectBackup, inspectProjectBackup, restoredProject } from '../src/lib/projectBackup.js';
import { scheduleNormalTrack } from '../src/lib/audioGraph.js';
import { windowGain } from '../src/lib/arrangementState.js';
import { MAX_CLIPS } from '../src/data/sounds.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, a + ' != ' + b);
const source = { id: 'custom-original', catalogId: null, name: 'Vocal.wav', role: 'vocal' };
const clip = (changes = {}) => ({ ...source, sourceId: source.id, volume: 50, muted: false, solo: false, loop: false,
  clipStart: 2, clipEnd: 12, placement: { start: 1, end: 11, fadeIn: 3, fadeOut: 4 }, ...changes });
const mix = (track = clip()) => ({ sources: [source], tracks: [track], master: 75, bpm: 100, arrangement: { enabled: true, duration: 20 } });
function setup() {
  const sources = [], gains = [];
  const context = { state: 'running', currentTime: 0, destination: {}, resume: async () => {}, close: async () => {},
    decodeAudioData: async () => ({ duration: 20, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100).fill(.2) }),
    createGain() { const node = { gain: { value: 1, events: [], setTargetAtTime(value) { this.value = value; }, setValueAtTime(...args) { this.events.push(['set', ...args]); }, linearRampToValueAtTime(...args) { this.events.push(['ramp', ...args]); } }, connect(target) { return target; }, disconnect() {} };gains.push(node);return node; },
    createDynamicsCompressor: () => ({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect(target) { return target; } }),
    createBufferSource() { const node = { starts: [], connect(target) { return target; }, disconnect() {}, start(...args) { this.starts.push(args); }, stop() {} };sources.push(node);return node; },
  };
  return { context, sources, gains, engine: new AudioEngine({ createContext: () => context }) };
}
const file = { arrayBuffer: async () => new ArrayBuffer(4) };

test('legacy workspaces gain a source registry without changing clip controls or source identities', () => {
  const legacy = { version: 1, tracks: [{ ...source, volume: 37, muted: true, loop: false }], master: 62 };
  const restored = validateMix(legacy);
  assert.deepEqual(restored.sources, [source]);assert.equal(restored.tracks[0].sourceId, source.id);
  assert.equal(restored.tracks[0].volume, 37);assert.equal(restored.tracks[0].muted, true);
  assert.deepEqual(validateMix(serializeMix(restored)), restored);
});

test('three source recordings can produce five clips without copying or increasing source count', () => {
  let current = validateMix(serializeMix(defaultMix()));current = duplicateClip(current, 'rain', 'custom-copy-a');current = duplicateClip(current, 'music', 'custom-copy-b');
  const state = validateMix(serializeMix(current));assert.equal(state.sources.length, 3);assert.equal(state.tracks.length, 5);
  assert.equal(state.tracks[3].sourceId, 'rain');assert.equal(state.tracks[4].sourceId, 'music');
  current.tracks[3].volume = 7;current.tracks[3].sequence.steps[0] = true;
  assert.notEqual(current.tracks[0].volume, 7);assert.equal(current.tracks[0].sequence.steps[0], false);
});

test('source registry survives removing every clip and saved references protect shared imported files', () => {
  const current = mix();const empty = { ...current, tracks: [] };
  assert.deepEqual(validateMix(serializeMix(empty)).sources, [source]);
  assert.equal(referencedAudio(empty, []).has(source.id), true);
  const saved = changeProject([], 'save', { id: 'mix-protected', name: 'Protected', mix: current });
  assert.equal(referencedAudio({ sources: [], tracks: [] }, saved).has(source.id), true);
  assert.equal(referencedAudio({ sources: [], tracks: [] }, []).has(source.id), false);
});

test('clips are bounded separately from eight source recordings and invalid source references are not invented', () => {
  let current = mix();
  for (let i = 1; i < MAX_CLIPS; i += 1) current = duplicateClip(current, source.id, 'custom-copy-' + i);
  assert.equal(validateMix(serializeMix(current)).tracks.length, MAX_CLIPS);
  assert.throws(() => duplicateClip(current, source.id, 'custom-over'), /32 clips/);
  assert.equal(validateMix(serializeMix({ ...mix(), tracks: [clip({ sourceId: 'custom-missing' })] })).tracks.length, 0);
});

test('overlapping copies decode once, share one PCM buffer, route independently and release only the last alias', async () => {
  const { engine, context } = setup();let decodes = 0;const decode = context.decodeAudioData;
  context.decodeAudioData = async (...args) => { decodes += 1;return decode(...args); };
  const a = clip(), b = clip({ id: 'custom-copy', volume: 23, muted: true });
  await engine.play([a, b], { [source.id]: file }, 75, 100, mix().arrangement);
  assert.equal(decodes, 1);assert.equal(engine.buffers.get(a.id), engine.buffers.get(b.id));assert.equal(engine.memory, 400);
  assert.equal(engine.nodes.get(b.id).gain.gain.value, 0);engine.forget(a.id);assert.equal(engine.memory, 400);
  assert.ok(engine.nodes.has(b.id));engine.forget(b.id);assert.equal(engine.memory, 0);engine.dispose();
});

test('forgetting one pending alias rejects only that request and keeps the shared decode for its sibling', async () => {
  const { engine, context } = setup();let finish;
  context.decodeAudioData = () => new Promise((resolve) => { finish = resolve; });
  const a = engine.load(clip(), file);const outcome = a.then(() => false, () => true);
  const b = engine.load(clip({ id: 'custom-copy' }), file);
  await Promise.resolve();engine.forget(source.id);
  finish({ duration: 20, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100) });
  assert.equal(await outcome, true);await b;assert.equal(engine.buffers.has(source.id), false);assert.equal(engine.buffers.has('custom-copy'), true);engine.dispose();
});

test('splitting one-shot audio preserves source continuity and the original fade curve on both sides', () => {
  for (const at of [2, 5, 9]) {
    const original = clip();const result = splitClip(mix(original), original.id, at, 20, 'custom-right');
    const [left, right] = result.tracks;
    near(left.clipEnd, right.clipStart);near(right.clipStart, 2 + at - 1);
    assert.equal(left.placement.end, at);assert.equal(right.placement.start, at);
    for (const time of [1.2, 2.2, 5.2, 9.2, 10.8]) near(windowGain(original.placement, time), windowGain((time < at ? left : right).gainEnvelope, time));
  }
});

test('loop splits retain the selected loop region and correct phase, including repeated splits', () => {
  const original = clip({ loop: true, clipStart: 2, clipEnd: 5, placement: { start: 0, end: 18, fadeIn: 0, fadeOut: 2 } });
  const result = splitClip(mix(original), original.id, 7, 20, 'custom-right');
  const right = result.tracks[1];assert.equal(right.clipStart, 2);assert.equal(right.clipEnd, 5);near(right.sourceOffset, 1);
  const again = splitClip(result, right.id, 11, 20, 'custom-next');near(again.tracks[2].sourceOffset, 2);
});

test('split rejects silent padding, clip edges and sequenced patterns without changing the original', () => {
  const current = mix(clip({ placement: { start: 0, end: 20, fadeIn: 0, fadeOut: 0 } }));const before = structuredClone(current);
  for (const at of [0, .01, 10.01, 18]) assert.throws(() => splitClip(current, source.id, at, 20, 'custom-right'), /playhead inside/);
  const pattern = clip({ sequence: { enabled: true, steps: Array(16).fill(true) } });
  assert.throws(() => splitClip(mix(pattern), pattern.id, 5, 20, 'custom-right'), /normal playback/);
  assert.deepEqual(current, before);
});

test('moving a split clip shifts its inherited envelope; editing its fade starts a new independent envelope', () => {
  const current = splitClip(mix(), source.id, 2, 20, 'custom-right');const right = current.tracks[1];
  const moved = placedClip(right, { ...right.placement, start: 5, end: 14 });near(moved.gainEnvelope.start, 4);
  const adjusted = placedClip(right, { ...right.placement, fadeIn: 0 });assert.equal(adjusted.gainEnvelope, undefined);
  const restored = validateMix(serializeMix({ ...current, tracks: [moved] }));assert.deepEqual(restored.tracks[0].gainEnvelope, moved.gainEnvelope);
});

test('timeline trims change the played audio and preserve loop phase instead of only moving an entry label', () => {
  const original = clip();const trimmed = trimmedClip(original, { ...original.placement, start: 3 }, 20, 'start');near(trimmed.clipStart, 4);
  const shorter = trimmedClip(original, { ...original.placement, end: 7 }, 20, 'end');near(shorter.clipEnd, 8);
  const loop = clip({ loop: true, clipStart: 2, clipEnd: 5 });near(trimmedClip(loop, { ...loop.placement, start: 3 }, 20, 'start').sourceOffset, 2);
  assert.throws(() => trimmedClip(original, { ...original.placement, start: -5 }, 20, 'start'), /beyond the source/);
});

test('live and offline source scheduling both honor split-loop phase and inherited fade automation', () => {
  const original = clip({ loop: true, clipStart: 2, clipEnd: 5, placement: { start: 0, end: 18, fadeIn: 4, fadeOut: 2 } });
  const right = splitClip(mix(original), original.id, 2, 20, 'custom-right').tracks[1];const { context, sources, gains } = setup();
  scheduleNormalTrack({ context, output: {}, track: right, tracks: [right], buffer: { duration: 20 }, when: 0, offset: 0, arrangement: mix().arrangement });
  near(sources[0].starts[0][1], 4);near(sources[0].starts[0][0], 2);
  const envelope = gains[1].gain.events;assert.deepEqual(envelope[0], ['set', .5, 2]);assert.ok(envelope.some(event => event[0] === 'ramp' && event[1] === 1 && event[2] === 4));
});

test('project v2 embeds each source once and retains shared references, offsets and inherited fades after restore', async () => {
  let current = splitClip(mix(clip({ loop: true, clipEnd: 5 })), source.id, 5, 20, 'custom-right');current = duplicateClip(current, 'custom-right', 'custom-copy');
  let reads = 0;const payload = new Blob(['original compressed recording'], { type: 'audio/mpeg' });
  const blob = await createProjectBackup({ mix: current, name: 'Shared audio', resolveAudio: () => { reads += 1;return payload; } });
  assert.equal(reads, 1);const inspected = await inspectProjectBackup(blob);assert.equal(inspected.files.size, 1);
  const restored = restoredProject(inspected, 'Restored');assert.equal(restored.files.size, 1);assert.equal(restored.mix.tracks.length, 3);
  assert.equal(new Set(restored.mix.tracks.map(track => track.sourceId)).size, 1);
  near(restored.mix.tracks[1].sourceOffset, current.tracks[1].sourceOffset);assert.deepEqual(restored.mix.tracks[1].gainEnvelope, current.tracks[1].gainEnvelope);
});

test('previous version-1 project files migrate their per-layer assets to a reusable source registry', async () => {
  const legacy = serializeMix(mix());delete legacy.sources;
  legacy.tracks = legacy.tracks.map((track) => { const value = { ...track };delete value.sourceId;return value; });
  const blob = new Blob(['legacy original'], { type: 'audio/mpeg' });
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const manifest = new TextEncoder().encode(JSON.stringify({ format: 'naturemix-project', version: 1, name: 'Legacy project', createdAt: new Date().toISOString(), mix: legacy,
    assets: [{ trackId: source.id, size: blob.size, type: blob.type, sha256 }] }));
  const header = new Uint8Array(12);header.set(new TextEncoder().encode('NMIXPK01'));new DataView(header.buffer).setUint32(8, manifest.length);
  const parsed = await inspectProjectBackup(new Blob([header, manifest, blob]));
  assert.equal(parsed.mix.sources.length, 1);assert.equal(parsed.mix.tracks[0].sourceId, source.id);assert.equal(await parsed.files.get(source.id).text(), 'legacy original');
  assert.equal(restoredProject(parsed, 'Old project restored').mix.tracks[0].volume, 50);
});

test('32 clips of one four-minute stereo recording use one decode and one memory allocation', async () => {
  const { engine, context } = setup();let decodes = 0;
  const length = 240 * 44100;context.decodeAudioData = async () => { decodes += 1;return { duration: 240, length, numberOfChannels: 2, getChannelData: () => new Float32Array(100) }; };
  const tracks = Array.from({ length: 32 }, (_, i) => clip({ id: 'custom-copy-' + i }));
  engine.setTracks(tracks);await Promise.all(tracks.map(track => engine.load(track, file)));
  assert.equal(decodes, 1);assert.equal(engine.memory, length * 2 * 4);assert.equal(new Set(engine.buffers.values()).size, 1);engine.dispose();
});

test('clearing a workspace cancels its pending aliases while a new request for that source can retry', async () => {
  const { engine, context } = setup();let finish, decodes = 0;
  const decoded = { duration: 20, length: 100, numberOfChannels: 1, getChannelData: () => new Float32Array(100) };
  context.decodeAudioData = () => ++decodes === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(decoded);
  const old = engine.load(clip(), file).then(() => false, () => true);
  await Promise.resolve();engine.clearAudio();const next = engine.load(clip({ id: 'custom-fresh' }), file);
  finish(decoded);assert.equal(await old, true);await next;
  assert.equal(decodes, 2);assert.equal(engine.buffers.size, 1);assert.equal(engine.buffers.has('custom-fresh'), true);engine.dispose();
});

test('trimming a silent tail keeps the selected audio until the edge reaches audible content', () => {
  const original = clip({ clipStart: 2, clipEnd: 7, placement: { start: 0, end: 10, fadeIn: 0, fadeOut: 0 } });
  assert.equal(trimmedClip(original, { ...original.placement, end: 8 }, 20, 'end').clipEnd, 7);
  assert.equal(trimmedClip(original, { ...original.placement, end: 4 }, 20, 'end').clipEnd, 6);
});

test('malformed shared-source records cannot masquerade as valid saved projects', () => {
  const current = duplicateClip(defaultMix(), 'rain', 'custom-copy');
  current.tracks.at(-1).name = 42;
  assert.equal(validateMix(serializeMix({ ...defaultMix(), tracks: defaultMix().tracks })).tracks.length, 3);
  assert.equal(validateMix({ version: 1, ...current }).tracks.length, 3);
  const bad = { ...mix(), sources: [{ ...source }, { ...source }] };
  assert.throws(() => changeProject([], 'save', { id: 'mix-bad', name: 'Invalid', mix: { ...bad, tracks: [clip({ sourceId: 'custom-missing' })] } }), /invalid data/);
});
