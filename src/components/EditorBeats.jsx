import { useId, useRef, useState } from 'react';
import { MAX_CLIPS, MAX_TRACKS } from '../data/sounds.js';
import { historyGesture } from '../lib/historyGesture.js';
import { barSeconds, patternGroups } from '../lib/patternSections.js';
import { rhythmMetadata } from '../lib/rhythmState.js';
import { sequenceMetadata } from '../lib/sequencerState.js';
import Icon from './Icon';
import './EditorBeats.css';

function DrumRow({ row, studio, currentStep }) {
  const steps = sequenceMetadata(row).steps;
  const buttons = useRef([]);
  const rhythm = rhythmMetadata(row);
  const previewing = studio.preview?.id === row.id;
  function navigate(event, index) {
    const target = event.key === 'ArrowRight' ? (index + 1) % 16
      : event.key === 'ArrowLeft' ? (index + 15) % 16
        : event.key === 'ArrowDown' ? (index + 4) % 16
          : event.key === 'ArrowUp' ? (index + 12) % 16
            : event.key === 'Home' ? 0 : event.key === 'End' ? 15 : null;
    if (target === null) return;
    event.preventDefault();
    buttons.current[target]?.focus();
  }
  return <div className={'editor-drum-row' + (row.muted ? ' is-muted' : '')}>
    <div className="editor-drum-name"><strong title={row.name}>{row.name}</strong><div>
      <button type="button" disabled={studio.busy} aria-label={(previewing ? 'Stop sample for ' : 'Hear sample for ') + row.name} title="Hear sample (pauses the song)" aria-pressed={previewing}
        onClick={() => previewing ? studio.stopPreview() : studio.previewClip(row.id, rhythm.sampleStart, rhythm.sampleEnd ?? rhythm.sampleStart + .18, false)}><Icon name={previewing ? 'pause' : 'play'} size={14} /></button>
      <button type="button" disabled={studio.busy} aria-label={'Mute ' + row.name + ' drum'} aria-pressed={row.muted} onClick={() => studio.updateTrack(row.id, { muted: !row.muted })}>M</button>
    </div></div>
    <div className="editor-beat-groups" role="group" aria-label={row.name + ' steps'}>{[0, 1, 2, 3].map(beat => <div className="editor-beat-group" key={beat} role="group" aria-label={row.name + ' beat ' + (beat + 1)}>
      <span className="editor-beat-number">{beat + 1}</span><div>{steps.slice(beat * 4, beat * 4 + 4).map((on, index) => {
        const step = beat * 4 + index;
        return <button type="button" key={step} ref={node => { buttons.current[step] = node; }} disabled={studio.busy}
          className={(step === currentStep ? 'is-now ' : '') + (index === 0 ? 'is-downbeat' : '')} aria-label={row.name + ' step ' + (step + 1)} aria-pressed={on}
          onKeyDown={event => navigate(event, step)} onClick={() => studio.toggleStep(row.id, step)}>{step + 1}</button>;
      })}</div>
    </div>)}</div>
  </div>;
}

function SectionSettings({ group, studio }) {
  const [error, setError] = useState('');
  const uid = useId();
  function apply(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim(), startBar = Number(data.get('start')) - 1, bars = Number(data.get('bars'));
    if (!name || name.length > 60 || !Number.isInteger(startBar) || startBar < 0 || !Number.isInteger(bars) || bars < 1) {
      setError('Enter a name and whole bars starting at 1.');return;
    }
    setError('');
    studio.updatePatternSection(group.id, { name, startBar, bars });
  }
  return <details className="editor-beats-settings"><summary>Section &amp; sound settings</summary>
    <form className="editor-beats-section-form" key={group.name + '-' + group.startBar + '-' + group.bars} onSubmit={apply}>
      <label htmlFor={uid + '-name'}>Section name<input id={uid + '-name'} name="name" maxLength="60" defaultValue={group.name} disabled={studio.busy} required /></label>
      <label htmlFor={uid + '-start'}>Start at bar<input id={uid + '-start'} name="start" type="number" min="1" step="1" defaultValue={group.startBar + 1} disabled={studio.busy} required /></label>
      <label htmlFor={uid + '-bars'}>Repeat for bars<input id={uid + '-bars'} name="bars" type="number" min="1" step="1" defaultValue={group.bars} disabled={studio.busy} required /></label>
      <button type="submit" disabled={studio.busy}>Apply</button>
    </form>
    {error && <p className="editor-beats-error" role="alert">{error}</p>}
    <div className="editor-drum-settings">{group.rows.map(row => <div key={row.id}>
      <strong title={row.name}>{row.name}</strong>
      <label>Volume<input {...historyGesture(studio, 'level:' + row.id)} type="range" min="0" max="100" value={row.volume} disabled={studio.busy} aria-label={row.name + ' drum volume'} onChange={event => studio.updateTrack(row.id, { volume: Number(event.target.value) })} /></label>
      <label>Tails<select aria-label={row.name + ' sample tails'} value={rhythmMetadata(row).tailMode} disabled={studio.busy} onChange={event => studio.setTailMode(row.id, event.target.value)}><option value="cut">Cut at next hit</option><option value="ring">Let ring</option></select></label>
      <button type="button" disabled={studio.busy} aria-label={'Edit ' + row.name + ' sample'} onClick={() => studio.openClip(row.id, 'sequencer')}>Edit sample</button>
      <button type="button" disabled={studio.busy} aria-label={'Clear ' + row.name + ' steps'} onClick={() => studio.clearSteps(row.id)}>Clear</button>
      <button type="button" disabled={studio.busy} aria-label={'Four beats for ' + row.name} onClick={() => studio.quarterSteps(row.id)}>Four beats</button>
    </div>)}</div>
  </details>;
}

export default function EditorBeats({ studio, selectedId, onSelect, onClose }) {
  const groups = patternGroups(studio.tracks, studio.bpm);
  const legacyRows = studio.tracks.filter(row => !row.patternBlock && rhythmMetadata(row).initialized);
  const group = groups.find(item => item.id === selectedId || item.rows.some(row => row.id === selectedId)) || groups[0];
  const canAdd = studio.sources.length < MAX_TRACKS && studio.tracks.length + 3 <= MAX_CLIPS;
  const currentStep = group && studio.status === 'playing' && studio.elapsed >= group.placement.start && studio.elapsed < group.placement.end ? studio.currentStep : null;
  function select(id) { studio.selectClip(id);onSelect?.(id); }
  async function addDrums() {
    const id = await studio.addEditorDrums();
    if (typeof id === 'string') select(id);
  }
  return <section className="editor-beats" aria-label="Drum machine">
    <header className="editor-beats-heading"><div><Icon name="rhythm" size={18} /><h2>Drum machine</h2></div><div>
      {groups.length > 0 && <button type="button" disabled={studio.busy || !canAdd} onClick={addDrums}>Add drums</button>}
      {onClose && <button type="button" className="editor-beats-close" aria-label="Close drum machine" onClick={onClose}>×</button>}
    </div></header>
    <div className="editor-beats-content">
      {group ? <>
        <div className="editor-beats-toolbar"><label className="editor-beats-section-select">Section<select aria-label="Drum section" value={group.id} onChange={event => select(event.target.value)} disabled={studio.busy}>{groups.map(item => <option value={item.id} key={item.id}>{item.name} · bar {item.startBar + 1}</option>)}</select></label>
          <span>1 bar · repeats {group.bars} {group.bars === 1 ? 'time' : 'times'}</span>
          <button type="button" disabled={studio.busy} onClick={() => studio.seekPlayback(group.placement.start)}>Go to section</button>
        </div>
        <div className="editor-beats-grid">{group.rows.map(row => <DrumRow key={row.id} row={row} studio={studio} currentStep={currentStep} />)}</div>
        <p className="editor-beats-hint">Lit steps play. Edit while the song plays. Changes apply to this section.</p>
        <SectionSettings key={group.id} group={group} studio={studio} />
      </> : <div className="editor-beats-empty"><Icon name="rhythm" size={26} /><div><h3>Make your first beat</h3><p>Add kick, snare and hi-hat to the timeline, then tap steps to change the rhythm.</p></div><button type="button" disabled={studio.busy || !canAdd} onClick={addDrums}>Add drum track</button></div>}
      {!canAdd && <p className="editor-beats-hint" role="status">Remove an unused audio file or a few clips to make room for another drum track.</p>}
      {!!studio.patterns?.length && <details className="editor-legacy-beats"><summary>Saved beat patterns ({studio.patterns.length})</summary><p>Add a copy at the playhead. Placed sections can be edited independently.</p><ul>{studio.patterns.map(pattern => <li key={pattern.id}><span>{pattern.slot} · {pattern.name}</span><button type="button" disabled={studio.busy} aria-label={'Hear saved pattern ' + pattern.name} aria-pressed={studio.patternPreview?.id === pattern.id} onClick={() => studio.hearPattern(pattern.id)}>{studio.patternPreview?.id === pattern.id ? 'Stop preview' : 'Hear'}</button><button type="button" disabled={studio.busy} aria-label={'Add saved pattern ' + pattern.name + ' at playhead'} onClick={() => studio.addPatternToArrangement(pattern.id, Math.floor(studio.elapsed / barSeconds(studio.bpm)), 4)}>Add at playhead</button></li>)}</ul></details>}
      {!!legacyRows.length && <details className="editor-legacy-beats"><summary>Existing rhythm clips ({legacyRows.length})</summary><p>These clips keep their own timeline position. Turning rhythm off restores normal audio and keeps the steps.</p><div className="editor-legacy-rows">{legacyRows.map(row => <div key={row.id}>
        <DrumRow row={row} studio={studio} currentStep={sequenceMetadata(row).enabled && studio.status === 'playing' ? studio.currentStep : null} />
        <div className="editor-legacy-row-actions"><button type="button" disabled={studio.busy} aria-pressed={sequenceMetadata(row).enabled} aria-label={'Rhythm for ' + row.name} onClick={() => studio.setSequenced(row.id, !sequenceMetadata(row).enabled)}>{sequenceMetadata(row).enabled ? 'Rhythm on' : 'Rhythm off'}</button><button type="button" disabled={studio.busy} aria-label={'Edit ' + row.name + ' sample'} onClick={() => studio.openClip(row.id, 'sequencer')}>Edit sample</button><button type="button" disabled={studio.busy} aria-label={'Clear ' + row.name + ' steps'} onClick={() => studio.clearSteps(row.id)}>Clear steps</button></div>
      </div>)}</div></details>}
    </div>
  </section>;
}
