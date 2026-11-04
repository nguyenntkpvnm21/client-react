import { useState } from 'react';
import { barSeconds } from '../lib/patternSections.js';
import { historyGesture } from '../lib/historyGesture.js';
import TimelineClip from './TimelineClip';

export default function PatternSectionRow({ block, studio, cursor = null, compact = false, view }) {
  const [error, setError] = useState('');
  const role = block.rows.some(row => row.role === 'nature') ? 'nature' : 'music';
  const track = { ...block.rows[0], id: block.id, name: block.name, sequence: { enabled: true, steps: Array.from({ length: 16 }, (_, i) => block.rows.some(row => row.sequence.steps[i])) } };
  function change(changes) { setError('');studio.updatePatternSection(block.id, changes); }
  const selected = studio.selectedClipId === block.id;
  return <article data-pattern-section={block.id} className={'arrangement-row pattern-section ' + role + (selected ? ' is-selected' : '')} aria-label={block.name + ' rhythm section'} onPointerDown={() => studio.selectClip(block.id)} onFocusCapture={() => studio.selectClip(block.id)}>
    <div className="arrangement-row-heading"><div><h3>{block.name}</h3><span>{block.rows.length} sounds · bar {block.startBar + 1} · {block.bars} {block.bars === 1 ? 'bar' : 'bars'}</span></div>
      <div className="arrangement-row-controls"><button type="button" disabled={studio.busy} onClick={() => studio.seekArrangement(block.placement.start)}>Play from here</button>
        <button type="button" aria-pressed={block.rows.every(row => row.solo)} disabled={studio.busy} onClick={() => studio.soloPatternSection(block.id)}>Solo</button>
        <button type="button" disabled={studio.busy} aria-pressed={block.muted} onClick={() => change({ muted: !block.muted })}>{block.muted ? 'Unmute' : 'Mute'}</button>
        {compact && <a href="#/arrangement">Edit in timeline ↗</a>}</div></div>
    {!compact && <TimelineClip track={track} studio={{ ...studio, setPlacement: studio.placePatternSection }} window={block.placement} cursor={cursor} view={view} snapSize={barSeconds(studio.bpm)} section />}
    <div className="pattern-section-tools">
      <label>Level<input {...historyGesture(studio, 'level:' + block.id)} type="range" min="0" max="100" value={block.volume} disabled={studio.busy} aria-label={block.name + ' section level'} onChange={event => change({ volume: Number(event.target.value) })} /><output>{block.volume}%</output></label>
      <details><summary>Section options</summary><form key={block.startBar + '-' + block.bars} onSubmit={event => { event.preventDefault();const data = new FormData(event.currentTarget);const startBar = Number(data.get('start')) - 1, bars = Number(data.get('bars'));if (!Number.isInteger(startBar) || startBar < 0 || !Number.isInteger(bars) || bars < 1) { setError('Choose whole bars starting at 1.');return; }change({ startBar, bars }); }}>
        <label>Start at bar<input name="start" type="number" min="1" step="1" defaultValue={block.startBar + 1} disabled={studio.busy} /></label><label>Repeat for bars<input name="bars" type="number" min="1" step="1" defaultValue={block.bars} disabled={studio.busy} /></label><button disabled={studio.busy}>Apply section</button></form>
        <button type="button" disabled={studio.busy} onClick={() => studio.updatePatternSection(block.id, null, 'copy')}>Duplicate section</button><button type="button" disabled={studio.busy} onClick={() => studio.updatePatternSection(block.id, null, 'remove')}>Remove section</button>
        <p>Drag or resize in whole bars. Steps and samples were copied when added from Rhythm.</p></details>
    </div>{error && <p role="alert">{error}</p>}
  </article>;
}
