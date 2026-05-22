import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { compileDeck, parseSingleFileSlideSections } from './deck.js';
import { listMarkdownFiles, pathExists, toPosixPath } from './fs.js';
import { extractNotes } from './markdown.js';
import type { Slide } from './types.js';

export interface EditableSlideSource {
  index: number;
  id: string;
  title: string;
  sourcePath: string;
  metadataYaml: string;
  bodyMarkdown: string;
  notesMarkdown: string;
}

export interface EditableSlideInput {
  metadataYaml: string;
  bodyMarkdown: string;
  notesMarkdown: string;
}

export interface CreateFolderSlideOptions {
  afterIndex?: number;
}

export async function readSlideSource(cwd = process.cwd(), index: number): Promise<EditableSlideSource> {
  const deck = await compileDeck(cwd);
  return deck.config.source.type === 'folder'
    ? readFolderSlideSource(cwd, index)
    : readSingleFileSlideSource(cwd, index);
}

export async function writeSlideSource(cwd = process.cwd(), index: number, input: EditableSlideInput): Promise<EditableSlideSource> {
  const deck = await compileDeck(cwd);
  return deck.config.source.type === 'folder'
    ? writeFolderSlideSource(cwd, index, input)
    : writeSingleFileSlideSource(cwd, index, input);
}

export async function readFolderSlideSource(cwd = process.cwd(), index: number): Promise<EditableSlideSource> {
  const { slide, filePath } = await resolveFolderSlide(cwd, index);
  const source = await fs.readFile(filePath, 'utf8');
  const parsed = matter(source);
  const markdown = extractNotes(parsed.content);

  return {
    index: slide.index,
    id: slide.id,
    title: slide.title,
    sourcePath: slide.sourcePath,
    metadataYaml: metadataToYaml(parsed.data as Record<string, unknown>),
    bodyMarkdown: editableMarkdown(markdown.bodyMarkdown),
    notesMarkdown: editableMarkdown(markdown.notesMarkdown)
  };
}

export async function writeFolderSlideSource(cwd = process.cwd(), index: number, input: EditableSlideInput): Promise<EditableSlideSource> {
  const { filePath } = await resolveFolderSlide(cwd, index);
  const metadata = parseMetadataYaml(input.metadataYaml);
  const markdown = composeSlideMarkdown(input.bodyMarkdown, input.notesMarkdown);
  const output = matter.stringify(markdown, metadata);
  await fs.writeFile(filePath, ensureTrailingNewline(output), 'utf8');
  return readFolderSlideSource(cwd, index);
}

export async function readSingleFileSlideSource(cwd = process.cwd(), index: number): Promise<EditableSlideSource> {
  const { slide, section } = await resolveSingleFileSlide(cwd, index);
  const parsed = matter(section.content.trim());
  const markdown = extractNotes(parsed.content);

  return {
    index: slide.index,
    id: slide.id,
    title: slide.title,
    sourcePath: slide.sourcePath,
    metadataYaml: metadataToYaml(parsed.data as Record<string, unknown>),
    bodyMarkdown: editableMarkdown(markdown.bodyMarkdown),
    notesMarkdown: editableMarkdown(markdown.notesMarkdown)
  };
}

export async function writeSingleFileSlideSource(cwd = process.cwd(), index: number, input: EditableSlideInput): Promise<EditableSlideSource> {
  const { filePath, section, source } = await resolveSingleFileSlide(cwd, index);
  const metadata = parseMetadataYaml(input.metadataYaml);
  const markdown = composeSlideMarkdown(input.bodyMarkdown, input.notesMarkdown);
  const output = ensureTrailingNewline(matter.stringify(markdown, metadata));
  await fs.writeFile(filePath, source.slice(0, section.contentStart) + output + source.slice(section.contentEnd), 'utf8');
  return readSingleFileSlideSource(cwd, index);
}

export async function createFolderSlideSource(cwd = process.cwd(), options: CreateFolderSlideOptions = {}): Promise<EditableSlideSource> {
  const deck = await compileDeck(cwd);
  if (deck.config.source.type !== 'folder') {
    throw new Error('Local slide creation currently supports folder decks only.');
  }
  if (options.afterIndex !== undefined && (!Number.isInteger(options.afterIndex) || options.afterIndex < 0)) {
    throw new Error('A valid non-negative slide index is required.');
  }
  const activeSlide = options.afterIndex === undefined ? undefined : deck.slides[options.afterIndex];
  if (options.afterIndex !== undefined && !activeSlide) {
    throw new Error(`Slide index ${options.afterIndex} does not exist.`);
  }

  const root = path.resolve(deck.config.rootDir);
  const slideDir = path.resolve(root, deck.config.source.path);
  if (!isInside(root, slideDir)) {
    throw new Error(`Slide source folder is outside the deck root: ${deck.config.source.path}`);
  }
  await fs.mkdir(slideDir, { recursive: true });

  const files = await listMarkdownFiles(slideDir).catch(() => []);
  const next = await nextNumericSlidePrefix(slideDir, files);
  const filePath = path.join(slideDir, `${next}-untitled.md`);
  const sourcePath = toPosixPath(path.relative(root, filePath));
  await fs.writeFile(filePath, newSlideContent(next), 'utf8');

  const orderPath = path.join(root, 'slides.order');
  if (await pathExists(orderPath)) {
    const order = await fs.readFile(orderPath, 'utf8');
    await fs.writeFile(orderPath, insertOrderEntry(order, root, activeSlide?.sourcePath, sourcePath), 'utf8');
  }

  const updated = await compileDeck(cwd);
  const created = updated.slides.find((slide) => slide.sourcePath === sourcePath);
  if (!created) {
    throw new Error(`Created slide was not found in the compiled deck: ${sourcePath}`);
  }
  return readFolderSlideSource(cwd, created.index);
}

async function resolveFolderSlide(cwd: string, index: number): Promise<{ slide: Slide; filePath: string }> {
  const deck = await compileDeck(cwd);
  if (deck.config.source.type !== 'folder') {
    throw new Error('Local edit mode currently supports folder decks only.');
  }
  const slide = deck.slides[index];
  if (!slide) {
    throw new Error(`Slide index ${index} does not exist.`);
  }

  const root = path.resolve(deck.config.rootDir);
  const filePath = path.resolve(root, slide.sourcePath);
  if (!isInside(root, filePath)) {
    throw new Error(`Slide source path is outside the deck root: ${slide.sourcePath}`);
  }

  return { slide, filePath };
}

async function resolveSingleFileSlide(cwd: string, index: number): Promise<{
  filePath: string;
  section: ReturnType<typeof parseSingleFileSlideSections>[number];
  slide: Slide;
  source: string;
}> {
  const deck = await compileDeck(cwd);
  if (deck.config.source.type !== 'file') {
    throw new Error('Single-file edit mode requires source.type "file".');
  }
  const slide = deck.slides[index];
  if (!slide) {
    throw new Error(`Slide index ${index} does not exist.`);
  }

  const root = path.resolve(deck.config.rootDir);
  const filePath = path.resolve(root, deck.config.source.path);
  if (!isInside(root, filePath)) {
    throw new Error(`Slide source path is outside the deck root: ${deck.config.source.path}`);
  }

  const source = await fs.readFile(filePath, 'utf8');
  const section = parseSingleFileSlideSections(source)[index];
  if (!section) {
    throw new Error(`Slide index ${index} does not exist in ${slide.sourcePath}.`);
  }

  return { filePath, section, slide, source };
}

async function nextNumericSlidePrefix(slideDir: string, files: string[]): Promise<string> {
  let nextNumber = files.reduce((highest, file) => {
    const match = path.basename(file).match(/^(\d+)/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  let next = String(nextNumber).padStart(3, '0');
  while (await pathExists(path.join(slideDir, `${next}-untitled.md`))) {
    nextNumber += 1;
    next = String(nextNumber).padStart(3, '0');
  }
  return next;
}

function newSlideContent(prefix: string): string {
  return `---
id: untitled-${prefix}
layout: statement
---

## Untitled

:::notes
Add speaker notes here.
:::
`;
}

function insertOrderEntry(content: string, root: string, afterSourcePath: string | undefined, newSourcePath: string): string {
  const lines = content.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const insertAt = afterSourcePath ? findOrderLineIndex(lines, root, afterSourcePath) : -1;
  lines.splice(insertAt >= 0 ? insertAt + 1 : lines.length, 0, newSourcePath);
  return `${lines.join('\n')}\n`;
}

function findOrderLineIndex(lines: string[], root: string, sourcePath: string): number {
  const resolvedSource = path.resolve(root, sourcePath);
  return lines.findIndex((line) => {
    const clean = line.trim();
    return clean !== '' && !clean.startsWith('#') && path.resolve(root, clean) === resolvedSource;
  });
}

function metadataToYaml(metadata: Record<string, unknown>): string {
  if (!Object.keys(metadata).length) return '';
  const source = matter.stringify('', metadata);
  const lines = source.split(/\r?\n/);
  const end = lines.findIndex((line, index) => index > 0 && line === '---');
  return end > 0 ? lines.slice(1, end).join('\n').trimEnd() : '';
}

function parseMetadataYaml(metadataYaml: string): Record<string, unknown> {
  try {
    const source = metadataYaml.trim()
      ? `---\n${metadataYaml.trimEnd()}\n---\n`
      : '---\n{}\n---\n';
    const parsed = matter(source);
    if (metadataYaml.trim() && parsed.content.trim()) {
      throw new Error('Slide metadata must be valid YAML frontmatter only.');
    }
    const data = parsed.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Slide metadata must be a YAML mapping.');
    }
    return data as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid slide metadata: ${detail}`);
  }
}

function composeSlideMarkdown(bodyMarkdown: string, notesMarkdown: string): string {
  const body = trimTrailingBlankLines(bodyMarkdown);
  const notes = trimBoundaryBlankLines(notesMarkdown);
  if (!notes.trim()) return body;
  return [body, `:::notes\n${notes}\n:::`].filter(Boolean).join('\n\n');
}

function editableMarkdown(value: string): string {
  return trimBoundaryBlankLines(value);
}

function trimBoundaryBlankLines(value: string): string {
  return trimTrailingBlankLines(value.replace(/^\r?\n/, ''));
}

function trimTrailingBlankLines(value: string): string {
  return value.replace(/(?:\r?\n)+$/, '');
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
