import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildStatic } from './index.js';

const tmpRoots: string[] = [];

describe('static export', () => {
  afterEach(async () => {
    await Promise.all(tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('does not emit private notes into public static artifacts', async () => {
    const root = await createDeck(false);
    const dest = await buildStatic(root, path.join(root, 'dist'));
    const output = await readTextArtifacts(dest);

    expect(output).not.toContain('SECRET_PRIVATE_NOTE');
    expect(output).toContain('Notes are private');
    expect(output).not.toContain('"rootDir"');
  });

  it('emits public toggle notes and isolated runtime assets', async () => {
    const root = await createDeck('toggle');
    const dest = await buildStatic(root, path.join(root, 'dist'));
    const output = await readTextArtifacts(dest);
    const embed = await fs.readFile(path.join(dest, 'embed/index.html'), 'utf8');

    expect(output).toContain('SECRET_PRIVATE_NOTE');
    expect(await exists(path.join(dest, '_presso/presso.css'))).toBe(true);
    expect(await exists(path.join(dest, '_presso/presso-runtime.js'))).toBe(true);
    expect(await exists(path.join(dest, 'assets/example.svg'))).toBe(true);
    expect(embed).toContain('href="../_presso/presso.css"');
    expect(embed).toContain('src="../_presso/presso-runtime.js"');
    expect(embed).toContain('src="../assets/example.svg"');
  });
});

async function createDeck(publicNotes: false | 'toggle'): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-export-'));
  tmpRoots.push(root);
  await fs.mkdir(path.join(root, 'slides'), { recursive: true });
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  await fs.writeFile(path.join(root, 'theme.css'), ':root { --presso-accent: #00a1b2; }\n');
  await fs.writeFile(path.join(root, 'assets/example.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>\n');
  await fs.writeFile(path.join(root, 'presso.config.mjs'), `export default {
  title: 'Export Test',
  source: { type: 'folder', path: './slides' },
  theme: './theme.css',
  notes: { public: ${publicNotes === false ? 'false' : `'${publicNotes}'`} }
};
`);
  await fs.writeFile(path.join(root, 'slides/001-title.md'), `---
id: title
layout: image
---

![Example](./assets/example.svg)

:::notes
SECRET_PRIVATE_NOTE
:::
`);
  return root;
}

async function readTextArtifacts(root: string): Promise<string> {
  const files: string[] = [];
  await collect(root, files);
  const texts = await Promise.all(files
    .filter((file) => /\.(?:html|json|md)$/.test(file))
    .map((file) => fs.readFile(file, 'utf8')));
  return texts.join('\n');
}

async function collect(current: string, files: string[]): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await collect(entryPath, files);
    } else {
      files.push(entryPath);
    }
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
