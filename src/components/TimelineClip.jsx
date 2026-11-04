import { useMemo, useRef, useState } from 'react';
import { editTimelineWindow } from '../lib/timelineEditing.js';
import { clipRegion } from '../lib/clipRegion.js';
import { isSequenced, sequenceMetadata, stepSeconds } from '../lib/sequencerState.js';
import { rhythmRegion } from '../lib/rhythmState.js';
import { clockTime } from '../lib/timeFormat.js';
import { timelinePosition, timelineView, timelineWaveform } from '../lib/timelineViewport.js';

export default function TimelineClip({ track, studio, window, cursor, snapSize = 0, section = false, view: viewport }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const gesture = useRef(null);
  const current = draft || window;
  const duration = studio.arrangement.duration;
  const view = timelineView(viewport, duration), span = view.end - view.start;
  const grid = snapSize;
  const info = studio.details[track.id];
  const sequenced = isSequenced(track);
  const region = useMemo(() => info ? (sequenced ? rhythmRegion(track, info.duration) : clipRegion(track, info.duration)) : null, [info, sequenced, track]);
  const waveformFor = studio.waveformFor;
  const visualOffset = (track.sourceOffset || 0) + (draft?.editAction === 'start' ? current.start - window.start : 0);
  const waveform = useMemo(() => sequenced ? null : timelineWaveform({ loop: track.loop, sourceOffset: visualOffset }, region, { start: current.start, end: current.end }, { start: view.start, end: view.end },
    (start, end, bins) => waveformFor(track.id, start, end, bins)),
  [sequenced, track.loop, visualOffset, region, current.start, current.end, view.start, view.end, waveformFor, track.id]);
  const position = (time) => timelinePosition(time, view);
  const visible = current.end > view.start && current.start < view.end;
  const inView = (time) => time >= view.start - 1e-7 && time <= view.end + 1e-7;
  const length = current.end - current.start;
  const audible = region && !sequenced && !track.loop ? Math.min(length, Math.max(0, region.length - visualOffset)) : length;
  const steps = sequenceMetadata(track).steps;
  let path = '';
  const waveStart = Math.max(current.start, view.start), waveEnd = Math.min(current.end, view.end);
  const waveSpan = waveEnd - waveStart;
  if (sequenced) {
    const step = stepSeconds(studio.bpm);
    for (let time = Math.ceil(waveStart / step - 1e-8) * step; time < waveEnd; time += step) {
      if (steps[Math.round(time / step) % 16]) { const x = (time - waveStart) / waveSpan * 1000; path += `M${x} 30V90`; }
    }
  } else if (waveform) {
    for (const { position, peak } of waveform.bars) {
      const x = position * 1000;path += `M${x} ${60 - peak * 30}V${60 + peak * 30}`;
    }
  }
  function commit(value, action) {
    try { studio.setPlacement(track.id, value, false, action); setError(''); }
    catch (problem) { setError(problem.message); }
    setDraft(null);
  }
  function begin(event) {
    if (studio.busy || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const target = event.target.closest('[data-timeline-action]');
    if (!target) return;
    event.preventDefault(); target.focus();
    const box = event.currentTarget.getBoundingClientRect();
    gesture.current = { id: event.pointerId, action: target.dataset.timelineAction, x: event.clientX, width: box.width, span, original: window, draft: window };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function drag(event) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const delta = (event.clientX - g.x) / g.width * g.span;
    g.draft = editTimelineWindow(g.original, g.action, delta, duration, grid);
    setDraft({ ...g.draft, editAction: g.action });
  }
  function finish(event, cancel = false) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && JSON.stringify(g.draft) !== JSON.stringify(g.original)) commit(g.draft, g.action);
    else setDraft(null);
  }
  function key(event, action) {
    if (studio.busy) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
    studio.beginEditGesture('placement:' + track.id);
    commit(editTimelineWindow(window, action, direction * (section ? grid : event.shiftKey ? .01 : grid || .1), duration, section ? grid : event.shiftKey ? 0 : grid), action);
  }
  const handles = [['start', 'entry', current.start, current.start, 0, current.end - .05], ['end', 'exit', current.end, current.end, current.start + .05, duration],
    ['fadeIn', 'fade in', current.start + current.fadeIn, current.fadeIn, 0, length - current.fadeOut], ['fadeOut', 'fade out', current.end - current.fadeOut, current.fadeOut, 0, length - current.fadeIn]];
  return <div className="timeline-clip-wrap">
    <div className="arrangement-lane timeline-edit-lane" role="group" aria-label={track.name + ' timeline'} onKeyUp={() => studio.endEditGesture('placement:' + track.id)} onBlur={() => studio.endEditGesture('placement:' + track.id)} onPointerDown={begin} onPointerMove={drag} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={() => { gesture.current = null; setDraft(null); }}>
      {visible && <div className="timeline-clip" style={{ left: position(current.start) + '%', width: length / span * 100 + '%' }}>
        <div className="timeline-source" style={{ width: audible / length * 100 + '%' }} />
        <svg className="timeline-wave" style={{ left: (waveStart - current.start) / length * 100 + '%', width: waveSpan / length * 100 + '%' }} viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true"><path d={path} /></svg>
        {audible < length && <div className="timeline-silence" style={{ left: audible / length * 100 + '%' }} />}
        <div className="timeline-fade timeline-fade-in" style={{ width: current.fadeIn / length * 100 + '%' }} /><div className="timeline-fade timeline-fade-out" style={{ width: current.fadeOut / length * 100 + '%' }} />
        <div className="timeline-move" role="button" tabIndex={studio.busy ? -1 : 0} aria-label={'Move ' + track.name + ' in timeline'} data-timeline-action="move" onKeyDown={(event) => key(event, 'move')}><span>{track.name}</span></div>
      </div>}
      {handles.filter(([action, , at]) => inView(at) && (!section || action === 'start' || action === 'end')).map(([action, label, at, value, min, max]) => <div key={action} className={'timeline-handle timeline-' + action} role="slider" tabIndex={studio.busy ? -1 : 0} data-timeline-action={action}
        aria-label={track.name + ' timeline ' + label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={clockTime(value, 2)} onKeyDown={(event) => key(event, action)}
        style={{ left: `clamp(22px, ${position(at)}%, calc(100% - 22px))` }}><span>{action === 'start' ? '↤' : action === 'end' ? '↦' : action === 'fadeIn' ? '◩' : '◪'}</span></div>)}
      {cursor !== null && inView(cursor) && <div className="arrangement-cursor" style={{ left: position(cursor) + '%' }} aria-hidden="true" />}
      {!visible && <span className="timeline-outside-view">Outside this view</span>}
    </div>
    <div className="arrangement-row-summary"><span>{clockTime(current.start, 2)}–{clockTime(current.end, 2)}</span>{(current.fadeIn > 0 || current.fadeOut > 0) && <span>Fade in {clockTime(current.fadeIn, 2)} · out {clockTime(current.fadeOut, 2)}</span>}</div>
    {draft && <p className="timeline-feedback" role="status">Release to apply timing. Playback keeps its position.</p>}
    {region && !sequenced && !track.loop && audible < length && <p className="timeline-feedback">Audio ends at {clockTime(current.start + audible, 2)} · silent until {clockTime(current.end, 2)}</p>}
    {error && <p className="arrangement-error" role="alert">{error}</p>}
  </div>;
}
