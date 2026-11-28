import path from 'node:path';
import { parseArgs } from 'node:util';
import { compileDeck, measureDeckStats } from '@ajfisher/presso-core';

export async function deckStatsCommand(args: string[]): Promise<string> {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true, options: {
      json: { type: 'boolean' },
      wpm: { type: 'string' },
      'min-words': { type: 'string' }
    }
  });
  if (positionals.length > 1) throw new Error('Usage: presso stats [deckDir] [--wpm=130] [--min-words=11] [--json]');
  const deck = await compileDeck(path.resolve(positionals[0] ?? '.'));
  const stats = measureDeckStats(deck, {
    wordsPerMinute: numericOption(values.wpm),
    minWordsPerAdvance: numericOption(values['min-words'])
  });
  return values.json ? JSON.stringify(stats, null, 2) : formatStats(stats);
}

function numericOption(value: string | undefined): number | undefined {
  if (value === undefined) return;
  return value.trim() ? Number(value) : NaN;
}

function formatStats(stats: ReturnType<typeof measureDeckStats>): string {
  const headings = ['#', 'id', 'layout', 'steps', 'words', 'w/adv', 'target'];
  const rows = stats.slides.map((slide) => [
    String(slide.index), slide.id, slide.layout, String(slide.buildSteps), String(slide.notesWords),
    formatNumber(slide.wordsPerAdvance), slide.targetTimeSeconds === undefined ? '–' : clock(slide.targetTimeSeconds)
  ]);
  const widths = headings.map((heading, column) => rows.reduce((width, row) => Math.max(width, row[column]!.length), heading.length));
  const formatRow = (row: string[]) => row.map((cell, column) => column === 1 || column === 2
    ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!)).join('  ');
  const { totals, wordsPerMinute, minWordsPerAdvance } = stats;
  const lines = [formatRow(headings), ...rows.map((row, index) => formatRow(row) + (stats.slides[index]!.flagged ? '  !' : ''))];
  const slideLabel = totals.slides === 1 ? 'slide' : 'slides';
  lines.push('', `${totals.slides} ${slideLabel}, ${totals.advances.toLocaleString('en')} advances, ` +
    `${totals.notesWords.toLocaleString('en')} notes words, about ${clock(totals.estimatedSpeakingSeconds)} at ${wordsPerMinute} wpm`);
  if (totals.secondsPerAdvance !== undefined && totals.plannedSeconds !== undefined) {
    lines.push(`One advance every ${formatNumber(totals.secondsPerAdvance)} s against a ${clock(totals.plannedSeconds)} target`);
  }
  const flagged = stats.slides.filter((slide) => slide.flagged);
  if (flagged.length) {
    lines.push('', `Slides below ${minWordsPerAdvance} words per advance:`,
      ...flagged.map(({ id, buildSteps, notesWords }) => `  ${id} (${buildSteps} steps, ${notesWords} words)`));
  }
  return lines.join('\n');
}

function formatNumber(value: number): string {
  return value.toLocaleString('en', { maximumFractionDigits: 1 });
}

function clock(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor(rounded / 60) % 60;
  const remainder = String(rounded % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}
