import { marked } from 'marked';

const NOTES_RE = /^:::notes\s*\n([\s\S]*?)\n:::\s*$/m;
const INLINE_DIRECTIVE_RE = /^::([a-zA-Z][\w-]*)(\{[^}]*\})?\s*$/gm;
const CONTAINER_DIRECTIVES = new Set(['columns', 'column', 'logos', 'quote-image', 'fragment']);
const CONTAINER_DIRECTIVE_OPEN_RE = /^:::([a-zA-Z][\w-]*)\s*$/;
const CONTAINER_DIRECTIVE_CLOSE_RE = /^:::\s*$/;

marked.use({
  gfm: true
});

export interface RenderedMarkdown {
  bodyMarkdown: string;
  bodyHtml: string;
  buildSteps: number;
  notesMarkdown: string;
  notesHtml: string;
}

export interface RenderMarkdownOptions {
  breaks?: boolean;
}

interface RenderContext {
  buildSteps: number;
}

interface MarkdownToken {
  raw?: string;
  type?: string;
}

export function renderSlideMarkdown(markdown: string): RenderedMarkdown {
  const { bodyMarkdown, notesMarkdown } = extractNotes(markdown);
  const context: RenderContext = { buildSteps: 0 };
  return {
    bodyMarkdown: bodyMarkdown.trim(),
    bodyHtml: renderMarkdownInternal(bodyMarkdown, { breaks: true }, context, true),
    buildSteps: context.buildSteps,
    notesMarkdown: notesMarkdown.trim(),
    notesHtml: renderMarkdown(notesMarkdown, { breaks: false })
  };
}

export function renderMarkdown(markdown: string, options: RenderMarkdownOptions = {}): string {
  return renderMarkdownInternal(markdown, options, undefined, false);
}

function renderMarkdownInternal(
  markdown: string,
  options: RenderMarkdownOptions = {},
  context?: RenderContext,
  collectBuilds = false
): string {
  if (!markdown.trim()) {
    return '';
  }
  const renderOptions = { breaks: options.breaks ?? true };
  const prepared = transformDirectives(markdown, renderOptions, context, collectBuilds);
  return marked.parse(prepared, { async: false, gfm: true, breaks: renderOptions.breaks }) as string;
}

export function extractNotes(markdown: string): { bodyMarkdown: string; notesMarkdown: string } {
  const match = markdown.match(NOTES_RE);
  if (!match) {
    return { bodyMarkdown: markdown, notesMarkdown: '' };
  }
  const notesMarkdown = match[1] ?? '';
  const bodyMarkdown = markdown.replace(match[0], '');
  return { bodyMarkdown, notesMarkdown };
}

function transformDirectives(markdown: string, options: Required<RenderMarkdownOptions>, context?: RenderContext, collectBuilds = false): string {
  let output = transformContainerDirectives(markdown, options, context, collectBuilds);

  output = output.replace(INLINE_DIRECTIVE_RE, (_full, name: string, rawAttrs = '') => {
    const attrs = parseAttrs(rawAttrs);
    if (name === 'iframe') {
      const src = escapeHtml(attrs.src ?? '');
      const title = escapeHtml(attrs.title ?? 'Embedded content');
      return `<iframe class="presso-iframe" data-directive="iframe" src="${src}" title="${title}" loading="lazy" allowfullscreen></iframe>`;
    }
    if (name === 'qr') {
      const value = escapeHtml(attrs.value ?? '');
      const label = escapeHtml(attrs.label ?? value);
      return `<div class="presso-qr" data-directive="qr" data-value="${value}">${label}</div>`;
    }
    if (name === 'video') {
      const src = escapeHtml(attrs.src ?? '');
      return `<video class="presso-video" data-directive="video" src="${src}" controls></video>`;
    }
    if (name === 'chart') {
      const type = escapeHtml(attrs.type ?? 'custom');
      const mount = escapeHtml(attrs.mount ?? 'chart');
      const data = escapeHtml(attrs.data ?? '');
      return `<div class="presso-chart" data-directive="chart" data-chart-type="${type}" data-chart-mount="${mount}" data-chart-data="${data}"></div>`;
    }
    return `<div data-directive="${escapeHtml(name)}"></div>`;
  });

  return output;
}

export function stripContainerDirectives(markdown: string): string {
  if (!markdown.trim()) return '';
  const lines = markdown.split(/\r?\n/);
  return stripDirectiveRange(lines, 0, lines.length).trim();
}

function transformContainerDirectives(markdown: string, options: Required<RenderMarkdownOptions>, context?: RenderContext, collectBuilds = false): string {
  const lines = markdown.split(/\r?\n/);
  return transformDirectiveRange(lines, 0, lines.length, options, context, collectBuilds);
}

function transformDirectiveRange(
  lines: string[],
  start: number,
  end: number,
  options: Required<RenderMarkdownOptions>,
  context?: RenderContext,
  collectBuilds = false
): string {
  const output: string[] = [];
  let index = start;
  while (index < end) {
    const name = containerDirectiveName(lines[index] ?? '');
    if (name) {
      const block = readDirectiveBlock(lines, index + 1, end);
      if (block) {
        output.push(renderContainerDirective(name, block.content.join('\n'), options, context, collectBuilds));
        index = block.nextIndex;
        continue;
      }
    }
    output.push(lines[index] ?? '');
    index += 1;
  }
  return output.join('\n');
}

function stripDirectiveRange(lines: string[], start: number, end: number): string {
  const output: string[] = [];
  let index = start;
  while (index < end) {
    const name = containerDirectiveName(lines[index] ?? '');
    if (name) {
      const block = readDirectiveBlock(lines, index + 1, end);
      if (block) {
        const content = stripDirectiveRange(block.content, 0, block.content.length).trim();
        if (content) output.push(content);
        index = block.nextIndex;
        continue;
      }
    }
    output.push(lines[index] ?? '');
    index += 1;
  }
  return output.join('\n');
}

function readDirectiveBlock(lines: string[], start: number, end: number): { content: string[]; nextIndex: number } | undefined {
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    if (containerDirectiveName(lines[index] ?? '')) {
      depth += 1;
      continue;
    }
    if (CONTAINER_DIRECTIVE_CLOSE_RE.test(lines[index] ?? '')) {
      if (depth === 0) {
        return {
          content: lines.slice(start, index),
          nextIndex: index + 1
        };
      }
      depth -= 1;
    }
  }
  return undefined;
}

function containerDirectiveName(line: string): string | undefined {
  const name = line.match(CONTAINER_DIRECTIVE_OPEN_RE)?.[1];
  return name && CONTAINER_DIRECTIVES.has(name) ? name : undefined;
}

function renderContainerDirective(
  name: string,
  content: string,
  options: Required<RenderMarkdownOptions>,
  context?: RenderContext,
  collectBuilds = false
): string {
  if (name === 'fragment' && collectBuilds && context) {
    return renderBuildFragment(content, options, context);
  }
  const html = renderMarkdownInternal(content.trim(), options, context, false);
  if (name === 'column') {
    return `<section class="presso-column" data-directive="column">${html}</section>`;
  }
  return `<div class="presso-${name}" data-directive="${name}">${html}</div>`;
}

function renderBuildFragment(content: string, options: Required<RenderMarkdownOptions>, context: RenderContext): string {
  const prepared = transformDirectives(content.trim(), options, context, false);
  const tokens = buildTokens(prepared);
  const html = isSingleListFragment(tokens)
    ? markDirectListItems(marked.parse(prepared, { async: false, gfm: true, breaks: options.breaks }) as string, context)
    : tokens.map((token) => renderBuildBlock(token, options, context)).join('\n');
  return `<div class="presso-fragment" data-directive="fragment">${html}</div>`;
}

function buildTokens(markdown: string): MarkdownToken[] {
  return (marked.lexer(markdown, { gfm: true }) as MarkdownToken[])
    .filter((token) => token.type !== 'space' && token.raw?.trim());
}

function isSingleListFragment(tokens: MarkdownToken[]): boolean {
  return tokens.length === 1 && tokens[0]?.type === 'list';
}

function renderBuildBlock(token: MarkdownToken, options: Required<RenderMarkdownOptions>, context: RenderContext): string {
  const step = nextBuildStep(context);
  const html = marked.parse(token.raw ?? '', { async: false, gfm: true, breaks: options.breaks }) as string;
  return addBuildAttrsToFirstTag(html, step);
}

function markDirectListItems(html: string, context: RenderContext): string {
  let listDepth = 0;
  return html.replace(/<\/?(?:ul|ol|li)\b[^>]*>/gi, (tag) => {
    const tagName = tag.match(/^<\/?([a-z]+)/i)?.[1]?.toLowerCase();
    const closing = /^<\//.test(tag);
    if ((tagName === 'ul' || tagName === 'ol') && !closing) {
      listDepth += 1;
      return tag;
    }
    if ((tagName === 'ul' || tagName === 'ol') && closing) {
      listDepth = Math.max(0, listDepth - 1);
      return tag;
    }
    if (tagName === 'li' && !closing && listDepth === 1) {
      return addBuildAttrsToTag(tag, nextBuildStep(context));
    }
    return tag;
  });
}

function addBuildAttrsToFirstTag(html: string, step: number): string {
  const markedHtml = html.replace(/<([a-z][\w:-]*)(\s[^>]*)?>/i, (tag) => addBuildAttrsToTag(tag, step));
  return markedHtml === html ? `<span data-build-item data-build-step="${step}">${html}</span>` : markedHtml;
}

function addBuildAttrsToTag(tag: string, step: number): string {
  return tag.replace(/^<([a-z][\w:-]*)/i, `<$1 data-build-item data-build-step="${step}"`);
}

function nextBuildStep(context: RenderContext): number {
  context.buildSteps += 1;
  return context.buildSteps;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const inner = raw.replace(/^\{|\}$/g, '');
  const attrRe = /([\w-]+)="([^"]*)"/g;
  for (const match of inner.matchAll(attrRe)) {
    attrs[match[1] ?? ''] = match[2] ?? '';
  }
  return attrs;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
