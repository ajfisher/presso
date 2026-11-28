import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkOrder, compileDeck, parseOrderFile, readSlideSource, writeSlideSource } from './index.js';

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
      'image-title',
      'mobile-swipe'
    ]);
    expect(deck.slides[0]!.layout).toBe('title');
    expect(deck.slides[1]!.buildSteps).toBe(3);
    expect(deck.slides[2]!.buildSteps).toBe(8);
    expect(deck.slides[2]!.notesMarkdown).toContain('two-column build');
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

  it('normalizes multiple slide classes from list and string metadata', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-slide-classes-'));
    await fs.mkdir(path.join(dir, 'slides'));
    await fs.writeFile(path.join(dir, 'presso.config.ts'), 'export default { source: { type: "folder", path: "./slides" } };\n');
    await fs.writeFile(path.join(dir, 'slides', '001-list.md'), `---
id: list
class:
  - dense
  - two-column
---
# List
`);
    await fs.writeFile(path.join(dir, 'slides', '002-string.md'), `---
id: string
class: hero invert
---
# String
`);

    const deck = await compileDeck(dir);

    expect(deck.slides[0]!.class).toEqual(['dense', 'two-column']);
    expect(deck.slides[1]!.class).toEqual(['hero', 'invert']);
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
    await fs.writeFile(path.join(dir, 'slides', '004-system-color.md'), `---
id: system-color
background: Canvas
---
# System Colour
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
    expect(deck.slides[3]!.background).toEqual({ color: 'Canvas' });
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

  it('normalizes slide vars for CSS and preserves their authored keys and types on writeback', async () => {
    const vars = { stagger: '2s', '--presso-column-gap': '1rem', columns: 2 };
    await withSlideVars(vars, async (dir) => {
      const source = await readSlideSource(dir, 0);
      await writeSlideSource(dir, 0, { ...source, bodyMarkdown: '# Edited' });
      const [slide] = (await compileDeck(dir)).slides;
      expect(slide?.vars).toEqual({ '--stagger': '2s', '--presso-column-gap': '1rem', '--columns': '2' });
      expect(slide?.metadata.vars).toEqual(vars);
    });
  });

  it.each([';', '{', '}', '</', false, ['red']])('rejects invalid slide var values (%j)', async (value) => {
    await withSlideVars({ tone: value }, async (dir) => {
      await expect(compileDeck(dir)).rejects.toThrow('Invalid vars value for "tone" on slide "example"');
    });
  });

  it.each(['-tone', '--2tone', 'bad key'])('rejects an invalid slide var name (%s)', async (key) => {
    await withSlideVars({ [key]: 'red' }, async (dir) => {
      await expect(compileDeck(dir)).rejects.toThrow(`Invalid vars key "${key}" on slide "example"`);
    });
  });

  it('requires a map for slide vars', async () => {
    await withSlideVars(['red'], async (dir) => {
      await expect(compileDeck(dir)).rejects.toThrow('Invalid vars on slide "example". Expected a map');
    });
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

async function withSlideVars(vars: unknown, check: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-vars-'));
  try {
    await fs.mkdir(path.join(dir, 'slides'));
    await fs.writeFile(path.join(dir, 'slides', '001-example.md'), `---\nid: example\nvars: ${JSON.stringify(vars)}\n---\n# Example\n`);
    await check(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
