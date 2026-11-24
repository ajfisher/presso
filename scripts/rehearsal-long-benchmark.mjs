import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startDevServer } from '../packages/server/dist/index.js';

const sampleRate = 16000;
const step = 24 * sampleRate;
const interruption = 56;
const visits = [
  [0, 'Lecture opening'],
  [24000, 'Introduction'],
  [912000, 'Birthday matching'],
  [1344000, 'Proof of correctness'],
  [1872000, 'Asymptotic bounds'],
  [2640000, 'Python data structures']
];

const source = await open(process.env.INPUT_PCM, 'r');
const sampleCount = (await source.stat()).size / 2;
assert.ok(Number.isSafeInteger(sampleCount) && sampleCount >= 2700 * sampleRate && sampleCount <= 3600 * sampleRate);
const segmentCount = Math.ceil(sampleCount / step);
const profile = await mkdtemp(join(tmpdir(), 'presso-long-benchmark-'));
const server = await startDevServer(resolve(process.env.DECK), 64134);

try {
  const baseline = await benchmark('uninterrupted', 'lecture-baseline');
  await writeFile(process.env.BENCHMARK_RESULT, JSON.stringify({
    visits, samples: sampleCount, segments: baseline.segments, metrics: baseline.metrics
  }));

  const beforeClose = await benchmark('interrupt', 'lecture-restart');
  const afterReopen = await benchmark('resume', 'lecture-restart');
  assert.deepEqual(beforeClose.windows, baseline.windows.slice(0, interruption + 1));
  assert.deepEqual(afterReopen.windows, baseline.windows.slice(interruption));
  assert.deepEqual(afterReopen.segments.slice(0, interruption), beforeClose.segments);
  const comparable = (segments) => segments.map(({ index, endMs, words }) => ({ index, endMs, words }));
  assert.deepEqual(comparable(afterReopen.segments), comparable(baseline.segments));
  assert.equal(afterReopen.markdown, baseline.markdown);
  console.log('PASS full-session resume with identical Markdown and word timings across', segmentCount, 'segments');
} finally {
  await server.close();
  await source.close();
}

async function benchmark(mode, id) {
  const offline = mode !== 'uninterrupted';
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome',
    headless: true,
    args: offline ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] : []
  });

  try {
    const page = context.pages()[0];
    const windows = [];
    const backends = [];
    let activeWindow;
    let external = 0;
    let readyAt;
    page.on('console', (message) => {
      if (!message.text().startsWith('benchmark: ')) return;
      const [event, value] = message.text().slice(11).split(' ');
      if (event === 'decode') {
        activeWindow = { samples: Number(value) };
      } else if (event === 'words') {
        windows.push(activeWindow.samples);
        activeWindow = undefined;
      } else if (event === 'error') {
        activeWindow = undefined;
      } else if (event === 'network' || event === 'blocked') {
        external += 1;
      } else if (event === 'ready') {
        backends.push(value);
        readyAt ??= performance.now();
      }
      if (['network', 'blocked', 'prepare', 'ready', 'error'].includes(event)) {
        console.log(mode, message.text());
      }
    });

    await context.route('**/presso-transcription-worker.js', async (route) => {
      const response = await route.fetch();
      const options = { offline, id, holdAt: mode === 'interrupt' ? interruption : null };
      const prefix = '(' + observeWorker.toString() + ')(' + JSON.stringify(options) + ');\n';
      await route.fulfill({ response, body: prefix + await response.text() });
    });
    await context.route('**/benchmark-audio?*', async (route) => {
      const start = Number(new URL(route.request().url()).searchParams.get('start'));
      assert.ok(Number.isSafeInteger(start) && start >= 0 && start < sampleCount);
      const frame = Buffer.alloc(Math.min(sampleCount - start, 16 * sampleRate) * 2);
      const { bytesRead } = await source.read(frame, 0, frame.length, start * 2);
      assert.equal(bytesRead, frame.length);
      await route.fulfill({ body: frame, contentType: 'application/octet-stream' });
    });

    const openedAt = performance.now();
    await page.goto(server.origin + '/presenter');
    await page.evaluate(async () => {
      const { openRehearsalStore } = await import('/_presso/presso-rehearsal-store.js');
      window.benchmarkStore = await openRehearsalStore();
    });
    const beforeStorage = await estimateStorage(page);
    let startedAt = openedAt;
    if (mode !== 'resume') {
      await seed(page, id);
      await page.getByRole('button', { name: 'Rehearsals', exact: true }).click();
      startedAt = performance.now();
      await page.getByRole('button', { name: 'Transcribe in English' }).click();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }

    const navigation = [];
    const nextToMeasure = mode === 'uninterrupted' ? [1, interruption + 1, segmentCount] : [1];
    let lastCheckpoint;
    let lastProgress = performance.now();
    while (true) {
      const windowNumber = windows.length + 1;
      if (activeWindow && windowNumber >= nextToMeasure[0]) {
        nextToMeasure.shift();
        const pending = activeWindow;
        const navigationMs = await advance(page);
        navigation.push({ windowNumber, navigationMs, duringDecode: activeWindow === pending });
      }
      const checkpoint = await page.evaluate(async (runId) => (await window.benchmarkStore.get(runId))?.transcript, id);
      assert.notEqual(checkpoint?.state, 'error', checkpoint?.message);
      if (checkpoint?.next !== lastCheckpoint) {
        lastCheckpoint = checkpoint?.next;
        lastProgress = performance.now();
        console.log(mode, 'checkpoint', lastCheckpoint, 'of', segmentCount);
      }
      if (mode === 'interrupt' && checkpoint?.next === interruption && activeWindow
        && windows.length === interruption) {
        assert.equal(checkpoint.state, 'processing');
        const pending = activeWindow;
        const { segments } = await loadTranscript(page, id);
        if (activeWindow !== pending) continue;
        assert.equal(segments.length, interruption);
        assert.equal(segments.at(-1).endMs, interruption * 24000);
        assert.equal(external, 0);
        console.log('Closing Chrome during window', windowNumber, 'with speech saved through', interruption * 24, 'seconds');
        return { windows: [...windows, pending.samples], segments };
      }
      if (checkpoint?.state === 'done') {
        assert.notEqual(mode, 'interrupt', 'The intended interrupted window was already committed');
        break;
      }
      assert.ok(performance.now() - lastProgress < 120000,
        'No durable progress for 120 s. Last checkpoint ' + lastCheckpoint + ' ' + checkpoint?.message);
      await delay(250);
    }

    const { segments } = await loadTranscript(page, id);
    assert.equal(segments.length, segmentCount);
    assert.equal(segments.at(-1).endMs, sampleCount * 1000 / sampleRate);
    for (const [index, segment] of segments.entries()) {
      assert.equal(segment.index, index);
      const from = Math.max(0, index * 24000 - 2000);
      const to = Math.min(sampleCount / 16, segment.endMs + 2000) + 0.001;
      assert.ok(segment.words.every(({ startMs, endMs }) =>
        Number.isFinite(startMs) && Number.isFinite(endMs) && startMs >= from && startMs <= endMs && endMs <= to));
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('presso:transcription-ready:whisper-base.en:fa239a4')), 'yes');

    await page.getByRole('button', { name: 'Rehearsals', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download transcript' }).click();
    const markdown = await readFile(await (await download).path(), 'utf8');
    const headings = markdown.split('\n').filter((line) => line.startsWith('## '));
    assert.deepEqual(headings, visits.map(([ms, title]) => {
      const seconds = ms / 1000;
      return '## ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ' · ' + title;
    }));
    assert.ok(markdown.split(headings.at(-1)).at(-1).trim().length > 20);
    assert.ok(offline ? external === 0 : external > 0);

    const metrics = {
      mode, chrome: await page.evaluate(() => navigator.userAgent.match(/Chrome\/[^ ]+/)?.[0]),
      clipSeconds: sampleCount / sampleRate, backends, external,
      engineReadyMs: Math.round(readyAt - startedAt),
      exportMs: Math.round(performance.now() - startedAt),
      decodedWindows: windows.length, navigation,
      beforeStorage, afterStorage: await estimateStorage(page)
    };
    console.log('Metrics', JSON.stringify(metrics));
    return { windows, segments, metrics, markdown };
  } finally {
    await context.close();
  }
}

function observeWorker({ offline, id, holdAt }) {
  const fetchFromBrowser = self.fetch.bind(self);
  self.fetch = (input, init) => {
    const url = new URL(input.url ?? input, location.href);
    if (url.origin !== location.origin) {
      const method = init?.method ?? input.method ?? 'GET';
      if (offline || !['GET', 'HEAD'].includes(method)) {
        console.info('benchmark: blocked ' + method + ' ' + url.hostname + url.pathname);
        throw new Error('External worker request blocked by benchmark');
      }
      console.info('benchmark: network ' + method + ' ' + url.hostname + url.pathname);
    }
    return fetchFromBrowser(input, init);
  };

  self.addEventListener('message', ({ data }) => {
    if (data.type === 'prepare') console.info('benchmark: prepare ' + data.device);
    if (data.type === 'decode') console.info('benchmark: decode ' + data.audio.length);
  });
  const post = self.postMessage.bind(self);
  const send = (...args) => {
    const [message] = args;
    if (message.type === 'words') console.info('benchmark: words');
    if (message.type === 'error') console.info('benchmark: error ' + message.text);
    if (message.type === 'ready') console.info('benchmark: ready ' + message.device);
    return post(...args);
  };
  let store;
  self.postMessage = (...args) => {
    if (args[0].type !== 'words' || holdAt === null) return send(...args);
    // Keep just the selected window uncommitted if it finishes before Chrome closes.
    store ??= import(new URL('./presso-rehearsal-store.js', location.href))
      .then(({ openRehearsalStore }) => openRehearsalStore());
    void store.then((db) => db.get(id)).then((run) => {
      if (run?.transcript?.next !== holdAt) send(...args);
    }).catch((error) => send({ type: 'error', text: error.message }));
  };
}

async function seed(page, id) {
  await page.evaluate(async ({ id, sampleCount, visits }) => {
    const store = window.benchmarkStore;
    const config = JSON.parse(document.getElementById('presso-runtime-config').textContent);
    await store.save({
      id, title: 'MIT lecture benchmark', startedAt: Date.now(), deckId: config.rehearsalDeckId,
      slideIds: config.slides.map((slide) => slide.id),
      finishedMs: sampleCount / 16,
      visits: visits.map(([startMs, title], index) => ({ startMs, title, slideId: config.slides[index].id })),
      audio: { finished: true, samples: sampleCount }
    });
    // Transfer small PCM blocks so even the browser fixture has bounded memory.
    const block = 32000;
    const batch = 8 * block;
    for (let start = 0; start < sampleCount; start += batch) {
      const response = await fetch('/benchmark-audio?start=' + start);
      if (!response.ok) throw new Error('Could not load fixture audio');
      const samples = new Int16Array(await response.arrayBuffer());
      for (let offset = 0; offset < samples.length; offset += block) {
        await store.saveAudio(id, (start + offset) / block, samples.slice(offset, offset + block));
      }
    }
  }, { id, sampleCount, visits });
}

function loadTranscript(page, id) {
  return page.evaluate((runId) => window.benchmarkStore.readTranscript(runId), id);
}

function estimateStorage(page) {
  return page.evaluate(async () => {
    const { usage, usageDetails } = await navigator.storage.estimate();
    return { totalBytes: usage, cacheBytes: usageDetails?.caches };
  });
}

async function advance(page) {
  const from = await page.evaluate(() => [document.body.dataset.currentSlide, document.body.dataset.currentBuildStep]);
  const start = performance.now();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(([index, step]) =>
    document.body.dataset.currentSlide !== index || document.body.dataset.currentBuildStep !== step, from);
  return Math.round(performance.now() - start);
}
