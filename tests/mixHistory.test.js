import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MixHistory } from '../src/lib/mixHistory.js';
import { defaultMix, serializeMix } from '../src/lib/studioState.js';
import { duplicateClip, splitClip } from '../src/lib/clipInstances.js';

const mix = () => serializeMix(defaultMix());

test('split and delete undo/redo restore exact clip ranges, gains and source identities', () => {
  const history = new MixHistory(), original = mix();original.arrangement.enabled = true;
  const split = splitClip(original, 'rain', 3, 20, 'custom-right');
  history.record(original, split, { label: 'Split clip', selectedId: 'rain' });
  const restored = history.apply('undo', split, 'custom-right');
  assert.deepEqual(restored.mix, original);assert.equal(restored.selectedId, 'rain');
  const redone = history.apply('redo', original, 'rain');assert.deepEqual(redone.mix, split);assert.equal(redone.selectedId, 'custom-right');
  const removed = { ...split, tracks: split.tracks.filter(track => track.id !== 'custom-right') };
  history.record(split, removed, { label: 'Remove clip', selectedId: 'custom-right' });
  assert.deepEqual(history.apply('undo', removed, null).mix, split);
});

test('one held slider gesture is one undo action; the next gesture is separate', () => {
  const history = new MixHistory();let current = mix();const original = current;
  history.begin('master');
  for (const master of [70, 60, 40]) { const next = { ...current, master };history.record(current, next, { label: 'Master level', key: 'master' });current = next; }
  history.end('master');assert.equal(history.past.length, 1);assert.equal(history.apply('undo', current, null).mix.master, original.master);
  history.apply('redo', original, null);history.begin('master');const next = { ...current, master: 30 };history.record(current, next, { key: 'master' });history.end();assert.equal(history.past.length, 2);
});

test('new edits clear redo, but no-op changes and playback-mode changes do not create edit entries', () => {
  const history = new MixHistory(), before = mix(), after = { ...before, master: 40 };
  history.record(before, after, { label: 'Level' });history.apply('undo', after, null);
  assert.equal(history.record(before, structuredClone(before)), false);assert.equal(history.future.length, 1);
  assert.equal(history.record(before, { ...before, arrangement: { ...before.arrangement, enabled: true } }), false);
  history.record(before, { ...before, bpm: 120 });assert.equal(history.future.length, 0);
});

test('restoring an edit keeps the listening mode instead of undoing transport navigation', () => {
  const history = new MixHistory(), before = mix(), edited = duplicateClip(before, 'rain', 'custom-copy');
  history.record(before, edited, { label: 'Duplicate clip' });
  const result = history.apply('undo', { ...edited, arrangement: { ...edited.arrangement, enabled: true } }, null);
  assert.equal(result.mix.arrangement.enabled, true);assert.equal(result.mix.tracks.length, 3);
});

test('history is bounded and protects file IDs until the final undo/redo reference is discarded', () => {
  const history = new MixHistory(2);
  const before = { ...mix(), sources: [{ id: 'custom-file', catalogId: null, name: 'Voice.wav', role: 'vocal' }], tracks: [] };
  const empty = { ...before, sources: [] };history.record(before, empty, { label: 'Remove source' });
  assert.equal(history.audioIds().has('custom-file'), true);
  history.record(empty, { ...empty, master: 40 });history.record({ ...empty, master: 40 }, { ...empty, master: 30 });
  assert.equal(history.past.length, 2);assert.equal(history.audioIds().has('custom-file'), false);
  history.clear();assert.deepEqual(history.status(), { undo: null, redo: null });
});

test('metadata snapshots never retain File, AudioBuffer, temporary URLs or mutable source arrays', () => {
  const history = new MixHistory(), before = mix();before.tracks[0].file = new Blob(['large']);before.tracks[0].src = 'blob:temporary';
  history.record(before, { ...before, master: 20 });before.sources[0].name = 'Mutated';
  const serialized = JSON.stringify(history.past);assert.equal(serialized.includes('temporary'), false);assert.equal(serialized.includes('large'), false);
  assert.equal(history.past[0].mix.sources[0].name, 'Rain');
});

test('a multi-row drum creation is undone atomically with its shared source', () => {
  const history = new MixHistory(), before = mix();const source = { id: 'custom-kit', name: 'Drums.wav', role: 'music', catalogId: null };
  const after = { ...before, sources: [...before.sources, source], tracks: [...before.tracks, ...['Kick', 'Snare', 'Hat'].map((name, i) => ({ id: 'custom-drum-' + i, sourceId: source.id, name, catalogId: null, role: 'music', volume: 50 }))] };
  history.record(before, after, { label: 'Add drum beat' });const undone = history.apply('undo', after, null);
  assert.deepEqual(undone.mix, before);assert.equal(history.audioIds().has(source.id), true);assert.equal(history.future.length, 1);
});
