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
  const count = sequence.steps.filter(Boolean).length;
  const editing = studio.editorId === track.id && studio.editorLocation === 'sequencer';
  const listening = studio.preview?.id === track.id;
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
  return <article className={'sequence-row ' + track.role + (sequence.enabled ? ' is-enabled' : '')} aria-label={track.name + ' rhythm'}>
    <div className="sequence-row-heading">
      <div className="sequence-sound"><span className="sequence-sound-icon"><Icon name={track.role === 'nature' ? 'leaf' : track.role} size={20} /></span>
        <div><h3 title={track.name}>{track.name}</h3><p>{sequence.enabled ? 'Rhythm' : 'Normal playback'}
          {track.clipEnd != null ? ' · ' + (track.clipEnd - (track.clipStart || 0)).toFixed(2) + ' s sample' : ' · Full recording'}
          {track.muted ? ' · Muted' : ''}</p></div></div>
      <div className="sequence-tools">
        <button ref={editButton} type="button" disabled={studio.busy} aria-expanded={editing} aria-label={'Edit sample for ' + track.name}
          onClick={() => editing ? studio.closeClip() : studio.openClip(track.id, 'sequencer')}>Edit sample</button>
        <button type="button" disabled={studio.busy} aria-pressed={listening} aria-label={(listening ? 'Stop sample for ' : 'Listen to sample for ') + track.name}
          onClick={() => studio.previewSample(track.id)}><Icon name={listening ? 'pause' : 'play'} size={14} />{listening ? 'Stop sample' : 'Listen'}</button>
        <button type="button" className={sequence.enabled ? '' : 'create-rhythm'} disabled={studio.busy}
          onClick={() => sequence.enabled ? studio.setSequenced(track.id, false) : studio.createRhythm(track.id)}>
          {sequence.enabled ? 'Use normal playback' : 'Create rhythm'}</button>
      </div>
    </div>
    {editing && <ClipEditor track={track} info={studio.details[track.id]} studio={studio} location="sequencer" />}
    {sequence.enabled ? <>
      <div className="sequence-beat-groups" role="group" aria-label={track.name + ' pattern'}>
        {[0, 1, 2, 3].map((beat) => <div className="sequence-beat" key={beat} role="group" aria-label={track.name + ' beat ' + (beat + 1)}>
          <span className="sequence-beat-label">Beat {beat + 1}</span>
          <div className="sequence-steps">{sequence.steps.slice(beat * 4, beat * 4 + 4).map((on, position) => {
            const step = beat * 4 + position;
            return <button key={step} ref={(node) => { buttons.current[step] = node; }} type="button"
              disabled={studio.busy} aria-label={track.name + ' step ' + (step + 1)} aria-pressed={on}
              className={(position === 0 ? 'beat-start ' : '') + (studio.currentStep === step ? 'is-current' : '')}
              onKeyDown={(event) => move(event, step)} onClick={() => studio.toggleStep(track.id, step)}>{step + 1}</button>;
          })}</div>
        </div>)}
      </div>
      <div className="sequence-row-footer"><span>{count ? count + (count === 1 ? ' hit per loop' : ' hits per loop') : 'No hits selected. Tap a step or choose Four beats.'}</span>
        <div><button type="button" disabled={studio.busy} onClick={() => studio.quarterSteps(track.id)} aria-label={'Four beats for ' + track.name}>Four beats</button>
          <button type="button" disabled={studio.busy || count === 0} onClick={() => studio.clearSteps(track.id)} aria-label={'Clear ' + track.name + ' steps'}>Clear</button></div></div>
    </> : <p className="sequence-idle">Create rhythm starts a four-beat pattern. Edit sample to choose the sound for each hit.</p>}
  </article>;
}

export default function StepSequencer({ studio }) {
  const enabled = studio.tracks.filter((track) => sequenceMetadata(track).enabled);
  const active = studio.status === 'playing' || studio.status === 'loading';
  return <section className="sequencer panel" id="rhythm" aria-labelledby="sequencer-title">
    <div className="sequencer-heading"><div><p className="eyebrow">GIVE NATURE A RHYTHM</p><h2 id="sequencer-title">Make a rhythm.</h2>
      <p className="sequencer-intro">Choose a sound, shape a sample, then make it your own.</p></div>
      <a className="sequencer-save" href="#saved-mixes">{studio.activeProject ? (studio.dirty ? 'Save your changes' : 'View saved mix') : 'Save your mix'} <span aria-hidden="true">↗</span></a></div>
    <div className="sequencer-toolbar">
      <div className="sequencer-playback"><button type="button" className="play-button" disabled={studio.booting || (!active && studio.busy) || !studio.tracks.length} onClick={studio.togglePlayback}>
        <Icon name={active ? 'pause' : 'play'} size={18} />{studio.status === 'loading' ? 'Cancel loading' : active ? 'Pause rhythm & mix' : 'Play rhythm & mix'}</button>
        <button type="button" className="restart-button" disabled={studio.busy || !studio.tracks.length} aria-label="Restart rhythm and mix" onClick={studio.restartPlayback}><Icon name="reset" size={18} /></button></div>
      <div className="sequencer-meter"><span>4 beats · 16 steps · repeating loop</span><output aria-label="Sequencer position">{studio.currentStep === null ? 'Stopped' : 'Beat ' + (Math.floor(studio.currentStep / 4) + 1) + ' · step ' + (studio.currentStep + 1)}</output></div>
      <TempoInput key={(studio.activeProject?.id || 'workspace') + '-' + studio.bpm} studio={studio} />
    </div>
    <div className="sequencer-feedback" role="status">{studio.tempo.pending
      ? 'Playing at ' + studio.tempo.active + ' BPM. ' + studio.tempo.pending + ' BPM starts at the next loop.'
      : enabled.length ? 'Tap steps while listening. Lit steps play your sample.' : 'Start with Create rhythm on any sound. A short sample plays on all four beats.'}
      {enabled.length > 0 && <span>{(stepSeconds(studio.tempo.active) * STEP_COUNT).toFixed(2)} s per loop</span>}</div>
    <div className="sequence-rows">{studio.tracks.map((track) => <SequenceRow key={track.id} track={track} studio={studio} />)}</div>
    {!studio.tracks.length && <p className="sequencer-help">Add a sound from the library or import a recording to create your first rhythm.</p>}
    <p className="sequencer-help">Listen auditions one sample and pauses the mix. Edit sample opens here; applying a sample resets playback. Speed changes apply at the next loop while playing.</p>
    {studio.notice && <p className="mix-notice" role="status">{studio.notice}</p>}
  </section>;
}
