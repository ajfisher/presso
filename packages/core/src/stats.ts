import { countNotesWords } from './notes-words.js';
import type { Deck } from './types.js';

export interface DeckStatsOptions {
  wordsPerMinute?: number;
  minWordsPerAdvance?: number;
}

export function measureDeckStats(deck: Deck, { wordsPerMinute = 130, minWordsPerAdvance = 11 }: DeckStatsOptions = {}) {
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) throw new Error('--wpm must be a positive number.');
  if (!Number.isFinite(minWordsPerAdvance) || minWordsPerAdvance < 0) throw new Error('--min-words must be a non-negative number.');

  const slides = deck.slides.map(({ index, id, layout, buildSteps, notesHtml, targetTimeSeconds }) => {
    const advances = buildSteps + 1;
    const notesWords = countNotesWords(notesHtml);
    const wordsPerAdvance = notesWords / advances;
    return {
      index, id, layout, buildSteps, advances, notesWords, wordsPerAdvance, targetTimeSeconds,
      flagged: buildSteps >= 2 && wordsPerAdvance < minWordsPerAdvance
    };
  });
  const advances = Math.max(0, slides.reduce((total, slide) => total + slide.advances, 0) - 1);
  const notesWords = slides.reduce((total, slide) => total + slide.notesWords, 0);
  const plannedSeconds = deck.config.timing?.lengthSeconds ?? deck.slides.at(-1)?.targetTimeSeconds;

  return {
    slides,
    wordsPerMinute,
    minWordsPerAdvance,
    totals: {
      slides: slides.length,
      advances,
      notesWords,
      estimatedSpeakingSeconds: notesWords * 60 / wordsPerMinute,
      plannedSeconds,
      secondsPerAdvance: plannedSeconds !== undefined && advances > 0 ? plannedSeconds / advances : undefined
    }
  };
}
