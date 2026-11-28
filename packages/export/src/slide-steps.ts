import type { Deck, Slide } from '@ajfisher/presso-core';
import type { Page } from 'playwright';

export interface SlideStepOptions {
  slides?: readonly Slide[];
  steps?: 'all' | 'last';
}

export function selectSnapshotSlides(slides: readonly Slide[], selection?: string): Slide[] {
  if (selection === undefined) return [...slides];
  const selected = new Set<number>();
  for (const part of selection.split(',')) {
    const token = part.trim();
    const named = slides.find((slide) => slide.id === token);
    if (named && token) {
      selected.add(named.index);
      continue;
    }
    const match = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!match) throw new Error(`Unknown slide selection "${token}".`);
    const first = Number(match[1]);
    const last = match[2] === undefined ? first : Number(match[2]);
    if (first > last || last >= slides.length) throw new Error(`Slide index or range "${token}" is outside the deck or reversed.`);
    for (let index = first; index <= last; index += 1) selected.add(index);
  }
  return slides.filter((slide) => selected.has(slide.index));
}

/** Walks an already loaded static deck page in deck order. */
export async function forEachSlideStep(
  page: Page, deck: Deck, visit: (slide: Slide, step: number) => void | Promise<void>, options: SlideStepOptions = {}
): Promise<void> {
  const url = new URL(page.url());
  for (const slide of options.slides ?? deck.slides) {
    const section = `.presso-slide[data-slide-index="${slide.index}"]`;
    const goToStep = async (step: number) => {
      url.hash = step > 0 ? `/${slide.index}/${step}` : `/${slide.index}`;
      if (page.url() !== url.href) await page.goto(url.href);
      await page.locator(`${section}.is-active[data-build-current-step="${step}"]`).waitFor({ state: 'attached', timeout: 5000 });
    };

    await goToStep(0);
    const final = await page.locator(section).evaluate((element, compiledSteps) => {
      let highest = Number.isSafeInteger(compiledSteps) ? compiledSteps : 0;
      for (const item of element.querySelectorAll('[data-build-item]')) {
        const step = Number(item.getAttribute('data-build-step'));
        if (Number.isSafeInteger(step) && step > highest) highest = step;
      }
      return highest;
    }, slide.buildSteps);

    const start = options.steps === 'last' ? final : 0;
    for (let step = start; step <= final; step += 1) {
      if (step > 0) await goToStep(step);
      await visit(slide, step);
    }
  }
}
