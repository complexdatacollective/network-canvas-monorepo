# Legacy interviewer & architect — monorepo integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `network-canvas-interviewer` (`apps/interviewer`) and `network-canvas-architect` (`apps/architect`) first-class participants in every monorepo workflow — the `build`/`test`/`typecheck` turbo runs, the `//#knip` gate (fully purged to zero findings), changeset versioning, and CI release automation.

**Architecture:** Five phases. (1) Remove the `--filter` exclusions so the quality gate runs the apps. (2) Fix turbo cache inputs and delete dead per-app lint scripts. (3) Full knip dead-code purge driven by `knip --fix`, gated by build+test+lint+smoke-run with false-positive restoration. (4) Add CI release-trigger detection + per-platform Electron build/publish jobs that degrade gracefully without a cross-repo token. (5) Final whole-gate verification.

**Tech Stack:** pnpm workspaces, turbo, oxlint/oxfmt, knip 6.15.0 (`--fix`/`--allow-remove-files`), electron-vite, electron-builder, GitHub Actions, changesets.

**Spec:** `docs/superpowers/specs/2026-06-08-legacy-apps-monorepo-integration-design.md`

**Branch:** `legacy-apps-ci-integration` (already created; work directly on it — no worktree).

**Decisions (from spec):** full release automation · keep each app's existing electron-builder publish target (separate repos) · independent versioning · release-on-main only · **knip: full purge to green now**.

---

## Key reference facts (verified during planning)

- Both apps are **plain JS** (`.js`/`.jsx`), no `tsconfig`, no `typecheck` script → `typecheck` is a no-op turbo skips.
- Both **build and test green today** (interviewer: 79 files/411 tests; both `electron-vite build` exit 0).
- `//#lint` (oxlint+oxfmt) **already covers** both apps globally; oxlint `no-unused-vars`/`typescript/no-unused-vars` are **`error`** — relevant because removing an `export` keyword can leave an unused local that oxlint then rejects.
- **knip entry-graph fix (verified):** pointing the renderer entry at `src/index.jsx!` directly (NOT relying on `index.html` traversal) drops false-positive unused files from **151 → 59**.
- **knip full report for the two apps:** 59 unused files · 3 unused deps · 53 unused devDeps · 3 unlisted deps · 1 unlisted binary (`biome`) · 317 unused exports · 5 duplicate exports.
- **Known knip false-positives** (must be restored + ignored, never deleted): `apps/interviewer/src/shims/react-resize-aware.js` (wired only via a vite `resolve.alias`, so knip can't see it). Treat any file referenced only through an `electron.vite.config.js` alias the same way.
- The unlisted `biome` binary comes from architect's dead `lint`/`lint:fix` scripts — removing them (Task 4) resolves that finding.
- turbo already wires `network-canvas-architect#build` → `dependsOn network-canvas-interviewer#build` (architect embeds interviewer's renderer dist via its `copy-interviewer` prebuild). An explicit task-dep fires regardless of `--filter`; `--filter=…^...` would NOT pull interviewer in (no `workspace:*` dep).

---

## Phase 1 — Quality-gate inclusion

### Task 1: Remove build/test/typecheck filters from root scripts

**Files:**

- Modify: `package.json` (root) — `build`, `test`, `test:watch`, `typecheck` scripts

- [ ] **Step 1: Edit the four scripts**

Remove `--filter=!network-canvas-interviewer --filter=!network-canvas-architect` from each. Result:

```jsonc
"build": "turbo run build",
"test": "turbo run test",
"test:watch": "turbo watch test:watch",
"typecheck": "turbo run typecheck --continue",
```

- [ ] **Step 2: Verify typecheck (no-op for the apps, must stay green)**

Run: `pnpm typecheck`
Expected: PASS. The two apps have no `typecheck` task so turbo skips them; everything else typechecks as before.

- [ ] **Step 3: Verify tests now include the legacy apps**

Run: `pnpm test 2>&1 | tail -20`
Expected: PASS, and the task list now includes `network-canvas-interviewer:test` and `network-canvas-architect:test` (interviewer reports 79 files / 411 passed).

- [ ] **Step 4: Verify build now includes the legacy apps**

Run: `pnpm build 2>&1 | tail -15`
Expected: PASS, task list includes both `network-canvas-*:build` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "build: include legacy interviewer/architect in build/test/typecheck"
```

### Task 2: Remove the filters from the CI quality gate

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` — `quality` job, "Run all gates" step (around lines 173-177)

- [ ] **Step 1: Edit the gate command**

Replace:

```yaml
- name: Run all gates
  run: |
    pnpm exec turbo run //#lint //#knip typecheck build test \
      --filter='!network-canvas-interviewer' \
      --filter='!network-canvas-architect'
```

with:

```yaml
- name: Run all gates
  run: |
    pnpm exec turbo run //#lint //#knip typecheck build test
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `npx --yes actionlint .github/workflows/ci-and-release.yml`
Expected: no errors. (If `actionlint` is unavailable, fall back to `node -e "require('js-yaml')"` parse or `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci-and-release.yml'))"` → no exception.)

- [ ] **Step 3: Locally run the gate minus knip (knip is purged in Phase 3)**

Run: `pnpm exec turbo run //#lint typecheck build test`
Expected: PASS for all (knip excluded here only because Phase 3 hasn't run yet).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: run quality gate over legacy interviewer/architect"
```

---

## Phase 2 — Turbo cache + lint-script cleanup

### Task 3: Fix `network-canvas-architect#build` cache inputs

**Files:**

- Modify: `turbo.json` — `network-canvas-architect#build.inputs`

- [ ] **Step 1: Add architect's real entry/config files to `inputs`**

The current `inputs` omit architect's renderer html, electron main/preload sources (under `public/`), and babel/postcss configs. Update to:

```jsonc
"network-canvas-architect#build": {
  "dependsOn": ["^build", "network-canvas-interviewer#build"],
  "inputs": [
    "src/**",
    "public/**",
    "index.html",
    "scripts/**",
    "babel.config.*",
    "postcss.config.*",
    "electron.vite.config.*",
    "electron-builder.config.*",
    "package.json"
  ],
  "outputs": ["out/**", "dist/**"]
}
```

(`tsconfig*.json` is dropped — architect has none.)

- [ ] **Step 2: Verify the build still succeeds and is cacheable**

Run: `pnpm exec turbo run build --filter=network-canvas-architect 2>&1 | tail -8`
Expected: PASS (builds `network-canvas-interviewer` first, then architect).

- [ ] **Step 3: Verify cache invalidation responds to `public/`**

Run: `pnpm exec turbo run build --filter=network-canvas-architect` again → expect `FULL TURBO`/cached. Then `touch apps/architect/public/electron-starter.js` and re-run → expect a cache **miss** (rebuild). Revert the touch with `git checkout apps/architect/public/electron-starter.js` (it is tracked; no untracked files involved).

- [ ] **Step 4: Commit**

```bash
git add turbo.json
git commit -m "build(turbo): track architect public/ + config inputs for cache correctness"
```

### Task 4: Remove dead per-app lint scripts

**Files:**

- Modify: `apps/architect/package.json` — `scripts`
- Modify: `apps/interviewer/package.json` — `scripts`

- [ ] **Step 1: Architect — drop the biome scripts, repoint preflight**

`@biomejs/biome` is not a dependency and there is no root `biome.json`; these are pre-oxlint leftovers (and the source of knip's unlisted `biome` binary). In `apps/architect/package.json`:

- Delete `"lint": "biome check ."`.
- Delete `"lint:fix": "biome check . --write"`.
- Change `"preflight": "pnpm run lint && pnpm test"` → `"preflight": "oxlint . && vitest run"`.

- [ ] **Step 2: Interviewer — repoint preflight**

Interviewer's `preflight` calls a non-existent `lint` script. In `apps/interviewer/package.json`:

- Change `"preflight": "npm run lint && npm test -- --coverage"` → `"preflight": "oxlint . && vitest run --coverage"`.

- [ ] **Step 3: Verify preflight runs (oxlint over the app + tests)**

Run: `pnpm --filter network-canvas-architect run preflight 2>&1 | tail -15`
Expected: oxlint reports (warnings allowed; **no errors**), then vitest PASS. Repeat for `network-canvas-interviewer`.
If oxlint reports pre-existing **errors** in these apps, STOP and report them — they were always present (the apps are globally linted) and indicate an unrelated issue to surface, not silence.

- [ ] **Step 4: Commit**

```bash
git add apps/architect/package.json apps/interviewer/package.json
git commit -m "chore: remove dead biome lint scripts, repoint preflight to oxlint"
```

---

## Phase 3 — knip full purge

> The branch's CI `//#knip` will be red from Task 5 until Task 9 closes it green. That is expected on a feature branch and fine; do not merge mid-phase.

### Task 5: Apply the knip config (entry-graph fix + un-ignore)

**Files:**

- Modify: `knip.json`

- [ ] **Step 1: Remove the `ignoreWorkspaces` line**

Delete `"ignoreWorkspaces": ["apps/interviewer", "apps/architect"],` from `knip.json`.

- [ ] **Step 2: Add the two workspace configs**

Insert before the `"apps/interviewer-v7"` entry in `workspaces` (entries use the verified `src/index.jsx!` renderer entry — NOT `index.html`):

```jsonc
    "apps/interviewer": {
      "entry": [
        "src/index.jsx!",
        "src/main/index.js!",
        "src/preload/index.js!",
        "electron.vite.config.js"
      ],
      "project": ["src/**/*.{js,jsx}"],
      "paths": { "@/*": ["./src/*"] }
    },
    "apps/architect": {
      "entry": [
        "src/index.jsx!",
        "public/electron-starter.js!",
        "public/preload/appPreload.js!",
        "public/preload/summaryPreload.js!",
        "electron.vite.config.js",
        "electron-builder.config.js"
      ],
      "project": ["src/**/*.{js,jsx}"],
      "paths": {
        "@app/*": ["./src/*"],
        "@components/*": ["./src/components/*"],
        "@selectors/*": ["./src/selectors/*"],
        "@hooks/*": ["./src/hooks/*"],
        "@modules/*": ["./src/ducks/modules/*"],
        "@utils/*": ["./src/utils/*"]
      }
    },
```

(`vitest.config.js` is intentionally omitted from `entry` — knip auto-detects it and flagged it as a redundant pattern during planning.)

- [ ] **Step 3: Capture the baseline residual**

Run: `pnpm knip > /tmp/knip-legacy-baseline.txt 2>&1; grep -E "^(Unused|Unlisted|Duplicate)" /tmp/knip-legacy-baseline.txt`
Expected (approximately): `Unused files (59)`, `Unused dependencies (3)`, `Unused devDependencies (53)`, `Unlisted dependencies (3)`, `Unlisted binaries (1)`, `Unused exports (317)`, `Duplicate exports (5)`. This is the inventory the rest of Phase 3 drives to zero.

- [ ] **Step 4: Commit the config (knip still red)**

```bash
git add knip.json
git commit -m "knip: analyze legacy interviewer/architect (entry-graph fix; purge follows)"
```

### Task 6: Resolve dependency findings (unused + unlisted + binary)

**Files:**

- Modify: `apps/architect/package.json`, `apps/interviewer/package.json`

- [ ] **Step 1: Add the 3 unlisted dependencies to architect**

knip reports these used-but-undeclared in architect (`babel.config.js`, `scripts/generate-app-icons.js`). Add to `apps/architect/package.json` `devDependencies` (versions: copy the exact specifiers already present in `apps/interviewer/package.json` for the two babel plugins; use `^5.4.1` for chalk to match the repo, or the latest the lockfile resolves):

- `@babel/plugin-syntax-import-meta`
- `@babel/plugin-proposal-json-strings`
- `chalk`

- [ ] **Step 2: Autofix unused dependencies**

Run: `pnpm exec knip --include dependencies --fix --format`
This removes knip-confirmed unused deps from both `package.json` files. Then:

Run: `pnpm install`
Expected: lockfile updates, install succeeds.

- [ ] **Step 3: Verify build + test; restore false-positive removals**

Run: `pnpm exec turbo run build test --filter=network-canvas-interviewer --filter=network-canvas-architect 2>&1 | tail -20`
Expected: PASS.
**If build/test breaks**, a polyfill/runtime dep was wrongly removed (likely candidates: `crypto-browserify`, `stream-browserify`, `buffer`, `regenerator-runtime`, `whatwg-fetch` — referenced via `electron.vite.config.js` or runtime, not direct imports). For each: `git checkout <package.json>` to restore that one entry (or re-add it), add its name to that workspace's `ignoreDependencies` in `knip.json` with a trailing comment explaining the indirect use, then `pnpm install` and re-verify.

- [ ] **Step 4: Confirm dependency/unlisted/binary findings are zero**

Run: `pnpm exec knip --include dependencies,unlisted,binaries 2>&1 | tail -5`
Expected: no dependency/unlisted/binary issues (the `biome` binary was removed in Task 4).

- [ ] **Step 5: Commit**

```bash
git add apps/architect/package.json apps/interviewer/package.json knip.json pnpm-lock.yaml
git commit -m "knip: remove unused deps, declare unlisted deps in legacy apps"
```

### Task 7: Resolve unused + duplicate exports

**Files:**

- Modify: many `apps/{interviewer,architect}/src/**/*.{js,jsx}` (driven by autofix)

- [ ] **Step 1: Autofix exports**

Run: `pnpm exec knip --include exports,nsExports,types,nsTypes,duplicates --fix --format`
This strips the `export` keyword from unused exports and resolves duplicate exports across both apps.

- [ ] **Step 2: Clean up newly-unused locals that oxlint now rejects**

Removing an `export` can leave a symbol that is unused in its file → oxlint `no-unused-vars` (an **error**).

Run: `pnpm exec oxlint --fix`
Then run: `pnpm exec oxlint apps/interviewer apps/architect 2>&1 | tail -30`
Expected: no **errors** (warnings OK). For any remaining `no-unused-vars`/`typescript/no-unused-vars` **errors**, delete the now-dead local declaration by hand (it is genuinely unreachable — knip proved the export had no importer and oxlint proves it has no in-file use).

- [ ] **Step 3: Verify build + test**

Run: `pnpm exec turbo run build test --filter=network-canvas-interviewer --filter=network-canvas-architect 2>&1 | tail -20`
Expected: PASS. If a JSX-in-`.js` parse issue surfaces in architect (its build uses an esbuild `.js: jsx` loader), the failure will be a build error pointing at the file — restore that file's export via `git checkout <file>` and add the symbol's file to the workspace `ignore` if knip mis-parsed it.

- [ ] **Step 4: Confirm export findings are zero**

Run: `pnpm exec knip --include exports,nsExports,types,nsTypes,duplicates 2>&1 | tail -5`
Expected: no export issues.

- [ ] **Step 5: Commit**

```bash
git add -A apps/interviewer/src apps/architect/src knip.json
git commit -m "knip: remove unused/duplicate exports in legacy apps"
```

### Task 8: Remove unused files (with false-positive restoration)

**Files:**

- Delete: unused `apps/{interviewer,architect}/src/**` files
- Modify: `knip.json` (restore-list as `entry`/`ignore`)

- [ ] **Step 1: Pre-register the known vite-alias false-positive**

In `knip.json`, add to the `apps/interviewer` workspace config:

```jsonc
      "ignore": ["src/shims/react-resize-aware.js"]
```

(referenced only via `electron.vite.config.js` `resolve.alias`; knip cannot see it and must not delete it).

- [ ] **Step 2: Autofix file removals**

Run: `pnpm exec knip --include files --fix --allow-remove-files`
This deletes knip-confirmed unused files. Capture what was deleted: `git status --short | grep '^ D'`.

- [ ] **Step 3: Verify build + test**

Run: `pnpm exec turbo run build test --filter=network-canvas-interviewer --filter=network-canvas-architect 2>&1 | tail -20`
Expected: PASS.
**If anything breaks**, a file reachable only at runtime (or via a config alias) was deleted. Restore it: `git checkout <deleted-file>`, and add it to that workspace's `entry` (if it is a genuine entry, e.g. an electron-vite alias target or a dynamically-imported module) or `ignore` (if it is intentionally kept). Re-run.

- [ ] **Step 4: Iterate to a fixpoint**

Deleting files can orphan their former dependencies. Re-run: `pnpm exec knip --include files --fix --allow-remove-files`, verify build+test, repeat until `pnpm exec knip --include files` reports nothing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "knip: delete dead files in legacy apps (vite-alias shims preserved)"
```

### Task 9: Converge knip to zero + smoke-run both apps

**Files:** none (verification + any final `knip.json` ignores)

- [ ] **Step 1: Full knip run must be clean**

Run: `pnpm knip 2>&1 | tail -10`
Expected: no issues reported, exit 0. Resolve any stragglers via the same rules (delete if dead, `ignore`/`ignoreDependencies` with a comment if a proven false-positive).

- [ ] **Step 2: Smoke-run interviewer (unit tests do not cover most UI files)**

Run: `pnpm --filter network-canvas-interviewer run build` then launch the built app:
`pnpm --filter network-canvas-interviewer exec electron-vite preview`
Verify the renderer loads, the Start screen renders, and the DevTools console shows **no module-not-found / undefined-component errors**. Kill the process when done (per environment guidance: `pkill -f electron-vite` and free port 3000 before any restart).

- [ ] **Step 3: Smoke-run architect**

Run: `pnpm --filter network-canvas-architect run build` then `pnpm --filter network-canvas-architect exec electron-vite preview`. Verify the Home screen renders and the console is clean. Kill the process when done.
**If either smoke-run reveals a missing module/component**, the purge removed something used only at runtime: `git checkout` the file/export, add it to `entry`/`ignore` in `knip.json` with a comment, and re-run `pnpm knip` to confirm still-green.

- [ ] **Step 4: Commit any final config/restorations**

```bash
git add -A
git commit -m "knip: legacy apps purged to zero findings; smoke-verified"
```

---

## Phase 4 — Release automation

### Task 10: Add version-bump detectors to the `release` job

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` — `release` job `outputs:` and steps (model on the existing `detect_interviewer_v7` step, ~lines 690-747)

- [ ] **Step 1: Extend the `release` job outputs**

Under `release.outputs:` (which already has `interviewer_v7_*`), add:

```yaml
interviewer_released: ${{ steps.detect_interviewer.outputs.released }}
interviewer_version: ${{ steps.detect_interviewer.outputs.version }}
architect_released: ${{ steps.detect_architect.outputs.released }}
architect_version: ${{ steps.detect_architect.outputs.version }}
```

- [ ] **Step 2: Add two detector steps**

After the existing `Detect interviewer-v7 version bump` step, add two steps mirroring it (the `release` checkout already uses `fetch-depth: 2`, so `HEAD^` is available):

```yaml
- name: Detect interviewer version bump
  id: detect_interviewer
  env:
    PKG_JSON: apps/interviewer/package.json
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
    else
      echo "released=false" >> "$GITHUB_OUTPUT"
      echo "version=" >> "$GITHUB_OUTPUT"
    fi
- name: Detect architect version bump
  id: detect_architect
  env:
    PKG_JSON: apps/architect/package.json
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
    else
      echo "released=false" >> "$GITHUB_OUTPUT"
      echo "version=" >> "$GITHUB_OUTPUT"
    fi
```

- [ ] **Step 3: Validate YAML**

Run: `npx --yes actionlint .github/workflows/ci-and-release.yml`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci(release): detect legacy interviewer/architect version bumps"
```

### Task 11: Add the Electron build/publish matrix jobs

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` — add two new jobs after `interviewer-v7-publish`

- [ ] **Step 1: Add `interviewer-release-build`**

Model on `interviewer-v7-build` (full install — no `--ignore-scripts` — for native rebuilds; electron+turbo caches). Publish is conditional on the new `LEGACY_RELEASE_GH_TOKEN` secret so the job never hard-fails before the token exists:

```yaml
interviewer-release-build:
  needs: release
  if: needs.release.outputs.interviewer_released == 'true'
  strategy:
    fail-fast: false
    matrix:
      include:
        - os: macos-latest
          platform: mac
        - os: windows-latest
          platform: win
        - os: ubuntu-latest
          platform: linux
  runs-on: ${{ matrix.os }}
  timeout-minutes: 60
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
    - uses: pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093 # v6.0.8
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - if: matrix.os == 'ubuntu-latest'
      uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
      with:
        path: .turbo
        key: ${{ runner.os }}-turbo-${{ github.sha }}
        restore-keys: ${{ runner.os }}-turbo-
    - name: Build app + workspace deps
      run: pnpm exec turbo run build --filter=network-canvas-interviewer
    - name: Decode App Store Connect API key
      if: matrix.os == 'macos-latest'
      env:
        APPLE_API_KEY_B64: ${{ secrets.APPLE_API_KEY }}
      run: |
        key_path="${RUNNER_TEMP}/AuthKey.p8"
        printf '%s' "$APPLE_API_KEY_B64" | base64 --decode > "$key_path"
        echo "APPLE_API_KEY=${key_path}" >> "$GITHUB_ENV"
    - name: Package (+ publish when token present)
      working-directory: apps/interviewer
      env:
        GH_TOKEN: ${{ secrets.LEGACY_RELEASE_GH_TOKEN }}
        APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
        APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
        CSC_LINK: ${{ matrix.os == 'macos-latest' && secrets.CSC_LINK || '' }}
        CSC_KEY_PASSWORD: ${{ matrix.os == 'macos-latest' && secrets.CSC_KEY_PASSWORD || '' }}
      run: |
        if [[ -n "$GH_TOKEN" ]]; then
          pnpm exec electron-builder --${{ matrix.platform }} --publish always
        else
          echo "LEGACY_RELEASE_GH_TOKEN not set — building without publishing."
          pnpm exec electron-builder --${{ matrix.platform }} --publish never
        fi
    - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
      with:
        name: interviewer-${{ matrix.platform }}
        path: apps/interviewer/release-builds/*
        if-no-files-found: error
        retention-days: 30
```

- [ ] **Step 2: Add `architect-release-build`**

Same shape as Task 11 Step 1, gated on the architect flag. Key differences: builds with `--filter=network-canvas-architect` (turbo builds interviewer first via the task-dep, satisfying `copy-interviewer`); `working-directory: apps/architect`; electron-builder takes architect's `--config` file. Full job:

```yaml
architect-release-build:
  needs: release
  if: needs.release.outputs.architect_released == 'true'
  strategy:
    fail-fast: false
    matrix:
      include:
        - os: macos-latest
          platform: mac
        - os: windows-latest
          platform: win
        - os: ubuntu-latest
          platform: linux
  runs-on: ${{ matrix.os }}
  timeout-minutes: 60
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
    - uses: pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093 # v6.0.8
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - if: matrix.os == 'ubuntu-latest'
      uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
      with:
        path: .turbo
        key: ${{ runner.os }}-turbo-${{ github.sha }}
        restore-keys: ${{ runner.os }}-turbo-
    - name: Build app + workspace deps
      run: pnpm exec turbo run build --filter=network-canvas-architect
    - name: Decode App Store Connect API key
      if: matrix.os == 'macos-latest'
      env:
        APPLE_API_KEY_B64: ${{ secrets.APPLE_API_KEY }}
      run: |
        key_path="${RUNNER_TEMP}/AuthKey.p8"
        printf '%s' "$APPLE_API_KEY_B64" | base64 --decode > "$key_path"
        echo "APPLE_API_KEY=${key_path}" >> "$GITHUB_ENV"
    - name: Package (+ publish when token present)
      working-directory: apps/architect
      env:
        GH_TOKEN: ${{ secrets.LEGACY_RELEASE_GH_TOKEN }}
        APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
        APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
        CSC_LINK: ${{ matrix.os == 'macos-latest' && secrets.CSC_LINK || '' }}
        CSC_KEY_PASSWORD: ${{ matrix.os == 'macos-latest' && secrets.CSC_KEY_PASSWORD || '' }}
      run: |
        if [[ -n "$GH_TOKEN" ]]; then
          pnpm exec electron-builder --${{ matrix.platform }} --config electron-builder.config.js --publish always
        else
          echo "LEGACY_RELEASE_GH_TOKEN not set — building without publishing."
          pnpm exec electron-builder --${{ matrix.platform }} --config electron-builder.config.js --publish never
        fi
    - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
      with:
        name: architect-${{ matrix.platform }}
        path: apps/architect/release-builds/*
        if-no-files-found: error
        retention-days: 30
```

- [ ] **Step 3: Validate YAML**

Run: `npx --yes actionlint .github/workflows/ci-and-release.yml`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci(release): per-platform Electron build/publish for legacy apps"
```

---

## Phase 5 — Final verification

### Task 12: Whole-gate run + spec status

**Files:**

- Modify: `docs/superpowers/specs/2026-06-08-legacy-apps-monorepo-integration-design.md` (status)

- [ ] **Step 1: Run the exact CI quality-gate command locally**

Run: `pnpm exec turbo run //#lint //#knip typecheck build test`
Expected: every task PASS, including `//#knip` (now zero findings) and both legacy apps' build+test.

- [ ] **Step 2: Confirm changeset eligibility (no code change — verification only)**

Run: `pnpm exec changeset status --since=main 2>&1 | tail -20` (or `pnpm changeset` and abort before writing). Confirm `network-canvas-interviewer` and `network-canvas-architect` appear as selectable packages. They are already eligible (workspace members, `private:true`, not in `ignore`); the release trigger added in Phase 4 is what connects a bump to an Electron build.

- [ ] **Step 3: Update the spec status**

Change the spec header `**Status:** Approved design` → `**Status:** Implemented`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-08-legacy-apps-monorepo-integration-design.md
git commit -m "docs: mark legacy-apps integration spec implemented"
```

- [ ] **Step 5: Final summary to the user**

Report: gate green; knip purged to zero (note any `ignore`/`ignoreDependencies` entries added and why, and the count of files/exports removed); release jobs wired with conditional publish; and the one outstanding action — provisioning the `LEGACY_RELEASE_GH_TOKEN` secret to enable actual publishing to the external repos.

---

## Self-review notes

- **Spec coverage:** Part A → Tasks 1,2,5; Part B → Task 3; Part C → Tasks 10,11; Part D → Task 4; knip "full purge" decision → Tasks 5-9; changeset → Task 12 Step 2. All covered.
- **Known risks surfaced in-plan:** dependency autofix false-positives (Task 6 Step 3), JSX-in-`.js` parser issues for architect (Task 7 Step 3), runtime-only file deletions (Task 8 Step 3 + smoke-run Task 9), red-on-branch knip window (Phase 3 note).
- **Open prerequisite:** `LEGACY_RELEASE_GH_TOKEN` secret — design degrades gracefully without it (Task 11 conditional publish); surfaced in Task 12 Step 5.
