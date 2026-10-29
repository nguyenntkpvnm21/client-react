import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupFilename, createProjectBackup, inspectProjectBackup, MAX_BACKUP_BYTES, restoredProject } from '../src/lib/projectBackup.js';
import { defaultMix, serializeMix } from '../src/lib/studioState.js';
import { SCENES, sceneMix, scenePreviewMix } from '../src/lib/scenes.js';
import { validatePlacement } from '../src/lib/arrangementState.js';
import { SOUNDS } from '../src/data/sounds.js';

const audio = (value = 'original audio bytes') => new Blob([value], { type: 'audio/mpeg' });
const pack = (mix = defaultMix()) => createProjectBackup({ mix, name: 'A night outside', resolveAudio: (track) => audio(track.id) });
async function rewrite(blob, change) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const length = new DataView(bytes.buffer).getUint32(8);
  const manifest = JSON.parse(new TextDecoder().decode(bytes.slice(12, 12 + length)));
  change(manifest);
  const next = new TextEncoder().encode(JSON.stringify(manifest));
  const header = bytes.slice(0, 12);new DataView(header.buffer).setUint32(8, next.length);
  return new Blob([header, next, bytes.slice(12 + length)]);
}

test('project round trip preserves clips, independent rhythm, cleared steps, routing, timing and all original bytes', async () => {
  const mix = defaultMix();
  mix.master = 63;mix.bpm = 127;mix.arrangement = { enabled: true, duration: 123 };
  mix.tracks[0] = { ...mix.tracks[0], clipStart: 4, clipEnd: 12, muted: true, solo: true,
    placement: { start: 8, end: 90, fadeIn: 3, fadeOut: 7 },
    rhythm: { initialized: true, sampleStart: 13, sampleEnd: 15, tailMode: 'ring' },
    sequence: { initialized: true, enabled: false, steps: Array(16).fill(false) } };
  mix.tracks.push({ ...mix.tracks[0], id: 'custom-vocal', sourceId: 'custom-vocal', catalogId: null, name: 'Vocal.wav', role: 'vocal', loop: false });
  mix.sources.push({ id: 'custom-vocal', catalogId: null, name: 'Vocal.wav', role: 'vocal' });
  const parsed = await inspectProjectBackup(await pack(mix));
  const withoutIdentity = (track) => ({ ...track, id: null, sourceId: null, catalogId: null });
  assert.deepEqual(parsed.mix.tracks.map(withoutIdentity), serializeMix(mix).tracks.map(withoutIdentity));
  assert.equal(parsed.mix.master, mix.master);assert.equal(parsed.mix.bpm, mix.bpm);assert.deepEqual(parsed.mix.arrangement, mix.arrangement);
  for (let index = 0; index < mix.tracks.length; index += 1) assert.equal(await parsed.files.get(parsed.mix.tracks[index].sourceId).text(), mix.tracks[index].id);
  let index = 0;
  const restored = restoredProject(parsed, 'Restored version', () => 'new-' + index++);
  assert.equal(restored.name, 'Restored version');assert.equal(restored.files.size, 4);
  assert.ok(restored.mix.tracks.every((track) => track.id.startsWith('custom-new-') && track.catalogId === null));
  assert.deepEqual(restored.mix.tracks.map(withoutIdentity), parsed.mix.tracks.map(withoutIdentity));
  const again = await inspectProjectBackup(await createProjectBackup({ mix: restored.mix, name: restored.name,
    resolveAudio: (track) => restored.files.get(track.id) }));
  assert.deepEqual(again.mix.tracks.map(withoutIdentity), restored.mix.tracks.map(withoutIdentity));
  assert.equal(again.mix.master, restored.mix.master);assert.deepEqual(again.mix.arrangement, restored.mix.arrangement);
});

test('backup never decodes audio and reads source layers sequentially', async () => {
  let active = false, count = 0;
  const blob = await createProjectBackup({ mix: defaultMix(), name: 'Sequential', resolveAudio: async () => {
    assert.equal(active, false);active = true;
    await Promise.resolve();active = false;count += 1;return audio();
  } });
  assert.equal(count, 3);assert.ok(blob.size > 12);
});

test('missing and oversized originals fail instead of creating an incomplete backup', async () => {
  await assert.rejects(createProjectBackup({ mix: defaultMix(), name: 'Missing', resolveAudio: () => null }), /missing/);
  await assert.rejects(createProjectBackup({ mix: defaultMix(), name: 'Empty', resolveAudio: () => new Blob([]) }), /30 MiB/);
  await assert.rejects(createProjectBackup({ mix: defaultMix(), name: 'Large', resolveAudio: () => new Blob([new Uint8Array(30 * 1024 * 1024 + 1)]) }), /30 MiB/);
});

test('truncated, wrong magic, unknown version, oversized metadata and trailing data are rejected', async () => {
  const blob = await pack();
  const wrong = new Uint8Array(await blob.arrayBuffer());wrong[0] = 0;
  const hugeHeader = new Uint8Array(await blob.slice(0, 12).arrayBuffer());new DataView(hugeHeader.buffer).setUint32(8, 300000);
  for (const bad of [new Blob([]), blob.slice(0, 9), blob.slice(0, -1), new Blob([wrong]),
    new Blob([hugeHeader]), new Blob([blob, 'extra']), await rewrite(blob, (value) => { value.version = 99; })]) {
    await assert.rejects(inspectProjectBackup(bad), /damaged or unsupported/);
  }
  assert.ok(MAX_BACKUP_BYTES < 241 * 1024 * 1024);
});

test('audio corruption is detected even when container size and metadata are unchanged', async () => {
  const bytes = new Uint8Array(await (await pack()).arrayBuffer());bytes[bytes.length - 1] ^= 1;
  await assert.rejects(inspectProjectBackup(new Blob([bytes])), /integrity check failed/);
});

test('duplicate, missing, unknown and oversized audio entries are rejected', async () => {
  const blob = await pack();
  for (const change of [
    (value) => { value.assets[1].trackId = value.assets[0].trackId; },
    (value) => { value.assets.pop(); },
    (value) => { value.assets[0].trackId = 'custom-not-in-mix'; },
    (value) => { value.assets[0].size = -1; },
    (value) => { value.assets[0].size = 30 * 1024 * 1024 + 1; },
    (value) => { value.assets[0].sha256 = 'bad'; },
  ]) await assert.rejects(inspectProjectBackup(await rewrite(blob, change)), /damaged or unsupported/);
});

test('invalid mix values and unknown track ids are rejected without silently normalizing or dropping them', async () => {
  const blob = await pack();
  for (const change of [
    (value) => { value.mix.master = 1000; },
    (value) => { value.mix.tracks[0].id = 'invalid'; },
    (value) => { value.mix.tracks[0].sequence.steps = [true]; },
    (value) => { value.mix.tracks.push(value.mix.tracks[0]); },
    (value) => { value.mix.arrangement.duration = 999; },
  ]) await assert.rejects(inspectProjectBackup(await rewrite(blob, change)), /damaged or unsupported/);
});

test('empty projects can be transferred and restored without inventing audio', async () => {
  const parsed = await inspectProjectBackup(await pack({ ...defaultMix(), sources: [], tracks: [] }));
  const restored = restoredProject(parsed, 'Empty');
  assert.equal(restored.files.size, 0);assert.equal(restored.mix.tracks.length, 0);
});

test('embedded recordings remain restorable after the included catalog has been removed or replaced', async () => {
  const blob = await pack();
  const catalog = [...SOUNDS];
  try {
    SOUNDS.splice(0, SOUNDS.length);
    const parsed = await inspectProjectBackup(blob);
    assert.equal(parsed.mix.tracks.length, 3);
    assert.ok(parsed.mix.tracks.every((track) => track.catalogId === null));
    const restored = restoredProject(parsed, 'Independent');
    assert.equal(restored.files.size, 3);
    assert.deepEqual(restored.mix.tracks.map((track) => track.name), ['Rain', 'Birds', 'Music']);
  } finally { SOUNDS.push(...catalog); }
});

test('safe download filenames keep Unicode names and strip path punctuation', () => {
  assert.equal(backupFilename('  Đêm mưa  '), 'Đêm-mưa.naturemix');
  assert.equal(backupFilename('../My: mix?'), 'My-mix.naturemix');
  assert.throws(() => backupFilename(' '), /Enter a name/);
});

test('canceling a project operation stops before returning or restoring partial data', async () => {
  const controller = new AbortController();controller.abort();
  await assert.rejects(createProjectBackup({ mix: defaultMix(), name: 'Canceled', signal: controller.signal, resolveAudio: audio }), { name: 'AbortError' });
  const blob = await pack();
  await assert.rejects(inspectProjectBackup(blob, undefined, controller.signal), { name: 'AbortError' });
  const during = new AbortController();
  await assert.rejects(inspectProjectBackup(blob, () => during.abort(), during.signal), { name: 'AbortError' });
});

test('scene starters use valid editable arrangements with distinct layer envelopes', () => {
  const mixes = SCENES.map((scene) => sceneMix(scene.id));
  for (const mix of mixes) {
    assert.equal(mix.arrangement.enabled, true);
    for (const track of mix.tracks) {
      assert.equal(track.loop, true);assert.equal(track.sequence.enabled, false);
      assert.deepEqual(validatePlacement(track.placement, mix.arrangement.duration), track.placement);
    }
  }
  assert.equal(mixes[0].tracks[0].catalogId, 'rain');assert.equal(mixes[1].tracks[0].catalogId, 'birds');
  assert.equal(mixes[2].tracks.length, 3);
  const independent = sceneMix(SCENES[0].id);independent.tracks[0].volume = 0;
  assert.notEqual(sceneMix(SCENES[0].id).tracks[0].volume, 0);
  assert.throws(() => sceneMix('unknown'), /unavailable/);
});

test('scene previews are finite excerpts and leave scene definitions unchanged', () => {
  for (const scene of SCENES) {
    const original = sceneMix(scene.id), preview = scenePreviewMix(scene.id);
    assert.equal(preview.arrangement.duration, 12);
    for (const track of preview.tracks) validatePlacement(track.placement, 12);
    assert.deepEqual(sceneMix(scene.id), original);
  }
});
