import { useState } from 'react';
import { audibleGain } from '../lib/studioState.js';
import { isSequenced, sequenceMetadata } from '../lib/sequencerState.js';

export default function ArrangementExport({ studio }) {
  const [name, setName] = useState(studio.activeProject?.name || 'NatureMix arrangement');
  const result = studio.exportState;
  const silent = !studio.master || studio.tracks.every((track) => !audibleGain(track, studio.tracks) || (isSequenced(track) && !sequenceMetadata(track).steps.some(Boolean)));
  const solo = studio.tracks.some((track) => track.solo);
  return <section className="arrangement-export" aria-labelledby="export-title">
    <div><h3 id="export-title">Export your arrangement</h3><p>A stereo WAV of the full {studio.arrangement.duration}-second composition, from the beginning. Includes layer timing, fades, rhythm, Solo/Mute and Master volume.</p>
      <p>44.1 kHz · 16-bit PCM · about {(studio.arrangement.duration * 44100 * 4 / 1048576).toFixed(1)} MB. Playback pauses during export. The listening loop does not limit the file.</p></div>
    {studio.tracks.length > 0 && (silent ? <p className="export-routing">Your current levels and patterns produce a silent file. Check Master, Mute and Solo before exporting.</p> : solo ? <p className="export-routing">Solo is on. This export includes only soloed layers; muted solos stay silent.</p> : null)}
    <form onSubmit={(event) => { event.preventDefault();void studio.exportArrangement(name); }}>
      <label htmlFor="export-filename">File name<input id="export-filename" value={name} maxLength="100" disabled={studio.projectBusy} onChange={(event) => setName(event.target.value)} /></label>
      <button type="submit" className="timing-apply" disabled={studio.busy || !studio.tracks.length}>Export WAV</button>
    </form>
    {result?.active && <div className="export-progress"><progress aria-label="WAV export progress" max="1" value={result.progress} /><span role="status">{result.stage}</span><button type="button" disabled={result.canceling} onClick={studio.cancelExport}>{result.canceling ? 'Canceling…' : 'Cancel export'}</button></div>}
    {result?.error && <p className="arrangement-error" role="status">{result.error}</p>}
    {result?.url && <p className="export-ready" role="status">WAV ready: <a href={result.url} download={result.filename}>Download {result.filename}</a></p>}
  </section>;
}
