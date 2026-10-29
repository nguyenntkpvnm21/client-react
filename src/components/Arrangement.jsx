import ClipEditor from './ClipEditor';
import SourcePool from './SourcePool';
import ArrangementSection from './ArrangementSection';
import ArrangementExport from './ArrangementExport';
import TimelineClip from './TimelineClip';
import { useId, useRef, useState } from 'react';
import { arrangementWindow, placementMetadata, validatePlacement } from '../lib/arrangementState.js';
import { isSequenced } from '../lib/sequencerState.js';
import { formatTime } from '../lib/studioState.js';
import { clockTime } from '../lib/timeFormat.js';
import { parsePlaybackTime } from '../lib/playbackTimeline.js';
import './Arrangement.css';

function LengthForm({ studio }) {
  const [value, setValue] = useState(clockTime(studio.arrangement.duration, 3));
  const [error, setError] = useState('');
  function apply(event) {
    event.preventDefault();
    try { if (studio.setArrangementLength(parsePlaybackTime(value))) setError(''); }
    catch (problem) { setError(problem.message); }
  }
  return <form className="arrangement-length" onSubmit={apply} noValidate>
    <label htmlFor="arrangement-length">Length <span>m:ss</span></label>
    <div><input id="arrangement-length" className="time-input" type="text" inputMode="text" placeholder="0:30" value={value} disabled={studio.busy}
      aria-invalid={!!error} aria-describedby={error ? 'length-error' : 'length-help'} onChange={(event) => { setValue(event.target.value); setError(''); }} />
      <button type="submit" disabled={studio.busy}>Set length</button></div>
    {error ? <p className="arrangement-error" id="length-error" role="alert">{error}</p> : <p id="length-help">0:01–5:00 · changing length pauses playback.</p>}
  </form>;
}

function TimingForm({ track, studio, onDone }) {
  const saved = placementMetadata(track.placement);
  const [draft, setDraft] = useState({ start: clockTime(saved.start, 3), end: clockTime(saved.end ?? studio.arrangement.duration, 3), fadeIn: clockTime(saved.fadeIn, 3), fadeOut: clockTime(saved.fadeOut, 3) });
  const [error, setError] = useState('');
  const uid = useId();
  function apply(event) {
    event.preventDefault();
    try {
      const value = validatePlacement(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, parsePlaybackTime(value)])), studio.arrangement.duration);
      if (studio.setPlacement(track.id, value)) onDone();
    } catch (problem) { setError(problem.message); }
  }
  const fields = [['start', 'Start'], ['end', 'End'], ['fadeIn', 'Fade in'], ['fadeOut', 'Fade out']];
  const fieldInput = ([field, label]) => <label key={field} htmlFor={uid + field}>{label} <span>m:ss</span>
    <input id={uid + field} className="time-input" aria-label={track.name + ' ' + label.toLowerCase() + ' time'} type="text" inputMode="text"
      value={draft[field]} disabled={studio.busy} aria-describedby={error ? uid + '-error' : undefined} onChange={(event) => { setDraft((previous) => ({ ...previous, [field]: event.target.value })); setError(''); }} /></label>;
  return <form className="timing-form" onSubmit={apply} noValidate>
    <div className="timing-inputs">{fields.slice(0, 2).map(fieldInput)}</div>
    <details className="timing-fades"><summary>Fade in &amp; out</summary><div className="timing-inputs">{fields.slice(2).map(fieldInput)}</div></details>
    {error && <p id={uid + '-error'} className="arrangement-error" role="alert">{error}</p>}
    <div className="timing-actions"><button type="submit" className="timing-apply" disabled={studio.busy}>Apply timing</button>
      <button type="button" disabled={studio.busy} onClick={() => { if (studio.setPlacement(track.id, null, true)) onDone(); }}>Reset timing</button>
      <button type="button" onClick={onDone}>Cancel</button></div>
    <p className="arrangement-help">Use m:ss, such as 1:30. Edits keep your playback position.</p>
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
    <div className="timeline-row-tools">{!isSequenced(track) && <label><input type="checkbox" checked={track.loop} disabled={studio.busy} onChange={(event) => studio.updateTrack(track.id, { loop: event.target.checked })} aria-label={'Loop ' + track.name + ' selected clip'} />Repeat clip</label>}
      {!studio.details[track.id] && <button type="button" disabled={loading || studio.busy} onClick={async () => { setLoading(true); try { await studio.loadTrackInfo(track.id); } finally { setLoading(false); } }}>{loading ? 'Loading waveform…' : 'Load waveform'}</button>}
    </div>
    <div className="clip-instance-tools">
      <button type="button" disabled={studio.busy} aria-label={'Duplicate ' + track.name} onClick={() => studio.duplicateClip(track.id)}>Duplicate</button>
      <button type="button" disabled={studio.busy || !studio.arrangement.enabled || isSequenced(track)} title={isSequenced(track) ? 'Switch to normal playback to split audio' : 'Set the playhead inside this clip, then split'} aria-label={'Split ' + track.name + ' at playhead'} onClick={() => studio.splitClip(track.id)}>Split at playhead</button>
      <button type="button" disabled={studio.busy} aria-expanded={studio.editorId === track.id && studio.editorLocation === 'arrangement'} aria-label={'Edit audio for ' + track.name} onClick={() => studio.editorId === track.id && studio.editorLocation === 'arrangement' ? studio.closeClip() : studio.openClip(track.id, 'arrangement')}>Edit audio</button>
      <label>Level<input type="range" min="0" max="100" value={track.volume} aria-label={track.name + ' arrangement volume'} disabled={studio.projectBusy} onChange={(event) => studio.updateTrack(track.id, { volume: Number(event.target.value) })} /><output>{track.volume}%</output></label>
      <details className="clip-more"><summary>More</summary><p className="clip-instance-source">Source: {studio.sources.find((source) => source.id === (track.sourceId || track.id))?.name || track.name}</p><button type="button" disabled={studio.busy} aria-label={'Remove clip ' + track.name} onClick={() => studio.removeTrack(track.id)}>Remove clip</button></details>
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
    <p className="arrangement-seek-help" id="arrangement-seek-help">Click the ruler to listen from there.</p>
    <div className="arrangement-ruler" role="slider" tabIndex={disabled ? -1 : 0} aria-label="Arrangement play from position" aria-describedby="arrangement-seek-help"
      aria-disabled={disabled} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Number(position.toFixed(2))} aria-valuetext={position.toFixed(2) + ' seconds'} onKeyDown={key}
      onClick={(event) => { if (disabled) return;event.currentTarget.focus();const box = event.currentTarget.getBoundingClientRect();void studio.seekArrangement(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * duration); }}>
      {[0, .25, .5, .75, 1].map((fraction) => <span key={fraction} aria-hidden="true">{clockTime(duration * fraction, 2)}</span>)}
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
    <div className="arrangement-heading"><div><h2 id="arrangement-title">Timeline</h2></div>
      <div className="arrangement-playback"><button type="button" className="arrangement-play" disabled={studio.booting || (!active && studio.busy) || !studio.tracks.length} onClick={play}>{!studio.loopSection.enabled && studio.arrangement.enabled && studio.status === 'loading' ? 'Cancel arrangement loading' : active ? 'Pause arrangement' : studio.loopSection.enabled ? 'Play full arrangement' : 'Play arrangement'}</button>
        <button type="button" disabled={studio.busy || !studio.arrangement.enabled} onClick={studio.freeMix}>Free mix</button></div></div>
    <div className="arrangement-settings"><LengthForm key={duration + '-' + (studio.activeProject?.id || 'workspace')} studio={studio} />
      <div className="arrangement-position"><span className={studio.arrangement.enabled ? 'arrangement-mode is-on' : 'arrangement-mode'}>{studio.arrangement.enabled ? 'Timeline on' : 'Free mix mode'}</span>
        <output aria-label="Arrangement playback position">{formatTime(studio.arrangement.enabled ? studio.elapsed : 0)} / {formatTime(duration)}</output>
        <span>{studio.arrangement.enabled && studio.status === 'finished' ? 'Finished. Press Play to start again.' : studio.loopSection.enabled ? 'Looping ' + clockTime(studio.loopSection.start, 2) + '–' + clockTime(studio.loopSection.end, 2) : 'Stops at the end.'}</span></div></div>
    <div className="timeline-instructions"><p id="timeline-help">Drag to move. Pull an edge to trim.</p><label><input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} />Snap to beats</label></div>
    <div className="arrangement-listen-tools">
      {studio.tracks.some((track) => track.solo) && <button type="button" disabled={studio.projectBusy} onClick={studio.clearSolos}>Clear solos</button>}</div>
    <div className="arrangement-options"><details className="arrangement-source-pool"><summary>Add another clip</summary><SourcePool studio={studio} /></details>
    <details className="loop-listening" open={studio.loopSection.enabled || undefined}><summary>Loop a section{studio.loopSection.enabled ? ' · ' + clockTime(studio.loopSection.start, 2) + '–' + clockTime(studio.loopSection.end, 2) : ''}</summary><ArrangementSection studio={studio} snap={snap} /></details></div>
    <TimeRuler studio={studio} />
    <div className="arrangement-layers">{studio.tracks.map((track) => <ArrangementRow key={track.id} track={track} studio={studio} cursor={cursor} snap={snap} />)}
      {!studio.tracks.length && <p className="arrangement-help">Add a sound in the studio to start arranging.</p>}</div>
    <ArrangementExport key={studio.activeProject?.id || 'workspace'} studio={studio} />
    {error && <p className="arrangement-error" role="alert">{error}</p>}
    <details className="workspace-help"><summary>Timeline help</summary><p>Use Edit audio to choose a part of a recording. Use Edit timing to place it in the mix. Pause at a cut point, then Split at playhead. Duplicate makes an independent copy.</p><p>Top handles adjust fades; bottom handles trim audio. Arrow keys adjust a handle; Shift makes smaller changes. Solo plays selected clips alone. Mute silences a clip.</p><p>Free mix plays without timeline timing. Save your mix to keep edits.</p></details>
  </section>;
}
