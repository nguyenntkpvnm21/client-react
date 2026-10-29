import { useRef, useState } from 'react';
import { MAX_MIX_NAME, MAX_SAVED_MIXES } from '../lib/savedMixes.js';
import './ProjectTransfer.css';

export default function ProjectTransfer({ studio }) {
  const input = useRef(null);
  const [name, setName] = useState(null);
  const state = studio.transfer;
  const disabled = studio.busy;
  async function choose(event) {
    const file = event.target.files?.[0];event.target.value = '';
    setName(null);
    if (file) await studio.inspectProjectFile(file);
  }
  return <section className="project-transfer" aria-labelledby="project-transfer-title">
    <div><p className="eyebrow">TAKE YOUR WORK WITH YOU</p><h3 id="project-transfer-title">Project backup</h3></div>
    <p>Keep an editable copy of this workspace, including unsaved changes and every audio layer. Open it in NatureMix on another browser or device.</p>
    <p>Apply any open clip or timing edits first. A WAV is a finished audio file; a project keeps your layers editable.</p>
    <div className="project-transfer-actions">
      <button type="button" disabled={disabled} onClick={studio.downloadProject}>Download project</button>
      <button type="button" disabled={disabled || studio.projectsBlocked} onClick={() => input.current?.click()}>Restore project file</button>
      <input ref={input} className="sr-only" tabIndex={-1} type="file" accept=".naturemix" aria-label="Choose NatureMix project file" onChange={choose} disabled={disabled || studio.projectsBlocked} />
    </div>
    {state?.active && <div className="project-transfer-progress" role="status"><span>{state.stage}</span><progress max="1" value={state.progress} aria-label="Project transfer progress" />
      {!state.committing && <button type="button" disabled={state.canceling} onClick={studio.cancelTransfer}>{state.canceling ? 'Canceling…' : 'Cancel transfer'}</button>}</div>}
    {state?.error && <p className="project-transfer-error" role="alert">{state.error}</p>}
    {state && !state.active && !state.error && <p role="status">{state.stage}</p>}
    {state?.url && !state.active && <a href={state.url} download={state.filename}>Download {state.filename} again</a>}
    {studio.restoreInfo && <form className="project-restore-review" onSubmit={(event) => { event.preventDefault();void studio.restoreProject(name ?? studio.restoreInfo.name); }}>
      <h4>Restore as a new saved mix</h4>
      <p>{studio.restoreInfo.tracks} audio layers · {(studio.restoreInfo.bytes / 1024 / 1024).toFixed(1)} MiB. Your current workspace stays open. Existing saved mixes are kept.</p>
      <label htmlFor="restored-mix-name">Restored mix name</label>
      <input id="restored-mix-name" value={name ?? studio.restoreInfo.name} onChange={(event) => setName(event.target.value)} maxLength={MAX_MIX_NAME} disabled={disabled} required />
      {studio.savedMixes.length >= MAX_SAVED_MIXES && <p role="alert">Your saved collection is full. Delete a saved entry before restoring.</p>}
      <div className="project-transfer-actions"><button type="submit" disabled={disabled || studio.savedMixes.length >= MAX_SAVED_MIXES}>Restore as new mix</button>
        <button type="button" disabled={disabled} onClick={studio.discardProjectFile}>Cancel restore</button></div>
    </form>}
    <p className="project-transfer-note">Includes copies of library audio, so future library changes do not change this backup. Keep the .naturemix file somewhere safe.</p>
  </section>;
}
