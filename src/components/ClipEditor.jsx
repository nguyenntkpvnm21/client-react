import { useId, useState } from 'react';
import { clipRegion, validateRegion } from '../lib/clipRegion.js';
import './ClipEditor.css';

function RegionControls({ track, info, studio }) {
  const region = clipRegion(track, info.duration);
  const [start, setStart] = useState(String(region.start));
  const [end, setEnd] = useState(String(region.end));
  const [loop, setLoop] = useState(track.loop);
  const [previewBusy, setPreviewBusy] = useState(false);
  const uid = useId();
  let bounds;
  let error = '';
  try { bounds = validateRegion(start, end, info.duration); } catch (problem) { error = problem.message; }
  const left = bounds ? bounds.clipStart / info.duration * 100 : 0;
  const right = bounds ? bounds.clipEnd / info.duration * 100 : 0;
  const preview = studio.preview?.id === track.id ? studio.preview : null;
  const disabled = studio.busy;
  function change(setter, value) { studio.stopPreview(); setter(value); }
  async function audition() {
    if (preview || previewBusy) { studio.stopPreview(); setPreviewBusy(false); return; }
    if (!bounds) return;
    setPreviewBusy(true);
    try { await studio.previewClip(track.id, bounds.clipStart, bounds.clipEnd, loop); }
    finally { setPreviewBusy(false); }
  }
  return <div className="clip-controls">
    <div className="clip-wave" role="img" aria-label={'Selected audio from ' + (bounds ? bounds.clipStart.toFixed(3) + ' to ' + bounds.clipEnd.toFixed(3) : 'invalid range') + ' seconds'}>
      <svg viewBox="0 0 480 92" preserveAspectRatio="none" aria-hidden="true">
        <defs><clipPath id={uid}><rect x={left * 4.8} width={(right - left) * 4.8} y="0" height="92" /></clipPath></defs>
        <g className="clip-wave-base">{info.peaks.map((peak, index) => <rect key={index} x={index * 10 + 2} y={46 - Math.max(2, peak * 38)} width="6" height={Math.max(4, peak * 76)} rx="2" />)}</g>
        {bounds && <><rect className="clip-selection" x={left * 4.8} width={(right - left) * 4.8} height="92" />
          <g className="clip-wave-selected" clipPath={'url(#' + uid + ')'}>{info.peaks.map((peak, index) => <rect key={index} x={index * 10 + 2} y={46 - Math.max(2, peak * 38)} width="6" height={Math.max(4, peak * 76)} rx="2" />)}</g>
          <path className="clip-boundary" d={'M' + left * 4.8 + ' 0V92 M' + right * 4.8 + ' 0V92'} /></>}
        {preview && <path className="clip-playhead" d={'M' + preview.position / info.duration * 480 + ' 0V92'} />}
      </svg>
    </div>
    <div className="clip-times"><span>0 s</span><span>{info.duration.toFixed(3)} s · original recording</span></div>
    <div className="clip-fields">
      <div><label htmlFor={uid + '-start'}>Start (seconds)</label>
        <input id={uid + '-start'} type="number" min="0" max={info.duration} step="0.001" value={start} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? uid + '-error' : undefined} onChange={(event) => change(setStart, event.target.value)} />
        <input aria-label={'Clip start for ' + track.name} type="range" min="0" max={info.duration} step="0.001" value={Number(start) || 0} disabled={disabled} onChange={(event) => change(setStart, event.target.value)} /></div>
      <div><label htmlFor={uid + '-end'}>End (seconds)</label>
        <input id={uid + '-end'} type="number" min="0" max={info.duration} step="0.001" value={end} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? uid + '-error' : undefined} onChange={(event) => change(setEnd, event.target.value)} />
        <input aria-label={'Clip end for ' + track.name} type="range" min="0" max={info.duration} step="0.001" value={Number(end) || 0} disabled={disabled} onChange={(event) => change(setEnd, event.target.value)} /></div>
    </div>
    {error ? <p className="clip-error" id={uid + '-error'} role="alert">{error}</p> : <p className="clip-duration">Selected: {(bounds.clipEnd - bounds.clipStart).toFixed(3)} seconds</p>}
    <label className="clip-loop"><input type="checkbox" checked={loop} disabled={disabled} onChange={(event) => change(setLoop, event.target.checked)} />Loop selected region</label>
    <div className="clip-actions">
      <button type="button" disabled={disabled || !!error} onClick={audition}>{preview || previewBusy ? 'Stop preview' : 'Preview clip'}</button>
      <button type="button" className="clip-apply" disabled={disabled || !!error} onClick={() => studio.applyClip(track.id, bounds.clipStart, bounds.clipEnd, loop)}>Apply range</button>
      <button type="button" disabled={disabled} onClick={() => studio.applyClip(track.id, 0, info.duration, track.loop, true)}>Reset clip</button>
    </div>
    <p className="clip-help">Preview plays this layer alone at 40% volume. Applying a range stops the mix and returns it to the beginning. The original file stays intact.</p>
  </div>;
}

export default function ClipEditor({ track, info, studio }) {
  return <section className="clip-editor" aria-label={track.name + ' clip editor'}>
    <div className="clip-heading"><h4>Shape this sound</h4><button type="button" className="text-button" onClick={studio.closeClip}>Close editor</button></div>
    {info ? <RegionControls track={track} info={info} studio={studio} /> : <div className="clip-loading"><p>Loading the original waveform…</p><button type="button" onClick={() => studio.openClip(track.id)}>Retry loading</button></div>}
  </section>;
}
