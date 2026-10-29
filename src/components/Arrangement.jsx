import ClipEditor from './ClipEditor';
import SourcePool from './SourcePool';
import ArrangementSection from './ArrangementSection';
import ArrangementExport from './ArrangementExport';
import TimelineClip from './TimelineClip';
import { useId, useRef, useState } from 'react';
import { arrangementWindow, placementMetadata, validatePlacement } from '../lib/arrangementState.js';
import { isSequenced } from '../lib/sequencerState.js';
import { formatTime } from '../lib/studioState.js';
import './Arrangement.css';

function LengthForm({ studio }) {
  const [value, setValue] = useState(String(studio.arrangement.duration));
  const [error, setError] = useState('');
  function apply(event) {
    event.preventDefault();
    try { if (studio.setArrangementLength(value)) setError(''); }
    catch (problem) { setError(problem.message); }
  }
  return <form className="arrangement-length" onSubmit={apply} noValidate>
    <label htmlFor="arrangement-length">Composition length <span>seconds</span></label>
    <div><input id="arrangement-length" type="number" min="1" max="300" step="0.1" value={value} disabled={studio.busy}
      aria-invalid={!!error} aria-describedby={error ? 'length-error' : 'length-help'} onChange={(event) => { setValue(event.target.value); setError(''); }} />
      <button type="submit" disabled={studio.busy}>Set length</button></div>
    {error ? <p className="arrangement-error" id="length-error" role="alert">{error}</p> : <p id="length-help">1–300 seconds. Setting length stops playback.</p>}
  </form>;
}

function TimingForm({ track, studio, onDone }) {
  const saved = placementMetadata(track.placement);
  const [draft, setDraft] = useState({ start: String(saved.start), end: String(saved.end ?? studio.arrangement.duration), fadeIn: String(saved.fadeIn), fadeOut: String(saved.fadeOut) });
  const [error, setError] = useState('');
  const uid = useId();
  function apply(event) {
    event.preventDefault();
    try {
      const value = validatePlacement(draft, studio.arrangement.duration);
      if (studio.setPlacement(track.id, value)) onDone();
    } catch (problem) { setError(problem.message); }
  }
  const fields = [['start', 'Entry'], ['end', 'Exit'], ['fadeIn', 'Fade in'], ['fadeOut', 'Fade out']];
  return <form className="timing-form" onSubmit={apply} noValidate>
    <div className="timing-inputs">{fields.map(([field, label]) => <label key={field} htmlFor={uid + field}>{label} <span>seconds</span>
      <input id={uid + field} aria-label={track.name + ' ' + label.toLowerCase() + ' seconds'} type="number" min="0" max={studio.arrangement.duration} step="0.01"
        value={draft[field]} disabled={studio.busy} aria-describedby={error ? uid + '-error' : undefined} onChange={(event) => { setDraft((previous) => ({ ...previous, [field]: event.target.value })); setError(''); }} /></label>)}</div>
    {error && <p id={uid + '-error'} className="arrangement-error" role="alert">{error}</p>}
    <div className="timing-actions"><button type="submit" className="timing-apply" disabled={studio.busy}>Apply timing</button>
      <button type="button" disabled={studio.busy} onClick={() => { if (studio.setPlacement(track.id, null, true)) onDone(); }}>Reset timing</button>
      <button type="button" onClick={onDone}>Cancel</button></div>
    <p className="arrangement-help">Timing edits keep the playback position. These times place the layer in the composition; Edit sample chooses which part of the recording it uses.</p>
  </form>;
}

function ArrangementRow({ track, studio, cursor, snap }) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef(null);
  const window = arrangementWindow(track, { ...studio.arrangement, enabled: true });
  const duration = studio.arrangement.duration;
  const [loading, setLoading] = useState(false);
  const active = studio.arrangement.enabled && studio.status === 'playing' && studio.elapsed >= window.start && studio.elapsed < window.end;
  function done() { setEditing(false); editButton.current?.focus(); }
  return <article data-clip-id={track.id} className={'arrangement-row ' + track.role + (active ? ' is-active' : '')} aria-label={track.name + ' arrangement'}>
    <div className="arrangement-row-heading"><div><h3 title={track.name}>{track.name}</h3><span>{isSequenced(track) ? 'Rhythm pattern' : track.loop ? 'Looping layer' : 'One-shot layer'}</span></div>
      <div className="arrangement-row-controls">
        <button type="button" aria-label={'Solo ' + track.name + ' in arrangement'} aria-pressed={track.solo} disabled={studio.projectBusy} onClick={() => studio.updateTrack(track.id, { solo: !track.solo })}>Solo</button>
        <button type="button" aria-label={'Mute ' + track.name + ' in arrangement'} aria-pressed={track.muted} disabled={studio.projectBusy} onClick={() => studio.updateTrack(track.id, { muted: !track.muted })}>{track.muted ? 'Unmute' : 'Mute'}</button>
        <button type="button" ref={editButton} aria-label={'Edit timing for ' + track.name} aria-expanded={editing} disabled={studio.busy} onClick={() => editing ? done() : setEditing(true)}>{editing ? 'Close timing' : 'Edit timing'}</button>
      </div></div>
    <TimelineClip track={track} studio={studio} window={window} cursor={cursor} snap={snap} />
    <div className="timeline-row-tools">{!isSequenced(track) && <label><input type="checkbox" checked={track.loop} disabled={studio.busy} onChange={(event) => studio.updateTrack(track.id, { loop: event.target.checked })} aria-label={'Loop ' + track.name + ' selected clip'} />Loop selected clip</label>}
      {!studio.details[track.id] && <button type="button" disabled={loading || studio.busy} onClick={async () => { setLoading(true); try { await studio.loadTrackInfo(track.id); } finally { setLoading(false); } }}>{loading ? 'Loading waveform…' : 'Load waveform'}</button>}
      <span>{isSequenced(track) ? 'Rhythm follows the shared beat grid.' : studio.details[track.id] ? 'Hatched areas are silent after the source ends.' : 'Load waveform to see source length and any silence.'}</span>
    </div>
    <p className="clip-instance-source">Source: {studio.sources.find((source) => source.id === (track.sourceId || track.id))?.name || track.name}{track.sourceOffset ? ' · starts ' + track.sourceOffset.toFixed(2) + ' s into the loop' : ''}</p>
    <div className="clip-instance-tools">
      <button type="button" disabled={studio.busy} aria-label={'Duplicate ' + track.name} onClick={() => studio.duplicateClip(track.id)}>Duplicate</button>
      <button type="button" disabled={studio.busy || !studio.arrangement.enabled || isSequenced(track)} title={isSequenced(track) ? 'Switch to normal playback to split audio' : 'Set the playhead inside this clip, then split'} aria-label={'Split ' + track.name + ' at playhead'} onClick={() => studio.splitClip(track.id)}>Split at playhead</button>
      <button type="button" disabled={studio.busy} aria-expanded={studio.editorId === track.id && studio.editorLocation === 'arrangement'} aria-label={'Edit audio for ' + track.name} onClick={() => studio.editorId === track.id && studio.editorLocation === 'arrangement' ? studio.closeClip() : studio.openClip(track.id, 'arrangement')}>Edit audio</button>
      <button type="button" disabled={studio.busy} aria-label={'Remove clip ' + track.name} onClick={() => studio.removeTrack(track.id)}>Remove clip</button>
      <label>Level<input type="range" min="0" max="100" value={track.volume} aria-label={track.name + ' arrangement volume'} disabled={studio.projectBusy} onChange={(event) => studio.updateTrack(track.id, { volume: Number(event.target.value) })} /><output>{track.volume}%</output></label>
    </div>
    {studio.editorId === track.id && studio.editorLocation === 'arrangement' && <ClipEditor track={track} info={studio.details[track.id]} studio={studio} location="arrangement" />}
    {editing && <TimingForm key={JSON.stringify(track.placement) + '-' + duration} track={track} studio={studio} onDone={done} />}
  </article>;
}

function TimeRuler({ studio }) {
  const duration = studio.arrangement.duration;
  const position = studio.arrangement.enabled ? Math.min(duration, studio.elapsed) : 0;
  const disabled = studio.booting || studio.importing || studio.projectBusy || !studio.tracks.length;
  function key(event) {
    let next;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = position - (event.shiftKey ? .01 : 1);
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = position + (event.shiftKey ? .01 : 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = duration;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault();if (!disabled) void studio.seekArrangement(position);return; }
    if (next === undefined) return;
    event.preventDefault();
    if (!disabled) void studio.seekArrangement(Math.max(0, Math.min(next, duration)), false);
  }
  return <>
    <p className="arrangement-seek-help" id="arrangement-seek-help">Click the time ruler to play from there. Arrow keys move the position; Enter plays.</p>
    <div className="arrangement-ruler" role="slider" tabIndex={disabled ? -1 : 0} aria-label="Arrangement play from position" aria-describedby="arrangement-seek-help"
      aria-disabled={disabled} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Number(position.toFixed(2))} aria-valuetext={position.toFixed(2) + ' seconds'} onKeyDown={key}
      onClick={(event) => { if (disabled) return;event.currentTarget.focus();const box = event.currentTarget.getBoundingClientRect();void studio.seekArrangement(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * duration); }}>
      {[0, .25, .5, .75, 1].map((fraction) => <span key={fraction} aria-hidden="true">{Number((duration * fraction).toFixed(2))}s</span>)}
      <span className="ruler-playhead" style={{ left: position / duration * 100 + '%' }} aria-hidden="true" />
    </div>
  </>;
}

export default function Arrangement({ studio }) {
  const [error, setError] = useState('');
  const [snap, setSnap] = useState(true);
  const active = !studio.loopSection.enabled && studio.arrangement.enabled && (studio.status === 'playing' || studio.status === 'loading');
  const duration = studio.arrangement.duration;
  const cursor = studio.arrangement.enabled ? Math.min(100, Math.max(0, studio.elapsed / duration * 100)) : null;
  async function play() {
    setError('');
    try { await studio.playArrangement(); } catch (problem) { setError(problem.message); }
  }
  return <section className="arrangement-panel panel" id="arrangement" aria-labelledby="arrangement-title">
    <div className="arrangement-heading"><div><p className="eyebrow">GIVE YOUR MIX A BEGINNING AND AN END</p><h2 id="arrangement-title">Arrange your mix</h2>
      <p>Bring sounds in, let them fade, and shape a complete piece.</p></div>
      <div className="arrangement-playback"><button type="button" className="arrangement-play" disabled={studio.booting || (!active && studio.busy) || !studio.tracks.length} onClick={play}>{!studio.loopSection.enabled && studio.arrangement.enabled && studio.status === 'loading' ? 'Cancel arrangement loading' : active ? 'Pause arrangement' : studio.loopSection.enabled ? 'Play full arrangement' : 'Play arrangement'}</button>
        <button type="button" disabled={studio.busy || !studio.arrangement.enabled} onClick={studio.freeMix}>Free mix</button></div></div>
    <div className="arrangement-settings"><LengthForm key={duration + '-' + (studio.activeProject?.id || 'workspace')} studio={studio} />
      <div className="arrangement-position"><span className={studio.arrangement.enabled ? 'arrangement-mode is-on' : 'arrangement-mode'}>{studio.arrangement.enabled ? 'Timeline on' : 'Free mix mode'}</span>
        <output aria-label="Arrangement playback position">{formatTime(studio.arrangement.enabled ? studio.elapsed : 0)} / {formatTime(duration)}</output>
        <span>{studio.arrangement.enabled && studio.status === 'finished' ? 'Finished. Play again from the beginning.' : studio.loopSection.enabled ? 'Looping ' + studio.loopSection.start.toFixed(2) + '–' + studio.loopSection.end.toFixed(2) + ' seconds.' : 'Playback stops at the composition end.'}</span></div></div>
    <div className="timeline-instructions"><p id="timeline-help">Pause at a cut point, then use Split at playhead. Drag a clip to move it. Bottom handles trim audio; top handles adjust fades. Release applies timing and keeps playback in place. Arrow keys move handles; Shift makes fine adjustments.</p><label><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} />Snap to beats ({studio.bpm} BPM)</label></div>
    <div className="arrangement-listen-tools"><span>Solo isolates selected layers in this mix. Muted layers stay silent until you unmute them.</span>
      {studio.tracks.some((track) => track.solo) && <button type="button" disabled={studio.projectBusy} onClick={studio.clearSolos}>Clear solos</button>}</div>
    <details className="arrangement-source-pool"><summary>Project sources · add another clip without importing again</summary><SourcePool studio={studio} /></details>
    <ArrangementSection studio={studio} snap={snap} />
    <TimeRuler studio={studio} />
    <div className="arrangement-layers">{studio.tracks.map((track) => <ArrangementRow key={track.id} track={track} studio={studio} cursor={cursor} snap={snap} />)}
      {!studio.tracks.length && <p className="arrangement-help">Add a sound in the studio to start arranging.</p>}</div>
    <ArrangementExport key={studio.activeProject?.id || 'workspace'} studio={studio} />
    {error && <p className="arrangement-error" role="alert">{error}</p>}
    <p className="arrangement-help">Each row is an independent clip. Duplicate or Add clip reuses the source; Split cuts at the playhead. Overlap rows to layer audio. Each clip starts its selected recording at Entry; one-shots can finish before Exit. Rhythm hits follow the shared grid inside their window.</p>
    <p className="arrangement-help">Use Play arrangement to apply these timings, or Free mix to return to continuous mixing. Save the mix to keep timings and fades. Source recordings stay intact.</p>
  </section>;
}
