import { MAX_FILE_BYTES, MAX_TRACKS } from '../data/sounds.js';
import { mixName } from './savedMixes.js';
import { serializeMix, validateMix } from './studioState.js';

const MAGIC = new TextEncoder().encode('NMIXPK01');
const HEADER_BYTES = 12;
const MAX_MANIFEST_BYTES = 256 * 1024;
export const MAX_BACKUP_BYTES = HEADER_BYTES + MAX_MANIFEST_BYTES + MAX_TRACKS * MAX_FILE_BYTES;
const invalid = () => new Error('This project file is damaged or unsupported. Your mixes have been kept.');
const digest = async (blob) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');
const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
function checkCanceled(signal) { if (signal?.aborted) throw new DOMException('Project transfer canceled.', 'AbortError'); }

export function backupFilename(name) {
  return (mixName(name).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'NatureMix') + '.naturemix';
}

// Audio stays as its original compressed bytes. No base64 or PCM decoding is needed.
export async function createProjectBackup({ mix, name, resolveAudio, signal, onProgress = () => {} }) {
  checkCanceled(signal);
  const snapshot = serializeMix(mix);
  // A portable project must not depend on future catalog IDs, names or defaults.
  const portable = { ...snapshot, tracks: snapshot.tracks.map((track, index) => ({ ...track, id: 'custom-backup-' + index, catalogId: null })) };
  const assets = [], blobs = [];
  for (const track of snapshot.tracks) {
    checkCanceled(signal);
    onProgress({ stage: 'Packing ' + track.name, progress: assets.length / Math.max(1, snapshot.tracks.length) });
    const blob = await resolveAudio(track);
    if (!(blob instanceof Blob)) throw new Error('The original audio for ' + track.name + ' is missing. No backup was created.');
    if (!blob.size || blob.size > MAX_FILE_BYTES) throw new Error(track.name + ' must be between 1 byte and 30 MiB to back up.');
    assets.push({ trackId: portable.tracks[assets.length].id, size: blob.size, type: blob.type || 'application/octet-stream', sha256: await digest(blob) });
    checkCanceled(signal);
    blobs.push(blob);
  }
  const manifest = new TextEncoder().encode(JSON.stringify({ format: 'naturemix-project', version: 1,
    name: mixName(name), createdAt: new Date().toISOString(), mix: portable, assets }));
  if (manifest.length > MAX_MANIFEST_BYTES) throw invalid();
  const header = new Uint8Array(HEADER_BYTES);header.set(MAGIC);
  new DataView(header.buffer).setUint32(8, manifest.length);
  onProgress({ stage: 'Project ready', progress: 1 });
  return new Blob([header, manifest, ...blobs], { type: 'application/octet-stream' });
}

export async function inspectProjectBackup(file, onProgress = () => {}, signal) {
  checkCanceled(signal);
  if (!(file instanceof Blob) || file.size < HEADER_BYTES || file.size > MAX_BACKUP_BYTES) throw invalid();
  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  if (!MAGIC.every((byte, index) => byte === header[index])) throw invalid();
  const length = new DataView(header.buffer).getUint32(8);
  if (!length || length > MAX_MANIFEST_BYTES || HEADER_BYTES + length > file.size) throw invalid();
  let manifest;
  try { manifest = JSON.parse(await file.slice(HEADER_BYTES, HEADER_BYTES + length).text()); } catch { throw invalid(); }
  const mix = validateMix(manifest?.mix);
  if (manifest?.format !== 'naturemix-project' || manifest.version !== 1 || !mix
    || canonical(serializeMix(mix)) !== canonical(manifest.mix) || !Array.isArray(manifest.assets)
    || manifest.assets.length !== mix.tracks.length || typeof manifest.createdAt !== 'string'
    || !Number.isFinite(Date.parse(manifest.createdAt))) throw invalid();
  const name = mixName(manifest.name);
  let offset = HEADER_BYTES + length;
  const files = new Map();
  for (const asset of manifest.assets) {
    checkCanceled(signal);
    const track = mix.tracks.find((item) => item.id === asset?.trackId);
    if (!track || files.has(track.id) || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_FILE_BYTES
      || typeof asset.type !== 'string' || asset.type.length > 160 || !/^[a-f0-9]{64}$/.test(asset.sha256)
      || offset + asset.size > file.size) throw invalid();
    onProgress({ stage: 'Checking ' + track.name, progress: files.size / Math.max(1, mix.tracks.length) });
    const blob = file.slice(offset, offset + asset.size, asset.type);
    if (await digest(blob) !== asset.sha256) throw new Error('Audio integrity check failed for ' + track.name + '. Choose an intact backup.');
    checkCanceled(signal);
    files.set(track.id, blob);offset += asset.size;
  }
  if (offset !== file.size) throw invalid();
  checkCanceled(signal);
  onProgress({ stage: 'Ready to restore', progress: 1 });
  return { name, mix: serializeMix(mix), files, bytes: file.size };
}

export function restoredProject(backup, name, uuid = () => crypto.randomUUID()) {
  const files = new Map();
  const tracks = backup.mix.tracks.map((track) => {
    // Included audio becomes a private imported layer, independent of future library changes.
    const id = 'custom-' + uuid();
    const blob = backup.files.get(track.id);
    if (!(blob instanceof Blob)) throw invalid();
    const file = new File([blob], track.name, { type: blob.type });
    files.set(id, file);
    return { ...track, id, catalogId: null };
  });
  return { id: 'mix-' + uuid(), name: mixName(name), mix: serializeMix({ ...backup.mix, tracks }), files };
}
