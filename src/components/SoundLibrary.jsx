import { useState } from 'react';
import { SOUNDS } from '../data/sounds.js';
import Icon from './Icon';

export default function SoundLibrary({ studio }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const sounds = SOUNDS.filter((sound) => (filter === 'all' || sound.role === filter) && sound.name.toLowerCase().includes(search.toLowerCase().trim()));
  return <section className="library-panel panel" aria-labelledby="library-title">
    <div className="section-heading"><div><p className="eyebrow">START WITH THE WORLD</p><h2 id="library-title">Sound library</h2></div><span className="count-pill">03</span></div>
    <label className="search-field"><Icon name="search" size={17} /><span className="sr-only">Search included sounds</span>
      <input type="search" placeholder="Find a sound..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <div className="library-filters" role="group" aria-label="Sound categories">
      {[['all', 'All sounds'], ['nature', 'Nature'], ['music', 'Music']].map(([id, label]) => <button key={id} type="button"
        aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
    </div>
    <div className="sound-cards">
      {sounds.map((sound) => {
        const added = studio.tracks.some((track) => track.id === sound.id);
        return <article className={'sound-card ' + sound.id} key={sound.id}>
          <div className="sound-card-top"><span className="sound-art"><Icon name={sound.icon} size={29} /></span><span className="sound-type">{sound.role === 'nature' ? 'NATURE' : 'MUSIC'}</span></div>
          <h3>{sound.name}</h3><p>{sound.description}</p>
          <button type="button" className={'add-sound ' + (added ? 'is-added' : '')} disabled={added || studio.busy}
            aria-label={(added ? 'Added ' : 'Add ') + sound.name} onClick={() => studio.addSound(sound)}>
            <Icon name={added ? 'check' : 'plus'} size={16} />{added ? 'In your mix' : 'Add layer'}</button>
        </article>;
      })}
      {!sounds.length && <p className="empty-search">No matching sounds. Try another search or import a recording.</p>}
    </div>
    <p className="library-footnote"><Icon name="leaf" size={15} /><span>Wind, leaves, water, animals — bring the sounds you love.</span></p>
  </section>;
}
