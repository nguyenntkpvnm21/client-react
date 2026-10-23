import { isSequenced, sequenceMetadata } from '../lib/sequencerState.js';
import { formatTime } from '../lib/studioState.js';
import Icon from './Icon';

export default function WorkspaceTransport({ studio }) {
  const active = studio.status === 'playing' || studio.status === 'loading';
  const hasSolo = studio.tracks.some((track) => track.solo);
  const silent = !studio.master || studio.tracks.every((track) => track.muted || !track.volume || (hasSolo && !track.solo)
    || (isSequenced(track) && !sequenceMetadata(track).steps.some(Boolean)));
  const status = studio.booting ? 'Opening workspace' : studio.status === 'loading' ? 'Loading audio'
    : studio.status === 'playing' ? (silent ? 'Playing silently · check levels' : 'Playing')
      : studio.status === 'paused' ? 'Paused' : studio.status === 'finished' ? 'Finished' : 'Ready to play';
  return <section className="workspace-transport" aria-label="Workspace playback">
    <div className="workspace-transport-inner">
      <div className="workspace-summary"><strong title={studio.activeProject?.name}>{studio.activeProject?.name || 'Current workspace'}</strong>
        <span>{studio.tracks.length} layers · {studio.arrangement.enabled ? 'Arrangement mode' : 'Free mix'}{studio.loopSection.enabled ? ' · Loop ' + studio.loopSection.start.toFixed(2) + '–' + studio.loopSection.end.toFixed(2) + ' s' : ''}{studio.activeProject && studio.dirty ? ' · Unsaved changes' : ''}</span></div>
      <div className="transport-left"><button type="button" className="play-button" disabled={studio.booting || (!active && studio.busy) || !studio.tracks.length} onClick={studio.togglePlayback}>
        <Icon name={active ? 'pause' : 'play'} size={19} />{studio.status === 'loading' ? 'Cancel loading' : active ? 'Pause mix' : 'Play mix'}</button>
        <button type="button" className="restart-button" aria-label="Restart mix" disabled={studio.busy || !studio.tracks.length} onClick={studio.restartPlayback}><Icon name="reset" size={19} /></button>
        <span className="elapsed" aria-label="Mix playback position">{formatTime(studio.elapsed)}</span></div>
      <label className="master-level"><Icon name="volume" size={19} /><span>Master</span><input type="range" min="0" max="100" value={studio.master} style={{ '--level': studio.master + '%' }}
        onChange={(event) => studio.setMaster(Number(event.target.value))} disabled={studio.projectBusy} aria-label="Master volume" /><output>{studio.master}%</output></label>
      <span className="workspace-playback-status" role="status"><span className={'status-dot ' + (studio.status === 'playing' ? 'is-playing' : '')} />{status}</span>
    </div>
    {studio.exportState?.active && <div className="workspace-export-progress"><span role="status">{studio.exportState.stage}</span><progress aria-label="Workspace export progress" max="1" value={studio.exportState.progress} /><button type="button" disabled={studio.exportState.canceling} onClick={studio.cancelExport}>{studio.exportState.canceling ? 'Canceling…' : 'Cancel export'}</button></div>}
    {studio.notice && <p className="workspace-notice" role="status">{studio.notice}</p>}
  </section>;
}
