# CI: authoritative merge-queue check + parallelised, better-cached `quality` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pre-merge check authoritative via a GitHub merge queue so the redundant post-merge `quality` run can be dropped, and parallelise + better-cache `quality` so it runs faster with far fewer spurious version-bump cache misses.

**Architecture:** Two composing workstreams delivered over four PRs plus one repo-settings change. (1) Cache/perf: tune `turbo.json` `inputs` to kill version-churn misses, introduce a GitHub-Actions-Cache-backed Turborepo remote cache, and fan `quality` out into parallel jobs behind a single aggregator whose check name stays `quality`. (2) Authority: add a merge queue that requires the `quality` aggregator on `merge_group`, then stop running/gating on `quality` at push time — the release/deploy jobs trust the queue.

**Tech Stack:** GitHub Actions, Turborepo `^2.9.16`, pnpm workspaces, `rharkor/caching-for-turbo` (remote cache), `actionlint` (workflow lint), Vitest, GitHub repository rulesets.

**Spec:** [docs/superpowers/specs/2026-07-07-ci-authoritative-merge-queue-and-quality-fanout-design.md](../specs/2026-07-07-ci-authoritative-merge-queue-and-quality-fanout-design.md)

## Global Constraints

- **The aggregator job MUST be named `quality`.** Every downstream `needs: quality` / `needs.quality.result` reference and the ruleset's required-check _context_ depend on that exact name. Never rename it.
- **Rollout order is a hard dependency chain:** PR 1 (input tuning) → PR 2 (remote cache) → PR 3 (fan-out + inert `merge_group` trigger) → **enable ruleset** → PR 4 (drop push-time `quality`). **Never land PR 4 before the merge queue is live** — doing so publishes from an unverified `main`.
- **Pin every third-party action by commit SHA** with a trailing `# vX.Y.Z` comment. Remote cache action: `rharkor/caching-for-turbo@75f8ebf4a43d2c60b23bc2a27082cfea94ffdad9 # v2.5.0`. Reuse the existing pinned SHAs for `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` already in the workflow.
- **Three builds embed their own version and MUST keep `package.json` in their `build` `inputs`:** `@codaco/architect` (override already present), `@codaco/interview` (add override), `@codaco/interviewer` (add override). Every other workspace must NOT hash `package.json` for `build`/`test`/`typecheck`.
- **Do not re-plumb `detect` / `carry-forward-statuses` for `merge_group`.** Only `quality` runs in the queue; all conditional jobs (chromatic, e2e, deploys) stay `pull_request`-scoped and non-required.
- **Node** from `.nvmrc`; **pnpm** via `pnpm/action-setup`. Never `any`, never barrel files.
- **Branching:** never commit to `main`; one feature branch per PR. Until the app-rename branch `claude/elated-williamson-c76d6e` merges, **base each PR on it** (this plan's paths/names are post-rename); retarget to `main` once it lands. `oxfmt` runs in the pre-commit hook and will reformat JSON/MD/YAML — expect it.

---

## File Structure

- `turbo.json` — task `inputs` tuning; two new `#build` overrides. (PR 1)
- `packages/interview/vitest.config.ts` — stub `__PACKAGE_VERSION__` under test. (PR 1)
- `.github/actions/turbo-ci-setup/action.yml` — **new** composite action: pnpm + Node + install + remote cache. Single source of truth for turbo-job setup. (PR 2)
- `.github/workflows/ci-and-release.yml` — convert all turbo jobs to the composite (PR 2); fan `quality` out + add `merge_group` trigger + guard `detect` (PR 3); drop push-time `quality` + de-gate the six release/deploy jobs (PR 4).
- Repo ruleset on `main` (via Settings UI or `gh api`) — merge queue + required `quality` + disallow bypass. (between PR 3 and PR 4)

---

# PR 1 — Kill version-churn cache misses (turbo inputs)

Small, isolated, immediately valuable with the _existing_ cache. No workflow structure change.

## Task 1.1: Stub `__PACKAGE_VERSION__` under Vitest in `@codaco/interview`

**Files:**

- Modify: `packages/interview/vitest.config.ts`
- (Reference only) `packages/interview/src/types/build-globals.d.ts` (ambient decl), `packages/interview/src/analytics/superProperties.ts` (sole consumer)

**Interfaces:**

- Produces: interview tests no longer depend on the real `pkg.version`, making it safe for Task 1.2 to drop `package.json` from the root `test` `inputs`.

- [ ] **Step 1: Confirm no test asserts the real version**

Run:

```bash
grep -rn "__PACKAGE_VERSION__\|PACKAGE_VERSION" packages/interview --include="*.test.ts" --include="*.test.tsx"
```

Expected: no output (no test asserts it). If this prints anything, STOP and reconsider — a test pins the real version and stubbing will break it.

- [ ] **Step 2: Read the current define and its `pkg` import**

Run:

```bash
grep -n "pkg\|__PACKAGE_VERSION__" packages/interview/vitest.config.ts
```

Note whether `pkg` is used anywhere other than the `__PACKAGE_VERSION__` define (line ~9 import, line ~35 define).

- [ ] **Step 3: Replace the real version with a constant stub**

In `packages/interview/vitest.config.ts`, change the define from:

```ts
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
```

to:

```ts
    // Tests must not depend on the real package version, or a `changeset version`
    // bump would invalidate this package's `test` cache on every release.
    __PACKAGE_VERSION__: JSON.stringify('0.0.0-test'),
```

Then, **if `pkg` is now unused** in this file, delete its import line:

```ts
import pkg from './package.json' with { type: 'json' };
```

(Leave it if it is still referenced elsewhere in the file.)

- [ ] **Step 4: Run the interview unit tests**

Run:

```bash
pnpm --filter @codaco/interview test -- --run
```

Expected: PASS (the stub compiles and no assertion depends on the real version).

- [ ] **Step 5: Commit**

```bash
git add packages/interview/vitest.config.ts
git commit -m "test(interview): stub __PACKAGE_VERSION__ under vitest to decouple tests from release version"
```

## Task 1.2: Tune `turbo.json` `inputs` so version bumps stop invalidating caches

**Files:**

- Modify: `turbo.json`

**Interfaces:**

- Consumes: Task 1.1 (interview tests are version-insensitive).
- Produces: `build`/`test`/`typecheck` no longer hash `package.json` except for the three version-embedding builds.

- [ ] **Step 1: Duplicate the current root `build` task as the two version-embedding overrides**

The root `build` task currently is:

```json
    "build": {
      "dependsOn": ["^build"],
      "inputs": [
        "src/**",
        "tsconfig*.json",
        "vite.config.*",
        "electron.vite.config.*",
        "next.config.*",
        "package.json"
      ],
      "env": ["NODE_ENV"],
      "outputs": ["dist/**", "out/**", ".next/**", "!.next/cache/**"]
    },
```

Add two overrides that are **verbatim copies of the current root build (still including `package.json`)**, keyed for the two apps that use the root build task and embed their version:

```json
    "@codaco/interview#build": {
      "dependsOn": ["^build"],
      "inputs": [
        "src/**",
        "tsconfig*.json",
        "vite.config.*",
        "electron.vite.config.*",
        "next.config.*",
        "package.json"
      ],
      "env": ["NODE_ENV"],
      "outputs": ["dist/**", "out/**", ".next/**", "!.next/cache/**"]
    },
    "@codaco/interviewer#build": {
      "dependsOn": ["^build"],
      "inputs": [
        "src/**",
        "tsconfig*.json",
        "vite.config.*",
        "electron.vite.config.*",
        "next.config.*",
        "package.json"
      ],
      "env": ["NODE_ENV"],
      "outputs": ["dist/**", "out/**", ".next/**", "!.next/cache/**"]
    },
```

(`@codaco/architect#build` already has its own override that keeps `package.json` — leave it as-is.)

- [ ] **Step 2: Remove `package.json` from the root `build` inputs**

Edit the root `build` task's `inputs` to drop the `"package.json"` line:

```json
    "build": {
      "dependsOn": ["^build"],
      "inputs": [
        "src/**",
        "tsconfig*.json",
        "vite.config.*",
        "electron.vite.config.*",
        "next.config.*"
      ],
      "env": ["NODE_ENV"],
      "outputs": ["dist/**", "out/**", ".next/**", "!.next/cache/**"]
    },
```

- [ ] **Step 3: Remove `package.json` from `test` and `typecheck` inputs**

Drop the `"package.json"` line from the root `test` task `inputs` and the root `typecheck` task `inputs`. Also drop it from the two per-app typecheck overrides `@codaco/documentation#typecheck` and `networkcanvas.com#typecheck`. (Do NOT touch `.env` in `test` inputs.)

- [ ] **Step 4: Validate JSON + confirm the hash behaviour with a dry run**

Run:

```bash
python3 -c "import json; json.load(open('turbo.json'))" && echo "turbo.json valid"
# A shared package's build must NOT list package.json:
pnpm exec turbo run build --filter=@codaco/shared-consts --dry=json \
  | jq -r '.tasks[] | select(.task=="build") | .inputs | keys[]' | grep -c 'package.json'
```

Expected: prints `turbo.json valid`, then `0` (shared-consts build no longer hashes `package.json`).

- [ ] **Step 5: Confirm the version-embedding builds still hash package.json**

Run:

```bash
pnpm exec turbo run build --filter=@codaco/interview --dry=json \
  | jq -r '.tasks[] | select(.task=="build" and (.package|test("interview$"))) | .inputs | keys[]' | grep -c 'package.json'
```

Expected: `1` (interview build still hashes `package.json`). Repeat with `--filter=@codaco/interviewer` and `--filter=@codaco/architect`; each must print `1`.

- [ ] **Step 6: Commit**

```bash
git add turbo.json
git commit -m "build(turbo): stop hashing package.json for build/test/typecheck except version-embedding apps"
```

- [ ] **Step 7: Open PR 1**

```bash
git push -u origin HEAD
gh pr create --base claude/elated-williamson-c76d6e --title "ci: stop version bumps from invalidating turbo caches" \
  --body "Stubs interview's test-time version define and drops package.json from build/test/typecheck inputs (keeping it only for the three version-embedding builds). Cuts spurious cache misses on release/version-bump runs. See spec + plan under docs/superpowers."
```

Wait for CI to pass before merging.

---

# PR 2 — GitHub-native Turborepo remote cache

Introduce a composite setup action and convert **every** turbo job to it, replacing the coarse `actions/cache` of `.turbo` with per-task, hash-addressed caching over the GitHub Actions Cache. No structural change to `quality` yet.

## Task 2.1: Create the `turbo-ci-setup` composite action

**Files:**

- Create: `.github/actions/turbo-ci-setup/action.yml`

**Interfaces:**

- Produces: a composite action at `./.github/actions/turbo-ci-setup` that, given a prior `actions/checkout`, sets up pnpm + Node, installs deps, and configures the Turborepo remote cache (exports `TURBO_API`/`TURBO_TOKEN`/`TURBO_TEAM`). Consumed by every turbo job in Tasks 2.2–2.3 and 3.x.

- [ ] **Step 1: Write the composite action**

Create `.github/actions/turbo-ci-setup/action.yml`:

```yaml
name: Turbo CI setup
description: pnpm + Node + install + Turborepo remote cache (GitHub Actions Cache backend).
runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6.0.9
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
      with:
        node-version-file: .nvmrc
        cache: pnpm
    - run: pnpm install --frozen-lockfile --ignore-scripts
      shell: bash
    # Runner-local server implementing turbo's remote-cache protocol, backed by
    # the GitHub Actions Cache. Per-task, hash-addressed entries so fan-out jobs
    # share build outputs without the whole-.turbo-tarball race.
    - uses: rharkor/caching-for-turbo@75f8ebf4a43d2c60b23bc2a27082cfea94ffdad9 # v2.5.0
```

- [ ] **Step 2: Validate the action YAML**

Run:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/actions/turbo-ci-setup/action.yml')); print('action.yml valid')"
```

Expected: `action.yml valid`.

- [ ] **Step 3: Commit**

```bash
git add .github/actions/turbo-ci-setup/action.yml
git commit -m "ci: add turbo-ci-setup composite action (pnpm+node+install+remote cache)"
```

## Task 2.2: Convert the `quality` job to the composite + remote cache

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (the `quality` job, ~lines 189–229)

**Interfaces:**

- Consumes: `./.github/actions/turbo-ci-setup` (Task 2.1).

- [ ] **Step 1: Replace the setup + `.turbo` cache steps with the composite**

In the `quality` job, replace these steps:

```yaml
- uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
- uses: pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271 # v6.0.9
- uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
  with:
    node-version-file: '.nvmrc'
    cache: 'pnpm'
- run: pnpm install --frozen-lockfile --ignore-scripts
- uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
  with:
    path: .turbo
    key: ${{ runner.os }}-turbo-${{ github.sha }}
    restore-keys: ${{ runner.os }}-turbo-
```

with:

```yaml
- uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
- uses: ./.github/actions/turbo-ci-setup
```

Leave the `.env` write step and the `turbo run …` / `check:changesets` / `test:scripts` steps unchanged.

- [ ] **Step 2: Lint the workflow**

Run:

```bash
actionlint .github/workflows/ci-and-release.yml
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci(quality): use turbo-ci-setup composite + remote cache"
```

## Task 2.3: Convert the remaining 12 turbo jobs to the composite

**Files:**

- Modify: `.github/workflows/ci-and-release.yml`

The jobs still carrying an inline `actions/cache` of `.turbo` (grep `path: .turbo`): `deploy-docs-preview`, `deploy-docs-prod`, `deploy-architect-preview`, `deploy-interviewer-preview`, `deploy-website-preview`, `deploy-website-prod`, `chromatic-fresco-ui`, `chromatic-interview`, `release`, `interviewer-release-build`, `architect-release-build`. Convert each identically to Task 2.2 (replace the pnpm/node/install/`actions/cache` block with `- uses: ./.github/actions/turbo-ci-setup`, keeping `actions/checkout` and each job's own env/secret/build steps).

- [ ] **Step 1: Find every remaining `.turbo` cache block**

Run:

```bash
grep -nE "path: .turbo" .github/workflows/ci-and-release.yml
```

Expected: one line per job listed above (~12).

- [ ] **Step 2: Convert each job** (repeat the Task 2.2 replacement per job)

For each job, delete its `pnpm/action-setup`, `actions/setup-node`, `pnpm install …`, and `actions/cache (path: .turbo)` steps and insert `- uses: ./.github/actions/turbo-ci-setup` immediately after that job's `actions/checkout`. Preserve every other step (env writes, `netlify-cli` deploys, `turbo run build --filter=…`, Chromatic, release actions). Do not change any `needs:`/`if:` here.

- [ ] **Step 3: Verify no `.turbo` cache steps remain**

Run:

```bash
grep -c "path: .turbo" .github/workflows/ci-and-release.yml
actionlint .github/workflows/ci-and-release.yml && echo "actionlint clean"
```

Expected: `0`, then `actionlint clean`.

- [ ] **Step 4: Commit + open PR 2**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: route all turbo jobs through the remote-cache composite action"
git push -u origin HEAD
gh pr create --base claude/elated-williamson-c76d6e --title "ci: adopt GitHub-Actions-Cache-backed Turborepo remote cache" \
  --body "Replaces per-job .turbo actions/cache with a runner-local turbo remote cache (rharkor/caching-for-turbo) via a shared composite action. Per-task hash-addressed cache entries; no structural change to quality yet."
```

- [ ] **Step 5: On the PR run, confirm the remote cache is active**

In the PR's Actions logs for the `quality` job, confirm `rharkor/caching-for-turbo` started its server and that turbo reports remote cache hits (`cache hit`/`Remote caching enabled`). If turbo shows no remote hits at all across two consecutive pushes, STOP and investigate before merging (a misconfigured cache silently rebuilds everything).

---

# PR 3 — Fan `quality` out + add the (inert) merge-queue trigger

## Task 3.1: Split `quality` into parallel sub-jobs behind a `quality` aggregator

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (replace the single `quality` job)

**Interfaces:**

- Produces: jobs `lint`, `knip`, `check-changesets`, `test-scripts`, `build`, `typecheck`, `test`, and an aggregator job **`quality`** (`needs` all seven). The `quality` name/`result` is unchanged, so every existing `needs: quality` / `needs.quality.result` reference keeps working.

- [ ] **Step 1: Replace the `quality` job with the fan-out + aggregator**

Delete the entire single `quality` job and insert these eight jobs in its place. Note: sub-jobs do **not** `needs: detect` (so they can run under `merge_group`, where `detect` is skipped).

```yaml
lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
    - uses: ./.github/actions/turbo-ci-setup
    - run: pnpm exec turbo run //#lint

knip:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
    - uses: ./.github/actions/turbo-ci-setup
    - run: pnpm exec turbo run //#knip

check-changesets:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
    - uses: ./.github/actions/turbo-ci-setup
    - run: pnpm check:changesets

test-scripts:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
    - uses: ./.github/actions/turbo-ci-setup
    - run: pnpm test:scripts

build:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
    - uses: ./.github/actions/turbo-ci-setup
    - name: Build shared packages (apps build in their own deploy/release jobs)
      run: pnpm exec turbo run build --filter='./packages/*'

typecheck:
  needs: build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
    - uses: ./.github/actions/turbo-ci-setup
    - run: pnpm exec turbo run typecheck

test:
  needs: build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v6
    - uses: ./.github/actions/turbo-ci-setup
    - name: Write protocol-validation .env (test fixture)
      env:
        PROTOCOL_ENCRYPTION_KEY: ${{ secrets.PROTOCOL_ENCRYPTION_KEY }}
        PROTOCOL_ENCRYPTION_IV: ${{ secrets.PROTOCOL_ENCRYPTION_IV }}
        TEST_PROTOCOL_TOKEN: ${{ secrets.TEST_PROTOCOL_TOKEN }}
      run: |
        {
          echo "PROTOCOL_ENCRYPTION_KEY=$PROTOCOL_ENCRYPTION_KEY"
          echo "PROTOCOL_ENCRYPTION_IV=$PROTOCOL_ENCRYPTION_IV"
          echo "GITHUB_TOKEN=$TEST_PROTOCOL_TOKEN"
        } > packages/protocol-validation/.env
    - run: pnpm exec turbo run test

quality:
  needs: [lint, knip, check-changesets, test-scripts, build, typecheck, test]
  if: ${{ !cancelled() }}
  runs-on: ubuntu-latest
  steps:
    - name: Verify all quality checks passed
      env:
        RESULTS: ${{ join(needs.*.result, ',') }}
      run: |
        echo "sub-job results: $RESULTS"
        IFS=',' read -ra arr <<< "$RESULTS"
        for r in "${arr[@]}"; do
          if [ "$r" != "success" ]; then
            echo "::error::quality gate failed — a sub-job concluded '$r'"
            exit 1
          fi
        done
        echo "quality gate passed"
```

- [ ] **Step 2: Confirm downstream `needs: quality` references still resolve**

Run:

```bash
grep -nE "needs:.*quality|needs\.quality\.result" .github/workflows/ci-and-release.yml
actionlint .github/workflows/ci-and-release.yml && echo "actionlint clean"
```

Expected: the six release/deploy jobs still reference `quality`; `actionlint clean` (a `needs:` cycle or unknown-job reference fails actionlint).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: fan quality out into parallel lint/knip/build/typecheck/test jobs behind a quality aggregator"
```

## Task 3.2: Add the `merge_group` trigger and guard `detect`

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (the `on:` block and the `detect` job)

- [ ] **Step 1: Add the `merge_group` trigger**

In the `on:` block, add `merge_group:` alongside `push`/`pull_request`/`workflow_dispatch`:

```yaml
on:
  push:
    branches: [main]
  pull_request:
  merge_group:
  workflow_dispatch:
    inputs:
      # …unchanged…
```

- [ ] **Step 2: Keep `detect` (and thus the conditional jobs) out of the queue**

Add an event guard to the `detect` job so it does not run on `merge_group` (only `quality`'s sub-graph should):

```yaml
detect:
  if: github.event_name != 'merge_group'
  runs-on: ubuntu-latest
  # …unchanged…
```

- [ ] **Step 3: Audit that nothing except the quality sub-graph runs on `merge_group`**

Every other job must evaluate its `if:` to false on `merge_group`. They already gate on `github.event_name == 'push'`/`pull_request` or on `needs.detect.outputs.*` (empty when `detect` is skipped). Verify no job is unconditionally runnable on `merge_group`:

```bash
grep -nE "^  [a-zA-Z_-]+:$|if:|needs:" .github/workflows/ci-and-release.yml | grep -B2 "always()"
```

Review each `always()` job (preview/prod deploys): confirm each also requires `github.event_name == 'push'` or a `detect` flag, so it self-skips under `merge_group`. Note any exceptions in the PR description.

- [ ] **Step 4: Lint + commit + open PR 3**

```bash
actionlint .github/workflows/ci-and-release.yml && echo clean
git add .github/workflows/ci-and-release.yml
git commit -m "ci: run quality on merge_group; keep detect + conditional jobs off the queue"
git push -u origin HEAD
gh pr create --base claude/elated-williamson-c76d6e --title "ci: parallelise quality + add inert merge_group trigger" \
  --body "Fans quality into parallel sub-jobs behind a 'quality' aggregator and adds a merge_group trigger (inert until the queue is enabled). Push-time quality and all needs: quality gates are UNCHANGED here — this is a pure refactor + speedup. The redundant post-merge run is removed in the follow-up PR after the queue is live."
```

- [ ] **Step 5: On the PR run, confirm the fan-out and aggregate**

Confirm the PR shows separate `lint`/`knip`/`build`/`typecheck`/`test`/`check-changesets`/`test-scripts` jobs and a green `quality` aggregate; confirm wall-clock improved versus a pre-PR-3 run. Merge when green.

---

# Settings change — enable the merge queue (between PR 3 and PR 4)

**This is an outward-facing governance change requiring repo-admin. Confirm with the maintainer before applying. It must be done AFTER PR 3 is merged (so `quality` has run on a real event) and BEFORE PR 4.**

- [ ] **Step 1: Create the ruleset on the default branch**

Preferred — **Settings → Rules → Rulesets → New branch ruleset** on `main`:

- Enforcement: **Active**. Target: **Default branch**. Bypass list: **empty** (no bypass).
- Rules: **Require a pull request before merging**; **Require merge queue** (merge method: match current — Merge commit; leave grouping/limits at defaults to start); **Require status checks to pass** → add check **`quality`** (type the name; select the `CI and Release` app as the source once it appears); keep **Block force pushes**.

Alternative — `gh api` (verify the schema against current GitHub docs before running; merge-queue parameters may need tuning):

```bash
gh api -X POST repos/{owner}/{repo}/rulesets -f name='Merge queue + required quality' \
  -f target=branch -f enforcement=active \
  -F 'conditions[ref_name][include][]=~DEFAULT_BRANCH' \
  -F 'rules[][type]=pull_request' \
  -F 'rules[][type]=merge_queue' \
  -F 'rules[][type]=required_status_checks' \
  # …plus rules[].parameters for merge_queue (merge_method, grouping_strategy=ALLGREEN,
  #   check_response_timeout_minutes, min/max_entries_to_merge, max_entries_to_build)
  #   and required_status_checks (required_status_checks[].context='quality').
```

- [ ] **Step 2: Smoke-test the queue with a throwaway PR**

Open a trivial no-op PR, click **Merge when ready**, and confirm: a `merge_group` run appears; only the quality sub-graph + `quality` aggregate run (no deploys/chromatic/e2e); on green, `main` fast-forwards. Then confirm a red PR (temporarily break a test) is **blocked at the queue** and never merges.

---

# PR 4 — Drop the redundant post-merge `quality` run

Only after the queue is live and smoke-tested. This removes the redundancy the whole effort targets.

## Task 4.1: Skip `quality` on push and de-gate the six release/deploy jobs

**Files:**

- Modify: `.github/workflows/ci-and-release.yml`

- [ ] **Step 1: Skip the quality sub-graph on push**

Add `if: github.event_name != 'push'` to each of the eight quality jobs. For the seven sub-jobs add it as the sole `if:`; for the aggregator combine with the existing guard:

```yaml
quality:
  needs: [lint, knip, check-changesets, test-scripts, build, typecheck, test]
  if: ${{ !cancelled() && github.event_name != 'push' }}
```

(Sub-jobs, e.g. `lint:` gains `if: github.event_name != 'push'`; do the same for `knip`, `check-changesets`, `test-scripts`, `build`, `typecheck`, `test`.)

- [ ] **Step 2: Remove the `quality` dependency from the six push-to-main jobs**

- `release`, `apps-release-pr`, `apps-release-detect`, `legacy-release-detect`: change `needs: quality` → remove it (keep their existing `if:`). If a job's only `needs` was `quality`, delete the `needs:` line entirely.
- `deploy-docs-prod`, `deploy-website-prod`: change `needs: [detect, quality]` → `needs: [detect]`, and delete the `needs.quality.result == 'success'` line from their `if:` blocks (keep `always()`, `github.event_name == 'push'`, `github.ref == 'refs/heads/main'`, and the `needs.detect.outputs.* == 'true'` clause).

- [ ] **Step 3: Confirm no push-to-main job still depends on `quality`**

Run:

```bash
grep -nE "needs:.*quality|needs\.quality\.result" .github/workflows/ci-and-release.yml
actionlint .github/workflows/ci-and-release.yml && echo clean
```

Expected: **no** matches for `quality` in `needs:`/`needs.quality.result`; `clean`.

- [ ] **Step 4: Commit + open PR 4 (through the queue)**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: drop redundant push-time quality run; release/deploy jobs trust the merge queue"
git push -u origin HEAD
gh pr create --base main --title "ci: remove redundant post-merge quality run" \
  --body "With the merge queue authoritative, quality no longer runs on push to main and the six release/deploy jobs no longer gate on it. Every push to main now comes from a green queue run of the exact landed commit."
```

(Base `main` — the rename branch should have merged by now; retarget if not.)

- [ ] **Step 5: Post-merge verification**

After PR 4 lands via the queue, confirm on the resulting push to `main`: **no** `quality`/sub-graph jobs run; `release` (and any flagged prod deploy) still runs and succeeds. Then verify a version-PR merge publishes to npm with no push-time `quality` run.

---

## Self-Review

**Spec coverage:**

- Authoritative check via merge queue → Settings step + Task 3.2 (`merge_group`) + Task 4.1. ✅
- Only `quality` is the queue-required check; detect/carry-forward untouched → Task 3.2 guard + Global Constraints. ✅
- Skip quality on push; de-gate the six jobs → Task 4.1. ✅
- Fan-out into aggregator → Task 3.1. ✅
- GitHub-native remote cache → Tasks 2.1–2.3. ✅
- Version-churn inputs (typecheck+test+build with 3 overrides) + interview stub → Tasks 1.1–1.2. ✅
- Rollout ordering / no unguarded window → PR sequencing + Global Constraints. ✅
- Escape hatch → covered by "disable the ruleset" (Settings step is reversible); noted in spec.

**Placeholder scan:** The only non-literal is the `gh api` ruleset body (Settings Step 1), deliberately left as UI-first because the merge-queue rulesets schema is fiddly and version-sensitive; the UI path is fully specified. No other TBDs.

**Type/name consistency:** Aggregator job is `quality` everywhere; sub-job names (`lint`, `knip`, `check-changesets`, `test-scripts`, `build`, `typecheck`, `test`) match between Task 3.1's `needs:` list and their definitions; composite action path `./.github/actions/turbo-ci-setup` matches its file location.
