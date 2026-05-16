import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildStatic } from '@presso/export';
import type { Browser, Page } from 'playwright';

const runBrowserSmoke = process.env.PRESSO_BROWSER_SMOKE === '1';
const browserDescribe = runBrowserSmoke ? describe : describe.skip;
const tmpRoots: string[] = [];
const deckViewports = [
  { width: 1280, height: 760 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 1948, height: 1298 }
];
const starterLayouts = [
  { id: 'title', index: 0, layout: 'title' },
  { id: 'content', index: 1, layout: 'bullets' },
  { id: 'notes', index: 2, layout: 'two-column' },
  { id: 'section', index: 3, layout: 'section' },
  { id: 'statement', index: 4, layout: 'statement' },
  { id: 'image', index: 5, layout: 'image' },
  { id: 'logos', index: 6, layout: 'logos' },
  { id: 'code', index: 7, layout: 'code' },
  { id: 'demo', index: 8, layout: 'demo' },
  { id: 'blank', index: 9, layout: 'blank' }
];

browserDescribe('browser smoke', () => {
  afterEach(async () => {
    await Promise.all(tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('renders primary static routes with runtime CSS, JS, and nested deck assets', async () => {
    const dist = await buildExampleDeck();
    const staticServer = await serveStatic(dist);
    const playwright = await import('playwright');
    const browser = await launchBrowser(playwright.chromium);
    const brokenResponses: string[] = [];

    try {
      const page = await browser.newPage();
      page.on('response', (response) => {
        if (response.status() >= 400) {
          brokenResponses.push(`${response.status()} ${response.url()}`);
        }
      });

      for (const viewport of deckViewports) {
        await page.setViewportSize(viewport);
        for (const route of ['/', '/embed/']) {
          await page.goto(`${staticServer.origin}${route}`, { waitUntil: 'networkidle' });
          await expectActiveSlide(page);
          await expectSlideFitsViewport(page);
        }
      }

      await page.setViewportSize({ width: 1366, height: 768 });
      for (const route of ['/', '/embed/', '/presenter/']) {
        await page.goto(`${staticServer.origin}${route}`, { waitUntil: 'networkidle' });
        await expectRuntimeAssets(page);
        await expectActiveSlide(page);
      }

      await page.goto(`${staticServer.origin}/`, { waitUntil: 'networkidle' });
      await page.mouse.move(24, 24);
      await expectPresentationControlsVisible(page);
      await page.waitForTimeout(2200);
      await expectPresentationControlsHidden(page);
      await page.keyboard.press('ArrowRight');
      await expectPresentationControlsHidden(page);
      await page.mouse.move(48, 48);
      await expectPresentationControlsHidden(page);
      await hoverPresentationControls(page);
      await expectPresentationControlsVisible(page);

      await page.goto(`${staticServer.origin}/`, { waitUntil: 'networkidle' });
      await expectProgress(page, 0);
      await page.goto(`${staticServer.origin}/#/5`, { waitUntil: 'networkidle' });
      await expectProgress(page, (5 / 9) * 100);
      await page.goto(`${staticServer.origin}/#/9`, { waitUntil: 'networkidle' });
      await expectProgress(page, 100);
      await page.goto(`${staticServer.origin}/presenter/`, { waitUntil: 'networkidle' });
      await expectActiveSlide(page);

      await expectText(page, '[data-next-title]', 'A tiny vertical slice');
      await expectText(page, '[data-next-preview]', 'A tiny vertical slice');
      await expectText(page, '[data-current-notes]', 'Opening notes for the basic fixture.');
      await expectText(page, '[data-current-position]', '1');
      await expectText(page, '[data-slide-count]', '10');
      await expectPresenterLayout(page);
      for (const index of [5, 7]) {
        await page.goto(`${staticServer.origin}/presenter/#/${index}`, { waitUntil: 'networkidle' });
        await expectActiveSlide(page, index);
        await expectPresenterPreviewsFit(page);
      }
      await page.goto(`${staticServer.origin}/presenter/`, { waitUntil: 'networkidle' });
      const initialNotesSize = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--presenter-notes-size').trim());
      for (let i = 0; i < 7; i++) await page.locator('[data-action="font-plus"]').click();
      const largerNotesSize = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--presenter-notes-size').trim());
      expect(largerNotesSize).not.toBe(initialNotesSize);
      await page.reload({ waitUntil: 'networkidle' });
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--presenter-notes-size').trim())).toBe(largerNotesSize);
      await expectTeleprompter(page);

      await page.goto(`${staticServer.origin}/notes/`, { waitUntil: 'networkidle' });
      await expectRuntimeAssets(page);
      await expectText(page, 'h1', 'Presso Basic Example Notes');

      await page.goto(`${staticServer.origin}/control/`, { waitUntil: 'networkidle' });
      await expectRuntimeAssets(page);
      await expectText(page, 'button[data-action="next"]', 'Next');

      await page.goto(`${staticServer.origin}/transcript/`, { waitUntil: 'networkidle' });
      await expectRuntimeAssets(page);
      await expectText(page, 'h1', 'Presso Basic Example');

      for (const route of ['/print/slides/', '/print/notes-side/', '/print/notes-pages/']) {
        await page.goto(`${staticServer.origin}${route}`, { waitUntil: 'networkidle' });
        await expectRuntimeAssets(page);
        await expectRenderedSlides(page);
      }

      await page.goto(`${staticServer.origin}/`, { waitUntil: 'networkidle' });
      for (const layout of starterLayouts) {
        await page.goto(`${staticServer.origin}/#/${layout.index}`, { waitUntil: 'networkidle' });
        await expectActiveSlide(page, layout.index);
        await expectActiveLayout(page, layout);
      }

      await page.goto(`${staticServer.origin}/embed/#/5`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.presso-slide.is-active[data-slide-id="image"] img', { state: 'attached' });
      expect(await page.locator('.presso-slide.is-active[data-slide-id="image"]').evaluate((slide) => getComputedStyle(slide).display)).toBe('grid');
      expect(await page.locator('.presso-slide.is-active[data-slide-id="image"] img').evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true);

      await page.goto(`${staticServer.origin}/?notes=1`, { waitUntil: 'networkidle' });
      expect(await page.locator('body').getAttribute('data-notes-visible')).toBe('true');

      expect(brokenResponses).toEqual([]);
    } finally {
      await browser.close();
      await staticServer.close();
    }
  }, 45000);

  it('syncs controller state with the deck and presenter over the dev server', async () => {
    const devServer = await startDevServer();
    const playwright = await import('playwright');
    let browser: Browser | undefined;

    try {
      browser = await launchBrowser(playwright.chromium);
      const deckPage = await browser.newPage();
      const presenterPage = await browser.newPage();
      const controlPage = await browser.newPage();
      const notesPage = await browser.newPage();
      const transcriptPage = await browser.newPage();

      await Promise.all([
        deckPage.goto(`${devServer.origin}/`, { waitUntil: 'domcontentloaded' }),
        presenterPage.goto(`${devServer.origin}/presenter`, { waitUntil: 'domcontentloaded' }),
        controlPage.goto(`${devServer.origin}/control`, { waitUntil: 'domcontentloaded' }),
        notesPage.goto(`${devServer.origin}/notes`, { waitUntil: 'domcontentloaded' }),
        transcriptPage.goto(`${devServer.origin}/transcript`, { waitUntil: 'domcontentloaded' })
      ]);
      await expectActiveSlide(deckPage, 0);
      await expectActiveSlide(presenterPage, 0);
      await expectCurrentSlide(controlPage, 0);
      await expectText(controlPage, '[data-sync-status]', 'Synced');

      await notesPage.keyboard.press('ArrowRight');
      await transcriptPage.keyboard.press('PageDown');
      await notesPage.waitForTimeout(150);
      await expectServerState(devServer.origin, 0);
      await expectCurrentSlide(deckPage, 0);
      await expectCurrentSlide(presenterPage, 0);
      await expectCurrentSlide(controlPage, 0);

      await presenterPage.locator('button[data-action="controller-open"]').click();
      await presenterPage.waitForSelector('[data-controller-popover]:not([hidden]) svg');
      expect(await presenterPage.locator('[data-controller-url]').textContent()).toContain('/control');
      await presenterPage.locator('button[data-action="controller-close"]').click();

      await controlPage.locator('button[data-action="next"]').click();
      await expectCurrentSlide(deckPage, 1);
      await expectCurrentSlide(presenterPage, 1);
      await expectCurrentSlide(controlPage, 1);
      await expectText(controlPage, '[data-current-title]', 'A tiny vertical slice');
      await expectText(controlPage, '[data-current-position]', '2');

      await deckPage.keyboard.press('ArrowRight');
      await expectCurrentSlide(deckPage, 2);
      await expectCurrentSlide(presenterPage, 2);
      await expectCurrentSlide(controlPage, 2);
      await expectText(controlPage, '[data-current-position]', '3');

      await deckPage.goto(`${devServer.origin}/#/5`, { waitUntil: 'domcontentloaded' });
      await expectCurrentSlide(deckPage, 5);
      await expectCurrentSlide(presenterPage, 5);
      await expectCurrentSlide(controlPage, 5);
      await expectText(controlPage, '[data-current-title]', 'image');
      await expectText(controlPage, '[data-current-position]', '6');

      await deckPage.keyboard.press('End');
      await expectCurrentSlide(deckPage, 9);
      await expectCurrentSlide(presenterPage, 9);
      await expectCurrentSlide(controlPage, 9);
      await expectText(controlPage, '[data-current-position]', '10');

      await deckPage.keyboard.press('Home');
      await expectCurrentSlide(deckPage, 0);
      await expectCurrentSlide(presenterPage, 0);
      await expectCurrentSlide(controlPage, 0);
      await expectText(controlPage, '[data-current-position]', '1');

      await controlPage.locator('button[data-action="fullscreen"]').click();
      await deckPage.waitForFunction(() => Boolean(document.fullscreenElement) || !document.querySelector('[data-fullscreen-prompt]')?.hasAttribute('hidden'));
    } finally {
      await browser?.close();
      await devServer.close();
    }
  }, 30000);
});

async function buildExampleDeck(): Promise<string> {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-browser-'));
  tmpRoots.push(dist);
  return buildStatic(path.resolve('examples/basic'), dist);
}

async function launchBrowser(chromium: typeof import('playwright').chromium): Promise<Browser> {
  const executablePath = process.env.PRESSO_PLAYWRIGHT_EXECUTABLE ?? localChromePath();
  return executablePath
    ? chromium.launch({ executablePath })
    : chromium.launch();
}

function localChromePath(): string | undefined {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return existsSync(chromePath) ? chromePath : undefined;
}

async function expectActiveSlide(page: Page, index = 0): Promise<void> {
  await page.waitForSelector(`.presso-slide.is-active[data-slide-index="${index}"]`);
  await expectCurrentSlide(page, index);
  expect(await page.locator('.presso-slide.is-active').evaluate((slide) => getComputedStyle(slide).display)).toBe('grid');
}

async function expectActiveLayout(page: Page, layout: { id: string; layout: string }): Promise<void> {
  const slide = page.locator(`.presso-slide.is-active[data-slide-id="${layout.id}"]`);
  await slide.waitFor();
  expect(await slide.getAttribute('data-layout')).toBe(layout.layout);
  const bodyBox = await slide.locator(':scope > .presso-slide-body').boundingBox();
  expect(bodyBox?.width ?? 0).toBeGreaterThan(20);
  expect(bodyBox?.height ?? 0).toBeGreaterThan(20);
}

async function expectPresenterLayout(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const rect = el.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    };
    return {
      current: box('aside > section[aria-label="Current slide"]'),
      next: box('aside > section[aria-label="Next slide"]'),
      notes: box('main > section[aria-label="Speaker notes"]')
    };
  });
  const notesArea = layout.notes.width * layout.notes.height;
  const currentArea = layout.current.width * layout.current.height;
  const nextArea = layout.next.width * layout.next.height;
  expect(notesArea).toBeGreaterThan(currentArea * 2);
  expect(Math.abs(currentArea - nextArea) / Math.max(currentArea, nextArea)).toBeLessThan(0.25);
}

async function expectPresenterPreviewsFit(page: Page): Promise<void> {
  const previews = await page.evaluate(() => {
    const preview = (name: string, frameSelector: string, slideSelector: string) => {
      const frame = document.querySelector(frameSelector);
      if (!(frame instanceof HTMLElement)) throw new Error(`Missing ${name} preview frame`);
      const slide = frame.querySelector(slideSelector);
      if (!(slide instanceof HTMLElement)) throw new Error(`Missing ${name} preview slide`);
      const frameRect = frame.getBoundingClientRect();
      const slideRect = slide.getBoundingClientRect();
      return {
        name,
        frameHeight: frameRect.height,
        frameWidth: frameRect.width,
        slideBottom: slideRect.bottom - frameRect.bottom,
        slideHeight: slideRect.height,
        slideLeft: slideRect.left - frameRect.left,
        slideRight: slideRect.right - frameRect.right,
        slideTop: slideRect.top - frameRect.top,
        slideWidth: slideRect.width
      };
    };
    return [
      preview('current', 'aside > section[aria-label="Current slide"] .presso-stage', '.presso-slide.is-active'),
      preview('next', 'aside > section[aria-label="Next slide"] [data-next-preview]', '.presso-slide')
    ];
  });

  for (const preview of previews) {
    expect(preview.frameWidth / preview.frameHeight, `${preview.name} preview frame ratio`).toBeCloseTo(16 / 9, 1);
    expect(preview.slideWidth / preview.slideHeight, `${preview.name} preview slide ratio`).toBeCloseTo(16 / 9, 1);
    expect(preview.slideWidth, `${preview.name} preview width`).toBeLessThanOrEqual(preview.frameWidth + 1);
    expect(preview.slideHeight, `${preview.name} preview height`).toBeLessThanOrEqual(preview.frameHeight + 1);
    expect(preview.slideLeft, `${preview.name} preview left`).toBeGreaterThanOrEqual(-1);
    expect(preview.slideTop, `${preview.name} preview top`).toBeGreaterThanOrEqual(-1);
    expect(preview.slideRight, `${preview.name} preview right`).toBeLessThanOrEqual(1);
    expect(preview.slideBottom, `${preview.name} preview bottom`).toBeLessThanOrEqual(1);
  }
}

async function expectTeleprompter(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const notes = document.querySelector('[data-current-notes]');
    return notes instanceof HTMLElement && notes.scrollHeight > notes.clientHeight;
  }, undefined, { timeout: 5000 });

  await expectText(page, '[data-teleprompter-wpm]', '160 wpm');
  await page.locator('[data-action="teleprompter-faster"]').click();
  await expectText(page, '[data-teleprompter-wpm]', '170 wpm');
  await page.locator('[data-action="teleprompter-slower"]').click();
  await expectText(page, '[data-teleprompter-wpm]', '160 wpm');
  for (let i = 0; i < 6; i++) await page.locator('[data-action="teleprompter-faster"]').click();
  await expectText(page, '[data-teleprompter-wpm]', '220 wpm');
  expect(await page.evaluate(() => sessionStorage.getItem('presso:teleprompter-wpm'))).toBe('220');

  await page.locator('[data-action="teleprompter-toggle"]').click();
  expect(await page.locator('body').getAttribute('data-teleprompter')).toBe('running');
  await page.waitForTimeout(250);
  expect(await notesScrollTop(page)).toBe(0);
  await page.waitForFunction(() => {
    const notes = document.querySelector('[data-current-notes]');
    return notes instanceof HTMLElement && notes.scrollTop > 0;
  }, undefined, { timeout: 6000 });
  const runningScroll = await notesScrollTop(page);
  expect(runningScroll).toBeGreaterThan(0);
  expect(await notesProgress(page)).toBeGreaterThan(0);

  await page.locator('[data-action="teleprompter-pause"]').click();
  await page.waitForTimeout(100);
  const pausedScroll = await notesScrollTop(page);
  await page.waitForTimeout(900);
  expect(await notesScrollTop(page)).toBe(pausedScroll);

  await page.locator('[data-action="teleprompter-pause"]').click();
  await page.waitForFunction((previous) => {
    const notes = document.querySelector('[data-current-notes]');
    return notes instanceof HTMLElement && notes.scrollTop > Number(previous);
  }, pausedScroll, { timeout: 4000 });

  await page.locator('[data-action="teleprompter-reset"]').click();
  expect(await notesScrollTop(page)).toBe(0);
  expect(await notesProgress(page)).toBe(0);

  await page.locator('[data-action="next"]').click();
  await expectCurrentSlide(page, 1);
  expect(await page.locator('body').getAttribute('data-teleprompter')).toBe('running');
  expect(await notesScrollTop(page)).toBe(0);
  await page.waitForTimeout(250);
  expect(await notesScrollTop(page)).toBe(0);
  await page.waitForFunction(() => {
    const notes = document.querySelector('[data-current-notes]');
    return notes instanceof HTMLElement && notes.scrollTop > 0;
  }, undefined, { timeout: 6000 });
}

async function notesScrollTop(page: Page): Promise<number> {
  return page.locator('[data-current-notes]').evaluate((notes) => Math.round(notes.scrollTop));
}

async function notesProgress(page: Page): Promise<number> {
  return page.locator('[data-notes-progress]').evaluate((progress) => Number(progress.getAttribute('aria-valuenow')));
}

async function expectRenderedSlides(page: Page): Promise<void> {
  await page.waitForSelector('.presso-slide');
  expect(await page.locator('.presso-slide').count()).toBeGreaterThan(0);
  expect(await page.locator('.presso-slide').first().evaluate((slide) => getComputedStyle(slide).display)).toBe('grid');
}

async function expectProgress(page: Page, expectedPercent: number): Promise<void> {
  const value = await page.locator('.presso-progress > span').evaluate((progress) => Number.parseFloat((progress as HTMLElement).style.width));
  expect(value).toBeCloseTo(expectedPercent, 2);
}

async function expectPresentationControlsHidden(page: Page): Promise<void> {
  await expectPresentationControlsOpacity(page, 0);
}

async function expectPresentationControlsVisible(page: Page): Promise<void> {
  await expectPresentationControlsOpacity(page, 1);
}

async function expectPresentationControlsOpacity(page: Page, expected: number): Promise<void> {
  await page.waitForFunction((expected) => {
    const controls = document.querySelector('[data-presentation-controls]');
    return controls && Math.abs(Number(getComputedStyle(controls).opacity) - expected) < 0.05;
  }, expected);
}

async function expectRuntimeAssets(page: Page): Promise<void> {
  const assetHrefs = await page.evaluate(() => [
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link) => link.href),
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).map((script) => script.src)
  ]);
  expect(assetHrefs.some((href) => href.includes('/_presso/presso.css'))).toBe(true);
  expect(assetHrefs.some((href) => href.includes('/_presso/presso-runtime.js'))).toBe(true);
  expect(assetHrefs.some((href) => href.endsWith('/theme.css'))).toBe(true);
}

async function hoverPresentationControls(page: Page): Promise<void> {
  const box = await page.locator('[data-presentation-controls]').boundingBox();
  if (!box) throw new Error('Presentation controls were not visible in layout.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function expectSlideFitsViewport(page: Page): Promise<void> {
  const bounds = await page.locator('.presso-slide.is-active').evaluate((slide) => {
    const rect = slide.getBoundingClientRect();
    const stage = slide.closest('.presso-stage');
    if (!(stage instanceof HTMLElement)) throw new Error('Active slide is not inside a stage.');
    const stageStyle = getComputedStyle(stage);
    const ratio = Number(getComputedStyle(document.documentElement).getPropertyValue('--presso-slide-ratio').split('/')[0])
      / Number(getComputedStyle(document.documentElement).getPropertyValue('--presso-slide-ratio').split('/')[1]);
    const availableWidth = window.innerWidth - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight);
    const availableHeight = window.innerHeight - parseFloat(stageStyle.paddingTop) - parseFloat(stageStyle.paddingBottom);
    return {
      documentWidth: document.documentElement.scrollWidth,
      expectedWidth: Math.min(availableWidth, availableHeight * ratio),
      height: rect.height,
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      width: rect.width
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
  expect(bounds.width / bounds.height).toBeCloseTo(16 / 9, 2);
  expect(bounds.width).toBeCloseTo(bounds.expectedWidth, 1);
}

async function expectCurrentSlide(page: Page, index: number): Promise<void> {
  await page.waitForFunction((expected) => document.body.dataset.currentSlide === String(expected), index);
  expect(await page.locator('body').getAttribute('data-current-slide')).toBe(String(index));
}

async function expectServerState(origin: string, index: number): Promise<void> {
  const response = await fetch(`${origin}/state`);
  expect(response.ok).toBe(true);
  expect(await response.json()).toMatchObject({ index });
}

async function expectText(page: Page, selector: string, text: string): Promise<void> {
  await page.waitForSelector(selector);
  await page.waitForFunction(
    ({ selector, text }) => document.querySelector(selector)?.textContent?.includes(text),
    { selector, text }
  );
  expect(await page.locator(selector).first().textContent()).toContain(text);
}

async function startDevServer(): Promise<{ close: () => Promise<void>; origin: string }> {
  const port = await getFreePort();
  const child = spawn(process.execPath, [
    'packages/server/dist/cli.js',
    'dev',
    'examples/basic',
    `--port=${port}`
  ], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitForDevServer(child, port);
  } catch (error) {
    await closeChild(child);
    throw error;
  }
  return {
    close: () => closeChild(child),
    origin: `http://127.0.0.1:${port}`
  };
}

async function waitForDevServer(child: ChildProcessWithoutNullStreams, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Presso dev server did not start on port ${port}.\n${output}`));
    }, 10000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.includes(`http://localhost:${port}`)) {
        cleanup();
        resolve();
      }
    };
    const onExit = () => {
      cleanup();
      reject(new Error(`Presso dev server exited before listening.\n${output}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
  });
}

async function closeChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function getFreePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port.');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function serveStatic(root: string): Promise<{ close: () => Promise<void>; origin: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const filePath = await resolveStaticFile(root, url.pathname);
      if (!filePath) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'content-type': contentType(filePath) });
      res.end(await fs.readFile(filePath));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.stack : String(error));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static smoke server did not bind to a TCP port.');
  return {
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    origin: `http://127.0.0.1:${address.port}`
  };
}

async function resolveStaticFile(root: string, pathname: string): Promise<string | undefined> {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = path.resolve(root, clean);
  if (!isInside(root, candidate)) return undefined;

  const stat = await fs.stat(candidate).catch(() => undefined);
  if (stat?.isDirectory()) {
    return resolveStaticFile(root, path.join(pathname, 'index.html'));
  }
  if (stat?.isFile()) return candidate;
  if (!path.extname(candidate)) {
    const indexPath = path.join(candidate, 'index.html');
    const indexStat = await fs.stat(indexPath).catch(() => undefined);
    if (indexStat?.isFile() && isInside(root, indexPath)) return indexPath;
  }
  return undefined;
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function contentType(file: string): string {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'text/html; charset=utf-8';
}
