import { useEffect, useReducer } from 'react';
import {
  FOCUS_STORAGE_KEY, createFocusState, focusReducer,
  hydrateFocusState, serializeFocusState,
} from '../lib/focusSession';

function loadFocusState() {
  try {
    return hydrateFocusState(JSON.parse(localStorage.getItem(FOCUS_STORAGE_KEY)));
  } catch {
    return createFocusState();
  }
}

export default function useFocusSession() {
  const [state, dispatch] = useReducer(focusReducer, undefined, loadFocusState);

  useEffect(() => {
    function saveCheckpoint() {
      try {
        localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(serializeFocusState(state, Date.now())));
      } catch (error) {
        console.warn('Unable to save focus progress:', error);
      }
    }
    saveCheckpoint();
    window.addEventListener('pagehide', saveCheckpoint);
    return () => window.removeEventListener('pagehide', saveCheckpoint);
  }, [state]);

  useEffect(() => {
    function tick() { dispatch({ type: 'TICK', now: Date.now() }); }
    const interval = window.setInterval(tick, state.status === 'running' ? 1000 : 30_000);
    function refreshVisibleTimer() {
      if (document.visibilityState === 'visible') tick();
    }
    document.addEventListener('visibilitychange', refreshVisibleTimer);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisibleTimer);
    };
  }, [state.status]);

  function start() {
    dispatch({ type: 'START', now: Date.now(), id: crypto.randomUUID() });
  }
  function pause() { dispatch({ type: 'PAUSE', now: Date.now() }); }
  function reset() { dispatch({ type: 'RESET', now: Date.now() }); }
  function setMode(mode) { dispatch({ type: 'MODE', mode, now: Date.now() }); }
  function setDuration(minutes) { dispatch({ type: 'DURATION', minutes, now: Date.now() }); }

  return { state, start, pause, reset, setMode, setDuration };
}
