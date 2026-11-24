import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import matter from 'gray-matter';
import { compileDeck, parseSingleFileSlideSections } from './deck.js';
import { applyTiming, parseTime } from './timing.js';
import type { Deck } from './types.js';

export function previewTimingTargets(deck: Deck, slideIds: string[], targets: ReadonlyMap<string, number>) {
  if (
    slideIds.length !== deck.slides.length
    || deck.slides.some((slide, index) => slide.id !== slideIds[index])
  ) {
    throw new Error('The slide order has changed since this rehearsal. Capture timings from the current deck before applying them.');
  }

  const revision = createHash('sha256').update(JSON.stringify([deck.slides.map(({ id, time }) => [id, time]), [...targets]])).digest('hex');
  const changes = new Map<string, string>();
  const proposed = deck.slides.map((slide) => {
    const seconds = targets.get(slide.id);
    if (seconds === undefined || seconds === parseTime(slide.time)) return slide;
    if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('Finish targets must be whole seconds.');
    const time = formatTimingTarget(seconds);
    changes.set(slide.id, time);
    return { ...slide, time };
  });
  if ([...targets.keys()].some((id) => !slideIds.includes(id))) {
    throw new Error('A selected slide is missing from this deck.');
  }

  let previous;
  let conflict;
  for (const slide of proposed) {
    const seconds = parseTime(slide.time);
    if (seconds === undefined) continue;
    if (previous && seconds < previous.seconds) {
      conflict = `The finish target for “${slide.title}” is earlier than the target for “${previous.title}”. Check the selected and existing targets.`;
      break;
    }
    previous = { title: slide.title, seconds };
  }
  const projected = applyTiming(proposed);
  const rows = deck.slides.map((slide, index) => ({
    id: slide.id,
    authored: slide.time ?? null,
    current: slide.targetTimeSeconds ?? null,
    proposed: projected[index]!.targetTimeSeconds ?? null,
    change: changes.get(slide.id) ?? null
  }));
  return { revision, rows, changes, conflict };
}

export async function writeTimingTargets(deck: Deck, targets: ReadonlyMap<string, string>) {
  const root = await fs.realpath(deck.config.rootDir);
  const files = new Map<string, {
    source: string;
    mode: number;
    ids: string[];
    sections: ReturnType<typeof parseSingleFileSlideSections>;
    edits: { start: number; end: number; replacement: string }[];
  }>();
  for (const slide of deck.slides) {
    const target = targets.get(slide.id);
    if (target === undefined) continue;
    const file = await fs.realpath(path.resolve(root, slide.sourcePath));
    const relative = path.relative(root, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('A selected slide source is outside the deck.');
    }
    let staged = files.get(file);
    if (!staged) {
      const source = await fs.readFile(file, 'utf8');
      staged = {
        source, mode: (await fs.stat(file)).mode & 0o777, ids: [], edits: [],
        sections: deck.config.source.type === 'file' ? parseSingleFileSlideSections(source) : []
      };
      files.set(file, staged);
    }
    if (deck.config.source.type === 'folder') {
      if (staged.ids.length > 0) throw new Error('Selected slides share the same Markdown file.');
      staged.edits.push({
        start: 0, end: staged.source.length,
        replacement: patchTime(staged.source, slide.metadata, target, false)
      });
    } else {
      const section = staged.sections[slide.index];
      if (!section) throw new Error('A selected slide moved since the timing preview.');
      staged.edits.push({
        start: section.contentStart, end: section.contentEnd,
        replacement: patchTime(section.content, slide.metadata, target, true)
      });
    }
    staged.ids.push(slide.id);
  }

  const current = await compileDeck(deck.config.rootDir);
  const markers = (value: Deck) => value.slides.map(({ id, sourcePath, time }) => [id, sourcePath, time]);
  if (!isDeepStrictEqual(markers(current), markers(deck))) {
    throw new Error('Slide order or timing markers changed during writeback. Refresh the preview.');
  }

  const applied: string[] = [];
  for (const [file, change] of files) {
    let output = change.source;
    for (const edit of change.edits.sort((a, b) => b.start - a.start)) {
      output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
    }
    const temporary = path.join(path.dirname(file), `.presso-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, output, { mode: change.mode, flag: 'wx' });
      await fs.chmod(temporary, change.mode);
      if (await fs.readFile(file, 'utf8') !== change.source) {
        throw new Error('Slide Markdown changed during writeback. Refresh the preview to apply the remaining targets.');
      }
      await fs.rename(temporary, file);
      applied.push(...change.ids);
    } catch (error) {
      return {
        applied,
        error: error instanceof Error && !('code' in error)
          ? error.message
          : 'Presso could not save a slide file. Check permissions and refresh the preview.'
      };
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
  }
  return { applied };
}

function patchTime(source: string, expected: Record<string, unknown>, after: string, singleFile: boolean): string {
  const offset = singleFile ? source.length - source.trimStart().length : Number(source.startsWith('\uFEFF'));
  const parsed = matter(singleFile ? source.trim() : source);
  const data = parsed.data as Record<string, unknown>;
  const before = timeValue(expected);
  if (String(data.id) !== String(expected.id) || timeValue(data) !== before) {
    throw new Error('Slide metadata changed since the preview. Refresh the timing plan.');
  }

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const opening = /^---[ \t]*\r?\n/.exec(source.slice(offset));
  let output;
  if (!opening) {
    if (parsed.matter) throw new Error('Presso could not locate the slide frontmatter.');
    output = source.slice(0, offset) + `---${newline}time: "${after}"${newline}---${newline}` + source.slice(offset);
  } else {
    const start = offset + opening[0].length;
    const rest = source.slice(start);
    const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
    if (!closing) throw new Error('Presso could not locate the end of the slide frontmatter.');
    const yaml = rest.slice(0, closing.index);
    const indent = /^[ \t]*(?=[^\s#])/m.exec(yaml)?.[0] ?? '';
    const field = /^(?<indent>[ \t]*)(?<key>time|'time'|"time")(?<separator>[ \t]*:[ \t]*)(?<value>[^\r\n]*)/gm;
    const matches = [...yaml.matchAll(field)].filter((match) => match.groups?.indent === indent);
    if (matches.length === 0 && before === undefined) {
      output = source.slice(0, start) + `${indent}time: "${after}"${newline}` + rest;
    } else if (matches.length === 1 && before !== undefined) {
      const [line, , key, separator, value] = matches[0]!;
      const valueParts = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^#]*?)([ \t]*(?:[ \t]+#.*)?)$/.exec(value!);
      if (!valueParts) throw new Error('Edit this slide’s time marker directly in the Markdown.');
      const index = start + matches[0]!.index;
      output = source.slice(0, index) + `${indent}${key}${separator}"${after}"${valueParts[2]}` + source.slice(index + line.length);
    } else {
      throw new Error('Edit this slide’s time marker directly in the Markdown.');
    }
  }

  const updated = matter(singleFile ? output.trim() : output);
  if (updated.content !== parsed.content || !isDeepStrictEqual(updated.data, { ...data, time: after })) {
    throw new Error('Presso could not change the time marker while preserving its other metadata. Edit its time directly in the Markdown.');
  }
  return output;
}

function timeValue(data: Record<string, unknown>) {
  return data.time === undefined ? undefined : String(data.time);
}

function formatTimingTarget(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const tail = String(seconds % 60).padStart(2, '0');
  if (minutes < 60) return `${minutes}:${tail}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`;
}
