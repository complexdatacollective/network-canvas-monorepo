# Interviewer v7 Electron release pipeline

**Date:** 2026-05-27
**Status:** Design — implementation pending.
**Goal:** Wire `apps/interviewer-v7`'s Electron build into the monorepo's changesets release flow, publish signed + notarized macOS / unsigned Windows / unsigned Linux binaries to GitHub Releases on production version bumps, and produce per-PR snapshot binaries (uploaded as workflow artifacts) whenever a PR contains a changeset that touches `@codaco/interviewer-v7`.

## Problem

`apps/interviewer-v7` is `private: true` and never published to npm, so the existing `release` job (`changesets/action` → `pnpm publish-packages`) never produces a binary for it. The app's `electron-builder.config.cjs` already declares `notarize: true` and references entitlements, but no workflow invokes `electron:dist:mac` and no Apple credentials reach electron-builder. Local `pnpm electron:dist:mac` runs attempt notarization unconditionally and fail without Apple creds.

There is also no mechanism for testers to obtain a versioned binary from a PR before merge. Changesets snapshot versioning (`pnpm changeset version --snapshot <tag>`) is unused.

## Approach

A single workflow (`ci-and-release.yml`) handles both flows. No new workflow file is added; the Electron-release jobs slot into the existing pipeline so the changesets state computed by the `release` job is visible without cross-workflow plumbing or a PAT-pushed tag trigger.

### Production release (push to main)

The existing `release` job is extended with one final step that diffs `apps/interviewer-v7/package.json` against `HEAD^` and emits two job outputs: `interviewer_v7_released` (`true`/`false`) and `interviewer_v7_version` (the new semver). When the "Version Packages" PR opened by changesets merges, the merge commit carries the bump and the outputs flip to `true`/`<version>`.

A matrix job `interviewer-v7-build` (`needs: release`, `if: needs.release.outputs.interviewer_v7_released == 'true'`) runs across `macos-latest`, `windows-latest`, `ubuntu-latest`. Each leg:

1. Checks out, sets up pnpm + Node from `.nvmrc`.
2. Runs `pnpm install --frozen-lockfile` (no `--ignore-scripts` — `electron-builder install-app-deps` must execute against the runner's Electron ABI to rebuild `better-sqlite3-multiple-ciphers`).
3. macOS leg only: base64-decodes `${{ secrets.APPLE_API_KEY }}` into `${RUNNER_TEMP}/AuthKey.p8` and exports `APPLE_API_KEY=<path>`. `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `CSC_LINK`, `CSC_KEY_PASSWORD` are forwarded straight from secrets.
4. Runs the matching `pnpm electron:dist:<mac|win|linux>` from `apps/interviewer-v7`. electron-builder runs with `--publish never`; no leg attempts to create a GitHub Release.
5. Uploads `apps/interviewer-v7/release-builds/*` as workflow artifacts keyed by platform (`interviewer-v7-macos`, `interviewer-v7-windows`, `interviewer-v7-linux`).

Windows leg ships unsigned (no `CSC_LINK` forwarded). SmartScreen warnings are acceptable for the initial rollout.

A final single-runner job `interviewer-v7-publish` (`needs: interviewer-v7-build`, `runs-on: ubuntu-latest`) downloads all three artifacts and creates a GitHub Release at tag `interviewer-v7@v${version}` via `softprops/action-gh-release`. The release is not marked pre-release. Tag namespacing (`interviewer-v7@v…` rather than bare `v…`) avoids collision with any future per-package tags changesets might mint.

### PR snapshot (pull_request with relevant changeset)

A new job `interviewer-v7-pr-snapshot` runs only when `github.event_name == 'pull_request'` and a quick shell guard finds the package in `.changeset/*.md`:

```sh
grep -l '@codaco/interviewer-v7' .changeset/*.md
```

The job invokes `pnpm changeset version --snapshot pr-${pr_number}-${short_sha}` to bump `package.json` versions in-tree (no commit), producing a version like `7.0.1-pr-42-abc1234.0`. It then runs the same three-platform matrix as the release path, with notarization still active on the macOS leg. Artifacts upload to the workflow run only — no GitHub Release is created. Retention: 14 days.

The snapshot bump touches every package referenced in any changeset on the PR; that is fine because only the interviewer-v7 build outputs are published.

### Local builds

`electron-builder.config.cjs`'s `notarize` field becomes `Boolean(process.env.APPLE_API_KEY)`. Local `pnpm electron:dist:mac` (no Apple env var) produces a signed-if-cert-present, un-notarized build that does not call notarytool. CI legs that set `APPLE_API_KEY` notarize as before.

### Caching

Each Electron-build leg restores `~/.cache/electron` and `~/.cache/electron-builder` via `actions/cache` keyed on `${{ runner.os }}-electron-${{ hashFiles('apps/interviewer-v7/package.json') }}` to avoid re-downloading the ~80 MB Electron runtime tarball on every run.

The shared `.turbo` cache used by the rest of `ci-and-release.yml` is irrelevant here — `pnpm electron:build` is `electron-vite build`, not a Turbo task.

## Secrets inventory

Repository-level secrets the workflow consumes:

- `APPLE_API_KEY` — base64-encoded `.p8` App Store Connect API key.
- `APPLE_API_KEY_ID` — App Store Connect key ID.
- `APPLE_API_ISSUER` — App Store Connect issuer ID.
- `CSC_LINK` — base64-encoded `.p12` Developer ID Application cert (macOS).
- `CSC_KEY_PASSWORD` — password for the `.p12`.

## Out of scope

- Auto-update wiring (`electron-updater`). Releases produce binaries; in-app update checks land later.
- Windows code-signing (EV cert / Azure Trusted Signing).
- Linux package signing or repository hosting (AppImage / deb shipped raw).
- Capacitor (iOS / Android) release automation.
