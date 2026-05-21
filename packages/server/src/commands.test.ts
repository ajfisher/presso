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
});
