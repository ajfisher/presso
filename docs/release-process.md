# Release Process

Presso releases use semantic versioning, conventional commits, Release Please, GitHub Releases, and optional npm publishing.

## Package Strategy

The publishable packages are:

- `@presso/core`
- `@presso/runtime`
- `@presso/export`
- `@presso/create`
- `@presso/server`

These packages are released as a linked set. They should share the same version, and internal `@presso/*` dependencies must use semver ranges such as `^0.2.0`, never `file:` or `workspace:` ranges. Local workspace linking is handled by npm workspaces.

## Conventional Commits

Release Please reads merged commits on `main` and derives changelog entries and version bumps from conventional commit messages:

- `fix:` creates a patch release.
- `feat:` creates a minor release.
- `feat!:` or a `BREAKING CHANGE:` footer creates a major release.
- `docs:`, `test:`, `refactor:`, and `chore:` appear in history but do not usually drive a release unless they include a breaking-change marker.

Keep PRs squash/rebase friendly and use conventional commit subjects for every commit that should affect release notes.

## GitHub Release Flow

The `Release` workflow runs on pushes to `main`.

1. Release Please reads `release-please-config.json` and `.release-please-manifest.json`.
2. It opens or updates a release PR containing package version bumps, changelog entries, manifest updates, and internal dependency range updates.
3. Review the release PR like any other PR.
4. Merging the release PR creates Git tags and GitHub Releases.

Release Please is configured with the `node-workspace` and `linked-versions` plugins so the packages stay version-aligned.

## Local Release Checks

Run this before merging a release PR or publishing packages:

```bash
make release-check
```

This target:

- builds all packages
- verifies package metadata and publishable dependency ranges
- dry-runs npm package contents
- scaffolds a generated deck and proves the built CLI can build and transcript it

To write local package tarballs for inspection:

```bash
make release-pack
```

Tarballs are written under `.presso/packages/`.

## npm Publishing

npm publishing is manual until the release flow has been exercised safely.

1. Add an npm automation token as the `NPM_TOKEN` repository secret.
2. Open the `Publish npm Packages` workflow.
3. Run it once with `dry_run: true`.
4. If the dry run is clean, run it again with `dry_run: false`.

The workflow runs `make release-check` before publishing and publishes all workspaces with public scoped-package access.

## Consumer Install Path

After packages are published, deck authors should be able to run:

```bash
npm create @presso my-talk
cd my-talk
npm install
npm run dev
```

Existing decks should be able to update with:

```bash
npm update @presso/server
```

Minor and patch releases should preserve existing authoring formats and CLI commands. Breaking authoring, config, route, or package API changes require a major release and migration notes in the GitHub Release.
