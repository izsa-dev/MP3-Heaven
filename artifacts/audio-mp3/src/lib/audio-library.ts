export type AudioTrack = {
  videoId: string;
  title: string;
  authorName: string;
  thumbnailUrl: string;
  embedUrl: string;
  sourceUrl: string;
  filename: string;
  downloadedAt: number;
  blob: Blob;
};

const DB_NAME = 'audio-mp3-library';
const STORE_NAME = 'tracks';

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Este navegador no permite guardar audio en la biblioteca.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la biblioteca.'));
  });
}

export async function readTracks(): Promise<AudioTrack[]> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      db.close();
      resolve((request.result as AudioTrack[]).sort((a, b) => b.downloadedAt - a.downloadedAt));
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('No se pudo leer la biblioteca.'));
    };
  });
}

export async function readTrack(videoId: string): Promise<AudioTrack | undefined> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(videoId);
    request.onsuccess = () => {
      db.close();
      resolve(request.result as AudioTrack | undefined);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('No se pudo buscar el audio guardado.'));
    };
  });
}

export async function saveTrack(track: AudioTrack): Promise<void> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(track);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('No se pudo guardar el audio.'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('No se pudo guardar el audio.'));
    };
  });
}
