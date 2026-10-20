import { MAX_TRACKS } from '../data/sounds.js';
import Icon from './Icon';
import TrackControl from './TrackControl';

const BLENDS = [
  { id: 'balanced', name: 'Balanced', volumes: { music: 50, rain: 30, birds: 20 } },
  { id: 'rainfall', name: 'Rainfall', volumes: { music: 30, rain: 60, birds: 0 } },
  { id: 'birdsong', name: 'Birdsong', volumes: { music: 25, rain: 0, birds: 60 } },
];

export default function MixWorkspace({ studio }) {
  return <section className="workspace-panel panel" id="studio" aria-labelledby="mixer-title">
    <div className="mixer-heading"><div><p className="eyebrow">YOUR OWN LITTLE ECOSYSTEM</p><h2 id="mixer-title">Your mix<span className="count-pill">{studio.tracks.length}/{MAX_TRACKS}</span></h2></div>
      <button type="button" className="text-button" disabled={studio.busy} onClick={studio.resetLevels}><Icon name="reset" size={15} />Reset levels</button></div>
    <p className="workspace-project"><span>{studio.activeProject?.name || 'Current workspace'}</span><span>{studio.activeProject ? (studio.dirty ? 'Unsaved changes' : 'Saved mix') : 'Not saved as a named mix'}</span></p>
    <div className="blend-row"><span>Base blends</span><div role="group" aria-label="Included sound blends">{BLENDS.map((blend) => <button key={blend.id} type="button" disabled={studio.busy}
      aria-pressed={['music', 'rain', 'birds'].every((id) => studio.tracks.some((track) => track.id === id && track.volume === blend.volumes[id] && track.muted === (blend.volumes[id] === 0) && !track.solo))}
      onClick={() => studio.applyBlend(blend.volumes)}>{blend.name}</button>)}</div></div>
    <div className="track-list">{studio.tracks.map((track, index) => <TrackControl key={track.id} track={track} index={index} studio={studio} />)}
      {!studio.tracks.length && <div className="empty-mix"><Icon name="layers" size={32} /><h3>A blank canvas, made of sound.</h3><p>Add a library sound or import your own recording to start.</p></div>}
    </div>
    <div className="mixer-note"><Icon name="headphones" size={16} /><p>Nature sets the scene. Your music gives it a new story.</p></div>
  </section>;
}
