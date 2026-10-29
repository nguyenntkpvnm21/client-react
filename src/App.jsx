import { useEffect, useRef, useState } from 'react';
import './App.css';
import Arrangement from './components/Arrangement';
import AudioImport from './components/AudioImport';
import Icon from './components/Icon';
import MixWorkspace from './components/MixWorkspace';
import SoundLibrary from './components/SoundLibrary';
import SavedMixes from './components/SavedMixes';
import SceneStarters from './components/SceneStarters';
import SourcePool from './components/SourcePool';
import StepSequencer from './components/StepSequencer';
import WorkspaceTransport from './components/WorkspaceTransport';
import useStudio from './hooks/useStudio';
import { pageFromHash, STUDIO_PAGES } from './lib/studioPages.js';
import './StudioPages.css';
import './StudioTheme.css';
import './BeginnerUi.css';

const pageIcons = { studio: 'layers', rhythm: 'rhythm', arrangement: 'timeline', 'saved-mixes': 'library' };

export default function App() {
  const studio = useStudio();
  const [page, setPage] = useState(() => pageFromHash(window.location.hash));
  const [role, setRole] = useState('nature');
  const inputRef = useRef(null);
  const mainRef = useRef(null);
  const closeClip = studio.closeClip;
  useEffect(() => {
    function navigate() {
      const next = pageFromHash(window.location.hash);
      if (next.id === page.id) return;
      closeClip();
      setPage(next);
      requestAnimationFrame(() => { mainRef.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); });
    }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [page.id, closeClip]);
  useEffect(() => { document.title = page.label + ' · NatureMix'; }, [page.label]);
  function chooseFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    void studio.importFiles(selected, role);
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>Skip to page content</a>
    <a className="skip-link" href="#workspace-playback" onClick={(event) => { event.preventDefault();document.querySelector('.workspace-transport button')?.focus(); }}>Skip to playback</a>
    <aside className="app-sidebar" aria-label="Studio navigation">
      <a className="brand" href="#/studio" aria-label="NatureMix studio"><span className="brand-icon"><Icon name="leaf" size={22} /></span><span>nature<span>mix</span><span className="brand-period">.</span></span></a>
      <p className="sidebar-eyebrow">YOUR WORKSPACE</p>
      <nav aria-label="Main navigation">{STUDIO_PAGES.map((item) => <a key={item.id} href={'#/' + item.id} className={item.id === page.id ? 'nav-active' : undefined} aria-label={item.label} title={item.label} aria-current={item.id === page.id ? 'page' : undefined}>
        <Icon name={pageIcons[item.id]} size={20} /><span>{item.label}</span>{item.id === 'saved-mixes' && studio.savedMixes.length > 0 && <span className="sidebar-count">{studio.savedMixes.length}</span>}
      </a>)}</nav>
      <div className="sidebar-project"><span className="sidebar-eyebrow">CURRENT PROJECT</span><a href="#/saved-mixes" aria-label="View current project in Saved mixes"><span className="sidebar-project-art"><Icon name="music" size={21} /></span><span><strong>{studio.activeProject?.name || 'Untitled mix'}</strong><small>{studio.activeProject ? studio.dirty ? 'Unsaved changes' : 'Saved mix' : 'Save your creation'}</small></span><Icon name="arrow" size={16} /></a></div>
      <section className="sidebar-layer-list" aria-label="Current layers"><div><h2>Your clips</h2><span>{studio.tracks.length}</span></div>
        {studio.tracks.length ? <ul>{studio.tracks.map((track) => <li className={track.role} key={track.id}><span className="sidebar-layer-dot" /><span title={track.name}>{track.name}</span><span className="sidebar-layer-type">{track.role}</span></li>)}</ul> : <p>Add a sound to get started.</p>}
      </section>
      <div className="sidebar-footnote"><Icon name="headphones" size={18} /><span>A space for your sound.<small>Create. Listen. Make it yours.</small></span></div>
    </aside>
    <div className="studio-content-shell">
    <header className="workspace-header"><div className="workspace-breadcrumb"><Icon name={pageIcons[page.id]} size={18} /><span>Workspace</span><span aria-hidden="true">/</span><strong>{page.label}</strong></div>
      <div className="workspace-header-actions"><span className="local-label"><span className="small-dot" />On this device</span>
        {page.id === 'studio' ? <button type="button" className="primary-button" disabled={studio.busy} onClick={() => inputRef.current?.click()}><Icon name="plus" size={16} />Add audio</button> : <a className="primary-button" href="#/studio"><Icon name="plus" size={16} />Add audio</a>}
      </div></header>
    <main className={'app-main page-' + page.id} id="main-content" ref={mainRef} tabIndex={-1} aria-labelledby="page-title">
      <section className="page-heading"><div><p className="eyebrow">NATUREMIX / {page.label.toUpperCase()}</p><h1 id="page-title">{page.title}</h1><p>{page.description}</p></div><span className="page-mode"><span className="small-dot" />{studio.arrangement.enabled ? 'Arrangement' : 'Free mix'}</span></section>
      <div className="page-content">
        {page.id === 'studio' && <><details className="starter-disclosure" open={!studio.tracks.length || undefined}><summary>Try a starter scene</summary><SceneStarters studio={studio} /></details><div className="studio-page-grid"><MixWorkspace studio={studio} />
          <aside className="studio-sidebar" aria-label="Add sounds"><AudioImport studio={studio} role={role} setRole={setRole} inputRef={inputRef} chooseFiles={chooseFiles} /><SoundLibrary studio={studio} /><details className="sources-disclosure"><summary>Reuse a recording · {studio.sources.length} sources</summary><SourcePool studio={studio} /></details></aside>
        </div></>}
        {page.id === 'rhythm' && <StepSequencer studio={studio} />}
        {page.id === 'arrangement' && <Arrangement studio={studio} />}
        {page.id === 'saved-mixes' && <SavedMixes studio={studio} />}
      </div>
      {page.id === 'studio' && <div className="workspace-next"><p>Ready for the next layer?</p><a href="#/rhythm">Create a rhythm<Icon name="arrow" size={16} /></a><a href="#/arrangement">Arrange your mix<Icon name="arrow" size={16} /></a><a href="#/saved-mixes">Save your mix<Icon name="arrow" size={16} /></a></div>}
    </main>
    <footer className="app-footer"><span>naturemix. <span>Sounds from the world. A mix of your own.</span></span><span>Your imported audio stays on this device.</span></footer>
    </div>
    <WorkspaceTransport studio={studio} />
  </div>;
}
