# Presso

Web-based presentation framework for Markdown-native conference talks, workshops, and similar events.

## Quick Start

```bash
make install
make check
make dev
```

The example deck lives in `examples/basic`.

Use `make dev DECK=path/to/deck PORT=3031` to run a different local deck. Raw CLI access is available with `make presso ARGS="build examples/basic"` until the package is installed globally or from a generated deck.

To scaffold a new deck once the packages are published:

```bash
npm exec -- @ajfisher/presso-create my-talk
cd my-talk
npm install
npm run dev
```

Inside this repo, `make create NAME=my-talk` creates the same numbered starter deck with local package links.

## Runtime Shortcuts

- `Space`, `ArrowRight`, `PageDown`: next slide
- `ArrowLeft`, `PageUp`: previous slide
- `Home`: first slide
- `End`: last slide
- `f`: toggle fullscreen
- `p`: open speaker view
- `n`: toggle notes when public notes are enabled
- `?`: show or hide shortcuts

The speaker view at `/presenter` makes speaker notes the main surface, with compact current and next slide previews, elapsed time, target timing, session-persistent notes font controls, teleprompter controls, and a phone-controller QR code for opening `/control` from another device on the same network.

## Local Editing

In `presso dev`, double-click the active slide in `/` or `/presenter` to edit a folder-deck slide or single-file deck section. The editor exposes metadata YAML, body Markdown, and speaker notes as separate tabs, then saves back to only that active slide source. Static builds do not include the editor or slide source.

Single newlines in body and notes Markdown render as line breaks, which keeps edited slide text close to what appears on screen. The metadata editor includes a compact frontmatter cheat sheet; the fuller authoring reference is in [docs/authoring-format.md](docs/authoring-format.md).

## Reveal Migration

Use the minimal Reveal migrator to bootstrap an existing talk into native Presso files:

```bash
presso migrate reveal ~/dev/presentations/missions ~/dev/presentations/missions-presso
```

The migrator discovers `src/slides.md`, copies `src/images` and `src/static`, converts `Notes:` blocks to `:::notes`, maps common slide-level `class`, `data-background`, and `data-timing` values to frontmatter, and writes `MIGRATION.md` for manual follow-up. It does not attempt Reveal CSS or plugin compatibility.

## Presenter Teleprompter

Open `/presenter` and use the controls row:

- `Prompter`: turn notes auto-scroll on or off.
- `Pause` / `Resume`: stop or continue the current scroll position.
- `Slower` / `Faster`: adjust the global speaking pace in 10 wpm steps.
- `Reset scroll`: return the current slide notes to the top.
- `A-` / `A+`: adjust presenter notes text size.

The teleprompter defaults to `160 wpm`, clamps between `80 wpm` and `220 wpm`, and stores the current pace for the browser session. When you move to a new slide, the notes reset to the top and keep running if the prompter is enabled. Scrolling starts after a short paced delay based on the first notes paragraph, capped at 8 seconds, so the text does not move before you have started speaking. A subtle progress bar above the notes shows how far through the current slide notes you are.

## Phone Controller And Keep Awake

The controller's Keep awake toggle uses the browser Screen Wake Lock API. Mobile browsers require a secure context for this, so `http://localhost` can work during local desktop testing, but `http://<lan-ip>:3030/control` usually cannot. Use an HTTPS controller URL when testing from a phone.

For a tailnet HTTPS controller, run these in separate terminals:

```bash
make dev
make tailnet-serve
```

Tailscale Serve exposes the local Presso dev server at an HTTPS `https://*.ts.net/` URL and proxies it back to `http://127.0.0.1:3030`. Keep the phone signed into the same tailnet, open `/presenter`, click `Phone controller`, and choose the `https://*.ts.net/control` option in the URL list. The selected radio option drives the QR code, and the open icon opens that same URL directly.

When Tailscale Serve is active, the dev server detects `tailscale serve status --json` and adds the matching `https://*.ts.net/control` URL to the speaker view. The popover refreshes this list each time it opens, so you can start Tailscale Serve after the presenter is already open and then reopen the popover.

On the phone, scan the HTTPS QR code and turn on Keep awake from `/control`. If the toggle says `Unavailable`, check that the selected controller URL starts with `https://`, the phone is connected to the tailnet, and the browser is not blocking Screen Wake Lock due to low-power or visibility rules.

If automatic detection is not available, set `PRESSO_CONTROL_URLS` to a comma-separated list before starting `make dev`.

Use `make tailnet-reset` to clear the temporary Tailscale Serve mapping.

## PDF And Transcript Export

`presso pdf` exports slide-sized PDFs from the same print routes used in browser previews.

```bash
make pdf
make pdf PDF_ARGS="--layout=notes"
make pdf PDF_ARGS="--layout=speaker"
make pdf PDF_ARGS="--layout=handout"
make pdf PDF_ARGS="--all"
```

PDF layouts are:

- `slides`: full slides only, written to `slides.pdf`.
- `notes`: speaker notes only, written to `notes.pdf`.
- `speaker`: interleaved full slide then notes page, written to `speaker.pdf`.
- `handout`: shrunken slide and notes on the same page, written to `handout.pdf`.

Compatibility flags `--notes-pages` and `--notes-side` map to `speaker` and `handout`. Use `--out=custom.pdf` with a single layout. Local PDF exports include speaker notes even when `notes.public` is `false`; public static builds still omit private notes.

`presso transcript` writes paste-ready Markdown fragments for publishing talk notes. Profiles are:

- `notes-visuals`: slide titles, notes, and useful visuals or short statement slides.
- `notes`: slide titles and speaker notes only.
- `full`: slide titles, normalized slide body Markdown, and speaker notes.

```bash
make transcript
make transcript TRANSCRIPT_ARGS="--profile=notes"
make transcript TRANSCRIPT_ARGS="--profile=full --fragment --out=talk-notes.md"
```

Use slide frontmatter for exceptions: `transcript: false` omits a slide, `transcriptVisual` forces or suppresses a visual, and `transcriptBody: statement` includes a short statement in `notes-visuals`.

## Static Metadata

`presso build` writes `dist/metadata.json` for site integration. Required fields are always present:

- `title`
- `author`
- `tags`

Optional fields are omitted when unset rather than emitted as empty strings. Supported optional fields are:

- `event`
- `date`
- `excerpt`
- `featureImage`
- `baseUrl`
- `canonicalUrl`
- `embedUrl`
- `pdfUrl`
- `transcriptUrl`

`featureImage` is emitted exactly as configured so the consuming site can choose how to resolve or transform it. When `baseUrl` is configured, Presso normalises the trailing slash and derives `canonicalUrl`, `embedUrl`, `pdfUrl`, and `transcriptUrl`.

## Public Deck Manifest

`presso build` also writes `dist/deck.json` as a public manifest for static consumers. It is not the internal compiled deck model. The manifest includes deck metadata, note-publication policy, slide identity, layout, timing, background fields, and rendered `bodyHtml`.

Source-oriented and local-only fields are intentionally omitted from `deck.json`, including `rootDir`, `sourcePath`, arbitrary slide frontmatter, Markdown source, and deployment config. `notesHtml` is included only when `notes.public` is `"toggle"` or `"visible"`.

## Public Notes

`notes.public` controls whether speaker notes are emitted into public/static output:

- `false`: notes stay local and are omitted from static HTML, `deck.json`, and transcript output.
- `"toggle"`: notes are published, hidden by default, and can be shown with the Notes button, `/notes`, or `?notes=1`.
- `"visible"`: notes are published and visible by default in public companion views.

## Static Assets

Runtime files are generated under `_presso/` in static builds. Deck assets should live in `assets/`, public files can live in `public/`, and Markdown references should be deck-root relative, such as `./assets/diagram.svg`.

## Design Notes

- [Product shape](docs/product-shape.md)
- [Authoring format](docs/authoring-format.md)
- [Backgrounds and Reveal migration](docs/backgrounds-and-reveal-migration.md)
- [Release process](docs/release-process.md)

## Contribution Guidelines

Presso is aiming for a small, maintainable core. The current direction is:

- Use TypeScript for framework contracts and internals where typed boundaries help: config, parsing, deck models, export, server, and package APIs.
- Keep browser-facing runtime code as real web files. CSS lives in `.css`, browser JavaScript lives in `.js`, and renderable HTML lives in `.html` templates.
- Avoid long inline CSS, JavaScript, or HTML template literals in TypeScript. Small single-line DOM/config injections are fine when they are the narrowest way to bind runtime data.
- Prefer plain modern platform features before adding dependencies.
- Use the Makefile targets for local workflows: `make check`, `make dev`, `make deck-build`, `make transcript`, `make pdf`, and `make browser-smoke`.
- Use `make release-check` before release PRs or npm publishing; it verifies package metadata, dry-runs package contents, and smokes a generated deck.

### CSS And DOM

Slides and runtime modes have a strong, predictable DOM structure. Use that structure.

- Prefer `body[data-mode]`, semantic elements, direct-child selectors, and the cascade before introducing new classes.
- Keep classes for stable runtime hooks, generated Markdown/directive output, and reusable slide primitives such as `.presso-slide`, `.presso-stage`, `.presso-columns`, and `.presso-iframe`.
- Use CSS layers and native nesting where they make the hierarchy clearer.
- Theme authors should be able to override Presso without fighting overly-specific selectors.

### Commits

Use conventional commits consistently:

- `feat:` for user-visible capability
- `fix:` for bug fixes
- `docs:` for documentation-only changes
- `refactor:` for structure changes without intended behaviour changes
- `test:` for test-only changes
- `chore:` for tooling or maintenance

### Versioning And Releases

Presso should use semantic versioning once package publishing begins.

- Patch releases: compatible fixes and documentation/tooling corrections.
- Minor releases: new commands, authoring features, layouts, modes, and export capabilities.
- Major releases: breaking authoring format, config, CLI, package API, or runtime route changes.

The intended release flow is automated through Release Please:

1. Keep PR commits conventional.
2. Let the `Release` workflow open a release PR with changelogs and version bumps.
3. Run `make release-check` on the release PR.
4. Merge the release PR to create Git tags and GitHub Releases.
5. Publish the scoped packages through the manual `Publish npm Packages` workflow when ready.

See [Release process](docs/release-process.md) for details.
