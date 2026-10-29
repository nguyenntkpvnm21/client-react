import { useEffect, useRef } from 'react';
import { isSequenced, sequenceMetadata } from '../lib/sequencerState.js';
import Icon from './Icon';
import PlaybackSeek from './PlaybackSeek';
import { clockTime } from '../lib/timeFormat.js';

export default function WorkspaceTransport({ studio }) {
  const playerRef = useRef(null);
  useEffect(() => {
    const player = playerRef.current;
    const measure = () => document.documentElement.style.setProperty('--player-height', Math.ceil(player.getBoundingClientRect().height) + 'px');
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(player);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect();window.removeEventListener('resize', measure);document.documentElement.style.removeProperty('--player-height'); };
  }, []);
  const active = studio.status === 'playing' || studio.status === 'loading';
  const hasSolo = studio.tracks.some((track) => track.solo);
  const silent = !studio.master || studio.tracks.every((track) => track.muted || !track.volume || (hasSolo && !track.solo)
    || (isSequenced(track) && !sequenceMetadata(track).steps.some(Boolean)));
  const status = studio.booting ? 'Opening workspace' : studio.status === 'loading' ? 'Loading audio'
    : studio.status === 'playing' ? (silent ? 'Playing silently · check levels' : 'Playing')
      : studio.status === 'paused' ? 'Paused' : studio.status === 'finished' ? 'Finished' : 'Ready to play';
  return <section className="workspace-transport" id="workspace-playback" ref={playerRef} aria-label="Workspace playback">
    <div className="workspace-transport-inner">
      <div className="workspace-summary"><span className="player-art"><Icon name="music" size={23} /></span><div><strong title={studio.activeProject?.name}>{studio.activeProject?.name || 'Current workspace'}</strong>
        <span>{studio.tracks.length} clips · {studio.sources.length} sources · {studio.arrangement.enabled ? 'Arrangement mode' : 'Free mix'}{studio.loopSection.enabled ? ' · Loop ' + clockTime(studio.loopSection.start, 2) + '–' + clockTime(studio.loopSection.end, 2) : ''}{studio.activeProject && studio.dirty ? ' · Unsaved changes' : ''}</span></div></div>
      <div className="transport-left"><button type="button" className={'play-button transport-play' + (active ? ' is-active' : '')} disabled={studio.booting || (!active && studio.busy) || !studio.tracks.length} onClick={studio.togglePlayback}>
        <Icon name={active ? 'pause' : 'play'} size={20} /><span className="sr-only">{studio.status === 'loading' ? 'Cancel loading' : active ? 'Pause mix' : 'Play mix'}</span></button>
        <button type="button" className="restart-button" aria-label="Restart mix" title="Restart mix" disabled={studio.busy || !studio.tracks.length} onClick={studio.restartPlayback}><Icon name="reset" size={19} /></button>
        <button type="button" className="seek-skip" aria-label="Back 5 seconds" title="Back 5 seconds" disabled={studio.booting || studio.projectBusy || studio.importing || !studio.tracks.length} onClick={() => studio.seekPlayback(Math.max(0, studio.elapsed - 5))}>−5s</button>
        <button type="button" className="seek-skip" aria-label="Forward 5 seconds" title="Forward 5 seconds" disabled={studio.booting || studio.projectBusy || studio.importing || !studio.tracks.length} onClick={() => studio.seekPlayback(studio.elapsed + 5)}>+5s</button></div>
      <label className="master-level"><Icon name="volume" size={19} /><span>Master</span><input type="range" min="0" max="100" value={studio.master} style={{ '--level': studio.master + '%' }}
        onChange={(event) => studio.setMaster(Number(event.target.value))} disabled={studio.projectBusy} aria-label="Master volume" /><output>{studio.master}%</output></label>
      <span className="workspace-playback-status" role="status"><span className={'status-dot ' + (studio.status === 'playing' ? 'is-playing' : '')} />{status}</span>
      <PlaybackSeek studio={studio} />
    </div>
    {studio.scenePreview && <div className="workspace-scene-preview"><span role="status">{studio.scenePreview.status === 'loading' ? 'Loading scene preview' : 'Playing scene preview'} · workspace paused</span><button type="button" onClick={studio.stopScene}>Stop scene preview</button></div>}
    {studio.exportState?.active && <div className="workspace-export-progress"><span role="status">{studio.exportState.stage}</span><progress aria-label="Workspace export progress" max="1" value={studio.exportState.progress} /><button type="button" disabled={studio.exportState.canceling} onClick={studio.cancelExport}>{studio.exportState.canceling ? 'Canceling…' : 'Cancel export'}</button></div>}
    {studio.notice && <p className="workspace-notice" role="status">{studio.notice}</p>}
  </section>;
}
