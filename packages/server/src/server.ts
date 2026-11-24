import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import http, { type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { compileDeck, createSlideSource, previewTimingTargets, readSlideSource, writeSlideSource, writeTimingTargets, type Deck, type CreateSlideOptions, type EditableSlideInput } from '@ajfisher/presso-core';
import { readRuntimeAsset, rehearsalAssetNames, renderPage, runtimeAssetNames, type RenderMode, type RuntimeAssetName } from '@ajfisher/presso-runtime';

interface Client {
  id: number;
  res: ServerResponse;
}

export interface DevServer {
  close: () => Promise<void>;
  origin: string;
  port: number;
}

const execFileAsync = promisify(execFile);
const CONTROL_URL_CACHE_MS = 2_000;

const ROUTE_MODES = new Map<string, RenderMode>([
  ['/', 'deck'],
  ['/embed', 'embed'],
  ['/embed/', 'embed'],
  ['/presenter', 'presenter'],
  ['/presenter/', 'presenter'],
  ['/control', 'control'],
  ['/control/', 'control'],
  ['/notes', 'notes'],
  ['/notes/', 'notes'],
  ['/transcript', 'transcript'],
  ['/transcript/', 'transcript'],
  ['/print/slides', 'print-slides'],
  ['/print/slides/', 'print-slides'],
  ['/print/notes', 'print-notes'],
  ['/print/notes/', 'print-notes'],
  ['/print/speaker', 'print-speaker'],
  ['/print/speaker/', 'print-speaker'],
  ['/print/handout', 'print-handout'],
  ['/print/handout/', 'print-handout'],
  ['/print/notes-side', 'print-handout'],
  ['/print/notes-side/', 'print-handout'],
  ['/print/notes-pages', 'print-speaker'],
  ['/print/notes-pages/', 'print-speaker']
]);

export async function startDevServer(cwd = process.cwd(), port = 3030): Promise<DevServer> {
  const deckRoot = await fs.realpath(cwd);
  const stateSession = randomUUID();
  let stateRevision = 0;
  let currentIndex = 0;
  let currentSlideId: string | undefined;
  let currentBuildStep = 0;
  let currentFullscreen = false;
  let clientId = 0;
  const clients = new Map<number, Client>();
  let controlUrlCache: { expiresAt: number; urls: string[] } | undefined;
  let suppressReloadUntil = 0;
  let applyingTimings = false;
  let sourceWrites = Promise.resolve();
  const queueWrite = (write: () => Promise<void>) => {
    const result = sourceWrites.then(write);
    sourceWrites = result.catch(() => {});
    return result;
  };
  const state = (updateId?: string) => ({
    buildStep: currentBuildStep, fullscreen: currentFullscreen, index: currentIndex,
    slideId: currentSlideId, session: stateSession, revision: stateRevision, updateId
  });

  const controlUrls = async (): Promise<string[]> => {
    if (controlUrlCache && Date.now() < controlUrlCache.expiresAt) return controlUrlCache.urls;
    const urls = await buildControlUrls(port);
    controlUrlCache = {
      expiresAt: Date.now() + CONTROL_URL_CACHE_MS,
      urls
    };
    return urls;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const localAuthor = isLocalAuthor(req, port);
      if (url.pathname === '/edit/slides') {
        await handleCreateSlide(cwd, req, res, queueWrite, (slide) => {
          currentIndex = slide.index;
          currentSlideId = slide.id;
          currentBuildStep = 0;
          stateRevision += 1;
          broadcast(clients, 'state', state());
          broadcast(clients, 'slide-created', {});
        }, () => { suppressReloadUntil = Date.now() + 500; });
        return;
      }
      if (url.pathname === '/edit/slide') {
        await handleEditSlide(cwd, req, res, url, queueWrite, () => { suppressReloadUntil = 0; });
        return;
      }
      if (url.pathname === '/rehearsal/timing') {
        if (!localAuthor || req.headers.origin !== `http://${req.headers.host}`) {
          sendJson(res, { error: 'Open the presenter on localhost to edit rehearsal timings.' }, 403);
          return;
        }
        await handleRehearsalTiming(deckRoot, cwd, req, res, queueWrite, async (deck, changes) => {
          applyingTimings = true;
          try {
            const result = await writeTimingTargets(deck, changes);
            if (result.applied.length) broadcast(clients, 'reload', {});
            return result;
          } finally {
            applyingTimings = false;
            suppressReloadUntil = Date.now() + 300;
          }
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/events') {
        const id = ++clientId;
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive'
        });
        res.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`);
        clients.set(id, { id, res });
        req.on('close', () => clients.delete(id));
        return;
      }
      if (url.pathname === '/state') {
        if (req.method === 'GET') {
          sendJson(res, state());
          return;
        }
        if (req.method === 'POST') {
          const deck = await compileDeck(cwd);
          const body = await readBody(req);
          const update = parseJsonObject(body);
          const previousIndex = currentIndex;
          currentIndex = clampStateIndex(update.index ?? currentIndex, deck.slides.length, currentIndex);
          const nextSlide = deck.slides[currentIndex];
          currentSlideId = nextSlide?.id;
          currentBuildStep = clampStateBuildStep(
            update.buildStep ?? (currentIndex === previousIndex ? currentBuildStep : 0),
            nextSlide?.buildSteps ?? 0
          );
          if (typeof update.fullscreen === 'boolean') currentFullscreen = update.fullscreen;
          stateRevision += 1;
          const updateId = typeof update.updateId === 'string' && update.updateId.length <= 64 ? update.updateId : undefined;
          const nextState = state(updateId);
          broadcast(clients, 'state', nextState);
          sendJson(res, nextState);
          return;
        }
      }
      if (url.pathname === '/control-urls' && req.method === 'GET') {
        sendJson(res, { controlUrls: await controlUrls() });
        return;
      }
      if (url.pathname === '/command' && req.method === 'POST') {
        const body = await readBody(req);
        const command = parseJsonObject(body);
        if (typeof command.type === 'string') {
          broadcast(clients, 'command', command);
          sendJson(res, { ok: true });
          return;
        }
        sendJson(res, { error: 'Command type is required.' }, 400);
        return;
      }

      const runtimeAsset = runtimeAssetName(url.pathname, localAuthor);
      if (runtimeAsset) {
        const asset = readRuntimeAsset(runtimeAsset);
        res.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': asset.contentType
        });
        res.end(asset.content);
        return;
      }

      const deck = await compileDeck(cwd);
      currentIndex = clampStateIndex(currentIndex, deck.slides.length);
      currentSlideId = deck.slides[currentIndex]?.id;
      if (url.pathname === '/deck.json') {
        sendJson(res, deck);
        return;
      }
      const mode = ROUTE_MODES.get(url.pathname);
      if (mode) {
        const rehearsalDeckId = mode === 'presenter' && localAuthor
          ? getRehearsalDeckId(deckRoot, deck)
          : undefined;
        sendHtml(res, renderPage(deck, mode, { controlUrls: await controlUrls(), rehearsalDeckId, server: true }));
        return;
      }
      if (await serveStatic(cwd, url.pathname, res)) {
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(error instanceof Error ? error.stack : String(error));
    }
  });

  const watcher = watch(cwd, { recursive: true }, (_event, fileName) => {
    if (fileName && String(fileName).includes('node_modules')) return;
    if (applyingTimings || Date.now() < suppressReloadUntil) return;
    broadcast(clients, 'reload', {});
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`Presso dev server running at http://localhost:${port}`);
  const initialControlUrls = await controlUrls();
  if (initialControlUrls.length) console.log(`Phone controller: ${initialControlUrls[0]}`);
  return {
    close: () => new Promise((resolve, reject) => {
      watcher.close();
      server.close((error) => error ? reject(error) : resolve());
    }),
    origin: `http://localhost:${port}`,
    port
  };
}

async function serveStatic(cwd: string, pathname: string, res: ServerResponse): Promise<boolean> {
  const roots = [
    cwd,
    path.join(cwd, 'public')
  ];
  for (const root of roots) {
    const file = await resolveStaticFile(root, pathname);
    if (file) {
      res.writeHead(200, { 'content-type': contentType(file) });
      res.end(await fs.readFile(file));
      return true;
    }
  }
  return false;
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

function broadcast(clients: Map<number, Client>, event: string, data: unknown): void {
  for (const client of clients.values()) {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'text/html; charset=utf-8'
  });
  res.end(html);
}

type SourceWriteQueue = (write: () => Promise<void>) => Promise<void>;

async function handleCreateSlide(
  cwd: string,
  req: http.IncomingMessage,
  res: ServerResponse,
  queue: SourceWriteQueue,
  onCreated: (slide: { index: number; id: string }) => void,
  beforeWrite: () => void
): Promise<void> {
  try {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Create slide endpoint supports POST only.' }, 405);
      return;
    }
    const input = parseCreateSlideInput(parseJsonObject(await readBody(req)));
    await queue(async () => {
      beforeWrite();
      const created = await createSlideSource(cwd, input);
      onCreated(created);
      sendJson(res, created);
    });
  } catch (error) {
    sendJson(res, { error: error instanceof Error ? error.message : String(error) }, 400);
  }
}

async function handleEditSlide(
  cwd: string, req: http.IncomingMessage, res: ServerResponse, url: URL,
  queue: SourceWriteQueue, beforeWrite: () => void
): Promise<void> {
  try {
    const index = parseSlideIndex(url);
    if (req.method === 'GET') {
      sendJson(res, await readSlideSource(cwd, index));
      return;
    }
    if (req.method === 'PUT') {
      const input = parseEditInput(parseJsonObject(await readBody(req)));
      await queue(async () => {
        beforeWrite();
        sendJson(res, await writeSlideSource(cwd, index, input));
      });
      return;
    }
    sendJson(res, { error: 'Edit slide endpoint supports GET and PUT only.' }, 405);
  } catch (error) {
    sendJson(res, { error: error instanceof Error ? error.message : String(error) }, 400);
  }
}

function parseSlideIndex(url: URL): number {
  const raw = url.searchParams.get('index');
  const index = Number(raw);
  if (!raw || !Number.isInteger(index) || index < 0) {
    throw new Error('A valid non-negative slide index is required.');
  }
  return index;
}

async function handleRehearsalTiming(
  deckRoot: string,
  cwd: string,
  req: http.IncomingMessage,
  res: ServerResponse,
  queue: SourceWriteQueue,
  apply: typeof writeTimingTargets
) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    sendJson(res, { error: 'Send POST to preview timings or PUT to apply them.' }, 405);
    return;
  }
  if (req.headers['content-type'] !== 'application/json') {
    sendJson(res, { error: 'A JSON timing plan is required.' }, 415);
    return;
  }
  try {
    const input = parseJsonObject(await readBody(req, 1024 * 1024));
    const slideIds = input.slideIds;
    if (!Array.isArray(slideIds) || slideIds.some((id) => typeof id !== 'string') || !Array.isArray(input.targets)) {
      throw new Error('The timing plan needs the rehearsal’s slide order and targets.');
    }
    const targets = new Map<string, number>();
    for (const target of input.targets) {
      if (!target || typeof target.id !== 'string' || !Number.isSafeInteger(target.seconds)
        || target.seconds < 0 || targets.has(target.id)) {
        throw new Error('Each slide can have one whole-second finish target.');
      }
      targets.set(target.id, target.seconds);
    }

    const createPlan = async () => {
      const deck = await compileDeck(cwd);
      if (input.deckId !== getRehearsalDeckId(deckRoot, deck)) {
        return sendJson(res, { error: 'This rehearsal belongs to a different deck.' }, 409);
      }
      const plan = previewTimingTargets(deck, slideIds, targets);
      if (req.method === 'POST') return sendJson(res, { revision: plan.revision, rows: plan.rows, conflict: plan.conflict });
      if (plan.revision !== input.revision) {
        return sendJson(res, { error: 'The timing plan changed since the preview. Review the refreshed targets before applying.' }, 409);
      }
      if (plan.conflict) return sendJson(res, { error: plan.conflict }, 400);
      sendJson(res, await apply(deck, plan.changes));
    };
    if (req.method === 'PUT') await queue(createPlan);
    else await createPlan();
  } catch (error) {
    const message = error instanceof Error && !('code' in error) ? error.message : 'Presso could not open the deck’s timing plan.';
    sendJson(res, { error: message }, 400);
  }
}

function parseCreateSlideInput(value: Record<string, unknown>): CreateSlideOptions {
  if (value.afterIndex === undefined || value.afterIndex === null) return {};
  if (typeof value.afterIndex !== 'number' || !Number.isInteger(value.afterIndex) || value.afterIndex < 0) {
    throw new Error('Create slide payload requires afterIndex to be a non-negative integer when provided.');
  }
  return { afterIndex: value.afterIndex };
}

function parseEditInput(value: Record<string, unknown>): EditableSlideInput {
  if (typeof value.metadataYaml !== 'string' || typeof value.bodyMarkdown !== 'string' || typeof value.notesMarkdown !== 'string') {
    throw new Error('Edit payload requires metadataYaml, bodyMarkdown, and notesMarkdown strings.');
  }
  return {
    metadataYaml: value.metadataYaml,
    bodyMarkdown: value.bodyMarkdown,
    notesMarkdown: value.notesMarkdown
  };
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req: http.IncomingMessage, limit = Infinity): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > limit) {
      req.resume();
      throw new Error('The timing plan is too large.');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseJsonObject(body: string): Record<string, unknown> {
  try {
    const value = JSON.parse(body || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function clampStateIndex(value: unknown, slideCount: number, fallback = 0): number {
  const max = Math.max(0, slideCount - 1);
  const fallbackIndex = Math.min(max, Math.max(0, Math.trunc(Number(fallback)) || 0));
  const next = Math.trunc(Number(value));
  if (!Number.isFinite(next)) return fallbackIndex;
  return Math.min(max, Math.max(0, next));
}

export function clampStateBuildStep(value: unknown, buildSteps: number): number {
  const max = Math.max(0, Math.trunc(Number(buildSteps)) || 0);
  const next = Math.trunc(Number(value));
  if (!Number.isFinite(next)) return 0;
  return Math.min(max, Math.max(0, next));
}

function contentType(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.html' || extension === '.htm') return 'text/html; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.json') return 'application/json; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function getRehearsalDeckId(deckRoot: string, deck: Deck): string {
  return createHash('sha256').update(JSON.stringify([deckRoot, deck.config.source])).digest('hex');
}

function isLocalAuthor(req: http.IncomingMessage, port: number): boolean {
  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
  const addresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  return hosts.includes(req.headers.host ?? '') && addresses.includes(req.socket.remoteAddress ?? '');
}

function runtimeAssetName(pathname: string, localAuthor: boolean): RuntimeAssetName | undefined {
  const clean = pathname.replace(/^\/+/, '');
  const name = clean.startsWith('_presso/') ? clean.slice('_presso/'.length) : clean;
  return runtimeAssetNames.find((asset) => asset === name)
    ?? (localAuthor ? rehearsalAssetNames.find((asset) => asset === name) : undefined);
}

async function buildControlUrls(port: number): Promise<string[]> {
  return uniqueUrls([
    ...envControlUrls(),
    ...await tailscaleControlUrls(port),
    ...localControlUrls(port)
  ]);
}

function envControlUrls(): string[] {
  const raw = process.env.PRESSO_CONTROL_URLS ?? process.env.PRESSO_CONTROL_URL ?? '';
  return raw.split(/[\s,]+/).map((url) => url.trim()).filter(Boolean);
}

async function tailscaleControlUrls(port: number): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('tailscale', ['serve', 'status', '--json'], {
      maxBuffer: 128 * 1024,
      timeout: 1_000
    });
    return controlUrlsFromTailscaleServeStatus(stdout, port);
  } catch {
    return [];
  }
}

export function controlUrlsFromTailscaleServeStatus(statusJson: string, port: number): string[] {
  try {
    return uniqueUrls(collectTailscaleControlUrls(JSON.parse(statusJson), port));
  } catch {
    return [];
  }
}

function collectTailscaleControlUrls(value: unknown, port: number): string[] {
  if (!value || typeof value !== 'object') return [];
  const urls: string[] = [];
  if ('Web' in value && value.Web && typeof value.Web === 'object') {
    for (const [host, site] of Object.entries(value.Web)) {
      if (!site || typeof site !== 'object' || !('Handlers' in site) || !site.Handlers || typeof site.Handlers !== 'object') continue;
      for (const [handlerPath, handler] of Object.entries(site.Handlers)) {
        if (handlerTargetsPort(handler, port)) {
          urls.push(tailscaleControllerUrl(host, handlerPath));
        }
      }
    }
  }
  for (const child of Object.values(value)) {
    urls.push(...collectTailscaleControlUrls(child, port));
  }
  return urls;
}

function handlerTargetsPort(handler: unknown, port: number): boolean {
  return Boolean(handler && typeof handler === 'object' && 'Proxy' in handler && typeof handler.Proxy === 'string' && proxyTargetsPort(handler.Proxy, port));
}

function proxyTargetsPort(proxy: string, port: number): boolean {
  try {
    const url = new URL(proxy);
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname) && Number(url.port) === port;
  } catch {
    return proxy.endsWith(`:${port}`);
  }
}

function tailscaleControllerUrl(host: string, handlerPath: string): string {
  const publicHost = host.endsWith(':443') ? host.slice(0, -4) : host;
  const basePath = handlerPath === '/' ? '' : `/${handlerPath.replace(/^\/+|\/+$/g, '')}`;
  return `https://${publicHost}${basePath}/control`;
}

function localControlUrls(port: number): string[] {
  const urls: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${port}/control`);
      }
    }
  }
  urls.push(`http://localhost:${port}/control`);
  return urls;
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))];
}
