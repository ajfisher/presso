import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildStatic } from '@presso/export';
import type { Browser, Page } from 'playwright';

const runBrowserSmoke = process.env.PRESSO_BROWSER_SMOKE === '1';
const browserDescribe = runBrowserSmoke ? describe : describe.skip;
const tmpRoots: string[] = [];

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

      for (const route of ['/', '/embed/', '/presenter/']) {
        await page.goto(`${staticServer.origin}${route}`, { waitUntil: 'networkidle' });
        await expectActiveSlide(page);
      }

      await page.goto(`${staticServer.origin}/notes/`, { waitUntil: 'networkidle' });
      await expectText(page, 'h1', 'Presso Basic Example Notes');

      await page.goto(`${staticServer.origin}/control/`, { waitUntil: 'networkidle' });
      await expectText(page, 'button[data-action="next"]', 'Next');

      await page.goto(`${staticServer.origin}/transcript/`, { waitUntil: 'networkidle' });
      await expectText(page, 'h1', 'Presso Basic Example');

      await page.goto(`${staticServer.origin}/embed/#/5`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.presso-slide.is-active img');
      expect(await page.locator('.presso-slide.is-active img').evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true);

      await page.goto(`${staticServer.origin}/?notes=1`, { waitUntil: 'networkidle' });
      expect(await page.locator('body').getAttribute('data-notes-visible')).toBe('true');

      expect(brokenResponses).toEqual([]);
    } finally {
      await browser.close();
      await staticServer.close();
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

async function expectActiveSlide(page: Page): Promise<void> {
  await page.waitForSelector('.presso-slide.is-active');
  expect(await page.locator('body').getAttribute('data-current-slide')).toBe('0');
  expect(await page.locator('.presso-slide.is-active').evaluate((slide) => getComputedStyle(slide).display)).toBe('grid');
}

async function expectText(page: Page, selector: string, text: string): Promise<void> {
  await page.waitForSelector(selector);
  expect(await page.locator(selector).first().textContent()).toContain(text);
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
