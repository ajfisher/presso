import { describe, expect, it } from 'vitest';
import { renderSlideMarkdown } from './index.js';

describe('markdown rendering', () => {
  it('extracts notes from slide body', () => {
    const rendered = renderSlideMarkdown('# Slide\n\n:::notes\n**Private** notes\n:::');
    expect(rendered.bodyHtml).toContain('<h1>Slide</h1>');
    expect(rendered.bodyHtml).not.toContain('Private');
    expect(rendered.notesHtml).toContain('<strong>Private</strong>');
  });

  it('renders iframe directives and preserves raw html', () => {
    const rendered = renderSlideMarkdown('::iframe{src="https://example.com" title="Demo"}\n\n<div class="raw">ok</div>');
    expect(rendered.bodyHtml).toContain('class=\"presso-iframe\"');
    expect(rendered.bodyHtml).toContain('<div class=\"raw\">ok</div>');
  });

  it('renders soft line breaks as slide line breaks', () => {
    const rendered = renderSlideMarkdown('First line\nSecond line');
    expect(rendered.bodyHtml).toContain('First line<br>Second line');
  });
});
