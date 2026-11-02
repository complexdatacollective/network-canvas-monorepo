---
name: architect-release-test
description: Run the agent-driven release smoke test of the deployed Architect dev site and interpret its verdict. Use when asked to release-test Architect, to gate an Architect release or a Version Packages merge, or to check that architect.networkcanvas.dev is safe to promote. Keywords: release test architect, smoke test architect, safe to promote, dev deployment check, promotable.
---

# Architect Release Test

## Overview

The saved workflow `.claude/workflows/architect-release-test.js` drives the
deployed Architect dev site (https://architect.networkcanvas.dev, which
tracks `main`) through a release-tester checklist using browser agents in
the in-app Browser pane and, for checks that need tabs the app opens or a
file chooser, a Playwright browser, where agents also rebuild the entire
sample protocol through Architect's own UI, and returns a structured
verdict. Release gates
consume the result's `promotable` field — true only for a full-coverage
pass with the expected version pinned and matched. This skill is the
command wrapper: parse the arguments, run the workflow, and report the
verdict.

This command requires Claude Code's Workflow runtime, the Browser pane, and
the Playwright MCP plugin (`mcp__plugin_playwright_playwright__*`).
(Codex: you cannot run this workflow — say so and stop; the checklist
itself is readable in the workflow file if a person wants to perform a
manual pass.)

## Arguments

`/architect-release-test [--url <url>] [--slices <key,key>] [--expect-version <semver>] [--expect-commit <sha>] [--sample-ref <ref>] [--unpinned]`

| Argument           | Maps to args.…   | Default                                                 |
| ------------------ | ---------------- | ------------------------------------------------------- |
| `--url`            | `url`            | https://architect.networkcanvas.dev                     |
| `--slices`         | `slices` (array) | omitted — full run (a filtered run is never promotable) |
| `--expect-version` | `expectVersion`  | derived from `origin/main` — default URL only           |
| `--expect-commit`  | `expectCommit`   | derived from `origin/main` — default URL only           |
| `--sample-ref`     | `sampleRef`      | `expectCommit`, else `origin/main`                      |
| `--unpinned`       | —                | skip both pins; the run cannot be promotable            |

Slice keys: `protocol-lifecycle`, `stages-and-timeline`,
`codebook-and-summary`, `stage-preview`, `localization`,
`language-management`, `send-to-interviewer`, `dynamic-values`,
`finish-stages`, `bins-and-encryption`, `templates-and-upgrade`,
`legacy-editors`, `sample-protocol-build`. Reachability always runs.

**Two browsers.** Most slices run in the Browser pane, one at a time. The
pane refuses the tabs the app opens itself and cannot answer a file chooser,
so the slices that need either run in the Playwright browser instead:
`stage-preview`, `language-management`, `send-to-interviewer`,
`dynamic-values` and `legacy-editors`, followed there by the sample build.
The two lanes run side by side. In Playwright a preview must render: a
refused popup is a failure, not a pass.

**The schema 9 slices** author what schema 9 added:

- `localization` (pane) — adds a second language on the Languages page,
  translates a text in the translation table, sees the "Participants can’t
  choose a language" note, and clears it by adding a Language Chooser stage.
- `language-management` (Playwright) — adds French and Polish together:
  French arrives fully translated with Network Canvas's own wording (the
  finish stage's name, closing and finished text, its buttons), Polish, which
  Network Canvas is not written in, arrives untranslated. Then the "Not
  everything is translated yet" note and its link, writing and editing a
  translation, making Polish the default (its Remove control refused, the
  "This protocol can’t be downloaded yet" warning and refused download while
  the finish stage has no Polish text), removing Polish, and previewing the
  finish stage in French with the preview's language select.
- `dynamic-values` (Playwright) — creates an ego attribute, inserts it and
  "Today’s date" into an Information stage through the insert ("piped text")
  menu, checks the menu's groups, the "If known" / "If not known" versions and
  the folded pill, that they persist, and that the preview shows the filled-in
  text.
- `finish-stages` (pane) — the finish stage every protocol starts with, its
  confirmation and automatic modes, a second finish stage, the reorder rule
  (finish stages swap among themselves, never rise above another stage) and
  the refusal to delete the last one.
- `bins-and-encryption` (pane) — a Categorical Bin with tap to place and the
  completion gate, and an Anonymisation stage that encrypts a text attribute
  with no experiment to enable, its explanation led by a Heading 1.
- `templates-and-upgrade` (pane) — opens the CEGRM template (Family Pedigree,
  Narrative Pedigree, two finish stages), edits its pedigree, confirms no form
  or census editor offers an introduction panel, and opens a schema 8
  protocol, which must arrive upgraded (its introduction panel an Information
  stage, a finish stage added). The pane has no file chooser, so the agent
  hands the start screen's file input a small schema 8 `.netcanvas` built by a
  script the workflow writes (`legacyUpgradeScript`), as Fresco's release test
  does for uploads.

**The other Playwright slices:**

- `stage-preview` — previews a stage of the Sample Protocol template with
  "Start preview with example data" on (made-up people fill the name
  generator) and off (it starts empty), and checks the bare `/preview/`
  route.
- `send-to-interviewer` — sends a protocol to the Interviewer this
  deployment pairs with (production with production, every other deployment
  with interviewer.networkcanvas.dev), checks Interviewer imports it, then
  deletes it there.
- `legacy-editors` — keeps older-schema protocols unchanged in their own
  editors. A planning agent reads `apps/architect/legacy-architect.json` and
  the current schema at `sampleRef`; for each bundled editor (`v8` today) it
  packs the sample protocol of the Architect release that editor bundles,
  which is a protocol of that schema. An agent opens it with "Keep editing as
  schema N", checks it lands unchanged in the editor at `/vN/` whose
  `build-info.json` commit is that release's, finds it in this app's library
  with a "Schema N" badge, and reopens it there. Every schema from 8 up to
  the one before the current schema must have an editor, so when Architect
  writes schema 10 and bundles Architect 9 the slice covers schema 8 and 9
  with no change here, and a missing editor blocks the run. Architect offers
  no Delete for those protocols, so they stay in the Playwright profile.

The interview's own E2E suites cover how these features render in a real
interview; this test checks what a researcher sees in Architect and its
preview.

**The sample-protocol build** is the core end-user check. An analyst agent
reads `packages/protocols/sample` at `sampleRef` (the commit the deployment
builds, so the specification matches the app under test) and writes a
stage-by-stage build plan. Sonnet builder agents then recreate every stage,
codebook entry and resource by driving Architect's UI the way a person
would: they upload the assets through the file chooser and learn the UI
from the screens and the end-user docs, not the app source. They create the
protocol in the specification's languages and build its first finish stage
by editing the one every new protocol starts with. An Opus auditor
downloads the result as a user would, validates it, and compares it with the
canonical protocol, attributing each difference to the app, to a driver
slip, or to data no user sets. It also runs `scripts/check-built-protocol.mjs`
on the export, which checks the generated fields the comparison cannot see
(each asset's export entry and that its extension truly describes its
content, entity colours, form-field ids, the
modification stamp); builders leave colours to the app, and any invariant
problem fails or blocks the slice. One repair pass retries what the drivers got wrong
before the final audit. Fidelity passes only when that final audit
accounts for every planned stage exactly once and explains every divergence.
App defects, and failed exports or validation, from either audit round
become failed checks, which an independent verifier reproduces before they
can fail the release. A
`--sample-ref` other than the pinned `--expect-commit` makes the run
non-promotable: the build then checks the deployment against a different
specification. Agents use the ref in shell commands, so the workflow
refuses one containing anything but letters, digits, `.`, `_`, `/` and `-`.

The build cannot run on Linux arm64 (for example the `dev-vm/` Lima VM):
Playwright's Chromium there crashes on the sample's video resources, so the
slice reports `blocked` straight after analysis. Run the release test from
the macOS host or an x86-64 machine.

**Deriving the default pins (default URL only).** The dev deployment
builds `main`, so unless the user supplied the flags or `--unpinned`, pin
what main actually carries:

```bash
git fetch origin main --quiet && git show origin/main:apps/architect/package.json | jq -r .version && git rev-parse origin/main
```

Pass those as `expectVersion` and `expectCommit`. Do not silently run
unpinned: `promotable` requires both pins, and an unpinned green run is
not promotion evidence.

**Custom `--url` targets never inherit the `origin/main` defaults** — a
branch, hotfix, or local deployment legitimately carries a different
version and commit, and comparing it against main would report a healthy
deployment as a mismatch. For a custom URL, require explicit
`--expect-version`/`--expect-commit` (from whatever ref that deployment
builds) or an explicit `--unpinned`; if none were given, ask rather than
guessing.

Each deployment stamps its commit into `/build-info.json` after the
turbo-cached build (`scripts/release/write-build-info.mjs`, run by
netlify.toml's build command and the production release job), so the
stamp identifies the deployment even when turbo restores the build from
cache. Deployments from before the stamp shipped do not expose the file;
a commit-pinned run fails its build-commit check against them by design
(the candidate is expected to expose it).

## Running it

Invoke the Workflow tool with
`{ name: 'architect-release-test', args: { url?, slices?, expectVersion?, expectCommit?, sampleRef? } }`
(or `scriptPath: '.claude/workflows/architect-release-test.js'`). Notes:

- A full run takes as long as the Playwright lane — expect a couple of
  hours. The Browser-pane slices run sequentially by design (the pane's
  tabs share one origin profile and Architect stores protocols in
  IndexedDB) while the Playwright slices, the older-schema editors and then
  the build run one at a time alongside them in the Playwright browser.
  Never start two runs concurrently.
- The run is read-only for real data. Every protocol it creates is named by
  the workflow under one run tag (`RT <slice> <tag>`, `RT sample <tag>`,
  `RT verify <tag> <n>`, logged at the start), and a separate clean-up agent
  deletes it by that name whenever the agent that made it may not have, so
  a crashed agent cannot strand test data. That includes the copy
  `send-to-interviewer` sends to Interviewer. Anything a clean-up agent could
  not confirm deleted is listed in `notes` under `cleanup`. The exception is
  `RT legacy <tag> schema N`: Architect cannot delete an older-schema
  protocol, so it stays in the Playwright profile.
- The build's files (extracted specification, renamed uploads, exported
  `.netcanvas`) stay under the git-ignored `.playwright-mcp/architect-sample-*`
  directory named in `sampleBuild.workDir`, and the older-schema protocol
  files under `.playwright-mcp/architect-legacy-*`, for inspection; delete
  them when done. Playwright can only upload from inside the repository, which is why
  it lives there.
- Commit-pinned runs re-fetch `/build-info.json` after all other phases: a
  deployment that changed mid-run holds the verdict at `blocked`, because
  the collected evidence may describe a build that is no longer live.
- If reachability fails the version check right after a push to `main`,
  the Netlify branch deploy may simply not have finished — check the
  architect-dev deploy status before treating it as breakage.

## Interpreting the result

Lead with `promotable`, then the verdict:

- **`promotable: true`** — every check passed, full coverage, version and
  build commit pinned and matched: report that the release is safe to
  promote.
- **`verdict: 'fail'`** — confirmed breakage: the release must not be
  promoted. Report each entry in `confirmedFailures` with its evidence.
- **`verdict: 'blocked'`** — no confirmed breakage, but items in
  `blocked`, `unverifiedFailures`, or `flaky` need manual review before
  promoting. List them with their details.
- **`verdict: 'pass'` with `promotable: false`** — a green partial or
  unpinned run: useful signal, not promotion evidence. The `meaning`
  string names the gap; relay it and, if the user is gating a release,
  offer the full pinned re-run.

Always report `deployedVersion` and `deployedCommit`, the `sampleBuild`
stage table (how many stages matched the specification), and, when
relevant, the `notes` entries —
they carry harness observations and occasionally real app findings worth
spinning off.
