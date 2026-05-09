import { marked } from 'marked';

const NOTES_RE = /^:::notes\s*\n([\s\S]*?)\n:::\s*$/m;
const INLINE_DIRECTIVE_RE = /^::([a-zA-Z][\w-]*)(\{[^}]*\})?\s*$/gm;
const CONTAINER_DIRECTIVE_RE = /^:::(columns|logos|quote-image|fragment)\s*\n([\s\S]*?)\n:::\s*$/gm;

marked.use({
  gfm: true,
  breaks: false
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
  const bodyMarkdown = markdown.replace(match[0], '').trim();
  return { bodyMarkdown, notesMarkdown };
}

function transformDirectives(markdown: string): string {
  let output = markdown.replace(CONTAINER_DIRECTIVE_RE, (_full, name: string, content: string) => {
    const html = renderMarkdown(content.trim());
    return `<div class="presso-${name}" data-directive="${name}">${html}</div>`;
  });

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
