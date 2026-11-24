import { SAMPLE_RATE, setupAudioReview, setupMicrophone } from './presso-rehearsal-audio.js';
import { openRehearsalStore } from './presso-rehearsal-store.js';
import { setupTimingReview } from './presso-rehearsal-timing.js';

export function setupRehearsal(deckId, slides, currentIndex) {
  const controls = document.querySelector('[data-control-row="rehearsal"]');
  const dialog = document.querySelector('[data-rehearsal]');
  const toggle = controls.querySelector('[data-rehearsal-toggle]');
  const record = controls.querySelector('[data-rehearsal-record]');
  const inputLevel = controls.querySelector('[data-rehearsal-level]');
  const open = controls.querySelector('[data-rehearsal-open]');
  const elapsed = controls.querySelector('[data-rehearsal-elapsed]');
  const reload = controls.querySelector('[data-rehearsal-reload]');
  const status = controls.querySelector('[data-rehearsal-status]');
  const heading = dialog.querySelector('h2');
  const empty = dialog.querySelector('[data-rehearsal-empty]');
  const history = dialog.querySelector('[data-rehearsal-history]');
  const runPicker = dialog.querySelector('[data-rehearsal-run]');
  let store;
  let active;
  let captureReady = false;
  let starting = false;
  let reloadPending = false;
  let runs = [];
  const timingReview = setupTimingReview(dialog, deckId, slides, formatClock, () => {
    reloadPending = true;
    updateStartControls();
    status.textContent = 'Reload the deck to use the saved targets.';
  });

  const audioReview = setupAudioReview(dialog, () => store, deckId, (run) => {
    const option = runPicker.selectedOptions[0];
    if (option?.value === run.id) option.textContent = new Date(run.startedAt).toLocaleString();
    runPicker.focus();
  });
  const microphoneSetup = setupMicrophone(
    dialog,
    (mic) => void start(mic),
    (peak) => { inputLevel.value = peak; },
    () => {
      if (!active?.mic) return;
      if (!active.ready) active.audioError = 'The microphone disconnected. Check the input again.';
      else void stop('The microphone disconnected. Saved audio is available in Rehearsals.');
    }
  );

  openRehearsalStore().then((localStore) => {
    store = localStore;
    updateStartControls();
    open.disabled = false;
  }).catch(() => {
    status.textContent = 'Chrome could not open storage for rehearsals.';
  });

  function canStart() {
    return Boolean(store && captureReady && slides.length && navigator.locks && !reloadPending && !starting);
  }

  function updateStartControls() {
    toggle.disabled = !canStart();
    record.disabled = toggle.disabled || !navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode;
  }

  function resetControls(timer) {
    window.clearInterval(timer);
    active = undefined;
    starting = false;
    record.hidden = false;
    open.hidden = false;
    elapsed.hidden = true;
    inputLevel.hidden = true;
    reload.hidden = !reloadPending;
    toggle.textContent = 'Start timing';
    updateStartControls();
    open.disabled = false;
  }

  async function start(mic) {
    if (!canStart()) {
      mic?.close();
      if (dialog.open) microphoneSetup.failed('Reload the deck before recording.');
      return;
    }
    starting = true;
    updateStartControls();
    open.disabled = true;
    let timer;
    let capture;
    try {
      await navigator.locks.request(`presso:rehearsal:${deckId}`, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('A rehearsal is already running in another tab.');
        const requestedAt = performance.now();
        const slide = slides[currentIndex()];
        const run = {
          id: crypto.randomUUID(),
          deckId,
          startedAt: Date.now(),
          slideIds: slides.map(({ id }) => id),
          visits: [slideVisit(slide, 0)],
          finishedMs: null
        };
        if (mic) run.audio = { finished: false };
        const { promise, resolve } = Promise.withResolvers();
        capture = {
          mic, run, started: requestedAt, finish: resolve,
          runStored: Promise.withResolvers(), audioWrites: Promise.resolve(), nextChunk: 0, savedChunks: 0, samples: 0
        };
        active = capture;
        if (mic) {
          const sampleTime = await mic.start((samples) => saveAudio(capture, samples));
          if (capture.audioError) throw new Error(capture.audioError);
          capture.started = Math.max(requestedAt, Math.min(sampleTime, performance.now()));
          const offset = capture.started - requestedAt;
          const opening = run.visits.findLastIndex((visit) => visit.startMs <= offset);
          run.visits = run.visits.slice(opening).map((visit) => ({ ...visit, startMs: Math.max(0, visit.startMs - offset) }));
        }
        const storedVisits = run.visits.length;
        await store.save(run);
        capture.ready = true;
        if (run.visits.length !== storedVisits) await store.save(run);
        capture.runStored.resolve(true);
        if (capture.stopping || capture.audioError) {
          if (!capture.stopping) void stop(capture.audioError);
          await promise;
          return;
        }
        if (dialog.open) dialog.close();
        record.hidden = true;
        open.hidden = true;
        toggle.textContent = mic ? 'Stop recording' : 'Stop timing';
        elapsed.hidden = false;
        inputLevel.hidden = !mic;
        updateElapsed();
        timer = window.setInterval(updateElapsed, 250);
        toggle.disabled = false;
        document.querySelector('[data-current-notes]')?.focus({ preventScroll: true });
        status.textContent = mic ? `Recording from ${mic.label || 'the microphone'}` : 'Timing rehearsal';
        await promise;
      });
    } catch (error) {
      const message = error?.message || 'Could not start the rehearsal.';
      if (mic && dialog.open) microphoneSetup.failed(message);
      else status.textContent = message;
    } finally {
      capture?.runStored.resolve(false);
      if (mic) mic.close();
      resetControls(timer);
    }
  }

  function saveAudio(capture, samples) {
    if (!capture.run || capture.audioError) return;
    if (capture.nextChunk - capture.savedChunks >= 5) {
      capture.audioError = 'Chrome could not save audio quickly enough. Earlier audio is available in Rehearsals.';
      if (capture.ready && !capture.stopping) void stop(capture.audioError);
      return;
    }
    const index = capture.nextChunk++;
    capture.audioWrites = capture.audioWrites.then(async () => {
      if (!await capture.runStored.promise || capture.audioError) return;
      await store.saveAudio(capture.run.id, index, samples);
      capture.savedChunks += 1;
      capture.samples += samples.length;
    }).catch(() => {
      capture.audioError = 'Chrome could not save more audio. Earlier audio is available in Rehearsals.';
      if (capture.ready && !capture.stopping) void stop(capture.audioError);
    });
  }

  async function stop(reason) {
    const capture = active;
    if (!capture || capture.stopping) return;
    capture.stopping = true;
    toggle.disabled = true;
    const finish = Math.max(0, performance.now() - capture.started);
    if (capture.mic) {
      try {
        await capture.mic.stop();
      } catch {
        reason ??= 'The microphone ended early. Saved audio is available in Rehearsals.';
      }
      capture.mic.close();
      await capture.audioWrites;
      reason ??= capture.audioError;
      if (!reason && Math.abs(finish - capture.samples * 1000 / SAMPLE_RATE) > 1500) {
        reason = 'The audio timeline was interrupted. Saved audio is available in Rehearsals.';
      }
      capture.run.audio = { finished: !reason && capture.samples > 0, samples: capture.samples };
    }
    capture.run.finishedMs = capture.run.interrupted || reason ? null : finish;
    try {
      await store.save(capture.run);
      status.textContent = reason ?? (capture.run.interrupted
        ? 'Partial rehearsal saved. Reload the deck to start again.'
        : capture.mic ? 'Recording saved.' : 'Rehearsal saved.');
    } catch {
      status.textContent = 'Chrome could not save the rehearsal finish. Earlier visits and audio are available in Rehearsals.';
    } finally {
      capture.finish();
    }
  }

  function updateElapsed() {
    elapsed.textContent = formatClock(Math.max(0, performance.now() - active.started));
  }

  toggle.addEventListener('click', () => active ? stop() : start());
  reload.addEventListener('click', () => location.reload());
  record.addEventListener('click', () => {
    if (!canStart()) return;
    heading.textContent = 'Record talk';
    history.hidden = true;
    empty.hidden = true;
    microphoneSetup.show();
    dialog.showModal();
  });
  open.addEventListener('click', async () => {
    open.disabled = true;
    try {
      runs = (await store.list(deckId)).sort((a, b) => b.startedAt - a.startedAt);
      runPicker.replaceChildren(...runs.map((run) => new Option(
        new Date(run.startedAt).toLocaleString() + (run.audio ? ' · Recording' : ''), run.id
      )));
      heading.textContent = 'Rehearsals';
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
    microphoneSetup.hide();
    audioReview.clear();
    reload.hidden = !reloadPending;
  });

  function showHistory(run) {
    empty.hidden = Boolean(run);
    history.hidden = !run;
    void audioReview.show(run);
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
    get capturing() { return Boolean(active || starting); },
    enableCapture() {
      if (captureReady) return;
      captureReady = true;
      updateStartControls();
    },
    visit(slide) {
      const capture = active;
      if (!capture || !slide || capture.stopping || capture.run.interrupted) return;
      capture.run.visits.push(slideVisit(slide, Math.max(0, performance.now() - capture.started)));
      if (!capture.ready) return;
      store.save(capture.run).catch(() => {
        void stop('Chrome could not save a slide visit. Earlier visits are available in Rehearsals.');
      });
    },
    interruptTimeline() {
      if (!active || active.run.interrupted) return;
      reloadPending = true;
      active.run.interrupted = true;
      status.textContent = 'Deck order changed. Earlier visits are saved.';
    },
    deferReload() {
      if (!active && !starting && !dialog.open) return false;
      reloadPending = true;
      if (!active) updateStartControls();
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
