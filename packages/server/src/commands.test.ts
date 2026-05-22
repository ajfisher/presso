import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addSlide, createDeck, orderCheck, orderInit } from './commands.js';

describe('CLI command helpers', () => {
  it('scaffolds a starter deck and adds the next numbered slide', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-create-'));
    await createDeck(dir);
    const newSlide = await addSlide(dir);
    expect(path.basename(newSlide)).toBe('004-untitled.md');
  });

  it('initialises and checks an order file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-order-'));
    await createDeck(dir);
    await orderInit(dir);
    const result = JSON.parse(await orderCheck(dir));
    expect(result).toEqual({ missing: [], duplicate: [], orphaned: [] });
  });

  it('adds new slides to existing order files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-order-add-'));
    await createDeck(dir);
    await orderInit(dir);

    const newSlide = await addSlide(dir);

    expect(path.basename(newSlide)).toBe('004-untitled.md');
    expect(await fs.readFile(path.join(dir, 'slides.order'), 'utf8')).toContain('slides/004-untitled.md');
    const result = JSON.parse(await orderCheck(dir));
    expect(result).toEqual({ missing: [], duplicate: [], orphaned: [] });
  });

  it('adds new sections to single-file decks', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-single-add-'));
    await fs.writeFile(path.join(dir, 'presso.config.mjs'), 'export default { source: { type: "file", path: "./slides.md" } };\n');
    await fs.writeFile(path.join(dir, 'slides.md'), '::slide\n---\nid: one\n---\n# One\n');

    const sourceFile = await addSlide(dir);

    expect(path.basename(sourceFile)).toBe('slides.md');
    const source = await fs.readFile(path.join(dir, 'slides.md'), 'utf8');
    expect(source).toContain('::slide\n---\nid: untitled-002\nlayout: statement');
    expect(source).toContain('## Untitled');
  });
});
