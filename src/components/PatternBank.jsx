import { useState } from 'react';
import { sequenceMetadata } from '../lib/sequencerState.js';
import { barSeconds } from '../lib/patternSections.js';

function PatternPlacement({ studio, pattern }) {
  const [start, setStart] = useState(String(Math.max(Math.floor(studio.elapsed / barSeconds(studio.bpm)), ...studio.tracks.filter(track => track.patternBlock).map(track => track.patternBlock.startBar + track.patternBlock.bars)) + 1));
  const [bars, setBars] = useState('4');
  const [name, setName] = useState(pattern.name);
  const [error, setError] = useState('');
  async function add(event) {
    event.preventDefault();
    if (!Number.isInteger(Number(start)) || Number(start) < 1 || !Number.isInteger(Number(bars)) || Number(bars) < 1) { setError('Choose whole bars, starting at 1.');return; }
    setError('');await studio.addPatternToArrangement(pattern.id, Number(start) - 1, Number(bars));
  }
  return <section className="pattern-placement-panel" id="rhythm-pattern-placement" tabIndex={-1} aria-label={'Place pattern ' + pattern.slot + ' in your mix'}>
    <h3>Add {pattern.slot} to your song</h3>
    <p>Each section keeps an independent copy of these steps and samples.</p>
    {(studio.patterns?.length || 0) < 2 && <button type="button" className="make-variation" disabled={studio.busy} onClick={() => studio.copyPattern(pattern.id)}>Make variation {pattern.slot === 'A' ? 'B' : 'A'}</button>}
    <form className="pattern-placement" onSubmit={add}><label>Start at bar<input aria-label="Pattern start bar" type="number" min="1" step="1" value={start} disabled={studio.busy} onChange={event => setStart(event.target.value)} /></label>
      <label>Repeat for bars<input aria-label="Pattern repeat bars" type="number" min="1" step="1" value={bars} disabled={studio.busy} onChange={event => setBars(event.target.value)} /></label>
      <button type="submit" disabled={studio.busy}>Add to Arrangement</button><a href="#/arrangement">View timeline ↗</a></form>
    {error && <p role="alert">{error}</p>}
    <details className="pattern-bank-more"><summary>Pattern options</summary>
      <p>The first addition moves matching current rhythm rows into a section. Later additions make copies. Editing this pattern changes future additions only.</p>
      <form onSubmit={event => { event.preventDefault();studio.renamePattern(pattern.id, name); }}><label>Pattern name<input maxLength="48" value={name} disabled={studio.busy} onChange={event => setName(event.target.value)} /></label><button type="submit" disabled={studio.busy}>Rename pattern</button></form>
      <button type="button" disabled={studio.busy} onClick={() => studio.removePattern(pattern.id)}>Remove saved pattern {pattern.slot}</button></details>
  </section>;
}

export default function PatternBank({ studio, placementOnly = false }) {
  const selected = studio.patterns?.find(pattern => pattern.id === studio.activePatternId);
  const canKeep = studio.tracks.some(track => !track.patternBlock && sequenceMetadata(track).enabled);
  const preview = selected && studio.patternPreview?.id === selected.id;
  if (placementOnly) return selected ? <PatternPlacement key={selected.id + selected.name} studio={studio} pattern={selected} /> : null;
  function showPlacement() {
    const panel = document.getElementById('rhythm-pattern-placement');
    panel?.scrollIntoView({ block: 'center' });panel?.focus({ preventScroll: true });
  }
  return <section className="pattern-bank" aria-label="Patterns for your mix">
    <div className="pattern-tabs" role="group" aria-label="Choose rhythm to edit"><button type="button" aria-pressed={!selected} disabled={studio.busy} onClick={() => studio.selectPattern(null)}>Current rhythm</button>
      {(studio.patterns || []).map(pattern => <button key={pattern.id} type="button" disabled={studio.busy} aria-pressed={pattern.id === selected?.id} onClick={() => studio.selectPattern(pattern.id)}>{pattern.slot} · {pattern.name}</button>)}</div>
    {selected ? <>
      <div className="pattern-bank-heading"><strong>Editing {selected.slot} · {selected.name}</strong><div className="pattern-bank-actions">
        <button type="button" className="create-rhythm" disabled={studio.busy} aria-pressed={!!preview} onClick={() => studio.hearPattern(selected.id)}>{preview ? (studio.patternPreview.status === 'loading' ? 'Cancel preview' : 'Stop preview') : 'Hear pattern'}</button>
        <button type="button" disabled={studio.busy} onClick={showPlacement}>Place in song</button>
      </div></div>
      <p className="pattern-copy-notice">Edits affect new sections. Sections already placed keep their own copy.</p>
    </> : !(studio.patterns?.length) ? <div className="pattern-bank-heading"><p>Keep this beat to use it in your song.</p><button type="button" disabled={studio.busy || !canKeep} onClick={studio.keepPattern}>Keep beat as pattern A</button></div> : <p className="pattern-bank-hint">Editing current clips. Choose A or B to edit a pattern for your song.</p>}
  </section>;
}
