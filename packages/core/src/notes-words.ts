import { defaultTreeAdapter, parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

const WORD_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'word' });
const NON_CONTENT_TAGS = new Set(['script', 'style', 'template', 'noscript']);
const TEXT_BOUNDARIES = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr', 'ul'
]);

export function countNotesWords(notesHtml: string): number {
  if (!notesHtml) return 0;
  const text: string[] = [];
  appendNotesText(parseFragment(notesHtml).childNodes, text);

  let words = 0;
  for (const segment of WORD_SEGMENTER.segment(text.join(''))) {
    if (segment.isWordLike) words += 1;
  }
  return words;
}

function appendNotesText(nodes: DefaultTreeAdapterTypes.ChildNode[], text: string[]): void {
  for (const node of nodes) {
    if (defaultTreeAdapter.isTextNode(node)) {
      text.push(node.value);
      continue;
    }
    if (!defaultTreeAdapter.isElementNode(node) || NON_CONTENT_TAGS.has(node.tagName)) continue;
    if (node.attrs.some(({ name }) => name === 'hidden')) continue;
    const boundary = TEXT_BOUNDARIES.has(node.tagName);
    if (boundary) text.push(' ');
    appendNotesText(node.childNodes, text);
    if (boundary) text.push(' ');
  }
}
