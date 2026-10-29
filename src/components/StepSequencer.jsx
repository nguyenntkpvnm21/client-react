import { patternSummary, rhythmMetadata } from '../lib/rhythmState.js';
import { placementMetadata } from '../lib/arrangementState.js';
import { clockTime } from '../lib/timeFormat.js';
import { DRUMS } from '../lib/drumStarter.js';
import { MAX_CLIPS, MAX_TRACKS } from '../data/sounds.js';
import { useEffect, useRef, useState } from 'react';
import { MAX_BPM, MIN_BPM, sequenceMetadata, stepSeconds, STEP_COUNT } from '../lib/sequencerState.js';
import ClipEditor from './ClipEditor';
import Icon from './Icon';
import './StepSequencer.css';

function TempoInput({ studio }) {
  const [draft, setDraft] = useState(String(studio.bpm));
  const [error, setError] = useState('');
  function apply(event) {
    event.preventDefault();
    const value = Number(draft);
    if (!draft.trim() || !Number.isInteger(value) || value < MIN_BPM || value > MAX_BPM) {
      setError('Enter a whole number from 40 to 240.');
      return;
    }
    setError('');
    studio.setBpm(value);
  }
  return <form className="tempo-form" onSubmit={apply} noValidate>
    <label htmlFor="pattern-bpm">Speed <span>BPM</span></label>
    <div><input id="pattern-bpm" type="number" min={MIN_BPM} max={MAX_BPM} step="1" value={draft} disabled={studio.busy}
      aria-invalid={!!error} aria-describedby={error ? 'tempo-error' : 'tempo-hint'} onChange={(event) => { setDraft(event.target.value); setError(''); }} />
      <button type="submit" disabled={studio.busy}>Set speed</button></div>
    {error ? <p id="tempo-error" className="tempo-error" role="alert">{error}</p> : <p id="tempo-hint">40–240 · higher is faster</p>}
  </form>;
}

function SequenceRow({ track, studio }) {
  const buttons = useRef([]);
  const editButton = useRef(null);
  const wasEditing = useRef(false);
  const sequence = sequenceMetadata(track);
  const rhythm = rhythmMetadata(track);
  const duration = studio.details[track.id]?.duration;
  const summary = duration ? patternSummary(track, duration, studio.bpm) : null;
  const placement = placementMetadata(track.placement);
  const patternPreview = studio.preview?.id === track.id && studio.preview.kind === 'pattern';
  const count = sequence.steps.filter(Boolean).length;
  const editing = studio.editorId === track.id && studio.editorLocation === 'sequencer';
  useEffect(() => {
    if (wasEditing.current && !studio.editorId) editButton.current?.focus({ preventScroll: true });
    wasEditing.current = editing;
  }, [editing, studio.editorId]);
  function move(event, step) {
    let target;
    if (event.key === 'ArrowRight') target = (step + 1) % STEP_COUNT;
    if (event.key === 'ArrowLeft') target = (step + STEP_COUNT - 1) % STEP_COUNT;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = STEP_COUNT - 1;
    if (target === undefined) return;
    event.preventDefault();
    buttons.current[target]?.focus();
  }
  return <article data-rhythm-id={track.id} className={'sequence-row ' + track.role + (sequence.enabled ? ' is-enabled' : '')} aria-label={track.name + ' rhythm'}>
    <div className="sequence-row-heading">
      <div className="sequence-sound"><span className="sequence-sound-icon"><Icon name={track.role === 'nature' ? 'leaf' : track.role} size={20} /></span>
        <div><h3 title={track.name}>{track.name}</h3><p>{sequence.enabled ? 'Rhythm' : 'Normal playback'}
          {rhythm.sampleEnd != null ? ' · ' + clockTime(rhythm.sampleEnd - rhythm.sampleStart, 3) + ' sample' : ''}
          {track.muted ? ' · Muted' : ''}</p></div></div>
      <div className="sequence-tools">
        <button type="button" className={sequence.enabled ? '' : 'create-rhythm'} disabled={studio.busy}
          ref={!rhythm.initialized ? editButton : undefined} aria-expanded={!rhythm.initialized ? editing : undefined}
          aria-pressed={rhythm.initialized ? sequence.enabled : undefined}
          aria-label={(sequence.enabled ? 'Turn off rhythm for ' : rhythm.initialized ? 'Turn on rhythm for ' : 'Choose sample for ') + track.name}
          onClick={() => sequence.enabled ? studio.setSequenced(track.id, false) : rhythm.initialized ? studio.createRhythm(track.id) : editing ? studio.closeClip() : studio.openClip(track.id, 'sequencer')}>
          {sequence.enabled ? 'Rhythm on' : rhythm.initialized ? 'Rhythm off' : 'Choose sample'}</button>
        {rhythm.initialized && <button ref={editButton} type="button" disabled={studio.busy} aria-expanded={editing} aria-label={'Edit sample for ' + track.name}
          onClick={() => editing ? studio.closeClip() : studio.openClip(track.id, 'sequencer')}>Edit sample</button>
        }
      </div>
    </div>
    {studio.arrangement.enabled && <p className="sequence-window">Timeline {clockTime(placement.start, 2)}–{clockTime(placement.end ?? studio.arrangement.duration, 2)}</p>}
    {editing && <ClipEditor track={track} info={studio.details[track.id]} studio={studio} location="sequencer" />}
    {rhythm.initialized ? <>
      {!sequence.enabled && <p className="sequence-idle">Off in the mix. Your steps and sample are kept; you can edit or hear this rhythm here.</p>}
      <div className="sequence-beat-groups" role="group" aria-label={track.name + ' pattern'}>
        {[0, 1, 2, 3].map((beat) => <div className="sequence-beat" key={beat} role="group" aria-label={track.name + ' beat ' + (beat + 1)}>
          <span className="sequence-beat-label">Beat {beat + 1}</span>
          <div className="sequence-steps">{sequence.steps.slice(beat * 4, beat * 4 + 4).map((on, position) => {
            const step = beat * 4 + position;
            return <button key={step} ref={(node) => { buttons.current[step] = node; }} type="button"
              disabled={studio.busy} aria-label={track.name + ' step ' + (step + 1)} aria-pressed={on}
              className={(position === 0 ? 'beat-start ' : '') + ((patternPreview ? studio.preview.step : sequence.enabled ? studio.currentStep : null) === step ? 'is-current' : '')}
              onKeyDown={(event) => move(event, step)} onClick={() => studio.toggleStep(track.id, step)}>{step + 1}</button>;
          })}</div>
        </div>)}
      </div>
      <div className="sequence-row-footer"><button type="button" className="pattern-preview-button" disabled={studio.booting || studio.busy || (!count && !patternPreview)} aria-pressed={patternPreview}
        aria-label={(patternPreview ? 'Stop rhythm preview for ' : 'Hear rhythm for ') + track.name} onClick={() => studio.previewPattern(track.id)}>
        <Icon name={patternPreview ? 'pause' : 'play'} size={16} />{patternPreview ? (studio.preview.loading ? 'Cancel preview' : 'Stop preview') : 'Hear rhythm'}</button>
        <span>{patternPreview ? (studio.preview.loading ? 'Loading sample…' : studio.preview.step === null ? 'Listening to tails…' : 'Hearing this row · step ' + (studio.preview.step + 1))
          : count ? count + (count === 1 ? ' hit per loop' : ' hits per loop') : 'No hits yet. Tap a step to add one.'}</span>
        <label className="rhythm-level">Level <input type="range" min="0" max="100" value={track.volume} aria-label={track.name + ' rhythm level'} disabled={studio.busy} onChange={(event) => studio.updateTrack(track.id, { volume: Number(event.target.value) })} /></label>
        <button type="button" disabled={studio.busy} aria-pressed={track.muted} aria-label={'Mute ' + track.name + ' rhythm'} onClick={() => studio.updateTrack(track.id, { muted: !track.muted })}>Mute</button>
      </div>
      <details className="rhythm-options"><summary>Pattern options{summary?.cut ? ' · sample tails are cut' : summary?.crowded ? ' · many overlapping tails' : ''}</summary>
        <div className="pattern-audition"><label>Sample tails<select aria-label={track.name + ' sample tails'} value={rhythm.tailMode} disabled={studio.busy} onChange={(event) => studio.setTailMode(track.id, event.target.value)}><option value="cut">Cut at next hit</option><option value="ring">Let samples ring</option></select></label>
          <button type="button" disabled={studio.busy} title="Replace steps with hits on 1, 5, 9 and 13; keep the sample" onClick={() => studio.quarterSteps(track.id)} aria-label={'Four beats for ' + track.name}>Four beats</button>
          <button type="button" disabled={studio.busy || count === 0} onClick={() => studio.clearSteps(track.id)} aria-label={'Clear ' + track.name + ' steps'}>Clear steps</button></div>
        {summary?.cut && <p className="sample-tail-warning">Hits cut this sample short. Choose Let samples ring, or shorten it in Edit sample.</p>}
        {summary?.crowded && <p className="sample-tail-warning">This dense pattern may cut older tails. Use fewer hits or a shorter sample.</p>}
      </details>
    </> : !editing && <p className="sequence-idle">Choose a short hit. The full recording stays available in Arrangement.</p>}
  </article>;
}

export default function StepSequencer({ studio }) {
  const enabled = studio.tracks.filter((track) => sequenceMetadata(track).enabled);
  const initialized = studio.tracks.filter((track) => rhythmMetadata(track).initialized);
  const recordings = studio.tracks.filter((track) => !rhythmMetadata(track).initialized);
  const slots = Math.min(MAX_TRACKS - studio.sources.length, MAX_CLIPS - studio.tracks.length);
  const canAddKit = slots >= 1 && studio.tracks.length + 3 <= MAX_CLIPS;
  const active = studio.status === 'playing' || studio.status === 'loading';
  return <section className="sequencer panel" id="rhythm" aria-labelledby="sequencer-title">
    <div className="sequencer-heading"><div><h2 id="sequencer-title" className="sr-only">Beat sequencer</h2>
      <p className="sequencer-intro">Use <a href="#/arrangement">Arrangement</a> for vocals and full songs.</p></div>
      <a className="sequencer-save" href="#/saved-mixes">{studio.activeProject ? (studio.dirty ? 'Save your changes' : 'View saved mix') : 'Save your mix'} <span aria-hidden="true">↗</span></a></div>
    {studio.arrangement.enabled && <div className="rhythm-arrangement-banner"><div><strong>Arrangement is on</strong><p>Mix follows the timeline and ends at {clockTime(studio.arrangement.duration)}. Hear rhythm previews one row.</p></div><button type="button" disabled={studio.busy} onClick={studio.freeMix}>Switch to Free mix</button></div>}
    <div className="drum-starter"><div><strong>Start with a drum beat</strong><p>Kick, snare and hi-hat · adds 3 drum rows and keeps your clips.</p></div>
      <button type="button" className="create-rhythm" disabled={studio.busy || !canAddKit} onClick={() => studio.addDrumBeat()}>Add drum beat</button>
      <details><summary>Add one drum</summary><div className="single-drums">{DRUMS.map((drum) => <button key={drum.id} type="button" disabled={studio.busy || slots < 1} onClick={() => studio.addDrumBeat([drum.id])}>{drum.name}</button>)}</div></details>
      {!canAddKit && <p className="drum-space" role="status">{slots > 0 ? 'Not enough clip rows for a full beat. Add one drum, or remove a clip first.' : 'No space left. Remove an unused recording or clip in Studio to add drums.'}</p>}
    </div>
    <div className="sequencer-toolbar">
      <div className="sequencer-playback"><button type="button" className="play-button" disabled={studio.booting || (!active && studio.busy) || !studio.tracks.length} onClick={studio.togglePlayback}>
        <Icon name={active ? 'pause' : 'play'} size={18} />{studio.status === 'loading' ? 'Cancel loading' : active ? 'Pause full mix' : 'Play full mix'}</button>
        <button type="button" className="restart-button" disabled={studio.busy || !studio.tracks.length} aria-label="Restart rhythm and mix" onClick={studio.restartPlayback}><Icon name="reset" size={18} /></button></div>
      <div className="sequencer-meter"><span>4 beats · 16 steps · repeating loop</span><output aria-label="Sequencer position">{studio.currentStep === null ? 'Stopped' : 'Beat ' + (Math.floor(studio.currentStep / 4) + 1) + ' · step ' + (studio.currentStep + 1)}</output></div>
      <TempoInput key={(studio.activeProject?.id || 'workspace') + '-' + studio.bpm} studio={studio} />
    </div>
    <div className="sequencer-feedback" role="status">{studio.tempo.pending
      ? 'Playing at ' + studio.tempo.active + ' BPM. ' + studio.tempo.pending + ' BPM starts at the next loop.'
      : enabled.length ? 'Lit steps play. Dark steps rest.' : 'Add a drum beat, or choose a short sample from your recordings below.'}
      {enabled.length > 0 && <span>{clockTime(stepSeconds(studio.tempo.active) * STEP_COUNT, 2)} per loop</span>}</div>
    <div className="sequence-rows">{initialized.map((track) => <SequenceRow key={track.id} track={track} studio={studio} />)}</div>
    {!!recordings.length && <details className="custom-rhythm-samples"><summary>Use a sample from your recordings ({recordings.length})</summary><div className="sequence-rows">{recordings.map((track) => <SequenceRow key={track.id} track={track} studio={studio} />)}</div></details>}
    <details className="workspace-help"><summary>Rhythm help</summary><p>Each row repeats one short sample across 16 steps. Hear rhythm plays one row once and pauses the full mix. Play full mix plays all clips. Rhythm replaces normal playback for that clip; Rhythm off restores it and keeps your pattern.</p><p>Drums are synthesized locally and saved with your project. Speed changes start at the next loop. Pattern options contains Four beats, Clear steps and sample tails. This is a one-bar beat maker; it does not detect a song's tempo or stretch vocals to a beat.</p></details>
  </section>;
}
