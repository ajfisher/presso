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
    expect(html).toContain('id="presso-runtime-config"');
    expect(html).toContain('"presenter":"presenter/"');
    expect(html).toContain('<link rel="stylesheet" href="presso.css">');
    expect(html).toContain('<script src="presso-runtime.js" type="module"></script>');
    expect(html).not.toContain('function setIndex');
  });

  it('uses real newlines for transcript markdown', () => {
    const transcript = renderTranscriptMarkdown(deck);
    expect(transcript).toContain('# Runtime Test\n\n## One');
    expect(transcript).not.toContain('\\n');
  });
});
