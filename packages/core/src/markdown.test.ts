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

  it('appends custom classes to inline directive roots', () => {
    const rendered = renderSlideMarkdown(`::iframe{src="https://example.com" title="Demo" class="live-demo wide"}
::qr{value="https://example.com" label="Example" class="qr-hook compact"}
::video{src="./assets/demo.mp4" class="video-hook"}
::chart{type="bar" mount="sales" data="[]" class="chart-hook"}
::unknown{class="unknown-hook"}`);

    expect(rendered.bodyHtml).toContain('<iframe class="presso-iframe live-demo wide"');
    expect(rendered.bodyHtml).toContain('<div class="presso-qr qr-hook compact"');
    expect(rendered.bodyHtml).toContain('<video class="presso-video video-hook"');
    expect(rendered.bodyHtml).toContain('<div class="presso-chart chart-hook"');
    expect(rendered.bodyHtml).toContain('<div class="unknown-hook" data-directive="unknown"></div>');
  });

  it('escapes custom directive classes before rendering html', () => {
    const rendered = renderSlideMarkdown('::iframe{src="https://example.com" class="safe<tag>"}');

    expect(rendered.bodyHtml).toContain('class="presso-iframe safe&lt;tag&gt;"');
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

  it('appends custom classes to container directive roots', () => {
    const rendered = renderSlideMarkdown(`:::columns{class="dense-grid"}
:::column{class="primary"}
Left
:::

:::column{class="secondary"}
Right
:::
:::

:::logos{class="partner-strip"}
![Logo](./assets/logo.svg)
:::

:::quote-image{class="pull-quote"}
> Quote
:::
`);

    expect(rendered.bodyHtml).toContain('<div class="presso-columns dense-grid" data-directive="columns">');
    expect(rendered.bodyHtml).toContain('<section class="presso-column primary" data-directive="column">');
    expect(rendered.bodyHtml).toContain('<section class="presso-column secondary" data-directive="column">');
    expect(rendered.bodyHtml).toContain('<div class="presso-logos partner-strip" data-directive="logos">');
    expect(rendered.bodyHtml).toContain('<div class="presso-quote-image pull-quote" data-directive="quote-image">');
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

  it('counts fragment list items as build steps', () => {
    const rendered = renderSlideMarkdown(`## Build

:::fragment
- First
- Second
- Third
:::
`);

    expect(rendered.buildSteps).toBe(3);
    expect(rendered.bodyHtml).toContain('<h2>Build</h2>');
    expect(rendered.bodyHtml).toContain('<li data-build-item data-build-step="1">First</li>');
    expect(rendered.bodyHtml).toContain('<li data-build-item data-build-step="2">Second</li>');
    expect(rendered.bodyHtml).toContain('<li data-build-item data-build-step="3">Third</li>');
  });

  it('appends custom classes to fragment directive roots', () => {
    const rendered = renderSlideMarkdown(`:::fragment{class="staged-list"}
- First
- Second
:::
`);

    expect(rendered.buildSteps).toBe(2);
    expect(rendered.bodyHtml).toContain('<div class="presso-fragment staged-list" data-directive="fragment">');
    expect(rendered.bodyHtml).toContain('<li data-build-item data-build-step="1">First</li>');
  });

  it('counts non-list fragment blocks as build steps', () => {
    const rendered = renderSlideMarkdown(`## Build

:::fragment
First paragraph.

> Second block.
:::
`);

    expect(rendered.buildSteps).toBe(2);
    expect(rendered.bodyHtml).toContain('<p data-build-item data-build-step="1">First paragraph.</p>');
    expect(rendered.bodyHtml).toContain('<blockquote data-build-item data-build-step="2">');
  });

  it('counts headings and list items inside one fragment in order', () => {
    const rendered = renderSlideMarkdown(`:::fragment
### Column one

- First
- Second
:::
`);

    expect(rendered.buildSteps).toBe(3);
    expect(rendered.bodyHtml).toContain('<h3 data-build-item data-build-step="1">Column one</h3>');
    expect(rendered.bodyHtml).toContain('<li data-build-item data-build-step="2">First</li>');
    expect(rendered.bodyHtml).toContain('<li data-build-item data-build-step="3">Second</li>');
  });

  it('supports nested fragments inside columns', () => {
    const rendered = renderSlideMarkdown(`:::columns
:::column
:::fragment
### First column

- One
- Two
:::
:::

:::column
:::fragment
### Second column

- Three
- Four
:::
:::
:::
`);

    expect(rendered.buildSteps).toBe(6);
    expect(rendered.bodyHtml).toContain('<div class="presso-columns" data-directive="columns">');
    expect(rendered.bodyHtml).toContain('<section class="presso-column" data-directive="column">');
    expect(rendered.bodyHtml).toContain('<h3 data-build-item data-build-step="1">First column</h3>');
    expect(rendered.bodyHtml).toContain('<li data-build-item data-build-step="3">Two</li>');
    expect(rendered.bodyHtml).toContain('<h3 data-build-item data-build-step="4">Second column</h3>');
    expect(rendered.bodyHtml).toContain('<li data-build-item data-build-step="6">Four</li>');
  });

  it('can build whole column blocks one column at a time', () => {
    const rendered = renderSlideMarkdown(`:::columns
:::fragment
:::column
### First column

- One
- Two
:::
:::

:::fragment
:::column
### Second column

- Three
- Four
:::
:::
:::
`);

    expect(rendered.buildSteps).toBe(2);
    expect(rendered.bodyHtml).toContain('<section data-build-item data-build-step="1" class="presso-column" data-directive="column">');
    expect(rendered.bodyHtml).toContain('<section data-build-item data-build-step="2" class="presso-column" data-directive="column">');
  });

  it('leaves malformed container directives as authored markdown', () => {
    const rendered = renderSlideMarkdown(`:::columns
:::column
Unclosed column`);

    expect(rendered.bodyMarkdown).toContain(':::columns');
    expect(rendered.bodyHtml).toContain(':::columns');
    expect(rendered.buildSteps).toBe(0);
  });

  it('strips nested container directive wrappers for transcript output', () => {
    expect(stripContainerDirectives(`:::columns{class="dense-grid"}
:::column{class="primary"}
Left
:::

:::column{class="secondary"}
Right
:::
:::`)).toBe('Left\n\nRight');
  });
});
