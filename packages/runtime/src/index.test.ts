import { describe, expect, it } from 'vitest';
import type { Deck } from '@ajfisher/presso-core';
import { renderPage, renderTranscriptMarkdown, type RenderMode } from './index.js';

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
      buildSteps: 0,
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
      buildSteps: 0,
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
    expect(html).toContain('<style data-presso-theme>@import url("theme.css") layer(presso.theme);</style>');
    expect(html).toContain('<script src="_presso/presso-runtime.js" type="module"></script>');
    expect(html).not.toContain('function setIndex');
  });

  it('imports deck themes into the theme cascade layer on nested routes', () => {
    const html = renderPage(deck, 'presenter');

    expect(html).toContain('<style data-presso-theme>@import url("../theme.css") layer(presso.theme);</style>');
    expect(html).not.toContain('<link rel="stylesheet" href="../theme.css">');
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
    expect(html).toContain('@import url("../theme.css") layer(presso.theme);');
    expect(html).toContain('src="../_presso/presso-runtime.js"');
    expect(html).toContain('src="../assets/example.svg"');
    expect(html).toContain('srcset="../assets/example.svg 1x, ../assets/example@2x.svg 2x"');
  });

  it('renders structured background hooks without default overlays', () => {
    const html = renderPage({
      ...deck,
      slides: [
        {
          ...deck.slides[0]!,
          layout: 'image-title',
          background: {
            image: './assets/open.webp',
            color: '#10131a',
            position: 'center top'
          }
        },
        {
          ...deck.slides[1]!,
          background: {
            color: '#ffffff'
          }
        }
      ]
    }, 'deck');

    expect(html).toContain('data-background="image color"');
    expect(html).toContain('--presso-bg-image: url(&quot;../assets/open.webp&quot;)');
    expect(html).toContain('--presso-bg-color: #10131a');
    expect(html).toContain('--presso-bg-fit: cover');
    expect(html).toContain('--presso-bg-position: center top');
    expect(html).toContain('--presso-bg-overlay: none');
    expect(html).toContain('data-background="color"');
    expect(html).toContain('--presso-bg-color: #ffffff');
    expect(html).not.toContain('background-image: url');
  });

  it('renders opt-in background scrims as CSS variables', () => {
    const html = renderPage({
      ...deck,
      slides: [{
        ...deck.slides[0]!,
        background: {
          image: './assets/team.webp',
          overlay: {
            type: 'scrim',
            direction: 'left',
            strength: 0.35
          }
        }
      }]
    }, 'deck');

    expect(html).toContain('--presso-bg-overlay: linear-gradient(90deg, rgb(0 0 0 / 0.35), transparent)');
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

  it('renders build metadata without hiding print output', () => {
    const buildDeck: Deck = {
      ...deck,
      slides: [{
        ...deck.slides[0]!,
        buildSteps: 2,
        bodyHtml: '<h2>Build</h2><ul><li data-build-item data-build-step="1">First</li><li data-build-item data-build-step="2">Second</li></ul>'
      }]
    };
    const html = renderPage(buildDeck, 'deck');
    const config = runtimeConfig(html);

    expect(html).toContain('data-build-steps="2"');
    expect(config.slides).toEqual([
      { buildSteps: 2, id: 'one', index: 0, title: 'One' }
    ]);

    const print = renderPage(buildDeck, 'print-slides');
    expect(print).toContain('data-mode="print-slides"');
    expect(print).toContain('data-build-item data-build-step="1"');
    expect(print).toContain('First');
    expect(print).toContain('Second');
    expect(print).not.toContain('data-build-visible="false"');
  });

  it('renders print PDF layouts with local notes and public privacy boundaries', () => {
    expect(renderPage(deck, 'print-slides')).toContain('data-mode="print-slides"');
    expect(renderPage(deck, 'print-slides')).not.toContain('Speaker notes');

    const notes = renderPage(deck, 'print-notes');
    expect(notes).toContain('data-mode="print-notes"');
    expect(notes).toContain('Slide 1/2');
    expect(notes).toContain('Speaker notes');
    expect(notes).toContain('No speaker notes');

    const speaker = renderPage(deck, 'print-speaker');
    expect(speaker).toContain('presso-print-slide-page');
    expect(speaker).toContain('presso-print-notes-page');

    const handout = renderPage(deck, 'print-handout');
    expect(handout).toContain('presso-print-handout-page');
    expect(handout).toContain('presso-print-handout-slide-scale');
    expect(handout).toContain('data-handout-part="1"');
    expect(handout).toContain('Speaker notes');
    expect(renderPage(deck, 'print-notes-pages')).toContain('data-mode="print-speaker"');
    expect(renderPage(deck, 'print-notes-side')).toContain('data-mode="print-handout"');

    const publicPrivate = renderPage(deckWithNotesPolicy(false), 'print-speaker', { public: true });
    expect(publicPrivate).not.toContain('<p>Speaker notes</p>');
  });

  it('renders wrapped note paragraphs without hard breaks across note routes', () => {
    const wrappedDeck = deckWithWrappedNotes();
    const noteRoutes: RenderMode[] = [
      'deck',
      'presenter',
      'notes',
      'print-notes',
      'print-speaker',
      'print-handout',
      'transcript'
    ];

    for (const mode of noteRoutes) {
      const html = renderPage(wrappedDeck, mode);

      expect(html).toContain('<p>First note line\ncontinues as one paragraph.</p>');
      expect(html).toContain('<p>Second paragraph\nalso continues.</p>');
      expect(html).not.toContain('First note line<br>continues as one paragraph.');
      expect(html).not.toContain('Second paragraph<br>also continues.');
    }
  });

  it('splits long handout notes into repeated slide context pages', () => {
    const longNotes = Array.from({ length: 9 }, (_, index) => (
      `<p>Long speaker note ${index + 1}. ${'This block gives the handout renderer enough text to require another notes page. '.repeat(4)}</p>`
    )).join('\n');
    const html = renderPage({
      ...deck,
      slides: [{
        ...deck.slides[0]!,
        notesHtml: longNotes
      }]
    }, 'print-handout');

    expect(html.match(/presso-print-handout-page/g)?.length).toBeGreaterThan(1);
    expect(html.match(/<h1>One<\/h1>/g)?.length).toBeGreaterThan(1);
    expect(html).toContain('data-handout-part="2"');
    expect(html).toContain('notes 2/');
  });

  it('splits long full notes pages instead of relying on browser continuation', () => {
    const longNotes = Array.from({ length: 9 }, (_, index) => (
      `<p>Long speaker note ${index + 1}. ${'This block gives the full notes renderer enough text to require another page. '.repeat(4)}</p>`
    )).join('\n');
    const longDeck = {
      ...deck,
      slides: [{
        ...deck.slides[0]!,
        notesHtml: longNotes
      }]
    };

    const notes = renderPage(longDeck, 'print-notes');
    const speaker = renderPage(longDeck, 'print-speaker');

    expect(notes.match(/presso-print-notes-page/g)?.length).toBeGreaterThan(1);
    expect(notes).toContain('notes 2/');
    expect(speaker.match(/presso-print-notes-page/g)?.length).toBeGreaterThan(1);
    expect(speaker).toContain('notes 2/');
  });

  it('renders presenter timing controls and next slide preview templates', () => {
    const html = renderPage(deck, 'presenter', { controlUrls: ['http://192.0.2.1:3030/control'], server: true });
    const config = runtimeConfig(html);
    expect(html).toContain('data-current-title');
    expect(html).toContain('<section data-presso-chrome aria-label="Speaker notes">');
    expect(html).toContain('<section data-presso-chrome aria-label="Timing">');
    expect(html).toContain('<section data-presso-chrome aria-label="Controls">');
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
    expect(html).toContain('data-notes-progress');
    expect(html).toContain('data-action="controller-open"');
    expect(html).toContain('data-controller-popover');
    expect(html).toContain('data-presso-chrome data-controller-popover');
    expect(html).toContain('data-controller-url-open');
    expect(html).toContain('data-controller-url-list');
    expect(html).toContain('aria-label="Slide navigation"');
    expect(html).toContain('aria-label="Presenter setup"');
    expect(html).toContain('aria-label="Teleprompter"');
    expect(html).toContain('data-tooltip="Reset elapsed timer"');
    expect(html).toContain('data-icon-only');
    expect(html).toContain('data-presenter-icons');
    expect(html).toContain('#presso-icon-chevron-right');
    expect(html.indexOf('aria-label="Speaker notes"')).toBeLessThan(html.indexOf('aria-label="Current slide"'));
    expect(html).toContain('data-next-preview');
    expect(html).toContain('data-slide-preview-template="1"');
    expect(html).toContain('<h2>Two</h2>');
    expect(config.controlUrls).toEqual(['http://192.0.2.1:3030/control']);
    expect(config.slides).toEqual([
      { buildSteps: 0, id: 'one', index: 0, title: 'One' },
      { buildSteps: 0, id: 'two', index: 1, title: 'Two' }
    ]);
  });

  it('renders local edit overlay only for server folder deck and presenter routes', () => {
    const html = renderPage(deck, 'deck', { server: true });
    const config = runtimeConfig(html);

    expect(html).toContain('data-edit-overlay');
    expect(html).toContain('data-edit-metadata');
    expect(html).toContain('Frontmatter keys');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-edit-tab="body"');
    expect(html).toContain('data-edit-tab="layout"');
    expect(html).toContain('data-edit-layout-option="two-column"');
    expect(html).toContain('data-action="edit-new-slide"');
    expect(config.editing).toEqual({
      enabled: true,
      createEndpoint: '/edit/slides',
      slideEndpoint: '/edit/slide'
    });

    const presenter = renderPage(deck, 'presenter', { server: true });
    expect(presenter).toContain('data-edit-overlay');

    const staticHtml = renderPage(deck, 'deck', { public: true });
    expect(staticHtml).not.toContain('data-edit-overlay');
    expect(staticHtml).not.toContain('/edit/slide');
    expect(staticHtml).not.toContain('/edit/slides');
    expect(runtimeConfig(staticHtml).editing).toEqual({
      enabled: false
    });

    const singleFileHtml = renderPage({
      ...deck,
      config: {
        ...deck.config,
        source: { type: 'file', path: './slides.md' }
      }
    }, 'deck', { server: true });
    const singleFileConfig = runtimeConfig(singleFileHtml);
    expect(singleFileHtml).toContain('data-edit-overlay');
    expect(singleFileHtml).toContain('/edit/slide');
    expect(singleFileConfig.editing).toEqual({
      enabled: true,
      createEndpoint: '/edit/slides',
      slideEndpoint: '/edit/slide'
    });
  });

  it('renders controller state hooks and slide metadata without notes', () => {
    const html = renderPage(deck, 'control', { server: true });
    const config = runtimeConfig(html);

    expect(html).toContain('data-sync-status');
    expect(html).toContain('<main data-presso-chrome>');
    expect(html).toContain('data-current-title');
    expect(html).toContain('data-current-position');
    expect(html).toContain('data-slide-count');
    expect(html).toContain('data-action="prev"');
    expect(html).toContain('data-action="next"');
    expect(html).toContain('data-action="fullscreen"');
    expect(html).toContain('data-action="wake-lock"');
    expect(html).toContain('type="checkbox"');
    expect(config.slides).toEqual([
      { buildSteps: 0, id: 'one', index: 0, title: 'One' },
      { buildSteps: 0, id: 'two', index: 1, title: 'Two' }
    ]);
    expect(JSON.stringify(config)).not.toContain('Speaker notes');
  });

  it('uses real newlines for transcript markdown', () => {
    const transcript = renderTranscriptMarkdown(deck, { profile: 'full' });
    expect(transcript).toContain('# Runtime Test\n\n## One');
    expect(transcript).not.toContain('\\n');
  });

  it('renders transcript profiles with portable markdown and slide overrides', () => {
    const transcriptDeck: Deck = {
      ...deck,
      config: {
        ...deck.config,
        baseUrl: 'https://talk.example.test'
      },
      slides: [
        {
          ...deck.slides[0]!,
          bodyMarkdown: '# One\n\n:::columns\n:::column\n![Diagram](./assets/diagram.svg)\n:::\n\n:::column\nImportant body text.\n:::\n:::\n\n::iframe{src="./demo/" title="Live demo"}',
          metadata: {}
        },
        {
          ...deck.slides[1]!,
          layout: 'statement',
          bodyMarkdown: '## Money in - Money out = Profit',
          notesMarkdown: 'Explain the simple statement.',
          metadata: { transcriptBody: 'statement' }
        },
        {
          ...deck.slides[1]!,
          id: 'skip',
          index: 2,
          title: 'Skip',
          bodyMarkdown: '## Skip',
          notesMarkdown: 'Skip notes',
          metadata: { transcript: false }
        },
        {
          ...deck.slides[1]!,
          id: 'background',
          index: 3,
          title: 'Background',
          background: { image: './assets/background.webp' },
          bodyMarkdown: '## Background',
          notesMarkdown: 'Background notes',
          metadata: {}
        }
      ]
    };

    const full = renderTranscriptMarkdown(transcriptDeck, { profile: 'full' });
    expect(full).toContain('[View slides](https://talk.example.test) · [Download slides PDF](https://talk.example.test/slides.pdf)');
    expect(full).toContain('![Diagram](https://talk.example.test/assets/diagram.svg)');
    expect(full).toContain('[Live demo](https://talk.example.test/demo/)');
    expect(full).not.toContain(':::columns');
    expect(full).not.toContain(':::column');
    expect(full).not.toContain('# One\n\n:::columns');
    expect(full).not.toContain('## Skip');

    const notes = renderTranscriptMarkdown(transcriptDeck, { fragment: true, profile: 'notes' });
    expect(notes).toContain('## One\n\nSpeaker notes');
    expect(notes).not.toContain('Important body text.');
    expect(notes).not.toContain('Money in - Money out = Profit');

    const notesVisuals = renderTranscriptMarkdown(transcriptDeck, { fragment: true, profile: 'notes-visuals' });
    expect(notesVisuals).toContain('## One\n\n![Diagram](https://talk.example.test/assets/diagram.svg)\n\nSpeaker notes');
    expect(notesVisuals).toContain('## Two\n\nMoney in - Money out = Profit\n\nExplain the simple statement.');
    expect(notesVisuals).toContain('## Background\n\n![Background](https://talk.example.test/assets/background.webp)\n\nBackground notes');
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

function deckWithWrappedNotes(): Deck {
  return {
    ...deck,
    slides: [
      {
        ...deck.slides[0]!,
        notesMarkdown: 'First note line\ncontinues as one paragraph.\n\nSecond paragraph\nalso continues.',
        notesHtml: '<p>First note line\ncontinues as one paragraph.</p>\n<p>Second paragraph\nalso continues.</p>\n'
      },
      deck.slides[1]!
    ]
  };
}

function runtimeConfig(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/json" id="presso-runtime-config">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Runtime config script was not rendered.');
  return JSON.parse(match[1]!);
}
