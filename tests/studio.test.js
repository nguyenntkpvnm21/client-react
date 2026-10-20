import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_FILE_BYTES, MAX_TRACKS } from '../src/data/sounds.js';
import { audibleGain, defaultMix, loadMix, serializeMix, validateAudioFile, validateMix } from '../src/lib/studioState.js';

test('existing mixer levels and mute migrate without changing track identities', () => {
  const legacy = [{ id: 'rain', volume: 62, muted: true }, { id: 'birds', volume: 9, muted: false }];
  const state = loadMix({ getItem: (key) => key === 'nature-mixer-settings-v1' ? JSON.stringify(legacy) : null });
  assert.equal(state.tracks.find((track) => track.id === 'rain').volume, 62);
  assert.equal(state.tracks.find((track) => track.id === 'rain').muted, true);
  assert.equal(state.tracks.find((track) => track.id === 'music').volume, 50);
});

test('saved mixes preserve an empty workspace and reject bad values and duplicate IDs', () => {
  assert.deepEqual(validateMix({ version: 1, tracks: [], master: 0 }), { tracks: [], master: 0, bpm: 100 });
  const state = validateMix({ version: 1, master: 900, tracks: [
    { id: 'rain', catalogId: 'rain', name: 'Bad rename', volume: -7, muted: 'yes' },
    { id: 'rain', catalogId: 'rain', volume: 99 },
    { id: 'unknown', name: 'Unknown' },
    { id: 'custom-file', name: 'field.wav', role: 'wrong', volume: 60, loop: false },
  ] });
  assert.equal(state.tracks.length, 2);
  assert.equal(state.tracks[0].name, 'Rain');
  assert.equal(state.tracks[0].volume, 30);
  assert.equal(state.tracks[0].muted, false);
  assert.equal(state.tracks[1].role, 'nature');
  assert.equal(state.master, 75);
  assert.equal(validateMix({ version: 9, tracks: [] }), null);
  assert.deepEqual(loadMix({ getItem: () => '{broken' }), defaultMix());
  assert.deepEqual(loadMix({ getItem: () => { throw new Error('Blocked'); } }), defaultMix());
});

test('only mix metadata is saved and restored track count is bounded', () => {
  const tracks = Array.from({ length: 20 }, (_, index) => ({ id: 'custom-' + index, name: 'sound.wav', role: 'nature', volume: 40, src: 'blob:temporary', file: 'large audio' }));
  const state = validateMix({ version: 1, tracks, master: 80 });
  assert.equal(state.tracks.length, MAX_TRACKS);
  const saved = JSON.stringify(serializeMix(state));
  assert.equal(saved.includes('blob:'), false);
  assert.equal(saved.includes('large audio'), false);
});

test('file validation catches empty, oversized and non-audio files before decoding', () => {
  assert.throws(() => validateAudioFile({ name: 'empty.mp3', size: 0, type: 'audio/mpeg' }), /empty/);
  assert.throws(() => validateAudioFile({ name: 'large.wav', size: MAX_FILE_BYTES + 1, type: 'audio/wav' }), /30 MB/);
  assert.throws(() => validateAudioFile({ name: 'notes.pdf', size: 100, type: 'application/pdf' }), /audio file/);
  assert.doesNotThrow(() => validateAudioFile({ name: 'recording.wav', size: 100, type: '' }));
});

test('solo respects explicit mute and leaves saved volume intact', () => {
  const tracks = [{ id: 'a', volume: 70, muted: false, solo: false }, { id: 'b', volume: 40, muted: false, solo: true }];
  assert.equal(audibleGain(tracks[0], tracks), 0);
  assert.equal(audibleGain(tracks[1], tracks), 0.4);
  tracks[1].muted = true;
  assert.equal(audibleGain(tracks[1], tracks), 0);
  assert.equal(tracks[0].volume, 70);
});
