import { expect, it } from 'vitest';
import { measureDeckStats, renderSlideMarkdown, resolveConfig, type Deck } from './index.js';

it('reports click counts, rendered notes words, rates and flags for a deck with fragments', () => {
  const deck = fixture(`# Intro

:::fragment
- A
- B
:::

:::notes
**Two** <em>linked</em> [words](https://example.test/source).

::unused{label="Ignore attributes"}
:::`, '# Outro\n\n:::notes\nDone.\n:::');
  deck.slides[1]!.targetTimeSeconds = 30;

  const stats = measureDeckStats(deck, { wordsPerMinute: 120 });
  expect(stats.slides[0]).toMatchObject({
    index: 0, id: 'slide-1', layout: 'bullets', buildSteps: 2, advances: 3,
    notesWords: 3, wordsPerAdvance: 1, flagged: true
  });
  expect(stats.slides[1]).toMatchObject({ targetTimeSeconds: 30, flagged: false });
  expect(stats.totals).toEqual({ slides: 2, advances: 3, notesWords: 4, estimatedSpeakingSeconds: 2, plannedSeconds: 30, secondsPerAdvance: 10 });
  expect(measureDeckStats(deck, { minWordsPerAdvance: 1 }).slides[0]?.flagged).toBe(false);
});

it('uses the configured planned length and reports zero speaking time without notes', () => {
  const deck = fixture('# Intro', '# Outro');
  deck.config = resolveConfig({ timing: { length: '1:00' } }, '/example');
  deck.slides[1]!.targetTimeSeconds = 30;
  expect(measureDeckStats(deck).totals).toMatchObject({ notesWords: 0, estimatedSpeakingSeconds: 0, plannedSeconds: 60, secondsPerAdvance: 60 });
  expect(() => resolveConfig({ timing: { length: '1:00oops' } }, '/example')).toThrow('timing.length');
});

it('omits pace without timing and avoids division by zero without advances', () => {
  const deck = fixture('# Solo');
  expect(measureDeckStats(deck).totals).toMatchObject({ advances: 0, plannedSeconds: undefined, secondsPerAdvance: undefined });
  deck.slides[0]!.targetTimeSeconds = 45;
  expect(measureDeckStats(deck).totals).toMatchObject({ advances: 0, plannedSeconds: 45, secondsPerAdvance: undefined });
});

function fixture(...markdown: string[]): Deck {
  return {
    config: resolveConfig({}, '/example'),
    slides: markdown.map((source, index) => ({
      ...renderSlideMarkdown(source),
      id: `slide-${index + 1}`, index, title: 'Slide', sourcePath: 'slides.md', layout: 'bullets', class: [], metadata: {}
    }))
  };
}
