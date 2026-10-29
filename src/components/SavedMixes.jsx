import { useState } from 'react';
import { MAX_MIX_NAME, MAX_SAVED_MIXES } from '../lib/savedMixes.js';
import Icon from './Icon';
import ProjectTransfer from './ProjectTransfer';
import './SavedMixes.css';

export default function SavedMixes({ studio }) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(null);
  const [rename, setRename] = useState('');
  const disabled = studio.busy || studio.projectsBlocked;

  async function save(event) {
    event.preventDefault();
    if (await studio.saveMix(name)) setName('');
  }

  async function confirm(event) {
    event.preventDefault();
    const done = pending.type === 'rename' ? await studio.renameMix(pending.id, rename)
      : pending.type === 'delete' ? await studio.deleteMix(pending.id) : await studio.openMix(pending.id);
    if (done) setPending(null);
  }

  function requestOpen(project) {
    if (studio.dirty) setPending({ type: 'open', id: project.id });
    else void studio.openMix(project.id);
  }

  return <section className="saved-panel panel" id="saved-mixes" aria-labelledby="saved-mixes-title"
    onKeyDown={(event) => { if (event.key === 'Escape' && !disabled) setPending(null); }}>
    <div className="section-heading"><div><p className="eyebrow">KEEP YOUR FAVORITES</p><h2 id="saved-mixes-title">Saved mixes</h2></div>
      <span className="count-pill">{studio.savedMixes.length}/{MAX_SAVED_MIXES}</span></div>
    <p className="saved-description">Give your mix a name. Return to its sounds whenever you like.</p>
    <form className="save-mix-form" onSubmit={save}>
      <label htmlFor="new-mix-name">Mix name</label><input id="new-mix-name" type="text" value={name} onChange={(event) => setName(event.target.value)}
        placeholder="e.g. Rainy Evening" maxLength={MAX_MIX_NAME} required disabled={disabled} />
      <button type="submit" className="saved-button" disabled={disabled || studio.savedMixes.length >= MAX_SAVED_MIXES}><Icon name="plus" size={14} />Save as new</button>
    </form>
    {studio.activeProject && <div className="saved-current"><span>Opened: <strong>{studio.activeProject.name}</strong></span>
      <button type="button" className="saved-button" disabled={disabled || !studio.dirty} onClick={studio.updateSavedMix}>Save changes</button>
      <p>{studio.dirty ? 'Your edits are not yet in this saved mix.' : 'This workspace matches the saved mix.'}</p></div>}
    {studio.booting ? <p className="saved-empty">Opening your saved mixes...</p>
      : !studio.savedMixes.length && !studio.projectsBlocked ? <p className="saved-empty">Your first saved mix starts here.</p> : null}
    <ul className="saved-list" aria-label="Saved mix collection">{studio.savedMixes.map((project) => {
      const selected = studio.activeProject?.id === project.id;
      const editing = pending?.id === project.id;
      return <li className={'saved-item ' + (selected ? 'is-current' : '')} key={project.id}>
        <div className="saved-item-heading"><strong title={project.name}>{project.name}</strong>{selected && <span className="saved-active">Open</span>}</div>
        <p>{project.mix.tracks.length} {project.mix.tracks.length === 1 ? 'layer' : 'layers'} · Master {project.mix.master}%</p>
        <div className="saved-item-actions"><button type="button" disabled={disabled} aria-label={'Open ' + project.name} onClick={() => requestOpen(project)}><Icon name="arrow" size={13} />Open</button>
          <button type="button" disabled={disabled} aria-label={'Rename ' + project.name} onClick={() => { setRename(project.name); setPending({ type: 'rename', id: project.id }); }}>Rename</button>
          <button type="button" className="saved-delete" disabled={disabled} aria-label={'Delete ' + project.name} onClick={() => setPending({ type: 'delete', id: project.id })}><Icon name="trash" size={13} /></button></div>
        {editing && <form className="saved-confirm" onSubmit={confirm}><fieldset disabled={disabled}>
          <legend>{pending.type === 'rename' ? 'Rename mix' : pending.type === 'delete' ? 'Delete saved mix?' : 'Replace current workspace?'}</legend>
          {pending.type === 'rename' ? <><label className="sr-only" htmlFor="rename-mix">New mix name</label><input id="rename-mix" type="text" maxLength={MAX_MIX_NAME} required value={rename} onChange={(event) => setRename(event.target.value)} /></>
            : <p>{pending.type === 'delete' ? 'The saved entry will be deleted. Your current workspace stays open.'
              : 'Save your current mix first if you want to keep it. Opening this mix stops playback.'}</p>}
          <div><button type="submit">{pending.type === 'rename' ? 'Apply name' : pending.type === 'delete' ? 'Delete saved mix' : 'Open mix'}</button>
            <button type="button" onClick={() => setPending(null)}>Cancel</button></div>
        </fieldset></form>}
      </li>;
    })}</ul>
    {studio.savedNotice && <p className="saved-notice" role="status">{studio.savedNotice}</p>}
    <p className="saved-footnote">Saved in this browser. Mixes share imported audio; no extra copy is made.</p>
    <ProjectTransfer studio={studio} />
  </section>;
}
