import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderSlideMarkdown, stripContainerDirectives } from './index.js';

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

  it('renders soft line breaks in notes as paragraph whitespace', () => {
    const rendered = renderSlideMarkdown(`# Slide

:::notes
First note line
continues as one paragraph.

Second paragraph
also continues.
:::`);

    expect(rendered.notesHtml).toContain('<p>First note line\ncontinues as one paragraph.</p>');
    expect(rendered.notesHtml).toContain('<p>Second paragraph\nalso continues.</p>');
    expect(rendered.notesHtml).not.toContain('<br>');
  });

  it('allows render callers to opt out of soft line break tags', () => {
    const html = renderMarkdown('First line\nSecond line', { breaks: false });

    expect(html).toContain('<p>First line\nSecond line</p>');
    expect(html).not.toContain('<br>');
  });

  it('renders nested column directives as semantic column sections', () => {
    const rendered = renderSlideMarkdown(`:::columns
:::column
![Diagram](./assets/diagram.svg)

Left **body**
:::

:::column
- One
- Two
:::
:::`);

    expect(rendered.bodyHtml).toContain('<div class="presso-columns" data-directive="columns">');
    expect(rendered.bodyHtml).toContain('<section class="presso-column" data-directive="column">');
    expect(rendered.bodyHtml).toContain('<strong>body</strong>');
    expect(rendered.bodyHtml).toContain('<li>Two</li>');
  });

  it('keeps legacy simple column wrappers working', () => {
    const rendered = renderSlideMarkdown(`:::columns
![Diagram](./assets/diagram.svg)

> Quote
:::`);

    expect(rendered.bodyHtml).toContain('<div class="presso-columns" data-directive="columns">');
    expect(rendered.bodyHtml).toContain('<blockquote>');
    expect(rendered.bodyHtml).not.toContain('class="presso-column"');
  });

  it('leaves malformed container directives as authored markdown', () => {
    const rendered = renderSlideMarkdown(`:::columns
:::column
Unclosed column`);

    expect(rendered.bodyMarkdown).toContain(':::columns');
    expect(rendered.bodyHtml).toContain(':::columns');
  });

  it('strips nested container directive wrappers for transcript output', () => {
    expect(stripContainerDirectives(`:::columns
:::column
Left
:::

:::column
Right
:::
:::`)).toBe('Left\n\nRight');
  });
});
