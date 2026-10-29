import { useRef, useState } from 'react';
import { editLoopRegion, MIN_LOOP_SECONDS } from '../lib/loopRegion.js';
import { clockTime } from '../lib/timeFormat.js';
import { parsePlaybackTime } from '../lib/playbackTimeline.js';

function SectionForm({ studio }) {
  const [start, setStart] = useState(clockTime(studio.loopSection.start, 3));
  const [end, setEnd] = useState(clockTime(studio.loopSection.end, 3));
  const [error, setError] = useState('');
  return <form className="section-fields" noValidate onSubmit={async (event) => {
    event.preventDefault();
    try { await studio.setLoopSection({ start: parsePlaybackTime(start), end: parsePlaybackTime(end) });setError(''); } catch (problem) { setError(problem.message); }
  }}>
    <label>Loop start <span>m:ss</span><input className="time-input" type="text" value={start} disabled={studio.busy} onChange={(event) => setStart(event.target.value)} /></label>
    <label>Loop end <span>m:ss</span><input className="time-input" type="text" value={end} disabled={studio.busy} onChange={(event) => setEnd(event.target.value)} /></label>
    <button type="submit" disabled={studio.busy}>Set section</button>
    {error && <p className="arrangement-error" role="alert">{error}</p>}
  </form>;
}

export default function ArrangementSection({ studio, snap }) {
  const [draft, setDraft] = useState(null);
  const gesture = useRef(null);
  const region = draft || studio.loopSection, duration = studio.arrangement.duration;
  const position = (time) => time / duration * 100 + '%';
  const disabled = studio.busy || !studio.tracks.length;
  const active = studio.loopSection.enabled && ['playing', 'loading'].includes(studio.status);
  function finish(event, canceled = false) {
    const g = gesture.current;if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!canceled) void studio.setLoopSection(g.draft);
    setDraft(null);
  }
  function key(event, action) {
    if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1;
    void studio.setLoopSection(editLoopRegion(region, action, direction * (event.shiftKey ? .01 : snap ? 60 / studio.bpm : .1), duration, event.shiftKey ? 0 : snap ? 60 / studio.bpm : 0));
  }
  return <section className="arrangement-section" aria-labelledby="section-title">
    <div className="section-heading"><div><h3 id="section-title">Listen to a section</h3><p>Drag across the strip to select a section. Move its center or adjust either edge.</p></div>
      <div className="section-actions"><button type="button" className="timing-apply" disabled={studio.booting || studio.projectBusy || studio.importing || (!active && studio.busy) || !studio.tracks.length} onClick={studio.playLoop}>{active ? studio.status === 'loading' ? 'Cancel loop loading' : 'Pause loop' : 'Play loop'}</button>
        {studio.loopSection.enabled && <button type="button" disabled={studio.busy} onClick={studio.disableLoop}>Turn loop off</button>}</div></div>
    <div className="section-strip" role="group" aria-label="Select arrangement section" onPointerDown={(event) => {
      if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      const target = event.target.closest('[data-section-action]');target?.focus();
      const box = event.currentTarget.getBoundingClientRect();
      gesture.current = { id: event.pointerId, action: target?.dataset.sectionAction || 'select', x: event.clientX, width: box.width, left: box.left, original: studio.loopSection, draft: studio.loopSection };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={(event) => {
      const g = gesture.current;if (!g || g.id !== event.pointerId) return;
      if (g.action === 'select') {
        const at = (x) => Math.max(0, Math.min(duration, (x - g.left) / g.width * duration));
        const a = at(g.x), b = at(event.clientX), beat = snap ? 60 / studio.bpm : 0;
        const round = (value) => beat ? Math.round(value / beat) * beat : value;
        const start = Math.min(duration - MIN_LOOP_SECONDS, Math.max(0, round(Math.min(a, b))));
        const end = Math.min(duration, Math.max(start + MIN_LOOP_SECONDS, round(Math.max(a, b))));
        g.draft = { ...g.original, start, end };
      } else g.draft = editLoopRegion(g.original, g.action, (event.clientX - g.x) / g.width * duration, duration, snap ? 60 / studio.bpm : 0);
      setDraft(g.draft);
    }} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={() => { gesture.current = null;setDraft(null); }}>
      <div className="section-selected" style={{ left: position(region.start), width: position(region.end - region.start) }} aria-hidden="true" />
      <div className="section-move" style={{ left: position(region.start), width: position(region.end - region.start) }} data-section-action="move" role="button" tabIndex={disabled ? -1 : 0} aria-label="Move selected arrangement section" onKeyDown={(event) => key(event, 'move')}><span>{clockTime(region.start, 2)}–{clockTime(region.end, 2)}</span></div>
      {['start', 'end'].map((action) => <div key={action} className={'section-handle section-' + action} style={{ left: `clamp(22px, ${position(region[action])}, calc(100% - 22px))` }} data-section-action={action} role="slider" tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled} aria-label={'Arrangement loop ' + action} aria-valuemin={action === 'start' ? 0 : region.start + MIN_LOOP_SECONDS} aria-valuemax={action === 'start' ? region.end - MIN_LOOP_SECONDS : duration} aria-valuenow={region[action]} aria-valuetext={region[action].toFixed(2) + ' seconds'} onKeyDown={(event) => key(event, action)}><span>{action === 'start' ? '↤' : '↦'}</span></div>)}
    </div>
    <details className="section-exact"><summary>Type loop times</summary>
    <SectionForm key={studio.loopSection.start + '-' + studio.loopSection.end} studio={studio} />
    <p className="arrangement-help">Arrows adjust the selection; Shift makes fine adjustments. Looping keeps the original timing and fades. Clicking the ruler outside the section turns looping off.</p></details>
    <p className="section-summary"><output aria-label="Selected arrangement section">{clockTime(region.start, 2)}–{clockTime(region.end, 2)}</output> · listening only</p>
  </section>;
}
