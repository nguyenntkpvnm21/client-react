import { MAX_TRACKS } from '../data/sounds.js';
import { formatTime } from '../lib/studioState.js';
import Icon from './Icon';
import TrackControl from './TrackControl';

const BLENDS = [
  { id: 'balanced', name: 'Balanced', volumes: { music: 50, rain: 30, birds: 20 } },
  { id: 'rainfall', name: 'Rainfall', volumes: { music: 30, rain: 60, birds: 0 } },
  { id: 'birdsong', name: 'Birdsong', volumes: { music: 25, rain: 0, birds: 60 } },
];

export default function MixWorkspace({ studio }) {
  const active = studio.status === 'playing' || studio.status === 'loading';
  const silent = studio.tracks.length > 0 && studio.tracks.every((track) => track.muted || !track.volume || (studio.tracks.some((item) => item.solo) && !track.solo));
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
    <div className="transport">
      <div className="transport-left"><button type="button" className="play-button" disabled={studio.booting || (!active && (studio.importing || studio.projectBusy)) || !studio.tracks.length} onClick={studio.togglePlayback}>
        <Icon name={active ? 'pause' : 'play'} size={19} />{studio.status === 'loading' ? 'Cancel loading' : active ? 'Pause mix' : 'Play mix'}</button>
        <button type="button" className="restart-button" aria-label="Restart mix" title="Restart from the beginning" disabled={studio.busy || !studio.tracks.length}
          onClick={studio.restartPlayback}><Icon name="reset" size={19} /></button><span className="elapsed" aria-label="Mix playback position">{formatTime(studio.elapsed)}</span></div>
      <label className="master-level"><Icon name="volume" size={19} /><span>Master</span><input type="range" min="0" max="100" value={studio.master} style={{ '--level': studio.master + '%' }}
        onChange={(event) => studio.setMaster(Number(event.target.value))} disabled={studio.projectBusy} aria-label="Master volume" /><output>{studio.master}%</output></label>
    </div>
    <div className="transport-status" role="status"><span className={'status-dot ' + (studio.status === 'playing' ? 'is-playing' : '')} />
      <span>{studio.booting ? 'Opening your workspace...' : studio.status === 'loading' ? 'Loading audio. Larger recordings can take a moment.'
        : studio.status === 'playing' ? (silent || !studio.master ? 'Playing silently. Check mute, solo and volume.' : 'Your mix is playing.')
          : studio.status === 'paused' ? 'Paused. Your place is saved for this visit.' : 'Ready when you are. Press Play to hear your mix.'}</span><span className="transport-caption">M · Mute &nbsp; S · Solo</span>
    </div>
    {studio.notice && <p className="mix-notice" role="status">{studio.notice}</p>}
  </section>;
}
