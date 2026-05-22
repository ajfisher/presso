import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileDeck, createFolderSlideSource, createSlideSource, readFolderSlideSource, readSlideSource, writeFolderSlideSource, writeSlideSource } from './index.js';

const tmpRoots: string[] = [];

describe('folder slide editing', () => {
  afterEach(async () => {
    await Promise.all(tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('reads a folder slide into metadata, body, and notes fields', async () => {
    const root = await createFolderDeck();
    const source = await readFolderSlideSource(root, 0);

    expect(source).toMatchObject({
      index: 0,
      id: 'intro',
      sourcePath: 'slides/001-intro.md',
      title: 'Intro'
    });
    expect(source.metadataYaml).toContain('layout: title');
    expect(source.metadataYaml).toContain('custom: keep-me');
    expect(source.bodyMarkdown).toBe('# Intro');
    expect(source.notesMarkdown).toBe('Opening **notes**.');
  });

  it('writes only the active folder slide and preserves unknown frontmatter', async () => {
    const root = await createFolderDeck();
    const secondPath = path.join(root, 'slides/002-detail.md');
    const secondBefore = await fs.readFile(secondPath, 'utf8');
    const source = await readFolderSlideSource(root, 0);

    await writeFolderSlideSource(root, 0, {
      metadataYaml: `${source.metadataYaml}\nnewField: retained`,
      bodyMarkdown: '## Updated intro\n\n- One\n- Two',
      notesMarkdown: 'Changed notes.'
    });

    expect(await fs.readFile(secondPath, 'utf8')).toBe(secondBefore);
    const deck = await compileDeck(root);
    expect(deck.slides[0]!.metadata.custom).toBe('keep-me');
    expect(deck.slides[0]!.metadata.newField).toBe('retained');
    expect(deck.slides[0]!.bodyMarkdown).toContain('Updated intro');
    expect(deck.slides[0]!.notesMarkdown).toBe('Changed notes.');
  });

  it('preserves internal body and notes line breaks through writeback', async () => {
    const root = await createFolderDeck();
    const metadata = (await readFolderSlideSource(root, 0)).metadataYaml;

    await writeFolderSlideSource(root, 0, {
      metadataYaml: metadata,
      bodyMarkdown: 'Line one\nLine two\n\nLine four',
      notesMarkdown: 'Note one\nNote two\n\nNote four'
    });

    const source = await readFolderSlideSource(root, 0);
    expect(source.bodyMarkdown).toBe('Line one\nLine two\n\nLine four');
    expect(source.notesMarkdown).toBe('Note one\nNote two\n\nNote four');

    const file = await fs.readFile(path.join(root, 'slides/001-intro.md'), 'utf8');
    expect(file).toContain('Line one\nLine two\n\nLine four');
    expect(file).toContain('Note one\nNote two\n\nNote four');
  });

  it('can remove notes without leaving an empty notes block', async () => {
    const root = await createFolderDeck();
    const source = await readFolderSlideSource(root, 0);

    await writeFolderSlideSource(root, 0, {
      metadataYaml: source.metadataYaml,
      bodyMarkdown: source.bodyMarkdown,
      notesMarkdown: ''
    });

    const output = await fs.readFile(path.join(root, 'slides/001-intro.md'), 'utf8');
    expect(output).not.toContain(':::notes');
    expect((await compileDeck(root)).slides[0]!.notesMarkdown).toBe('');
  });

  it('rejects invalid metadata without changing the slide file', async () => {
    const root = await createFolderDeck();
    const slidePath = path.join(root, 'slides/001-intro.md');
    const before = await fs.readFile(slidePath, 'utf8');

    await expect(writeFolderSlideSource(root, 0, {
      metadataYaml: 'id: [',
      bodyMarkdown: '# Broken',
      notesMarkdown: 'Broken'
    })).rejects.toThrow('Invalid slide metadata');

    expect(await fs.readFile(slidePath, 'utf8')).toBe(before);
  });

  it('rejects single-file decks for this editing slice', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-edit-file-'));
    tmpRoots.push(root);
    await fs.writeFile(path.join(root, 'presso.config.mjs'), 'export default { source: { type: "file", path: "./slides.md" } };\n');
    await fs.writeFile(path.join(root, 'slides.md'), '::slide\n---\nid: one\n---\n# One\n');

    await expect(readFolderSlideSource(root, 0)).rejects.toThrow('folder decks only');
  });

  it('creates the next numeric slide in folder decks', async () => {
    const root = await createFolderDeck();

    const source = await createFolderSlideSource(root, { afterIndex: 1 });

    expect(source).toMatchObject({
      index: 2,
      id: 'untitled-003',
      sourcePath: 'slides/003-untitled.md',
      title: 'Untitled',
      bodyMarkdown: '## Untitled',
      notesMarkdown: 'Add speaker notes here.'
    });
    expect(source.metadataYaml).toContain('layout: statement');
    expect(await fs.readFile(path.join(root, 'slides/003-untitled.md'), 'utf8')).toContain('id: untitled-003');
    expect((await compileDeck(root)).slides.map((slide) => slide.sourcePath)).toEqual([
      'slides/001-intro.md',
      'slides/002-detail.md',
      'slides/003-untitled.md'
    ]);
  });

  it('creates slides inside a custom folder source path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-edit-custom-source-'));
    tmpRoots.push(root);
    await fs.mkdir(path.join(root, 'talk-slides'), { recursive: true });
    await fs.writeFile(path.join(root, 'presso.config.mjs'), 'export default { source: { type: "folder", path: "./talk-slides" } };\n');
    await fs.writeFile(path.join(root, 'talk-slides/010-existing.md'), '---\nid: existing\n---\n# Existing\n');

    const source = await createFolderSlideSource(root);

    expect(source.sourcePath).toBe('talk-slides/011-untitled.md');
    expect(await fs.readFile(path.join(root, 'talk-slides/011-untitled.md'), 'utf8')).toContain('## Untitled');
  });

  it('inserts created slides into slides.order after the active slide', async () => {
    const root = await createFolderDeck();
    await fs.writeFile(path.join(root, 'slides.order'), [
      '# intro comment',
      'slides/001-intro.md',
      '',
      'slides/002-detail.md',
      ''
    ].join('\n'));

    const source = await createFolderSlideSource(root, { afterIndex: 0 });

    expect(source.index).toBe(1);
    expect(source.sourcePath).toBe('slides/003-untitled.md');
    expect(await fs.readFile(path.join(root, 'slides.order'), 'utf8')).toBe([
      '# intro comment',
      'slides/001-intro.md',
      'slides/003-untitled.md',
      '',
      'slides/002-detail.md',
      ''
    ].join('\n'));
    expect((await compileDeck(root)).slides.map((slide) => slide.sourcePath)).toEqual([
      'slides/001-intro.md',
      'slides/003-untitled.md',
      'slides/002-detail.md'
    ]);
  });

  it('appends created slides to slides.order when no active slide is provided', async () => {
    const root = await createFolderDeck();
    await fs.writeFile(path.join(root, 'slides.order'), '# ordered slides\nslides/001-intro.md\nslides/002-detail.md\n');

    const source = await createFolderSlideSource(root);

    expect(source.index).toBe(2);
    expect(await fs.readFile(path.join(root, 'slides.order'), 'utf8')).toBe('# ordered slides\nslides/001-intro.md\nslides/002-detail.md\nslides/003-untitled.md\n');
  });

  it('rejects single-file decks for slide creation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-edit-create-file-'));
    tmpRoots.push(root);
    await fs.writeFile(path.join(root, 'presso.config.mjs'), 'export default { source: { type: "file", path: "./slides.md" } };\n');
    await fs.writeFile(path.join(root, 'slides.md'), '::slide\n---\nid: one\n---\n# One\n');

    await expect(createFolderSlideSource(root)).rejects.toThrow('folder decks only');
  });
});

describe('single-file slide editing', () => {
  afterEach(async () => {
    await Promise.all(tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('reads a single-file slide into metadata, body, and notes fields', async () => {
    const root = await createSingleFileDeck();
    const source = await readSlideSource(root, 1);

    expect(source).toMatchObject({
      index: 1,
      id: 'two',
      sourcePath: 'slides.md',
      title: 'Second',
      bodyMarkdown: '## Second',
      notesMarkdown: 'Second notes.'
    });
    expect(source.metadataYaml).toContain('layout: statement');
    expect(source.metadataYaml).toContain('custom: keep-me');
  });

  it('writes only the active single-file slide section', async () => {
    const root = await createSingleFileDeck();
    const filePath = path.join(root, 'slides.md');
    const before = await fs.readFile(filePath, 'utf8');
    const firstSectionBefore = before.slice(before.indexOf('::slide'), before.indexOf('\n::slide', before.indexOf('::slide') + 1));
    const source = await readSlideSource(root, 1);

    await writeSlideSource(root, 1, {
      metadataYaml: `${source.metadataYaml}\nnewField: retained`,
      bodyMarkdown: '## Updated second\n\nLine one\nLine two',
      notesMarkdown: 'Updated second notes.'
    });

    const after = await fs.readFile(filePath, 'utf8');
    const firstSectionAfter = after.slice(after.indexOf('::slide'), after.indexOf('\n::slide', after.indexOf('::slide') + 1));
    expect(firstSectionAfter).toBe(firstSectionBefore);
    const deck = await compileDeck(root);
    expect(deck.slides[1]!.metadata.custom).toBe('keep-me');
    expect(deck.slides[1]!.metadata.newField).toBe('retained');
    expect(deck.slides[1]!.bodyMarkdown).toContain('Updated second');
    expect(deck.slides[1]!.notesMarkdown).toBe('Updated second notes.');
  });

  it('can add and remove notes from single-file slides', async () => {
    const root = await createSingleFileDeck();
    const first = await readSlideSource(root, 0);

    await writeSlideSource(root, 0, {
      metadataYaml: first.metadataYaml,
      bodyMarkdown: first.bodyMarkdown,
      notesMarkdown: ''
    });
    expect((await readSlideSource(root, 0)).notesMarkdown).toBe('');

    const second = await readSlideSource(root, 1);
    await writeSlideSource(root, 1, {
      metadataYaml: second.metadataYaml,
      bodyMarkdown: second.bodyMarkdown,
      notesMarkdown: 'Fresh notes.'
    });
    expect((await compileDeck(root)).slides[1]!.notesMarkdown).toBe('Fresh notes.');
  });

  it('rejects invalid single-file metadata without changing the source file', async () => {
    const root = await createSingleFileDeck();
    const filePath = path.join(root, 'slides.md');
    const before = await fs.readFile(filePath, 'utf8');

    await expect(writeSlideSource(root, 1, {
      metadataYaml: 'id: [',
      bodyMarkdown: '## Broken',
      notesMarkdown: 'Broken'
    })).rejects.toThrow('Invalid slide metadata');

    expect(await fs.readFile(filePath, 'utf8')).toBe(before);
  });

  it('creates a single-file slide after the active section', async () => {
    const root = await createSingleFileDeck();

    const source = await createSlideSource(root, { afterIndex: 0 });

    expect(source).toMatchObject({
      index: 1,
      id: 'untitled-004',
      sourcePath: 'slides.md',
      title: 'Untitled',
      bodyMarkdown: '## Untitled',
      notesMarkdown: 'Add speaker notes here.'
    });
    expect(source.metadataYaml).toContain('layout: statement');
    expect((await compileDeck(root)).slides.map((slide) => slide.id)).toEqual([
      'one',
      'untitled-004',
      'two',
      'three'
    ]);

    const output = await fs.readFile(path.join(root, 'slides.md'), 'utf8');
    expect(output).toContain('id: untitled-004');
    expect(output.indexOf('id: one')).toBeLessThan(output.indexOf('id: untitled-004'));
    expect(output.indexOf('id: untitled-004')).toBeLessThan(output.indexOf('id: two'));
  });

  it('appends a single-file slide when no active slide is provided', async () => {
    const root = await createSingleFileDeck();

    const source = await createSlideSource(root);

    expect(source).toMatchObject({
      index: 3,
      id: 'untitled-004',
      sourcePath: 'slides.md'
    });
    expect((await compileDeck(root)).slides.map((slide) => slide.id)).toEqual([
      'one',
      'two',
      'three',
      'untitled-004'
    ]);
  });

  it('rejects invalid single-file create indexes without changing the source file', async () => {
    const root = await createSingleFileDeck();
    const filePath = path.join(root, 'slides.md');
    const before = await fs.readFile(filePath, 'utf8');

    await expect(createSlideSource(root, { afterIndex: 99 })).rejects.toThrow('Slide index 99 does not exist');

    expect(await fs.readFile(filePath, 'utf8')).toBe(before);
  });
});

async function createFolderDeck(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-edit-folder-'));
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
Opening **notes**.
:::
`);
  await fs.writeFile(path.join(root, 'slides/002-detail.md'), `---
id: detail
layout: bullets
---

## Detail

:::notes
Detail notes.
:::
`);
  return root;
}

async function createSingleFileDeck(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-edit-single-file-'));
  tmpRoots.push(root);
  await fs.writeFile(path.join(root, 'presso.config.mjs'), 'export default { source: { type: "file", path: "./slides.md" } };\n');
  await fs.writeFile(path.join(root, 'slides.md'), `# Preamble stays put

::slide
---
id: one
layout: title
---

# First

:::notes
First notes.
:::

::slide
---
id: two
layout: statement
custom: keep-me
---

## Second

:::notes
Second notes.
:::

::slide
---
id: three
layout: bullets
---

## Third
`);
  return root;
}
