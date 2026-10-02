---
name: architect-classic-release-test
description: Build Architect Classic (apps/architect-classic, the schema 7 Electron app) locally and drive the packaged app through its core journeys to decide whether a release is ready. Use before merging or releasing an architect-classic version bump, or when asked to release-test, smoke-test or check the release readiness of Architect Classic. Not for the modern Architect web app (use architect-release-test). Keywords: architect classic release test, classic smoke test, packaged app, release readiness, 6.x.
---

# Architect Classic release test

## Overview

Architect Classic ships as a packaged Electron app built from this checkout, so
this test builds the release candidate exactly as the release job packages it
(unsigned), verifies the package, and then drives it with
`scripts/release-test/architect-classic-release-walker.mjs`: a deterministic
Playwright walker that launches the packaged binary in a throwaway profile,
stubs the native open/save dialogs, and checks each journey against the app's
output files rather than the screen alone. This skill is the procedure: build,
run, report.

Run it from the checkout of the release candidate — normally the release PR's
branch (the one that bumps `apps/architect-classic/package.json`), or `main`
for a health check. Requires macOS or Linux, `pnpm install` done, and network
access (the sample protocol downloads from GitHub). (Codex: the steps are plain
shell commands and run the same way.)

## Run

1. **Build** (3–5 minutes):

   ```bash
   node scripts/release-test/classic-release-build.mjs --app architect --platform desktop
   ```

   A build failure is a release blocker: report the failing command's output
   and stop.

2. **Verify the package** — the same resolution sweep and boot smoke the
   release job runs:

   ```bash
   node scripts/release/verify-packaged-app.mjs --app apps/architect-classic
   ```

3. **Walk the app** (about 10 minutes; run it in the background and wait for it —
   never predict its result). Use a fresh artifacts directory in your
   scratchpad:

   ```bash
   node scripts/release-test/architect-classic-release-walker.mjs --artifacts <dir>
   ```

   The expected version defaults to `apps/architect-classic/package.json`;
   pass `--expect-version` only to test a build of a different tree. Pass
   `--binary <path>` to walk a build that is not under `release-builds/`. The
   app's windows open on screen while it runs; tell the user so they do not
   interact with them.

## What the walker checks

| Check                                     | Guards against                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| App boots; start screen shows the version | launch crashes; shipping the wrong version                                                        |
| Download the sample protocol and open it  | the download path (6.6.2's "Buffer is not defined"); file written is a schema 7 protocol          |
| Stage preview renders the stage           | the embedded Interviewer preview window                                                           |
| Every stage editor in the sample opens    | editor crashes (6.6.2's "jsx is not defined" in Sociogram; two React copies crashing Information) |
| A new stage of every interface type opens | empty-state editor crashes                                                                        |
| The codebook lists the sample node types  | the codebook screen                                                                               |
| A stage edit saves to the protocol file   | editing and saving, read back from the saved `.netcanvas`                                         |
| Printable summary renders and saves a PDF | the summary window and PDF export                                                                 |
| A schema 6 protocol upgrades to a 7 copy  | protocol migration ("Create upgraded copy")                                                       |
| A schema 8 protocol is refused            | files from current Architect fail with an explanation, not a crash                                |
| Create a new protocol                     | the create flow and the file it writes                                                            |
| No uncaught renderer exceptions           | errors thrown in any window (main, preview, summary) during the run                               |

It does not cover code signing and notarization, Windows and Linux packages
(the release job builds those), auto-update, or OS-level input and window
chrome: interactions are synthesised DOM events.

## Report

Read `<artifacts>/result.json` (`steps`, `failures`, `notes`) and lead with the
verdict:

- **Ready** — the build, the package verification and the walker (exit 0) all
  passed. Relay any `known issue:` notes: they are uncaught exceptions that
  predate this release and leave the feature working (listed with reasons in
  the walker's `KNOWN_PAGE_ERRORS`), reported so they stay visible without
  failing every run.
- **Not ready** — any failed check. List each failure with its note and the
  `fail-*.png` screenshot under the artifacts directory. A failure the walker
  reports with "app reported: …" is the app's own error dialog — quote it.
- **Incomplete** — the walker exited 2 (watchdog: something hung) or 3 (setup:
  no build found, app would not launch). Fix the cause and rerun; do not give
  a verdict.

A failure is not automatically a regression. Classic releases are not tagged
in this repository: the previous release is the commit that bumped
`apps/architect-classic/package.json` to its version (`git log -S'"version":
"<previous>"' --format=%h -- apps/architect-classic/package.json` — the oldest
hit). To tell whether a failure already shipped, build that commit in a
separate worktree and walk it with `--binary`. Say which failures are new and
which shipped; the user decides what blocks the release.

## Changing the walker

Interactions and their selectors live in the walker; shared helpers (dialog
stubs, synthetic input, result recording) in
`scripts/release-test/classic-release-lib.mjs`, whose pure oracles have unit
tests in `classic-release-lib.test.mjs`. A new check must fail against a build
with the bug it guards before it lands — reintroduce the bug locally, build,
and walk.
