import { rhythmRegion } from '../lib/rhythmState.js';
import WaveformSelector from './WaveformSelector';
import { isSequenced } from '../lib/sequencerState.js';
import { useId, useState } from 'react';
import { clipRegion, validateRegion } from '../lib/clipRegion.js';
import { clockTime } from '../lib/timeFormat.js';
import { parsePlaybackTime } from '../lib/playbackTimeline.js';
import './ClipEditor.css';

function RegionControls({ track, info, studio, location }) {
  const region = location === 'sequencer' ? rhythmRegion(track, info.duration) : clipRegion(track, info.duration);
  const [start, setStart] = useState(clockTime(region.start, 3));
  const [end, setEnd] = useState(clockTime(region.end, 3));
  const [loop, setLoop] = useState(track.loop);
  const [previewBusy, setPreviewBusy] = useState(false);
  const uid = useId();
  let bounds;
  let error = '';
  try { bounds = validateRegion(parsePlaybackTime(start), parsePlaybackTime(end), info.duration); } catch (problem) { error = problem.message; }
  const preview = studio.preview?.id === track.id && studio.preview.kind !== 'pattern' ? studio.preview : null;
  const disabled = studio.busy;
  function change(setter, value) { studio.stopPreview(); setter(value); }
  async function audition() {
    if (preview || previewBusy) { studio.stopPreview(); setPreviewBusy(false); return; }
    if (!bounds) return;
    setPreviewBusy(true);
    try { await studio.previewClip(track.id, bounds.clipStart, bounds.clipEnd, location === 'sequencer' ? false : loop); }
    finally { setPreviewBusy(false); }
  }
  return <div className="clip-controls">
    <WaveformSelector track={track} info={info} studio={studio} start={bounds?.clipStart ?? region.start} end={bounds?.clipEnd ?? region.end} rhythm={location === 'sequencer'}
      onChange={(value) => { studio.stopPreview(); setStart(clockTime(value.start, 3)); setEnd(clockTime(value.end, 3)); }} />
    <details><summary>Type start &amp; end</summary>
    <div className="clip-fields">
      <div><label htmlFor={uid + '-start'}>Start · m:ss</label>
        <input id={uid + '-start'} className="time-input" type="text" value={start} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? uid + '-error' : undefined} onChange={(event) => change(setStart, event.target.value)} />
        <input aria-label={'Clip start for ' + track.name} type="range" min="0" max={info.duration} step="0.001" value={bounds?.clipStart ?? region.start} disabled={disabled} onChange={(event) => change(setStart, clockTime(Number(event.target.value), 3))} /></div>
      <div><label htmlFor={uid + '-end'}>End · m:ss</label>
        <input id={uid + '-end'} className="time-input" type="text" value={end} disabled={disabled} aria-invalid={!!error} aria-describedby={error ? uid + '-error' : undefined} onChange={(event) => change(setEnd, event.target.value)} />
        <input aria-label={'Clip end for ' + track.name} type="range" min="0" max={info.duration} step="0.001" value={bounds?.clipEnd ?? region.end} disabled={disabled} onChange={(event) => change(setEnd, clockTime(Number(event.target.value), 3))} /></div>
    </div>
    </details>
    {error ? <p className="clip-error" id={uid + '-error'} role="alert">{error}</p> : <p className="clip-duration">Selection {clockTime(bounds.clipEnd - bounds.clipStart, 3)}</p>}
    {location !== 'sequencer' && <label className="clip-loop"><input type="checkbox" checked={loop} disabled={disabled} onChange={(event) => change(setLoop, event.target.checked)} />Loop selected region</label>}
    <div className="clip-actions">
      <button type="button" className="clip-apply" disabled={disabled || !!error} onClick={() => studio.applyClip(track.id, bounds.clipStart, bounds.clipEnd, loop, false, location)}>{location === 'sequencer' ? 'Use this sample' : 'Apply range'}</button>
      <button type="button" disabled={disabled || !!error} onClick={audition}>{preview || previewBusy ? 'Stop preview' : location === 'sequencer' ? 'Hear sample' : 'Preview clip'}</button>
      <button type="button" disabled={disabled} onClick={() => studio.applyClip(track.id, 0, info.duration, track.loop, true, location)}>{location === 'sequencer' ? 'Use full recording' : 'Reset clip'}</button>
    </div>
    {isSequenced(track) && location !== 'sequencer' && <p className="clip-help">Rhythm is enabled. Normal clip edits are heard after choosing Use normal playback in Rhythm.</p>}
    <p className="clip-help">{location === 'arrangement' ? 'Applying keeps your playback position.' : 'Applying restarts the mix.'} Your original recording is kept.</p>
  </div>;
}

export default function ClipEditor({ track, info, studio, location = 'mixer' }) {
  return <section className="clip-editor" aria-label={track.name + ' clip editor'}>
    <div className="clip-heading"><h4>{location === 'sequencer' ? 'Choose sample' : 'Choose audio'}</h4><button type="button" className="text-button" onClick={studio.closeClip}>Close editor</button></div>
    {info ? <RegionControls track={track} info={info} studio={studio} location={location} /> : <div className="clip-loading"><p>Loading the original waveform…</p><button type="button" onClick={() => studio.openClip(track.id, location)}>Retry loading</button></div>}
  </section>;
}
