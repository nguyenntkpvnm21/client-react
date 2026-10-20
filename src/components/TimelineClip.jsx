import { useMemo, useRef, useState } from 'react';
import { editTimelineWindow } from '../lib/timelineEditing.js';
import { clipRegion } from '../lib/clipRegion.js';
import { isSequenced, sequenceMetadata, stepSeconds } from '../lib/sequencerState.js';
import { rhythmRegion } from '../lib/rhythmState.js';

export default function TimelineClip({ track, studio, window, snap, cursor }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const gesture = useRef(null);
  const current = draft || window;
  const duration = studio.arrangement.duration;
  const info = studio.details[track.id];
  const sequenced = isSequenced(track);
  const region = useMemo(() => info ? (sequenced ? rhythmRegion(track, info.duration) : clipRegion(track, info.duration)) : null, [info, sequenced, track]);
  const waveformFor = studio.waveformFor;
  const peaks = useMemo(() => region ? waveformFor(track.id, region.start, region.end, 240) : [], [waveformFor, track.id, region]);
  const position = (time) => time / duration * 100;
  const length = current.end - current.start;
  const audible = region && !sequenced && !track.loop ? Math.min(length, region.length) : length;
  const steps = sequenceMetadata(track).steps;
  let path = '';
  if (sequenced) {
    const step = stepSeconds(studio.bpm);
    for (let time = Math.ceil(current.start / step - 1e-8) * step; time < current.end; time += step) {
      if (steps[Math.round(time / step) % 16]) { const x = (time - current.start) / length * 1000; path += `M${x} 30V90`; }
    }
  } else if (region && peaks.length) {
    for (let i = 0; i < 320; i += 1) {
      const time = i / 320 * length;
      const peak = time >= audible ? 0 : peaks[Math.min(peaks.length - 1, Math.floor((time % region.length) / region.length * peaks.length))];
      const x = (i + .5) / 320 * 1000; path += `M${x} ${60 - peak * 30}V${60 + peak * 30}`;
    }
  }
  function commit(value) {
    try { studio.setPlacement(track.id, value); setError(''); }
    catch (problem) { setError(problem.message); }
    setDraft(null);
  }
  function begin(event) {
    if (studio.busy || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const target = event.target.closest('[data-timeline-action]');
    if (!target) return;
    event.preventDefault(); target.focus();
    const box = event.currentTarget.getBoundingClientRect();
    gesture.current = { id: event.pointerId, action: target.dataset.timelineAction, x: event.clientX, width: box.width, original: window, draft: window };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function drag(event) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const delta = (event.clientX - g.x) / g.width * duration;
    g.draft = editTimelineWindow(g.original, g.action, delta, duration, snap ? 60 / studio.bpm : 0);
    setDraft(g.draft);
  }
  function finish(event, cancel = false) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && JSON.stringify(g.draft) !== JSON.stringify(g.original)) commit(g.draft);
    else setDraft(null);
  }
  function key(event, action) {
    if (studio.busy) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
    commit(editTimelineWindow(window, action, direction * (event.shiftKey ? .01 : snap ? 60 / studio.bpm : .1), duration, event.shiftKey ? 0 : snap ? 60 / studio.bpm : 0));
  }
  const handles = [['start', 'entry', current.start, current.start, 0, current.end - .05], ['end', 'exit', current.end, current.end, current.start + .05, duration],
    ['fadeIn', 'fade in', current.start + current.fadeIn, current.fadeIn, 0, length - current.fadeOut], ['fadeOut', 'fade out', current.end - current.fadeOut, current.fadeOut, 0, length - current.fadeIn]];
  return <div className="timeline-clip-wrap">
    <div className="arrangement-lane timeline-edit-lane" role="group" aria-label={track.name + ' timeline'} onPointerDown={begin} onPointerMove={drag} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={() => { gesture.current = null; setDraft(null); }}>
      <div className="timeline-clip" style={{ left: position(current.start) + '%', width: position(length) + '%' }}>
        <div className="timeline-source" style={{ width: audible / length * 100 + '%' }} />
        <svg className="timeline-wave" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true"><path d={path} /></svg>
        {audible < length && <div className="timeline-silence" style={{ left: audible / length * 100 + '%' }} />}
        <div className="timeline-fade timeline-fade-in" style={{ width: current.fadeIn / length * 100 + '%' }} /><div className="timeline-fade timeline-fade-out" style={{ width: current.fadeOut / length * 100 + '%' }} />
        <div className="timeline-move" role="button" tabIndex={studio.busy ? -1 : 0} aria-label={'Move ' + track.name + ' in timeline'} data-timeline-action="move" onKeyDown={(event) => key(event, 'move')}><span>{track.name}</span></div>
      </div>
      {handles.map(([action, label, at, value, min, max]) => <div key={action} className={'timeline-handle timeline-' + action} role="slider" tabIndex={studio.busy ? -1 : 0} data-timeline-action={action}
        aria-label={track.name + ' timeline ' + label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={value.toFixed(2) + ' seconds'} onKeyDown={(event) => key(event, action)}
        style={{ left: `clamp(22px, ${position(at)}%, calc(100% - 22px))` }}><span>{action === 'start' ? '↤' : action === 'end' ? '↦' : action === 'fadeIn' ? '◩' : '◪'}</span></div>)}
      {cursor !== null && <div className="arrangement-cursor" style={{ left: cursor + '%' }} aria-hidden="true" />}
    </div>
    <div className="arrangement-row-summary"><span>{current.start.toFixed(2)}–{current.end.toFixed(2)} s</span><span>Fade in {current.fadeIn.toFixed(2)} s · out {current.fadeOut.toFixed(2)} s</span></div>
    {draft && <p className="timeline-feedback" role="status">Release to apply timing. Playback keeps its position.</p>}
    {region && !sequenced && <p className="timeline-feedback">Selected clip: {region.length.toFixed(2)} s. {track.loop ? 'Loops inside this window.' : audible < length ? 'Source ends at ' + (current.start + audible).toFixed(2) + ' s · ' + (length - audible).toFixed(2) + ' s silent before Exit. Fades fit the audible source.' : 'Plays once inside this window.'}</p>}
    {error && <p className="arrangement-error" role="alert">{error}</p>}
  </div>;
}
