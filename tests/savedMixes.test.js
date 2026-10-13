import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeProject, MAX_SAVED_MIXES, mixName, referencedAudio, sameMix, validateProjects } from '../src/lib/savedMixes.js';
import { defaultMix } from '../src/lib/studioState.js';

const firstDate = '2026-10-13T19:00:00.000Z';
const laterDate = '2026-10-13T20:00:00.000Z';
const save = (projects, id, name, mix = defaultMix()) => changeProject(projects, 'save', { id, name, mix, now: firstDate });
const recording = { id: 'custom-field', catalogId: null, name: 'field.wav', role: 'nature', volume: 42, muted: false, solo: true, loop: true };

test('names are trimmed, whitespace is normalized, and duplicates are case insensitive', () => {
  assert.equal(mixName('  Rainy   Evening  '), 'Rainy Evening');
  assert.throws(() => mixName('  '), /Enter a name/);
  assert.throws(() => mixName('x'.repeat(61)), /60 characters/);
  const projects = save([], 'mix-a', 'Rainy Evening');
  assert.throws(() => save(projects, 'mix-b', ' rainy evening '), /already exists/);
});

test('snapshots preserve all mixer controls without copying files or sharing mutable track objects', () => {
  const mix = { master: 28, tracks: [{ ...recording, file: 'large blob', src: 'blob:temporary' }] };
  const projects = save([], 'mix-a', 'Field recording', mix);
  mix.tracks[0].volume = 99;
  assert.equal(projects[0].mix.tracks[0].volume, 42);
  assert.equal(projects[0].mix.tracks[0].solo, true);
  assert.equal(projects[0].mix.master, 28);
  assert.equal(projects[0].mix.tracks[0].id, 'custom-field');
  assert.equal(JSON.stringify(projects).includes('large blob'), false);
  assert.equal(JSON.stringify(projects).includes('blob:'), false);
});

test('update keeps identity and creation date; rename preserves the saved audio snapshot', () => {
  const original = save([], 'mix-a', 'First');
  const mix = { master: 0, tracks: [] };
  const updated = changeProject(original, 'update', { id: 'mix-a', mix, now: laterDate });
  assert.equal(updated[0].id, 'mix-a');
  assert.equal(updated[0].createdAt, firstDate);
  assert.equal(updated[0].updatedAt, laterDate);
  assert.equal(updated[0].name, 'First');
  assert.equal(original[0].mix.tracks.length, 3);
  const renamed = changeProject(updated, 'rename', { id: 'mix-a', name: 'New name', now: laterDate });
  assert.deepEqual(renamed[0].mix, updated[0].mix);
  assert.equal(renamed[0].name, 'New name');
  const two = save(renamed, 'mix-b', 'Other');
  assert.throws(() => changeProject(two, 'rename', { id: 'mix-a', name: 'OTHER' }), /already exists/);
});

test('the collection limit blocks new mixes but allows updates and empty workspaces', () => {
  let projects = [];
  for (let index = 0; index < MAX_SAVED_MIXES; index += 1) projects = save(projects, 'mix-' + index, 'Mix ' + index);
  assert.throws(() => save(projects, 'mix-over', 'One more'), /20 mixes/);
  const updated = changeProject(projects, 'update', { id: 'mix-0', mix: { master: 0, tracks: [] } });
  assert.equal(updated.find((project) => project.id === 'mix-0').mix.tracks.length, 0);
});

test('audio references survive removing one saved mix and the final reference can be reclaimed', () => {
  const mix = { master: 70, tracks: [recording] };
  const projects = save(save([], 'mix-a', 'A', mix), 'mix-b', 'B', mix);
  const one = changeProject(projects, 'delete', { id: 'mix-a' });
  assert.equal(referencedAudio([], one).has(recording.id), true);
  const none = changeProject(one, 'delete', { id: 'mix-b' });
  assert.equal(referencedAudio([recording], none).has(recording.id), true);
  assert.equal(referencedAudio([], none).has(recording.id), false);
});

test('invalid stored collections fail without silently replacing or discarding records', () => {
  const projects = save([], 'mix-a', 'A');
  assert.throws(() => validateProjects([{ ...projects[0], version: 9 }]), /preserved/);
  assert.throws(() => validateProjects([{ ...projects[0], updatedAt: 'bad date' }]), /preserved/);
  assert.throws(() => validateProjects([projects[0], projects[0]]), /conflicting/);
  assert.throws(() => validateProjects([{ ...projects[0], mix: { version: 1, tracks: [{ id: 'invalid' }] } }]), /preserved/);
  assert.equal(projects.length, 1);
});

test('missing project actions and duplicate identities fail rather than creating accidental records', () => {
  const projects = save([], 'mix-a', 'A');
  for (const action of ['update', 'rename', 'delete']) assert.throws(() => changeProject(projects, action, { id: 'mix-missing', name: 'X', mix: defaultMix() }), /no longer exists/);
  assert.throws(() => save(projects, 'mix-a', 'Again'), /already exists/);
  assert.throws(() => changeProject(projects, 'unknown', { id: 'mix-a' }), /Unknown/);
});

test('dirty checks use ordered mixer metadata and ignore temporary audio details', () => {
  const mix = defaultMix();
  const copy = structuredClone(mix);
  copy.tracks[0].src = 'blob:temporary';
  assert.equal(sameMix(mix, copy), true);
  copy.tracks[0].muted = true;
  assert.equal(sameMix(mix, copy), false);
  copy.tracks[0].muted = false;
  copy.tracks.reverse();
  assert.equal(sameMix(mix, copy), false);
});
