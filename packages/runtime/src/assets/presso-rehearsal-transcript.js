import { SAMPLE_RATE } from './presso-rehearsal-audio.js';

const LOCK = 'presso:transcription';
const ENGINE_READY = 'presso:transcription-ready:whisper-base.en:fa239a4';
const CHUNK_SAMPLES = SAMPLE_RATE * 2;
const STEP_SAMPLES = SAMPLE_RATE * 24;
const OVERLAP_SAMPLES = SAMPLE_RATE * 2;

export function setupTranscription(dialog, deckId, store, progress, formatClock) {
  const preparation = dialog.querySelector('[data-transcript-preparation]');
  const prepare = preparation.querySelector('button');
  const setupStatus = preparation.querySelector('[role="status"]');
  const controls = dialog.querySelector('[data-transcript-commands]');
  const start = controls.querySelector('[data-transcript-start]');
  const exportButton = controls.querySelector('[data-transcript-export]');
  const transcriptStatus = controls.querySelector('[role="status"]');
  let selected;
  let job;

  function show(run) {
    selected = run;
    controls.hidden = !run?.audio;
    syncControls();
    if (!run?.audio) return;
    void store().get(run.id).then((latest) => {
      if (selected !== run || !latest) return;
      if (!latest.audio) {
        controls.hidden = true;
        selected = undefined;
        return;
      }
      run.transcript = latest.transcript;
      syncControls();
    }).catch(() => {});
  }

  function syncControls() {
    if (!selected?.audio) return;
    const state = selected.transcript;
    const processing = job?.id === selected.id;
    start.disabled = state?.state === 'done' || Boolean(job && !processing);
    start.hidden = state?.state === 'done';
    start.textContent = processing ? 'Pause transcription'
      : (state?.next || state?.state === 'paused') ? 'Resume transcription' : 'Transcribe in English';
    exportButton.hidden = state?.state !== 'done';
    transcriptStatus.textContent = processing ? (job.message ?? state?.message ?? '')
      : state?.message ?? (job ? 'Another rehearsal is being transcribed.' : '');
  }

  function reportJob(message) {
    job.message = message;
    progress.textContent = message;
    syncControls();
  }

  async function prepareModel() {
    if (job) return;
    prepare.disabled = true;
    try {
      await navigator.locks.request(LOCK, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('Wait for transcription to finish in the other tab.');
        const controller = new AbortController();
        const engine = await speechEngine(controller.signal, (message) => { setupStatus.textContent = message; });
        engine.close();
        rememberCachedEngine(engine);
        setupStatus.textContent = engine.offlineReady ? 'English transcription is ready for offline use.'
          : 'Chrome could not keep every model file. Prepare transcription again before working offline.';
      });
    } catch (error) {
      setupStatus.textContent = error?.message ?? 'Chrome could not prepare transcription.';
    } finally {
      prepare.disabled = false;
    }
  }

  async function process(id) {
    if (job) return;
    const controller = new AbortController();
    job = { id, controller };
    syncControls();
    try {
      await navigator.locks.request(LOCK, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          reportJob('Transcription is busy in another tab.');
          return;
        }
        const snapshot = await navigator.locks.request(`presso:rehearsal:${deckId}`, { ifAvailable: true }, async (captureLock) => {
          if (!captureLock) throw new Error('Stop the rehearsal in the other tab before transcribing its audio.');
          const run = await store().get(id);
          if (!run?.audio || run.transcript?.state === 'done') return;
          const count = await store().countAudio(id);
          if (!count) throw new Error('This run has no saved audio.');
          const [last] = await store().readAudio(id, count - 1, count - 1);
          return { run, totalSamples: (count - 1) * CHUNK_SAMPLES + last.pcm.size / 2 };
        });
        if (!snapshot) return;
        const { run, totalSamples } = snapshot;
        let next = run.transcript?.next ?? 0;
        let engine;
        const update = async (state, message, segment, checkpoint = next) => {
          const transcript = { state, next: checkpoint, message };
          await store().saveSpeech(id, transcript, segment);
          if (selected?.id === id) selected.transcript = transcript;
          reportJob(message);
        };

        try {
          await update('processing', 'Preparing transcription…');
          engine = await speechEngine(controller.signal, reportJob);
          rememberCachedEngine(engine);
          for (let offset = next * STEP_SAMPLES; offset < totalSamples; offset = next * STEP_SAMPLES) {
            controller.signal.throwIfAborted();
            const end = Math.min(totalSamples, offset + STEP_SAMPLES);
            let segment;
            try {
              segment = await transcribeSegment(store(), engine, id, offset, end, totalSamples);
            } catch (error) {
              if (engine.device !== 'webgpu' || controller.signal.aborted) throw error;
              engine.close();
              reportJob('Trying CPU transcription…');
              engine = await speechEngine(controller.signal, reportJob, true);
              segment = await transcribeSegment(store(), engine, id, offset, end, totalSamples);
            }
            controller.signal.throwIfAborted();
            const index = next;
            const done = end === totalSamples;
            const message = done ? 'Transcript ready in Rehearsals.' : `Transcribing ${Math.round(100 * end / totalSamples)}%`;
            await update(done ? 'done' : 'processing', message, {
              index, words: segment, endMs: end * 1000 / SAMPLE_RATE
            }, index + 1);
            next = index + 1;
          }
        } catch (error) {
          const message = controller.signal.aborted ? 'Transcription paused.' : (error?.message ?? 'Chrome could not finish transcription.');
          await update(controller.signal.aborted ? 'paused' : 'error', message);
        } finally {
          engine?.close();
        }
      });
    } catch (error) {
      const message = error?.message ?? 'Chrome could not save transcription progress.';
      reportJob(message);
    } finally {
      const lastMessage = job.message;
      job = undefined;
      syncControls();
      if (selected?.id === id && lastMessage) transcriptStatus.textContent = lastMessage;
    }
  }

  start.addEventListener('click', () => {
    if (!selected) return;
    if (job?.id === selected.id) job.controller.abort();
    else void process(selected.id);
  });
  prepare.addEventListener('click', () => void prepareModel());
  exportButton.addEventListener('click', async () => {
    const id = selected?.id;
    if (!id) return;
    try {
      const { run, segments } = await store().readTranscript(id);
      if (selected?.id !== id) return;
      if (run?.transcript?.state !== 'done' || !segments.length) throw new Error('This transcript is no longer saved.');
      const contents = spokenMarkdown(run, segments, formatClock);
      const url = URL.createObjectURL(new Blob([contents], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `presso-spoken-${new Date(run.startedAt).toISOString().replaceAll(':', '-')}.md`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      transcriptStatus.textContent = error?.message ?? 'Chrome could not download the transcript.';
    }
  });

  return {
    show,
    resume(runs) {
      const pending = runs.find((run) => run.transcript?.state === 'processing');
      if (pending) void process(pending.id);
    },
    recorded(run) {
      if (localStorage.getItem(ENGINE_READY) === 'yes') void process(run.id);
    }
  };
}

function rememberCachedEngine(engine) {
  if (engine.offlineReady) localStorage.setItem(ENGINE_READY, 'yes');
  else localStorage.removeItem(ENGINE_READY);
}

async function speechEngine(signal, onProgress, forceCPU = false) {
  const gpu = !forceCPU && await navigator.gpu?.requestAdapter().catch(() => null);
  for (const device of gpu ? ['webgpu', 'wasm'] : ['wasm']) {
    const engine = startWorker(signal, onProgress);
    try {
      const { offlineReady } = await engine.request('prepare', { device });
      return { ...engine, device, offlineReady };
    } catch (error) {
      engine.close();
      if (device === 'wasm' || signal.aborted) throw error;
      onProgress('Trying CPU transcription…');
    }
  }
}

function startWorker(signal, onProgress) {
  signal.throwIfAborted();
  const worker = new Worker(new URL('./presso-transcription-worker.js', import.meta.url), { type: 'module' });
  let waiting;
  const abort = () => {
    worker.terminate();
    waiting?.reject(signal.reason);
  };
  signal.addEventListener('abort', abort, { once: true });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      onProgress(`Preparing transcription ${Math.round(data.progress)}%`);
      return;
    }
    if (data.type === 'error') waiting?.reject(new Error(data.text));
    else waiting?.resolve(data);
  };
  worker.onerror = () => waiting?.reject(new Error('Chrome could not load the transcription worker.'));
  return {
    request(type, params, transfer = []) {
      signal.throwIfAborted();
      waiting = Promise.withResolvers();
      worker.postMessage({ type, ...params }, transfer);
      return waiting.promise;
    },
    close() {
      signal.removeEventListener('abort', abort);
      worker.terminate();
    }
  };
}

async function transcribeSegment(store, engine, id, offset, end, totalSamples) {
  const from = Math.max(0, offset - OVERLAP_SAMPLES);
  const to = Math.min(totalSamples, end + OVERLAP_SAMPLES);
  const chunks = await store.readAudio(id, Math.floor(from / CHUNK_SAMPLES), Math.floor((to - 1) / CHUNK_SAMPLES));
  const audio = new Float32Array(to - from);
  for (const { index, pcm } of chunks) {
    const samples = new Int16Array(await pcm.arrayBuffer());
    const absolute = index * CHUNK_SAMPLES;
    const first = Math.max(from - absolute, 0);
    const last = Math.min(to - absolute, samples.length);
    for (let i = first; i < last; i += 1) audio[absolute + i - from] = samples[i] / 32768;
  }
  const result = await engine.request('decode', { audio }, [audio.buffer]);
  return result.words.flatMap(({ text, timestamp }) => {
    const [startSeconds, endSeconds] = timestamp ?? [];
    if (!Number.isFinite(startSeconds) || !text.trim()) return [];
    const start = Math.max(from, from + startSeconds * SAMPLE_RATE);
    const finish = Math.min(to, from + (Number.isFinite(endSeconds) ? endSeconds : startSeconds) * SAMPLE_RATE);
    if (start >= to || finish < start) return [];
    return [{ startMs: start / SAMPLE_RATE * 1000, endMs: finish / SAMPLE_RATE * 1000, text }];
  });
}

function mergeSpeechWindows(segments) {
  const stepMs = STEP_SAMPLES * 1000 / SAMPLE_RATE;
  const overlapMs = OVERLAP_SAMPLES * 1000 / SAMPLE_RATE;
  const kept = new Set();
  for (const { index, endMs, words } of segments) {
    for (const word of words) {
      const time = midpoint(word);
      if (time >= index * stepMs && time < (endMs ?? (index + 1) * stepMs)) kept.add(word);
    }
  }
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    if (previous.index + 1 !== current.index) continue;
    const boundary = current.index * stepMs;
    const left = previous.words.filter((word) => Math.abs(midpoint(word) - boundary) <= overlapMs);
    const right = current.words.filter((word) => Math.abs(midpoint(word) - boundary) <= overlapMs);
    for (const word of left) {
      const normalized = word.text.trim().toLowerCase();
      const match = right.findIndex((other) => normalized === other.text.trim().toLowerCase()
        && word.startMs < other.endMs && other.startMs < word.endMs);
      if (match < 0) continue;
      const [other] = right.splice(match, 1);
      // A word can be shifted across the seam in either direction by each window.
      if (!kept.has(word) && kept.has(other)) continue;
      kept.delete(other);
      kept.add(word);
    }
  }
  return [...kept].sort((a, b) => midpoint(a) - midpoint(b));
}

function midpoint(word) {
  return (word.startMs + word.endMs) / 2;
}

function spokenMarkdown(run, segments, formatClock) {
  const visits = run.visits.map((visit) => ({ ...visit, words: [] }));
  const lines = [`# ${markdownText(run.title ?? 'Talk')} — spoken transcript`, ''];
  if (!run.audio.finished) lines.push('*Recovered from an interrupted recording.*', '');
  const untrackedSince = run.interrupted
    ? (run.interruptedMs ?? visits.at(-1)?.startMs ?? 0)
    : Infinity;
  const untracked = [];
  if (run.interrupted) lines.push('*Slide tracking was interrupted during this recording.*', '');
  let index = 0;
  for (const word of mergeSpeechWindows(segments)) {
    const time = midpoint(word);
    while (index + 1 < visits.length && visits[index + 1].startMs <= time) index += 1;
    if (time >= untrackedSince) untracked.push(word.text.trim());
    else visits[index]?.words.push(word.text.trim());
  }
  for (const visit of visits) {
    lines.push(`## ${formatClock(visit.startMs)} · ${markdownText(visit.title)}`, '', formatWords(visit.words), '');
  }
  if (untracked.length) lines.push(`## ${formatClock(untrackedSince)} · Slide not tracked`, '', formatWords(untracked), '');
  return lines.join('\n').trimEnd() + '\n';
}

function formatWords(words) {
  return markdownText(words.join(' ').replace(/\s+([,.!?;])/g, '$1'));
}

function markdownText(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/[\\`*_\[\]]/g, '\\$&').replace(/\s+/g, ' ').trim();
}
