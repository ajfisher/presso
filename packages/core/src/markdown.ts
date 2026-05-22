import { marked } from 'marked';

const NOTES_RE = /^:::notes\s*\n([\s\S]*?)\n:::\s*$/m;
const INLINE_DIRECTIVE_RE = /^::([a-zA-Z][\w-]*)(\{[^}]*\})?\s*$/gm;
const CONTAINER_DIRECTIVES = new Set(['columns', 'column', 'logos', 'quote-image', 'fragment']);
const CONTAINER_DIRECTIVE_OPEN_RE = /^:::([a-zA-Z][\w-]*)\s*$/;
const CONTAINER_DIRECTIVE_CLOSE_RE = /^:::\s*$/;

marked.use({
  gfm: true,
  breaks: true
});

export interface RenderedMarkdown {
  bodyMarkdown: string;
  bodyHtml: string;
  notesMarkdown: string;
  notesHtml: string;
}

export function renderSlideMarkdown(markdown: string): RenderedMarkdown {
  const { bodyMarkdown, notesMarkdown } = extractNotes(markdown);
  return {
    bodyMarkdown: bodyMarkdown.trim(),
    bodyHtml: renderMarkdown(bodyMarkdown),
    notesMarkdown: notesMarkdown.trim(),
    notesHtml: renderMarkdown(notesMarkdown)
  };
}

export function renderMarkdown(markdown: string): string {
  if (!markdown.trim()) {
    return '';
  }
  const prepared = transformDirectives(markdown);
  return marked.parse(prepared, { async: false }) as string;
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

function transformDirectives(markdown: string): string {
  let output = transformContainerDirectives(markdown);

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

function transformContainerDirectives(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  return transformDirectiveRange(lines, 0, lines.length);
}

function transformDirectiveRange(lines: string[], start: number, end: number): string {
  const output: string[] = [];
  let index = start;
  while (index < end) {
    const name = containerDirectiveName(lines[index] ?? '');
    if (name) {
      const block = readDirectiveBlock(lines, index + 1, end);
      if (block) {
        output.push(renderContainerDirective(name, block.content.join('\n')));
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

function renderContainerDirective(name: string, content: string): string {
  const html = renderMarkdown(content.trim());
  if (name === 'column') {
    return `<section class="presso-column" data-directive="column">${html}</section>`;
  }
  return `<div class="presso-${name}" data-directive="${name}">${html}</div>`;
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
