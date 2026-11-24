export function openRehearsalStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('presso-rehearsals', 3);
    request.onupgradeneeded = ({ oldVersion }) => {
      const db = request.result;
      if (oldVersion < 1) db.createObjectStore('runs', { keyPath: 'id' }).createIndex('deckId', 'deckId');
      if (oldVersion < 2) db.createObjectStore('audio', { keyPath: ['runId', 'index'] });
      if (oldVersion < 3) db.createObjectStore('speech', { keyPath: ['runId', 'index'] });
    };
    request.onblocked = () => reject(new Error('Close other Presso tabs and try again.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve({
        get: (id) => read(db.transaction('runs').objectStore('runs').get(id)),
        list: (deckId) => read(db.transaction('runs').objectStore('runs').index('deckId').getAll(deckId)),
        save: (run) => write(db, ['runs'], (tx) => tx.objectStore('runs').put(run)),
        saveAudio: (runId, index, samples) => write(db, ['audio'], (tx) => tx.objectStore('audio').put({ runId, index, pcm: new Blob([samples]) })),
        countAudio: (runId) => read(db.transaction('audio').objectStore('audio').count(audioRange(runId))),
        readAudio: (runId, first, last) => read(db.transaction('audio').objectStore('audio').getAll(audioRange(runId, first, last))),
        async readTranscript(runId) {
          const tx = db.transaction(['runs', 'speech']);
          const [run, segments] = await Promise.all([
            read(tx.objectStore('runs').get(runId)),
            read(tx.objectStore('speech').getAll(audioRange(runId)))
          ]);
          return { run, segments };
        },
        saveSpeech: (runId, transcript, segment) => write(db, ['runs', 'speech'], (tx) => {
          const runs = tx.objectStore('runs');
          const request = runs.get(runId);
          request.onsuccess = () => {
            const run = request.result;
            if (!run?.audio) {
              tx.abort();
              return;
            }
            if (segment) tx.objectStore('speech').put({ runId, ...segment });
            run.transcript = transcript;
            runs.put(run);
          };
        }),
        deleteAudio: (runId) => write(db, ['audio', 'runs', 'speech'], (tx) => {
          const runs = tx.objectStore('runs');
          const request = runs.get(runId);
          request.onsuccess = () => {
            const run = request.result;
            if (!run) return;
            delete run.audio;
            delete run.transcript;
            runs.put(run);
            tx.objectStore('audio').delete(audioRange(runId));
            tx.objectStore('speech').delete(audioRange(runId));
          };
        })
      });
    };
    request.onerror = () => reject(request.error);
  });
}

function audioRange(runId, first = 0, last = Infinity) {
  return IDBKeyRange.bound([runId, first], [runId, last]);
}

function read(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function write(db, stores, update) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    update(transaction);
  });
}
