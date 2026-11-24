import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startDevServer } from '../packages/server/dist/index.js';

const bytes = await readFile(process.env.INPUT_WAV);
const clip = bytes.toString('base64');
const profile = await mkdtemp(join(tmpdir(), 'presso-engine-probe-'));
const server = await startDevServer(resolve(process.env.DECK), 64134);

try {
  const online = await probe('online', false);
  const offline = await probe('offline', true);
  assert.equal(offline.markdown, online.markdown, 'Restarted offline Markdown differs');
  assert.deepEqual(offline.words, online.words, 'Restarted offline word timings differ');
  assert.equal(offline.downloads + offline.blocked, 0, 'Worker requested external data offline');
  assert.ok(online.downloads > 0, 'Fresh profile did not exercise downloads');
  console.log('PASS real WASM model, real Markdown, and same-profile offline Chrome restart');
} finally {
  await server.close();
}

async function probe(name, offline) {
  let downloads = 0;
  let blocked = 0;
  const started = performance.now();
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: true,
    args: offline ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] : []
  });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { value: undefined });
    });
    const page = context.pages()[0];
    page.on('console', (message) => {
      if (message.text().startsWith('presso-probe:')) {
        console.log(message.text());
        if (message.text().includes('external GET') || message.text().includes('external HEAD')) downloads += 1;
        if (message.text().includes('blocked external')) blocked += 1;
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
      console.info('presso-probe: blocked external ' + method + ' ' + url.hostname);
      throw new Error('Unexpected external request for ' + url.hostname + ' during probe');
    }
    console.info('presso-probe: external ' + method + ' ' + url.hostname);
  }
  return fetchFromProbe(input, init);
};
self.addEventListener('message', ({data}) => {
  if (data.type === 'prepare') console.info('presso-probe: preparing ' + data.device);
});\n`;
      await route.fulfill({ response, body: instrumentation + await response.text() });
    });

    await page.goto(server.origin + '/presenter');
    assert.equal(await page.evaluate(() => navigator.gpu === undefined), true, 'CPU probe unexpectedly exposes WebGPU');
    const baseline = await page.evaluate(() => navigator.storage.estimate().then(({ usage }) => usage));
    const samples = await seed(page, name);
    await page.getByRole('button', { name: 'Rehearsals', exact: true }).click();
    const submitted = performance.now();
    await page.getByRole('button', { name: 'Transcribe in English' }).click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const from = await page.evaluate(() => [document.body.dataset.currentSlide, document.body.dataset.currentBuildStep]);
    const navigationStarted = performance.now();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(([index, step]) =>
      document.body.dataset.currentSlide !== index || document.body.dataset.currentBuildStep !== step, from);
    const navigationMs = performance.now() - navigationStarted;
    console.log(name, 'presenter advanced during transcription in', Math.round(navigationMs), 'ms');
    await page.waitForFunction(async (id) => {
      return ['done', 'error'].includes((await window.probeStore.get(id))?.transcript?.state);
    }, name, { polling: 500, timeout: 140000 });

    const result = await page.evaluate((id) => window.probeStore.readTranscript(id), name);
    assert.equal(result.run.transcript.state, 'done', result.run.transcript.message);
    const words = result.segments.flatMap((segment) => segment.words);
    assert.ok(words.length > 12, 'Expected recognizable speech');
    assert.ok(words.every((word) => Number.isFinite(word.startMs) && Number.isFinite(word.endMs) && word.startMs <= word.endMs));
    await page.getByRole('button', { name: 'Rehearsals', exact: true }).click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download transcript' }).click();
    const markdown = await readFile(await (await downloadEvent).path(), 'utf8');
    const [opening, second] = markdown.split('## 0:05 · Second visit');
    assert.match(opening, /0:00 · Opening/);
    assert.match(opening, /fellow Americans/i);
    assert.match(second, /do for your country/i);

    const storage = await page.evaluate(() => navigator.storage.estimate().then(({ usage }) => usage));
    console.log('Metrics', JSON.stringify({
      name, clipSeconds: samples / 16000, backend: 'wasm', words: words.length,
      wallMs: Math.round(performance.now() - started), submissionMs: Math.round(performance.now() - submitted),
      navigationMs: Math.round(navigationMs), storageDeltaBytes: storage - baseline, storageBytes: storage,
      workerExternalDownloads: downloads, blockedExternalRequests: blocked
    }));
    return { markdown, words, downloads, blocked };
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
    const pcm = new Int16Array(decoded.length);
    for (let i = 0; i < pcm.length; i += 1) {
      const mean = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
      pcm[i] = Math.round(32767 * Math.max(-1, Math.min(1, mean)));
    }
    await store.save({
      id, startedAt: Date.now(), title: 'Public reference speech', deckId: config.rehearsalDeckId,
      slideIds: config.slides.map((slide) => slide.id), finishedMs: pcm.length / 16,
      visits: [
        { slideId: config.slides[0].id, title: 'Opening', startMs: 0 },
        { slideId: config.slides[1].id, title: 'Second visit', startMs: 5000 }
      ],
      audio: { finished: true, samples: pcm.length }
    });
    for (let start = 0; start < pcm.length; start += 32000) {
      await store.saveAudio(id, start / 32000, pcm.slice(start, start + 32000));
    }
    return pcm.length;
  }, { id, clip });
}
