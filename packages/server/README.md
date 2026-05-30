# @ajfisher/presso-server

Presso CLI, dev server, controller sync, and authoring helpers.

![Presso presenter preview](https://raw.githubusercontent.com/ajfisher/presso/main/docs/media/presso-presenter.png)

Presso is a Markdown-native web presentation framework for talks, workshops, speaker notes, static publishing, and PDF export. `@ajfisher/presso-server` is the main package deck authors use: it exposes the `presso` command and wires together the core parser, browser runtime, static export, PDF export, transcript export, local editing, and controller routes.

## Install

Most users should start with the scaffolder:

```bash
npm exec -- @ajfisher/presso-create my-talk
cd my-talk
npm install
npm run dev
```

Existing decks can install the CLI package directly:

```bash
npm install --save-dev @ajfisher/presso-server
```

## CLI

```bash
presso dev [deckDir] [--port=3030]
presso build [deckDir]
presso pdf [deckDir] [--layout=slides|notes|speaker|handout] [--all] [--out=file.pdf]
presso transcript [deckDir] [--profile=full|notes|notes-visuals] [--fragment] [--out=file.md]
presso deploy [deckDir] [--yes]
presso slide add [deckDir]
presso order init|check|append [deckDir]
presso create <directory>
presso migrate reveal <source> <target>
```

## Routes

The dev server and static build expose the same presentation surfaces:

- `/`: main deck
- `/presenter`: speaker notes, previews, timer, teleprompter, and controller QR
- `/control`: phone-friendly controls
- `/notes`: public notes companion view
- `/embed`: embeddable deck
- `/print/*`: print and PDF layouts
- `/transcript`: transcript companion view

## Related Docs

- [Presso README](https://github.com/ajfisher/presso#readme)
- [Authoring format](https://github.com/ajfisher/presso/blob/main/docs/authoring-format.md)
- [Release process](https://github.com/ajfisher/presso/blob/main/docs/release-process.md)

