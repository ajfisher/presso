# Presso Authoring Format

Presso is Markdown-native. The authoring format should support fast writing,
speaker notes, clean metadata, edit/writeback, and transcript generation without
making the source file unpleasant to read.

## Deck Shapes

Presso supports two equivalent ways to author a deck.

## Single-File Decks

A single-file deck uses one `slides.md` file:

```text
my-talk/
  slides.md
  presso.config.ts
  theme.css
  assets/
```

This is best for:

- Short talks.
- Transcript-oriented talks.
- Fast drafts.
- Talks where reading the whole arc in one file matters.

Recommended slide separator:

```markdown
::slide
---
layout: title
time: "0:00"
---

# Follow me!
I know what I'm doing

:::notes
Opening notes with **Markdown**.
:::

::slide
---
layout: image
background: ./assets/map.webp
time: "6:00"
---

## Where are we?

:::notes
Ask for a show of hands.
:::
```

The `::slide` marker avoids ambiguity between slide boundaries and YAML
frontmatter fences. It also gives the compiler an explicit anchor for local
writeback.

Legacy Reveal-style `---` slide separators can be supported by an importer or
compatibility parser, but new decks should prefer `::slide`.

## Folder Decks

A folder deck uses one Markdown file per slide:

```text
my-talk/
  slides/
    001-title.md
    002-where-are-we.md
    003-imagine-your-team.md
  presso.config.ts
  theme.css
  assets/
```

This is the recommended default for starter decks. It is best for:

- Larger conference talks.
- Workshops.
- Decks with embedded demos or custom scripts.
- Local edit/writeback where only the active slide should be touched.
- Reordering slides without editing a large file.

The default order is lexical filename order. Numeric prefixes are therefore the
simple path:

```text
001-title.md
002-context.md
003-agenda.md
```

For more deliberate ordering, a deck can define a plain order file:

```text
# slides.order
slides/title.md
slides/where-are-we.md
slides/imagine-your-team.md
slides/agenda.md
```

This file is intentionally not YAML or TypeScript. It is just a newline-delimited
list of slide file paths, relative to the deck root. Blank lines and comments
starting with `#` are ignored.

The matching files are:

```text
slides/title.md
slides/where-are-we.md
slides/imagine-your-team.md
slides/agenda.md
```

If `slides.order` exists, it wins. If it does not exist, Presso sorts
`slides/**/*.md` lexically.

This gives three simple ordering workflows:

- Starter/default: use numeric filenames like `001-title.md`, `002-context.md`
  with no `slides.order` file.
- Plain order file: reorder by moving lines in `slides.order`; no file renaming.
- Helper-generated order: run a utility to create or refresh `slides.order`,
  then manually move lines.

Expected helper commands:

```bash
presso slide add
presso order init
presso order check
presso order append
```

`presso slide add` should create a new slide using the next numeric prefix. If
the highest existing slide is `003-agenda.md`, the command creates
`004-untitled.md`. The author can then rename it to something better, such as
`004-team-design.md`, without changing ordering.

`presso order init` should generate `slides.order` from the current lexical file
order. `presso order check` should report missing files, duplicate entries, and
orphaned slide files not listed in the order file. `presso order append` should
append new slide files that are not yet listed, without reordering the existing
list.

## Slide File Structure

Each slide is a Markdown document with optional YAML frontmatter, body content,
and optional Markdown notes:

```markdown
---
id: where-are-we
layout: image
background: ./assets/map2.webp
time: "6:00"
class:
  - question
---

## Where are we?

:::notes
We're all leaders here, and maybe a few soon to be leaders as well.

Ask:

- Who has reports that are individual contributors?
- Who has two layers?
- Who has larger teams?
:::
```

Notes are Markdown. They can contain paragraphs, lists, links, emphasis, code,
and simple directives if useful.

## Frontmatter

Slide frontmatter is YAML. The expected core fields are:

```yaml
id: where-are-we
title: Where are we?
layout: image
class:
  - question
background: ./assets/map2.webp
backgroundFit: cover
time: "6:00"
```

Recommended fields:

- `id`: stable slide identifier for URLs, controller state, edit writeback, and
  analytics.
- `title`: human-readable title for presenter view and transcript output.
- `layout`: named layout handled by CSS.
- `class`: additional class names or layout variants.
- `background`: image, video, colour, or CSS background token.
- `backgroundFit`: `cover`, `contain`, `tile`, or a theme-defined value.
- `time`: key timing marker such as `"6:00"` or `"00:06:00"`.
- `notesLayout`: optional print hint, such as `side`, `below`, or `page`.

Possible later fields:

- `event`
- `section`
- `duration`
- `transition`
- `fragments`
- `speakerOnly`
- `publish`
- `scripts`
- `styles`
- `assets`

Unknown fields should be preserved through edit/writeback.

## Assets

Markdown asset references are deck-root relative. Prefer `./assets/name.ext`
for authored slide assets and keep generated runtime files out of that folder.

Static builds use this layout:

- `_presso/`: generated Presso runtime CSS and JavaScript.
- `assets/`: deck-authored images, SVGs, video, and supporting files.
- `public/`: copied to the static output root for extra files that should live
  beside the deck.

Nested routes such as `/embed/`, `/notes/`, and `/print/slides/` rewrite
relative Markdown assets so the same source works across every output route.

## Notes

Speaker notes use a block directive:

```markdown
:::notes
This is the speaker script.

It supports **Markdown**, links, lists, and code.
:::
```

Notes should not render in the main slide deck by default. They render in:

- Presenter view.
- Companion notes view.
- PDF notes layouts.
- Transcript exports.
- Public notes-enabled modes when configured.

`notes.public` controls public/static output:

- `false`: omit notes from public HTML, `deck.json`, and transcript output.
- `"toggle"`: include notes publicly, hidden by default, with `/notes`,
  the Notes button, and `?notes=1`.
- `"visible"`: include notes publicly and show them by default in companion
  contexts.

Presenter view uses these same notes as the teleprompter source. The first
teleprompter version does not add Markdown directives; it estimates pace from
the rendered notes text, uses the first text block for the initial scroll delay,
and then scrolls the current slide notes at the selected words-per-minute pace.
The pace is global across slides for the browser session, while each slide
change resets the notes to the top before applying the initial delay again.

Lightweight timing or teleprompter hints may be added later with directive
syntax such as `::pause{seconds=3}`, but they are intentionally out of scope for
the current authoring format.

## Layouts

Layouts are named with frontmatter and implemented primarily in CSS:

```yaml
layout: title
```

The rendered slide should expose the layout as an attribute:

```html
<section class="presso-slide" data-layout="title">
```

Themes can then style layouts without JavaScript:

```css
[data-layout="title"] {
  display: grid;
  align-content: end;
}
```

Expected starter layouts:

- `title`
- `section`
- `statement`
- `bullets`
- `image`
- `image-title`
- `two-column`
- `quote-image`
- `logos`
- `code`
- `demo`
- `blank`

Deck authors can define any additional layout name in CSS.

## Directives

Directives are the first-class alternative to raw HTML for common slide needs.

### Columns

```markdown
:::columns
![Illustration](./assets/jfk.png)

> We choose to go to the Moon...
:::
```

### Iframe

```markdown
::iframe{src="https://example.com/demo" title="Live demo"}
```

Local development should also allow localhost resources:

```markdown
::iframe{src="http://localhost:8002/" title="Local hardware demo"}
```

Static export should warn when a public build references localhost.

### Logos

```markdown
:::logos
![Aesop](./assets/logos/aesop.png)
![Nintendo](./assets/logos/nintendo.png)
![Sony](./assets/logos/sony.png)
:::
```

### QR Code

```markdown
::qr{value="https://aieng.ajf.io" label="Slides"}
```

### Fragments

```markdown
:::fragment
This appears after the first advance.
:::
```

Fragments should be supported eventually, but they are not essential for the
initial cut because current recent decks mostly avoid them.

### Charts And SVG

For SVG or chart-heavy slides:

```markdown
::chart{type="custom" mount="conversion-chart" data="./assets/conversion.csv"}
```

Raw SVG fragments remain allowed:

```html
<svg class="conversion-chart" viewBox="0 0 1200 500"></svg>
```

Custom scripts should be deck-local and explicitly declared in frontmatter or
config rather than hidden in the global page.

## Raw HTML

Raw HTML is supported as a power user path:

```html
<iframe class="external" src="http://localhost:8002/" style="height: 400px;"></iframe>
```

Rules:

- Raw HTML is allowed in local and public builds.
- The compiler should preserve it.
- Export should warn about insecure, localhost, or missing external resources.
- Author-friendly directives should be preferred for common cases.
- A future hardening mode can disable raw HTML for shared or untrusted decks,
  but local authoring should default to enabled.

## Timing

Timing markers are keyframes:

```yaml
time: "15:00"
```

The runtime interpolates between known times. For example:

```text
slide 1:  0:00
slide 5:  6:00
slide 10: 15:00
slide 30: 30:00
```

Slides between markers inherit interpolated target times. The first
implementation can distribute time evenly. Later, timing can be weighted by:

- Speaker notes length.
- Code blocks.
- Number of bullets.
- Images or diagrams.
- Fragments.
- Explicit pause hints.

## Deck Config

Deck-level configuration lives in `presso.config.ts`:

```ts
export default {
  title: 'Follow me! I know what I am doing',
  event: 'Web Directions Code Leaders 2024',
  date: '2024-06-19',
  author: 'Andrew Fisher',
  baseUrl: 'https://wdcl2024.ajf.io',
  aspectRatio: '16:9',
  size: {
    width: 1280,
    height: 720
  },
  source: {
    type: 'folder',
    path: './slides'
  },
  theme: './theme.css',
  notes: {
    public: 'toggle',
    defaultPrintLayout: 'page'
  },
  deploy: {
    target: 's3',
    bucket: 'aj-web-wdcl2024'
  }
};
```

For a single-file deck:

```ts
export default {
  source: {
    type: 'file',
    path: './slides.md'
  }
};
```

## Edit Writeback

Local edit mode should preserve the chosen deck shape.

For folder decks:

- Double-click opens the active slide file content, notes, and metadata.
- Save rewrites only that slide file.
- Unknown frontmatter fields are preserved.

For single-file decks:

- Double-click opens the active slide section.
- Save patches only that slide section.
- `::slide` markers make the patch boundaries reliable.

This is one reason folder decks are recommended for larger talks.

## Transcript Export

Transcript export should combine:

- Slide title.
- Slide body content when relevant.
- Speaker notes.
- Selected images with captions/alt text.
- Public deck URL.
- PDF URL.

The output should be usable as Markdown for ajfisher.me.

## Migration Notes

Existing Reveal comments map naturally to new frontmatter:

```markdown
<!-- .slide: class="title" data-background="/images/foo.webp" data-timing="30" -->
```

becomes:

```yaml
layout: title
class:
  - title
background: /images/foo.webp
duration: 30
```

Migration does not need to be automatic for v1, but the mapping should be simple
enough to script later.
