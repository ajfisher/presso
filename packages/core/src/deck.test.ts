import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkOrder, compileDeck, parseOrderFile } from './index.js';

describe('deck compilation', () => {
  it('loads the example fixture in numeric filename order', async () => {
    const deck = await compileDeck(path.resolve('examples/basic'));
    expect(deck.slides.map((slide) => slide.id)).toEqual([
      'title',
      'content',
      'notes',
      'section',
      'statement',
      'image',
      'logos',
      'code',
      'demo',
      'blank',
      'image-title'
    ]);
    expect(deck.slides[0]!.layout).toBe('title');
    expect(deck.slides[2]!.notesMarkdown).toContain('Speaker notes');
  });

  it('parses single-file decks using ::slide boundaries', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-single-'));
    await fs.writeFile(
      path.join(dir, 'presso.config.ts'),
      'export default { source: { type: "file", path: "./slides.md" } };\n'
    );
    await fs.writeFile(
      path.join(dir, 'slides.md'),
      `::slide
---
id: first
layout: title
---
# First

:::notes
First notes
:::

::slide
---
id: second
---
## Second
`
    );
    const deck = await compileDeck(dir);
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0]!.notesMarkdown).toBe('First notes');
    expect(deck.slides[1]!.title).toBe('Second');
  });

  it('normalizes slide background shorthand and object metadata', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-backgrounds-'));
    await fs.mkdir(path.join(dir, 'slides'));
    await fs.writeFile(path.join(dir, 'presso.config.ts'), 'export default { source: { type: "folder", path: "./slides" } };\n');
    await fs.writeFile(path.join(dir, 'slides', '001-image.md'), `---
id: image
background: ./assets/open.webp
backgroundFit: contain
---
# Image
`);
    await fs.writeFile(path.join(dir, 'slides', '002-color.md'), `---
id: color
background: rebeccapurple
---
# Colour
`);
    await fs.writeFile(path.join(dir, 'slides', '003-object.md'), `---
id: object
background:
  image: ./assets/team.webp
  color: "#10131a"
  fit: cover
  position: center top
  repeat: no-repeat
  overlay:
    type: scrim
    direction: left
    strength: 0.35
---
# Object
`);

    const deck = await compileDeck(dir);

    expect(deck.slides[0]!.background).toEqual({ image: './assets/open.webp', fit: 'contain' });
    expect(deck.slides[1]!.background).toEqual({ color: 'rebeccapurple' });
    expect(deck.slides[2]!.background).toEqual({
      image: './assets/team.webp',
      color: '#10131a',
      fit: 'cover',
      position: 'center top',
      repeat: 'no-repeat',
      overlay: {
        type: 'scrim',
        direction: 'left',
        strength: 0.35
      }
    });
  });

  it('rejects invalid background objects with source context', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-background-invalid-'));
    await fs.mkdir(path.join(dir, 'slides'));
    await fs.writeFile(path.join(dir, 'presso.config.ts'), 'export default { source: { type: "folder", path: "./slides" } };\n');
    await fs.writeFile(path.join(dir, 'slides', '001-invalid.md'), `---
id: invalid
background:
  fit: cover
---
# Invalid
`);

    await expect(compileDeck(dir)).rejects.toThrow('Invalid slide background in slides/001-invalid.md');
  });

  it('rejects duplicate slide ids with source paths', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-duplicate-ids-'));
    await fs.mkdir(path.join(dir, 'slides'));
    await fs.writeFile(path.join(dir, 'presso.config.ts'), 'export default { source: { type: "folder", path: "./slides" } };\n');
    await fs.writeFile(path.join(dir, 'slides', '001-one.md'), '---\nid: duplicate\n---\n# One\n');
    await fs.writeFile(path.join(dir, 'slides', '002-two.md'), '---\nid: duplicate\n---\n# Two\n');

    await expect(compileDeck(dir)).rejects.toThrow('Duplicate slide id: "duplicate" in slides/001-one.md#1 and slides/002-two.md#2');
  });

  it('rejects duplicate slide ids in single-file decks with slide positions', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-duplicate-single-'));
    await fs.writeFile(
      path.join(dir, 'presso.config.ts'),
      'export default { source: { type: "file", path: "./slides.md" } };\n'
    );
    await fs.writeFile(
      path.join(dir, 'slides.md'),
      `::slide
---
id: duplicate
---
# One

::slide
---
id: duplicate
---
# Two
`
    );

    await expect(compileDeck(dir)).rejects.toThrow('Duplicate slide id: "duplicate" in slides.md#1 and slides.md#2');
  });

  it('reports order-file duplicate and missing entries', () => {
    const all = ['/deck/slides/a.md', '/deck/slides/b.md'];
    const check = checkOrder(all, ['/deck/slides/a.md', '/deck/slides/a.md', '/deck/slides/c.md']);
    expect(check.duplicate).toContain('/deck/slides/a.md');
    expect(check.missing).toContain('/deck/slides/c.md');
    expect(check.orphaned).toContain('/deck/slides/b.md');
  });

  it('parses plain slides.order files', () => {
    expect(parseOrderFile('# hi\nslides/a.md\n\nslides/b.md')).toEqual(['slides/a.md', 'slides/b.md']);
  });
});
