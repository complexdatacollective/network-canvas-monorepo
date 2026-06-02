# Interviewer v7 Electron release pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `apps/interviewer-v7` Electron builds into the monorepo's changesets release flow so a version bump on `main` produces a signed/notarized macOS + unsigned Windows + unsigned Linux GitHub Release, and so any PR with a changeset touching `@codaco/interviewer-v7` produces matching test binaries as workflow artifacts.

**Architecture:** Extend the existing `ci-and-release.yml`. The existing `release` job emits two new outputs (`interviewer_v7_released`, `interviewer_v7_version`) by diffing `apps/interviewer-v7/package.json` against `HEAD^`. A new matrix job builds per-platform when the flag flips true; a follow-up job downloads all artifacts and creates a single GitHub Release at tag `interviewer-v7@v<version>`. A parallel snapshot matrix job runs on PRs when a changeset references the package, using `pnpm changeset version --snapshot` to produce a sha-stamped pre-release version, uploading artifacts only.

**Tech stack:** GitHub Actions, electron-builder 26, `@changesets/cli` 2.31+, `softprops/action-gh-release` v2, pnpm workspace, Turbo (for dep build only).

**Spec:** `docs/superpowers/specs/2026-05-27-interviewer-v7-electron-release-design.md`

---

## File structure

- **Modify:** `apps/interviewer-v7/electron-builder.config.cjs` — gate `mac.notarize` on `APPLE_API_KEY` env var so local builds skip notarization.
- **Modify:** `.github/workflows/ci-and-release.yml`
  - `detect` job: add one shell block emitting `interviewer_v7_changeset` output (true if any `.changeset/*.md` mentions `@codaco/interviewer-v7` on a PR).
  - `release` job: bump checkout `fetch-depth` to 2 and add a version-diff step emitting `interviewer_v7_released` + `interviewer_v7_version` outputs.
  - **Add** `interviewer-v7-build` job: matrix over `macos-latest` / `windows-latest` / `ubuntu-latest`, gated on `release.outputs.interviewer_v7_released == 'true'`.
  - **Add** `interviewer-v7-publish` job: collects all platform artifacts, creates GitHub Release at `interviewer-v7@v<version>`.
  - **Add** `interviewer-v7-pr-snapshot` job: same matrix shape, gated on `detect.outputs.interviewer_v7_changeset == 'true'`, runs `pnpm changeset version --snapshot pr-<n>-<sha>` before build, uploads artifacts only.

No new files.

---

## Cross-task conventions

- All new uses of `actions/*` and `softprops/*` are pinned to a SHA with a `# v…` comment, matching the repo's existing convention.
- For `softprops/action-gh-release@v2`: pick the latest v2 SHA when implementing Task 4 (see step in that task).
- Workflow validation: install `actionlint` once at the start of implementation (`brew install actionlint`), then run `actionlint .github/workflows/ci-and-release.yml` after every YAML edit. If `actionlint` isn't available locally, skip and rely on GitHub's parse error on push.
- Commit message style follows the existing repo (terse, type-prefixed where appropriate: `ci:`, `build:`, `feat:`).
- Do NOT include `Co-Authored-By: Claude` in commit messages.

---

### Task 1: Gate notarization on `APPLE_API_KEY`

**Files:**

- Modify: `apps/interviewer-v7/electron-builder.config.cjs:44-46`

- [ ] **Step 1: Update the `notarize` field**

In `apps/interviewer-v7/electron-builder.config.cjs`, replace the existing `notarize` line:

```js
		notarize: process.env.APPLE_TEAM_ID
			? { teamId: process.env.APPLE_TEAM_ID }
			: true,
```

with:

```js
		notarize: Boolean(process.env.APPLE_API_KEY),
```

The intent: notarize iff CI passed an App Store Connect API key (Option B). Local builds without the env var skip notarytool entirely. The `teamId` is read from the API key itself, so we no longer need `APPLE_TEAM_ID`.

- [ ] **Step 2: Run the formatter**

Run from the repo root:

```bash
pnpm exec biome check --write apps/interviewer-v7/electron-builder.config.cjs
```

Expected: "Fixed 1 file" or "Checked 1 file in Xms" with no errors.

- [ ] **Step 3: Smoke-check the config parses**

Run from the repo root:

```bash
node -e "console.log(require('./apps/interviewer-v7/electron-builder.config.cjs').mac.notarize)"
```

Expected: `false` (no `APPLE_API_KEY` set locally).

Then verify the CI branch:

```bash
APPLE_API_KEY=/tmp/fake.p8 node -e "console.log(require('./apps/interviewer-v7/electron-builder.config.cjs').mac.notarize)"
```

Expected: `true`.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/electron-builder.config.cjs
git commit -m "build(interviewer-v7): gate macOS notarization on APPLE_API_KEY env var"
```

---

### Task 2: Add version-change detection to the `release` job

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (the `release:` job, currently lines ~658–696)

- [ ] **Step 1: Bump checkout depth so `HEAD^` is available**

In the `release` job, find the existing checkout step:

```yaml
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
  with:
    persist-credentials: false
```

Replace with:

```yaml
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
  with:
    persist-credentials: false
    fetch-depth: 2
```

`fetch-depth: 2` is the minimum needed to diff against the parent commit. We don't need full history.

- [ ] **Step 2: Declare job outputs**

In the same `release` job, add an `outputs:` block under the existing `permissions:` / `env:` keys (insert before `steps:`):

```yaml
outputs:
  interviewer_v7_released: ${{ steps.detect_interviewer_v7.outputs.released }}
  interviewer_v7_version: ${{ steps.detect_interviewer_v7.outputs.version }}
```

- [ ] **Step 3: Append a detection step**

After the existing `changesets/action@…` step in the `release` job, append:

```yaml
- name: Detect interviewer-v7 version bump
  id: detect_interviewer_v7
  env:
    PKG_JSON: apps/interviewer-v7/package.json
  run: |
    current=$(node -p "require('./$PKG_JSON').version")
    if git cat-file -e "HEAD^:$PKG_JSON" 2>/dev/null; then
      previous=$(git show "HEAD^:$PKG_JSON" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
    else
      previous=""
    fi
    if [[ "$current" != "$previous" && -n "$current" ]]; then
      echo "released=true" >> "$GITHUB_OUTPUT"
      echo "version=$current" >> "$GITHUB_OUTPUT"
      echo "interviewer-v7 version changed: $previous -> $current"
    else
      echo "released=false" >> "$GITHUB_OUTPUT"
      echo "version=" >> "$GITHUB_OUTPUT"
      echo "interviewer-v7 version unchanged ($current)"
    fi
```

Notes:

- `git cat-file -e` checks the parent blob exists. On the first commit of a branch (or a shallow clone that didn't fetch the parent) `previous` falls back to empty string, which won't match `$current`, so the job releases. That's correct behaviour: a brand-new branch with the file at version X should be treated as a release.
- The step runs unconditionally because `changesets/action` is itself unconditional in this job. The output flag is what gates downstream jobs.

- [ ] **Step 4: Validate**

Run from the repo root:

```bash
actionlint .github/workflows/ci-and-release.yml
```

Expected: no errors.

(Skip if actionlint not installed.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: detect interviewer-v7 version bump in release job"
```

---

### Task 3: Add the `interviewer-v7-build` matrix job

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (insert a new top-level job after `release:`)

- [ ] **Step 1: Insert the new job**

Add this job to `.github/workflows/ci-and-release.yml`, after the existing `release:` job and before `carry-forward-statuses:`:

```yaml
interviewer-v7-build:
  needs: release
  if: |
    needs.release.outputs.interviewer_v7_released == 'true'
  strategy:
    fail-fast: false
    matrix:
      include:
        - os: macos-latest
          platform: mac
          artifact_name: interviewer-v7-macos
        - os: windows-latest
          platform: win
          artifact_name: interviewer-v7-windows
        - os: ubuntu-latest
          platform: linux
          artifact_name: interviewer-v7-linux
  runs-on: ${{ matrix.os }}
  timeout-minutes: 60
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
    - uses: pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093 # v6.0.8
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'
    # No --ignore-scripts: electron-builder install-app-deps must rebuild
    # better-sqlite3-multiple-ciphers against the runner's Electron ABI.
    - run: pnpm install --frozen-lockfile
    - uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
      with:
        path: |
          ~/.cache/electron
          ~/.cache/electron-builder
        key: ${{ runner.os }}-electron-${{ hashFiles('apps/interviewer-v7/package.json') }}
        restore-keys: ${{ runner.os }}-electron-
    # Restore .turbo for the Linux leg only (the quality job writes the
    # ubuntu cache). Mac and Windows rebuild deps from scratch; this is
    # ~1-2 min per platform and acceptable.
    - if: matrix.os == 'ubuntu-latest'
      uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
      with:
        path: .turbo
        key: ${{ runner.os }}-turbo-${{ github.sha }}
        restore-keys: ${{ runner.os }}-turbo-
    - name: Build workspace dependencies
      run: pnpm exec turbo run build --filter=@codaco/interviewer-v7^...
    - name: Decode App Store Connect API key
      if: matrix.os == 'macos-latest'
      env:
        APPLE_API_KEY_B64: ${{ secrets.APPLE_API_KEY }}
      run: |
        key_path="${RUNNER_TEMP}/AuthKey.p8"
        printf '%s' "$APPLE_API_KEY_B64" | base64 --decode > "$key_path"
        echo "APPLE_API_KEY=${key_path}" >> "$GITHUB_ENV"
    - name: Build Electron app (${{ matrix.platform }})
      working-directory: apps/interviewer-v7
      env:
        # macOS-only credentials. Other matrix legs see empty strings,
        # which electron-builder treats as "not configured" (no signing,
        # no notarization). Linux build has no signing concept.
        APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
        APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
        CSC_LINK: ${{ matrix.os == 'macos-latest' && secrets.CSC_LINK || '' }}
        CSC_KEY_PASSWORD: ${{ matrix.os == 'macos-latest' && secrets.CSC_KEY_PASSWORD || '' }}
      run: pnpm electron:dist:${{ matrix.platform }}
    - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
      with:
        name: ${{ matrix.artifact_name }}
        path: apps/interviewer-v7/release-builds/*
        if-no-files-found: error
        retention-days: 30
```

Why each piece:

- `fail-fast: false` — one platform's failure shouldn't abort the others. We still need to investigate, but partial artifacts are useful.
- `cache: 'pnpm'` — caches the pnpm store across runs, restored by `setup-node`.
- The `turbo run build` step builds the workspace deps (fresco-ui, interview, network-exporters, etc.) so their `dist/` directories exist for the Vite renderer build. `^...` syntax excludes interviewer-v7 itself, which `electron-vite build` handles internally.
- The `APPLE_API_KEY` ladder: secret holds base64-encoded `.p8`; the decode step writes the file to `$RUNNER_TEMP` and overwrites the env var with the file path that electron-builder expects.
- CSC vars are gated by `matrix.os == 'macos-latest'` inside ternary expressions. Windows leg ships unsigned per the spec.

- [ ] **Step 2: Validate**

```bash
actionlint .github/workflows/ci-and-release.yml
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: add interviewer-v7 Electron build matrix"
```

---

### Task 4: Add the `interviewer-v7-publish` job

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (insert a new job after `interviewer-v7-build:`)

- [ ] **Step 1: Get the current latest v2 SHA for `softprops/action-gh-release`**

Run:

```bash
gh api repos/softprops/action-gh-release/releases/latest --jq '"\(.tag_name) \(.target_commitish)"'
```

If `target_commitish` looks like a branch name (e.g. `master`), resolve the tag's SHA:

```bash
gh api repos/softprops/action-gh-release/git/refs/tags/$(gh api repos/softprops/action-gh-release/releases/latest --jq .tag_name) --jq .object.sha
```

Record the SHA + version tag for use in Step 2.

- [ ] **Step 2: Insert the publish job**

Add this job to `.github/workflows/ci-and-release.yml`, after `interviewer-v7-build:`:

```yaml
interviewer-v7-publish:
  needs: [release, interviewer-v7-build]
  if: |
    needs.release.outputs.interviewer_v7_released == 'true'
  runs-on: ubuntu-latest
  permissions:
    contents: write
  timeout-minutes: 10
  steps:
    - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
      with:
        path: artifacts
        pattern: interviewer-v7-*
        merge-multiple: true
    - name: List collected artifacts
      run: ls -la artifacts/
    - uses: softprops/action-gh-release@<PASTE_SHA_FROM_STEP_1> # v<VERSION_FROM_STEP_1>
      with:
        tag_name: interviewer-v7@v${{ needs.release.outputs.interviewer_v7_version }}
        name: Interviewer v7 v${{ needs.release.outputs.interviewer_v7_version }}
        files: artifacts/*
        fail_on_unmatched_files: true
        make_latest: 'false'
        generate_release_notes: true
```

Replace `<PASTE_SHA_FROM_STEP_1>` and `<VERSION_FROM_STEP_1>` with the values from Step 1.

Why `make_latest: 'false'`: this is one of several apps that release out of this monorepo. We don't want the repo's "Latest release" pointer to bounce around as different apps cut versions. GitHub still surfaces the release on the Releases page; just doesn't mark it as latest.

Why `generate_release_notes: true`: auto-fills the release body from PRs merged since the previous tag with the same prefix. Saves manual changelog work for now; can be replaced by changeset-generated notes later.

- [ ] **Step 3: Validate**

```bash
actionlint .github/workflows/ci-and-release.yml
```

Expected: no errors, no remaining `<PASTE_SHA…>` placeholder.

Sanity-check by searching for the placeholder pattern:

```bash
grep '<PASTE_SHA' .github/workflows/ci-and-release.yml && echo "PLACEHOLDER STILL PRESENT" || echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: publish interviewer-v7 GitHub Release on version bump"
```

---

### Task 5: Add `interviewer_v7_changeset` flag to the `detect` job

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (the `detect:` job, currently lines ~26–112)

- [ ] **Step 1: Add the output declaration**

In the `detect` job's `outputs:` block (currently lines 28–34), add one entry:

```yaml
interviewer_v7_changeset: ${{ steps.flags.outputs.interviewer_v7_changeset }}
```

The final outputs block should be:

```yaml
outputs:
  any_app: ${{ steps.flags.outputs.any_app }}
  docs: ${{ steps.flags.outputs.docs }}
  architect: ${{ steps.flags.outputs.architect }}
  fresco_ui_storybook: ${{ steps.flags.outputs.fresco_ui_storybook }}
  interview_storybook: ${{ steps.flags.outputs.interview_storybook }}
  interview_e2e: ${{ steps.flags.outputs.interview_e2e }}
  interviewer_v7_changeset: ${{ steps.flags.outputs.interviewer_v7_changeset }}
```

- [ ] **Step 2: Add the detection logic to the existing `flags` step**

In the `flags` step's shell script (the one that ends with `} >> "$GITHUB_OUTPUT"`), insert the changeset-detection block BEFORE the final `{ ... } >> "$GITHUB_OUTPUT"` write:

```bash
          # PR-only: detect changeset that touches @codaco/interviewer-v7.
          # Changeset files have YAML frontmatter listing affected packages.
          if [[ "$GITHUB_EVENT_NAME" == "pull_request" ]] && \
             compgen -G '.changeset/*.md' > /dev/null && \
             grep -lE '"?@codaco/interviewer-v7"?[[:space:]]*:' .changeset/*.md > /dev/null 2>&1; then
            interviewer_v7_changeset=true
          else
            interviewer_v7_changeset=false
          fi
```

Then add one more line inside the final `{ ... } >> "$GITHUB_OUTPUT"` block:

```bash
            echo "interviewer_v7_changeset=$interviewer_v7_changeset"
```

The regex matches both `@codaco/interviewer-v7:` and `"@codaco/interviewer-v7":` (quoted form some editors produce). `compgen -G` checks for glob match without erroring when no files exist.

- [ ] **Step 3: Validate**

```bash
actionlint .github/workflows/ci-and-release.yml
```

Expected: no errors.

Locally sanity-check the grep pattern against a real changeset format. Create a scratch file:

```bash
mkdir -p /tmp/cs-test
cat > /tmp/cs-test/sample.md <<'EOF'
---
"@codaco/interviewer-v7": patch
"@codaco/fresco-ui": minor
---

Some change description.
EOF
grep -lE '"?@codaco/interviewer-v7"?[[:space:]]*:' /tmp/cs-test/*.md && echo OK
rm -rf /tmp/cs-test
```

Expected: prints the file path and `OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: flag PRs whose changesets touch interviewer-v7"
```

---

### Task 6: Add the `interviewer-v7-pr-snapshot` job

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (insert a new job after `interviewer-v7-publish:`)

- [ ] **Step 1: Insert the snapshot job**

Add this job to `.github/workflows/ci-and-release.yml`, after `interviewer-v7-publish:`:

```yaml
interviewer-v7-pr-snapshot:
  needs: [detect, quality]
  if: |
    github.event_name == 'pull_request' &&
    needs.detect.outputs.interviewer_v7_changeset == 'true' &&
    needs.quality.result == 'success'
  strategy:
    fail-fast: false
    matrix:
      include:
        - os: macos-latest
          platform: mac
          artifact_name: interviewer-v7-macos-pr-${{ github.event.pull_request.number }}
        - os: windows-latest
          platform: win
          artifact_name: interviewer-v7-windows-pr-${{ github.event.pull_request.number }}
        - os: ubuntu-latest
          platform: linux
          artifact_name: interviewer-v7-linux-pr-${{ github.event.pull_request.number }}
  runs-on: ${{ matrix.os }}
  timeout-minutes: 60
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      with:
        # The merge commit lacks the PR head's changesets after pnpm
        # changeset version runs against it; checking out the PR head
        # directly gives `pnpm changeset version --snapshot` the source
        # files it needs.
        ref: ${{ github.event.pull_request.head.sha }}
    - uses: pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093 # v6.0.8
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
      with:
        path: |
          ~/.cache/electron
          ~/.cache/electron-builder
        key: ${{ runner.os }}-electron-${{ hashFiles('apps/interviewer-v7/package.json') }}
        restore-keys: ${{ runner.os }}-electron-
    - if: matrix.os == 'ubuntu-latest'
      uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
      with:
        path: .turbo
        key: ${{ runner.os }}-turbo-${{ github.sha }}
        restore-keys: ${{ runner.os }}-turbo-
    - name: Bump versions to PR snapshot
      env:
        PR_NUMBER: ${{ github.event.pull_request.number }}
        PR_SHA: ${{ github.event.pull_request.head.sha }}
      run: |
        short_sha=${PR_SHA:0:7}
        tag="pr-${PR_NUMBER}-${short_sha}"
        pnpm exec changeset version --snapshot "$tag"
        # Show the resulting version for the build log.
        node -p "require('./apps/interviewer-v7/package.json').version"
    - name: Build workspace dependencies
      run: pnpm exec turbo run build --filter=@codaco/interviewer-v7^...
    - name: Decode App Store Connect API key
      if: matrix.os == 'macos-latest'
      env:
        APPLE_API_KEY_B64: ${{ secrets.APPLE_API_KEY }}
      run: |
        key_path="${RUNNER_TEMP}/AuthKey.p8"
        printf '%s' "$APPLE_API_KEY_B64" | base64 --decode > "$key_path"
        echo "APPLE_API_KEY=${key_path}" >> "$GITHUB_ENV"
    - name: Build Electron app (${{ matrix.platform }})
      working-directory: apps/interviewer-v7
      env:
        APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
        APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
        CSC_LINK: ${{ matrix.os == 'macos-latest' && secrets.CSC_LINK || '' }}
        CSC_KEY_PASSWORD: ${{ matrix.os == 'macos-latest' && secrets.CSC_KEY_PASSWORD || '' }}
      run: pnpm electron:dist:${{ matrix.platform }}
    - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
      with:
        name: ${{ matrix.artifact_name }}
        path: apps/interviewer-v7/release-builds/*
        if-no-files-found: error
        retention-days: 14
```

Why each piece:

- `needs: [detect, quality]` + `needs.quality.result == 'success'` — only snapshot builds for PRs whose lint/typecheck/tests passed. Wasting macOS minutes on a broken PR is bad economics.
- `ref: github.event.pull_request.head.sha` — `pull_request` events default to checking out the synthetic merge commit. The merge commit shouldn't differ for our purposes, but pinning to head sha is what the version string already encodes, and avoids any merge-commit weirdness if main moves underneath the PR.
- `pnpm exec changeset version --snapshot "$tag"` — `@changesets/cli` is in repo devDependencies. Snapshot mode bumps `package.json` versions of all packages mentioned in any changeset, using `<basever>-<tag>.0` format. The mutation is in-tree only; we never commit it.
- Artifact name includes the PR number for easier discovery in the workflow run UI when multiple PRs are open.
- Same notarization wiring as the release path. Per the spec, snapshots ARE notarized — testers get an installer they don't need to right-click-open.

- [ ] **Step 2: Validate**

```bash
actionlint .github/workflows/ci-and-release.yml
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: build interviewer-v7 PR snapshot when changeset touches the app"
```

---

## End-to-end verification (after all tasks complete)

These steps can't be done in isolation; run them once the branch is pushed and you have access to the PR / main.

- [ ] **Verify the workflow parses on GitHub**

Push the branch and confirm GitHub doesn't flag a parse error. If it does, fix and re-push.

- [ ] **Verify the PR snapshot path**

Create a throwaway changeset that touches `@codaco/interviewer-v7`:

```bash
mkdir -p .changeset
cat > .changeset/test-interviewer-v7-snapshot.md <<'EOF'
---
"@codaco/interviewer-v7": patch
---

Test snapshot build.
EOF
git add .changeset/test-interviewer-v7-snapshot.md
git commit -m "test: trigger interviewer-v7 PR snapshot"
git push
```

Open or update the PR. Confirm:

- `detect.outputs.interviewer_v7_changeset` resolves to `true` (visible in the workflow run logs).
- `interviewer-v7-pr-snapshot` runs after `quality` and `detect`.
- All three matrix legs (mac/win/linux) produce artifacts visible on the workflow run page.
- The macOS artifact's `.dmg` contains a notarized app (verify via `spctl -a -t open --context context:primary-signature -vvv <Interviewer.app>` after download).
- Artifact filenames include the snapshot version: e.g. `Network Canvas Interviewer v7-7.0.0-pr-42-abc1234.0-arm64.dmg`.

Delete the throwaway changeset before merging.

- [ ] **Verify the production release path**

Add a real changeset for the next intended release and let the standard flow run:

1. Push a changeset describing the change (`pnpm changeset`).
2. Merge to main → `changesets/action` opens a "Version Packages" PR.
3. Merge the version PR.
4. On the resulting main push, confirm `release.outputs.interviewer_v7_released == 'true'` (visible in the workflow logs).
5. `interviewer-v7-build` matrix runs.
6. `interviewer-v7-publish` creates a GitHub Release at `interviewer-v7@v<version>` with all platform binaries attached.

- [ ] **Verify the local-build escape hatch**

On the implementation branch, run from `apps/interviewer-v7/`:

```bash
pnpm electron:dist:mac
```

Expected: build completes WITHOUT invoking notarytool (no "Notarizing…" log line). Skips notarization because `APPLE_API_KEY` isn't set locally. If you have a Developer ID cert installed, the app is signed but not notarized.

---

## Self-review notes

Spec coverage:

- Notarization gate on `APPLE_API_KEY` → Task 1.
- `release` job emits outputs after version diff → Task 2.
- Three-platform matrix on release → Task 3.
- GitHub Release at `interviewer-v7@v<version>` → Task 4.
- PR snapshot via changeset detection → Tasks 5 + 6.
- Electron cache → Tasks 3 + 6.
- No new workflow file → confirmed (all edits to `ci-and-release.yml`).

Risks flagged for the implementer:

- The `softprops/action-gh-release@v2` SHA isn't pinned in this plan; Step 1 of Task 4 derives it. If `gh` isn't authed, the engineer must do the lookup another way (browse the Releases page, or `git ls-remote`).
- `pnpm electron:dist:win` on Windows runners occasionally hits MSBuild / node-gyp issues during the postinstall `electron-builder install-app-deps` step. The action runs in PowerShell by default — if a step needs bash semantics on Windows, prefix with `shell: bash`. None of the steps in this plan use Windows-specific shell forms; `pnpm`, `node`, and `git` work identically.
- `electron-builder install-app-deps` rebuilds `better-sqlite3-multiple-ciphers` against the runner's Electron ABI. If a future Electron upgrade drops a prebuilt for Linux glibc on `ubuntu-latest`, the build will fail with a gyp link error. Pin runner version (e.g. `ubuntu-24.04`) before that becomes a concern; outside scope of this plan.
