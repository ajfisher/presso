import type { Slide } from './types.js';

export function applyTiming(slides: Slide[]): Slide[] {
  const keyframes = slides
    .map((slide, index) => ({ index, seconds: parseTime(slide.time) }))
    .filter((item): item is { index: number; seconds: number } => item.seconds !== undefined);

  if (keyframes.length === 0) {
    return slides.map((slide) => ({ ...slide }));
  }

  const nextSlides = slides.map((slide) => ({ ...slide }));

  for (let k = 0; k < keyframes.length - 1; k += 1) {
    const current = keyframes[k]!;
    const next = keyframes[k + 1]!;
    const span = next.index - current.index;
    const secondsSpan = next.seconds - current.seconds;
    for (let index = current.index; index <= next.index; index += 1) {
      const ratio = span === 0 ? 0 : (index - current.index) / span;
      nextSlides[index]!.targetTimeSeconds = Math.round(current.seconds + secondsSpan * ratio);
    }
  }

  const first = keyframes[0]!;
  for (let index = 0; index < first.index; index += 1) {
    nextSlides[index]!.targetTimeSeconds = first.seconds;
  }

  const last = keyframes[keyframes.length - 1]!;
  for (let index = last.index; index < nextSlides.length; index += 1) {
    nextSlides[index]!.targetTimeSeconds = last.seconds;
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

