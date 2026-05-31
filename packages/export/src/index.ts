import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { compileDeck, copyDir, pathExists, type Deck, type NotesPublicPolicy, type Slide, type SlideBackground } from '@ajfisher/presso-core';
import { readRuntimeAsset, renderPage, renderTranscriptMarkdown, runtimeAssetNames, type RenderMode, type TranscriptProfile } from '@ajfisher/presso-runtime';

export const PDF_LAYOUTS = ['slides', 'notes', 'speaker', 'handout'] as const;
export type PdfLayout = typeof PDF_LAYOUTS[number];

interface StaticBuildResult {
  deck: Awaited<ReturnType<typeof compileDeck>>;
  dest: string;
}

interface PdfJob {
  layout: PdfLayout;
  outFile?: string;
}

interface TranscriptExportOptions {
  fragment?: boolean;
  profile?: TranscriptProfile;
}

interface PublicDeckManifest {
  schemaVersion: 1;
  deck: DeckMetadata & {
    aspectRatio: string;
    size: {
      height: number;
      width: number;
    };
    theme: string;
  };
  notes: {
    public: NotesPublicPolicy;
  };
  slides: PublicSlideManifest[];
}

interface PublicSlideManifest {
  id: string;
  index: number;
  title: string;
  layout: string;
  class: string[];
  buildSteps: number;
  bodyHtml: string;
  background?: SlideBackground;
  notesHtml?: string;
  targetTimeSeconds?: number;
  time?: string;
}

interface StaticServer {
  close: () => Promise<void>;
  origin: string;
}

export interface DeckMetadata {
  title: string;
  author: string;
  tags: string[];
  event?: string;
  date?: string;
  excerpt?: string;
  featureImage?: string;
  baseUrl?: string;
  canonicalUrl?: string;
  embedUrl?: string;
  pdfUrl?: string;
  transcriptUrl?: string;
}

type OptionalMetadataKey = Exclude<keyof DeckMetadata, 'title' | 'author' | 'tags'>;

const ROUTES: Array<[string, RenderMode]> = [
  ['index.html', 'deck'],
  ['embed/index.html', 'embed'],
  ['notes/index.html', 'notes'],
  ['presenter/index.html', 'presenter'],
  ['control/index.html', 'control'],
  ['print/slides/index.html', 'print-slides'],
  ['print/notes/index.html', 'print-notes'],
  ['print/speaker/index.html', 'print-speaker'],
  ['print/handout/index.html', 'print-handout'],
  ['print/notes-side/index.html', 'print-handout'],
  ['print/notes-pages/index.html', 'print-speaker'],
  ['transcript/index.html', 'transcript']
];

const RUNTIME_ASSET_DIR = '_presso';
const PDF_LAYOUT_CONFIG: Record<PdfLayout, { fileName: string; route: string }> = {
  slides: { fileName: 'slides.pdf', route: '/print/slides/' },
  notes: { fileName: 'notes.pdf', route: '/print/notes/' },
  speaker: { fileName: 'speaker.pdf', route: '/print/speaker/' },
  handout: { fileName: 'handout.pdf', route: '/print/handout/' }
};
const PDF_LAYOUT_ALIASES = new Map<string, PdfLayout>([
  ['slides', 'slides'],
  ['print-slides', 'slides'],
  ['notes', 'notes'],
  ['print-notes', 'notes'],
  ['speaker', 'speaker'],
  ['print-speaker', 'speaker'],
  ['interleaved', 'speaker'],
  ['combined', 'speaker'],
  ['notes-pages', 'speaker'],
  ['print-notes-pages', 'speaker'],
  ['handout', 'handout'],
  ['print-handout', 'handout'],
  ['side', 'handout'],
  ['notes-side', 'handout'],
  ['print-notes-side', 'handout']
]);

export async function buildStatic(cwd = process.cwd(), outDir = 'dist'): Promise<string> {
  return (await writeStaticBuild(cwd, outDir, true)).dest;
}

async function writeStaticBuild(cwd: string, outDir: string, publicBuild: boolean): Promise<StaticBuildResult> {
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
    await fs.writeFile(output, renderPage(deck, mode, { public: publicBuild }), 'utf8');
  }

  await fs.writeFile(path.join(dest, 'deck.json'), JSON.stringify(publicBuild ? publicDeckManifest(deck) : deck, null, 2), 'utf8');
  await fs.writeFile(path.join(dest, 'transcript.md'), renderTranscriptMarkdown(deck, { includeNotes: !publicBuild || deck.config.notes.public !== false }), 'utf8');
  await fs.writeFile(path.join(dest, 'metadata.json'), JSON.stringify(buildMetadata(deck), null, 2), 'utf8');
  const runtimeDir = path.join(dest, RUNTIME_ASSET_DIR);
  await fs.mkdir(runtimeDir, { recursive: true });
  for (const assetName of runtimeAssetNames) {
    await fs.writeFile(path.join(runtimeDir, assetName), readRuntimeAsset(assetName).content, 'utf8');
  }

  return { deck, dest };
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

export async function exportTranscript(cwd = process.cwd(), outFile = 'transcript.md', options: TranscriptExportOptions = {}): Promise<string> {
  const deck = await compileDeck(cwd);
  const dest = path.resolve(cwd, outFile);
  await fs.writeFile(dest, renderTranscriptMarkdown(deck, {
    fragment: options.fragment,
    includeNotes: deck.config.notes.public !== false,
    profile: options.profile
  }), 'utf8');
  return dest;
}

export async function exportPdf(cwd = process.cwd(), layoutInput: string = 'slides', outFile?: string): Promise<string> {
  const [output] = await exportPdfJobs(cwd, [{ layout: resolvePdfLayout(layoutInput), outFile }]);
  return output!;
}

export async function exportPdfs(cwd = process.cwd(), layoutInputs: string[] = [...PDF_LAYOUTS]): Promise<string[]> {
  return exportPdfJobs(cwd, layoutInputs.map((layout) => ({ layout: resolvePdfLayout(layout) })));
}

export function resolvePdfLayout(value = 'slides'): PdfLayout {
  const layout = PDF_LAYOUT_ALIASES.get(value.trim().toLowerCase());
  if (!layout) {
    throw new Error(`Unknown PDF layout "${value}". Expected one of: ${PDF_LAYOUTS.join(', ')}.`);
  }
  return layout;
}

export function pdfOutputFile(layout: PdfLayout): string {
  return PDF_LAYOUT_CONFIG[layout].fileName;
}

async function exportPdfJobs(cwd: string, jobs: PdfJob[]): Promise<string[]> {
  const staticRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-pdf-'));
  try {
    const { deck, dest } = await writeStaticBuild(cwd, staticRoot, false);
    const server = await serveStatic(dest);
    const browser = await launchBrowser();
    try {
      const outputs: string[] = [];
      for (const job of jobs) {
        outputs.push(await renderPdfJob(cwd, deck, server, browser, job));
      }
      return outputs;
    } finally {
      await browser.close();
      await server.close();
    }
  } finally {
    await fs.rm(staticRoot, { recursive: true, force: true });
  }
}

async function renderPdfJob(
  cwd: string,
  deck: Awaited<ReturnType<typeof compileDeck>>,
  server: StaticServer,
  browser: import('playwright').Browser,
  job: PdfJob
): Promise<string> {
  const config = PDF_LAYOUT_CONFIG[job.layout];
  const outputPath = path.resolve(cwd, job.outFile ?? config.fileName);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const page = await browser.newPage({ viewport: deck.config.size });
  try {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${server.origin}${config.route}`, { waitUntil: 'networkidle' });
    await page.pdf({
      height: `${deck.config.size.height}px`,
      path: outputPath,
      printBackground: true,
      width: `${deck.config.size.width}px`
    });
    return outputPath;
  } finally {
    await page.close();
  }
}

async function launchBrowser(): Promise<import('playwright').Browser> {
  const playwright = await import('playwright').catch(() => undefined);
  if (!playwright) {
    throw new Error('Playwright is not installed. Run npm install before exporting PDF.');
  }
  const executablePath = process.env.PRESSO_PLAYWRIGHT_EXECUTABLE ?? localChromePath();
  try {
    return executablePath
      ? await playwright.chromium.launch({ executablePath })
      : await playwright.chromium.launch();
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Playwright Chromium is not available. Run "npm exec playwright install chromium" or set PRESSO_PLAYWRIGHT_EXECUTABLE.${detail}`);
  }
}

function localChromePath(): string | undefined {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return process.platform === 'darwin' ? chromePath : undefined;
}

async function serveStatic(root: string): Promise<StaticServer> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const filePath = await resolveStaticFile(root, url.pathname);
      if (!filePath) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'content-type': contentType(filePath) });
      res.end(await fs.readFile(filePath));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.stack : String(error));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error('PDF export static server did not bind to a port.');
  return {
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    origin: `http://127.0.0.1:${address.port}`
  };
}

async function resolveStaticFile(root: string, pathname: string): Promise<string | undefined> {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidate = path.resolve(root, clean);
  if (!isInside(root, candidate)) return undefined;

  const stat = await fs.stat(candidate).catch(() => undefined);
  if (stat?.isDirectory()) {
    return resolveStaticFile(root, path.join(pathname, 'index.html'));
  }
  if (stat?.isFile()) return candidate;
  if (!path.extname(candidate)) {
    const indexPath = path.join(candidate, 'index.html');
    const indexStat = await fs.stat(indexPath).catch(() => undefined);
    if (indexStat?.isFile() && isInside(root, indexPath)) return indexPath;
  }
  return undefined;
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function contentType(file: string): string {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.webp')) return 'image/webp';
  return 'text/html; charset=utf-8';
}

export function buildMetadata(deck: Awaited<ReturnType<typeof compileDeck>>): DeckMetadata {
  const baseUrl = normaliseBaseUrl(deck.config.baseUrl);
  const metadata: DeckMetadata = {
    title: deck.config.title,
    author: deck.config.author,
    tags: deck.config.tags.map((tag) => tag.trim()).filter(Boolean)
  };

  setOptionalMetadata(metadata, 'event', deck.config.event);
  setOptionalMetadata(metadata, 'date', deck.config.date);
  setOptionalMetadata(metadata, 'excerpt', deck.config.excerpt);
  setOptionalMetadata(metadata, 'featureImage', deck.config.featureImage);

  if (baseUrl) {
    metadata.baseUrl = baseUrl;
    metadata.canonicalUrl = baseUrl;
    metadata.embedUrl = `${baseUrl}/embed/`;
    metadata.pdfUrl = `${baseUrl}/slides.pdf`;
    metadata.transcriptUrl = `${baseUrl}/transcript/`;
  }

  return metadata;
}

function setOptionalMetadata(metadata: DeckMetadata, key: OptionalMetadataKey, value?: string): void {
  const clean = meaningfulString(value);
  if (clean) metadata[key] = clean;
}

function meaningfulString(value?: string): string | undefined {
  const clean = value?.trim();
  return clean || undefined;
}

function normaliseBaseUrl(value?: string): string | undefined {
  const clean = meaningfulString(value);
  return clean?.replace(/\/+$/, '') || undefined;
}

function publicDeckManifest(deck: Deck): PublicDeckManifest {
  const includeNotes = deck.config.notes.public !== false;
  return {
    schemaVersion: 1,
    deck: {
      ...buildMetadata(deck),
      aspectRatio: deck.config.aspectRatio,
      size: {
        height: deck.config.size.height,
        width: deck.config.size.width
      },
      theme: deck.config.theme
    },
    notes: {
      public: deck.config.notes.public
    },
    slides: deck.slides.map((slide) => publicSlideManifest(slide, includeNotes))
  };
}

function publicSlideManifest(slide: Slide, includeNotes: boolean): PublicSlideManifest {
  const manifest: PublicSlideManifest = {
    id: slide.id,
    index: slide.index,
    title: slide.title,
    layout: slide.layout,
    class: [...slide.class],
    buildSteps: slide.buildSteps,
    bodyHtml: slide.bodyHtml
  };

  if (slide.background) manifest.background = slide.background;
  setOptionalSlideField(manifest, 'time', slide.time);
  if (slide.targetTimeSeconds !== undefined) manifest.targetTimeSeconds = slide.targetTimeSeconds;
  if (includeNotes) manifest.notesHtml = slide.notesHtml;
  return manifest;
}

function setOptionalSlideField(manifest: PublicSlideManifest, key: 'time', value?: string): void {
  const clean = meaningfulString(value);
  if (clean) manifest[key] = clean;
}
