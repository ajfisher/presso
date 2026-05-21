import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clampStateIndex, controlUrlsFromTailscaleServeStatus, startDevServer, type DevServer } from './server.js';

const tmpRoots: string[] = [];
const servers: DevServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('dev server state', () => {
  it('clamps requested slide indexes to the deck bounds', () => {
    expect(clampStateIndex(2, 5)).toBe(2);
    expect(clampStateIndex(20, 5)).toBe(4);
    expect(clampStateIndex(-4, 5)).toBe(0);
    expect(clampStateIndex('3', 5)).toBe(3);
    expect(clampStateIndex('nope', 5, 2)).toBe(2);
  });

  it('finds tailnet HTTPS controller URLs for the active dev server port', () => {
    const status = JSON.stringify({
      Foreground: {
        '233fb11d226b5e5c': {
          Web: {
            'minerva.taile5f2ff.ts.net:443': {
              Handlers: {
                '/': {
                  Proxy: 'http://127.0.0.1:3030'
                }
              }
            },
            'other.taile5f2ff.ts.net:443': {
              Handlers: {
                '/talk': {
                  Proxy: 'http://127.0.0.1:4040'
                }
              }
            }
          }
        }
      }
    });

    expect(controlUrlsFromTailscaleServeStatus(status, 3030)).toEqual([
      'https://minerva.taile5f2ff.ts.net/control'
    ]);
  });

  it('preserves a Tailscale Serve path prefix when building controller URLs', () => {
    const status = JSON.stringify({
      ServeConfig: {
        Web: {
          'minerva.taile5f2ff.ts.net:443': {
            Handlers: {
              '/presso': {
                Proxy: 'http://localhost:3030'
              }
            }
          }
        }
      }
    });

    expect(controlUrlsFromTailscaleServeStatus(status, 3030)).toEqual([
      'https://minerva.taile5f2ff.ts.net/presso/control'
    ]);
  });
});

describe('dev server slide editing', () => {
  it('reads and writes editable folder slide source', async () => {
    const root = await createFolderDeck();
    const server = await startTestServer(root);

    const source = await getJson(server, '/edit/slide?index=0');
    expect(source).toMatchObject({
      id: 'intro',
      sourcePath: 'slides/001-intro.md',
      bodyMarkdown: '# Intro',
      notesMarkdown: 'Opening notes.'
    });
    expect(source.metadataYaml).toContain('custom: keep-me');

    const saved = await putJson(server, '/edit/slide?index=0', {
      metadataYaml: `${source.metadataYaml}\nnewField: retained`,
      bodyMarkdown: '## Updated from server',
      notesMarkdown: 'Updated notes.'
    });
    expect(saved).toMatchObject({
      bodyMarkdown: '## Updated from server',
      notesMarkdown: 'Updated notes.'
    });

    const file = await fs.readFile(path.join(root, 'slides/001-intro.md'), 'utf8');
    expect(file).toContain('newField: retained');
    expect(file).toContain('## Updated from server');
    expect(file).toContain('Updated notes.');
  });

  it('returns actionable JSON errors for invalid edit requests', async () => {
    const root = await createFolderDeck();
    const server = await startTestServer(root);

    const invalidIndex = await fetch(`${server.origin}/edit/slide?index=nope`);
    expect(invalidIndex.status).toBe(400);
    expect(await invalidIndex.json()).toMatchObject({ error: expect.stringContaining('valid non-negative slide index') });

    const invalidPayload = await fetch(`${server.origin}/edit/slide?index=0`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bodyMarkdown: '# Missing fields' })
    });
    expect(invalidPayload.status).toBe(400);
    expect(await invalidPayload.json()).toMatchObject({ error: expect.stringContaining('metadataYaml') });
  });

  it('rejects single-file decks for local edit writeback', async () => {
    const root = await createSingleFileDeck();
    const server = await startTestServer(root);

    const response = await fetch(`${server.origin}/edit/slide?index=0`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('folder decks only') });
  });

  it('creates folder slides through the dev edit endpoint', async () => {
    const root = await createFolderDeck();
    const server = await startTestServer(root);

    const created = await postJson(server, '/edit/slides', { afterIndex: 0 });

    expect(created).toMatchObject({
      index: 1,
      id: 'untitled-002',
      sourcePath: 'slides/002-untitled.md',
      bodyMarkdown: '## Untitled',
      notesMarkdown: 'Add speaker notes here.'
    });
    expect(created.metadataYaml).toContain('layout: statement');
    expect(await fs.readFile(path.join(root, 'slides/002-untitled.md'), 'utf8')).toContain('id: untitled-002');
    expect(await getJson(server, '/state')).toMatchObject({ index: 1 });
  });

  it('returns actionable JSON errors for invalid create requests', async () => {
    const root = await createFolderDeck();
    const server = await startTestServer(root);

    const invalidPayload = await fetch(`${server.origin}/edit/slides`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ afterIndex: 'nope' })
    });
    expect(invalidPayload.status).toBe(400);
    expect(await invalidPayload.json()).toMatchObject({ error: expect.stringContaining('afterIndex') });

    const invalidIndex = await fetch(`${server.origin}/edit/slides`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ afterIndex: 99 })
    });
    expect(invalidIndex.status).toBe(400);
    expect(await invalidIndex.json()).toMatchObject({ error: expect.stringContaining('Slide index 99 does not exist') });
  });

  it('rejects single-file decks for local slide creation', async () => {
    const root = await createSingleFileDeck();
    const server = await startTestServer(root);

    const response = await fetch(`${server.origin}/edit/slides`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ afterIndex: 0 })
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('folder decks only') });
  });
});

async function startTestServer(root: string): Promise<DevServer> {
  const server = await startDevServer(root, await getFreePort());
  servers.push(server);
  return server;
}

async function getJson(server: DevServer, route: string): Promise<Record<string, string>> {
  const response = await fetch(`${server.origin}${route}`);
  expect(response.ok).toBe(true);
  return await response.json() as Record<string, string>;
}

async function putJson(server: DevServer, route: string, body: unknown): Promise<Record<string, string>> {
  const response = await fetch(`${server.origin}${route}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  expect(response.ok).toBe(true);
  return await response.json() as Record<string, string>;
}

async function postJson(server: DevServer, route: string, body: unknown): Promise<Record<string, string>> {
  const response = await fetch(`${server.origin}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  expect(response.ok).toBe(true);
  return await response.json() as Record<string, string>;
}

async function createFolderDeck(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-server-edit-'));
  tmpRoots.push(root);
  await fs.mkdir(path.join(root, 'slides'), { recursive: true });
  await fs.writeFile(path.join(root, 'presso.config.mjs'), 'export default { source: { type: "folder", path: "./slides" } };\n');
  await fs.writeFile(path.join(root, 'slides/001-intro.md'), `---
id: intro
layout: title
custom: keep-me
---

# Intro

:::notes
Opening notes.
:::
`);
  return root;
}

async function createSingleFileDeck(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-server-edit-file-'));
  tmpRoots.push(root);
  await fs.writeFile(path.join(root, 'presso.config.mjs'), 'export default { source: { type: "file", path: "./slides.md" } };\n');
  await fs.writeFile(path.join(root, 'slides.md'), '::slide\n---\nid: one\n---\n# One\n');
  return root;
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
  if (!address || typeof address === 'string') throw new Error('No free TCP port was assigned.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
