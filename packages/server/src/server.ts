import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import { execFile } from 'node:child_process';
import http, { type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { compileDeck, createSlideSource, pathExists, readSlideSource, writeSlideSource, type CreateSlideOptions, type EditableSlideInput } from '@ajfisher/presso-core';
import { readRuntimeAsset, renderPage, runtimeAssetNames, type RenderMode, type RuntimeAssetName } from '@ajfisher/presso-runtime';

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
  let currentIndex = 0;
  let currentFullscreen = false;
  let clientId = 0;
  const clients = new Map<number, Client>();
  let controlUrlCache: { expiresAt: number; urls: string[] } | undefined;
  let suppressReloadUntil = 0;

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
      if (url.pathname === '/edit/slides') {
        suppressReloadUntil = Date.now() + 500;
        await handleCreateSlide(cwd, req, res, (slideIndex) => {
          currentIndex = slideIndex;
          broadcast(clients, 'state', { fullscreen: currentFullscreen, index: currentIndex });
        }, () => {
          suppressReloadUntil = 0;
          broadcast(clients, 'reload', {});
        });
        return;
      }
      if (url.pathname === '/edit/slide') {
        await handleEditSlide(cwd, req, res, url);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/events') {
        const id = ++clientId;
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive'
        });
        res.write(`event: state\ndata: ${JSON.stringify({ fullscreen: currentFullscreen, index: currentIndex })}\n\n`);
        clients.set(id, { id, res });
        req.on('close', () => clients.delete(id));
        return;
      }
      if (url.pathname === '/state') {
        if (req.method === 'GET') {
          sendJson(res, { fullscreen: currentFullscreen, index: currentIndex });
          return;
        }
        if (req.method === 'POST') {
          const deck = await compileDeck(cwd);
          const body = await readBody(req);
          const state = parseJsonObject(body);
          currentIndex = clampStateIndex(state.index ?? currentIndex, deck.slides.length, currentIndex);
          if (typeof state.fullscreen === 'boolean') currentFullscreen = state.fullscreen;
          const nextState = { fullscreen: currentFullscreen, index: currentIndex };
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

      const runtimeAsset = runtimeAssetName(url.pathname);
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
      if (url.pathname === '/deck.json') {
        sendJson(res, deck);
        return;
      }
      const mode = ROUTE_MODES.get(url.pathname);
      if (mode) {
        sendHtml(res, renderPage(deck, mode, { controlUrls: await controlUrls(), server: true }));
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
    if (Date.now() < suppressReloadUntil) return;
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
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  const roots = [
    cwd,
    path.join(cwd, 'public')
  ];
  for (const root of roots) {
    const file = path.resolve(root, clean);
    if (!isInside(root, file)) continue;
    if (await pathExists(file)) {
      const stat = await fs.stat(file);
      if (!stat.isFile()) continue;
      res.writeHead(200, { 'content-type': contentType(file) });
      res.end(await fs.readFile(file));
      return true;
    }
  }
  return false;
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

async function handleCreateSlide(
  cwd: string,
  req: http.IncomingMessage,
  res: ServerResponse,
  onCreated: (index: number) => void,
  afterResponse: () => void
): Promise<void> {
  try {
    if (req.method !== 'POST') {
      sendJson(res, { error: 'Create slide endpoint supports POST only.' }, 405);
      return;
    }
    const input = parseCreateSlideInput(parseJsonObject(await readBody(req)));
    const created = await createSlideSource(cwd, input);
    onCreated(created.index);
    sendJson(res, created);
    setTimeout(afterResponse, 50);
  } catch (error) {
    sendJson(res, { error: error instanceof Error ? error.message : String(error) }, 400);
  }
}

async function handleEditSlide(cwd: string, req: http.IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  try {
    const index = parseSlideIndex(url);
    if (req.method === 'GET') {
      sendJson(res, await readSlideSource(cwd, index));
      return;
    }
    if (req.method === 'PUT') {
      const input = parseEditInput(parseJsonObject(await readBody(req)));
      const saved = await writeSlideSource(cwd, index, input);
      sendJson(res, saved);
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

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
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

function contentType(file: string): string {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function runtimeAssetName(pathname: string): RuntimeAssetName | undefined {
  const clean = pathname.replace(/^\/+/, '');
  const name = clean.startsWith('_presso/') ? clean.slice('_presso/'.length) : clean;
  return runtimeAssetNames.includes(name as RuntimeAssetName) ? name as RuntimeAssetName : undefined;
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
