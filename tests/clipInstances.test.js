import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioEngine } from '../src/lib/audioEngine.js';
import { duplicateClip, eventClip, placedClip, splitClip, trimmedClip } from '../src/lib/clipInstances.js';
import { referencedAudio, changeProject } from '../src/lib/savedMixes.js';
import { defaultMix, serializeMix, validateMix } from '../src/lib/studioState.js';
import { createProjectBackup, inspectProjectBackup, restoredProject } from '../src/lib/projectBackup.js';
import { scheduleNormalTrack } from '../src/lib/audioGraph.js';
import { windowGain } from '../src/lib/arrangementState.js';
import { MAX_CLIPS } from '../src/data/sounds.js';
import { commitEditorPlacement, duplicateEditorClipAt, editEditorLane, editorClipWindow, editorLanes, editorTimelineMix, emptyEditorMix, fitEditorSongEnd, setEditorClipLoop } from '../src/lib/editorTracks.js';
import { MixHistory } from '../src/lib/mixHistory.js';

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

test('selected audio becomes an independent one-shot event at the mix cursor without changing its original', () => {
  const current = mix(clip({ loop: true, sequence: { enabled: true, steps: Array(16).fill(true) } }));
  const before = structuredClone(current);
  const next = eventClip(current, source.id, 3.2, 3.7, 8.5, 20, 'custom-event');
  assert.deepEqual(current, before);assert.deepEqual(next.sources, before.sources);
  const event = next.tracks.at(-1);
  assert.equal(event.sourceId, source.id);assert.equal(event.loop, false);
  assert.equal(event.clipStart, 3.2);assert.equal(event.clipEnd, 3.7);
  near(event.placement.start, 8.5);near(event.placement.end, 9);
  const restored = validateMix(serializeMix(next));
  assert.equal(restored.tracks[1].sequence.enabled, false);assert.equal(restored.tracks[1].sourceOffset, undefined);
  assert.deepEqual(restored.tracks[1].placement, event.placement);
  const tiny = eventClip(current, source.id, 0, .02, 1, .02, 'custom-tiny-event');
  const tinySaved = validateMix(serializeMix(tiny)).tracks.at(-1);
  near(tinySaved.placement.start, 1);near(tinySaved.placement.end, 1.05);near(tinySaved.clipEnd, .02);
});

test('sound events extend the arrangement only when needed and reject invalid or overflowing ranges atomically', () => {
  const current = mix(), before = structuredClone(current);
  const next = eventClip(current, source.id, 2, 4, 19, 20, 'custom-event');
  assert.equal(next.arrangement.duration, 21);assert.equal(next.arrangement.enabled, true);
  for (const [start, end, at] of [[4, 2, 1], [0, 21, 1], [2, 4, -1], [2, 4, Infinity], [2, 4, 299]]) {
    assert.throws(() => eventClip(current, source.id, start, end, at, 20, 'custom-invalid'));
  }
  assert.throws(() => eventClip(current, 'custom-missing', 2, 4, 0, 20, 'custom-invalid'));
  assert.throws(() => eventClip({ ...current, tracks: Array(MAX_CLIPS).fill(clip()) }, source.id, 2, 4, 0, 20, 'custom-over'), /32 clips/);
  assert.deepEqual(current, before);
});

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

test('the editor starts empty and legacy clips sharing a source remain independent tracks', () => {
  const empty = emptyEditorMix();assert.equal(empty.tracks.length, 0);assert.equal(empty.sources.length, 0);assert.equal(empty.arrangement.enabled, true);
  const original = clip(), independent = clip({ id: 'custom-independent', volume: 31 });
  const current = { ...mix(), tracks: [original, independent] };
  const lanes = editorLanes(current);assert.equal(lanes.length, 2);assert.equal(lanes[1].volume, 31);
  assert.equal(Object.hasOwn(serializeMix(current).tracks[0], 'laneId'), false);
  assert.equal(Object.hasOwn(validateMix(serializeMix(current)).tracks[0], 'laneId'), false);
  assert.equal(Object.hasOwn(serializeMix(current).tracks[0], 'laneName'), false);
  assert.equal(Object.hasOwn(validateMix(serializeMix(current)).tracks[0], 'laneName'), false);
});

test('split and duplicated regions share track controls without changing another use of the recording', () => {
  const unrelated = clip({ id: 'custom-independent', volume: 31, muted: true });
  const current = splitClip({ ...mix(), tracks: [clip(), unrelated] }, source.id, 5, 20, 'custom-right');
  const copied = duplicateClip(current, 'custom-right', 'custom-copy');
  const lanes = editorLanes(copied);assert.equal(lanes.length, 2);assert.equal(lanes[0].clips.length, 3);
  assert.ok(copied.tracks.filter(track => track.id !== unrelated.id).every(track => track.laneId === source.id));
  const changed = editEditorLane(copied, lanes[0].id, { volume: 72, solo: true, name: 'Lead vocal' });
  assert.ok(changed.tracks.filter(track => track.id !== unrelated.id).every(track => track.volume === 72 && track.solo && track.laneName === 'Lead vocal'));
  assert.equal(editorLanes(changed)[0].name, 'Lead vocal');assert.deepEqual(changed.tracks.map(track => track.name), copied.tracks.map(track => track.name));
  assert.deepEqual(changed.tracks.find(track => track.id === unrelated.id), unrelated);
  assert.throws(() => editEditorLane(copied, lanes[0].id, { volume: 101 }), /between/);
  assert.throws(() => editEditorLane(copied, lanes[0].id, { name: ' ' }), /track name/);
});

test('one track-volume gesture is one undo step for all of its split regions', () => {
  const before = splitClip(mix(), source.id, 5, 20, 'custom-right');
  const history = new MixHistory();history.begin('lane-level:' + source.id);
  const first = editEditorLane(before, source.id, { volume: 60 });history.record(before, first, { key: 'lane-level:' + source.id });
  const last = editEditorLane(first, source.id, { volume: 75 });history.record(first, last, { key: 'lane-level:' + source.id });history.end();
  assert.equal(history.past.length, 1);
  const undone = history.apply('undo', last);assert.ok(undone.mix.tracks.every(track => track.volume === 50));
});

test('a clip move into another track adopts destination controls atomically and preserves the source audio', () => {
  const destination = clip({ id: 'custom-destination', name: 'Backing', volume: 21, muted: true, solo: true });
  const current = { ...mix(), tracks: [clip(), destination] }, before = structuredClone(current);
  const next = commitEditorPlacement(current, source.id, { start: 25, end: 35, fadeIn: 3, fadeOut: 4 }, 20, 'move', destination.id);
  assert.equal(next.arrangement.duration, 35);assert.equal(editorLanes(next).length, 1);
  for (const track of next.tracks) { assert.equal(track.laneId, destination.id);assert.equal(track.volume, 21);assert.equal(track.muted, true);assert.equal(track.solo, true); }
  assert.equal(next.tracks[0].clipStart, before.tracks[0].clipStart);assert.equal(next.tracks[0].sourceId, source.id);
  assert.deepEqual(current, before);
  assert.throws(() => commitEditorPlacement(current, source.id, { start: 1, end: 11, fadeIn: 0, fadeOut: 0 }, 20, 'move', 'missing'), /destination/);
  assert.throws(() => commitEditorPlacement(current, source.id, { start: 299, end: 309, fadeIn: 0, fadeOut: 0 }, 20), /arrangement/);
  assert.deepEqual(current, before);
});

test('editor edge trims change source offsets; the repeat handle extends the same audio clip', () => {
  const current = mix(clip({ clipStart: 2, clipEnd: 7, placement: { start: 1, end: 6, fadeIn: 0, fadeOut: 0 } }));
  const trimmed = commitEditorPlacement(current, source.id, { start: 3, end: 6, fadeIn: 0, fadeOut: 0 }, 20, 'start');
  near(trimmed.tracks[0].clipStart, 4);near(trimmed.tracks[0].clipEnd, 7);
  const repeated = commitEditorPlacement(trimmed, source.id, { start: 3, end: 30, fadeIn: 0, fadeOut: 0 }, 20, 'repeat');
  assert.equal(repeated.tracks[0].loop, true);assert.equal(repeated.arrangement.duration, 30);assert.equal(repeated.sources.length, 1);
  near(repeated.tracks[0].clipStart, 4);near(repeated.tracks[0].clipEnd, 7);
  assert.equal(current.tracks[0].loop, false);
});

test('duplicate at a new song position retains the split-loop phase and inherited fade curve', () => {
  const original = clip({ loop: true, clipStart: 2, clipEnd: 5, placement: { start: 0, end: 18, fadeIn: 4, fadeOut: 2 } });
  const split = splitClip(mix(original), source.id, 2, 20, 'custom-right');
  const next = duplicateEditorClipAt(split, 'custom-right', 25, 20, 'custom-copy');
  const copy = next.tracks.at(-1);near(copy.placement.start, 25);near(copy.placement.end, 41);near(copy.sourceOffset, 2);
  assert.equal(copy.laneId, source.id);assert.equal(next.arrangement.duration, 41);
  for (const time of [2.2, 3, 6, 17]) near(windowGain(split.tracks[1].gainEnvelope, time), windowGain(copy.gainEnvelope, time + 23));
  assert.throws(() => duplicateEditorClipAt(split, 'custom-right', 290, 20, 'custom-over'), /5:00/);
});

test('copying audible content excludes silent padding while keeping its original fade sound', () => {
  const original = clip({ clipStart: 0, clipEnd: 5, placement: { start: 0, end: 20, fadeIn: 10, fadeOut: 10 } });
  const next = duplicateEditorClipAt(mix(original), source.id, 25, 20, 'custom-copy');const copy = next.tracks.at(-1);
  near(copy.placement.end, 30);assert.ok(copy.placement.fadeIn + copy.placement.fadeOut <= 5);
  const audible = editorClipWindow(original, mix(original).arrangement, 20);
  for (const time of [.5, 2, 4.5]) near(windowGain(audible, time), windowGain(copy.gainEnvelope, time + 25));
  const before = setup(), after = setup();
  scheduleNormalTrack({ context: before.context, output: {}, track: original, tracks: [original], buffer: { duration: 20 }, when: 0, offset: 0, arrangement: mix(original).arrangement });
  scheduleNormalTrack({ context: after.context, output: {}, track: copy, tracks: [copy], buffer: { duration: 20 }, when: 0, offset: 25, arrangement: next.arrangement });
  assert.deepEqual(after.gains[1].gain.events, before.gains[1].gain.events);
  assert.deepEqual(validateMix(serializeMix(next)).tracks.at(-1).gainEnvelope, copy.gainEnvelope);
});

test('opening a legacy Free mix gives a four-minute one-shot room without altering saved timing or loops', () => {
  const current = { ...mix(clip({ clipStart: 0, clipEnd: null, placement: { start: 0, end: null, fadeIn: 0, fadeOut: 0 } })), arrangement: { enabled: false, duration: 30 } };
  const next = editorTimelineMix(current, { [source.id]: 240 });assert.equal(next.arrangement.duration, 240);assert.equal(next.arrangement.enabled, true);
  assert.deepEqual(next.tracks, current.tracks);assert.equal(current.arrangement.enabled, false);
  assert.equal(editorTimelineMix(current, { [source.id]: 900 }).arrangement.duration, 300);
  const timed = { ...current, tracks: [clip({ placement: { start: 0, end: 45, fadeIn: 0, fadeOut: 0 } })] };
  assert.equal(editorTimelineMix(timed, { [source.id]: 240 }).arrangement.duration, 45);
  const loop = { ...current, tracks: [clip({ loop: true, placement: { start: 0, end: null, fadeIn: 0, fadeOut: 0 } })] };
  assert.equal(editorTimelineMix(loop, { [source.id]: 240 }).arrangement.duration, 30);
});

test('portable backups keep independent legacy tracks separate and remap explicit shared track groups', async () => {
  const independent = clip({ id: 'custom-independent', volume: 31 });
  const current = splitClip({ ...mix(), tracks: [clip(), independent] }, source.id, 5, 20, 'custom-right');
  const backup = await createProjectBackup({ mix: current, name: 'Track groups', resolveAudio: () => new Blob(['audio'], { type: 'audio/wav' }) });
  const inspected = await inspectProjectBackup(backup), restored = restoredProject(inspected, 'Track groups');
  assert.equal(editorLanes(restored.mix).length, 2);assert.equal(editorLanes(restored.mix)[0].clips.length, 2);
  assert.equal(restored.mix.tracks[0].laneId, restored.mix.tracks[1].laneId);assert.notEqual(restored.mix.tracks[0].laneId, source.id);
  assert.equal(Object.hasOwn(restored.mix.tracks[2], 'laneId'), false);assert.equal(restored.mix.tracks[2].volume, 31);
});

test('an included sound keeps its editor track name and routing through save and reload', () => {
  const current = defaultMix();current.tracks[0] = { ...current.tracks[0], laneId: 'rain', name: 'Texture', role: 'music' };
  const saved = serializeMix(current), restored = validateMix(saved);
  assert.equal(restored.tracks[0].name, 'Texture');assert.equal(restored.tracks[0].role, 'music');assert.deepEqual(serializeMix(restored), saved);
});

test('the editor uses audible one-shot ends and fitted fades without rewriting legacy placements', () => {
  const original = clip({ clipStart: 0, clipEnd: null, placement: { start: 3, end: null, fadeIn: 15, fadeOut: 15 } });
  const before = structuredClone(original), arrangement = { enabled: true, duration: 120 };
  const window = editorClipWindow(original, arrangement, 12);
  assert.deepEqual(window, { start: 3, end: 15, fadeIn: 6, fadeOut: 6 });
  const moved = commitEditorPlacement(mix(original), original.id, { ...window, start: 20, end: 32 }, 12);
  assert.equal(moved.tracks[0].placement.end, 32);
  assert.equal(moved.tracks[0].placement.fadeIn, 6);
  assert.deepEqual(original, before);
  assert.equal(editorClipWindow(original, arrangement).end, 120);
  assert.equal(editorClipWindow({ ...original, loop: true }, arrangement, 12).end, 120);
  assert.equal(editorClipWindow({ ...original, sequence: { enabled: true, steps: Array(16).fill(true) } }, arrangement, 12).end, 120);
});

test('editor region ends respect cropped audio, split offsets and earlier explicit exits', () => {
  const original = clip({ clipStart: 2, clipEnd: 12, sourceOffset: 3, placement: { start: 5, end: 30, fadeIn: 0, fadeOut: 0 } });
  const arrangement = { enabled: true, duration: 60 };
  assert.equal(editorClipWindow(original, arrangement, 20).end, 12);
  assert.equal(editorClipWindow({ ...original, placement: { ...original.placement, end: 8 } }, arrangement, 20).end, 8);
});

test('fitting song end removes one-shot padding without changing the source range or scheduled fade sound', () => {
  const original = clip({ clipStart: 2, clipEnd: 7, placement: { start: 1, end: 20, fadeIn: 8, fadeOut: 6 } });
  const current = { ...mix(original), arrangement: { enabled: true, duration: 120 } }, before = structuredClone(current);
  const next = fitEditorSongEnd(current, { [source.id]: 20 }), fitted = next.tracks[0];
  near(next.arrangement.duration, 6);near(fitted.placement.end, 6);assert.equal(fitted.clipStart, 2);assert.equal(fitted.clipEnd, 7);
  const oldGraph = setup(), newGraph = setup();
  scheduleNormalTrack({ context: oldGraph.context, output: {}, track: original, tracks: [original], buffer: { duration: 20 }, when: 0, offset: 0, arrangement: current.arrangement });
  scheduleNormalTrack({ context: newGraph.context, output: {}, track: fitted, tracks: [fitted], buffer: { duration: 20 }, when: 0, offset: 0, arrangement: next.arrangement });
  assert.deepEqual(newGraph.sources[0].starts, oldGraph.sources[0].starts);assert.deepEqual(newGraph.gains[1].gain.events, oldGraph.gains[1].gain.events);
  assert.deepEqual(current, before);assert.deepEqual(next.sources, before.sources);assert.equal(validateMix(serializeMix(next)).arrangement.duration, 6);
});

test('fitting uses the latest source-offset one-shot and retains existing split envelopes', () => {
  const envelope = { start: 0, end: 40, fadeIn: 10, fadeOut: 5 };
  const original = clip({ clipStart: 0, clipEnd: 10, sourceOffset: 3, gainEnvelope: envelope, placement: { start: 20, end: 50, fadeIn: 0, fadeOut: 0 } });
  const other = clip({ id: 'custom-other', clipStart: 0, clipEnd: null, placement: { start: 0, end: 120, fadeIn: 0, fadeOut: 0 } });
  const current = { ...mix(), tracks: [other, original], arrangement: { enabled: true, duration: 120 } };
  const next = fitEditorSongEnd(current, { [source.id]: 20, [other.id]: 12 });
  near(next.arrangement.duration, 27);near(next.tracks[0].placement.end, 12);near(next.tracks[1].placement.end, 27);
  assert.deepEqual(next.tracks[1].gainEnvelope, envelope);assert.equal(next.tracks[1].sourceOffset, 3);
});

test('fitting preserves loop and sequenced windows and treats sub-second songs as at least one second', () => {
  const loop = clip({ loop: true, placement: { start: 0, end: 40, fadeIn: 0, fadeOut: 3 } });
  const sequence = clip({ id: 'custom-sequence', sequence: { enabled: true, steps: Array(16).fill(true) }, placement: { start: 0, end: 60, fadeIn: 0, fadeOut: 0 } });
  const current = { ...mix(), tracks: [loop, sequence], arrangement: { enabled: true, duration: 120 } };
  const next = fitEditorSongEnd(current, {});assert.equal(next.arrangement.duration, 60);assert.deepEqual(next.tracks, current.tracks);
  const unboundedLoop = { ...current, tracks: [{ ...loop, placement: { ...loop.placement, end: null } }] };
  assert.equal(fitEditorSongEnd(unboundedLoop, {}).arrangement.duration, 120);
  const tiny = mix(clip({ clipStart: 0, clipEnd: null, placement: { start: 0, end: 20, fadeIn: 0, fadeOut: 0 } }));
  const fitted = fitEditorSongEnd(tiny, { [source.id]: .02 });assert.equal(fitted.arrangement.duration, 1);near(fitted.tracks[0].placement.end, .05);
});

test('missing or invalid metadata rejects fitting before any source, clip, or saved timing is changed', () => {
  const current = mix(), before = structuredClone(current);
  for (const durations of [{}, { [source.id]: NaN }, { [source.id]: 0 }]) assert.throws(() => fitEditorSongEnd(current, durations), /original audio/);
  assert.deepEqual(current, before);
});

test('moving a vocal into an instrumental track preserves its region label and destination header through deletion and restore', async () => {
  const instrumental = { id: 'custom-instrumental', catalogId: null, name: 'Instrumental.wav', role: 'music' };
  const vocal = clip({ name: 'Vocal.wav' }), backing = { ...clip({ id: 'custom-backing' }), sourceId: instrumental.id, name: 'Instrumental.wav', role: 'music' };
  const current = { ...mix(vocal), sources: [source, instrumental], tracks: [vocal, backing] };
  const moved = commitEditorPlacement(current, vocal.id, vocal.placement, 20, 'move', backing.id);
  assert.equal(moved.tracks[0].name, 'Vocal.wav');assert.equal(moved.tracks[1].name, 'Instrumental.wav');
  assert.equal(editorLanes(moved)[0].name, 'Instrumental.wav');assert.ok(moved.tracks.every(track => track.laneName === 'Instrumental.wav'));
  const remaining = { ...moved, tracks: moved.tracks.filter(track => track.id !== backing.id) };
  assert.equal(editorLanes(remaining)[0].name, 'Instrumental.wav');assert.equal(remaining.tracks[0].name, 'Vocal.wav');
  const reloaded = validateMix(serializeMix(remaining));assert.equal(editorLanes(reloaded)[0].name, 'Instrumental.wav');assert.equal(reloaded.tracks[0].name, 'Vocal.wav');
  const backup = await createProjectBackup({ mix: remaining, name: 'Region labels', resolveAudio: () => new Blob(['audio'], { type: 'audio/wav' }) });
  const restored = restoredProject(await inspectProjectBackup(backup), 'Region labels');
  assert.equal(editorLanes(restored.mix)[0].name, 'Instrumental.wav');assert.equal(restored.mix.tracks[0].name, 'Vocal.wav');
});

test('split and duplicate track names remain stable after the original region is removed; renaming preserves clip names', () => {
  const split = splitClip(mix(), source.id, 5, 20, 'custom-right');
  const copied = duplicateClip(split, 'custom-right', 'custom-copy');
  const remaining = { ...copied, tracks: copied.tracks.filter(track => track.id !== source.id) };
  assert.ok(remaining.tracks.every(track => track.laneName === source.name));assert.equal(editorLanes(remaining)[0].name, source.name);
  const renamed = editEditorLane(remaining, source.id, { name: 'Lead vocal' });
  assert.deepEqual(renamed.tracks.map(track => track.name), remaining.tracks.map(track => track.name));assert.equal(editorLanes(renamed)[0].name, 'Lead vocal');
  const reloaded = validateMix(serializeMix(renamed));assert.equal(editorLanes(reloaded)[0].name, 'Lead vocal');assert.deepEqual(reloaded.tracks.map(track => track.name), remaining.tracks.map(track => track.name));
});

test('enabling Repeat keeps a legacy one-shot at its visible twelve-second footprint with the same fitted fades', () => {
  const original = clip({ clipStart: 2, clipEnd: 14, placement: { start: 0, end: null, fadeIn: 15, fadeOut: 15 } });
  const current = { ...mix(original), arrangement: { enabled: true, duration: 120 } }, before = structuredClone(current);
  const next = setEditorClipLoop(current, source.id, true, 20), repeated = next.tracks[0];
  assert.deepEqual(repeated.placement, { start: 0, end: 12, fadeIn: 6, fadeOut: 6 });assert.equal(repeated.loop, true);
  assert.equal(next.arrangement.duration, 120);assert.equal(repeated.clipStart, 2);assert.equal(repeated.clipEnd, 14);assert.deepEqual(current, before);
  const oldGraph = setup(), newGraph = setup();
  scheduleNormalTrack({ context: oldGraph.context, output: {}, track: original, tracks: [original], buffer: { duration: 20 }, when: 0, offset: 0, arrangement: current.arrangement });
  scheduleNormalTrack({ context: newGraph.context, output: {}, track: repeated, tracks: [repeated], buffer: { duration: 20 }, when: 0, offset: 0, arrangement: next.arrangement });
  assert.deepEqual(newGraph.sources[0].starts, oldGraph.sources[0].starts);assert.deepEqual(newGraph.gains[1].gain.events, oldGraph.gains[1].gain.events);
});

test('Repeat toggle preserves inherited split envelopes and disabling it retains the configured window', () => {
  const envelope = { start: 0, end: 120, fadeIn: 4, fadeOut: 20 };
  const original = clip({ clipStart: 2, clipEnd: 14, sourceOffset: 3, gainEnvelope: envelope, placement: { start: 5, end: 120, fadeIn: 0, fadeOut: 0 } });
  const current = { ...mix(original), arrangement: { enabled: true, duration: 120 } };
  const next = setEditorClipLoop(current, source.id, true, 20);near(next.tracks[0].placement.end, 14);assert.deepEqual(next.tracks[0].gainEnvelope, envelope);assert.equal(next.tracks[0].sourceOffset, 3);
  const extended = { ...next, tracks: [{ ...next.tracks[0], placement: { ...next.tracks[0].placement, end: 80 } }] };
  const disabled = setEditorClipLoop(extended, source.id, false);assert.equal(disabled.tracks[0].loop, false);assert.equal(disabled.tracks[0].placement.end, 80);assert.deepEqual(disabled.tracks[0].gainEnvelope, envelope);
});

test('Repeat rejects unavailable source metadata atomically', () => {
  const current = mix(), before = structuredClone(current);
  for (const duration of [undefined, NaN, 0]) assert.throws(() => setEditorClipLoop(current, source.id, true, duration), /original audio/);
  assert.deepEqual(current, before);
});
