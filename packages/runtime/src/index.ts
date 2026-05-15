import { readFileSync } from 'node:fs';
import type { Deck, NotesPublicPolicy, Slide } from '@presso/core';

export type RenderMode = 'deck' | 'presenter' | 'control' | 'notes' | 'embed' | 'print-slides' | 'print-notes-side' | 'print-notes-pages' | 'transcript';
export type RuntimeAssetName = 'presso.css' | 'presso-runtime.js';

interface RenderOptions {
  public?: boolean;
  server?: boolean;
}

interface RenderContext {
  assetPrefix: string;
  includeNotes: boolean;
  mode: RenderMode;
  notesPublic: NotesPublicPolicy;
  public: boolean;
  server: boolean;
}

const ASSET_ROOT = new URL('./assets/', import.meta.url);
const TEMPLATE_ROOT = new URL('./templates/', import.meta.url);
const RUNTIME_ASSET_DIR = '_presso/';

const runtimeAssets: Record<RuntimeAssetName, { contentType: string; file: string }> = {
  'presso.css': { contentType: 'text/css; charset=utf-8', file: 'presso.css' },
  'presso-runtime.js': { contentType: 'text/javascript; charset=utf-8', file: 'presso-runtime.js' }
};

const templates = {
  control: readTemplate('control.html'),
  deck: readTemplate('deck.html'),
  document: readTemplate('document.html'),
  modeControls: readTemplate('mode-controls.html'),
  notesButton: readTemplate('notes-button.html'),
  notesList: readTemplate('notes-list.html'),
  notesPanel: readTemplate('notes-panel.html'),
  notesPrivate: readTemplate('notes-private.html'),
  notesSection: readTemplate('notes-section.html'),
  presenter: readTemplate('presenter.html'),
  presenterPreviewTemplate: readTemplate('presenter-preview-template.html'),
  printNotesPage: readTemplate('print-notes-page.html'),
  printNotesPages: readTemplate('print-notes-pages.html'),
  printNotesSide: readTemplate('print-notes-side.html'),
  printNotesSidePage: readTemplate('print-notes-side-page.html'),
  shortcutsOverlay: readTemplate('shortcuts-overlay.html'),
  slide: readTemplate('slide.html'),
  transcript: readTemplate('transcript.html'),
  transcriptSection: readTemplate('transcript-section.html')
};

export const runtimeAssetNames = Object.keys(runtimeAssets) as RuntimeAssetName[];

export function readRuntimeAsset(name: RuntimeAssetName): { content: string; contentType: string } {
  const asset = runtimeAssets[name];
  return {
    content: readFileSync(new URL(asset.file, ASSET_ROOT), 'utf8'),
    contentType: asset.contentType
  };
}

export function renderPage(deck: Deck, mode: RenderMode, options: RenderOptions = {}): string {
  const context = buildContext(deck, mode, options);
  if (mode === 'transcript') {
    return renderDocument(deck, mode, renderTranscriptHtml(deck, context), context);
  }
  if (mode === 'notes') {
    return renderDocument(deck, mode, renderNotes(deck, context), context);
  }
  if (mode === 'control') {
    return renderDocument(deck, mode, renderControl(deck), context);
  }
  if (mode === 'presenter') {
    return renderDocument(deck, mode, renderPresenter(deck, context), context);
  }
  const body = [
    renderDeck(deck, context),
    context.notesPublic !== false ? renderNotesPanel() : '',
    renderModeControls(context.notesPublic)
  ].filter(Boolean).join('\n');
  return renderDocument(deck, mode, body, context);
}

export function renderTranscriptMarkdown(deck: Deck, options: { includeNotes?: boolean } = {}): string {
  const includeNotes = options.includeNotes ?? true;
  const lines = [`# ${deck.config.title}`, ''];
  for (const slide of deck.slides) {
    lines.push(`## ${slide.title}`, '');
    if (slide.bodyMarkdown) {
      lines.push(slide.bodyMarkdown, '');
    }
    if (includeNotes && slide.notesMarkdown) {
      lines.push(slide.notesMarkdown, '');
    }
  }
  if (deck.config.baseUrl) {
    lines.push(`[View slides](${deck.config.baseUrl})`, '');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function renderDocument(deck: Deck, mode: RenderMode, body: string, context: RenderContext): string {
  return renderTemplate('document', {
    body,
    mode,
    runtimeConfigJson: scriptJson({
      notesPublic: context.notesPublic,
      routes: buildRoutes(mode, context.server),
      server: context.server,
      slides: deck.slides.map((slide) => ({
        id: slide.id,
        index: slide.index,
        title: slide.title
      }))
    }),
    runtimeCssHref: `${context.assetPrefix}${RUNTIME_ASSET_DIR}presso.css`,
    runtimeScriptHref: `${context.assetPrefix}${RUNTIME_ASSET_DIR}presso-runtime.js`,
    runtimeStyle: escapeAttr(`--presso-slide-width: ${deck.config.size.width}px; --presso-slide-height: ${deck.config.size.height}px; --presso-slide-ratio: ${deck.config.size.width} / ${deck.config.size.height};`),
    shortcutsOverlay: mode.startsWith('print-') ? '' : renderTemplate('shortcutsOverlay'),
    themeHref: normalizeHref(deck.config.theme, context.assetPrefix),
    title: escapeHtml(deck.config.title),
    notesVisible: deck.config.notes.public === 'visible' ? 'true' : 'false'
  });
}

function renderDeck(deck: Deck, context: RenderContext): string {
  if (context.mode === 'print-notes-side') {
    return renderTemplate('printNotesSide', {
      pages: deck.slides.map((slide) => renderTemplate('printNotesSidePage', {
        notesHtml: context.includeNotes ? rewriteRelativeHtml(slide.notesHtml, context.assetPrefix) : '',
        slide: renderSlide(slide, context)
      })).join('\n')
    });
  }
  if (context.mode === 'print-notes-pages') {
    return renderTemplate('printNotesPages', {
      pages: deck.slides.map((slide) => renderTemplate('printNotesPage', {
        notesHtml: context.includeNotes ? rewriteRelativeHtml(slide.notesHtml, context.assetPrefix) : '',
        slide: renderSlide(slide, context),
        title: escapeHtml(slide.title)
      })).join('\n')
    });
  }
  return renderTemplate('deck', {
    slides: deck.slides.map((slide) => renderSlide(slide, context)).join('\n')
  });
}

function renderSlide(slide: Slide, context: RenderContext): string {
  const classNames = ['presso-slide', ...slide.class].join(' ');
  const target = slide.targetTimeSeconds === undefined ? '' : secondsToClock(slide.targetTimeSeconds);
  const backgroundStyle = slide.background
    ? `background-image: url('${escapeAttr(normalizeHref(slide.background, context.assetPrefix))}'); background-size: ${escapeAttr(slide.backgroundFit ?? 'cover')};`
    : '';
  return renderTemplate('slide', {
    backgroundStyle: backgroundStyle ? ` style="${backgroundStyle}"` : '',
    bodyHtml: rewriteRelativeHtml(slide.bodyHtml, context.assetPrefix),
    classNames: escapeAttr(classNames),
    index: String(slide.index),
    layout: escapeAttr(slide.layout),
    notesHtml: context.includeNotes ? rewriteRelativeHtml(slide.notesHtml, context.assetPrefix) : '',
    slideId: escapeAttr(slide.id),
    targetTime: escapeAttr(target),
    title: escapeAttr(slide.title)
  });
}

function renderModeControls(policy: NotesPublicPolicy): string {
  return renderTemplate('modeControls', {
    notesButton: policy === false ? '' : renderTemplate('notesButton')
  });
}

function renderNotesPanel(): string {
  return renderTemplate('notesPanel');
}

function renderPresenter(deck: Deck, context: RenderContext): string {
  return renderTemplate('presenter', {
    deck: renderDeck(deck, { ...context, mode: 'presenter' }),
    previews: deck.slides.map((slide) => renderTemplate('presenterPreviewTemplate', {
      bodyHtml: rewriteRelativeHtml(slide.bodyHtml, context.assetPrefix),
      index: String(slide.index),
      title: escapeAttr(slide.title)
    })).join('\n')
  });
}

function renderControl(deck: Deck): string {
  return renderTemplate('control', {
    currentTitle: escapeHtml(deck.slides[0]?.title ?? 'No slides'),
    slideCount: String(deck.slides.length),
    title: escapeHtml(deck.config.title)
  });
}

function renderNotes(deck: Deck, context: RenderContext): string {
  if (!context.includeNotes) {
    return renderTemplate('notesPrivate');
  }
  return renderTemplate('notesList', {
    sections: deck.slides.map((slide) => renderTemplate('notesSection', {
      notesHtml: rewriteRelativeHtml(slide.notesHtml, context.assetPrefix),
      title: escapeHtml(slide.title)
    })).join('\n'),
    title: escapeHtml(deck.config.title)
  });
}

function renderTranscriptHtml(deck: Deck, context: RenderContext): string {
  return renderTemplate('transcript', {
    sections: deck.slides.map((slide) => renderTemplate('transcriptSection', {
      bodyHtml: rewriteRelativeHtml(slide.bodyHtml, context.assetPrefix),
      notesHtml: context.includeNotes ? rewriteRelativeHtml(slide.notesHtml, context.assetPrefix) : '',
      title: escapeHtml(slide.title)
    })).join('\n'),
    title: escapeHtml(deck.config.title)
  });
}

function buildContext(deck: Deck, mode: RenderMode, options: RenderOptions): RenderContext {
  const server = Boolean(options.server);
  const publicBuild = Boolean(options.public);
  return {
    assetPrefix: server ? '/' : routePrefix(mode),
    includeNotes: shouldIncludeNotes(deck.config.notes.public, mode, server, publicBuild),
    mode,
    notesPublic: deck.config.notes.public,
    public: publicBuild,
    server
  };
}

function shouldIncludeNotes(policy: NotesPublicPolicy, mode: RenderMode, server: boolean, publicBuild: boolean): boolean {
  if (server) return true;
  if (publicBuild) return policy !== false;
  if (mode === 'presenter' || mode.startsWith('print-notes')) return true;
  return policy !== false;
}

function buildRoutes(mode: RenderMode, server: boolean): Record<string, string> {
  if (server) {
    return {
      deck: '/',
      presenter: '/presenter',
      control: '/control',
      notes: '/notes',
      embed: '/embed'
    };
  }
  const prefix = routePrefix(mode);
  return {
    deck: prefix || './',
    presenter: `${prefix}presenter/`,
    control: `${prefix}control/`,
    notes: `${prefix}notes/`,
    embed: `${prefix}embed/`
  };
}

function routePrefix(mode: RenderMode): string {
  if (mode.startsWith('print-')) return '../../';
  if (['embed', 'presenter', 'control', 'notes', 'transcript'].includes(mode)) return '../';
  return '';
}

function normalizeHref(value: string, prefix: string): string {
  if (/^(?:[a-z]+:|\/|#)/i.test(value)) {
    return value;
  }
  return `${prefix}${value.replace(/^\.\//, '')}`;
}

function rewriteRelativeHtml(html: string, prefix: string): string {
  return rewriteSrcset(html, prefix).replace(/\b(src|href)=(["'])(.*?)\2/gi, (match, attr: string, quote: string, value: string) => {
    if (!value) return match;
    return `${attr}=${quote}${normalizeHref(value, prefix)}${quote}`;
  });
}

function rewriteSrcset(html: string, prefix: string): string {
  return html.replace(/\bsrcset=(["'])(.*?)\1/gi, (_match, quote: string, value: string) => {
    const rewritten = value
      .split(',')
      .map((candidate) => {
        const [url = '', ...descriptor] = candidate.trim().split(/\s+/);
        return [normalizeHref(url, prefix), ...descriptor].join(' ').trim();
      })
      .join(', ');
    return `srcset=${quote}${rewritten}${quote}`;
  });
}

function renderTemplate(name: keyof typeof templates, values: Record<string, string> = {}): string {
  return templates[name].replace(/\{\{([a-zA-Z][\w]*)\}\}/g, (_match, key: string) => values[key] ?? '');
}

function readTemplate(name: string): string {
  return readFileSync(new URL(name, TEMPLATE_ROOT), 'utf8').trim();
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function secondsToClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
