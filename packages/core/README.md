# @ajfisher/presso-core

Core config, Markdown parsing, and deck model for Presso.

![Presso deck preview](https://raw.githubusercontent.com/ajfisher/presso/main/docs/media/presso-deck.png)

Presso is a Markdown-native web presentation framework for talks, workshops, speaker notes, static publishing, and PDF export. `@ajfisher/presso-core` owns the framework contracts used by the CLI, runtime, and export packages: config loading, slide parsing, directive rendering, deck compilation, ordering helpers, timing, and local edit/writeback primitives.

## Install

```bash
npm install @ajfisher/presso-core
```

## Example

```js
import { compileDeck, renderSlideMarkdown } from '@ajfisher/presso-core';

const deck = await compileDeck('path/to/deck');
const rendered = renderSlideMarkdown('## Hello\n\n:::notes\nSpeaker note.\n:::');
```

## Public Surface

- `compileDeck`, `loadFolderSlides`, and `loadSingleFileSlides` produce the structured deck model.
- `loadConfig` and `resolveConfig` normalize `presso.config.*`.
- `renderMarkdown`, `renderSlideMarkdown`, and `extractNotes` handle slide body and notes Markdown.
- `readSlideSource`, `writeSlideSource`, and `createSlideSource` support local editing.
- Shared types such as `Deck`, `Slide`, `PressoConfigInput`, and `ResolvedPressoConfig` define package boundaries.

## Related Docs

- [Presso README](https://github.com/ajfisher/presso#readme)
- [Product shape](https://github.com/ajfisher/presso/blob/main/docs/product-shape.md)
- [Authoring format](https://github.com/ajfisher/presso/blob/main/docs/authoring-format.md)

