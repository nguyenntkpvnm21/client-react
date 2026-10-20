import { isSequenced } from '../lib/sequencerState.js';
import ClipEditor from './ClipEditor';
import { ROLES, SOUNDS } from '../data/sounds.js';
import { formatTime } from '../lib/studioState.js';
import Icon from './Icon';

export default function TrackControl({ track, index, studio }) {
  const sound = SOUNDS.find((item) => item.id === track.catalogId);
  const info = studio.details[track.id];
  const soloActive = studio.tracks.some((item) => item.solo);
  const quiet = track.muted || (soloActive && !track.solo);
  return <article className={'track-card ' + track.role + (quiet ? ' is-quiet' : '')} aria-label={track.name + ' layer'}>
    <div className="track-heading">
      <span className="track-index">{String(index + 1).padStart(2, '0')}</span>
      <span className="track-icon"><Icon name={sound?.icon || (track.role === 'nature' ? 'leaf' : track.role)} size={22} /></span>
      <div className="track-name"><h3 title={track.name}>{track.name}</h3><span>{track.catalogId ? 'Included recording' : 'Your recording'}{info ? ' · ' + formatTime(info.duration) : ''}</span></div>
      <div className="track-buttons">
        <button type="button" disabled={studio.projectBusy} aria-label={'Mute ' + track.name} title="Mute" aria-pressed={track.muted} onClick={() => studio.updateTrack(track.id, { muted: !track.muted })}>M</button>
        <button type="button" disabled={studio.projectBusy} aria-label={'Solo ' + track.name} title="Solo" aria-pressed={track.solo} onClick={() => studio.updateTrack(track.id, { solo: !track.solo })}>S</button>
        <button type="button" disabled={studio.projectBusy || isSequenced(track)} aria-label={'Loop ' + track.name} title={isSequenced(track) ? 'Sequencer plays one-shot samples' : 'Loop'} aria-pressed={track.loop} onClick={() => studio.updateTrack(track.id, { loop: !track.loop })}><Icon name="loop" size={17} /></button>
        <button className="remove-layer" type="button" aria-label={'Remove ' + track.name} title="Remove layer" disabled={studio.busy} onClick={() => studio.removeTrack(track.id)}><Icon name="trash" size={16} /></button>
      </div>
    </div>
    <div className="track-bottom">
      <div className="waveform" aria-hidden="true">
        {info ? <svg viewBox="0 0 240 42" preserveAspectRatio="none">{info.peaks.map((peak, bar) => <rect key={bar} x={bar * 5} y={21 - Math.max(2, peak * 19)} width="3" height={Math.max(4, peak * 38)} rx="1.5" />)}</svg>
          : <span className="waveform-pending">Waveform loads with audio</span>}
      </div>
      <label className="track-level"><span className="sr-only">{track.name + ' volume'}</span><input type="range" min="0" max="100" value={track.volume}
        style={{ '--level': track.volume + '%' }} disabled={studio.projectBusy} onChange={(event) => studio.updateTrack(track.id, { volume: Number(event.target.value) })} /><output>{track.volume}%</output></label>
    </div>
    <div className="clip-summary"><button type="button" className="text-button" disabled={studio.busy} aria-expanded={studio.editorId === track.id && studio.editorLocation === 'mixer'}
      onClick={() => studio.editorId === track.id && studio.editorLocation === 'mixer' ? studio.closeClip() : studio.openClip(track.id)}>Edit clip</button>
      <span>{track.clipEnd != null ? track.clipStart.toFixed(2) + '–' + track.clipEnd.toFixed(2) + ' s · ' + (isSequenced(track) ? 'Sequenced sample' : track.loop ? 'Loop region' : 'Play once') : 'Full recording'}</span></div>
    {studio.editorId === track.id && studio.editorLocation === 'mixer' && <ClipEditor key={track.id} track={track} info={info} studio={studio} />}
    {!track.catalogId && <label className="track-role"><span>Use as</span><select aria-label={track.name + ' role'} disabled={studio.projectBusy} value={track.role}
      onChange={(event) => studio.updateTrack(track.id, { role: event.target.value })}>{ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>}
  </article>;
}
