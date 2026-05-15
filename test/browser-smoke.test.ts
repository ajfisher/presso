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
        await expectActiveSlide(page);
      }

      await expectText(page, '[data-next-title]', 'A tiny vertical slice');
      await expectText(page, '[data-next-preview]', 'A tiny vertical slice');
      await expectText(page, '[data-current-notes]', 'Opening notes for the basic fixture.');
      await expectText(page, '[data-current-position]', '1');
      await expectText(page, '[data-slide-count]', '10');
      const initialNotesSize = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--presenter-notes-size').trim());
      await page.locator('[data-action="font-plus"]').click();
      const largerNotesSize = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--presenter-notes-size').trim());
      expect(largerNotesSize).not.toBe(initialNotesSize);
      await page.reload({ waitUntil: 'networkidle' });
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--presenter-notes-size').trim())).toBe(largerNotesSize);

      await page.goto(`${staticServer.origin}/notes/`, { waitUntil: 'networkidle' });
      await expectText(page, 'h1', 'Presso Basic Example Notes');

      await page.goto(`${staticServer.origin}/control/`, { waitUntil: 'networkidle' });
      await expectText(page, 'button[data-action="next"]', 'Next');

      await page.goto(`${staticServer.origin}/transcript/`, { waitUntil: 'networkidle' });
      await expectText(page, 'h1', 'Presso Basic Example');

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
  }, 30000);

  it('syncs controller state with the deck and presenter over the dev server', async () => {
    const devServer = await startDevServer();
    const playwright = await import('playwright');
    let browser: Browser | undefined;

    try {
      browser = await launchBrowser(playwright.chromium);
      const deckPage = await browser.newPage();
      const presenterPage = await browser.newPage();
      const controlPage = await browser.newPage();

      await Promise.all([
        deckPage.goto(`${devServer.origin}/`, { waitUntil: 'domcontentloaded' }),
        presenterPage.goto(`${devServer.origin}/presenter`, { waitUntil: 'domcontentloaded' }),
        controlPage.goto(`${devServer.origin}/control`, { waitUntil: 'domcontentloaded' })
      ]);
      await expectActiveSlide(deckPage, 0);
      await expectActiveSlide(presenterPage, 0);
      await expectCurrentSlide(controlPage, 0);
      await expectText(controlPage, '[data-sync-status]', 'Synced');

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
