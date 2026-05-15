# CI Supply-Chain Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the repo's GitHub Actions workflows against the class of supply-chain attack demonstrated by the TanStack npm compromise (2026-05-11). All changes are CI-only — no application code is touched.

**Architecture:** Apply defense-in-depth across three layers: (1) pin every third-party action to a full commit SHA so compromised tags can't silently swap implementations; (2) tighten OIDC token exposure in workflows that don't need it; (3) reduce lifecycle-script attack surface in the release job that holds publish credentials.

**Tech Stack:** GitHub Actions (YAML), `gh` CLI for SHA resolution, `actionlint` for syntactic validation, Dependabot.

**Findings backing this plan:** See the audit summary in the conversation that produced this plan (2026-05-12). Repo is **not** dependency-impacted by the TanStack compromise (zero `@tanstack/*` references in `pnpm-lock.yaml`). This plan addresses the structural CI hardening gaps surfaced by that audit.

**Pre-flight check (do once before starting):**

- `actionlint` is the validator used throughout. Install it: `brew install actionlint` (macOS) or `go install github.com/rhysd/actionlint/cmd/actionlint@latest`. If the engineer can't install it, fall back to `npx -y actionlint-cli` per step.
- `gh` CLI must be authenticated (`gh auth status`) — used to resolve action tags to commit SHAs.
- Definitive functional test for every change: after committing, open a no-op draft PR (or push to a throwaway branch) and confirm the affected workflows run green. Each task notes which workflow(s) to watch.
- **Known baseline warnings (expected, not in scope):** `actionlint` reports 5 pre-existing `info`/`style` shellcheck warnings in `development-protocol-release.yml` (SC2035, SC2086 x3, SC2129). These are not errors and not introduced by this work. Any _new_ warning or any `error`-level finding is in scope to fix.

---

## File Structure

This plan modifies CI configuration only. No source files are created or moved.

| File                                                 | Purpose                       | Touched by    |
| ---------------------------------------------------- | ----------------------------- | ------------- |
| `.github/workflows/ci-and-release.yml`               | Main CI + npm publish         | Tasks 1, 3, 6 |
| `.github/workflows/chromatic.yml`                    | Storybook visual regression   | Tasks 1, 6    |
| `.github/workflows/interview-e2e.yml`                | Playwright e2e + Pages deploy | Tasks 1, 2, 6 |
| `.github/workflows/development-protocol-main.yml`    | PR validate dev protocol      | Tasks 4, 6    |
| `.github/workflows/development-protocol-release.yml` | Release dev protocol          | Tasks 1, 6    |
| `.github/workflows/documentation-check-links.yml`    | Doc link checker              | Tasks 1, 6    |
| `.github/workflows/documentation-test-redirects.yml` | Doc redirect tester           | Tasks 1, 6    |
| `.github/dependabot.yml`                             | Auto-update config            | Task 5        |

---

## Task Ordering Rationale

Tasks are ordered by **blast radius reduction per unit of work**:

- Task 1 (third-party SHA pinning) closes the highest-risk gap — the release job's `changesets/action@v1` floating tag.
- Tasks 2–3 reduce credential exposure on the workflows that hold credentials.
- Tasks 4–5 are low-risk hygiene fixes.
- Task 6 (first-party SHA pinning) is optional belt-and-braces — first-party `actions/*` are much lower-risk but pinning them removes a whole category of concern.
- Task 7 is a manual verification step that needs GitHub web-UI access; do it last so the engineer can batch-review settings in one sitting.

If time is constrained, **Tasks 1, 3, and 5 are the minimum set worth landing.**

---

### Task 1: Pin third-party actions to commit SHAs

Pin every non-`actions/*` reference across all workflows to a full 40-character commit SHA. Floating major tags (`@v5`, `@v11`, etc.) are mutable; a compromised maintainer can swap them. SHAs are immutable.

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (lines 23, 60, 106, 154, 180)
- Modify: `.github/workflows/chromatic.yml` (lines 47, 62, 80, 95)
- Modify: `.github/workflows/interview-e2e.yml` (no third-party in current form — verify)
- Modify: `.github/workflows/development-protocol-main.yml` (line 33)
- Modify: `.github/workflows/development-protocol-release.yml` (line 34)
- Modify: `.github/workflows/documentation-check-links.yml` (line 21)
- Modify: `.github/workflows/documentation-test-redirects.yml` (lines 21, 42)

Third-party actions in scope:

- `pnpm/action-setup@v5`
- `changesets/action@v1`
- `chromaui/action@v11`
- `softprops/action-gh-release@v2`
- `dorny/paths-filter@v3`

- [ ] **Step 1: Resolve current SHAs for each pinned tag**

Run:

```bash
for ref in \
  "pnpm/action-setup@v5" \
  "changesets/action@v1" \
  "chromaui/action@v11" \
  "softprops/action-gh-release@v2" \
  "dorny/paths-filter@v3"; do
  repo="${ref%@*}"; tag="${ref##*@}"
  sha=$(gh api "repos/${repo}/commits/${tag}" -q .sha 2>/dev/null)
  printf '%-45s %s\n' "$ref" "$sha"
done
```

Expected: 5 lines, each showing the action ref followed by a 40-char hex SHA. Record these — you'll paste them into the workflows. If any line shows an empty SHA, `gh` isn't authenticated or the tag was deleted; resolve before continuing.

- [ ] **Step 2: Cross-check resolved SHAs against the Releases page**

For each action, open `https://github.com/<repo>/releases/tag/<resolved-version>` in a browser and verify the commit SHA at the top of the release matches what `gh api` returned. This catches the case where `gh api` follows a moved tag.

If a SHA doesn't match, do not proceed with that action — flag it and ask the user. A moved tag on a third-party action is itself a yellow flag.

- [ ] **Step 3: Update `ci-and-release.yml`**

Apply the resolved SHAs. The format is: `uses: <repo>@<sha>  # <original-version>` so a human reader can still see the human-readable version.

Replace every occurrence of:

```yaml
uses: pnpm/action-setup@v5
```

with (substituting the resolved SHA from Step 1):

```yaml
uses: pnpm/action-setup@<resolved-sha> # v5
```

Replace:

```yaml
uses: changesets/action@v1
```

with:

```yaml
uses: changesets/action@<resolved-sha> # v1
```

There are 4 occurrences of `pnpm/action-setup@v5` and 1 of `changesets/action@v1` in this file.

- [ ] **Step 4: Update `chromatic.yml`**

Replace both occurrences of `pnpm/action-setup@v5` and both occurrences of `chromaui/action@v11` with their SHA-pinned forms (same comment-suffix pattern).

- [ ] **Step 5: Update `development-protocol-main.yml`**

Replace the single `pnpm/action-setup@v5` reference.

- [ ] **Step 6: Update `development-protocol-release.yml`**

Replace `softprops/action-gh-release@v2` with its SHA-pinned form.

- [ ] **Step 7: Update `documentation-check-links.yml`**

Replace `dorny/paths-filter@v3` with its SHA-pinned form.

- [ ] **Step 8: Update `documentation-test-redirects.yml`**

Replace `dorny/paths-filter@v3` and `pnpm/action-setup@v5` with their SHA-pinned forms.

- [ ] **Step 9: Verify `interview-e2e.yml` has no third-party actions**

Run:

```bash
grep -nE "uses: " .github/workflows/interview-e2e.yml | grep -v "actions/"
```

Expected: no output. If anything appears, pin it using the same pattern. (At time of writing, this file uses only `actions/*` and they're handled in Task 6.)

- [ ] **Step 10: Lint all workflows**

Run:

```bash
actionlint .github/workflows/*.yml
```

Expected: same 5 baseline shellcheck warnings in `development-protocol-release.yml` (SC2035, SC2086 x3, SC2129) — nothing more. If new errors appear, the SHA replacement broke YAML — almost always indentation or a missing quote. Fix and rerun until clean.

- [ ] **Step 11: Sanity-check the diff**

Run:

```bash
git diff --stat .github/workflows/
```

Expected: 7 workflow files modified, no other files touched. Approximately 14 lines changed total.

Run:

```bash
git diff .github/workflows/ | grep -E "^\+.*uses:" | sort -u
```

Expected: every `+uses:` line shows `@<40-hex-chars>  # v<version>`. No remaining floating tags on third-party actions.

- [ ] **Step 12: Commit**

```bash
git add .github/workflows/
git commit -m "ci: pin third-party actions to commit SHAs

Mitigates the class of supply-chain attack where a compromised
maintainer publishes a malicious version under an existing major tag.
SHAs are immutable; tags are not."
```

- [ ] **Step 13: Functional test (smoke)**

Push the branch and open a draft PR. Watch `ci-and-release.yml`, `chromatic.yml`, and `documentation-*.yml` runs. All three must complete with the same outcome they had before the SHA pin (typically green). If any fails on a step you didn't change, the SHA likely points at a release that's incompatible with your workflow inputs — resolve to the latest patch SHA within the same major.

---

### Task 2: Scope `id-token: write` to the job that needs it in `interview-e2e.yml`

> **DEFERRED on the initial execution (2026-05-12):** the target file `.github/workflows/interview-e2e.yml` exists only on branch `feat/interview-package`, not on `main`. This task will be applied on that branch (or in a follow-up after it merges) using the same steps below.

The `id-token: write` permission is currently granted at the workflow level (line 6), exposing it to the `e2e` job which doesn't mint or consume an OIDC token. Only `actions/deploy-pages@v4` in the `deploy-report` job needs it. Following least-privilege, move it.

**Files:**

- Modify: `.github/workflows/interview-e2e.yml:3-7` (workflow-level permissions block)
- Modify: `.github/workflows/interview-e2e.yml:76-89` (deploy-report job — add job-level permissions)

- [ ] **Step 1: Confirm e2e job doesn't need `id-token`**

Run:

```bash
grep -nE "(id-token|OIDC|oidc|aws-actions|google-github-actions)" .github/workflows/interview-e2e.yml
```

Expected: only the workflow-level `id-token: write` line in the permissions block. If anything else appears (e.g., a step that calls AWS or GCP), this task needs reconsidering — flag it back to the user before continuing.

- [ ] **Step 2: Remove `id-token: write` from workflow-level permissions**

Edit `.github/workflows/interview-e2e.yml` lines 3–7.

Replace:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
  pull-requests: write
```

with:

```yaml
permissions:
  contents: read
  pull-requests: write
```

(`pages: write` and `id-token: write` move down to the deploy-report job, where they're actually used.)

- [ ] **Step 3: Add job-level permissions to `deploy-report`**

Find the `deploy-report:` job definition (around line 76). Immediately after the `if:` line and before `needs: e2e`, add a `permissions:` block.

Replace:

```yaml
deploy-report:
  # Run on test pass or fail, but skip when e2e is cancelled (concurrency
  # interrupt or manual cancel) — there's no artifact to deploy and the
  # outputs are empty, so the job would just error out trying to download.
  if: ${{ !cancelled() && needs.e2e.result != 'cancelled' }}
  needs: e2e
  runs-on: ubuntu-latest
```

with:

```yaml
deploy-report:
  # Run on test pass or fail, but skip when e2e is cancelled (concurrency
  # interrupt or manual cancel) — there's no artifact to deploy and the
  # outputs are empty, so the job would just error out trying to download.
  if: ${{ !cancelled() && needs.e2e.result != 'cancelled' }}
  needs: e2e
  runs-on: ubuntu-latest
  permissions:
    contents: read
    pages: write
    id-token: write
    pull-requests: write
```

`pull-requests: write` stays here because the `Comment on PR` step at the end of this job uses it.

- [ ] **Step 4: Lint**

Run:

```bash
actionlint .github/workflows/interview-e2e.yml
```

Expected: no output (this file has no baseline warnings).

- [ ] **Step 5: Verify the e2e job's effective permissions**

Run:

```bash
grep -A 20 "^  e2e:" .github/workflows/interview-e2e.yml | head -25
```

Expected: the `e2e:` job has no `permissions:` block, which means it inherits workflow-level perms (`contents: read`, `pull-requests: write` only — no `id-token`, no `pages`).

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/interview-e2e.yml
git commit -m "ci(interview-e2e): scope id-token/pages perms to deploy job

The e2e job runs Playwright and doesn't need OIDC. Only deploy-pages
needs id-token: write. Moving these perms to the deploy-report job
follows least-privilege and reduces token-exfiltration surface."
```

- [ ] **Step 7: Functional test**

Push and watch a PR run. The `interview-e2e.yml` workflow must complete with the same outcome as before (e2e job runs, deploy-report deploys to Pages, comment lands on the PR). If `deploy-pages` fails with a permissions error, the permissions block on `deploy-report` is missing one of `pages: write` or `id-token: write` — re-check Step 3.

---

### Task 3: Disable lifecycle scripts in the release-job `pnpm install`

The release job in `ci-and-release.yml` runs `pnpm install --frozen-lockfile` on a runner that holds `id-token: write` and the npm publish credential. Default pnpm runs `postinstall`/`prepare` lifecycle scripts during install. A compromised transitive dep can therefore execute arbitrary code with publish privileges. Disabling lifecycle scripts in this specific job closes that gap. Explicit builds afterward (which the job already does) cover legitimate needs.

**Files:**

- Modify: `.github/workflows/ci-and-release.yml:160-161` (release job install step)

- [ ] **Step 1: Confirm no required postinstall script in the release path**

Run:

```bash
grep -nE '"(postinstall|prepare|preinstall|install)"' package.json packages/*/package.json apps/*/package.json workers/*/package.json tooling/*/package.json 2>/dev/null
```

Expected: a list of any packages with lifecycle scripts. For each line, decide: is this script needed during the release-job install, or only during dev/build? If anything is genuinely needed during install on the release runner, this task needs adjustment — flag it. Typical patterns (`prepare: husky install`, `postinstall: patch-package`) are NOT needed in CI release.

If unsure, the safer default is still `--ignore-scripts` plus an explicit `pnpm <whatever-the-script-did>` step afterward.

- [ ] **Step 2: Update the release-job install command**

Edit `.github/workflows/ci-and-release.yml` line 161.

Replace:

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

with (in the `release` job only, around line 160 — not the other three install steps):

```yaml
- name: Install dependencies
  # --ignore-scripts: this job holds id-token: write and the npm publish
  # credential, so refuse to execute lifecycle scripts from any (potentially
  # compromised) transitive dep. Explicit builds run as their own steps below.
  run: pnpm install --frozen-lockfile --ignore-scripts
```

- [ ] **Step 3: Lint**

Run:

```bash
actionlint .github/workflows/ci-and-release.yml
```

Expected: no output.

- [ ] **Step 4: Verify only the release job changed**

Run:

```bash
grep -n "pnpm install" .github/workflows/ci-and-release.yml
```

Expected: 4 lines. Three should read `pnpm install --frozen-lockfile`; one (the release job, around line 161) should read `pnpm install --frozen-lockfile --ignore-scripts`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci(release): use --ignore-scripts during publish install

The release job holds id-token: write and npm publish credentials.
Disabling lifecycle scripts here prevents a compromised transitive
dep from executing code in the publish context. Explicit build steps
that follow cover legitimate build needs."
```

- [ ] **Step 6: Functional test**

Push to a branch and merge to main (or wait for the next planned merge). Watch the `release` job in `ci-and-release.yml`. It must:

- Install dependencies successfully (no missing-binary errors).
- Run `pnpm run build:changed-packages` successfully.
- Open a changesets PR or publish (depending on changeset state) as before.

If install fails with a "command not found" error from a build tool, that tool's binary was being created by a `postinstall` script. Solution: add an explicit `pnpm <whatever-the-script-did>` step _after_ install. Do not revert `--ignore-scripts`.

---

### Task 4: Add `--frozen-lockfile` to `development-protocol-main.yml`

This workflow currently runs `pnpm install` without `--frozen-lockfile`, allowing silent lockfile drift in CI. Every other install in the repo uses `--frozen-lockfile`. Consistency closes the divergence.

**Files:**

- Modify: `.github/workflows/development-protocol-main.yml:36-41`

- [ ] **Step 1: Update the install step**

Replace:

```yaml
# Build protocol-validation and dependencies
- name: Build protocol validation
  run: |
    pnpm install
    # Build shared-consts first, then protocol-validation
    pnpm --filter @codaco/shared-consts build
    pnpm build
```

with:

```yaml
# Build protocol-validation and dependencies
- name: Build protocol validation
  run: |
    pnpm install --frozen-lockfile
    # Build shared-consts first, then protocol-validation
    pnpm --filter @codaco/shared-consts build
    pnpm build
```

- [ ] **Step 2: Lint**

Run:

```bash
actionlint .github/workflows/development-protocol-main.yml
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/development-protocol-main.yml
git commit -m "ci(development-protocol): use --frozen-lockfile

Brings this workflow in line with every other install step in the
repo. Prevents silent lockfile drift in CI."
```

- [ ] **Step 4: Functional test**

Push and open a PR that touches `packages/development-protocol/**` or `packages/protocol-validation/**` (or use `workflow_dispatch`). The validate job must complete green. If install fails with "ERR_PNPM_OUTDATED_LOCKFILE", the lockfile actually was drifting — run `pnpm install` locally, commit the lockfile, and the workflow will pass.

---

### Task 5: Add the `github-actions` ecosystem to Dependabot

Once actions are pinned to SHAs (Task 1), they no longer auto-update. Dependabot's `github-actions` ecosystem opens a PR when a new release is cut, with the new SHA already substituted in. This restores updates without giving up pin safety.

**Files:**

- Modify: `.github/dependabot.yml`

- [ ] **Step 1: Update `dependabot.yml`**

Replace the file's `updates:` section so it covers both ecosystems.

Replace the entire content of `.github/dependabot.yml` with:

```yaml
# To get started with Dependabot version updates, you'll need to specify which
# package ecosystems to update and where the package manifests are located.
# Please see the documentation for all configuration options:
# https://docs.github.com/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file

version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'

  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
    groups:
      actions:
        patterns:
          - '*'
```

The `groups: actions: patterns: "*"` block bundles all action-version updates into a single PR per week, which is typically what you want — a flurry of one-line PRs each week creates review fatigue.

- [ ] **Step 2: Validate YAML**

Run:

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/dependabot.yml'))" && echo OK
```

Expected: `OK`. (Dependabot config has no dedicated linter; YAML parse is the practical check. GitHub validates it server-side on push and will surface errors in the Dependabot UI.)

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci(dependabot): track github-actions ecosystem

Once actions are pinned to SHAs, they no longer auto-update. This
restores update visibility while preserving pin immutability —
Dependabot opens a PR with the new SHA already substituted."
```

- [ ] **Step 4: Functional verification**

After push, navigate to `https://github.com/<owner>/<repo>/network/updates` and confirm two ecosystems are listed: npm and github-actions. The first github-actions check runs within ~24h of merge; you can also click "Check for updates" on that page to trigger immediately.

---

### Task 6 (optional): Pin first-party `actions/*` to commit SHAs

First-party `actions/*` are lower-risk than third-party — they're maintained by GitHub itself — but pinning them removes a whole category of concern in one stroke. Take this task only if the previous tasks are stable and you want belt-and-braces.

**Files:**

- Modify: every workflow under `.github/workflows/` (same files as Task 1, plus the parts of `interview-e2e.yml` skipped earlier)

Actions in scope:

- `actions/checkout` (mix of `@v4` and `@v6`)
- `actions/setup-node@v6`
- `actions/upload-artifact` (`@v4` and `@v7`)
- `actions/download-artifact@v4`
- `actions/upload-pages-artifact@v3`
- `actions/deploy-pages@v4`
- `actions/github-script@v7`

- [ ] **Step 1: Align action versions before pinning**

Before pinning, normalize the inconsistencies first — there's no reason for two different `checkout` major versions to coexist, and pinning enshrines the inconsistency.

Run:

```bash
grep -rnE "uses: actions/" .github/workflows/ | sort -t'/' -k3
```

Expected: a list grouped by action name. Look for any action where two different major versions appear. Currently: `checkout@v4` (interview-e2e.yml) vs `checkout@v6` (everywhere else); `upload-artifact@v4` (interview-e2e.yml) vs `upload-artifact@v7` (ci-and-release.yml).

Decide a target version per action (latest stable major is usually right) and update everything in interview-e2e.yml to match. Test that workflow runs after each upgrade before pinning — major-version bumps can break inputs.

- [ ] **Step 2: Resolve SHAs**

Run:

```bash
for ref in \
  "actions/checkout@v6" \
  "actions/setup-node@v6" \
  "actions/upload-artifact@v7" \
  "actions/download-artifact@v4" \
  "actions/upload-pages-artifact@v3" \
  "actions/deploy-pages@v4" \
  "actions/github-script@v7"; do
  repo="${ref%@*}"; tag="${ref##*@}"
  sha=$(gh api "repos/${repo}/commits/${tag}" -q .sha 2>/dev/null)
  printf '%-45s %s\n' "$ref" "$sha"
done
```

Expected: 7 lines, each with a 40-char SHA. Record them.

- [ ] **Step 3: Update all workflows**

Apply the SHA-pin pattern (`uses: <repo>@<sha>  # <version>`) for every `actions/*` reference across all 7 workflow files. This is mechanical — same pattern as Task 1.

- [ ] **Step 4: Lint**

Run:

```bash
actionlint .github/workflows/*.yml
```

Expected: same 5 baseline shellcheck warnings only.

- [ ] **Step 5: Verify zero floating tags remain**

Run:

```bash
grep -rnE "uses: [^@]+@v[0-9]+$" .github/workflows/
```

Expected: no output. (Any line ending in `@v<digit>` without an SHA-pinned commit is a remaining floating tag.)

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/
git commit -m "ci: pin first-party actions to commit SHAs

Completes SHA pinning across all action references. First-party
actions are lower-risk than third-party but pinning removes the
mutable-tag category entirely. Dependabot's github-actions
ecosystem will surface updates."
```

- [ ] **Step 7: Functional test**

Push and open a draft PR. Watch all workflows execute. Pay particular attention to `interview-e2e.yml` if its action versions were bumped in Step 1 — major-version changes can rename inputs.

---

### Task 7 (manual): Verify secret scoping in GitHub UI

This is a verification task, not a code change. It can't be done through the repo; it requires GitHub web-UI access to repo settings. The controller will surface this task back to the human user — do not attempt to dispatch this to a subagent.

- [ ] **Step 1: Confirm the `npm-publish` environment exists and is protected**

Navigate to `https://github.com/<owner>/<repo>/settings/environments`. Confirm:

- An environment named `npm-publish` exists (referenced by `ci-and-release.yml:146`).
- It has required reviewers configured (any merge to main triggers it; reviewers gate the publish step).
- It restricts deployment branches to `main` only.
- Any `NPM_TOKEN`-equivalent secret lives in this environment, not in repo-wide secrets.

If any of these are missing, fix in the UI. The protection of the `npm-publish` environment is the load-bearing gate that prevents an attacker from publishing via a non-release-branch PR.

- [ ] **Step 2: Audit repo-level secrets**

Navigate to `https://github.com/<owner>/<repo>/settings/secrets/actions`. For each repo-level secret, confirm:

- `PROTOCOL_ENCRYPTION_KEY`, `PROTOCOL_ENCRYPTION_IV` — used by the test job. Confirm these are test-only keys, not the same keys used by any production system.
- `TEST_PROTOCOL_TOKEN` — used to fetch test protocols. Confirm it's a fine-grained GitHub token with `contents: read` only, scoped to the relevant test-fixture repo. **It must not have write or admin scope.**
- `CHROMATIC_PROJECT_TOKEN_FRESCO_UI`, `CHROMATIC_PROJECT_TOKEN_INTERVIEW` — Chromatic project tokens. These are scoped per-project by Chromatic; no action needed unless one has been leaked.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk publishable keys are public by design (the `NEXT_PUBLIC_` prefix says so). Confirm this is the publishable, not the secret, key.

- [ ] **Step 3: Confirm dependabot doesn't have publish access**

Same secrets page. Confirm Dependabot's secrets (if any) don't include the npm publish token. (Dependabot runs with its own secret store; a leak path is granting it secrets it doesn't need.)

- [ ] **Step 4: Record findings**

If everything is correctly scoped, no commit is needed — this task is verification. If anything required rotation (e.g., a token had too-broad scope), rotate it via the relevant provider's UI, then update the secret in GitHub, then trigger one workflow run to confirm the new value works.

---

## Self-Review

**Spec coverage:** Cross-referencing against the audit findings in the conversation:

| Audit finding                                                  | Plan task     |
| -------------------------------------------------------------- | ------------- |
| Pin third-party actions to SHAs                                | Task 1        |
| `id-token: write` on workflow-level in `interview-e2e.yml`     | Task 2        |
| Inconsistent artifact action versions (`v4` vs `v7`)           | Task 6 Step 1 |
| `pnpm install` runs lifecycle scripts in release job           | Task 3        |
| Missing `--frozen-lockfile` in `development-protocol-main.yml` | Task 4        |
| Confirm test-job secret scopes                                 | Task 7        |
| Add github-actions ecosystem to Dependabot                     | Task 5        |
| Pin first-party `actions/*` to SHAs (lower-priority)           | Task 6        |

All findings covered.

**Placeholder scan:** No "TBD", "implement later", or vague "add appropriate X" instructions. Every step contains either a specific edit (with before/after YAML), a runnable command, or a navigable URL.

**Type consistency:** Not applicable — no types defined. SHA pin pattern (`uses: <repo>@<sha>  # <version>`) is used identically in Tasks 1 and 6.

**One known unknown left to the engineer:** The exact SHA values. Resolved at execution time in Task 1 Step 1 and Task 6 Step 2 via `gh api`. This is deliberate — SHAs that are stale at execution time would be worse than no pre-filled SHAs.
