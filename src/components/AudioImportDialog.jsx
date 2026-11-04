import { useRef, useState } from 'react';
import { ROLES } from '../data/sounds.js';
import './AudioImportDialog.css';

const descriptions = { nature: 'Rain, birds and field recordings', music: 'A song, beat or instrumental', vocal: 'Singing, speech or narration' };

export default function AudioImportDialog({ studio, dialogRef }) {
  const [role, setRole] = useState('');
  const [repeat, setRepeat] = useState(false);
  const input = useRef(null);
  function choose(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || !role || studio.busy) return;
    dialogRef.current.close();
    void studio.importFiles(files, role, repeat);
  }
  return <dialog ref={dialogRef} className="audio-import-dialog" aria-labelledby="audio-import-title" onClick={event => {
    if (event.target !== event.currentTarget || studio.importing) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialogRef.current.close();
  }}>
    <div className="import-dialog-heading"><h2 id="audio-import-title">Add your audio</h2><button type="button" onClick={() => dialogRef.current.close()} aria-label="Close audio import">Close</button></div>
    <fieldset disabled={studio.busy}><legend>What are you adding?</legend>
      <div className="import-role-options">{ROLES.map(item => <label key={item.id} className={role === item.id ? 'is-selected' : ''}>
        <input type="radio" name="audio-import-role" value={item.id} checked={role === item.id} onChange={() => { setRole(item.id);setRepeat(item.id === 'nature'); }} />
        <span><strong>{item.label}</strong><small>{descriptions[item.id]}</small></span>
      </label>)}</div>
      {role && <label className="import-repeat"><input type="checkbox" checked={repeat} onChange={event => setRepeat(event.target.checked)} />Repeat added clips <span>{repeat ? 'Play again when each clip ends' : 'Play each clip once'}</span></label>}
    </fieldset>
    <input ref={input} className="sr-only" type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac" multiple tabIndex={-1} aria-label="Choose audio files" onChange={choose} disabled={studio.busy || !role} />
    <div className="import-dialog-actions"><button type="button" className="primary-button" disabled={studio.busy || !role} onClick={() => input.current?.click()}>Choose files</button><span>Up to 15:00 / 30 MB per file · stays on this device</span></div>
  </dialog>;
}
