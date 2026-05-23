import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildStatic, exportTranscript, pdfOutputFile, resolvePdfLayout } from './index.js';

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

  it('emits a sanitized public deck manifest without internal source fields', async () => {
    const root = await createDeck(false, { includeSlideManifestFields: true });
    const dest = await buildStatic(root, path.join(root, 'dist'));
    const manifest = await readDeckManifest(dest);
    const serialized = JSON.stringify(manifest);

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      deck: {
        aspectRatio: '16:9',
        author: 'ajfisher',
        baseUrl: 'https://talk.example.test',
        canonicalUrl: 'https://talk.example.test',
        embedUrl: 'https://talk.example.test/embed/',
        pdfUrl: 'https://talk.example.test/slides.pdf',
        size: { height: 720, width: 1280 },
        tags: ['export', 'presso'],
        theme: './theme.css',
        title: 'Export Test',
        transcriptUrl: 'https://talk.example.test/transcript/'
      },
      notes: { public: false }
    });
    expect(manifest.slides).toHaveLength(1);
    expect(manifest.slides[0]).toMatchObject({
      id: 'title',
      index: 0,
      title: 'title',
      layout: 'image',
      class: ['featured', 'print-friendly'],
      background: {
        image: './assets/example.svg',
        fit: 'contain'
      },
      time: '0:30',
      targetTimeSeconds: 30
    });
    expect(manifest.slides[0].bodyHtml).toContain('src="./assets/example.svg"');
    expect(manifest.slides[0]).not.toHaveProperty('notesHtml');
    expect(serialized).not.toContain('SECRET_PRIVATE_NOTE');
    expect(serialized).not.toContain('SHOULD_NOT_LEAK_METADATA');
    expect(serialized).not.toContain('rootDir');
    expect(serialized).not.toContain('sourcePath');
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('bodyMarkdown');
    expect(serialized).not.toContain('notesMarkdown');
    expect(serialized).not.toContain('deploy');
    expect(serialized).not.toContain('rawHtml');
  });

  it('includes rendered public notes in the public deck manifest', async () => {
    for (const publicNotes of ['toggle', 'visible'] as const) {
      const root = await createDeck(publicNotes);
      const dest = await buildStatic(root, path.join(root, 'dist'));
      const manifest = await readDeckManifest(dest);
      const serialized = JSON.stringify(manifest);

      expect(manifest.notes.public).toBe(publicNotes);
      expect(manifest.slides[0].notesHtml).toContain('SECRET_PRIVATE_NOTE');
      expect(serialized).not.toContain('notesMarkdown');
    }
  });

  it('emits stable print routes and compatibility aliases', async () => {
    const root = await createDeck('toggle');
    const dest = await buildStatic(root, path.join(root, 'dist'));

    await expect(exists(path.join(dest, 'print/slides/index.html'))).resolves.toBe(true);
    await expect(exists(path.join(dest, 'print/notes/index.html'))).resolves.toBe(true);
    await expect(exists(path.join(dest, 'print/speaker/index.html'))).resolves.toBe(true);
    await expect(exists(path.join(dest, 'print/handout/index.html'))).resolves.toBe(true);
    await expect(exists(path.join(dest, 'print/notes-pages/index.html'))).resolves.toBe(true);
    await expect(exists(path.join(dest, 'print/notes-side/index.html'))).resolves.toBe(true);

    expect(await fs.readFile(path.join(dest, 'print/speaker/index.html'), 'utf8')).toContain('presso-print-slide-page');
    expect(await fs.readFile(path.join(dest, 'print/handout/index.html'), 'utf8')).toContain('presso-print-handout-page');
  });

  it('maps PDF layouts and default filenames', () => {
    expect(resolvePdfLayout()).toBe('slides');
    expect(resolvePdfLayout('print-slides')).toBe('slides');
    expect(resolvePdfLayout('notes-pages')).toBe('speaker');
    expect(resolvePdfLayout('interleaved')).toBe('speaker');
    expect(resolvePdfLayout('notes-side')).toBe('handout');
    expect(pdfOutputFile('slides')).toBe('slides.pdf');
    expect(pdfOutputFile('notes')).toBe('notes.pdf');
    expect(pdfOutputFile('speaker')).toBe('speaker.pdf');
    expect(pdfOutputFile('handout')).toBe('handout.pdf');
    expect(() => resolvePdfLayout('bad')).toThrow('Unknown PDF layout');
  });

  it('keeps standalone transcript export aligned with public notes policy', async () => {
    const root = await createDeck(false);
    const transcript = await exportTranscript(root, 'transcript.md');

    expect(await fs.readFile(transcript, 'utf8')).not.toContain('SECRET_PRIVATE_NOTE');
  });

  it('exports transcript profiles for ajfisher.me fragments', async () => {
    const root = await createDeck('toggle');
    const full = await exportTranscript(root, 'full.md', { profile: 'full' });
    const notes = await exportTranscript(root, 'notes.md', { fragment: true, profile: 'notes' });
    const visuals = await exportTranscript(root, 'visuals.md', { fragment: true, profile: 'notes-visuals' });

    expect(await fs.readFile(full, 'utf8')).toContain('[Download slides PDF](https://talk.example.test/slides.pdf)');
    expect(await fs.readFile(full, 'utf8')).toContain('![Example](https://talk.example.test/assets/example.svg)');
    expect(await fs.readFile(notes, 'utf8')).toBe('## title\n\nSECRET_PRIVATE_NOTE\n');
    expect(await fs.readFile(visuals, 'utf8')).toContain('![Example](https://talk.example.test/assets/example.svg)');
  });

  it('emits ajfisher.me metadata fields', async () => {
    const root = await createDeck('toggle');
    const dest = await buildStatic(root, path.join(root, 'dist'));
    const metadata = JSON.parse(await fs.readFile(path.join(dest, 'metadata.json'), 'utf8'));

    expect(metadata).toMatchObject({
      author: 'ajfisher',
      baseUrl: 'https://talk.example.test',
      canonicalUrl: 'https://talk.example.test',
      date: '2026-05-17',
      embedUrl: 'https://talk.example.test/embed/',
      event: 'ExportConf',
      excerpt: 'Export test excerpt',
      featureImage: './assets/example.svg',
      pdfUrl: 'https://talk.example.test/slides.pdf',
      tags: ['export', 'presso'],
      title: 'Export Test',
      transcriptUrl: 'https://talk.example.test/transcript/'
    });
  });

  it('omits unset optional metadata fields', async () => {
    const root = await createDeck(false, { includeMetadata: false });
    const dest = await buildStatic(root, path.join(root, 'dist'));
    const metadata = JSON.parse(await fs.readFile(path.join(dest, 'metadata.json'), 'utf8'));

    expect(metadata).toEqual({
      author: 'ajfisher',
      tags: [],
      title: 'Export Test'
    });
  });
});

async function createDeck(publicNotes: false | 'toggle' | 'visible', options: { includeMetadata?: boolean; includeSlideManifestFields?: boolean } = {}): Promise<string> {
  const includeMetadata = options.includeMetadata ?? true;
  const includeSlideManifestFields = options.includeSlideManifestFields ?? false;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-export-'));
  tmpRoots.push(root);
  await fs.mkdir(path.join(root, 'slides'), { recursive: true });
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  await fs.writeFile(path.join(root, 'theme.css'), ':root { --presso-accent: #00a1b2; }\n');
  await fs.writeFile(path.join(root, 'assets/example.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>\n');
  await fs.writeFile(path.join(root, 'presso.config.mjs'), `export default {
  title: 'Export Test',
${includeMetadata ? `  event: 'ExportConf',
  date: '2026-05-17',
  excerpt: 'Export test excerpt',
  tags: ['export', 'presso'],
  featureImage: './assets/example.svg',
  baseUrl: 'https://talk.example.test/',
` : ''}
  source: { type: 'folder', path: './slides' },
  theme: './theme.css',
  notes: { public: ${publicNotes === false ? 'false' : `'${publicNotes}'`} }
};
`);
  await fs.writeFile(path.join(root, 'slides/001-title.md'), `---
id: title
layout: image
${includeSlideManifestFields ? `class: featured print-friendly
background: ./assets/example.svg
backgroundFit: contain
time: "0:30"
customSecret: SHOULD_NOT_LEAK_METADATA
` : ''}
---

![Example](./assets/example.svg)

:::notes
SECRET_PRIVATE_NOTE
:::
`);
  return root;
}

async function readDeckManifest(root: string): Promise<any> {
  return JSON.parse(await fs.readFile(path.join(root, 'deck.json'), 'utf8'));
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
