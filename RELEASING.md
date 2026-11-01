# Releasing and the community listing

> Created: 2026-11-01 / by Aksel Alvarez Jurgueson & Claude
> Last updated: 2026-11-01 / by Claude

Super Productivity lists community plugins from [`src/assets/community-plugins.json`](https://github.com/super-productivity/super-productivity/blob/master/src/assets/community-plugins.json), which ships with the app. Getting listed, and every update after that, is a pull request to that file. The rules are in the [plugin development guide](https://github.com/super-productivity/super-productivity/blob/master/docs/plugin-development.md#get-listed-in-the-app).

## Cutting a release

1. Bump `version` in **both** `src/manifest.json` and `package.json` (the tests fail if they differ). It must be numeric: `1.2.0`, not `1.2.0-beta`.
2. Add the changes to `CHANGELOG.md`.
3. `npm test && npm run build` locally, and try the ZIP in the app.
4. Commit, then tag and push the tag:
   ```
   git tag v0.2.0
   git push origin main v0.2.0
   ```
5. The *Release* workflow tests, builds, and publishes a GitHub release with `sp-timesheets-<version>.zip`, its `.sha256`, and — in the release notes — the ready-made entry for `community-plugins.json`.

The build is reproducible: the same sources give the same ZIP bytes, so `npm run build && npm run listing` locally prints the same `sha256` as CI. If they differ, check line endings (`.gitattributes` forces LF).

## First listing

1. Fork [super-productivity/super-productivity](https://github.com/super-productivity/super-productivity).
2. Add the entry from the release notes to `src/assets/community-plugins.json` (a JSON array; add the object at the end).
3. `npx prettier --write src/assets/community-plugins.json` and `npm run lint`.
4. Open the PR. The *Community Plugins* CI check downloads the ZIP and verifies its size (≤ 10 MB), SHA-256, and that the manifest `id` and `version` match the entry.

## Updates

Open a PR to the same file that changes `release.version`, `release.downloadUrl` and `release.sha256` — all three are in the new release's notes. Users see **Update** once a Super Productivity release containing the new entry reaches them.

## What the listing does and does not mean

A listing is not a code review: the app only checks that the downloaded ZIP matches the hash. This plugin keeps its review surface small on purpose — no `plugin.js`, no network access, no `nodeExecution`, no `postMessage` listeners; it only reads tasks, projects and tags and stores its own settings.
