import type { Deck, Slide } from '@presso/core';

export const TRANSCRIPT_PROFILES = ['full', 'notes', 'notes-visuals'] as const;
export type TranscriptProfile = typeof TRANSCRIPT_PROFILES[number];

export interface TranscriptMarkdownOptions {
  fragment?: boolean;
  includeNotes?: boolean;
  profile?: TranscriptProfile;
}

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;
const MARKDOWN_LINK_RE = /(!?\[[^\]]*\]\()([^)#][^)]+)(\))/g;
const CONTAINER_DIRECTIVE_RE = /^:::(columns|logos|quote-image|fragment)\s*\n([\s\S]*?)\n:::\s*$/gm;
const INLINE_DIRECTIVE_RE = /^::([a-zA-Z][\w-]*)(\{[^}]*\})?\s*$/gm;

export function renderTranscriptMarkdown(deck: Deck, options: TranscriptMarkdownOptions = {}): string {
  const profile = options.profile ?? 'notes-visuals';
  const includeNotes = options.includeNotes ?? true;
  const lines = options.fragment ? [] : transcriptHeader(deck);

  for (const slide of deck.slides) {
    const section = renderTranscriptSection(slide, deck, profile, includeNotes);
    if (section.length > 0) {
      lines.push(...section, '');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function resolveTranscriptProfile(value = 'notes-visuals'): TranscriptProfile {
  const profile = value.trim().toLowerCase();
  if (TRANSCRIPT_PROFILES.includes(profile as TranscriptProfile)) {
    return profile as TranscriptProfile;
  }
  throw new Error(`Unknown transcript profile "${value}". Expected one of: ${TRANSCRIPT_PROFILES.join(', ')}.`);
}

function transcriptHeader(deck: Deck): string[] {
  const lines = [`# ${deck.config.title}`, ''];
  const links: string[] = [];
  const baseUrl = normalizedBaseUrl(deck);
  if (baseUrl) {
    links.push(`[View slides](${baseUrl})`);
    links.push(`[Download slides PDF](${joinUrl(baseUrl, 'slides.pdf')})`);
  }
  if (links.length > 0) {
    lines.push(links.join(' · '), '');
  }
  return lines;
}

function renderTranscriptSection(slide: Slide, deck: Deck, profile: TranscriptProfile, includeNotes: boolean): string[] {
  if (slide.metadata.transcript === false) return [];

  const body = normalizedBodyMarkdown(slide, deck);
  const notes = includeNotes ? normalizeMarkdown(slide.notesMarkdown, deck) : '';
  const visual = transcriptVisualMarkdown(slide, deck);
  const bodyOverride = transcriptBodyOverride(slide);
  const includeBody = profile === 'full' || (profile === 'notes-visuals' && (bodyOverride === true || (bodyOverride === 'statement' && isStatementBody(slide, body))));
  const includeVisual = profile === 'notes-visuals' && visual;
  const bodyMatchesVisual = normalizeText(statementMarkdown(body)) === normalizeText(visual);
  const bodyContent = includeBody && (profile === 'full' || !bodyMatchesVisual) ? body : '';
  const content = [
    includeVisual ? visual : '',
    bodyContent,
    notes
  ].filter((value) => value.trim());

  if (content.length === 0) return [];
  return [`## ${slide.title}`, '', ...joinBlocks(content)];
}

function joinBlocks(blocks: string[]): string[] {
  return blocks.flatMap((block, index) => index === blocks.length - 1 ? [block] : [block, '']);
}

function normalizedBodyMarkdown(slide: Slide, deck: Deck): string {
  return removeDuplicateTitleHeading(normalizeMarkdown(slide.bodyMarkdown, deck), slide.title);
}

function normalizeMarkdown(markdown: string, deck: Deck): string {
  let output = markdown.trim();
  if (!output) return '';

  output = output.replace(CONTAINER_DIRECTIVE_RE, (_full, _name: string, content: string) => content.trim());
  output = output.replace(INLINE_DIRECTIVE_RE, (_full, name: string, rawAttrs = '') => {
    const attrs = parseAttrs(rawAttrs);
    if (name === 'iframe' || name === 'video') {
      const href = normalizeAssetUrl(attrs.src ?? attrs.href ?? '', deck);
      const label = attrs.title ?? attrs.label ?? (name === 'video' ? 'Video' : 'Embedded resource');
      return href ? `[${label}](${href})` : label;
    }
    if (name === 'qr') {
      const href = normalizeAssetUrl(attrs.value ?? '', deck);
      const label = attrs.label ?? attrs.value ?? 'QR code';
      return href ? `[${label}](${href})` : label;
    }
    if (name === 'chart') {
      const href = normalizeAssetUrl(attrs.data ?? '', deck);
      const label = attrs.title ?? attrs.label ?? 'Chart data';
      return href ? `[${label}](${href})` : label;
    }
    return '';
  });
  output = output.replace(MARKDOWN_LINK_RE, (_match, prefix: string, href: string, suffix: string) => {
    return `${prefix}${normalizeAssetUrl(href.trim(), deck)}${suffix}`;
  });
  return collapseBlankLines(output);
}

function removeDuplicateTitleHeading(markdown: string, title: string): string {
  const lines = markdown.split('\n');
  const first = lines[0]?.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
  if (!first || normalizeText(first[1] ?? '') !== normalizeText(title)) return markdown;
  return lines.slice(1).join('\n').trim();
}

function transcriptVisualMarkdown(slide: Slide, deck: Deck): string {
  const override = slide.metadata.transcriptVisual;
  if (override === false) return '';
  if (typeof override === 'string' && override.trim()) {
    return imageMarkdown(slide.title, override, deck);
  }
  if (slide.background) {
    return imageMarkdown(slide.title, slide.background, deck);
  }
  if (shouldIncludeStatement(slide)) {
    return statementMarkdown(normalizedBodyMarkdown(slide, deck));
  }
  if (slide.layout === 'logos') return '';
  const image = slide.bodyMarkdown.match(IMAGE_RE);
  if (image) {
    return imageMarkdown(image[1] || slide.title, image[2] ?? '', deck);
  }
  return '';
}

function shouldIncludeStatement(slide: Slide): boolean {
  return slide.layout === 'statement' || transcriptBodyOverride(slide) === 'statement';
}

function transcriptBodyOverride(slide: Slide): boolean | 'statement' | undefined {
  const value = slide.metadata.transcriptBody;
  if (value === true || value === false || value === 'statement') return value;
  return undefined;
}

function isStatementBody(slide: Slide, body: string): boolean {
  if (!body) return false;
  if (slide.layout === 'statement') return true;
  if (/```|^\s*[-*+]\s|\|/m.test(body)) return false;
  return body.replace(/[#*_`>\[\]().-]/g, '').trim().length <= 160;
}

function imageMarkdown(alt: string, href: string, deck: Deck): string {
  const url = normalizeAssetUrl(href, deck);
  return url ? `![${alt || 'Slide visual'}](${url})` : '';
}

function statementMarkdown(markdown: string): string {
  return markdown.replace(/^#{1,6}\s+(.+?)\s*#*\s*$/m, '$1').trim();
}

function normalizeAssetUrl(href: string, deck: Deck): string {
  const value = href.trim();
  if (!value || /^(?:[a-z]+:|\/|#)/i.test(value)) return value;
  const baseUrl = normalizedBaseUrl(deck);
  if (!baseUrl) return value;
  return joinUrl(baseUrl, value.replace(/^\.\//, ''));
}

function normalizedBaseUrl(deck: Deck): string | undefined {
  return deck.config.baseUrl?.replace(/\/+$/, '');
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/${path.replace(/^\/+/, '')}`;
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

function collapseBlankLines(value: string): string {
  return value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
