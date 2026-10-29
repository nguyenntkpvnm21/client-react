import { MAX_CLIPS, MAX_TRACKS } from '../data/sounds.js';
import { sourceId } from '../lib/audioSources.js';
import './SourcePool.css';

export default function SourcePool({ studio }) {
  return <section className="source-pool panel" aria-labelledby="source-pool-title">
    <div className="section-heading"><div><p className="eyebrow">IMPORT ONCE, USE IT AGAIN</p><h2 id="source-pool-title">Project sources</h2></div><span className="count-pill">{studio.sources.length}/{MAX_TRACKS}</span></div>
    <p>Each recording is stored once. Add clips to use different parts or overlap the same sound. Removing a clip keeps its source here.</p>
    <ul>{studio.sources.map((source) => {
      const count = studio.tracks.filter((track) => sourceId(track) === source.id).length;
      return <li key={source.id}><div><strong title={source.name}>{source.name}</strong><span>{count} {count === 1 ? 'clip' : 'clips'} · {source.role}</span></div>
        <div className="source-pool-actions"><button type="button" disabled={studio.busy || studio.tracks.length >= MAX_CLIPS} aria-label={'Add clip from ' + source.name} onClick={() => studio.addSourceClip(source.id)}>Add clip</button>
          {!count && <button type="button" disabled={studio.busy} aria-label={'Remove unused source ' + source.name} onClick={() => studio.removeSource(source.id)}>Remove source</button>}</div></li>;
    })}</ul>
    {!studio.sources.length && <p>Import a recording or add a library sound in Studio.</p>}
    <p className="source-pool-note">{studio.tracks.length}/{MAX_CLIPS} clips. In Arrangement, Add clip places a new clip at the playhead.</p>
  </section>;
}
