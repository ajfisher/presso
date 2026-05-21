# Agent Notes

These notes exist to keep future agent work aligned with the project direction.

## Runtime Assets

- Do not put substantial browser CSS, JavaScript, or HTML inside TypeScript string literals.
- CSS belongs in `packages/runtime/src/assets/*.css`.
- Browser JavaScript belongs in `packages/runtime/src/assets/*.js`.
- Rendered HTML shells/components belong in `packages/runtime/src/templates/*.html`.
- TypeScript may compose templates and inject escaped data, but it should not become the place where browser artifacts are authored.
- Static builds serve generated runtime assets from `_presso/`. Do not mix generated runtime files with deck-authored `assets/` or `public/` files.

## TypeScript Scope

- Keep TypeScript for Presso framework contracts: config, deck model, parser, server, export, CLI, and package APIs.
- Prefer modern JavaScript style inside TypeScript files. Avoid unnecessary type ceremony when inference is clear.
- Browser runtime code should remain plain modern JavaScript unless it becomes large enough to justify a separate build step.

## CSS Style

- Presso runtime markup is strongly structured. Prefer the DOM, `body[data-mode]`, semantic elements, direct-child selectors, native nesting, and cascade layers before adding new classes.
- Keep classes for stable runtime hooks, generated Markdown/directive output, reusable slide primitives, and public styling contracts.
- Avoid highly specific selectors that make deck themes difficult to override.

## Commits And Review

- Use conventional commits for all committed work.
- Keep changes scoped and reviewable. Prefer a focused commit for docs, a focused commit for runtime structure, and a focused commit for behavioural fixes.
- Run `make check` before committing. For runtime/browser changes, also run `make deck-build` and smoke-test `make dev`.
- Release-facing changes should also run `make release-check`.
- Publishable package dependencies between `@ajfisher/presso-*` packages must use semver ranges, not `file:` or `workspace:` specs.
- npm publishing uses trusted publishing through GitHub Actions OIDC. Keep `permissions.id-token: write`, do not reintroduce `NODE_AUTH_TOKEN` or `NPM_TOKEN` in `.github/workflows/publish-npm.yml`, and keep release workflow caching disabled.
- Publishable package manifests must keep `repository.url` aligned to `https://github.com/ajfisher/presso.git` with the correct `repository.directory`; npm validates this for trusted publishing.
- Do not manually edit generated Release Please PR outputs unless you are deliberately correcting release notes or package metadata.

## Public Output Safety

- Treat `notes.public: false` as a hard privacy boundary for static/public output.
- Do not leak local paths such as `rootDir` into public artifacts.
- Be cautious with local network server features. Static file serving must not permit path traversal outside the deck/public roots.
- For public/static changes, test nested routes as well as `/`; asset bugs often appear first in `/embed/`, `/notes/`, and `/print/*`.
