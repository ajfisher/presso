import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addSlide, createDeck, migrateRevealDeck, orderCheck, orderInit } from './commands.js';
import { deckStatsCommand } from './stats.js';

describe('CLI command helpers', () => {
  it('reports stats as a table or JSON using the CLI flags', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-stats-'));
    try {
      await fs.mkdir(path.join(dir, 'slides'));
      await fs.writeFile(path.join(dir, 'presso.config.mjs'), 'export default { timing: { length: "1:30" } };\n');
      await fs.writeFile(path.join(dir, 'slides/001-opening.md'), `---
id: opening
layout: bullets
time: "1:00"
---
:::fragment
- A
- B
:::

:::notes
Speak **now**.
:::
`);
      const table = await deckStatsCommand([dir, '--wpm', '120', '--min-words=1']);
      expect(table).toMatch(/0\s+opening\s+bullets\s+2\s+2\s+0\.7\s+1:00\s+!/);
      expect(table).toContain('1 slide, 2 advances, 2 notes words, about 0:01 at 120 wpm');
      expect(table).toContain('One advance every 45 s against a 1:30 target');
      expect(table).toContain('opening (2 steps, 2 words)');
      const json = JSON.parse(await deckStatsCommand([dir, '--wpm=120', '--min-words', '1', '--json']));
      expect(json).toMatchObject({
        wordsPerMinute: 120, minWordsPerAdvance: 1,
        slides: [{ id: 'opening', buildSteps: 2, advances: 3, notesWords: 2, targetTimeSeconds: 60, flagged: true }],
        totals: { slides: 1, advances: 2, notesWords: 2, estimatedSpeakingSeconds: 1, plannedSeconds: 90, secondsPerAdvance: 45 }
      });
      await expect(deckStatsCommand([dir, '--min-words='])).rejects.toThrow('--min-words must be a non-negative number');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

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

  it('migrates a minimal Reveal deck to a folder Presso deck', async () => {
    const source = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-reveal-source-'));
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-reveal-target-'));
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(path.join(source, 'src', 'images'), { recursive: true });
    await fs.mkdir(path.join(source, 'src', 'static'), { recursive: true });
    await fs.writeFile(path.join(source, 'src', 'images', 'hero.png'), 'image');
    await fs.writeFile(path.join(source, 'src', 'static', 'slides.pdf'), 'pdf');
    await fs.writeFile(path.join(source, 'src', 'slides.md'), `<!-- .slide: class="title" data-timing="30" -->
# Opening

Notes:
Opening notes.

---

<!-- .slide: data-background="/images/hero.png" class="lgimage" -->
## Image slide

<!-- .element: class="caption" -->

Notes:
Image notes.

---

<!-- .slide: data-background="#FFFFFF" class="brands" -->
## Logos

![One](/images/hero.png)
![Two](/images/hero.png)

---

## Two columns

<div class="twocolumn">

![One](/images/hero.png)

Column text.

</div>

---

## Ambiguous columns

<div class="twocolumn">
Only one column-like block.
</div>
`);

    await migrateRevealDeck(source, target);

    const first = await fs.readFile(path.join(target, 'slides', '001-opening.md'), 'utf8');
    const second = await fs.readFile(path.join(target, 'slides', '002-image-slide.md'), 'utf8');
    const third = await fs.readFile(path.join(target, 'slides', '003-logos.md'), 'utf8');
    const fourth = await fs.readFile(path.join(target, 'slides', '004-two-columns.md'), 'utf8');
    const fifth = await fs.readFile(path.join(target, 'slides', '005-ambiguous-columns.md'), 'utf8');
    const theme = await fs.readFile(path.join(target, 'theme.css'), 'utf8');
    const report = await fs.readFile(path.join(target, 'MIGRATION.md'), 'utf8');

    expect(first).toContain('layout: "title"');
    expect(first).toContain('time: "0:30"');
    expect(first).toContain(':::notes\nOpening notes.\n:::');
    expect(second).toContain('layout: "image-title"');
    expect(second).toContain('image: "./assets/images/hero.png"');
    expect(third).toContain('layout: "logos"');
    expect(third).toContain('color: "#FFFFFF"');
    expect(third).toContain(':::logos');
    expect(fourth).toContain('layout: "two-column"');
    expect(fourth).toContain(':::column\n![One](./assets/images/hero.png)\n:::');
    expect(fourth).toContain(':::column\nColumn text.\n:::');
    expect(fifth).toContain('<div class="twocolumn">');
    expect(theme).toContain('background-color: var(--presso-bg-color, var(--presso-bg));');
    expect(report).toContain('Unsupported Reveal element comment');
    expect(report).toContain('Ambiguous twocolumn wrapper');
    expect(await fs.readFile(path.join(target, 'assets', 'images', 'hero.png'), 'utf8')).toBe('image');
    expect(await fs.readFile(path.join(target, 'public', 'static', 'slides.pdf'), 'utf8')).toBe('pdf');
  });
});
