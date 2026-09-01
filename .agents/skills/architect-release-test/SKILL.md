---
name: architect-release-test
description: Run the agent-driven release smoke test of the deployed Architect dev site and interpret its verdict. Use when asked to release-test Architect, to gate an Architect release or a Version Packages merge, or to check that architect.networkcanvas.dev is safe to promote. Keywords: release test architect, smoke test architect, safe to promote, dev deployment check, promotable.
---

# Architect Release Test

## Overview

The saved workflow `.claude/workflows/architect-release-test.js` drives the
deployed Architect dev site (https://architect.networkcanvas.dev, which
tracks `main`) through a release-tester checklist using browser agents in
the in-app Browser pane, and returns a structured verdict. Release gates
consume the result's `promotable` field — true only for a full-coverage
pass with the expected version pinned and matched. This skill is the
command wrapper: parse the arguments, run the workflow, and report the
verdict.

This command requires Claude Code's Workflow runtime and Browser pane.
(Codex: you cannot run this workflow — say so and stop; the checklist
itself is readable in the workflow file if a person wants to perform a
manual pass.)

## Arguments

`/architect-release-test [--url <url>] [--slices <key,key>] [--expect-version <semver>] [--expect-commit <sha>] [--unpinned]`

| Argument           | Maps to args.…   | Default                                                 |
| ------------------ | ---------------- | ------------------------------------------------------- |
| `--url`            | `url`            | https://architect.networkcanvas.dev                     |
| `--slices`         | `slices` (array) | omitted — full run (a filtered run is never promotable) |
| `--expect-version` | `expectVersion`  | derived from `origin/main` — default URL only           |
| `--expect-commit`  | `expectCommit`   | derived from `origin/main` — default URL only           |
| `--unpinned`       | —                | skip both pins; the run cannot be promotable            |

Slice keys: `protocol-lifecycle`, `stages-and-timeline`,
`codebook-and-summary`, `stage-preview`. Reachability always runs.

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
turbo-cached build (`apps/architect/scripts/write-build-info.mjs`, run by
netlify.toml's build command and the production release job), so the
stamp identifies the deployment even when turbo restores the build from
cache. Deployments from before the stamp shipped do not expose the file;
a commit-pinned run fails its build-commit check against them by design
(the candidate is expected to expose it).

## Running it

Invoke the Workflow tool with
`{ name: 'architect-release-test', args: { url?, slices?, expectVersion?, expectCommit? } }`
(or `scriptPath: '.claude/workflows/architect-release-test.js'`). Notes:

- A full run takes roughly 25–35 minutes; slices run sequentially by
  design (the Browser-pane tabs share one origin profile and Architect
  stores protocols in IndexedDB). Never start two runs concurrently.
- The run is read-only for real data: agents only touch protocols they
  create with an `RT` name prefix and delete them afterwards.
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

Always report `deployedVersion` and `deployedCommit`, and, when relevant, the `notes` entries —
they carry harness observations and occasionally real app findings worth
spinning off.
