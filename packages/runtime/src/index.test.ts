import { describe, expect, it } from 'vitest';
import type { Deck } from '@presso/core';
import { renderPage, renderTranscriptMarkdown } from './index.js';

const deck: Deck = {
  config: {
    rootDir: '/tmp/presso-test',
    title: 'Runtime Test',
    author: 'ajfisher',
    tags: [],
    aspectRatio: '16:9',
    size: { width: 1280, height: 720 },
    source: { type: 'folder', path: './slides' },
    theme: './theme.css',
    rawHtml: true,
    notes: { public: 'toggle', defaultPrintLayout: 'page' },
    deploy: {}
  },
  slides: [
    {
      id: 'one',
      index: 0,
      sourcePath: '/tmp/presso-test/slides/001.md',
      title: 'One',
      layout: 'title',
      class: [],
      bodyMarkdown: '# One',
      bodyHtml: '<h1>One</h1>',
      notesMarkdown: 'Speaker notes',
      notesHtml: '<p>Speaker notes</p>',
      metadata: {}
    },
    {
      id: 'two',
      index: 1,
      sourcePath: '/tmp/presso-test/slides/002.md',
      title: 'Two',
      layout: 'bullets',
      class: [],
      bodyMarkdown: '## Two',
      bodyHtml: '<h2>Two</h2>',
      notesMarkdown: '',
      notesHtml: '',
      metadata: {}
    }
  ]
};

describe('runtime renderer', () => {
  it('uses real newlines when joining rendered slide HTML', () => {
    const html = renderPage(deck, 'deck');
    expect(html).toContain('</section>\n<section');
    expect(html).not.toContain('</section>\\n<section');
  });

  it('renders presentation controls and route config', () => {
    const html = renderPage(deck, 'deck');
    expect(html).toContain('data-action="fullscreen"');
    expect(html).toContain('data-action="presenter"');
    expect(html).not.toContain('data-action="control"');
    expect(html).toContain('id="presso-runtime-config"');
    expect(html).toContain('"presenter":"presenter/"');
    expect(html).toContain('<link rel="stylesheet" href="_presso/presso.css">');
    expect(html).toContain('<script src="_presso/presso-runtime.js" type="module"></script>');
    expect(html).not.toContain('function setIndex');
  });

  it('uses nested runtime and deck asset paths for static routes', () => {
    const html = renderPage({
      ...deck,
      slides: [
        {
          ...deck.slides[0]!,
          bodyHtml: '<img src="./assets/example.svg" srcset="./assets/example.svg 1x, assets/example@2x.svg 2x">'
        }
      ]
    }, 'embed', { public: true });

    expect(html).toContain('href="../_presso/presso.css"');
    expect(html).toContain('src="../_presso/presso-runtime.js"');
    expect(html).toContain('src="../assets/example.svg"');
    expect(html).toContain('srcset="../assets/example.svg 1x, ../assets/example@2x.svg 2x"');
  });

  it('omits private notes from public static render output', () => {
    const html = renderPage(deckWithNotesPolicy(false), 'presenter', { public: true });
    expect(html).not.toContain('<p>Speaker notes</p>');
    expect(html).not.toContain('data-action="notes"');
    expect(html).toContain('"notesPublic":false');
  });

  it('keeps toggle notes in public static render output but hides them by default', () => {
    const html = renderPage(deckWithNotesPolicy('toggle'), 'deck', { public: true });
    expect(html).toContain('Speaker notes');
    expect(html).toContain('data-action="notes"');
    expect(html).toContain('data-notes-visible="false"');
    expect(html).toContain('"notesPublic":"toggle"');
  });

  it('marks visible public notes as visible by default', () => {
    const html = renderPage(deckWithNotesPolicy('visible'), 'deck', { public: true });
    expect(html).toContain('Speaker notes');
    expect(html).toContain('data-notes-visible="true"');
  });

  it('renders presenter timing controls and next slide preview templates', () => {
    const html = renderPage(deck, 'presenter', { controlUrls: ['http://192.0.2.1:3030/control'], server: true });
    const config = runtimeConfig(html);
    expect(html).toContain('data-current-title');
    expect(html).toContain('data-elapsed');
    expect(html).toContain('data-current-target-time');
    expect(html).toContain('data-time-delta');
    expect(html).toContain('data-action="timer-reset"');
    expect(html).toContain('data-action="teleprompter-toggle"');
    expect(html).toContain('data-action="teleprompter-pause"');
    expect(html).toContain('data-action="teleprompter-slower"');
    expect(html).toContain('data-action="teleprompter-faster"');
    expect(html).toContain('data-action="teleprompter-reset"');
    expect(html).toContain('data-teleprompter-wpm');
    expect(html).toContain('data-action="controller-open"');
    expect(html).toContain('data-controller-popover');
    expect(html).toContain('data-controller-url-open');
    expect(html).toContain('data-controller-url-list');
    expect(html.indexOf('aria-label="Speaker notes"')).toBeLessThan(html.indexOf('aria-label="Current slide"'));
    expect(html).toContain('data-next-preview');
    expect(html).toContain('data-slide-preview-template="1"');
    expect(html).toContain('<h2>Two</h2>');
    expect(config.controlUrls).toEqual(['http://192.0.2.1:3030/control']);
  });

  it('renders controller state hooks and slide metadata without notes', () => {
    const html = renderPage(deck, 'control', { server: true });
    const config = runtimeConfig(html);

    expect(html).toContain('data-sync-status');
    expect(html).toContain('data-current-title');
    expect(html).toContain('data-current-position');
    expect(html).toContain('data-slide-count');
    expect(html).toContain('data-action="prev"');
    expect(html).toContain('data-action="next"');
    expect(html).toContain('data-action="fullscreen"');
    expect(html).toContain('data-action="wake-lock"');
    expect(html).toContain('type="checkbox"');
    expect(config.slides).toEqual([
      { id: 'one', index: 0, title: 'One' },
      { id: 'two', index: 1, title: 'Two' }
    ]);
    expect(JSON.stringify(config)).not.toContain('Speaker notes');
  });

  it('uses real newlines for transcript markdown', () => {
    const transcript = renderTranscriptMarkdown(deck);
    expect(transcript).toContain('# Runtime Test\n\n## One');
    expect(transcript).not.toContain('\\n');
  });
});

function deckWithNotesPolicy(publicNotes: Deck['config']['notes']['public']): Deck {
  return {
    ...deck,
    config: {
      ...deck.config,
      notes: {
        ...deck.config.notes,
        public: publicNotes
      }
    }
  };
}

function runtimeConfig(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/json" id="presso-runtime-config">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Runtime config script was not rendered.');
  return JSON.parse(match[1]!);
}
