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
npm create @presso my-talk
cd my-talk
npm install
npm run dev
```

Inside this repo, `make create NAME=my-talk` creates the same numbered starter deck with local package links.

## Runtime Shortcuts

- `Space`, `ArrowRight`, `PageDown`: next slide
- `ArrowLeft`, `PageUp`: previous slide
- `f`: toggle fullscreen
- `p`: open speaker view
- `n`: toggle notes when public notes are enabled
- `?`: show or hide shortcuts

The speaker view at `/presenter` shows the current slide, next slide preview, notes, elapsed time, target timing, session-persistent notes font controls, and a phone-controller QR code for opening `/control` from another device on the same network.

The controller's Keep awake toggle uses the browser Screen Wake Lock API. Mobile browsers require a secure context for this, so `http://localhost` can work during local desktop testing, but `http://<lan-ip>:3030/control` usually cannot. Use an HTTPS controller URL, such as one provided by Tailscale Serve, when testing from a phone.

For a tailnet HTTPS controller, run these in separate terminals:

```bash
make dev
make tailnet-serve
```

When Tailscale Serve is active, the dev server detects `tailscale serve status --json` and adds the matching `https://*.ts.net/control` URL to the speaker view. The phone-controller popover lets you choose which URL drives the QR code. If automatic detection is not available, set `PRESSO_CONTROL_URLS` to a comma-separated list before starting `make dev`.

Use `make tailnet-reset` to clear the temporary Tailscale Serve mapping.

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

## Contribution Guidelines

Presso is aiming for a small, maintainable core. The current direction is:

- Use TypeScript for framework contracts and internals where typed boundaries help: config, parsing, deck models, export, server, and package APIs.
- Keep browser-facing runtime code as real web files. CSS lives in `.css`, browser JavaScript lives in `.js`, and renderable HTML lives in `.html` templates.
- Avoid long inline CSS, JavaScript, or HTML template literals in TypeScript. Small single-line DOM/config injections are fine when they are the narrowest way to bind runtime data.
- Prefer plain modern platform features before adding dependencies.
- Use the Makefile targets for local workflows: `make check`, `make dev`, `make deck-build`, `make transcript`, and `make browser-smoke`.

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

The intended release flow is:

1. Keep PR commits conventional.
2. Generate changelog/release notes from commit history.
3. Run `make check` and package smoke tests.
4. Publish the scoped packages together unless a package is intentionally private/internal.
5. Create a GitHub release with migration notes for any author-facing changes.
