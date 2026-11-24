import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startDevServer } from '../packages/server/dist/index.js';

const bytes = await readFile(process.env.INPUT_WAV);
const clip = bytes.toString('base64');
const profile = await mkdtemp(join(tmpdir(), 'presso-engine-probe-'));
const server = await startDevServer(resolve(process.env.DECK), 64134);

try {
  if (process.env.COMPARE_BACKENDS === '1') {
    const automatic = await probe('automatic', 'online', false);
    const cpu = await probe('cpu', 'reference-cpu');
    assert.equal(cpu.backend, 'wasm');
    assert.equal(cpu.downloads + cpu.blocked, 0);
    console.log('Backend comparison', JSON.stringify({
      automatic: { device: automatic.backend, decodeMs: automatic.decodeMs },
      cpu: { device: cpu.backend, decodeMs: cpu.decodeMs }
    }));
  } else {
    const online = await probe('baseline', 'online');
    const interrupted = await probe('restart', 'interrupt');
    const resumed = await probe('restart', 'resume');
    assert.equal(online.windows.length, 2);
    assert.deepEqual(interrupted.windows, online.windows, 'Both windows must start before Chrome closes');
    assert.deepEqual(resumed.windows, online.windows.slice(1), 'Chrome must repeat only the uncommitted window');
    assert.deepEqual(interrupted.segments, resumed.segments.slice(0, 1), 'Durable checkpoint changed during restart');
    const speech = (segments) => segments.map(({ index, endMs, words }) => ({ index, endMs, words }));
    assert.deepEqual(speech(resumed.segments), speech(online.segments), 'Resumed segment timestamps or words differ');
    assert.equal(resumed.markdown, online.markdown, 'Resumed Markdown differs');
    assert.equal(interrupted.downloads + interrupted.blocked + resumed.downloads + resumed.blocked, 0);
    assert.ok(online.downloads > 0, 'Fresh profile did not exercise downloads');
    console.log('PASS real WASM decoder resumed after Chrome closed during window 2, with identical Markdown and segment timestamps');
  }
} finally {
  await server.close();
}

async function probe(name, mode, forceCpu = true) {
  const offline = mode !== 'online';
  const windows = [];
  let downloads = 0;
  let blocked = 0;
  let backend;
  let decodeStarted;
  let decodeEnded;
  const started = performance.now();
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: true,
    args: offline ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] : []
  });
  try {
    if (forceCpu) await context.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined });
    });
    const page = context.pages()[0];
    page.on('console', (message) => {
      if (message.text().startsWith('presso-probe:')) {
        console.log(message.text());
        if (message.text().includes('external GET') || message.text().includes('external HEAD')) downloads += 1;
        if (message.text().includes('blocked external')) blocked += 1;
        if (message.text().startsWith('presso-probe: decode ')) {
          windows.push(Number(message.text().split(' ').at(-1)));
          decodeStarted ??= performance.now();
        }
        if (message.text().startsWith('presso-probe: ready ')) backend = message.text().split(' ').at(-1);
        if (message.text() === 'presso-probe: words') decodeEnded = performance.now();
      } else if (['warning', 'error'].includes(message.type())) {
        console.log('Chrome:', message.text().slice(0, 260));
      }
    });
    page.on('pageerror', (error) => console.log('Page:', error.message));
    await context.route('**/presso-transcription-worker.js', async (route) => {
      const response = await route.fetch();
      const instrumentation = `const fetchFromProbe = self.fetch.bind(self);
self.fetch = (input, init) => {
  const url = new URL(input.url ?? input, location.href);
  if (url.origin !== location.origin) {
    const method = init?.method ?? input.method ?? 'GET';
    if (!['GET', 'HEAD'].includes(method) || ${offline}) {
      console.info('presso-probe: blocked external ' + method + ' ' + url.hostname + url.pathname);
      throw new Error('Unexpected external request for ' + url.hostname + ' during probe');
    }
    console.info('presso-probe: external ' + method + ' ' + url.hostname + url.pathname);
  }
  return fetchFromProbe(input, init);
};
self.addEventListener('message', ({data}) => {
  if (data.type === 'prepare') console.info('presso-probe: preparing ' + data.device);
  if (data.type === 'decode') console.info('presso-probe: decode ' + data.audio.length);
});
const probePostMessage = self.postMessage.bind(self);
self.postMessage = (...args) => {
  if (args[0].type === 'ready') console.info('presso-probe: ready ' + args[0].device);
  if (args[0].type === 'words') console.info('presso-probe: words');
  return probePostMessage(...args);
};\n`;
      await route.fulfill({ response, body: instrumentation + await response.text() });
    });

    await page.goto(server.origin + '/presenter');
    if (forceCpu) {
      assert.equal(await page.evaluate(() => navigator.gpu === undefined), true, 'CPU probe unexpectedly exposes WebGPU');
    } else {
      const adapter = await page.evaluate(async () => {
        const info = (await navigator.gpu?.requestAdapter())?.info;
        if (!info) return null;
        const { vendor, architecture, device, description, isFallbackAdapter } = info;
        const gl = document.createElement('canvas').getContext('webgl');
        const extension = gl?.getExtension('WEBGL_debug_renderer_info');
        const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null;
        return { vendor, architecture, device, description, isFallbackAdapter, renderer };
      });
      console.log('Automatic adapter', JSON.stringify(adapter));
    }
    const baseline = await page.evaluate(() => navigator.storage.estimate().then(({ usage }) => usage));
    const submitted = performance.now();
    const samples = mode === 'resume'
      ? await page.evaluate(async (id) => {
        const { openRehearsalStore } = await import('/_presso/presso-rehearsal-store.js');
        window.probeStore = await openRehearsalStore();
        return (await window.probeStore.get(id)).audio.samples;
      }, name)
      : await seed(page, name);
    if (mode !== 'resume') {
      await page.getByRole('button', { name: 'Rehearsals', exact: true }).click();
      await page.getByRole('button', { name: 'Transcribe in English' }).click();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
    const from = await page.evaluate(() => {
      const config = JSON.parse(document.getElementById('presso-runtime-config').textContent);
      return [document.body.dataset.currentSlide, document.body.dataset.currentBuildStep, config.slides.length - 1];
    });
    const navigationStarted = performance.now();
    const direction = Number(from[0]) === from[2] ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.press(direction);
    await page.waitForFunction(([index, step]) =>
      document.body.dataset.currentSlide !== index || document.body.dataset.currentBuildStep !== step, from);
    const navigationMs = performance.now() - navigationStarted;
    console.log(mode, 'presenter advanced during transcription in', Math.round(navigationMs), 'ms');
    if (mode === 'interrupt') {
      const deadline = performance.now() + 100000;
      while (windows.length < 2 && performance.now() < deadline) await delay(30);
      assert.equal(windows.length, 2, 'Second window never started');
      const state = await page.evaluate((id) => window.probeStore.readTranscript(id), name);
      assert.equal(state.run.transcript.state, 'processing');
      assert.equal(state.run.transcript.next, 1);
      assert.deepEqual(state.segments.map(({ index, endMs }) => ({ index, endMs })), [{ index: 0, endMs: 24000 }]);
      console.log('Closing Chrome during second window with saved next=1 and first segment ending at 24.000 s');
      return { downloads, blocked, windows, segments: state.segments };
    }
    const result = await waitForTranscript(page, name);
    assert.equal(result.run.transcript.state, 'done', result.run.transcript.message);
    assert.equal(await page.evaluate(() => localStorage.getItem('presso:transcription-ready:whisper-base.en:fa239a4')), 'yes');
    const words = result.segments.flatMap((segment) => segment.words);
    assert.ok(words.length > 12, 'Expected recognizable speech');
    assert.ok(words.every((word) => Number.isFinite(word.startMs) && Number.isFinite(word.endMs) && word.startMs <= word.endMs));
    await page.getByRole('button', { name: 'Rehearsals', exact: true }).click();
    await page.locator('[data-rehearsal-run]').selectOption(name);
    const markdown = await downloadMarkdown(page);
    if (mode === 'resume') {
      assert.equal(samples, 33 * 16000, 'The reference fixture must be 33 seconds long');
      await verifyFittedTimings(page, name, markdown);
    }
    const [opening, remainder] = markdown.split('## 0:05 · Second visit');
    const [second, last] = remainder.split('## 0:24 · Last visit');
    assert.match(opening, /0:00 · Opening/);
    assert.match(opening, /fellow Americans/i);
    assert.match(second, /do for your country/i);
    assert.match(last, /do for your country/i);

    const storage = await page.evaluate(() => navigator.storage.estimate().then(({ usage }) => usage));
    console.log('Metrics', JSON.stringify({
      mode, clipSeconds: samples / 16000, backend, words: words.length, windows,
      wallMs: Math.round(performance.now() - started), submissionMs: Math.round(performance.now() - submitted),
      navigationMs: Math.round(navigationMs), storageDeltaBytes: storage - baseline, storageBytes: storage,
      workerExternalDownloads: downloads, blockedExternalRequests: blocked
    }));
    const decodeMs = Math.round(decodeEnded - decodeStarted);
    assert.ok(backend && decodeMs > 0);
    return { markdown, segments: result.segments, windows, downloads, blocked, backend, decodeMs };
  } finally {
    await context.close();
  }
}

async function seed(page, id) {
  return page.evaluate(async ({ id, clip }) => {
    const { openRehearsalStore } = await import('/_presso/presso-rehearsal-store.js');
    const store = await openRehearsalStore();
    window.probeStore = store;
    const config = JSON.parse(document.getElementById('presso-runtime-config').textContent);
    const bytes = Uint8Array.from(atob(clip), (character) => character.charCodeAt(0));
    const decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(bytes.buffer);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const pcm = new Int16Array(decoded.length * 3);
    for (let i = 0; i < decoded.length; i += 1) {
      const mean = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
      pcm[i] = Math.round(32767 * Math.max(-1, Math.min(1, mean)));
    }
    pcm.set(pcm.subarray(0, decoded.length), decoded.length);
    pcm.set(pcm.subarray(0, decoded.length), 2 * decoded.length);
    await store.save({
      id, startedAt: Date.now(), title: 'Public reference speech', deckId: config.rehearsalDeckId,
      slideIds: config.slides.map((slide) => slide.id), finishedMs: pcm.length / 16,
      visits: [
        { slideId: config.slides[0].id, title: 'Opening', startMs: 0 },
        { slideId: config.slides[1].id, title: 'Second visit', startMs: 5000 },
        { slideId: config.slides[2].id, title: 'Last visit', startMs: 24000 }
      ],
      audio: { finished: true, samples: pcm.length }
    });
    for (let start = 0; start < pcm.length; start += 32000) {
      await store.saveAudio(id, start / 32000, pcm.slice(start, start + 32000));
    }
    return pcm.length;
  }, { id, clip });
}

async function waitForTranscript(page, id) {
  const deadline = performance.now() + 140000;
  let checkpoint;
  while (performance.now() < deadline) {
    checkpoint = await page.evaluate(async (key) => (await window.probeStore.get(key))?.transcript, id);
    if (['done', 'error'].includes(checkpoint?.state)) {
      return page.evaluate((key) => window.probeStore.readTranscript(key), id);
    }
    await delay(400);
  }
  throw new Error('Worker did not reach a terminal state: ' + (checkpoint?.message ?? 'no checkpoint'));
}


async function downloadMarkdown(page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download transcript' }).click();
  return readFile(await (await download).path(), 'utf8');
}

async function verifyFittedTimings(page, runId, before) {
  await page.getByRole('radio', { name: 'Fit to a talk length' }).check();
  await page.getByRole('textbox', { name: 'Talk length (m:ss)' }).fill('1:00');
  await page.waitForFunction(() => {
    const entries = [...document.querySelectorAll('[data-timing-review] tbody tr td:last-child')];
    return entries.map((cell) => cell.textContent).join(',') === '0:09,0:44,1:00';
  });
  await page.getByRole('button', { name: 'Apply timing targets' }).click();
  await page.waitForFunction(() =>
    document.querySelector('[data-timing-review] [role="status"]')?.textContent === 'Saved 3 slide targets.');
  for (const [index, expected] of ['0:09', '0:44', '1:00'].entries()) {
    const slide = await readFile(resolve(process.env.DECK, 'slides', '00' + (index + 1) + '.md'), 'utf8');
    assert.ok(slide.includes('time: "' + expected + '"'), 'Source marker did not match the fitted target');
  }
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Reload deck' }).click()
  ]);
  await page.getByRole('button', { name: 'Rehearsals', exact: true }).click();
  await page.locator('[data-rehearsal-run]').selectOption(runId);
  assert.equal(await downloadMarkdown(page), before);
  console.log('PASS fitted targets 0:09, 0:44, and 1:00; recorded Markdown still starts visits at 0:00, 0:05, and 0:24');
}
