import { useMemo, useRef, useState } from 'react';
import { boundSelection, listeningView, markSelection, moveSelection, sizedSelection } from '../lib/audioSelection.js';
import { clockTime } from '../lib/timeFormat.js';
import './WaveformSelector.css';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function fittedView(start, end, duration) {
  return listeningView((start + end) / 2, duration, Math.max(.1, (end - start) * 2));
}
function Bars({ peaks }) {
  return <path d={peaks.map((value, i) => { const x = (i + .5) / peaks.length * 1000; return `M${x} ${60 - Math.max(1, value * 52)}V${60 + Math.max(1, value * 52)}`; }).join(' ')} />;
}
export default function WaveformSelector({ track, info, studio, start, end, onChange, position, onSeek, onStop, rhythm = false }) {
  const duration = info.duration;
  const [view, setView] = useState(() => end - start < 2 ? fittedView(start, end, duration) : listeningView(start, duration));
  const [mode, setMode] = useState('listen');
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
    const center = position >= view.start && position <= view.end ? position : (view.start + view.end) / 2;
    setView(listeningView(center, duration, clamp(span * factor, Math.min(.1, duration), duration)));
  }
  function pan(amount) { const a = clamp(view.start + amount * span, 0, duration - span); setView({ start: a, end: a + span }); }
  function begin(event) {
    if (studio.busy || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const box = event.currentTarget.getBoundingClientRect();
    const time = view.start + clamp((event.clientX - box.left) / box.width, 0, 1) * span;
    const targetMode = event.target.closest('[data-mode]')?.dataset.mode || mode;
    gesture.current = { id: event.pointerId, mode: targetMode, x: event.clientX, a: start, b: end, anchor: time, width: box.width, span, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.target.closest('[role="slider"]')?.focus({ preventScroll: true });
  }
  function drag(event) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId || Math.abs(event.clientX - g.x) < 4 && !g.moved) return;
    g.moved = true;
    const delta = (event.clientX - g.x) / g.width * g.span;
    if (g.mode === 'move') onChange(moveSelection(g.a, g.b, delta, duration));
    else if (g.mode === 'start') selected(clamp(g.a + delta, 0, g.b - min), g.b);
    else if (g.mode === 'end') selected(g.a, clamp(g.b + delta, g.a + min, duration));
    else if (g.mode === 'select') selected(g.anchor, clamp(g.anchor + delta, 0, duration));
  }
  function finish(event, canceled = false) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    if (canceled && g.moved && g.mode !== 'listen') onChange({ start: g.a, end: g.b });
    else if (!canceled && (g.mode === 'listen' || !g.moved && g.mode === 'select')) {
      const point = clamp(g.anchor + (event.clientX - g.x) / g.width * g.span, 0, duration - min);
      onSeek(point, true);
    }
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function key(event, edge) {
    if (studio.busy) return;
    const step = event.shiftKey ? .001 : .01;
    let value = edge === 'start' ? start : end;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') value -= step;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') value += step;
    else if (event.key === 'Home') value = edge === 'start' ? 0 : start + min;
    else if (event.key === 'End') value = edge === 'start' ? end - min : duration;
    else return;
    event.preventDefault(); event.stopPropagation();
    if (edge === 'start') selected(clamp(value, 0, end - min), end);
    else selected(start, clamp(value, start + min, duration));
  }
  function size(length) { const value = sizedSelection(position, length, duration); onChange(value); setView(fittedView(value.start, value.end, duration)); }
  function find() {
    const value = studio.findSound(track.id, end, Math.min(end - start, .5));
    if (!value) { setMessage('No clear sound found. Listen and mark a region instead.'); return; }
    onChange(value); onSeek(value.start, false); setView(fittedView(value.start, value.end, duration));
  }
  const previewing = studio.preview?.id === track.id && studio.preview.kind !== 'pattern';
  return <div className="waveform-editor">
    <div className="sample-transport" role="group" aria-label={'Recording preview for ' + track.name}>
      <button type="button" className="sample-listen" disabled={studio.busy} onClick={() => previewing ? onStop() : onSeek(position, true)}>{previewing ? 'Stop here' : 'Listen from cursor'}</button>
      <output aria-label="Recording cursor">{clockTime(position, 3)} <span>/ {clockTime(duration, 2)}</span></output>
      <button type="button" disabled={studio.busy} onClick={() => onChange(markSelection('start', position, start, end, duration), true)}>Set start here</button>
      <button type="button" disabled={studio.busy} onClick={() => onChange(markSelection('end', position, start, end, duration), true)}>Set end here</button>
    </div>
    <p className="waveform-context">Recording preview only · the bottom player controls your mix.</p>
    <div className="waveform-overview" role="slider" tabIndex={studio.busy ? -1 : 0} aria-label={'Find position in ' + track.name} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={position} aria-valuetext={clockTime(position, 3)}
      onPointerDown={(event) => { if (studio.busy || event.pointerType === 'mouse' && event.button !== 0) return; const box = event.currentTarget.getBoundingClientRect(); const point = clamp((event.clientX - box.left) / box.width * duration, 0, duration - min); setView(listeningView(point, duration)); onSeek(point, true); }}
      onKeyDown={(event) => { if (studio.busy) return; let point; if (event.key === 'ArrowLeft') point = position - (event.shiftKey ? .1 : 1); else if (event.key === 'ArrowRight') point = position + (event.shiftKey ? .1 : 1); else if (event.key === 'Home') point = 0; else if (event.key === 'End') point = duration - min; else return; event.preventDefault(); point = clamp(point, 0, duration - min); setView(listeningView(point, duration, Math.min(span, 8))); onSeek(point, !!previewing); }}>
      <svg viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true"><Bars peaks={overview} /></svg><span style={{ left: view.start / duration * 100 + '%', width: span / duration * 100 + '%' }} /><i style={{ left: position / duration * 100 + '%' }} />
    </div>
    <div className="waveform-toolbar" role="group" aria-label={'Waveform tools for ' + track.name}>
      <div className="waveform-modes"><button type="button" aria-pressed={mode === 'listen'} disabled={studio.busy} onClick={() => setMode('listen')}>Listen</button><button type="button" aria-pressed={mode === 'select'} disabled={studio.busy} onClick={() => { onStop(); setMode('select'); }}>Select region</button></div>
      <button type="button" disabled={studio.busy || span <= .10001} onClick={() => zoom(.5)}>Zoom in</button>
      <button type="button" disabled={studio.busy || span >= duration} onClick={() => zoom(2)}>Zoom out</button>
      <button type="button" disabled={studio.busy} onClick={() => setView(fittedView(start, end, duration))}>Show selection</button>
      <details className="waveform-view-options"><summary>View</summary><button type="button" disabled={studio.busy} onClick={() => setView(listeningView(position, duration, Math.min(span, 8)))}>Show cursor</button><button type="button" disabled={studio.busy} onClick={() => setView({ start: 0, end: duration })}>Full recording</button></details>
    </div>
    <div className="waveform-ruler" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span key={i}>{clockTime(view.start + span * i / 4, span < 4 ? 2 : 1)}</span>)}</div>
    <div className="waveform-selection" tabIndex={studio.busy ? -1 : 0} role="group" aria-label={'Select audio for ' + track.name} onPointerDown={begin} onPointerMove={drag} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={() => { gesture.current = null; }}
      onKeyDown={(event) => { if (event.target !== event.currentTarget || studio.busy) return; if (event.code === 'Space') { event.preventDefault(); if (previewing) onStop(); else onSeek(position, true); } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onSeek(clamp(position + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .01 : .1), 0, duration - min), !!previewing); } }}>
      <svg viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true"><Bars peaks={peaks} /></svg>
      <div className="waveform-selected" style={{ left: Math.max(0, x(start)) + '%', width: Math.max(0, Math.min(100, x(end)) - Math.max(0, x(start))) + '%' }}>{mode === 'select' && end > view.start && start < view.end && <span className="waveform-move" data-mode="move" role="slider" tabIndex={studio.busy ? -1 : 0} aria-label={track.name + ' selection position'} aria-valuemin={0} aria-valuemax={duration - (end - start)} aria-valuenow={start} aria-valuetext={clockTime(start, 3)}
        onKeyDown={(event) => { if (studio.busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); const delta = event.key === 'Home' ? -start : event.key === 'End' ? duration - end : (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .001 : .01); onChange(moveSelection(start, end, delta, duration)); }}>Move</span>}</div>
      {mode === 'select' && ['start', 'end'].map((edge) => { const value = edge === 'start' ? start : end; return value >= view.start && value <= view.end && <div key={edge} className={'waveform-handle handle-' + edge} data-mode={edge} role="slider" tabIndex={studio.busy ? -1 : 0} aria-label={track.name + ' selection ' + edge}
        aria-valuemin={edge === 'start' ? 0 : start + min} aria-valuemax={edge === 'start' ? end - min : duration} aria-valuenow={value} aria-valuetext={clockTime(value, 3)} onKeyDown={(event) => key(event, edge)} style={{ left: `clamp(22px, ${x(value)}%, calc(100% - 22px))` }}><span>{edge === 'start' ? '‹' : '›'}</span></div>; })}
      {position >= view.start && position <= view.end && <div className="waveform-audition-head" style={{ left: x(position) + '%' }} />}
    </div>
    <div className="waveform-window"><button type="button" aria-label="Pan waveform earlier" disabled={studio.busy || view.start <= 0} onClick={() => pan(-.5)}>←</button><span>{mode === 'listen' ? 'Tap to listen. Your selection stays.' : 'Drag to select. Pull edges to trim.'}</span><button type="button" aria-label="Pan waveform later" disabled={studio.busy || view.end >= duration} onClick={() => pan(.5)}>→</button></div>
    <p className="sample-selection-summary">Selected <strong>{clockTime(start, 3)} – {clockTime(end, 3)}</strong> · {clockTime(end - start, 3)}</p>
    {rhythm && <div className="waveform-presets" role="group" aria-label="Sample length shortcuts">{[[.25, '¼ beat'], [1, '1 beat'], [2, '2 beats']].map(([beats, label]) => <button type="button" key={label} disabled={studio.busy} onClick={() => size(60 / studio.bpm * beats)} title={'Select from cursor at ' + studio.bpm + ' BPM'}>{label}</button>)}<button type="button" disabled={studio.busy} onClick={find}>Find next sound</button></div>}
    <details className="workspace-help"><summary>Selection help</summary><p>Use the overview to find a place in the recording, then listen in detail below. Set start and end while listening, or drag in Select region mode. Move region shifts the selection. Arrow keys trim an edge by 0.01 seconds; Shift trims by 0.001. Focus the waveform and press Space to listen or stop.</p></details>
    {message && <p className="waveform-help" role="status">{message}</p>}
  </div>;
}
