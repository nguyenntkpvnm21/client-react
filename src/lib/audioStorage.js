import { changeProject, referencedAudio, validateProject, validateProjects } from './savedMixes.js';

let connection;

function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('naturemix-audio-v1', 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('files')) database.createObjectStore('files', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('mixes')) database.createObjectStore('mixes', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error || new Error('Audio storage is unavailable.'));
    request.onblocked = () => reject(new Error('Close other NatureMix tabs and try again.'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); connection = undefined; };
      resolve(database);
    };
  }).catch((error) => { connection = undefined; throw error; });
  return connection;
}

export async function readAudio(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction('files', 'readonly').objectStore('files').get(id);
    request.onsuccess = () => resolve(request.result?.file || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeAudio(action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('files', 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Unable to save audio.'));
    transaction.onabort = () => reject(transaction.error || new Error('Audio storage transaction was canceled.'));
    action(transaction.objectStore('files'));
  });
}

export const saveAudio = (id, file) => writeAudio((store) => store.put({ id, file }));
export const deleteAudio = (id) => writeAudio((store) => store.delete(id));

export async function readSavedMixes() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction('mixes', 'readonly').objectStore('mixes').getAll();
    request.onsuccess = () => {
      try { resolve(validateProjects(request.result)); } catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error);
  });
}

// Project records and their file references are checked in one transaction.
export async function writeSavedMix(action, data) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['files', 'mixes'], 'readwrite');
    const projects = transaction.objectStore('mixes');
    let result;
    let failure;
    const abort = (error) => { failure = error; transaction.abort(); };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = transaction.onerror = () => reject(failure || transaction.error || new Error('Unable to save mixes. Try again.'));
    const request = projects.getAll();
    request.onsuccess = () => {
      try {
        result = changeProject(request.result, action, data);
        if (action === 'delete') { projects.delete(data.id); return; }
        const project = result.find((item) => item.id === data.id);
        const ids = action === 'rename' ? [] : [...referencedAudio(project.mix.tracks, [])];
        const put = () => { try { projects.put(project); } catch (error) { abort(error); } };
        if (!ids.length) { put(); return; }
        let remaining = ids.length;
        ids.forEach((id) => {
          const fileRequest = transaction.objectStore('files').get(id);
          fileRequest.onsuccess = () => {
            if (!(fileRequest.result?.file instanceof Blob)) {
              abort(new Error('An imported sound is not saved in this browser. Keep this workspace and import the original file again.'));
              return;
            }
            remaining -= 1;
            if (!remaining) put();
          };
        });
      } catch (error) { abort(error); }
    };
  });
}

export async function readSavedMix(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['files', 'mixes'], 'readonly');
    let result;
    let failure;
    transaction.oncomplete = () => failure ? reject(failure) : resolve(result);
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Unable to open this saved mix.'));
    const request = transaction.objectStore('mixes').get(id);
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('This saved mix no longer exists. Reload the page to refresh the list.');
        const project = validateProject(request.result);
        result = { project, files: {} };
        for (const track of project.mix.tracks.filter((item) => !item.catalogId)) {
          const fileRequest = transaction.objectStore('files').get(track.id);
          fileRequest.onsuccess = () => {
            if (fileRequest.result?.file instanceof Blob) result.files[track.id] = fileRequest.result.file;
            else failure = new Error('An imported sound in this mix is missing. Your current workspace has been kept.');
          };
        }
      } catch (error) { failure = error; }
    };
  });
}

// A stored recording is reclaimed only after its final project/workspace reference is gone.
export async function deleteUnusedAudio(ids, workspaceTracks) {
  if (!ids.length) return;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['files', 'mixes'], 'readwrite');
    let failure;
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(failure || transaction.error || new Error('Unable to clean up local audio.'));
    const request = transaction.objectStore('mixes').getAll();
    request.onsuccess = () => {
      try {
        const retained = referencedAudio(workspaceTracks, validateProjects(request.result));
        for (const id of new Set(ids)) if (!retained.has(id)) transaction.objectStore('files').delete(id);
      } catch (error) { failure = error; transaction.abort(); }
    };
  });
}
