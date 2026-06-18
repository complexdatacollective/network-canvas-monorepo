# Releasing Interviewer v8

> **Prerelease phase.** While the app ships `8.0.0-alpha.x` builds it is on the
> changesets `ignore` list, so releases are **not** changeset-driven. Releases
> are triggered by bumping the version in `package.json`. Once `8.0.0` stable
> ships, interviewer-v8 rejoins the normal changeset workflow and this file
> should be revisited.

## Cut a release

1. Bump `version` in `apps/interviewer-v8/package.json` (e.g.
   `8.0.0-alpha.0` → `8.0.0-alpha.1`).
2. Sync the native project versions: `pnpm --filter @codaco/interviewer-v8 version:sync`
   (updates iOS `MARKETING_VERSION` and Android `versionName`).
3. Open a PR, merge to `main`.

On merge, the `release` job in [`.github/workflows/ci-and-release.yml`](../../.github/workflows/ci-and-release.yml)
diffs `apps/interviewer-v8/package.json`'s `version` against the previous commit.
A change triggers:

- **`interviewer-v8-build`** — builds the Electron app for macOS / Windows /
  Linux. `npmRebuild` rebuilds the native modules (SQLCipher, biometric-keystore)
  against Electron's ABI; `--publish never` emits the update metadata locally
  without uploading.
- **`interviewer-v8-publish`** — creates the GitHub release
  `interviewer-v8@v<version>` (installers + notes; flagged as a pre-release for
  `-alpha.x` versions) **and** recreates the stable `interviewer-v8-latest`
  release that the auto-updater feed points at.

## How auto-update finds it

`electron-builder.config.cjs` configures a **generic** `publish` provider at the
`interviewer-v8-latest` release URL. The channel is derived from the version:

- `8.0.0-alpha.1` → emits `alpha.yml` and bakes `channel: alpha` into
  `app-update.yml`, so the updater requests `alpha.yml` (which the build wrote).
- a stable `8.0.0` → emits/serves `latest.yml`.

`autoUpdater.allowPrerelease = true` ([`electron/update/updater.ts`](electron/update/updater.ts))
lets an alpha build accept a newer alpha.

**Two releases are needed to observe auto-update:** the first establishes the
feed + an installable build; a subsequent higher version is what an installed
build then detects, downloads, and installs. Capacitor (iPad/Android) and web
read GitHub Releases directly and don't depend on the feed.

## Platform notes

- **macOS** is signed + notarized when `APPLE_API_KEY`/`CSC_LINK` secrets are
  present — required for auto-update to apply.
- **Windows** ships unsigned (SmartScreen warns); auto-update still works.
- **Linux** AppImage auto-updates; `.deb` does not (update via the package
  manager).
