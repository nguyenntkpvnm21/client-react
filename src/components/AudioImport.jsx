import { ROLES } from '../data/sounds.js';
import Icon from './Icon';

export default function AudioImport({ studio, role, setRole, inputRef, chooseFiles }) {
  return <section className="import-panel panel" id="my-sounds" aria-labelledby="import-title">
    <div className="section-heading"><div><p className="eyebrow">MAKE IT PERSONAL</p><h2 id="import-title">Your sounds</h2></div><Icon name="upload" size={21} /></div>
    <p className="import-description">A field recording. A favorite instrumental. Your own voice. Every layer has a place.</p>
    <label className="import-role" htmlFor="import-role">Add files as
      <select id="import-role" value={role} onChange={(event) => setRole(event.target.value)} disabled={studio.busy}>
        {ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
    <input ref={inputRef} id="audio-files" className="sr-only" type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac" multiple tabIndex="-1"
      aria-label="Choose audio files" onChange={chooseFiles} disabled={studio.busy} />
    <button className="import-dropzone" type="button" disabled={studio.busy} onClick={() => inputRef.current?.click()}>
      <span className="upload-tile"><Icon name="plus" size={24} /></span><strong>{studio.importing ? 'Reading your sounds...' : 'Import audio'}</strong>
      <span>Choose one or more files</span>
    </button>
    <p className="file-hint">MP3, WAV, OGG and more · Up to 30 MB and 15 minutes per file</p>
    <p className="storage-hint"><span className="small-dot" />Saved in this browser. No server upload.</p>
    {studio.storageNotice && <p className="storage-warning" role="status">{studio.storageNotice}</p>}
  </section>;
}
