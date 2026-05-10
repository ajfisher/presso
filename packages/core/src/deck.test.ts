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
      'blank'
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
