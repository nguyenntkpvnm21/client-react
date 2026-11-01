import { referencedAudio } from './savedMixes.js';
import { serializeMix } from './studioState.js';

export const HISTORY_LIMIT = 50;
const snapshot = (mix, selectedId, label) => ({ mix: serializeMix(mix), selectedId, label });
const equivalent = (left, right) => {
  const a = serializeMix(left), b = serializeMix(right);
  a.arrangement.enabled = b.arrangement.enabled;
  return JSON.stringify(a) === JSON.stringify(b);
};

// Only metadata and source IDs are retained. AudioBuffer/File objects never enter history.
export class MixHistory {
  constructor(limit = HISTORY_LIMIT) { this.limit = limit;this.past = [];this.future = [];this.gesture = null;this.serial = 0; }
  begin(key) { if (this.gesture?.key !== key) this.gesture = { key, serial: ++this.serial, recorded: false }; }
  end(key) { if (!key || this.gesture?.key === key) this.gesture = null; }
  record(before, after, { label = 'Edit mix', key, selectedId = null } = {}) {
    if (equivalent(before, after)) return false;
    const gesture = this.gesture?.key === key ? this.gesture : null;
    if (!gesture?.recorded) {
      this.past.push(snapshot(before, selectedId, label));
      if (this.past.length > this.limit) this.past.shift();
    }
    if (gesture) gesture.recorded = true;
    else this.end();
    this.future = [];
    return true;
  }
  peek(direction) { return (direction === 'undo' ? this.past : this.future).at(-1); }
  apply(direction, current, selectedId) {
    this.end();
    const from = direction === 'undo' ? this.past : this.future;
    const to = direction === 'undo' ? this.future : this.past;
    const entry = from.pop();
    if (!entry) return null;
    to.push(snapshot(current, selectedId, entry.label));
    return { ...entry, mix: { ...entry.mix, arrangement: { ...entry.mix.arrangement, enabled: current.arrangement.enabled } } };
  }
  clear() { this.past = [];this.future = [];this.end(); }
  audioIds() { return referencedAudio({ sources: [...this.past, ...this.future].flatMap(entry => entry.mix.sources), tracks: [] }, []); }
  status() { return { undo: this.past.at(-1)?.label || null, redo: this.future.at(-1)?.label || null }; }
}
