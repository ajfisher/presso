# Presso Product Shape

Presso is a lightweight, Markdown-native presentation framework for building,
presenting, publishing, and archiving web-based talks and workshops.

The first audience is AJ Fisher, but the framework should be usable by other
speakers through a small npm-based workflow. The ideal experience is:

```bash
npm create @presso my-talk
cd my-talk
npm run dev
npm run pdf
npm run deploy
```

## Goals

- Keep Markdown as the source of truth for slides, speaker notes, transcripts,
  and published companion pages.
- Support modern web presentation behaviour similar to Reveal.js without copied
  framework checkouts, Sass, Grunt, Webpack boilerplate, or large per-deck build
  scaffolding.
- Make slide layouts easy to customise with CSS first, supported by a small
  directive and component system for common presentation patterns.
- Provide excellent speaker ergonomics: presenter view, phone controller,
  notes, next/previous slide previews, timer, timing cues, and teleprompter
  behaviour.
- Export high-quality PDFs for slides and notes.
- Publish static decks to public subdomains, while also making it easy to embed
  the deck and publish transcripts/resources on ajfisher.me.
- Support workshops and demos, including iframes, local resources, SVG, charts,
  code samples, and deck-specific assets.

## Non-Goals For The First Version

- Perfect compatibility with existing Reveal.js decks.
- A full visual slide editor.
- A broad theme marketplace.
- A heavy application framework requirement for deck authors.
- Reimplementing every Reveal.js plugin.

Existing talks can remain on the old system. Migration should be possible, but
it does not need to be automatic for v1.

## Core Experience

A deck is a normal folder with a small number of predictable files:

```text
my-talk/
  presso.config.ts
  theme.css
  slides.md
  slides/
  assets/
  public/
```

Deck authors can choose between:

- A single `slides.md` file for simple talks or transcript-oriented workflows.
- A `slides/` folder with one Markdown file per slide for larger talks,
  workshops, richer demos, or better writeback ergonomics.

Both forms compile to the same internal slide model.

## Package Shape

Start as an npm workspace so the split remains clean as the framework grows:

```text
packages/
  core/
  runtime/
  server/
  export/
  create/
```

- `@presso/core`: parse Markdown, directives, notes, metadata, and assets into a
  structured deck model.
- `@presso/runtime`: browser navigation, slide rendering, progress, fragments,
  presenter-safe state, and public companion modes.
- `@presso/server`: local dev server, WebSocket sync, phone controller pairing,
  and edit/writeback endpoints.
- `@presso/export`: Playwright-based HTML, PDF, image, and transcript export.
- `@presso/create`: scaffold a new deck with starter files.

The repo can start smaller than this, but this is the intended ownership model.
If useful later, an unscoped `create-presso` package can be published as a thin
alias, but scoped packages should be the default from the start.

## Rendering Modes

The local and static app should expose explicit modes rather than relying on
hostname or query-string hacks:

```text
/                  slide deck
/presenter          speaker view
/control            phone/controller view
/notes              companion notes view
/embed              ajfisher.me-friendly iframe view
/print/slides       print/PDF slides only
/print/notes-side   print/PDF slide plus notes beside or within the slide area
/print/notes-pages  print/PDF slide followed by structured notes
/transcript         long-form transcript/resource export
```

Static public deployments should omit or disable local-only writeback features,
but can keep companion notes, transcript, and embed modes.

## Authoring Principles

- Markdown should stay pleasant to read without running the framework.
- Long notes should remain easy to edit and support Markdown.
- Common slide patterns should be first-class directives rather than raw HTML.
- Raw HTML is allowed by default as a power user path.
- Slide metadata should be explicit and local to the slide.
- CSS should be the primary customisation surface.
- Layouts should be named and reusable, not hidden in one-off inline styles.

## Layout And Theme Model

Presso should prefer CSS-first layouts. A slide declares a layout name, and the
theme decides how that layout behaves:

```markdown
---
layout: title
background: ./assets/opening.webp
time: "0:00"
---

# Follow me!
I know what I'm doing
```

Theme files should be plain CSS:

```css
@layer presso.theme {
  :root {
    --presso-accent: #ff5e9a;
    --presso-slide-width: 1280px;
    --presso-slide-height: 720px;
  }

  [data-layout="title"] {
    align-content: end;
  }
}
```

No Sass or build-time CSS preprocessing should be required. If authors want to
run their own CSS build pipeline, that should be optional and external.

## Directives And Components

Presso should provide Markdown directives for common needs:

```markdown
::iframe{src="https://example.com/demo" title="Demo"}

:::columns
![Diagram](./assets/diagram.webp)

Key explanation text.
:::

:::notes
Use this section to explain the diagram. Notes support **Markdown**.
:::
```

Likely first-class directives:

- `::iframe`
- `::video`
- `::qr`
- `:::notes`
- `:::columns`
- `:::logos`
- `:::quote-image`
- `:::chart`
- `:::fragment`

Raw HTML stays available by default for uncommon cases, SVG fragments, and
advanced demos. The compiler should preserve it, while export should warn about
localhost, insecure, or missing external resources.

## Speaker Experience

Presenter view should include:

- Speaker notes with Markdown rendering as the primary surface.
- Compact current slide preview.
- Compact next slide preview.
- Font size controls.
- Elapsed and remaining time.
- Timing markers and pacing feedback.
- Previous/next controls.
- Teleprompter mode with configurable words-per-minute auto-scroll pace,
  pause/resume, reset, and a paced initial delay.
- Notes progress indicator for the current slide.

The `/control` view should work over the local network or Tailscale. A simple
pairing code is useful, but not required for the first local-only version.

## Public Notes

Speaker notes need an explicit public policy because they often contain the
best transcript material, but they can also contain private presenter prompts.

The intended modes are:

- `false`: notes are private. They are available in local presenter/export
  flows, but not included in public static output.
- `"toggle"`: notes are included in public static output, hidden by default, and
  available through `/notes`, a notes toggle, or `?notes=1`.
- `"visible"`: notes are shown by default in public companion/embed modes.

The package default should be `false` for general safety. AJ-style talk starters
can default to `"toggle"` because publishing notes and transcripts is a primary
workflow.

## Timing

Slides can define key timing beats:

```markdown
---
time: "6:00"
---
```

The first version should interpolate between keyframes. Later versions can
weight the interpolation by content, notes length, code blocks, fragments, and
explicit pause markers.

## Edit And Writeback

In local dev mode, double-clicking a slide should open edit mode for:

- Slide body Markdown.
- Speaker notes.
- Slide metadata.

For folder decks, writeback should update only the active slide file. For
single-file decks, writeback should patch the relevant slide section.

The editor should preserve Markdown as the source of truth. Generated HTML is
never edited directly.

## Export

Presso should support:

- Static HTML build.
- PDF slides only.
- PDF slides with notes beside or within the slide body.
- PDF slides followed by notes pages.
- Transcript/long-form HTML.
- Transcript Markdown for ajfisher.me reuse.

PDF export should use Playwright so browser rendering and exported rendering are
the same system.

## Deployment

Subdomain deployment is a primary use case. A deck should be able to declare an
S3 target:

```ts
export default {
  title: 'Follow me',
  baseUrl: 'https://wdcl2024.ajf.io',
  deploy: {
    target: 's3',
    bucket: 'aj-web-wdcl2024',
    cloudfrontDistributionId: '...'
  }
};
```

The static build should be self-contained and include deck assets, PDFs,
metadata, transcript outputs, and any public demo files.

## ajfisher.me Integration

The framework should make it easy to publish a talk resource page on ajfisher.me
without manually reconstructing the talk:

- Generate an iframe-friendly `/embed` mode.
- Generate transcript Markdown or HTML.
- Generate metadata for title, date, event, description, feature image, tags,
  PDF link, and canonical deck URL.
- Keep subdomain-hosted deck assets separate from the main site, while making
  site embedding straightforward.

## MVP

The first useful version should include:

1. Markdown parser with slide frontmatter, notes, and a small directive set.
2. Single-file and folder-based deck loading.
3. Browser deck runtime with keyboard/touch navigation, hash URLs, and progress.
4. CSS-first layout/theme system.
5. Presenter view with notes, next slide, timer, and font controls.
6. Playwright PDF export for slides and notes.
7. Static build.
8. Local phone controller over WebSocket.

Edit/writeback, teleprompter auto-scroll, advanced timing interpolation, and S3
deploy can follow immediately after the basic deck loop works.
