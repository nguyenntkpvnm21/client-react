import { useMemo, useRef, useState } from 'react';
import { boundSelection, moveSelection, sizedSelection } from '../lib/audioSelection.js';
import './WaveformSelector.css';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fittedView(start, end, duration) {
  const span = Math.min(duration, Math.max(.25, (end - start) * 3));
  const a = clamp((start + end - span) / 2, 0, duration - span);
  return { start: a, end: a + span };
}
function Bars({ peaks }) {
  return <path d={peaks.map((value, i) => { const x = (i + .5) / peaks.length * 1000; return `M${x} ${60 - Math.max(1, value * 52)}V${60 + Math.max(1, value * 52)}`; }).join(' ')} />;
}
export default function WaveformSelector({ track, info, studio, start, end, onChange, rhythm = false }) {
  const duration = info.duration;
  const [view, setView] = useState(() => end - start < duration / 4 ? fittedView(start, end, duration) : { start: 0, end: duration });
  const [message, setMessage] = useState('');
  const gesture = useRef(null);
  const span = view.end - view.start;
  const waveformFor = studio.waveformFor;
  const peaks = useMemo(() => waveformFor(track.id, view.start, view.end), [waveformFor, track.id, view.start, view.end]);
  const overview = useMemo(() => waveformFor(track.id, 0, duration, 240), [waveformFor, track.id, duration]);
  const min = Math.min(.05, duration);
  const x = (time) => (time - view.start) / span * 100;
  const selected = (a, b) => { setMessage(''); onChange(boundSelection(a, b, duration)); };
  function zoom(factor) {
    const size = clamp(span * factor, Math.min(.1, duration), duration);
    const center = start >= view.start && end <= view.end ? (start + end) / 2 : (view.start + view.end) / 2;
    const a = clamp(center - size / 2, 0, duration - size);
    setView({ start: a, end: a + size });
  }
  function pan(amount) { const a = clamp(view.start + amount * span, 0, duration - span); setView({ start: a, end: a + span }); }
  function begin(event) {
    if (studio.busy || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const time = view.start + clamp((event.clientX - box.left) / box.width, 0, 1) * span;
    const mode = event.target.closest('[data-mode]')?.dataset.mode || 'select';
    gesture.current = { id: event.pointerId, mode, x: event.clientX, a: start, b: end, anchor: time, width: box.width, span };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === 'select') selected(time, time + min);
    else event.target.closest('[role="slider"]')?.focus();
  }
  function drag(event) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const delta = (event.clientX - g.x) / g.width * g.span;
    if (g.mode === 'move') onChange(moveSelection(g.a, g.b, delta, duration));
    else if (g.mode === 'start') selected(clamp(g.a + delta, 0, g.b - min), g.b);
    else if (g.mode === 'end') selected(g.a, clamp(g.b + delta, g.a + min, duration));
    else selected(g.anchor, clamp(g.anchor + delta, 0, duration));
  }
  function finish(event, canceled = false) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    if (canceled) onChange({ start: g.a, end: g.b });
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function key(event, edge) {
    if (studio.busy) return;
    const step = Math.max(.001, span / (event.shiftKey ? 1000 : 100));
    let value = edge === 'start' ? start : end;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') value -= step;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') value += step;
    else if (event.key === 'Home') value = edge === 'start' ? 0 : start + min;
    else if (event.key === 'End') value = edge === 'start' ? end - min : duration;
    else return;
    event.preventDefault();
    if (edge === 'start') selected(clamp(value, 0, end - min), end);
    else selected(start, clamp(value, start + min, duration));
  }
  function size(length) { const value = sizedSelection(start, length, duration); onChange(value); setView(fittedView(value.start, value.end, duration)); }
  function find() {
    const value = studio.findSound(track.id, end, end - start);
    if (!value) { setMessage('No clear sound found. Drag a region on the waveform instead.'); return; }
    onChange(value); setView(fittedView(value.start, value.end, duration)); setMessage('Moved to the next audible region. Preview before applying.');
  }
  const preview = studio.preview?.id === track.id && studio.preview.kind !== 'pattern' && !studio.preview.loading ? studio.preview.position : null;
  return <div className="waveform-editor">
    <div className="waveform-toolbar" role="group" aria-label={'Waveform zoom for ' + track.name}>
      <button type="button" disabled={studio.busy || span <= .10001} onClick={() => zoom(.5)}>Zoom in</button>
      <button type="button" disabled={studio.busy || span >= duration} onClick={() => zoom(2)}>Zoom out</button>
      <button type="button" disabled={studio.busy} onClick={() => setView(fittedView(start, end, duration))}>Show selection</button>
      <button type="button" disabled={studio.busy} onClick={() => setView({ start: 0, end: duration })}>Full recording</button>
    </div>
    <div className="waveform-overview" role="slider" tabIndex={studio.busy ? -1 : 0} aria-label={'Waveform overview for ' + track.name} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={view.start}
      onPointerDown={(event) => { if (studio.busy) return; const box = event.currentTarget.getBoundingClientRect(); const a = clamp((event.clientX - box.left) / box.width * duration - span / 2, 0, duration - span); setView({ start: a, end: a + span }); }}
      onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); pan(event.key === 'ArrowLeft' ? -.5 : .5); } }}>
      <svg viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true"><Bars peaks={overview} /></svg><span style={{ left: view.start / duration * 100 + '%', width: span / duration * 100 + '%' }} />
    </div>
    <div className="waveform-selection" role="group" aria-label={'Select audio for ' + track.name} onPointerDown={begin} onPointerMove={drag} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={() => { gesture.current = null; }}>
      <svg viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true"><Bars peaks={peaks} /></svg>
      <div className="waveform-selected" data-mode="move" style={{ left: Math.max(0, x(start)) + '%', width: Math.max(0, Math.min(100, x(end)) - Math.max(0, x(start))) + '%' }} />
      {['start', 'end'].map((edge) => { const value = edge === 'start' ? start : end; return value >= view.start && value <= view.end && <div key={edge} className={'waveform-handle handle-' + edge} data-mode={edge} role="slider" tabIndex={studio.busy ? -1 : 0} aria-label={track.name + ' selection ' + edge}
        aria-valuemin={edge === 'start' ? 0 : start + min} aria-valuemax={edge === 'start' ? end - min : duration} aria-valuenow={value} aria-valuetext={value.toFixed(3) + ' seconds'} onKeyDown={(event) => key(event, edge)} style={{ left: `clamp(12px, ${x(value)}%, calc(100% - 12px))` }}><span>{edge === 'start' ? '‹' : '›'}</span></div>; })}
      {preview !== null && preview >= view.start && preview <= view.end && <div className="waveform-audition-head" style={{ left: x(preview) + '%' }} />}
    </div>
    <div className="waveform-window"><button type="button" aria-label="Pan waveform earlier" disabled={studio.busy || view.start <= 0} onClick={() => pan(-.5)}>←</button><span>{view.start.toFixed(2)}–{view.end.toFixed(2)} s visible · Selected {(end - start).toFixed(3)} s</span><button type="button" aria-label="Pan waveform later" disabled={studio.busy || view.end >= duration} onClick={() => pan(.5)}>→</button></div>
    {rhythm && <div className="waveform-presets" role="group" aria-label="Sample length shortcuts">{[[.25, '¼ beat'], [1, '1 beat'], [2, '2 beats'], [4, '1 bar'], [8, '2 bars']].map(([beats, label]) => <button type="button" key={label} disabled={studio.busy} onClick={() => size(60 / studio.bpm * beats)} title={(60 / studio.bpm * beats).toFixed(3) + ' seconds at ' + studio.bpm + ' BPM'}>{label}</button>)}<button type="button" disabled={studio.busy} onClick={find}>Find next sound</button></div>}
    <p className="waveform-help">Drag across the waveform to select. Drag the highlighted region to move it, or its edges to trim. Zoom in for detail; use the overview to move through the recording. Edge arrows adjust by keyboard; Shift makes smaller moves.</p>
    {message && <p className="waveform-help" role="status">{message}</p>}
  </div>;
}
