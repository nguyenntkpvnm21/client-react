import { useRef, useState } from 'react';
import './App.css';
import AudioImport from './components/AudioImport';
import Icon from './components/Icon';
import MixWorkspace from './components/MixWorkspace';
import SoundLibrary from './components/SoundLibrary';
import SavedMixes from './components/SavedMixes';
import useStudio from './hooks/useStudio';

export default function App() {
  const studio = useStudio();
  const [role, setRole] = useState('nature');
  const inputRef = useRef(null);
  function chooseFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    void studio.importFiles(selected, role);
  }
  return <div className="app-shell">
    <a className="skip-link" href="#studio">Skip to mixer</a>
    <header className="app-header">
      <a className="brand" href="#studio" aria-label="NatureMix studio"><span className="brand-icon"><Icon name="leaf" size={22} /></span><span>nature<span>mix</span><span className="brand-period">.</span></span></a>
      <nav aria-label="Main navigation"><a className="nav-active" href="#studio">Studio</a><a href="#saved-mixes">Saved mixes</a><a href="#my-sounds">Your sounds</a></nav>
      <span className="local-label"><span className="small-dot" />Local workspace</span>
    </header>
    <main className="app-main">
      <section className="intro" aria-labelledby="page-title"><div className="intro-copy"><p className="eyebrow">FOUND IN NATURE. MADE BY YOU.</p>
        <h1 id="page-title">The world is your <span>instrument.</span></h1><p>Layer the sounds around you. Add a little music. Make something that feels like you.</p></div>
        <div className="intro-action"><button type="button" className="primary-button" disabled={studio.busy} onClick={() => inputRef.current?.click()}><Icon name="upload" size={17} />Import your sound</button><span>Bring nature, music or vocal stems.</span></div>
      </section>
      <div className="studio-layout">
        <aside className="library-column" aria-label="Sound library and saved mixes"><SoundLibrary studio={studio} /><SavedMixes studio={studio} /></aside>
        <MixWorkspace studio={studio} />
        <aside className="import-column" aria-label="Your audio">
          <AudioImport studio={studio} role={role} setRole={setRole} inputRef={inputRef} chooseFiles={chooseFiles} />
          <section className="stem-tip panel" aria-labelledby="stem-tip-title"><p className="eyebrow">NATURE MEETS YOUR MUSIC</p><h2 id="stem-tip-title">Make room for your song.</h2>
            <ol><li>Import an instrumental as <strong>Music / instrumental</strong>.</li><li>Add its matching vocal as <strong>Vocal</strong>.</li><li>Bring in nature recordings and balance your layers.</li></ol>
            <p>Matching stems start on the same timeline. Use Restart to hear everything from the beginning.</p>
          </section>
        </aside>
      </div>
      <section className="idea-strip" aria-labelledby="idea-title"><span className="idea-icon"><Icon name="leaf" size={23} /></span><div><h2 id="idea-title">A different way to hear the everyday.</h2><p>Start with rain and birds. Bring in leaves, footsteps, flowing water — or an instrumental and vocal from your own song.</p></div><span className="idea-tag">LISTEN. LAYER. CREATE.</span></section>
    </main>
    <footer className="app-footer"><span>naturemix. <span>Sounds from the world. A mix of your own.</span></span><span>Your imported audio stays on this device.</span></footer>
  </div>;
}
