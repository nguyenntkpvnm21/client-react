import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFocusState, focusReducer, hydrateFocusState, serializeFocusState,
  formatCountdown, getFocusInsights, validMinutes,
} from '../src/lib/focusSession.js';

const startTime = new Date(2026, 9, 11, 10, 0).getTime();
const act = (state, type, now, extra = {}) => focusReducer(state, { type, now, ...extra });

test('countdown uses elapsed timestamps even when callbacks arrive late', () => {
  let state = act(createFocusState(startTime), 'START', startTime, { id: 'first' });
  state = act(state, 'TICK', startTime + 65_000);
  assert.equal(state.remainingMs, 25 * 60_000 - 65_000);
  assert.equal(formatCountdown(state.remainingMs), '23:55');
  assert.equal(formatCountdown(1001), '00:02');
});

test('pause and resume preserve remaining time and do not count paused time', () => {
  let state = act(createFocusState(startTime), 'START', startTime, { id: 'paused' });
  state = act(state, 'PAUSE', startTime + 60_000);
  const remaining = state.remainingMs;
  state = act(state, 'TICK', startTime + 600_000);
  assert.equal(state.remainingMs, remaining);
  state = act(state, 'START', startTime + 600_000, { id: 'ignored' });
  assert.equal(state.deadline, startTime + 600_000 + remaining);
  assert.equal(state.sessionId, 'paused');
});

test('completed focus sessions are counted once, including after reload', () => {
  let state = act(createFocusState(startTime), 'DURATION', startTime, { minutes: 1 });
  state = act(state, 'START', startTime, { id: 'completed' });
  state = act(state, 'TICK', startTime + 90_000);
  assert.equal(state.status, 'completed');
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].completedAt, startTime + 60_000);
  state = act(state, 'TICK', startTime + 100_000);
  assert.equal(state.history.length, 1);
  state = hydrateFocusState(serializeFocusState(state), startTime + 200_000);
  assert.equal(state.history.length, 1);
  assert.equal(state.status, 'completed');
});

test('saved running sessions resume as paused without awarding closed-page time', () => {
  let state = act(createFocusState(startTime), 'START', startTime, { id: 'reload' });
  const saved = serializeFocusState(state, startTime + 20_000);
  state = hydrateFocusState(saved, startTime + 100_000_000);
  assert.equal(state.status, 'paused');
  assert.equal(state.remainingMs, 25 * 60_000 - 20_000);
  assert.equal(state.history.length, 0);
});

test('breaks complete without increasing focus statistics', () => {
  let state = act(createFocusState(startTime), 'MODE', startTime, { mode: 'break' });
  assert.equal(state.durationMs, 5 * 60_000);
  state = act(state, 'START', startTime, { id: 'break' });
  state = act(state, 'TICK', startTime + 5 * 60_000);
  assert.equal(state.status, 'completed');
  assert.equal(state.history.length, 0);
});

test('reset discards an unfinished session and duration changes cannot interrupt it', () => {
  let state = act(createFocusState(startTime), 'START', startTime, { id: 'unfinished' });
  state = act(state, 'DURATION', startTime + 10_000, { minutes: 50 });
  assert.equal(state.focusMinutes, 25);
  state = act(state, 'MODE', startTime + 20_000, { mode: 'break' });
  assert.equal(state.mode, 'focus');
  state = act(state, 'RESET', startTime + 30_000);
  assert.equal(state.status, 'idle');
  assert.equal(state.history.length, 0);
  assert.equal(state.remainingMs, 25 * 60_000);
});

test('invalid stored data is rejected and valid history is deduplicated', () => {
  assert.equal(hydrateFocusState(null, startTime).status, 'idle');
  assert.equal(hydrateFocusState({ version: 999 }, startTime).focusMinutes, 25);
  const record = { id: 'valid', minutes: 25, startedAt: startTime, completedAt: startTime + 25 * 60_000 };
  const restored = hydrateFocusState({ version: 1, history: [record, record, { ...record, id: 'bad', minutes: -1 }], timer: { mode: 'focus', focusMinutes: 0 } }, startTime);
  assert.equal(restored.history.length, 1);
  assert.equal(restored.focusMinutes, 25);
  assert.equal(validMinutes(1), true);
  assert.equal(validMinutes(180), true);
  for (const value of [0, -1, 181, 1.5, NaN, '25']) assert.equal(validMinutes(value), false);
});

test('daily and weekly statistics use local completion dates, not all-time totals', () => {
  const yesterday = new Date(2026, 9, 10, 23, 59).getTime();
  const earlier = new Date(2026, 8, 1, 10).getTime();
  const history = [
    { id: 'today', minutes: 25, completedAt: startTime },
    { id: 'yesterday', minutes: 50, completedAt: yesterday },
    { id: 'older', minutes: 100, completedAt: earlier },
  ];
  const insights = getFocusInsights(history, startTime);
  assert.equal(insights.todayMinutes, 25);
  assert.equal(insights.todaySessions, 1);
  assert.equal(insights.weekMinutes, 75);
  assert.equal(insights.week.length, 7);
  assert.equal(insights.week[6].minutes, 25);
});
