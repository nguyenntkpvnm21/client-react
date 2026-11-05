import { useEffect, useRef, useState } from 'react';
import useStudio from './hooks/useStudio';
import EditorTimeline from './components/EditorTimeline';
import EditorLibrary from './components/EditorLibrary';
import EditorBeats from './components/EditorBeats';
import SavedMixes from './components/SavedMixes';
import ArrangementExport from './components/ArrangementExport';
import ClipEditor from './components/ClipEditor';
import Icon from './components/Icon';
import { clipRegion } from './lib/clipRegion.js';
import { selectedPart } from './lib/patternSections.js';
import { isSequenced } from './lib/sequencerState.js';
import { clockTime } from './lib/timeFormat.js';
import { parsePlaybackTime } from './lib/playbackTimeline.js';
import { historyGesture } from './lib/historyGesture.js';
import { editorClipWindow } from './lib/editorTracks.js';
import './Editor.css';

function Modal({ title, onClose, blocked = false, children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className={'editor-dialog ' + className} onCancel={event => { event.preventDefault();if (!blocked) onClose(); }} aria-label={title}>
    <div className="editor-dialog-heading"><h2>{title}</h2><button type="button" aria-label={'Close ' + title} disabled={blocked} onClick={onClose}>×</button></div><div className="editor-dialog-content">{children}</div>
  </dialog>;
}
function TimeField({ label, value, onChange, disabled }) {
  return <label className="editor-time-field"><span>{label}</span><input type="text" inputMode="text" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} spellCheck={false} /></label>;
}
function ClipInspector({ studio, clip, onClose, onSource }) {
  const info = studio.details[clip.id], window = editorClipWindow(clip, studio.arrangement, info?.duration);
  const audible = window.end - window.start;
  const [start, setStart] = useState(clockTime(window.start, 3)), [length, setLength] = useState(clockTime(audible, 3));
  const [fadeIn, setFadeIn] = useState(clockTime(window.fadeIn, 3)), [fadeOut, setFadeOut] = useState(clockTime(window.fadeOut, 3));
  const [error, setError] = useState('');
  async function apply(event, action) {
    event.preventDefault();
    try {
      const next = { ...window, end: window.start + audible };
      if (action === 'move') { next.start = parsePlaybackTime(start);next.end = next.start + audible; }
      else if (action === 'end') {
        const value = parsePlaybackTime(length);
        if (info && !clip.loop && !isSequenced(clip)) {
          const region = clipRegion(clip, info.duration), offset = clip.sourceOffset || 0;
          const padded = (clip.placement?.end ?? studio.arrangement.duration) - window.start > region.length - offset + 1e-7;
          const maximum = (padded ? region.end : info.duration) - region.start - offset;
          if (value > maximum + 1e-7) throw new Error('The source has only ' + clockTime(maximum, 3) + ' available here. Use the loop handle to repeat it.');
        }
        next.end = next.start + value;
      }
      else { next.fadeIn = parsePlaybackTime(fadeIn);next.fadeOut = parsePlaybackTime(fadeOut); }
      if (await studio.commitEditorClip(clip.id, next, action)) { setError('');onClose(); }
    } catch (problem) { setError(problem.message); }
  }
  return <div className="editor-inspector"><p className="editor-inspector-file">{clip.name}</p><p>Drag the clip to move it. Drag its edges to trim; the corner diamonds control fades.</p>
    <form onSubmit={event => apply(event, 'move')}><TimeField label="Position · m:ss" value={start} onChange={setStart} disabled={studio.busy} /><button type="submit" disabled={studio.busy}>Move clip</button></form>
    <form onSubmit={event => apply(event, 'end')}><TimeField label="Length · m:ss" value={length} onChange={setLength} disabled={studio.busy} /><button type="submit" disabled={studio.busy}>Trim length</button></form>
    <form className="editor-inspector-fades" onSubmit={event => apply(event, 'fadeIn')}><TimeField label="Fade in · m:ss" value={fadeIn} onChange={setFadeIn} disabled={studio.busy} /><TimeField label="Fade out · m:ss" value={fadeOut} onChange={setFadeOut} disabled={studio.busy} /><button type="submit" disabled={studio.busy}>Apply fades</button></form>
    <label className="editor-checkbox"><input type="checkbox" checked={clip.loop} disabled={studio.busy} onChange={event => studio.setClipLoop(clip.id, event.target.checked)} />Loop source audio within this clip</label><button type="button" disabled={studio.busy} onClick={onSource}>Choose source audio…</button>
    <p className="editor-fine-print">Edits keep the original recording. Undo is available.</p>{error && <p role="alert" className="editor-error">{error}</p>}
  </div>;
}
function SongSettings({ studio, onClose }) {
  const [end, setEnd] = useState(clockTime(studio.arrangement.duration, 3));
  const [loopStart, setLoopStart] = useState(clockTime(studio.loopSection.start, 3)), [loopEnd, setLoopEnd] = useState(clockTime(studio.loopSection.end, 3));
  const [error, setError] = useState('');
  return <div className="editor-song-settings"><form onSubmit={event => { event.preventDefault();try { studio.setArrangementLength(parsePlaybackTime(end, 300));setError(''); } catch (problem) { setError(problem.message); } }}>
    <h3>Song length</h3><p>Playback and WAV export stop here. Applying pauses and returns to the start.</p><div className="editor-form-row"><TimeField label="Song end · m:ss" value={end} onChange={setEnd} disabled={studio.busy} /><button type="submit" disabled={studio.busy}>Apply end</button></div><button type="button" disabled={!studio.tracks.length || studio.busy} onClick={async () => { if (await studio.fitSongEnd()) onClose(); }}>Fit song to clips</button>
  </form><form onSubmit={async event => { event.preventDefault();try { await studio.setLoopSection({ start: parsePlaybackTime(loopStart), end: parsePlaybackTime(loopEnd) });setError(''); } catch (problem) { setError(problem.message); } }}>
    <h3>Playback cycle</h3><p>Repeats a listening region. It never limits the exported song.</p><div className="editor-form-row"><TimeField label="Cycle start · m:ss" value={loopStart} onChange={setLoopStart} disabled={studio.busy} /><TimeField label="Cycle end · m:ss" value={loopEnd} onChange={setLoopEnd} disabled={studio.busy} /></div><button type="submit" disabled={studio.busy}>Set cycle</button>
  </form><label className="editor-settings-master">Master volume <output>{studio.master}%</output><input {...historyGesture(studio, 'master')} type="range" min="0" max="100" value={studio.master} aria-label="Song master volume" style={{ '--level': studio.master + '%' }} disabled={studio.busy} onChange={event => studio.setMaster(Number(event.target.value))} /></label>{error && <p className="editor-error" role="alert">{error}</p>}</div>;
}
function Transport({ studio, recording, onRecord, onSettings }) {
  const [draft, setDraft] = useState(null), [error, setError] = useState(''), [bpm, setBpm] = useState(null), [tempoError, setTempoError] = useState('');
  const active = ['playing', 'loading'].includes(studio.status), locked = studio.booting || studio.projectBusy || studio.importing || recording;
  async function go(event) {
    event.preventDefault();try { if (await studio.seekPlayback(parsePlaybackTime(draft ?? clockTime(studio.elapsed, 3), studio.arrangement.duration))) { setDraft(null);setError(''); } } catch (problem) { setError(problem.message); }
  }
  function applyBpm() { const value = Number(bpm ?? studio.bpm);if (!Number.isInteger(value) || value < 40 || value > 240) { setTempoError('Choose a whole BPM from 40 to 240.');setBpm(null);return; }void studio.setBpm(value);setBpm(null);setTempoError(''); }
  return <section className="editor-transport" aria-label="Song playback"><div className="editor-transport-buttons"><button type="button" aria-label="Restart song" title="Return to start of song or cycle" disabled={locked || !studio.tracks.length} onClick={studio.restartPlayback}>|◀</button>
    <button type="button" className={'editor-play' + (active ? ' is-playing' : '')} aria-label={active ? 'Pause song' : 'Play song'} title="Play / Pause · Space" disabled={locked || (!active && studio.busy) || !studio.tracks.length} onClick={studio.togglePlayback}><Icon name={active ? 'pause' : 'play'} size={21} /></button>
    <button type="button" className="editor-record" aria-label="Open microphone recording" title="Record audio" disabled={studio.busy || recording} onClick={onRecord}><span /></button></div>
    <form className="editor-playback-time" onSubmit={go}><label className="sr-only" htmlFor="editor-playhead-time">Playhead time · m:ss</label><input id="editor-playhead-time" aria-label="Playhead time" spellCheck={false} value={draft ?? clockTime(studio.elapsed, 2)} disabled={locked} onFocus={() => setDraft(clockTime(studio.elapsed, 3))} onBlur={event => { if (!event.currentTarget.form.contains(event.relatedTarget)) { setDraft(null);setError(''); } }} onChange={event => { setDraft(event.target.value);setError(''); }} onKeyDown={event => { if (event.key === 'Escape') { setDraft(null);setError('');event.currentTarget.blur(); } }} /><button type="submit" title="Go to entered time" disabled={locked}>Go</button>{error && <p className="editor-time-error" role="alert">{error}</p>}</form>
    <div className="editor-tempo"><label htmlFor="editor-bpm">BPM</label><input id="editor-bpm" type="number" min="40" max="240" step="1" value={bpm ?? studio.bpm} disabled={locked} onFocus={() => setBpm(studio.bpm)} onChange={event => setBpm(event.target.value)} onBlur={applyBpm} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />{tempoError && <p className="editor-time-error" role="alert">{tempoError}</p>}</div>
    <button type="button" className="editor-cycle-toggle" aria-pressed={studio.loopSection.enabled} disabled={locked || !studio.tracks.length} title="Playback cycle · C" onClick={() => studio.loopSection.enabled ? studio.disableLoop() : studio.setLoopSection({ ...studio.loopSection, enabled: true })}><Icon name="loop" size={18} /><span>Cycle</span></button>
    <button type="button" className="editor-song-end" onClick={onSettings} disabled={recording}>End <strong>{clockTime(studio.arrangement.duration)}</strong><span>⌄</span></button>
    <label className="editor-master"><Icon name="volume" size={17} /><span>Master</span><input {...historyGesture(studio, 'master')} type="range" min="0" max="100" value={studio.master} disabled={studio.busy || recording} aria-label="Master volume" style={{ '--level': studio.master + '%' }} onChange={event => studio.setMaster(Number(event.target.value))} /><output>{studio.master}%</output></label>
  </section>;
}
const routeModal = () => location.hash === '#/saved-mixes' || location.hash === '#/projects' ? 'projects' : null;
export default function App() {
  const studio = useStudio();
  const [library, setLibrary] = useState(() => window.innerWidth > 1000), [beats, setBeats] = useState(() => location.hash === '#/rhythm');
  const [modal, setModal] = useState(routeModal), [snap, setSnap] = useState('beats'), [recording, setRecording] = useState(false), [dismissed, setDismissed] = useState('');
  const importInput = useRef(null), mainRef = useRef(null), latest = useRef(studio);
  useEffect(() => { latest.current = studio; });
  useEffect(() => { document.title = (studio.activeProject?.name || 'Untitled project') + ' · NatureMix Studio'; }, [studio.activeProject?.name]);
  useEffect(() => { if (!studio.booting && !studio.arrangement.enabled) void studio.editorMode(); }, [studio.booting, studio.arrangement.enabled, studio.activeProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const metadataKey = studio.tracks.filter(clip => !studio.details[clip.id]).map(clip => clip.id).join('|');
  useEffect(() => {
    let canceled = false;
    if (!studio.booting) void (async () => { for (const clip of latest.current.tracks) { if (canceled) break;if (!latest.current.details[clip.id]) await latest.current.loadTrackInfo(clip.id); } })();
    return () => { canceled = true; };
  }, [metadataKey, studio.booting]);
  useEffect(() => { function route() { if (latest.current.busy || recording) return;setModal(routeModal());setBeats(location.hash === '#/rhythm' || location.hash === '#/beats'); }window.addEventListener('hashchange', route);return () => window.removeEventListener('hashchange', route); }, [recording]);
  useEffect(() => {
    if (!recording) return;
    const guard = event => { if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()) && !event.target.closest('input,textarea')) { event.preventDefault();event.stopImmediatePropagation(); } };
    window.addEventListener('keydown', guard, true);return () => window.removeEventListener('keydown', guard, true);
  }, [recording]);
  useEffect(() => {
    function key(event) {
      if (event.target.closest('input,textarea,select,dialog,[contenteditable="true"]') || recording || modal || latest.current.editorId) return;
      const s = latest.current;
      if (event.code === 'Space' && !event.target.closest('button,summary,a')) { event.preventDefault();if ((!s.busy && s.tracks.length) || s.status === 'playing') void s.togglePlayback(); }
      if (event.ctrlKey || event.metaKey) { if (event.key.toLowerCase() === 'd' && s.selectedClipId) { event.preventDefault();const clip = s.tracks.find(track => track.id === s.selectedClipId);if (clip && !clip.patternBlock) void s.duplicateSelectedClipAt(clip.id, editorClipWindow(clip, s.arrangement, s.details[clip.id]?.duration).end); }return; }
      if (s.busy) return;
      if (event.key.toLowerCase() === 's' && s.selectedClipId) { event.preventDefault();void s.splitClip(s.selectedClipId); }
      if (event.key.toLowerCase() === 'c' && s.tracks.length) { event.preventDefault();void (s.loopSection.enabled ? s.disableLoop() : s.setLoopSection({ ...s.loopSection, enabled: true })); }
      if (['Delete', 'Backspace'].includes(event.key) && s.selectedClipId && !event.target.closest('button,summary')) { event.preventDefault();if (s.tracks.some(clip => clip.patternBlock?.id === s.selectedClipId)) void s.updatePatternSection(s.selectedClipId, {}, 'remove');else void s.removeTrack(s.selectedClipId); }
    }window.addEventListener('keydown', key);return () => window.removeEventListener('keydown', key);
  }, [recording, modal]);
  function openModal(value) { studio.closeClip();setModal(value); }
  async function openProject(id) { const done = await studio.openMix(id);if (done) { setModal(null);setBeats(false);if (window.innerWidth <= 1000) setLibrary(false); }return done; }
  function showEditor() { setBeats(false);setModal(null);if (window.innerWidth <= 1000) setLibrary(false); }
  function toggleBeats() { setBeats(!beats);if (window.innerWidth <= 1000) setLibrary(false); }
  function makeBeat(id) { if (id) studio.selectClip(id);setBeats(true);if (window.innerWidth <= 1000) setLibrary(false); }
  function inspect(id) { if (studio.tracks.some(clip => clip.patternBlock?.id === id)) makeBeat(id);else { studio.selectClip(id);setModal('clip'); } }
  function record() { setLibrary(true);requestAnimationFrame(() => document.querySelector('.microphone-start')?.focus()); }
  const selected = studio.tracks.find(clip => clip.id === studio.selectedClipId), editorTrack = selectedPart(studio, studio.editorId);
  const notice = recording ? 'Stop & add or Cancel before editing the song.' : studio.storageNotice || (studio.notice !== dismissed ? studio.notice : '');
  const isolated = studio.preview || studio.patternPreview || studio.scenePreview;
  return <div className="foundation-shell"><a className="skip-link" href="#editor-main" onClick={event => { event.preventDefault();mainRef.current?.focus(); }}>Skip to editor</a>
    <header className="editor-header"><a className="editor-brand" href="#/studio" aria-label="NatureMix Editor"><span>n<span>m</span></span><strong>naturemix<span>studio</span></strong></a><div className="editor-project-title"><strong title={studio.activeProject?.name}>{studio.activeProject?.name || 'Untitled project'}</strong><span>{studio.activeProject ? studio.dirty ? 'Unsaved changes' : 'Saved on this device' : 'On this device'}</span></div>
      <div className="editor-header-actions"><button type="button" className="editor-new" disabled={studio.busy || recording} onClick={() => { if (!studio.tracks.length || window.confirm('Start a new project? Save your current project first if you want to keep it. Undo can restore this workspace.')) studio.newProject(); }}>New</button><button type="button" className="editor-save" disabled={studio.busy || recording || studio.projectsBlocked} onClick={() => studio.activeProject ? studio.updateSavedMix() : openModal('projects')}>Save<span className="desktop-label"> project</span></button><button type="button" disabled={studio.busy || recording || !studio.tracks.length} onClick={() => openModal('export')}>Export</button><button type="button" className="editor-library-toggle" aria-pressed={library} disabled={recording} onClick={() => setLibrary(!library)}><Icon name="library" size={17} /><span>Audio</span></button></div>
    </header><Transport studio={studio} recording={recording} onRecord={record} onSettings={() => openModal('settings')} />
    <div className="editor-body"><nav className="editor-nav" aria-label="Studio navigation"><button type="button" aria-label="Editor" aria-current={!beats && !modal ? 'page' : undefined} disabled={recording} onClick={showEditor}><Icon name="timeline" /><span>Editor</span></button><button type="button" aria-label="Beats" aria-pressed={beats} disabled={recording} onClick={toggleBeats}><Icon name="rhythm" /><span>Beats</span></button><button type="button" aria-label="Projects" aria-pressed={modal === 'projects'} disabled={recording} onClick={() => openModal('projects')}><Icon name="layers" /><span>Projects</span></button><div className="editor-nav-spacer" /><button type="button" aria-label="Keyboard shortcuts and help" disabled={recording} onClick={() => openModal('help')}><span className="editor-help-symbol">?</span><span>Help</span></button></nav>
      <main className="editor-main" id="editor-main" ref={mainRef} tabIndex={-1} aria-label="Audio editor" aria-busy={studio.booting}><div className={'editor-canvas' + (recording ? ' recording-locked' : '')} inert={recording || undefined}><EditorTimeline studio={studio} snap={snap} onSnapChange={setSnap} onImport={() => importInput.current.click()} onLibrary={() => setLibrary(true)} onBeats={makeBeat} onInspect={inspect} />{beats && <EditorBeats studio={studio} selectedId={studio.selectedClipId} onSelect={studio.selectClip} onClose={() => setBeats(false)} />}</div>{library && <EditorLibrary studio={studio} onClose={() => setLibrary(false)} onImport={() => importInput.current.click()} onRecordingChange={setRecording} />}</main>
    </div><footer className="editor-status"><span className={'editor-status-dot' + (studio.status === 'playing' ? ' playing' : '')} /><span>{studio.booting ? 'Opening project…' : isolated ? 'Sample preview · song paused' : recording ? 'Microphone' : studio.status === 'loading' ? 'Loading audio…' : studio.status === 'playing' ? studio.loopSection.enabled ? 'Playing cycle' : 'Playing' : 'Paused'}</span>{isolated && <button type="button" onClick={studio.stopPreview}>Stop preview</button>}{notice && <div className="editor-notice" role="status"><button type="button" className="editor-notice-message" title={notice} aria-label={'Read workspace message: ' + notice} disabled={recording} onClick={() => openModal('message')}>{notice}</button>{!recording && !studio.storageNotice && <button type="button" aria-label="Dismiss notice" onClick={() => setDismissed(studio.notice)}>×</button>}</div>}<span className="editor-status-format">44.1 kHz · Local storage</span></footer>
    <input ref={importInput} className="sr-only" type="file" tabIndex={-1} multiple accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm" aria-label="Import audio files" disabled={studio.busy || recording} onChange={event => { const files = [...event.target.files];event.target.value = '';if (files.length) void studio.importFiles(files, 'music', false); }} />
    {modal && <Modal title={modal === 'projects' ? 'Projects' : modal === 'export' ? 'Export song' : modal === 'clip' ? 'Clip settings' : modal === 'settings' ? 'Song & cycle' : modal === 'message' ? 'Workspace message' : 'Editor guide'} blocked={studio.projectBusy} onClose={() => setModal(null)} className={modal === 'projects' ? 'editor-projects-dialog' : ''}>
      {modal === 'projects' && <><button type="button" className="editor-projects-new" disabled={studio.busy} onClick={() => { if (!studio.tracks.length || window.confirm('Start a new project? Save your current project first if you want to keep it.')) { studio.newProject();setModal(null); } }}><Icon name="plus" size={16} />New empty project</button><SavedMixes studio={{ ...studio, openMix: openProject }} /></>}{modal === 'export' && <ArrangementExport studio={studio} />}{modal === 'clip' && selected && <ClipInspector key={selected.id + JSON.stringify(selected.placement) + selected.loop} studio={studio} clip={selected} onClose={() => setModal(null)} onSource={() => { setModal(null);void studio.openClip(selected.id, isSequenced(selected) ? 'sequencer' : 'mixer'); }} />}{modal === 'settings' && <SongSettings studio={studio} onClose={() => setModal(null)} />}{modal === 'message' && <p>{notice}</p>}
      {modal === 'help' && <div className="editor-guide"><h3>Make your first mix</h3><ol><li><strong>Add audio.</strong> Import files, drag them from your computer, or record from the Audio panel.</li><li><strong>Arrange.</strong> Drag clips along the timeline. Select one to trim its edges, pull fade diamonds, or extend its loop handle.</li><li><strong>Listen and adjust.</strong> Click the time ruler to seek. M and S mute or solo a track. Use Beats to edit a drum pattern while listening.</li><li><strong>Keep your work.</strong> Save project stores it in this browser. Projects → Download project includes original audio for another device. Export downloads the finished WAV.</li></ol><h3>Keyboard</h3><dl><dt>Space</dt><dd>Play / Pause</dd><dt>S</dt><dd>Split selected audio at playhead</dd><dt>Ctrl / ⌘ D</dt><dd>Duplicate after selected clip</dd><dt>Ctrl / ⌘ Z</dt><dd>Undo · Shift to redo</dd><dt>C</dt><dd>Toggle playback cycle</dd><dt>Arrow keys</dt><dd>Move focused clip or handle · Shift for fine steps</dd><dt>Delete</dt><dd>Remove selected clip</dd></dl><p className="editor-fine-print">Up to 8 audio sources, 32 clip rows and a 5-minute song. Recording pauses playback; live overdubbing, instruments and effects are not included in this version. Audio clips keep their original speed when BPM changes.</p></div>}
    </Modal>}
    {editorTrack && <Modal title={studio.editorLocation === 'sequencer' ? 'Sample editor' : 'Source audio'} blocked={studio.projectBusy} onClose={studio.closeClip} className="editor-source-dialog"><ClipEditor key={editorTrack.id + studio.editorLocation} track={editorTrack} studio={studio} info={studio.details[editorTrack.id]} location={studio.editorLocation} /></Modal>}
  </div>;
}
