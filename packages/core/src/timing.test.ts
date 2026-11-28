import { expect, it } from 'vitest';
import { countNotesWords } from './notes-words.js';
import { applyTiming } from './timing.js';
import type { Slide } from './types.js';

it('weights finish targets from the implicit start through the first marker', () => {
  const slides = applyTiming(makeSlides([[20], [100], [9], [29, '4:00']]));
  expect(slides.map((slide) => slide.targetTimeSeconds)).toEqual([37, 169, 192, 240]);
  expect(slides.map((slide) => slide.targetTimeSource)).toEqual(['interpolated', 'interpolated', 'interpolated', 'authored']);
});

it('keeps a marker on the first slide and carries its time to the end', () => {
  const slides = applyTiming(makeSlides([[0, '0:30'], [0]]));
  expect(slides.map((slide) => [slide.targetTimeSeconds, slide.targetTimeSource])).toEqual([
    [30, 'authored'], [30, 'interpolated']
  ]);
});

it('weights the slides between two markers and leaves both markers exact', () => {
  const slides = applyTiming(makeSlides([[100, '0:30'], [9], [29, '1:00']]));
  expect(slides.map((slide) => slide.targetTimeSeconds)).toEqual([30, 40, 60]);
});

it('divides time evenly without notes and rounds to non-decreasing seconds', () => {
  const slides = applyTiming(makeSlides([[0], [0], [0], [0, '0:02']]));
  expect(slides.map((slide) => slide.targetTimeSeconds)).toEqual([1, 1, 2, 2]);
});

it('leaves targets and sources unset without a marker', () => {
  const slides = applyTiming(makeSlides([[5], [10]]));
  expect(slides.map((slide) => slide.targetTimeSeconds)).toEqual([undefined, undefined]);
  expect(slides.map((slide) => slide.targetTimeSource)).toEqual([undefined, undefined]);
});

it('rejects authored markers in descending order', () => {
  expect(() => applyTiming(makeSlides([[1, '0:30'], [0], [1, '0:29']]))).toThrow('Invalid time marker on slide "slide-3"');
});

it('counts rendered words across inline markup and between blocks', () => {
  expect(countNotesWords('<p>ex<strong>ample</strong>&nbsp;one</p><p>two<br>three &amp; four</p><style>.ignore { color: red }</style>')).toBe(5);
});

function makeSlides(timing: Array<[notesWords: number, time?: string]>): Slide[] {
  return timing.map(([words, time], index) => ({
    id: `slide-${index + 1}`, index, title: 'Slide', sourcePath: 'slides.md', layout: 'statement', class: [],
    buildSteps: 0, time, bodyMarkdown: '', bodyHtml: '', notesMarkdown: 'word '.repeat(words),
    notesHtml: `<p>${'word '.repeat(words)}</p>`, metadata: {}
  }));
}
