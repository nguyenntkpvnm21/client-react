import { useState } from 'react';
import Icon from './Icon';
import { formatCountdown, validMinutes } from '../lib/focusSession';

export default function FocusSession({ session }) {
  const { state, start, pause, reset, setMode, setDuration } = session;
  const [customMinutes, setCustomMinutes] = useState('');
  const [customError, setCustomError] = useState('');
  const locked = ['running', 'paused'].includes(state.status);
  const progress = 1 - state.remainingMs / state.durationMs;
  const running = state.status === 'running';
  const complete = state.status === 'completed';
  const radius = 106;
  const circumference = 2 * Math.PI * radius;

  function applyCustomDuration(event) {
    event.preventDefault();
    const minutes = Number(customMinutes);
    if (!validMinutes(minutes)) {
      setCustomError('Choose a whole number from 1 to 180.');
      return;
    }
    setCustomError('');
    setDuration(minutes);
  }

  const message = complete
    ? state.mode === 'focus' ? 'Session complete. Nice work.' : 'Break complete. Ready when you are.'
    : state.status === 'paused' ? 'Paused. Pick up where you left off.'
      : running ? 'One thing at a time. You have this.' : 'A little space for your next big idea.';

  return (
    <section className="panel focus-panel" id="focus-session" aria-labelledby="focus-title">
      <div className="panel-heading">
        <div><p className="eyebrow">MAKE TIME FOR WHAT MATTERS</p><h2 id="focus-title">Focus session</h2></div>
        <span className="icon-tile"><Icon name="clock" /></span>
      </div>

      <div className="session-modes" aria-label="Session mode">
        <button type="button" aria-pressed={state.mode === 'focus'} disabled={locked} onClick={() => setMode('focus')}>Focus</button>
        <button type="button" aria-pressed={state.mode === 'break'} disabled={locked} onClick={() => setMode('break')}>Short break</button>
      </div>

      <div className="timer-face">
        <svg className="timer-ring" viewBox="0 0 240 240" aria-hidden="true">
          <circle className="timer-ring-track" cx="120" cy="120" r={radius} />
          <circle className="timer-ring-progress" cx="120" cy="120" r={radius}
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
        </svg>
        <div className="timer-content">
          <span className="timer-phase">{state.mode === 'focus' ? 'FOCUS TIME' : 'TAKE A BREATHER'}</span>
          <span className="timer-value" role="timer" aria-label={`${formatCountdown(state.remainingMs)} remaining`}>
            {formatCountdown(state.remainingMs)}
          </span>
          <span className="timer-state">{complete ? 'Completed' : running ? 'In progress' : state.status === 'paused' ? 'Paused' : 'Ready when you are'}</span>
        </div>
      </div>

      <p className="session-message" role="status">{message}</p>
      <div className="session-controls">
        <button type="button" className="button button-primary" onClick={running ? pause : start}>
          <Icon name={running ? 'pause' : 'play'} size={18} />
          {running ? 'Pause session' : state.status === 'paused' ? 'Resume session' : complete ? 'Start again' : 'Start session'}
        </button>
        <button type="button" className="button button-icon" aria-label="Reset current session" onClick={reset}><Icon name="reset" /></button>
      </div>

      <div className="duration-settings">
        <div className="duration-picks" aria-label="Focus duration">
          {[25, 50].map((minutes) => <button key={minutes} type="button"
            aria-pressed={state.mode === 'focus' && state.focusMinutes === minutes}
            disabled={locked || state.mode === 'break'} onClick={() => setDuration(minutes)}>{minutes} min</button>)}
          <span className="duration-hint">{state.mode === 'break' ? 'A 5-minute reset' : 'Or make it your own'}</span>
        </div>
        <form className="custom-duration" onSubmit={applyCustomDuration} noValidate>
          <label htmlFor="custom-duration">Custom minutes</label>
          <input id="custom-duration" type="number" min="1" max="180" step="1" placeholder="e.g. 40"
            value={customMinutes} disabled={locked || state.mode === 'break'}
            aria-invalid={Boolean(customError)} aria-describedby={customError ? 'duration-error' : undefined}
            onChange={(event) => { setCustomMinutes(event.target.value); setCustomError(''); }} />
          <button type="submit" className="button button-small" disabled={locked || state.mode === 'break'}>Apply</button>
        </form>
        {customError && <p className="field-error" id="duration-error" role="alert">{customError}</p>}
      </div>
      <p className="panel-footnote">{locked ? 'Reset the session to change its mode or duration.' : 'Keep your soundscape playing, or focus in silence.'}</p>
      {complete && <button type="button" className="next-session" onClick={() => setMode(state.mode === 'focus' ? 'break' : 'focus')}>
        {state.mode === 'focus' ? 'Take a short break' : 'Back to focus'}<Icon name="arrow" size={17} />
      </button>}
    </section>
  );
}
