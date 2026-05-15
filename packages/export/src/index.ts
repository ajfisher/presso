import fs from 'node:fs/promises';
import path from 'node:path';
import { compileDeck, copyDir, pathExists } from '@presso/core';
import { readRuntimeAsset, renderPage, renderTranscriptMarkdown, runtimeAssetNames, type RenderMode } from '@presso/runtime';

const ROUTES: Array<[string, RenderMode]> = [
  ['index.html', 'deck'],
  ['embed/index.html', 'embed'],
  ['notes/index.html', 'notes'],
  ['presenter/index.html', 'presenter'],
  ['control/index.html', 'control'],
  ['print/slides/index.html', 'print-slides'],
  ['print/notes-side/index.html', 'print-notes-side'],
  ['print/notes-pages/index.html', 'print-notes-pages'],
  ['transcript/index.html', 'transcript']
];

const RUNTIME_ASSET_DIR = '_presso';

export async function buildStatic(cwd = process.cwd(), outDir = 'dist'): Promise<string> {
  const deck = await compileDeck(cwd);
  const dest = path.resolve(cwd, outDir);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });

  await copyDir(path.join(deck.config.rootDir, 'public'), dest);
  await copyDir(path.join(deck.config.rootDir, 'assets'), path.join(dest, 'assets'));
  await copyTheme(deck, dest);

  for (const [file, mode] of ROUTES) {
    const output = path.join(dest, file);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, renderPage(deck, mode, { public: true }), 'utf8');
  }

  await fs.writeFile(path.join(dest, 'deck.json'), JSON.stringify(publicDeck(deck), null, 2), 'utf8');
  await fs.writeFile(path.join(dest, 'transcript.md'), renderTranscriptMarkdown(deck, { includeNotes: deck.config.notes.public !== false }), 'utf8');
  await fs.writeFile(path.join(dest, 'metadata.json'), JSON.stringify(buildMetadata(deck), null, 2), 'utf8');
  const runtimeDir = path.join(dest, RUNTIME_ASSET_DIR);
  await fs.mkdir(runtimeDir, { recursive: true });
  for (const assetName of runtimeAssetNames) {
    await fs.writeFile(path.join(runtimeDir, assetName), readRuntimeAsset(assetName).content);
  }

  return dest;
}

async function copyTheme(deck: Awaited<ReturnType<typeof compileDeck>>, dest: string): Promise<void> {
  if (!isLocalPath(deck.config.theme)) return;
  const themePath = path.resolve(deck.config.rootDir, deck.config.theme);
  if (await pathExists(themePath)) {
    const output = path.join(dest, deck.config.theme.replace(/^\.\//, ''));
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.copyFile(themePath, output);
  }
}

function isLocalPath(value: string): boolean {
  return !/^(?:[a-z]+:|\/|#)/i.test(value);
}

export async function exportTranscript(cwd = process.cwd(), outFile = 'transcript.md'): Promise<string> {
  const deck = await compileDeck(cwd);
  const dest = path.resolve(cwd, outFile);
  await fs.writeFile(dest, renderTranscriptMarkdown(deck), 'utf8');
  return dest;
}

export async function exportPdf(cwd = process.cwd(), mode: RenderMode = 'print-slides', outFile = 'slides.pdf'): Promise<string> {
  const deck = await compileDeck(cwd);
  const html = renderPage(deck, mode);
  const playwright = await import('playwright').catch(() => undefined);
  if (!playwright) {
    throw new Error('Playwright is not installed. Run npm install before exporting PDF.');
  }
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: deck.config.size });
    await page.setContent(html, { waitUntil: 'networkidle' });
    const dest = path.resolve(cwd, outFile);
    await page.pdf({
      path: dest,
      width: `${deck.config.size.width}px`,
      height: `${deck.config.size.height}px`,
      printBackground: true
    });
    return dest;
  } finally {
    await browser.close();
  }
}

function buildMetadata(deck: Awaited<ReturnType<typeof compileDeck>>) {
  return {
    title: deck.config.title,
    event: deck.config.event,
    date: deck.config.date,
    author: deck.config.author,
    excerpt: deck.config.excerpt,
    tags: deck.config.tags,
    featureImage: deck.config.featureImage,
    canonicalUrl: deck.config.baseUrl,
    embedUrl: deck.config.baseUrl ? `${deck.config.baseUrl.replace(/\/$/, '')}/embed/` : undefined,
    pdfUrl: deck.config.baseUrl ? `${deck.config.baseUrl.replace(/\/$/, '')}/slides.pdf` : undefined
  };
}

function publicDeck(deck: Awaited<ReturnType<typeof compileDeck>>) {
  const includeNotes = deck.config.notes.public !== false;
  return {
    ...deck,
    config: {
      ...deck.config,
      rootDir: undefined
    },
    slides: deck.slides.map((slide) => ({
      ...slide,
      notesMarkdown: includeNotes ? slide.notesMarkdown : '',
      notesHtml: includeNotes ? slide.notesHtml : ''
    }))
  };
}
