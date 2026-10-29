import { useEffect, useRef, useState } from 'react';
import { SCENES } from '../lib/scenes.js';
import Icon from './Icon';
import './SceneStarters.css';

export default function SceneStarters({ studio }) {
  const [pending, setPending] = useState(null);
  const confirmation = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (pending) {
      confirmation.current?.focus({ preventScroll: true });
      confirmation.current?.scrollIntoView({ block: 'nearest' });
      confirmation.current?.querySelector('.scene-actions')?.scrollIntoView({ block: 'nearest' });
    }
  }, [pending]);
  function keepCurrent() {
    setPending(null);
    trigger.current?.focus({ preventScroll: true });
    trigger.current?.scrollIntoView({ block: 'nearest' });
  }
  return <section className="scene-starters panel" aria-labelledby="scene-starters-title">
    <div className="section-heading"><div><p className="eyebrow">NATURE SETS THE SCENE</p><h2 id="scene-starters-title">Start from a scene</h2></div><span className="count-pill">03</span></div>
    <p className="scene-intro">A starting point for your own sound. Hear a 12-second preview, then make every layer yours.</p>
    <div className="scene-cards">{SCENES.map((scene) => {
      const preview = studio.scenePreview?.id === scene.id;
      return <article className="scene-card" key={scene.id} style={{ '--scene-color': scene.color }}>
        <div className="scene-card-heading"><span className="scene-icon"><Icon name={scene.icon} size={23} /></span><span>{scene.duration}s · {scene.layers.length} layers</span></div>
        <h3>{scene.name}</h3><p>{scene.description}</p>
        <div className="scene-actions"><button type="button" disabled={studio.busy} aria-pressed={preview} aria-label={(preview ? 'Stop preview of ' : 'Hear preview of ') + scene.name} onClick={() => studio.hearScene(scene.id)}>
          <Icon name={preview ? 'pause' : 'play'} size={13} />{preview ? studio.scenePreview.status === 'loading' ? 'Cancel loading' : 'Stop preview' : 'Hear scene'}</button>
          <button type="button" disabled={studio.busy} onClick={(event) => { studio.stopScene();trigger.current = event.currentTarget;setPending(scene.id); }} aria-label={'Use ' + scene.name}>Use scene<Icon name="arrow" size={13} /></button></div>
      </article>;
    })}</div>
    {studio.scenePreview && <p className="scene-preview-note" role="status">Scene preview · Your workspace is paused at its current position. Press Play mix to return to it.</p>}
    {pending && <div ref={confirmation} tabIndex={-1} className="scene-confirm" role="group" aria-label="Confirm scene workspace" onKeyDown={(event) => { if (event.key === 'Escape' && !studio.busy) keepCurrent(); }}>
      <h3>Start {SCENES.find((scene) => scene.id === pending).name}?</h3>
      <p>This replaces the current workspace with editable layers and an arrangement. Save or download your current project first if you want to keep it. Your saved mixes stay in your collection.</p>
      <div className="scene-actions"><a href="#/saved-mixes">Save or back up current mix</a><button type="button" disabled={studio.busy} onClick={async () => { if (await studio.useScene(pending)) setPending(null); }}>Start scene</button>
        <button type="button" disabled={studio.busy} onClick={keepCurrent}>Keep current mix</button></div>
    </div>}
    <p className="scene-footnote">Uses the included Rain, Birds and Music recordings. Add your vocal or instrumental, then shape the scene in Arrangement.</p>
  </section>;
}
