import { useMemo, useRef, useState } from 'react';
import { fitFades } from '../lib/arrangementState.js';
import { clipRegion } from '../lib/clipRegion.js';
import { editorClipWindow, editorLanes } from '../lib/editorTracks.js';
import { editTimelineWindow } from '../lib/timelineEditing.js';
import { editLoopRegion, MIN_LOOP_SECONDS } from '../lib/loopRegion.js';
import { barSeconds, patternGroups } from '../lib/patternSections.js';
import { isSequenced, sequenceMetadata, stepSeconds } from '../lib/sequencerState.js';
import { fitTimelineSelection, panTimeline, timelinePosition, timelineTime, timelineView, timelineWaveform, zoomTimeline } from '../lib/timelineViewport.js';
import { clockTime } from '../lib/timeFormat.js';
import { historyGesture } from '../lib/historyGesture.js';
import Icon from './Icon';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function clipWindow(clip, studio) {
  return editorClipWindow(clip, studio.arrangement, studio.details[clip.id]?.duration);
}

// Overlapping regions remain reachable instead of covering each other.
function stackedClips(clips, studio) {
  const ends = [];
  return [...clips].sort((a, b) => clipWindow(a, studio).start - clipWindow(b, studio).start).map(clip => {
    const window = clipWindow(clip, studio);
    let row = ends.findIndex(end => end <= window.start + 1e-7);
    if (row < 0) row = ends.length;
    ends[row] = window.end;
    return { clip, window, row };
  });
}

function EditorRegion({ clip, window, studio, view, snap, selected, row = 0, section, onSelect, onInspect }) {
  const [draft, setDraft] = useState(null);
  const gesture = useRef(null);
  const current = draft || window, span = view.end - view.start;
  const info = studio.details[clip.id];
  const sequenced = !!section || isSequenced(clip);
  const region = useMemo(() => info && !sequenced ? clipRegion(clip, info.duration) : null, [info, sequenced, clip]);
  const visualOffset = (clip.sourceOffset || 0) + (draft?.action === 'start' ? current.start - window.start : 0);
  const waveformFor = studio.waveformFor;
  const waveform = useMemo(() => sequenced ? null : timelineWaveform({ loop: clip.loop || draft?.action === 'repeat', sourceOffset: visualOffset }, region, current, view,
    (start, end, bins) => waveformFor(clip.id, start, end, bins), 250),
  [sequenced, clip.loop, clip.id, draft?.action, visualOffset, region, current.start, current.end, view.start, view.end, waveformFor]); // eslint-disable-line react-hooks/exhaustive-deps
  const path = useMemo(() => {
    if (!sequenced) return waveform?.bars.map(({ position, peak }) => `M${position * 1000} ${50 - peak * 33}V${50 + peak * 33}`).join('') || '';
    const rows = section?.rows || [clip], step = stepSeconds(studio.bpm);
    const first = Math.max(current.start, view.start), last = Math.min(current.end, view.end), length = last - first;
    let result = '';
    rows.slice(0, 4).forEach((track, index) => {
      const steps = sequenceMetadata(track).steps;
      for (let time = Math.ceil(first / step - 1e-7) * step; time < last; time += step) if (steps[Math.round(time / step) % 16]) {
        const x = (time - first) / length * 1000, y = 22 + index * 17;result += `M${x} ${y}v10`;
      }
    });
    return result;
  }, [sequenced, waveform, section, clip, studio.bpm, current.start, current.end, view.start, view.end]);
  if (current.end <= view.start || current.start >= view.end) return null;
  const start = Math.max(current.start, view.start), end = Math.min(current.end, view.end);
  const length = current.end - current.start;
  const inView = time => time >= view.start && time <= view.end;
  const disabled = studio.busy;
  async function commit(value, action, targetLane) {
    if (section) await studio.placePatternSection(section.id, value);
    else await studio.commitEditorClip(clip.id, value, action, targetLane);
    setDraft(null);
  }
  function edit(initial, action, delta, size) {
    let next = editTimelineWindow(initial, action === 'repeat' ? 'end' : action, delta, 300, size);
    if (!section && !sequenced && !clip.loop && region && info) {
      const offset = clip.sourceOffset || 0;
      if (action === 'start') next.start = Math.max(next.start, initial.start - region.start - offset);
      if (action === 'end') {
        const configuredEnd = clip.placement?.end ?? studio.arrangement.duration;
        const padded = configuredEnd - initial.start > region.length - offset + 1e-7;
        next.end = Math.min(next.end, initial.start + (padded ? region.end : info.duration) - region.start - offset);
      }
      next = fitFades(next);
    }
    return next;
  }
  function begin(event, action) {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus();
    onSelect(section?.id || clip.id);
    const lane = event.currentTarget.closest('.editor-lane').getBoundingClientRect();
    gesture.current = { id: event.pointerId, action, x: event.clientX, y: event.clientY, width: lane.width, original: window, draft: window, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    const g = gesture.current;if (!g || g.id !== event.pointerId) return;
    const delta = (event.clientX - g.x) / g.width * span;
    const size = section ? barSeconds(studio.bpm) : event.shiftKey ? 0 : snap;
    g.draft = edit(g.original, g.action, delta, size);
    g.moved ||= Math.abs(event.clientX - g.x) > 3 || Math.abs(event.clientY - g.y) > 10;
    if (g.moved) setDraft({ ...g.draft, action: g.action });
    if (!section && g.action === 'move') g.targetLane = document.elementsFromPoint(event.clientX, event.clientY).find(element => element.dataset.laneId)?.dataset.laneId;
  }
  function finish(event, cancel = false) {
    const g = gesture.current;if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && g.moved) void commit(g.draft, g.action, g.targetLane);else setDraft(null);
  }
  function key(event, action) {
    if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();event.stopPropagation();
    const direction = ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1;
    const size = section ? barSeconds(studio.bpm) : event.shiftKey ? .01 : snap || .1;
    studio.beginEditGesture('placement:' + clip.id);
    void commit(edit(window, action, direction * size, event.shiftKey && !section ? 0 : size), action);
  }
  const events = { onPointerMove: event => move(event), onPointerUp: event => finish(event), onPointerCancel: event => finish(event, true),
    onClick: event => event.stopPropagation(), onLostPointerCapture: () => { gesture.current = null;setDraft(null); }, onKeyUp: () => studio.endEditGesture('placement:' + clip.id), onBlur: () => studio.endEditGesture('placement:' + clip.id) };
  const color = section || sequenced ? 'beat' : clip.role === 'vocal' ? 'voice' : clip.role === 'nature' ? 'field' : 'audio';
  return <div className={'editor-region region-' + color + (selected ? ' is-selected' : '') + (clip.muted || section?.muted ? ' is-muted' : '')}
    style={{ left: timelinePosition(start, view) + '%', width: (end - start) / span * 100 + '%', top: 10 + row * 80 }} data-clip-id={section?.id || clip.id}>
    <svg className="editor-region-wave" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path d={path} /></svg>
    {current.fadeIn > 0 && <div className="editor-region-fade fade-left" style={{ left: (current.start - start) / (end - start) * 100 + '%', width: current.fadeIn / (end - start) * 100 + '%' }} />}
    {current.fadeOut > 0 && <div className="editor-region-fade fade-right" style={{ right: (end - current.end) / (end - start) * 100 + '%', width: current.fadeOut / (end - start) * 100 + '%' }} />}
    <div className="editor-region-body" role="button" tabIndex={disabled ? -1 : 0} aria-label={(section ? 'Beat ' : 'Clip ') + clip.name + ' at ' + clockTime(current.start, 2)} aria-pressed={selected}
      {...events} onFocus={() => onSelect(section?.id || clip.id)} onPointerDown={event => begin(event, 'move')} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault();event.stopPropagation();onInspect(section?.id || clip.id); } else key(event, 'move'); }} onClick={event => { event.stopPropagation();onSelect(section?.id || clip.id); }} onDoubleClick={() => onInspect(section?.id || clip.id)}>
      <strong>{clip.name}</strong><span>{clockTime(current.start, 2)}{clip.loop && !section ? ' · Loop' : ''}</span>
    </div>
    {selected && <>{['start', 'end'].filter(action => inView(current[action])).map(action => <div key={action} className={'editor-region-edge edge-' + action}
      role="slider" tabIndex={disabled ? -1 : 0} aria-label={clip.name + ' trim ' + action} aria-valuemin={0} aria-valuemax={300} aria-valuenow={current[action]} aria-valuetext={clockTime(current[action], 2)} {...events} onPointerDown={event => begin(event, action)} onKeyDown={event => key(event, action)} />)}
      {!section && <>{[['fadeIn', current.start + current.fadeIn], ['fadeOut', current.end - current.fadeOut]].filter(([, time]) => inView(time)).map(([action, time]) => <div key={action} className={'editor-region-fade-handle handle-' + action}
        role="slider" tabIndex={disabled ? -1 : 0} aria-label={clip.name + (action === 'fadeIn' ? ' fade in' : ' fade out')} aria-valuemin={0} aria-valuemax={length} aria-valuenow={current[action]}
        style={{ left: `clamp(12px, ${(time - start) / (end - start) * 100}%, calc(100% - 12px))` }} {...events} onPointerDown={event => begin(event, action)} onKeyDown={event => key(event, action)} />)}
        {inView(current.end) && <div className="editor-repeat-handle" role="slider" tabIndex={disabled ? -1 : 0} aria-label={'Extend loop of ' + clip.name} aria-valuemin={window.start + .05} aria-valuemax={300} aria-valuenow={current.end} title="Drag to repeat audio" {...events} onPointerDown={event => begin(event, 'repeat')} onKeyDown={event => key(event, 'repeat')}><Icon name="loop" size={14} /></div>}</>}
    </>}
  </div>;
}

function CycleStrip({ studio, view, snap }) {
  const [draft, setDraft] = useState(null), gesture = useRef(null);
  const loop = draft || studio.loopSection, span = view.end - view.start, duration = studio.arrangement.duration;
  function finish(event, cancel = false) {
    const g = gesture.current;if (!g || event.pointerId !== g.id) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && g.moved) void studio.setLoopSection(g.draft);
    setDraft(null);
  }
  function key(event, action) {
    if (studio.busy || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .01 : snap || .1);
    void studio.setLoopSection(editLoopRegion(loop, action, delta, duration, event.shiftKey ? 0 : snap));
  }
  const start = Math.max(loop.start, view.start), end = Math.min(loop.end, view.end);
  return <div className={'editor-cycle-strip' + (studio.loopSection.enabled ? ' cycle-active' : '')} aria-label="Playback cycle selection" role="group"
    onPointerDown={event => {
      if (studio.busy || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      const target = event.target.closest('[data-cycle]');target?.focus();
      const box = event.currentTarget.getBoundingClientRect();
      gesture.current = { id: event.pointerId, x: event.clientX, left: box.left, width: box.width, original: studio.loopSection, draft: studio.loopSection, action: target?.dataset.cycle || 'select', moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      const g = gesture.current;if (!g || g.id !== event.pointerId) return;
      const size = event.shiftKey ? 0 : snap;
      if (g.action === 'select') {
        const a = timelineTime((g.x - g.left) / g.width, view), b = timelineTime((event.clientX - g.left) / g.width, view);
        const round = value => size ? Math.round(value / size) * size : value;
        const first = clamp(round(Math.min(a, b)), 0, duration - MIN_LOOP_SECONDS);
        g.draft = { ...g.original, start: first, end: clamp(round(Math.max(a, b)), first + MIN_LOOP_SECONDS, duration) };
      } else g.draft = editLoopRegion(g.original, g.action, (event.clientX - g.x) / g.width * span, duration, size);
      g.moved ||= Math.abs(event.clientX - g.x) > 2;
      if (g.moved) setDraft(g.draft);
    }} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={() => { gesture.current = null;setDraft(null); }}>
    {end > start && <div className="editor-cycle-range" style={{ left: timelinePosition(start, view) + '%', width: (end - start) / span * 100 + '%' }}>
      <div data-cycle="move" role="button" tabIndex={studio.busy ? -1 : 0} aria-label="Move playback cycle" onKeyDown={event => key(event, 'move')}><Icon name="loop" size={12} /><span>{clockTime(loop.start, 1)} – {clockTime(loop.end, 1)}</span></div>
      {['start', 'end'].filter(action => loop[action] >= view.start && loop[action] <= view.end).map(action => <div key={action} className={'editor-cycle-edge cycle-' + action} data-cycle={action} role="slider" tabIndex={studio.busy ? -1 : 0} aria-label={'Cycle ' + action} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={loop[action]} onKeyDown={event => key(event, action)} />)}
    </div>}
  </div>;
}

export default function EditorTimeline({ studio, snap, onSnapChange, onImport, onLibrary, onBeats, onInspect, onSelection }) {
  const [viewport, setViewport] = useState({ start: 0, end: 30 });
  const [draggingFile, setDraggingFile] = useState(false);
  const rulerGesture = useRef(null);
  const duration = studio.arrangement.duration, view = timelineView(viewport, duration), span = view.end - view.start;
  const lanes = useMemo(() => editorLanes({ tracks: studio.tracks }), [studio.tracks]);
  const groups = useMemo(() => patternGroups(studio.tracks, studio.bpm).map(group => ({ ...group, displayClip: { ...group.rows[0], id: group.id, name: group.name } })), [studio.tracks, studio.bpm]);
  const selected = studio.selectedClipId;
  const selectedClip = studio.tracks.find(clip => clip.id === selected), selectedGroup = groups.find(group => group.id === selected);
  const activeWindow = selectedGroup?.placement || (selectedClip && clipWindow(selectedClip, studio));
  const step = [ .1, .25, .5, 1, 2, 5, 10, 15, 30, 60 ].find(value => span / value <= 10) || 60;
  const ticks = [];
  for (let time = Math.ceil(view.start / step) * step; time <= view.end + 1e-7; time += step) ticks.push(time);
  const beat = 60 / studio.bpm, grid = snap === 'beats' ? beat : snap === 'seconds' ? 1 : 0;
  const gridStep = snap === 'beats' && span / beat < 80 ? beat : step;
  const gridStyle = { '--grid-step': gridStep / span * 100 + '%', '--grid-offset': -((view.start % gridStep) / span * 100) + '%' };
  function select(id) { studio.selectClip(id);onSelection?.(id); }
  async function drop(event) {
    event.preventDefault();setDraggingFile(false);
    if (studio.busy) return;
    const lane = event.target.closest('.editor-lane') || event.currentTarget.querySelector('.editor-lane');
    const box = lane?.getBoundingClientRect();
    const raw = box ? timelineTime((event.clientX - box.left) / box.width, view) : studio.elapsed;
    const at = grid ? Math.round(raw / grid) * grid : raw;
    const id = event.dataTransfer.getData('application/x-naturemix-source');
    if (id) await studio.addSourceClip(id, at);
    else if (event.dataTransfer.files.length) await studio.importFiles([...event.dataTransfer.files], 'music', false, at);
  }
  function seek(event) {
    if (studio.busy) return;
    const box = event.currentTarget.getBoundingClientRect();
    void studio.seekPlayback(timelineTime((event.clientX - box.left) / box.width, view));
  }
  return <section className="editor-timeline" aria-label="Multitrack editor">
    <div className="editor-toolbar"><div className="editor-edit-actions">
      <button type="button" aria-label="Undo" title={'Undo · ' + (studio.historyStatus.undo || 'Ctrl+Z')} disabled={studio.busy || !studio.historyStatus.undo} onClick={studio.undo}>↶</button>
      <button type="button" aria-label="Redo" title={'Redo · ' + (studio.historyStatus.redo || 'Ctrl+Shift+Z')} disabled={studio.busy || !studio.historyStatus.redo} onClick={studio.redo}>↷</button><span className="toolbar-divider" />
      <button type="button" disabled={studio.busy || !selectedClip || isSequenced(selectedClip)} title="Split selected clip at playhead · S" onClick={() => studio.splitClip(selected)}>Split</button>
      <button type="button" disabled={studio.busy || (!selectedClip && !selectedGroup)} title="Duplicate after selected clip · Ctrl+D" onClick={async () => {
        if (selectedGroup) await studio.updatePatternSection(selectedGroup.id, {}, 'copy');
        else await studio.duplicateSelectedClipAt(selected, activeWindow.end);
      }}>Duplicate</button>
      <button type="button" className="editor-delete" aria-label="Delete selected clip" title="Delete selected clip" disabled={studio.busy || (!selectedClip && !selectedGroup)} onClick={() => selectedGroup ? studio.updatePatternSection(selectedGroup.id, {}, 'remove') : studio.removeTrack(selected)}><Icon name="trash" size={16} /></button>
      <button type="button" disabled={!selectedClip && !selectedGroup} onClick={() => onInspect(selected)}>Edit clip</button>
    </div><div className="editor-view-actions"><label>Snap<select aria-label="Timeline snap" value={snap} onChange={event => onSnapChange(event.target.value)}><option value="beats">Beats</option><option value="seconds">Seconds</option><option value="off">Off</option></select></label>
      <div className="editor-zoom"><button type="button" aria-label="Zoom out timeline" disabled={span >= duration} onClick={() => setViewport(zoomTimeline(view, duration, 2, studio.elapsed))}>−</button><button type="button" aria-label="Zoom in timeline" disabled={span <= .25} onClick={() => setViewport(zoomTimeline(view, duration, .5, studio.elapsed))}>+</button></div>
      <button type="button" onClick={() => setViewport({ start: 0, end: duration })}>Fit song</button>
      {activeWindow && <button type="button" onClick={() => setViewport(fitTimelineSelection(activeWindow, duration))}>Fit clip</button>}
    </div></div>
    <div className={'editor-timeline-scroll' + (draggingFile ? ' file-drag-over' : '')} onDragOver={event => { if (!studio.busy) { event.preventDefault();event.dataTransfer.dropEffect = 'copy';setDraggingFile(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDraggingFile(false); }} onDrop={drop}>
      <div className="editor-timeline-ruler"><div className="editor-track-corner"><span>Tracks</span><button type="button" aria-label="Add audio track" title="Add audio track" onClick={onLibrary}><Icon name="plus" size={16} /></button></div>
        <div className="editor-ruler-right"><CycleStrip studio={studio} view={view} snap={grid} /><div className="editor-time-ruler" role="slider" tabIndex={0} aria-label="Song playhead" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.min(studio.elapsed, duration)} aria-valuetext={clockTime(studio.elapsed, 2)}
          onPointerDown={event => { if (studio.busy || (event.pointerType === 'mouse' && event.button !== 0)) return;event.preventDefault();rulerGesture.current = event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);seek(event); }}
          onPointerMove={event => { if (rulerGesture.current === event.pointerId) seek(event); }} onPointerUp={event => { rulerGesture.current = null;if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { rulerGesture.current = null; }} onLostPointerCapture={() => { rulerGesture.current = null; }}
          onKeyDown={event => { const delta = event.shiftKey ? .1 : 5;if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault();void studio.seekPlayback(clamp(event.key === 'Home' ? 0 : event.key === 'End' ? duration : studio.elapsed + (event.key === 'ArrowLeft' ? -delta : delta), 0, duration)); } }}>
          {ticks.map(time => <span className="editor-time-tick" key={time} style={{ left: timelinePosition(time, view) + '%' }}>{clockTime(time, step < 1 ? 1 : 0)}</span>)}
          {(studio.elapsed < view.start || studio.elapsed > view.end) && <button type="button" className={'editor-locate-playhead' + (studio.elapsed < view.start ? ' locate-left' : '')} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation();setViewport(timelineView({ start: Math.max(0, studio.elapsed - span / 3), end: Math.max(0, studio.elapsed - span / 3) + span }, duration)); }}>Show playhead {studio.elapsed < view.start ? '←' : '→'}</button>}
          {studio.elapsed >= view.start && studio.elapsed <= view.end && <span className="editor-ruler-head" style={{ left: timelinePosition(studio.elapsed, view) + '%' }} />}
        </div></div></div>
      <div className="editor-track-rows">
      {lanes.map((lane, index) => {
        const clips = stackedClips(lane.clips, studio), count = Math.max(1, ...clips.map(item => item.row + 1));
        return <div className={'editor-track-row' + (lane.clips.some(clip => clip.id === selected) ? ' selected-track' : '')} key={lane.id} style={{ minHeight: Math.max(106, count * 80 + 20) }}>
          <div className="editor-track-header"><div className="editor-track-name"><span className={'editor-track-number track-color-' + lane.role}>{String(index + 1).padStart(2, '0')}</span><strong title={lane.name}>{lane.name}</strong><details className="editor-track-menu"><summary aria-label={'Options for track ' + lane.name}>⋯</summary><div><button type="button" disabled={studio.busy} onClick={() => { const value = window.prompt('Track name', lane.name);if (value) studio.updateLane(lane.id, { name: value }); }}>Rename track</button><button type="button" disabled={studio.busy} onClick={() => { if (window.confirm('Delete this track and all its clips? You can undo this.')) void studio.removeLane(lane.id); }}>Delete track</button></div></details></div>
            <div className="editor-track-routing"><button type="button" aria-label={'Mute track ' + lane.name} aria-pressed={lane.muted} disabled={studio.busy} onClick={() => studio.updateLane(lane.id, { muted: !lane.muted })}>M</button><button type="button" aria-label={'Solo track ' + lane.name} aria-pressed={lane.solo} disabled={studio.busy} onClick={() => studio.updateLane(lane.id, { solo: !lane.solo })}>S</button><label><span className="sr-only">{lane.name} volume</span><input {...historyGesture(studio, 'lane-level:' + lane.id)} type="range" min="0" max="100" value={lane.volume} aria-label={lane.name + ' track volume'} style={{ '--level': lane.volume + '%' }} disabled={studio.busy} onChange={event => studio.updateLane(lane.id, { volume: Number(event.target.value) })} /></label><output>{lane.volume}%</output></div>
          </div><div className="editor-lane" data-lane-id={lane.id} style={gridStyle} onClick={seek}>
            {clips.map(({ clip, window, row }) => <EditorRegion key={clip.id} clip={clip} window={window} row={row} studio={studio} view={view} snap={grid} selected={selected === clip.id} onSelect={select} onInspect={onInspect} />)}
            {studio.elapsed >= view.start && studio.elapsed <= view.end && <div className="editor-lane-playhead" style={{ left: timelinePosition(studio.elapsed, view) + '%' }} />}
          </div></div>;
      })}
      {groups.map((group, index) => <div className={'editor-track-row beat-track' + (selected === group.id ? ' selected-track' : '')} key={group.id}>
        <div className="editor-track-header"><div className="editor-track-name"><span className="editor-track-number track-color-beat">{String(lanes.length + index + 1).padStart(2, '0')}</span><strong>{group.name}</strong><button type="button" aria-label={'Edit ' + group.name + ' beat'} onClick={() => { select(group.id);onBeats(group.id); }}><Icon name="rhythm" size={16} /></button></div><div className="editor-track-routing"><button type="button" aria-label={'Mute beat ' + group.name} aria-pressed={group.muted} disabled={studio.busy} onClick={() => studio.updatePatternSection(group.id, { muted: !group.muted })}>M</button><button type="button" aria-label={'Solo beat ' + group.name} aria-pressed={group.rows.every(row => row.solo)} disabled={studio.busy} onClick={() => studio.soloPatternSection(group.id)}>S</button><label><span className="sr-only">{group.name} volume</span><input {...historyGesture(studio, 'block-level:' + group.id)} type="range" min="0" max="100" value={group.volume} aria-label={group.name + ' beat volume'} style={{ '--level': group.volume + '%' }} disabled={studio.busy} onChange={event => studio.updatePatternSection(group.id, { volume: Number(event.target.value) })} /></label><output>{group.volume}%</output></div></div>
        <div className="editor-lane" style={gridStyle} onClick={seek}><EditorRegion clip={group.displayClip} window={group.placement} section={group} studio={studio} view={view} snap={barSeconds(studio.bpm)} selected={selected === group.id} onSelect={select} onInspect={id => onBeats(id)} />{studio.elapsed >= view.start && studio.elapsed <= view.end && <div className="editor-lane-playhead" style={{ left: timelinePosition(studio.elapsed, view) + '%' }} />}</div>
      </div>)}
      {!studio.tracks.length ? <div className="editor-empty"><span className="editor-empty-icon"><Icon name="timeline" size={32} /></span><h1>Start with a sound.</h1><p>Drop audio here, record a track, or make a beat.</p><div><button type="button" className="editor-primary" disabled={studio.busy} onClick={onImport}><Icon name="upload" size={17} />Import audio</button><button type="button" disabled={studio.busy} onClick={() => onBeats()}>Make a beat</button></div></div>
        : <div className="editor-add-track-row"><button type="button" disabled={studio.busy} onClick={onLibrary}><Icon name="plus" size={15} />Add track</button><div className="editor-lane editor-empty-lane" style={gridStyle} onClick={seek}><span>Drop an audio file to add another track</span>{studio.elapsed >= view.start && studio.elapsed <= view.end && <div className="editor-lane-playhead" style={{ left: timelinePosition(studio.elapsed, view) + '%' }} />}</div></div>}
      </div>
    </div>
    <div className="editor-timeline-footer"><span>{lanes.length + groups.length} tracks · {studio.tracks.filter(clip => !clip.patternBlock).length + groups.length} clips</span><div><button type="button" aria-label="Pan timeline left" disabled={view.start <= 0} onClick={() => setViewport(panTimeline(view, duration, -1))}>←</button><span>{clockTime(view.start, 1)} – {clockTime(view.end, 1)}</span><button type="button" aria-label="Pan timeline right" disabled={view.end >= duration} onClick={() => setViewport(panTimeline(view, duration, 1))}>→</button></div><span className="editor-shortcut-hint">Space: play · S: split · Shift: fine drag</span></div>
  </section>;
}
