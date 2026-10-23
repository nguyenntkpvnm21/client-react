import { useRef, useState } from 'react';
import { playbackTimeline, parsePlaybackTime, precisePlaybackTime } from '../lib/playbackTimeline.js';
import { formatTime } from '../lib/studioState.js';

export default function PlaybackSeek({ studio }) {
  const [draft, setDraft] = useState(null);
  const [gestureMax, setGestureMax] = useState(null);
  const gesture = useRef(null);
  const [jump, setJump] = useState(null);
  const [error, setError] = useState('');
  const timeButton = useRef(null);
  const disabled = studio.booting || studio.projectBusy || studio.importing || !studio.tracks.length;
  const timeline = playbackTimeline(studio.tracks, studio.details, studio.arrangement, studio.bpm, studio.elapsed);
  const max = gestureMax ?? timeline.max;
  const position = draft ?? Math.min(max, studio.elapsed);

  function begin(kind) {
    setGestureMax(timeline.max);
    gesture.current = { kind, max: timeline.max, value: Math.min(studio.elapsed, timeline.max), changed: false };
  }
  function update(value) {
    if (!gesture.current) begin('keyboard');
    gesture.current.value = value;gesture.current.changed = true;setDraft(value);
  }
  function finish(cancel = false) {
    const g = gesture.current;gesture.current = null;setDraft(null);setGestureMax(null);
    if (g?.changed && !cancel && !disabled) void studio.seekPlayback(g.value);
  }
  function closeJump() { setJump(null);setError('');timeButton.current?.focus(); }
  return <div className="playback-seek">
    <div className="playback-seek-row">
      <button type="button" ref={timeButton} className="playback-time" disabled={disabled} aria-label="Go to playback time" title="Go to time" aria-expanded={jump !== null}
        onClick={() => { if (jump !== null) closeJump();else { setJump(precisePlaybackTime(studio.elapsed));setError(''); } }}>{precisePlaybackTime(position)}<span aria-hidden="true">⌄</span></button>
      <input className="playback-position" type="range" min="0" max={max} step="0.1" value={position} disabled={disabled} aria-label="Mix playback position" aria-valuetext={precisePlaybackTime(position)}
        title={'Seek to a time · 0:00–' + formatTime(max)} style={{ '--played': max ? position / max * 100 + '%' : '0%' }}
        onPointerDown={(event) => { if (disabled) return;begin('pointer');event.currentTarget.setPointerCapture(event.pointerId); }}
        onChange={(event) => { const value = Number(event.target.value);if (gesture.current) update(value);else void studio.seekPlayback(value); }}
        onPointerUp={(event) => { finish();if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => finish(true)} onLostPointerCapture={() => { if (gesture.current?.kind === 'pointer') finish(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault();finish(true);return; }
          if (disabled) return;
          const current = gesture.current?.value ?? position;
          const delta = event.shiftKey ? .1 : 5;
          const next = { ArrowLeft: current - delta, ArrowDown: current - delta, ArrowRight: current + delta, ArrowUp: current + delta, PageDown: current - 10, PageUp: current + 10, Home: 0, End: max }[event.key];
          if (next === undefined) return;
          event.preventDefault();update(Math.max(0, Math.min(max, Math.round(next * 10) / 10)));
        }} onKeyUp={() => { if (gesture.current?.kind === 'keyboard') finish(); }} onBlur={() => finish()} />
      <span className="playback-end" title={timeline.duration !== null ? 'Playback duration' : timeline.repeating ? 'Free mix repeats. Slider covers 0:00–' + formatTime(max) + '; click the current time to go further.' : 'Duration loads when you play or seek.'}>{timeline.duration !== null ? formatTime(timeline.duration) : timeline.repeating ? '∞' : '--:--'}</span>
    </div>
    {jump !== null && <form className="playback-jump" noValidate onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault();closeJump(); } }} onSubmit={async (event) => {
      event.preventDefault();
      try { const value = parsePlaybackTime(jump, timeline.duration ?? Infinity);if (await studio.seekPlayback(value)) closeJump(); }
      catch (problem) { setError(problem.message); }
    }}>
      <label htmlFor="playback-jump-time">Go to time<input id="playback-jump-time" autoFocus value={jump} inputMode="decimal" placeholder="1:30.5" aria-invalid={!!error} aria-describedby={error ? 'playback-jump-error' : 'playback-jump-help'} disabled={disabled}
        onChange={(event) => { setJump(event.target.value);setError(''); }} /></label>
      <button type="submit" disabled={disabled}>Go</button><button type="button" onClick={closeJump}>Cancel</button>
      <p id="playback-jump-help">Enter m:ss or seconds. Arrows on the seek bar move 5 seconds; Shift moves 0.1 seconds.</p>
      {error && <p className="playback-jump-error" id="playback-jump-error" role="alert">{error}</p>}
    </form>}
  </div>;
}
