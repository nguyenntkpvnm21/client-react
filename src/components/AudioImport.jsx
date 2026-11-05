import Icon from './Icon';
import './AudioImportDialog.css';

export default function AudioImport({ studio, onAddAudio }) {
  return <section className="import-panel panel" id="my-sounds" aria-labelledby="import-title">
    <div className="section-heading"><div><p className="eyebrow">MAKE IT PERSONAL</p><h2 id="import-title">Your sounds</h2></div><Icon name="upload" size={21} /></div>
    <p className="import-description">Add nature recordings, music or vocals.</p>
    <button className="import-dropzone" type="button" disabled={studio.busy} onClick={onAddAudio}>
      <span className="upload-tile"><Icon name="plus" size={24} /></span><strong>{studio.importing ? 'Reading your sounds...' : 'Import audio'}</strong>
      <span>Choose how your audio will play</span>
    </button>
    <p className="file-hint">MP3, WAV, OGG · up to 15:00 / 30 MB per file</p>
    <p className="storage-hint"><span className="small-dot" />Saved in this browser. No server upload.</p>
    {studio.storageNotice && <p className="storage-warning" role="status">{studio.storageNotice}</p>}
  </section>;
}
