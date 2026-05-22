::slide
---
id: single-title
layout: title
title: Single file decks
---

# Single file decks

Markdown in one `slides.md`, split with `::slide`.

:::notes
Open with the point of this fixture: it is here to test local editing and single-file writeback.
:::

::slide
---
id: editing-scope
layout: statement
title: Editing scope
custom: retained-through-edit
---

## Each edit rewrites one slide section

The surrounding `::slide` blocks should stay untouched.

:::notes
This slide deliberately has an unknown frontmatter key so we can confirm it survives metadata edits.
:::

::slide
---
id: body-notes
layout: two-column
title: Body and notes
---

## Body

- Markdown stays editable
- Tables, lists, and raw HTML still work

## Notes

Notes are edited separately but saved back into the same section.

:::notes
Use this slide to test switching between Body, Notes, Layout, and Metadata tabs in the editor.
:::

::slide
---
id: markdown-table
layout: bullets
title: Markdown table
---

## Markdown support

| Feature | Status |
| --- | --- |
| GFM tables | Supported |
| Notes blocks | Supported |
| Raw HTML | Supported |

:::notes
This is a simple GFM table smoke test inside the single-file deck.
:::

::slide
---
id: final-check
layout: section
title: Final check
time: "5:00"
---

## Edit, save, reload

Then confirm the same `slides.md` file was updated.

:::notes
After saving a change, refresh the browser and confirm the edited content persists.
:::
