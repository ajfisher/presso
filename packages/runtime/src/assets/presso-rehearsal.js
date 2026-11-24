import { setupTimingReview } from './presso-rehearsal-timing.js';

export function setupRehearsal(deckId, slides, currentIndex) {
  const controls = document.querySelector('[data-control-row="rehearsal"]');
  const dialog = document.querySelector('[data-rehearsal]');
  const toggle = controls.querySelector('[data-rehearsal-toggle]');
  const open = controls.querySelector('[data-rehearsal-open]');
  const elapsed = controls.querySelector('[data-rehearsal-elapsed]');
  const reload = controls.querySelector('[data-rehearsal-reload]');
  const status = controls.querySelector('[data-rehearsal-status]');
  const runPicker = dialog.querySelector('[data-rehearsal-run]');
  let database;
  let active;
  let captureReady = false;
  let reloadPending = false;
  let runs = [];
  const timingReview = setupTimingReview(dialog, deckId, slides, formatClock, () => {
    reloadPending = true;
    toggle.disabled = true;
    status.textContent = 'Reload the deck to use the saved targets.';
  });

  openDatabase().then((db) => {
    database = db;
    toggle.disabled = !canStart();
    open.disabled = false;
  }).catch(() => {
    status.textContent = 'Chrome could not open storage for rehearsals.';
  });

  function canStart() {
    return Boolean(database && captureReady && slides.length && navigator.locks && !reloadPending);
  }

  function resetControls(timer) {
    window.clearInterval(timer);
    active = undefined;
    elapsed.hidden = true;
    reload.hidden = !reloadPending;
    toggle.textContent = 'Start timing';
    toggle.disabled = !canStart();
    open.disabled = false;
  }

  async function start() {
    if (!canStart()) return;
    toggle.disabled = true;
    open.disabled = true;
    let timer;
    try {
      await navigator.locks.request(`presso:rehearsal:${deckId}`, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('A rehearsal is already running in another tab.');
        const slide = slides[currentIndex()];
        const run = {
          id: crypto.randomUUID(),
          deckId,
          startedAt: Date.now(),
          slideIds: slides.map(({ id }) => id),
          visits: [slideVisit(slide, 0)],
          finishedMs: null
        };
        const started = performance.now();
        const { promise, resolve } = Promise.withResolvers();
        active = { run, started, finish: resolve };
        await putRun(database, run);
        toggle.textContent = 'Stop timing';
        elapsed.hidden = false;
        updateElapsed();
        timer = window.setInterval(updateElapsed, 250);
        toggle.disabled = false;
        document.querySelector('[data-current-notes]')?.focus({ preventScroll: true });
        status.textContent = 'Timing rehearsal';
        await promise;
      });
    } catch (error) {
      status.textContent = error?.message || 'Could not start the rehearsal.';
    } finally {
      resetControls(timer);
    }
  }

  async function stop() {
    const capture = active;
    toggle.disabled = true;
    const finish = performance.now() - capture.started;
    capture.run.finishedMs = capture.run.interrupted ? null : finish;
    try {
      await putRun(database, capture.run);
      status.textContent = capture.run.interrupted ? 'Partial rehearsal saved. Reload the deck to start again.' : 'Rehearsal saved.';
    } catch {
      status.textContent = 'The rehearsal ended before its finish time could be saved.';
    } finally {
      capture.finish();
    }
  }

  function updateElapsed() {
    elapsed.textContent = formatClock(performance.now() - active.started);
  }

  toggle.addEventListener('click', () => active ? stop() : start());
  reload.addEventListener('click', () => location.reload());
  open.addEventListener('click', async () => {
    open.disabled = true;
    try {
      runs = (await getRuns(database, deckId)).sort((a, b) => b.startedAt - a.startedAt);
      runPicker.replaceChildren(...runs.map((run) => new Option(new Date(run.startedAt).toLocaleString(), run.id)));
      showHistory(runs[0]);
      open.disabled = false;
      open.focus({ preventScroll: true });
      dialog.showModal();
    } catch {
      status.textContent = 'Could not load saved rehearsals.';
    } finally {
      open.disabled = false;
    }
  });
  runPicker.addEventListener('change', () => showHistory(runs.find((run) => run.id === runPicker.value)));
  dialog.addEventListener('close', () => {
    reload.hidden = !reloadPending;
  });

  function showHistory(run) {
    dialog.querySelector('[data-rehearsal-empty]').hidden = Boolean(run);
    dialog.querySelector('[data-rehearsal-history]').hidden = !run;
    timingReview.show(run);
    if (!run) return;
    dialog.querySelector('[data-rehearsal-summary]').textContent = run.finishedMs === null
      ? 'Incomplete rehearsal. Only the visits saved so far are shown.'
      : `Run length ${formatClock(run.finishedMs)}`;
    const rows = run.visits.map((visit, index) => {
      const end = run.visits[index + 1]?.startMs ?? run.finishedMs;
      const row = document.createElement('tr');
      for (const value of [visit.title, formatClock(visit.startMs), formatClock(end), formatClock(end === null ? null : end - visit.startMs)]) {
        row.insertCell().textContent = value;
      }
      return row;
    });
    dialog.querySelector('[data-rehearsal-visits]').replaceChildren(...rows);
  }

  return {
    get capturing() { return Boolean(active); },
    enableCapture() {
      if (captureReady) return;
      captureReady = true;
      toggle.disabled = !canStart();
    },
    visit(slide) {
      const capture = active;
      if (!capture || !slide || capture.run.interrupted || capture.run.finishedMs !== null) return;
      capture.run.visits.push(slideVisit(slide, performance.now() - capture.started));
      putRun(database, capture.run).catch(() => {
        status.textContent = 'Timing stopped because Chrome could not save a slide visit.';
        capture.finish();
      });
    },
    interruptTimeline() {
      if (!active || active.run.interrupted) return;
      reloadPending = true;
      active.run.interrupted = true;
      status.textContent = 'Deck order changed. Earlier visits are saved.';
    },
    deferReload() {
      if (!active && !dialog.open) return false;
      reloadPending = true;
      if (!active) toggle.disabled = true;
      if (!active?.run.interrupted) status.textContent = 'Deck changes are ready to reload.';
      return true;
    }
  };
}

function slideVisit(slide, startMs) {
  return { slideId: slide.id, title: slide.title, startMs };
}

export function formatClock(ms) {
  if (ms === null) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const tail = String(seconds % 60).padStart(2, '0');
  return minutes < 60 ? `${minutes}:${tail}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('presso-rehearsals', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('runs', { keyPath: 'id' }).createIndex('deckId', 'deckId');
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error);
  });
}

function putRun(database, run) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('runs', 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore('runs').put(run);
  });
}

function getRuns(database, deckId) {
  return new Promise((resolve, reject) => {
    const request = database.transaction('runs').objectStore('runs').index('deckId').getAll(deckId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
