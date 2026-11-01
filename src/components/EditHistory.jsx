import { selectedPart } from '../lib/patternSections.js';
export default function EditHistory({ studio }) {
  const disabled = studio.busy;
  const selected = selectedPart(studio, studio.selectedClipId);
  return <div className="edit-history" aria-label="Edit history and selection">
    <div className="history-buttons" role="group" aria-label="Undo and redo">
      <button type="button" disabled={disabled || !studio.historyStatus.undo} onClick={studio.undo} title={studio.historyStatus.undo ? 'Undo ' + studio.historyStatus.undo + ' · Ctrl/⌘ Z' : 'Nothing to undo'} aria-label={studio.historyStatus.undo ? 'Undo ' + studio.historyStatus.undo : 'Undo'}>Undo</button>
      <button type="button" disabled={disabled || !studio.historyStatus.redo} onClick={studio.redo} title={studio.historyStatus.redo ? 'Redo ' + studio.historyStatus.redo + ' · Ctrl/⌘ Shift Z' : 'Nothing to redo'} aria-label={studio.historyStatus.redo ? 'Redo ' + studio.historyStatus.redo : 'Redo'}>Redo</button>
    </div>
    {selected && <output className="selected-clip-label" aria-label="Selected clip" title={selected.name}>Selected · {selected.name}</output>}
  </div>;
}
