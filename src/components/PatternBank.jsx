import { useState } from 'react';
import { sequenceMetadata } from '../lib/sequencerState.js';
import { barSeconds } from '../lib/patternSections.js';

function PatternActions({ studio, pattern }) {
  const [start, setStart] = useState(String(Math.max(Math.floor(studio.elapsed / barSeconds(studio.bpm)), ...studio.tracks.filter(track => track.patternBlock).map(track => track.patternBlock.startBar + track.patternBlock.bars)) + 1));
  const [bars, setBars] = useState('4');
  const [name, setName] = useState(pattern.name);
  const [error, setError] = useState('');
  const preview = studio.patternPreview?.id === pattern.id;
  async function add(event) {
    event.preventDefault();
    if (!Number.isInteger(Number(start)) || Number(start) < 1 || !Number.isInteger(Number(bars)) || Number(bars) < 1) { setError('Choose whole bars, starting at 1.');return; }
    setError('');await studio.addPatternToArrangement(pattern.id, Number(start) - 1, Number(bars));
  }
  return <div className="pattern-bank-editor">
    <div className="pattern-bank-heading"><div><strong>{pattern.slot} · {pattern.name}</strong><p>Nature samples and drums share one beat. Edit the rows below.</p></div>
      <button type="button" className="create-rhythm" disabled={studio.busy} aria-pressed={preview} onClick={() => studio.hearPattern(pattern.id)}>{preview ? (studio.patternPreview.status === 'loading' ? 'Cancel pattern preview' : 'Stop pattern preview') : 'Hear pattern'}</button>
      {(studio.patterns?.length || 0) < 2 && <button type="button" disabled={studio.busy} onClick={() => studio.copyPattern(pattern.id)}>Make variation {pattern.slot === 'A' ? 'B' : 'A'}</button>}</div>
    <form className="pattern-placement" onSubmit={add}><label>Start at bar<input aria-label="Pattern start bar" type="number" min="1" step="1" value={start} disabled={studio.busy} onChange={event => setStart(event.target.value)} /></label>
      <label>Repeat for bars<input aria-label="Pattern repeat bars" type="number" min="1" step="1" value={bars} disabled={studio.busy} onChange={event => setBars(event.target.value)} /></label>
      <button type="submit" disabled={studio.busy}>Add to Arrangement</button><a href="#/arrangement">View timeline ↗</a></form>
    {error && <p role="alert">{error}</p>}
    <details className="pattern-bank-more"><summary>Pattern details</summary><p>Each addition keeps its own steps and samples. Editing A/B changes future additions. The first addition moves the matching current rhythm rows into the section; later additions make copies.</p>
      <form onSubmit={event => { event.preventDefault();studio.renamePattern(pattern.id, name); }}><label>Pattern name<input maxLength="48" value={name} disabled={studio.busy} onChange={event => setName(event.target.value)} /></label><button type="submit" disabled={studio.busy}>Rename pattern</button></form>
      <button type="button" disabled={studio.busy} onClick={() => studio.removePattern(pattern.id)}>Remove saved pattern {pattern.slot}</button></details>
  </div>;
}

export default function PatternBank({ studio }) {
  const selected = studio.patterns?.find(pattern => pattern.id === studio.activePatternId);
  const canKeep = studio.tracks.some(track => !track.patternBlock && sequenceMetadata(track).enabled);
  return <section className="pattern-bank" aria-label="Patterns for your mix">
    <div className="pattern-tabs" role="group" aria-label="Choose rhythm to edit"><button type="button" aria-pressed={!selected} disabled={studio.busy} onClick={() => studio.selectPattern(null)}>Current rhythm</button>
      {(studio.patterns || []).map(pattern => <button key={pattern.id} type="button" disabled={studio.busy} aria-pressed={pattern.id === selected?.id} onClick={() => studio.selectPattern(pattern.id)}>{pattern.slot} · {pattern.name}</button>)}</div>
    {selected ? <PatternActions key={selected.id + selected.name} studio={studio} pattern={selected} /> : !(studio.patterns?.length) ? <div className="pattern-bank-heading"><p>Build a beat from drums or nature samples, then keep it for your song.</p><button type="button" disabled={studio.busy || !canKeep} onClick={studio.keepPattern}>Keep beat as pattern A</button></div> : <p className="pattern-bank-hint">Choose A or B to edit a saved beat and add it to your song.</p>}
  </section>;
}
