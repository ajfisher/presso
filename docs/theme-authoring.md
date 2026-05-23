# CSS-First Theme Authoring

Presso themes are ordinary CSS files loaded after the runtime stylesheet. A deck
chooses its theme in `presso.config.ts`:

```ts
export default {
  theme: './theme.css'
};
```

For deck-specific styling, edit that deck's `theme.css`. Do not edit Presso's
runtime CSS unless the framework is missing a reusable hook.

## Stable Hooks

Themes should prefer structured slide hooks and the cascade:

```css
@layer presso.theme {
  :root {
    --presso-bg: #10131a;
    --presso-fg: #f8f3ea;
    --presso-accent: #e1b45c;
    --presso-column-gap: 2.4rem;
  }

  .presso-slide {
    color: var(--presso-fg);
    background-color: var(--presso-bg-color, var(--presso-bg));
  }

  .presso-slide[data-layout="image-title"] h1 {
    background: rgb(0 0 0 / 72%);
  }

  .presso-slide[data-background~="color"] {
    color: #141821;
  }

  .presso-slide.brands .presso-logos img {
    max-height: 4.5rem;
  }
}
```

Useful hooks:

- `:root` for deck-wide tokens.
- `.presso-slide` and `.presso-slide-body` for common slide treatment.
- `[data-layout="..."]` for layout-specific rules.
- `[data-background~="image"]` and `[data-background~="color"]` for background-aware rules.
- `.presso-columns`, `.presso-column`, and `.presso-logos` for first-class directives.
- Frontmatter `class` values for deck-specific slide variants.

## Backgrounds

Background metadata is rendered as CSS custom properties on each slide:

- `--presso-bg-image`
- `--presso-bg-color`
- `--presso-bg-fit`
- `--presso-bg-position`
- `--presso-bg-repeat`
- `--presso-bg-overlay`

Themes should target `data-background` and these custom properties rather than
sniffing inline styles.

```css
.presso-slide[data-background~="image"] {
  background-size: var(--presso-bg-fit, cover);
}

.presso-slide[data-background~="image"]::before {
  background: var(--presso-bg-overlay, none);
}
```

Image overlays are opt-in through slide metadata. Themes should not add a
blanket dark overlay to every image slide.

## Columns

Use explicit column blocks when authoring new decks:

```markdown
:::columns
:::column
Left content
:::

:::column
Right content
:::
:::
```

Theme-level column controls:

```css
.presso-columns {
  --presso-column-tracks: minmax(0, .85fr) minmax(0, 1.15fr);
  --presso-column-gap: 2.4rem;
  --presso-column-align: center;
  --presso-column-content-align: center;
}
```

## Dogfood Notes

Migrated Reveal decks should be shaped with Presso-native CSS rather than
ported Reveal theme CSS. Start by styling the deck-local `theme.css`, then move
only genuinely reusable hooks or defaults back into the Presso runtime.
