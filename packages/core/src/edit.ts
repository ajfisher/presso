import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { compileDeck } from './deck.js';
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
    const data = matter(source).data;
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
