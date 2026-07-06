# CI: authoritative pre-merge check (merge queue) + parallelised, better-cached `quality`

**Date:** 2026-07-07
**Status:** Designed (not yet implemented)
**Base:** `main` (after the app-rename PR #821: `architect-web`→`architect`,
`interviewer-v8`→`interviewer`, legacy → `*-classic`); all paths, package names,
and turbo task keys below reflect the post-rename tree now on `main`.

## Correction (2026-07-07, during implementation)

**Workstream B3 (tune `turbo.json` `inputs` to eliminate version-bump cache
misses) was cut — it is impossible.** Turbo _always_ hashes each package's own
`package.json`, the root `turbo.json`, and the lockfile, regardless of a task's
`inputs` array (Turborepo docs: they are "always considered inputs, even if you
try to explicitly ignore them"; confirmed here by a hash test — removing
`package.json` from `@codaco/shared-consts`'s `build` inputs and bumping only its
version still changed the build hash). `changeset version` rewrites
`package.json`, so version-PR builds cache-miss inescapably. The "Verified facts"
row claiming per-task `inputs` tuning is effective was wrong (the lockfile-stability
check was correct but insufficient). What still helps: the **merge queue removes
the _duplicate_ version-PR build** (validated once in the queue, not again on
push), and fan-out + remote cache speed every run. The interview `__PACKAGE_VERSION__`
vitest stub (below) was kept as a standalone **test-hygiene** change only.

## Problem

The `quality` gate in `.github/workflows/ci-and-release.yml` runs more often than
it needs to, and each run is slower than it needs to be. Two distinct issues:

### 1. The gate re-runs redundantly on the release path

`quality` has **no `if:` guard** ([ci-and-release.yml:189](../../../.github/workflows/ci-and-release.yml)),
so it runs on every `pull_request` event **and** every `push` to `main`. Across a
single change's release lifecycle it therefore runs four times:

1. Feature PR — every commit (needed).
2. Feature PR merges → push to `main` — gates deploys; opens the bot version PRs.
3. The bot "Version Packages" / "Release apps" PR — `pull_request` events.
4. Version PR merges → push to `main` — gates the **irreversible npm publish**
   (`release` is `needs: quality`, `if: main && push`).

The naive reading is that run #4 is redundant with run #3. It is **not** — and
this is the pivotal finding. `main` has **no branch protection**: I checked, and
the only ruleset is Copilot review + deletion/non-fast-forward protection — **no
required status checks and no "require branches up to date"**. So another PR can
land between run #3 going green and the version PR merging, and `release`
publishes from `main`'s _actual_ merged state. Run #4 (quality on the exact
push-to-`main` commit) is the **only** thing that verifies what actually gets
published. It is load-bearing precisely _because_ the pre-merge check is not
authoritative.

The fix is therefore not "delete run #4" but "**make the pre-merge check
authoritative** so that run #4 becomes genuinely redundant and can be dropped."
That is what a merge queue provides.

### 2. `quality` is slow and under-cached

Measured from real CI logs (turbo prints a cache summary per run):

| Run                                   | Tasks cached | Misses | turbo time | job wall |
| ------------------------------------- | ------------ | ------ | ---------- | -------- |
| Normal push to `main` (`51ec17f8`)    | **31 / 42**  | 11     | 6m25s      | 7m21s    |
| "Version Packages" PR (`85480741929`) | **9 / 42**   | 33     | 9m58s      | 10m53s   |

The caching fundamentally works (31/42 on a normal push — the 11 misses are the
changed package plus its `^build` downstream, which is correct). Two real
problems remain:

- **Version bumps nuke the cache.** `changeset version` rewrites every released
  package's `version` in `package.json`, and `package.json` is an `inputs` entry
  for `build`, `test`, and `typecheck` in `turbo.json`. Result: ~33 misses on the
  slowest, most release-critical runs — almost all spurious, since a version
  string never changes compiled output or test results.
- **No task-level parallel fan-out.** Everything runs in one `quality` job on a
  4-core runner, so turbo parallelises only ~4-wide, and `lint`/`knip` — which
  need no build at all (they are `//#` root tasks) — are stuck interleaved behind
  the build cascade.

## Goals

1. Make the pre-merge check authoritative so the post-merge `quality` run on
   `main` can be removed without weakening the publish/deploy gate.
2. Never let a broken commit reach `main`.
3. Parallelise `quality` so independent checks (lint, knip, typecheck, test) run
   concurrently once packages are built.
4. Improve cross-run/cross-job cache reuse. (Note: eliminating version-_bump_
   misses is impossible — turbo always hashes `package.json`; see Correction.)

## Non-goals

- Re-plumbing the `detect` / `carry-forward-statuses` machinery for `merge_group`.
  The design deliberately keeps the conditional-job system `pull_request`-scoped
  by making **only `quality`** the queue-required check (see below).
- Sharing the CI cache with developers' laptops. That needs a true external
  remote cache (e.g. Cloudflare Workers+KV); it is called out as a future option,
  not built here.
- Making `chromatic-*` / `interview-e2e` / deploys into required or queue-gated
  checks. They stay exactly as today — `pull_request`-scoped and non-required.

## Verified facts the design depends on

Reproduced against the current repo, not assumed:

| Fact                                                        | How verified                                                                                                                                                        | Consequence                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` has **no** required status checks / up-to-date rule  | `gh api …/branches/main/protection` → 404; `…/rulesets/11687301` → only deletion, non-fast-forward, copilot review                                                  | Post-merge `quality` is currently the real publish gate; a merge queue is required to make the pre-merge check authoritative.                                                                                                                                                                                                                                                               |
| `changeset version` does **not** touch `pnpm-lock.yaml`     | `git show --name-only` on two release commits (`fa5517770` Version Packages, `413631228` version beta apps) → only `package.json` + `CHANGELOG.md` + `.changeset/*` | The lockfile stays stable across version bumps — but this does **not** make `inputs` tuning effective (turbo always hashes `package.json` itself; see Correction). Row retained for the record.                                                                                                                                                                                             |
| **Build-time** version embedding is limited to 3 workspaces | grep of vite/next configs                                                                                                                                           | `architect` (`__APP_VERSION__`, [vite.config.ts:62](../../../apps/architect/vite.config.ts)), `interviewer` renderer (`__APP_VERSION__`, [vite.renderer.config.ts:109](../../../apps/interviewer/vite.renderer.config.ts)), `@codaco/interview` (`__PACKAGE_VERSION__`, [vite.config.ts:113](../../../packages/interview/vite.config.ts)) must keep `package.json` in their `build` inputs. |
| **Test-time** version embedding is limited to 1 workspace   | grep of vitest configs                                                                                                                                              | Only `@codaco/interview` reads the real `pkg.version` under test ([vitest.config.ts:35](../../../packages/interview/vitest.config.ts)). `interviewer` already stubs `__APP_VERSION__` → `'0.0.0-test'` ([vitest.config.ts:33](../../../apps/interviewer/vitest.config.ts)). `typecheck` never evaluates `define`s.                                                                          |
| A GitHub-native turbo remote cache exists                   | web research                                                                                                                                                        | `rharkor/caching-for-turbo` runs a runner-local server implementing turbo's remote-cache protocol, backed by the GitHub Actions Cache. Successor to the unmaintained `dtinth/setup-github-actions-caching-for-turbo`.                                                                                                                                                                       |

## Design

Two independent-but-composing workstreams. They compose because the parallelised
`quality` ends in a single **aggregator** job whose check name (`quality`) is
exactly the one thing the merge queue requires.

### Workstream A — Authoritative pre-merge check via GitHub merge queue

**A1. `main` ruleset.** Update the default-branch ruleset to add:

- Require a pull request before merging (block direct pushes).
- **Require merge queue.**
- **Require status check: `quality`** (the aggregator job; evaluated on the
  queue's `merge_group` runs). Added _by name_ — GitHub will not list it until it
  has run under a queue once.
- **Do not allow bypassing** — so an admin cannot push an unvalidated commit that
  then auto-publishes.

Keep the existing rules (non-fast-forward, deletion protection, Copilot review).
This is what makes the pre-merge check authoritative: nothing reaches `main`
except through the queue, and the queue fast-forwards only after `quality` passes
on the exact commit (main + the PR, batched with any other queued PRs) that will
land.

**A2. Triggers + `quality` scoping.**

- Add `merge_group:` to `on:`.
- The `quality` aggregator and its sub-jobs run on `pull_request` (fast feedback)
  **and** `merge_group` (authoritative). In the end state they are **skipped on
  push** (`if: github.event_name != 'push'`) — this skip is the redundant run
  being deleted, and it lands in **PR 2** (see Rollout), _after_ the queue is
  live; until then they keep running on push.
- To keep queue entries minimal (only `quality`), guard `detect` with
  `if: github.event_name != 'merge_group'` and drop `needs: detect` from the
  quality sub-graph where it is only an ordering dependency (it does not consume
  detect's outputs). On `merge_group`, only the quality sub-graph runs; the
  conditional jobs self-skip because their `needs: detect` is unmet.

**A3. Trust the queue on push.** Because A1 guarantees every push to `main` came
through a green queue run, remove the push-time quality dependency from the six
push-to-`main` jobs:

- `release`, `apps-release-pr`, `apps-release-detect`, `legacy-release-detect` →
  remove `needs: quality` (keep their `if: push && main`).
- `deploy-docs-prod`, `deploy-website-prod` → drop `quality` from `needs` and the
  `needs.quality.result == 'success'` clause; keep `needs: detect`, the
  `detect.outputs.*` gate, and `push && main`.

**A4. Untouched.** `detect`, all preview deploys, `chromatic-fresco-ui`,
`chromatic-interview`, `interview-e2e`, and `carry-forward-statuses` remain
`pull_request`-scoped and non-required. Because `quality` is the _only_
queue-required check, none of the conditional-job / carry-forward machinery needs
a `merge_group` port — this is what keeps the change scoped.

Human workflow is unchanged apart from clicking **"Merge when ready"** (or
enabling auto-merge) instead of "Merge"; the bot release PRs are queued the same
way.

### Workstream B — Parallelised, better-cached `quality`

**B1. Fan-out into a job DAG with an aggregator.** Replace the single `quality`
job with:

- `lint` (`//#lint`), `knip` (`//#knip`), `check-changesets` (`pnpm
check:changesets`), `test-scripts` (`pnpm test:scripts`) — **no build
  dependency**, start at t=0 in parallel.
- `build` (`turbo run build`) → `test` and `typecheck`, each `needs: build` so
  they reuse its cache.
- **`quality` aggregator** — `needs: [lint, knip, check-changesets,
test-scripts, build, test, typecheck]`, succeeds iff all succeed (using
  `if: always()` + an explicit result check so a skipped/failed dependency fails
  the aggregate rather than silently passing). **This is the single required
  queue check**, and the single thing every push-time deploy/release job used to
  gate on.

Rationale: `lint`/`knip` leave the critical path entirely; `test` and `typecheck`
run on separate runners in parallel after `build` instead of sharing four cores
with it. Wall-clock ≈ `build + max(test, typecheck)` rather than
`build + (test + typecheck + lint + knip)/cores`.

**B2. GitHub-native turbo remote cache.** Replace the `actions/cache` of the
`.turbo` directory with **`rharkor/caching-for-turbo`** (pinned by commit SHA and
reviewed), in every job that runs turbo. It stands up a runner-local server
implementing turbo's remote-cache protocol, backed by the **GitHub Actions
Cache**, and exports `TURBO_API` / `TURBO_TOKEN` / `TURBO_TEAM`.

Why: per-task, hash-addressed cache entries (instead of one coarse `.turbo`
tarball saved at job end) let the fan-out `test`/`typecheck` jobs fetch exactly
the `build` outputs they need, by hash — race-free — and give exact per-task
cross-run reuse instead of a whole-tarball prefix fallback.

Trade-offs (accepted): still bound by the 10 GB repo Actions-Cache quota + LRU
eviction (but per-task entries evict granularly, so effective hit-rate improves);
no developer-laptop cache sharing (server is runner-local). Laptop sharing, if
ever wanted, needs a true external cache (e.g. `zwave-js/turborepo-cache` on
Cloudflare Workers+KV) — explicitly out of scope here.

**B3. ~~Eliminate version-churn cache misses (build-level)~~ — CUT.** See the
Correction at the top: turbo always hashes `package.json`, so `inputs` tuning
cannot prevent version-bump misses. The only surviving fragment is a test-hygiene
change: stub `@codaco/interview`'s `__PACKAGE_VERSION__` → `'0.0.0-test'` in its
`vitest.config.ts` (mirroring interviewer's existing pattern) so test behaviour is
deterministic across version bumps. No `turbo.json` changes.

## Isolation / boundaries

- **Workstream A** changes _when/whether_ `quality` runs and what gates on it; it
  does not change _what_ `quality` does.
- **Workstream B** changes _how_ `quality` is structured and cached; the
  aggregator preserves a single, stable `quality` check name so A's required-check
  wiring is unaffected by B's internal fan-out.
- The `detect` / carry-forward subsystem is a hard boundary: neither workstream
  changes its event model.

## Rollout (2 PRs + 1 settings change)

Ordered so there is never a hung queue or an unguarded window:

1. **PR 1 — Workstream B + inert `merge_group` trigger.** Land the fan-out +
   aggregator + remote cache + `inputs` tuning, and add the `merge_group:`
   trigger (inert until a queue exists). **Keep** push-time `quality` and the
   `needs: quality` gates for now. Independently verifiable: the aggregate check
   still gates everything exactly as before, just faster.
2. **Enable the ruleset (A1).** Require PR + merge queue + required `quality` (by
   name) + disallow bypass. I will prepare the exact `gh api` / ruleset JSON and
   **confirm before applying** (outward-facing governance change), or the change
   can be made in repo Settings.
3. **PR 2 — drop the redundancy (A2 skip-on-push + A3).** Skip `quality` on push
   and remove `needs: quality` from the six push-to-`main` jobs. Small, targeted.

**Escape hatch:** disable the merge-queue rule to revert to normal merges; after
PR 2, re-add push-time `quality` if the queue stays off for any length of time.

## Testing / verification

- **PR 1:** the aggregate `quality` check passes on the PR; sub-jobs show the
  expected fan-out; a second push touching one package shows exact-SHA cache hits
  on unchanged tasks; a synthetic version-only change (bump a package version in
  the PR) shows the shared packages' `build`/`test`/`typecheck` staying cached
  while the three version-embedding builds re-run.
- **Ruleset:** a throwaway PR must route through the queue; the `merge_group` run
  reports `quality`; merging fast-forwards `main`.
- **PR 2:** after merge, confirm a push to `main` runs **no** `quality` job and
  that `release` / prod-deploys still fire; confirm a version PR merge publishes
  without a push-time `quality` run.
- **Guard against regression of the core claim:** attempt to have `release` run
  when the queued commit's `quality` did not pass (e.g. temporarily break a test
  on a queued branch) — it must be blocked at the queue, never reaching `release`.

## Open questions / follow-ups

- If developer-laptop cache sharing becomes a goal, revisit an external remote
  cache (Cloudflare Workers+KV).
- Merge-queue batching (min/max group size, "only merge non-failing") tuning can
  be revisited once real queue throughput is observed; start with GitHub
  defaults.
