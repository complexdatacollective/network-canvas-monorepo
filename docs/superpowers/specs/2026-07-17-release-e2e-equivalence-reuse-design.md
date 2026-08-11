# Release E2E equivalence reuse

**Date:** 2026-07-17
**Status:** Partially superseded on 2026-08-03 and 2026-08-11

> Architect and Interviewer now share the normal `changeset-release/main` lane
> with libraries, so cross-branch reuse between a separate apps lane and the
> library lane is no longer needed. See
> `2026-08-03-stable-app-release-design.md` for the current topology.

> **2026-08-11 update:** PR `quality` verdicts are now authoritative for the
> merge queue. Full CI and E2E run on pull requests targeting `main`, including
> generated release PRs; `merge_group` reports only a lightweight `quality`
> acknowledgement and never runs E2E. The PR-time equivalence primitive below
> remains current for refreshed release branches. The queue-time motivation,
> alternatives, and design sections are retained as historical context.

## Problem

Every push to `main` rebuilds every open generated release branch. The
`product-release-pr` job runs on all main pushes and recreates each
`changeset-release/<slug>` branch on the new main tip via
`peter-evans/create-pull-request`; `changesets/action` does the same for the
library branch `changeset-release/main`. Even when a lane's release content
(version bump + changelog) is byte-for-byte identical, the parent commit
changed, so the branch is force-pushed. Each force-push fires a fresh
`pull_request` run, and because the ref matches `changeset-release/*`, the
release-only E2E suites re-run — 13–40 minutes across several runners, times
two or three suites per lane, times every open release PR, on **every** merge
to main (the open Release Interviewer PR was force-pushed eight times in one
day). Merging one product's release PR resetting all sibling release PRs is
the most visible instance, but any merge triggers it.

The refresh itself cannot simply be skipped:

- The merge-queue fast path in `scripts/release-e2e-policy.mjs`
  (`alreadyValidatedSuites`) only skips queue-time E2E when the queue's merge
  commit tree is **byte-identical** to a branch tip that passed a native
  `pull_request` run. Stale branches would push the full E2E cost into the
  merge queue on every release merge.
- Release PRs are meant to validate the release against the main they will
  actually deploy with.
- The visual-snapshot auto-regeneration flow triggers off release-PR E2E
  failures, so PR-time E2E must keep running whenever a change could alter
  suite outcomes.
- `changesets/action` force-pushes its branch unconditionally; suppressing
  that would mean forking the action.

## Rejected alternatives

- **Skip no-op branch refreshes** (don't push when version + changelog are
  unchanged): cannot cover the `changesets/action` library lane — the most
  expensive one, gated by all three suites — and leaves branches stale, so
  every release merge pays full E2E in the merge queue and the snapshot
  auto-regen flow stops firing for main-side regressions.
- **Merge-queue-only E2E**: failures surface at merge time, every release
  merge waits out the suites in the queue, and the snapshot auto-regen flow
  breaks entirely.

## Design

The decision lives in the `e2e-policy` job /
`scripts/release-e2e-policy.mjs`: a suite whose outcome provably cannot have
changed since a trusted successful run on any generated release branch is
skipped, and the `quality` aggregate accepts that through the existing "policy
says not required" path. Ordinary PRs are unaffected — they still never inherit
an E2E verdict.

### The equivalence primitive

Suite **S** may be skipped for candidate head **H** when ALL of the following
hold. Every failure mode — API error, unfetchable commit, unrecognised path,
pagination cap — means "run the suite".

1. **Trusted context.** The run is for a generated `changeset-release/*`
   branch and, on `pull_request` events, the head repository is this
   repository (fork PRs never get reuse).
2. **A prior conclusive native run exists.** For every generated release branch
   capable of running S, walk its `pull_request` runs of `ci-and-release.yml`
   (Actions API, newest first, bounded) and take that branch's **newest run whose
   job for S has a conclusive verdict** (`success`/`failure`/`timed_out`; skipped
   and cancelled runs are walked past). Never walk past a same-branch failure to
   an older green. After guard 3 removes verdicts whose code is not equivalent
   to H, the newest remaining verdict across all release branches is
   authoritative. Only `success` qualifies; a newer equivalent failure cannot
   be hidden by an older success from another lane.
3. **The delta cannot affect S.** `git diff --no-renames --name-only X H`
   (fetching X by SHA; force-pushed commits remain fetchable) contains only
   paths that are either
   - inside a workspace package directory that is **not** in S's relevance
     closure — the subject package plus its transitive workspace
     `dependencies`, `devDependencies`, `peerDependencies`, **and**
     `optionalDependencies` (dev edges carry Playwright configs and e2e
     helpers; this repo also declares some workspace edges — e.g. the
     styling/theme packages an e2e host renders with — as peerDependencies
     rather than dependencies or devDependencies, so peer edges must be
     walked too) — or
   - in the inert set the `test` job already uses: `docs/`, `.changeset/`,
     `*.md`.

   Anything else is relevant and forces a run: root configs, `.github/`,
   `scripts/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`,
   `.nvmrc`, and any path not positively recognised. `--no-renames` matters
   here: with rename detection on, `git diff --name-only` reports only a
   renamed file's destination path, so a relevant file moved to an inert path
   would otherwise vanish from the diff instead of surfacing its source path.

4. **Correction (2026-07-17): no separate baseline guard.** An earlier draft
   required `e2e-snapshots/main` not to have moved since run X. That branch
   is only the accumulation target for the snapshot-update PR flow; the
   suites read visual baselines committed in-tree, inside their subject
   packages' own directories. Baseline movement is therefore already covered
   by guard 3's diff, and no branch-time guard exists.

### PR time (the fix)

On a `pull_request` run for a release ref, `e2e-policy` applies the primitive
to each lane-required suite with H = the PR tip, before requiring it. This
allows the combined app lane and the separate library lane to reuse the same
suite result when their suite relevance closures are identical, while a merge
touching `packages/interview` remains relevant and forces fresh validation.

PR-time comparison uses branch tips rather than the synthetic merge commits
of the two runs; because release branches are regenerated on top of current
main, tip and merge trees coincide at refresh time, and any drift from main
moving mid-window is caught by the queue-time check below.

### Merge-queue time

The byte-identical fast path becomes the trivial case of the same primitive:
H = the queue's merge commit, with the existing guard that the merge commit's
second parent is the current tip of a generated release branch. X = the
newest conclusive native success on that branch (no longer required to be the
current tip — after a PR-time skip, the tip has no native run of its own, so
without this generalisation every skip would be repaid with a full queue-time
re-run). An empty diff reproduces today's behaviour; a batched group whose
extra changes are irrelevant to S now also skips; anything relevant runs.

### What does not change

- `changesets/action` and library branch generation.
- The graph-derived guard around the lane → suites table
  (`SUITES_BY_RELEASE_REF`).
- The `quality` aggregate contract and required-check configuration.
- Ordinary (non-release) PRs: E2E verdicts are still never carried forward.
- The snapshot auto-regen and snapshot-update-PR flows.

## Testing

Extend `scripts/release-e2e-policy.test.mjs`:

- Relevance closures derived from the real package.json workspace graph (the
  existing anti-drift pattern), including dev-dependency and
  peer-dependency edges.
- Skip: diff confined to a non-subject package dir; diff confined to the
  inert set; empty diff (byte-identical queue case).
- Run (fail closed): subject-graph path; any root/`.github/`/`scripts/`/
  lockfile/workspace-config path; unfetchable X; Actions API error or
  pagination cap; newest conclusive verdict is a failure; fork head repo;
  non-release ref.
- Chained refreshes: skipped-suite runs are walked past to the older native
  success and the diff is taken from there.

`scripts/ci-workflow.test.mjs` asserts the workflow wiring (envs passed to
the policy step for head SHA / head repo, fetch strategy) where practical.

## Documentation

- CLAUDE.md "Release-only E2E checks": replace "E2E verdicts are never
  carried forward from an earlier commit" with the refined rule — never on
  ordinary PRs; on generated release branches a suite may be skipped when the
  current tree is provably equivalent for that suite per the primitive above,
  failing closed.
- Header comments in `release-e2e-policy.mjs` describing the primitive and
  its guards.
