import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { loadConfig } from './config.js';
import { listMarkdownFiles, pathExists, slugify, toPosixPath } from './fs.js';
import { renderSlideMarkdown } from './markdown.js';
import { applyTiming } from './timing.js';
import type { Deck, OrderCheckResult, ResolvedPressoConfig, Slide } from './types.js';

export async function compileDeck(cwd = process.cwd()): Promise<Deck> {
  const config = await loadConfig(cwd);
  const rawSlides = config.source.type === 'folder'
    ? await loadFolderSlides(config)
    : await loadSingleFileSlides(config);
  const slides = applyTiming(rawSlides.map((slide, index) => ({ ...slide, index })));
  return { config, slides };
}

export async function loadFolderSlides(config: ResolvedPressoConfig): Promise<Slide[]> {
  const slideDir = path.resolve(config.rootDir, config.source.path);
  if (!(await pathExists(slideDir))) {
    throw new Error(`Slide folder not found: ${slideDir}`);
  }
  const files = await orderedSlideFiles(config.rootDir, slideDir);
  return Promise.all(files.map((file, index) => readSlideFile(file, config.rootDir, index)));
}

export async function orderedSlideFiles(rootDir: string, slideDir = path.join(rootDir, 'slides')): Promise<string[]> {
  const allFiles = await listMarkdownFiles(slideDir);
  const orderPath = path.join(rootDir, 'slides.order');
  if (!(await pathExists(orderPath))) {
    return allFiles;
  }

  const order = parseOrderFile(await fs.readFile(orderPath, 'utf8'));
  const resolved = order.map((file) => path.resolve(rootDir, file));
  const check = checkOrder(allFiles, resolved);
  if (check.missing.length || check.duplicate.length) {
    throw new Error([
      'Invalid slides.order.',
      check.missing.length ? `Missing files: ${check.missing.join(', ')}` : '',
      check.duplicate.length ? `Duplicate entries: ${check.duplicate.join(', ')}` : ''
    ].filter(Boolean).join(' '));
  }
  return resolved;
}

export async function loadSingleFileSlides(config: ResolvedPressoConfig): Promise<Slide[]> {
  const filePath = path.resolve(config.rootDir, config.source.path);
  if (!(await pathExists(filePath))) {
    throw new Error(`Slide file not found: ${filePath}`);
  }
  const content = await fs.readFile(filePath, 'utf8');
  const sections = content
    .split(/^::slide\s*$/m)
    .map((section) => section.trim())
    .filter(Boolean);
  return sections.map((section, index) => buildSlide(section, filePath, config.rootDir, index));
}

export function parseOrderFile(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

export function checkOrder(allFiles: string[], orderedFiles: string[]): OrderCheckResult {
  const all = new Set(allFiles.map((file) => path.resolve(file)));
  const seen = new Set<string>();
  const duplicate: string[] = [];
  const missing: string[] = [];
  for (const file of orderedFiles.map((value) => path.resolve(value))) {
    if (seen.has(file)) {
      duplicate.push(file);
    }
    seen.add(file);
    if (!all.has(file)) {
      missing.push(file);
    }
  }
  const ordered = new Set(orderedFiles.map((file) => path.resolve(file)));
  const orphaned = allFiles.map((file) => path.resolve(file)).filter((file) => !ordered.has(file));
  return { missing, duplicate, orphaned };
}

async function readSlideFile(filePath: string, rootDir: string, index: number): Promise<Slide> {
  const content = await fs.readFile(filePath, 'utf8');
  return buildSlide(content, filePath, rootDir, index);
}

function buildSlide(content: string, filePath: string, rootDir: string, index: number): Slide {
  const parsed = matter(content);
  const metadata = parsed.data as Record<string, unknown>;
  const rendered = renderSlideMarkdown(parsed.content);
  const sourcePath = toPosixPath(path.relative(rootDir, filePath));
  const title = getTitle(metadata, rendered.bodyMarkdown, filePath);
  const id = String(metadata.id ?? slugify(path.basename(filePath, path.extname(filePath)).replace(/^\d+-?/, '')));
  const classes = metadata.class === undefined
    ? []
    : Array.isArray(metadata.class)
      ? metadata.class.map(String)
      : String(metadata.class).split(/\s+/).filter(Boolean);

  return {
    id,
    index,
    sourcePath,
    title,
    layout: String(metadata.layout ?? 'statement'),
    class: classes,
    background: metadata.background === undefined ? undefined : String(metadata.background),
    backgroundFit: metadata.backgroundFit === undefined ? undefined : String(metadata.backgroundFit),
    time: metadata.time === undefined ? undefined : String(metadata.time),
    bodyMarkdown: rendered.bodyMarkdown,
    bodyHtml: rendered.bodyHtml,
    notesMarkdown: rendered.notesMarkdown,
    notesHtml: rendered.notesHtml,
    metadata
  };
}

function getTitle(metadata: Record<string, unknown>, markdown: string, filePath: string): string {
  if (metadata.title) {
    return String(metadata.title);
  }
  const heading = markdown.match(/^#{1,3}\s+(.+)$/m);
  if (heading) {
    return heading[1]!.trim();
  }
  return path.basename(filePath, path.extname(filePath)).replace(/^\d+-?/, '').replace(/-/g, ' ');
}
