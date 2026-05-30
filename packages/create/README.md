# @ajfisher/presso-create

Starter deck scaffolder for Presso.

![Presso deck preview](https://raw.githubusercontent.com/ajfisher/presso/main/docs/media/presso-deck.png)

Presso is a Markdown-native web presentation framework for talks, workshops, speaker notes, static publishing, and PDF export. `@ajfisher/presso-create` creates a new deck folder with numbered slide files, a local theme, npm scripts, and a dependency on the Presso CLI package.

## Quick Start

```bash
npm exec -- @ajfisher/presso-create my-talk
cd my-talk
npm install
npm run dev
```

The generated deck uses a `slides/` folder by default:

```text
my-talk/
  presso.config.ts
  theme.css
  slides/
  assets/
```

## Generated Scripts

- `npm run dev`: serve the deck locally with live browser routes.
- `npm run build`: write a static deck to `dist/`.
- `npm run pdf`: export slide PDFs.
- `npm run transcript`: export publishing-ready Markdown.
- `npm run deploy`: run the configured deploy command.

## Related Docs

- [Presso README](https://github.com/ajfisher/presso#readme)
- [Authoring format](https://github.com/ajfisher/presso/blob/main/docs/authoring-format.md)
- [Theme authoring](https://github.com/ajfisher/presso/blob/main/docs/theme-authoring.md)

