export const FOCUS_STORAGE_KEY = 'sound-focus-sessions-v1';
const MINUTE = 60_000;
const HISTORY_LIMIT = 500;

export function validMinutes(value) {
  return Number.isInteger(value) && value >= 1 && value <= 180;
}

export function createFocusState(now = Date.now()) {
  return {
    mode: 'focus', focusMinutes: 25, durationMs: 25 * MINUTE,
    remainingMs: 25 * MINUTE, status: 'idle', deadline: null,
    sessionId: null, startedAt: null, history: [], clock: now,
  };
}

function resetTimer(state, mode = state.mode, focusMinutes = state.focusMinutes) {
  const durationMs = (mode === 'break' ? 5 : focusMinutes) * MINUTE;
  return {
    ...state, mode, focusMinutes, durationMs, remainingMs: durationMs,
    status: 'idle', deadline: null, sessionId: null, startedAt: null,
  };
}

export function advanceTimer(state, now) {
  if (state.status !== 'running') return { ...state, clock: now };

  const remainingMs = Math.max(0, Math.min(state.durationMs, state.deadline - now));
  if (remainingMs > 0) return { ...state, remainingMs, clock: now };

  let history = state.history;
  if (state.mode === 'focus' && !history.some((record) => record.id === state.sessionId)) {
    history = [{
      id: state.sessionId, minutes: state.durationMs / MINUTE,
      startedAt: state.startedAt, completedAt: state.deadline,
    }, ...history].slice(0, HISTORY_LIMIT);
  }
  return { ...state, remainingMs: 0, status: 'completed', deadline: null, history, clock: now };
}

export function focusReducer(state, action) {
  const current = advanceTimer(state, action.now ?? state.clock);
  switch (action.type) {
    case 'TICK':
      return current;
    case 'START': {
      if (current.status === 'running') return current;
      const resuming = current.status === 'paused';
      const remainingMs = resuming ? current.remainingMs : current.durationMs;
      return {
        ...current, remainingMs, status: 'running',
        deadline: action.now + remainingMs,
        sessionId: resuming ? current.sessionId : action.id,
        startedAt: resuming ? current.startedAt : action.now,
      };
    }
    case 'PAUSE':
      return current.status === 'running'
        ? { ...current, status: 'paused', deadline: null }
        : current;
    case 'RESET':
      return resetTimer(current);
    case 'MODE':
      return ['idle', 'completed'].includes(current.status) && ['focus', 'break'].includes(action.mode)
        ? resetTimer(current, action.mode)
        : current;
    case 'DURATION':
      return ['idle', 'completed'].includes(current.status) && current.mode === 'focus' && validMinutes(action.minutes)
        ? resetTimer(current, 'focus', action.minutes)
        : current;
    default:
      return current;
  }
}

export function hydrateFocusState(data, now = Date.now()) {
  const initial = createFocusState(now);
  if (!data || data.version !== 1) return initial;

  const seen = new Set();
  const history = (Array.isArray(data.history) ? data.history : []).filter((record) => {
    if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 100 || seen.has(record.id) ||
        !validMinutes(record.minutes) || !Number.isFinite(record.startedAt) || record.startedAt <= 0 ||
        !Number.isFinite(record.completedAt) || record.completedAt < record.startedAt) return false;
    seen.add(record.id);
    return true;
  }).sort((a, b) => b.completedAt - a.completedAt).slice(0, HISTORY_LIMIT);

  const timer = data.timer;
  if (!timer || !validMinutes(timer.focusMinutes) || !['focus', 'break'].includes(timer.mode)) {
    return { ...initial, history };
  }
  const restored = { ...resetTimer(initial, timer.mode, timer.focusMinutes), history };
  if (timer.status === 'paused' && Number.isFinite(timer.remainingMs) && timer.remainingMs > 0 &&
      timer.remainingMs <= restored.durationMs && typeof timer.sessionId === 'string' && timer.sessionId &&
      timer.sessionId.length <= 100 && Number.isFinite(timer.startedAt) && timer.startedAt > 0) {
    return { ...restored, status: 'paused', remainingMs: timer.remainingMs,
      sessionId: timer.sessionId, startedAt: timer.startedAt };
  }
  if (timer.status === 'completed') return { ...restored, status: 'completed', remainingMs: 0 };
  return restored;
}

export function serializeFocusState(state, now = state.clock) {
  const current = advanceTimer(state, now);
  return {
    version: 1,
    timer: {
      mode: current.mode, focusMinutes: current.focusMinutes,
      remainingMs: current.remainingMs,
      status: current.status === 'running' ? 'paused' : current.status,
      sessionId: current.sessionId, startedAt: current.startedAt,
    },
    history: current.history,
  };
}

export function formatCountdown(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function localDayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getFocusInsights(history, now = Date.now()) {
  const today = localDayKey(now);
  const todayRecords = history.filter((record) => localDayKey(record.completedAt) === today);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const key = localDayKey(date.getTime());
    return {
      key, label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      minutes: history.filter((record) => localDayKey(record.completedAt) === key)
        .reduce((total, record) => total + record.minutes, 0),
    };
  });
  return {
    todayMinutes: todayRecords.reduce((total, record) => total + record.minutes, 0),
    todaySessions: todayRecords.length,
    weekMinutes: week.reduce((total, day) => total + day.minutes, 0), week,
  };
}
