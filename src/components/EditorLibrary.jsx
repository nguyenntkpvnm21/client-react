import { useRef, useState } from 'react';
import { MAX_CLIPS, MAX_TRACKS, SOUNDS } from '../data/sounds.js';
import { sourceId } from '../lib/audioSources.js';
import MicrophoneRecorder from './MicrophoneRecorder';
import Icon from './Icon';
import './EditorLibrary.css';

export default function EditorLibrary({ studio, onClose, onImport, onRecordingChange }) {
  const input = useRef(null);
  const [recording, setRecording] = useState(false);
  const blocked = studio.busy || recording;
  const clipLimit = studio.tracks.length >= MAX_CLIPS;
  const sourceLimit = studio.sources.length >= MAX_TRACKS;
  function recordingChanged(value) { setRecording(value);onRecordingChange?.(value); }
  function choose(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length && !blocked) void studio.importFiles(files, 'music', false);
  }
  function drag(event, source) {
    if (blocked || clipLimit) { event.preventDefault();return; }
    event.dataTransfer.setData('application/x-naturemix-source', source.id);
    event.dataTransfer.setData('text/plain', source.name);
    event.dataTransfer.effectAllowed = 'copy';
  }
  function addSound(sound) {
    const existing = studio.sources.find(source => source.catalogId === sound.id);
    if (existing) void studio.addSourceClip(existing.id);
    else void studio.addSound({ ...sound, loop: false });
  }
  return <aside className="editor-library" aria-label="Audio files and recording">
    <div className="editor-library-heading"><h2>Audio</h2>{onClose && <button type="button" className="editor-library-close" aria-label="Close audio panel" disabled={recording} onClick={onClose}>×</button>}</div>
    <div className="editor-library-content">
      <section className="editor-library-import" aria-label="Import audio">
        <button type="button" className="editor-library-import-button" disabled={blocked || clipLimit || sourceLimit} onClick={() => onImport ? onImport() : input.current?.click()}><Icon name="upload" size={18} />Import files</button>
        <input ref={input} className="editor-library-file-input" type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm" multiple aria-label="Choose audio files" tabIndex={-1} onChange={choose} disabled={blocked} />
        <p>Audio plays once. MP3, WAV, M4A and more.</p>
        {(sourceLimit || clipLimit) && <p className="editor-library-limit" role="status">{sourceLimit ? 'All recording slots are in use. Remove an unused file to import another.' : 'All clip slots are in use. Remove a clip to add another.'}</p>}
      </section>
      <MicrophoneRecorder studio={studio} disabled={clipLimit || sourceLimit} onRecordingChange={recordingChanged} />
      <section className="editor-project-files" aria-labelledby="editor-project-files-title">
        <div className="editor-library-section-heading"><h3 id="editor-project-files-title">Project files</h3><span>{studio.sources.length}/{MAX_TRACKS}</span></div>
        {studio.sources.length ? <><p className="editor-library-hint">Drag a file into the timeline or add at the playhead.</p><ul>{studio.sources.map(source => {
          const clips = studio.tracks.filter(track => sourceId(track) === source.id).length;
          const usedByPattern = studio.patterns?.some(pattern => pattern.rows.some(row => sourceId(row) === source.id));
          return <li key={source.id} draggable={!blocked && !clipLimit} onDragStart={event => drag(event, source)}>
            <span className="editor-file-icon"><Icon name={source.role === 'vocal' ? 'vocal' : 'music'} size={18} /></span>
            <div className="editor-file-name"><strong title={source.name}>{source.name}</strong><span>{clips} {clips === 1 ? 'clip' : 'clips'}{usedByPattern ? ' · beat source' : ''}</span></div>
            <button type="button" className="editor-file-add" disabled={blocked || clipLimit} aria-label={'Add clip from ' + source.name} title="Add at playhead" onClick={() => studio.addSourceClip(source.id)}><Icon name="plus" size={17} /></button>
            {!clips && !usedByPattern && <button type="button" className="editor-file-remove" disabled={blocked} aria-label={'Remove unused file ' + source.name} onClick={() => studio.removeSource(source.id)}><Icon name="trash" size={16} /></button>}
          </li>;
        })}</ul></> : <p className="editor-library-empty">Import a file or record your first track.</p>}
      </section>
      <section className="editor-included-sounds" aria-labelledby="editor-included-sounds-title"><h3 id="editor-included-sounds-title">Included sounds</h3>
        <ul>{SOUNDS.map(sound => {
          const existing = studio.sources.some(source => source.catalogId === sound.id);
          return <li key={sound.id}><span className="editor-file-icon"><Icon name={sound.icon} size={18} /></span><div className="editor-file-name"><strong>{sound.name}</strong><span>{sound.role === 'music' ? 'Music sample' : 'Field recording'}</span></div><button type="button" className="editor-file-add" disabled={blocked || clipLimit || (sourceLimit && !existing)} aria-label={'Add ' + sound.name + ' sample'} onClick={() => addSound(sound)}><Icon name="plus" size={17} /></button></li>;
        })}</ul>
      </section>
      <p className="editor-library-storage">Files stay on this device.</p>
      {studio.storageNotice && <p className="editor-library-error" role="status">{studio.storageNotice}</p>}
    </div>
  </aside>;
}
