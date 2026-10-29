import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockTime } from '../src/lib/timeFormat.js';
import { parsePlaybackTime } from '../src/lib/playbackTimeline.js';

test('clock labels use minutes and seconds without redundant decimals', () => {
  assert.equal(clockTime(0), '0:00');
  assert.equal(clockTime(90), '1:30');
  assert.equal(clockTime(300), '5:00');
  assert.equal(clockTime(75, 3), '1:15');
  assert.equal(clockTime(.18, 3), '0:00.18');
  assert.equal(clockTime(1.25, 3), '0:01.25');
});

test('rounding carries into the next minute without displaying 0:60', () => {
  assert.equal(clockTime(59.9999, 3), '1:00');
  assert.equal(clockTime(59.995, 2), '1:00');
  assert.equal(clockTime(119.9999, 3), '2:00');
  assert.equal(clockTime(59.999, 3), '0:59.999');
});

test('editable clock values preserve sample boundaries through the existing time parser', () => {
  for (const seconds of [0, .05, .18, 1.25, 59.999, 90.5, 300, 899.999]) {
    assert.equal(parsePlaybackTime(clockTime(seconds, 3)), seconds);
  }
  assert.equal(parsePlaybackTime('1:30'), 90);
  assert.equal(parsePlaybackTime('90'), 90);
  assert.throws(() => parsePlaybackTime('1:60'));
  assert.throws(() => parsePlaybackTime('5:01', 300));
});
