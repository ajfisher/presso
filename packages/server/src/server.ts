import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import http, { type ServerResponse } from 'node:http';
import path from 'node:path';
import { compileDeck, pathExists } from '@presso/core';
import { readRuntimeAsset, renderPage, runtimeAssetNames, type RenderMode, type RuntimeAssetName } from '@presso/runtime';

interface Client {
  id: number;
  res: ServerResponse;
}

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
  ['/print/notes-side', 'print-notes-side'],
  ['/print/notes-side/', 'print-notes-side'],
  ['/print/notes-pages', 'print-notes-pages'],
  ['/print/notes-pages/', 'print-notes-pages']
]);

export async function startDevServer(cwd = process.cwd(), port = 3030): Promise<void> {
  let currentIndex = 0;
  let currentFullscreen = false;
  let clientId = 0;
  const clients = new Map<number, Client>();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
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
      if (url.pathname === '/command' && req.method === 'POST') {
        const body = await readBody(req);
        const command = parseJsonObject(body);
        if (typeof command.type === 'string') {
          broadcast(clients, 'command', command);
          sendJson(res, { ok: true });
          return;
        }
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Command type is required.' }));
        return;
      }

      const runtimeAsset = runtimeAssetName(url.pathname);
      if (runtimeAsset) {
        const asset = readRuntimeAsset(runtimeAsset);
        res.writeHead(200, { 'content-type': asset.contentType });
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
        sendHtml(res, renderPage(deck, mode, { server: true }));
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

  watch(cwd, { recursive: true }, (_event, fileName) => {
    if (fileName && String(fileName).includes('node_modules')) return;
    broadcast(clients, 'reload', {});
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`Presso dev server running at http://localhost:${port}`);
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
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendJson(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
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
