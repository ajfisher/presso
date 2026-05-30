# @ajfisher/presso-runtime

Browser rendering runtime and HTML templates for Presso decks.

![Presso notes preview](https://raw.githubusercontent.com/ajfisher/presso/main/docs/media/presso-notes.png)

Presso is a Markdown-native web presentation framework for talks, workshops, speaker notes, static publishing, and PDF export. `@ajfisher/presso-runtime` renders compiled decks into browser routes, serves the runtime CSS and JavaScript assets, and provides transcript Markdown helpers for publishable talk notes.

## Install

```bash
npm install @ajfisher/presso-runtime
```

Most deck authors use this package through `@ajfisher/presso-server` or `@ajfisher/presso-export`.

## Example

```js
import { renderPage, renderTranscriptMarkdown, readRuntimeAsset } from '@ajfisher/presso-runtime';

const html = renderPage(deck, 'presenter', { public: true });
const transcript = renderTranscriptMarkdown(deck, { profile: 'notes-visuals' });
const css = readRuntimeAsset('presso.css');
```

## Public Surface

- `renderPage(deck, mode, options)` renders deck, presenter, notes, control, embed, print, and transcript routes.
- `readRuntimeAsset(name)` returns the built runtime CSS or JavaScript file.
- `runtimeAssetNames` lists generated runtime assets.
- `renderTranscriptMarkdown`, `resolveTranscriptProfile`, and `TRANSCRIPT_PROFILES` power transcript export.

## Related Docs

- [Presso README](https://github.com/ajfisher/presso#readme)
- [Theme authoring](https://github.com/ajfisher/presso/blob/main/docs/theme-authoring.md)
- [Authoring format](https://github.com/ajfisher/presso/blob/main/docs/authoring-format.md)

