# @ajfisher/presso-export

Static, transcript, and PDF export helpers for Presso.

![Presso deck preview](https://raw.githubusercontent.com/ajfisher/presso/main/docs/media/presso-deck.png)

Presso is a Markdown-native web presentation framework for talks, workshops, speaker notes, static publishing, and PDF export. `@ajfisher/presso-export` compiles a deck into static HTML routes, public metadata, transcript Markdown, and Playwright-backed PDFs.

## Install

```bash
npm install @ajfisher/presso-export
```

Most deck authors use these helpers through the `presso build`, `presso transcript`, and `presso pdf` commands from `@ajfisher/presso-server`.

## Example

```js
import { buildStatic, exportPdf, exportTranscript } from '@ajfisher/presso-export';

await buildStatic('path/to/deck');
await exportTranscript('path/to/deck', 'transcript.md', { profile: 'notes-visuals' });
await exportPdf('path/to/deck', 'speaker', 'speaker.pdf');
```

## Outputs

- Static routes for `/`, `/embed`, `/presenter`, `/control`, `/notes`, `/transcript`, and `/print/*`.
- `_presso/` runtime assets isolated from deck-authored `assets/` and `public/` files.
- `deck.json` and `metadata.json` for public static consumers.
- Transcript profiles: `full`, `notes`, and `notes-visuals`.
- PDF layouts: `slides`, `notes`, `speaker`, and `handout`.

## Related Docs

- [Presso README](https://github.com/ajfisher/presso#readme)
- [Authoring format](https://github.com/ajfisher/presso/blob/main/docs/authoring-format.md)
- [Release process](https://github.com/ajfisher/presso/blob/main/docs/release-process.md)

