let connection;

function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('naturemix-audio-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
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
