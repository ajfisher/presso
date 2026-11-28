import { countNotesWords } from './notes-words.js';
import type { Slide } from './types.js';

const MIN_SLIDE_WEIGHT_WORDS = 11;

export function applyTiming(slides: Slide[]): Slide[] {
  const keyframes = slides
    .map((slide, index) => ({ index, seconds: parseTime(slide.time) }))
    .filter((item): item is { index: number; seconds: number } => item.seconds !== undefined);

  const nextSlides = slides.map((slide) => ({ ...slide }));
  if (!keyframes.length) return nextSlides;

  let previous = { index: -1, seconds: 0 };
  for (const keyframe of keyframes) {
    const markerSlide = nextSlides[keyframe.index]!;
    if (!Number.isFinite(keyframe.seconds) || keyframe.seconds < previous.seconds) {
      throw new Error(`Invalid time marker on slide "${markerSlide.id}". Finish times must be finite and non-decreasing from 0:00.`);
    }

    const segment = nextSlides.slice(previous.index + 1, keyframe.index + 1);
    const weights = segment.map((slide) => countNotesWords(slide.notesHtml) + MIN_SLIDE_WEIGHT_WORDS);
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);
    let elapsedWeight = 0;
    for (let offset = 0; offset < segment.length - 1; offset += 1) {
      elapsedWeight += weights[offset]!;
      const slide = segment[offset]!;
      slide.targetTimeSeconds = Math.round(previous.seconds + (keyframe.seconds - previous.seconds) * (elapsedWeight / totalWeight));
      slide.targetTimeSource = 'interpolated';
    }
    markerSlide.targetTimeSeconds = keyframe.seconds;
    markerSlide.targetTimeSource = 'authored';
    previous = keyframe;
  }

  for (const slide of nextSlides.slice(previous.index + 1)) {
    slide.targetTimeSeconds = previous.seconds;
    slide.targetTimeSource = 'interpolated';
  }

  return nextSlides;
}

export function parseTime(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid time marker ${String(value)}.`);
  }
  const parts = value.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid time marker "${value}".`);
  }
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  throw new Error(`Invalid time marker "${value}". Expected mm:ss or hh:mm:ss.`);
}

