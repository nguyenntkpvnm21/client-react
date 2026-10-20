import { useEffect, useRef, useState } from 'react';
import './App.css';
import Arrangement from './components/Arrangement';
import AudioImport from './components/AudioImport';
import Icon from './components/Icon';
import MixWorkspace from './components/MixWorkspace';
import SoundLibrary from './components/SoundLibrary';
import SavedMixes from './components/SavedMixes';
import StepSequencer from './components/StepSequencer';
import WorkspaceTransport from './components/WorkspaceTransport';
import useStudio from './hooks/useStudio';
import { pageFromHash, STUDIO_PAGES } from './lib/studioPages.js';
import './StudioPages.css';

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
    <header className="app-header">
      <a className="brand" href="#/studio" aria-label="NatureMix studio"><span className="brand-icon"><Icon name="leaf" size={22} /></span><span>nature<span>mix</span><span className="brand-period">.</span></span></a>
      <nav aria-label="Main navigation">{STUDIO_PAGES.map((item) => <a key={item.id} href={'#/' + item.id} className={item.id === page.id ? 'nav-active' : undefined}
        aria-current={item.id === page.id ? 'page' : undefined}>{item.label}</a>)}</nav>
      <span className="local-label"><span className="small-dot" />Local workspace</span>
    </header>
    <WorkspaceTransport studio={studio} />
    <main className={'app-main page-' + page.id} id="main-content" ref={mainRef} tabIndex={-1} aria-labelledby="page-title">
      <section className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE / {page.label.toUpperCase()}</p><h1 id="page-title">{page.title}</h1><p>{page.description}</p></div>
        {page.id === 'studio' ? <button type="button" className="primary-button" disabled={studio.busy} onClick={() => inputRef.current?.click()}><Icon name="upload" size={17} />Import your sound</button>
          : <a className="page-studio-link" href="#/studio">{page.id === 'saved-mixes' ? 'Return to Studio' : 'Add sounds in Studio'}<Icon name="arrow" size={16} /></a>}
      </section>
      <div className="page-content">
        {page.id === 'studio' && <div className="studio-page-grid"><MixWorkspace studio={studio} />
          <aside className="studio-sidebar" aria-label="Add sounds"><AudioImport studio={studio} role={role} setRole={setRole} inputRef={inputRef} chooseFiles={chooseFiles} /><SoundLibrary studio={studio} /></aside>
        </div>}
        {page.id === 'rhythm' && <StepSequencer studio={studio} />}
        {page.id === 'arrangement' && <Arrangement studio={studio} />}
        {page.id === 'saved-mixes' && <SavedMixes studio={studio} />}
      </div>
      {page.id === 'studio' && <div className="workspace-next"><p>Ready for the next layer?</p><a href="#/rhythm">Create a rhythm<Icon name="arrow" size={16} /></a><a href="#/arrangement">Arrange your mix<Icon name="arrow" size={16} /></a><a href="#/saved-mixes">Save your mix<Icon name="arrow" size={16} /></a></div>}
    </main>
    <footer className="app-footer"><span>naturemix. <span>Sounds from the world. A mix of your own.</span></span><span>Your imported audio stays on this device.</span></footer>
  </div>;
}
