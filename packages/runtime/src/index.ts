import { readFileSync } from 'node:fs';
import type { Deck, NotesPublicPolicy, Slide } from '@ajfisher/presso-core';
export { renderTranscriptMarkdown, resolveTranscriptProfile, TRANSCRIPT_PROFILES, type TranscriptMarkdownOptions, type TranscriptProfile } from './transcript.js';

export type RenderMode =
  | 'deck'
  | 'presenter'
  | 'control'
  | 'notes'
  | 'embed'
  | 'print-slides'
  | 'print-notes'
  | 'print-speaker'
  | 'print-handout'
  | 'print-notes-side'
  | 'print-notes-pages'
  | 'transcript';
export type RuntimeAssetName = 'presso.css' | 'presso-runtime.js';

interface RenderOptions {
  controlUrls?: string[];
  public?: boolean;
  server?: boolean;
}

interface RenderContext {
  assetPrefix: string;
  controlUrls: string[];
  editingCreateEnabled: boolean;
  editingEnabled: boolean;
  includeNotes: boolean;
  mode: RenderMode;
  notesPublic: NotesPublicPolicy;
  public: boolean;
  server: boolean;
}

const ASSET_ROOT = new URL('./assets/', import.meta.url);
const TEMPLATE_ROOT = new URL('./templates/', import.meta.url);
const RUNTIME_ASSET_DIR = '_presso/';
const FULL_NOTES_CHUNK_BUDGET = 1300;
const HANDOUT_NOTES_CHUNK_BUDGET = 1500;

const runtimeAssets: Record<RuntimeAssetName, { contentType: string; file: string }> = {
  'presso.css': { contentType: 'text/css; charset=utf-8', file: 'presso.css' },
  'presso-runtime.js': { contentType: 'text/javascript; charset=utf-8', file: 'presso-runtime.js' }
};

const templates = {
  control: readTemplate('control.html'),
  controllerPopover: readTemplate('controller-popover.html'),
  deck: readTemplate('deck.html'),
  document: readTemplate('document.html'),
  editOverlay: readTemplate('edit-overlay.html'),
  fullscreenPrompt: readTemplate('fullscreen-prompt.html'),
  modeControls: readTemplate('mode-controls.html'),
  notesButton: readTemplate('notes-button.html'),
  notesList: readTemplate('notes-list.html'),
  notesPanel: readTemplate('notes-panel.html'),
  notesPrivate: readTemplate('notes-private.html'),
  notesSection: readTemplate('notes-section.html'),
  presenter: readTemplate('presenter.html'),
  presenterIcons: readTemplate('presenter-icons.html'),
  presenterPreviewTemplate: readTemplate('presenter-preview-template.html'),
  printHandout: readTemplate('print-handout.html'),
  printHandoutPage: readTemplate('print-handout-page.html'),
  printNotes: readTemplate('print-notes.html'),
  printNotesEmpty: readTemplate('print-notes-empty.html'),
  printNotesPage: readTemplate('print-notes-page.html'),
  printSpeaker: readTemplate('print-speaker.html'),
  printSpeakerSlidePage: readTemplate('print-speaker-slide-page.html'),
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
  const context = buildContext(deck, canonicalRenderMode(mode), options);
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
  if (context.mode.startsWith('print-')) {
    return renderDocument(deck, context.mode, renderDeck(deck, context), context);
  }
  const body = [
    renderDeck(deck, context),
    context.notesPublic !== false ? renderNotesPanel() : '',
    renderModeControls(context.notesPublic)
  ].filter(Boolean).join('\n');
  return renderDocument(deck, mode, body, context);
}

function renderDocument(deck: Deck, mode: RenderMode, body: string, context: RenderContext): string {
  const printMode = mode.startsWith('print-');
  return renderTemplate('document', {
    body,
    editOverlay: context.editingEnabled ? renderTemplate('editOverlay') : '',
    fullscreenPrompt: printMode ? '' : renderTemplate('fullscreenPrompt'),
    mode,
    runtimeConfigJson: scriptJson({
      notesPublic: context.notesPublic,
      controlUrls: context.controlUrls,
      editing: context.editingEnabled
        ? {
          enabled: true,
          slideEndpoint: '/edit/slide',
          ...(context.editingCreateEnabled ? { createEndpoint: '/edit/slides' } : {})
        }
        : { enabled: false },
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
    shortcutsOverlay: printMode ? '' : renderTemplate('shortcutsOverlay'),
    themeHref: normalizeHref(deck.config.theme, context.assetPrefix),
    title: escapeHtml(deck.config.title),
    notesVisible: deck.config.notes.public === 'visible' ? 'true' : 'false'
  });
}

function renderDeck(deck: Deck, context: RenderContext): string {
  if (context.mode === 'print-notes') {
    return renderTemplate('printNotes', {
      pages: deck.slides.map((slide) => renderPrintNotesPages(slide, context, deck.slides.length)).join('\n')
    });
  }
  if (context.mode === 'print-speaker') {
    return renderTemplate('printSpeaker', {
      pages: deck.slides.map((slide) => [
        renderTemplate('printSpeakerSlidePage', {
          slide: renderSlide(slide, { ...context, includeNotes: false })
        }),
        renderPrintNotesPages(slide, context, deck.slides.length)
      ].join('\n')).join('\n')
    });
  }
  if (context.mode === 'print-handout') {
    return renderTemplate('printHandout', {
      pages: deck.slides.map((slide) => renderPrintHandoutPages(slide, context, deck.slides.length)).join('\n')
    });
  }
  return renderTemplate('deck', {
    slides: deck.slides.map((slide) => renderSlide(slide, context)).join('\n')
  });
}

function renderPrintNotesPages(slide: Slide, context: RenderContext, slideCount: number): string {
  const notesHtml = context.includeNotes ? rewriteRelativeHtml(slide.notesHtml, context.assetPrefix).trim() : '';
  const noteChunks = splitNotesHtml(notesHtml, FULL_NOTES_CHUNK_BUDGET);
  return noteChunks.map((notesChunk, chunkIndex) => (
    renderPrintNotesPage(slide, context, slideCount, 'page', notesChunk, chunkIndex, noteChunks.length)
  )).join('\n');
}

function renderPrintHandoutPages(slide: Slide, context: RenderContext, slideCount: number): string {
  const notesHtml = context.includeNotes ? rewriteRelativeHtml(slide.notesHtml, context.assetPrefix).trim() : '';
  const noteChunks = splitNotesHtml(notesHtml, HANDOUT_NOTES_CHUNK_BUDGET);
  const slideHtml = renderSlide(slide, { ...context, includeNotes: false });
  return noteChunks.map((notesChunk, chunkIndex) => renderTemplate('printHandoutPage', {
    notes: renderPrintNotesPage(slide, context, slideCount, 'handout', notesChunk, chunkIndex, noteChunks.length),
    part: String(chunkIndex + 1),
    parts: String(noteChunks.length),
    slide: slideHtml,
    slideIndex: String(slide.index)
  })).join('\n');
}

function renderPrintNotesPage(
  slide: Slide,
  context: RenderContext,
  slideCount: number,
  variant = 'page',
  notesHtmlOverride?: string,
  part = 0,
  parts = 1
): string {
  const notesHtml = notesHtmlOverride ?? (context.includeNotes ? rewriteRelativeHtml(slide.notesHtml, context.assetPrefix).trim() : '');
  return renderTemplate('printNotesPage', {
    index: String(slide.index + 1),
    notesHtml: notesHtml || renderTemplate('printNotesEmpty'),
    partLabel: parts > 1 ? ` · notes ${part + 1}/${parts}` : '',
    slideCount: String(slideCount),
    title: escapeHtml(slide.title),
    variant
  });
}

function splitNotesHtml(notesHtml: string, budget: number): string[] {
  const blocks = splitTopLevelHtmlBlocks(notesHtml);
  if (blocks.length === 0) return [''];
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWeight = 0;
  for (const block of blocks) {
    const weight = estimateNotesHtmlWeight(block);
    if (current.length > 0 && currentWeight + weight > budget) {
      chunks.push(current.join('\n'));
      current = [];
      currentWeight = 0;
    }
    current.push(block);
    currentWeight += weight;
  }
  if (current.length > 0) {
    chunks.push(current.join('\n'));
  }
  return chunks;
}

function splitTopLevelHtmlBlocks(html: string): string[] {
  const blocks: string[] = [];
  const tagPattern = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)(?:\s[^>]*)?>/g;
  let blockStart = 0;
  let depth = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    if (depth === 0 && match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index).trim();
      if (text) blocks.push(text);
      blockStart = match.index;
    }
    const tag = match[0];
    const tagName = match[1]?.toLowerCase();
    if (!tag.startsWith('<!--') && tagName && !isVoidHtmlTag(tagName) && !tag.endsWith('/>')) {
      if (tag.startsWith('</')) {
        depth = Math.max(0, depth - 1);
      } else {
        if (depth === 0) blockStart = match.index;
        depth += 1;
      }
    }
    if (depth === 0) {
      const block = html.slice(blockStart, tagPattern.lastIndex).trim();
      if (block) blocks.push(block);
      lastIndex = tagPattern.lastIndex;
      blockStart = lastIndex;
    }
  }
  const tail = html.slice(lastIndex).trim();
  if (tail) blocks.push(tail);
  return blocks;
}

function estimateNotesHtmlWeight(html: string): number {
  const text = html
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(?:p|li|h[1-6]|blockquote|pre|tr|ul|ol|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const structuralWeight = (html.match(/<(?:li|p|pre|table|blockquote)\b/gi) ?? []).length * 80;
  return text.length + structuralWeight;
}

function isVoidHtmlTag(tagName: string): boolean {
  return new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']).has(tagName);
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
    controllerPopover: renderTemplate('controllerPopover'),
    deck: renderDeck(deck, { ...context, mode: 'presenter' }),
    icons: renderTemplate('presenterIcons'),
    previews: deck.slides.map((slide) => renderTemplate('presenterPreviewTemplate', {
      index: String(slide.index),
      slideHtml: renderSlide(slide, context),
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
  const editingEnabled = server && (deck.config.source.type === 'folder' || deck.config.source.type === 'file') && (mode === 'deck' || mode === 'presenter');
  return {
    assetPrefix: server ? '/' : routePrefix(mode),
    controlUrls: options.controlUrls ?? [],
    editingCreateEnabled: editingEnabled && deck.config.source.type === 'folder',
    editingEnabled,
    includeNotes: shouldIncludeNotes(deck.config.notes.public, mode, server, publicBuild),
    mode,
    notesPublic: deck.config.notes.public,
    public: publicBuild,
    server
  };
}

function shouldIncludeNotes(policy: NotesPublicPolicy, mode: RenderMode, server: boolean, publicBuild: boolean): boolean {
  if (mode === 'print-slides') return false;
  if (publicBuild) return policy !== false;
  if (mode === 'presenter' || ['print-notes', 'print-speaker', 'print-handout', 'print-notes-side', 'print-notes-pages'].includes(mode)) return true;
  if (server) return true;
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

function canonicalRenderMode(mode: RenderMode): RenderMode {
  if (mode === 'print-notes-pages') return 'print-speaker';
  if (mode === 'print-notes-side') return 'print-handout';
  return mode;
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
