# Backgrounds And Reveal Migration

Presso should make real-world talk migration practical without copying
Reveal.js' runtime assumptions into the framework. Reveal compatibility is an
import concern. Presso's runtime, authoring format, and CSS hooks should stay
small, explicit, and modern.

This note defines the intended background model and the first-pass Reveal
migration shape based on the Missions deck migration spike.

## Principles

- Presso has its own slide model. Reveal decks are translated into that model.
- Slide backgrounds are explicit metadata, not inferred from generated inline
  styles or legacy class names.
- Image backgrounds do not receive an overlay by default.
- Overlays are deliberate author choices, represented as frontmatter.
- Runtime markup exposes stable semantic attributes and CSS custom properties.
- Themes should use cascade layers, `data-*` attributes, direct-child selectors,
  and CSS variables before adding extra classes.
- Migration should produce readable Presso Markdown, not compatibility markup.
- Unmappable Reveal behaviour should be reported clearly rather than hidden.

## Slide Background Model

The common authored form should stay simple:

```yaml
---
layout: image-title
background: ./assets/images/lunar_lander.png
---
```

This is shorthand for an image background:

```yaml
---
layout: image-title
background:
  image: ./assets/images/lunar_lander.png
  fit: cover
  position: center
  repeat: no-repeat
  overlay: none
---
```

Colour-only backgrounds should also be first-class:

```yaml
---
layout: logos
background:
  color: "#ffffff"
class:
  - brands
---
```

When an image needs a fallback colour:

```yaml
---
background:
  image: ./assets/images/team.webp
  color: "#10131a"
  fit: cover
  position: center
---
```

The background object should support:

- `image`: deck-root-relative image URL.
- `color`: CSS colour token.
- `fit`: `cover`, `contain`, `auto`, or a valid CSS background-size.
- `position`: valid CSS background-position, defaulting to `center`.
- `repeat`: valid CSS background-repeat, defaulting to `no-repeat`.
- `overlay`: `none`, a structured overlay object, or a CSS background value.

String shorthand remains useful, but the parser should classify it deliberately:

- A path-like string becomes `background.image`.
- A CSS colour string becomes `background.color`.

## Background Overlays

Overlays should be opt-in. A deck should never get a scrim just because it has
a background image.

No overlay:

```yaml
---
background:
  image: ./assets/images/large-team-perspective.webp
  overlay: none
---
```

Common scrim:

```yaml
---
background:
  image: ./assets/images/team.webp
  overlay:
    type: scrim
    direction: left
    strength: 0.45
---
```

Expected scrim directions:

- `full`
- `left`
- `right`
- `top`
- `bottom`

For power-user decks, allow a raw CSS background value:

```yaml
---
background:
  image: ./assets/images/team.webp
  overlay:
    css: "linear-gradient(90deg, rgb(0 0 0 / 0.55), transparent)"
---
```

The structured form should cover most decks. The raw CSS form is deliberately
available for one-off talk art direction.

## Runtime Contract

The rendered slide should expose background intent without requiring themes to
inspect inline style strings:

```html
<section
  class="presso-slide"
  data-layout="image-title"
  data-background="image"
  style="
    --presso-bg-image: url('./assets/images/lunar_lander.png');
    --presso-bg-color: #10131a;
    --presso-bg-fit: cover;
    --presso-bg-position: center;
    --presso-bg-repeat: no-repeat;
    --presso-bg-overlay: none;
  "
>
```

Expected `data-background` values:

- `none`
- `color`
- `image`
- `image color`

The runtime CSS can then stay clear:

```css
.presso-slide[data-background~="image"] {
  background-image: var(--presso-bg-image);
  background-size: var(--presso-bg-fit, cover);
  background-position: var(--presso-bg-position, center);
  background-repeat: var(--presso-bg-repeat, no-repeat);
}

.presso-slide[data-background~="color"] {
  background-color: var(--presso-bg-color);
}

.presso-slide::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--presso-bg-overlay, none);
  pointer-events: none;
}
```

Themes can override these hooks through ordinary CSS. They should not need
selectors such as `[style*='background-image']`.

## Layouts For Image Backgrounds

The Missions deck showed that "full-bleed background image with a heading panel"
is a common enough pattern to make first-class.

Recommended initial layout:

```yaml
---
layout: image-title
background: ./assets/images/lunar_lander.png
---

## Definition of done
```

The starter CSS should make `image-title`:

- Full-bleed.
- Background image cover by default.
- Heading rendered as a readable banner or panel.
- No overlay unless `background.overlay` is set.

Deck themes can then alter the panel treatment without changing Markdown.

## Reveal Migration Shape

The migration command should create Presso decks, not mixed Reveal/Presso decks:

```bash
presso migrate reveal ./old-talk ./new-talk
```

The first version should support the common folder layout used by recent talks:

```text
old-talk/
  src/
    slides.md
    images/
    static/
    css/theme/*.css
```

Expected generated Presso layout:

```text
new-talk/
  presso.config.ts
  theme.css
  Makefile
  MIGRATION.md
  slides/
    001-title.md
    002-context.md
  assets/
    images/
  public/
    static/
```

The command should support an explicit source file option later, but it can
start by discovering `src/slides.md`.

## Reveal Mapping Rules

Slide comments:

```markdown
<!-- .slide: data-background="/images/lunar_lander.png" class="lgimage" -->
```

become:

```yaml
---
layout: image-title
class:
  - lgimage
background:
  image: ./assets/images/lunar_lander.png
---
```

Colour backgrounds:

```markdown
<!-- .slide: data-background="#FFFFFF" class="brands" -->
```

become:

```yaml
---
layout: logos
class:
  - brands
background:
  color: "#FFFFFF"
---
```

Notes:

```markdown
Notes:
These are speaker notes with **Markdown**.
```

become:

```markdown
:::notes
These are speaker notes with **Markdown**.
:::
```

Two-column wrappers:

```html
<div class="twocolumn">
...
</div>
```

should become:

```markdown
:::columns
:::column
![Illustration](./assets/images/jfk.png)
:::

:::column
> Quote or text content.
:::
:::
```

Ambiguous `twocolumn` wrappers should be left as raw HTML and reported in
`MIGRATION.md` rather than guessed into the wrong structure.

Logo-only paragraphs should become:

```markdown
:::logos
![Aesop](./assets/images/logos/aesop.png)
![Nintendo](./assets/images/logos/nintendo.png)
:::
```

Reveal `data-timing` should be treated as ambiguous. The migration report should
state whether values were interpreted as per-slide durations or absolute
keyframes. For AJ's current decks, per-slide durations converted to cumulative
Presso `time` markers are a reasonable first pass, but the output should be
easy to review.

## Element-Level Reveal Comments

Reveal element comments are a migration concern:

```markdown
<!-- .element: class="download" -->
```

Presso should not copy this syntax into the core authoring format. The migrator
should handle common cases and warn for the rest:

- Link or image classes that match known patterns can become directive options
  or ordinary HTML where that is clearer.
- `class="download"` links can become normal Markdown links plus a migration
  note if the old CSS hid or styled them specially.
- Unmapped element comments should be removed from rendered Markdown and listed
  in `MIGRATION.md` with the slide number.

## Migration Report

Every migration should write `MIGRATION.md` beside the generated deck. It should
include:

- Source deck path and source Markdown file.
- Number of slides generated.
- Assets copied.
- Static files copied.
- Background mappings performed.
- Notes blocks converted.
- Timing interpretation.
- Element comments ignored or manually mapped.
- Duplicate IDs or titles adjusted.
- Manual follow-up items.

This is more useful than pretending the import is perfect.

## Product Gaps From The Missions Spike

The Missions migration broadly worked: slides rendered, notes came across,
assets loaded, transcript export worked, and static build worked. The gaps were
clear:

- Image background slides need first-class background semantics.
- Colour backgrounds should not be forced through image background handling.
- Themes need stable background hooks rather than inline-style sniffing.
- `image-title` should be a starter layout.
- `:::logos` should handle Markdown image wrapping cleanly.
- Duplicate slide IDs should be detected before build output is written.
- Reveal element comments need migration warnings or clean directive mappings.
