# CI efficiency redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate network-canvas CI into a single `ci-and-release.yml` workflow that uses `.turbo` cache via `actions/cache@v4`, runs all PR gates in one combined `turbo run`, and uses `turbo-ignore` for change detection driven by the workspace dep graph.

**Architecture:** One workflow file with explicit `needs:` chaining. A `detect` job runs `turbo-ignore` per package and outputs flags. A `quality` job runs lint/knip/typecheck/build/test in one `turbo run` invocation. Downstream jobs (`deploy-netlify`, `chromatic-*`, `interview-e2e`, `release`) declare `needs: [quality, detect]` so they read a warm Turbo cache and respect detection flags. Four standalone workflow files and one custom build script are deleted; Netlify auto-build is disabled per-site at cutover.

**Tech Stack:** GitHub Actions (workflow YAML), pnpm 10, Turbo 2.x (`turbo-ignore` CLI), actionlint, `netlify-cli`, `chromatic` CLI, `@jthrilly/dead-link-checker`, Playwright (Docker-driven, unchanged).

**Spec reference:** `docs/superpowers/specs/2026-05-13-ci-efficiency-design.md`

---

### Task 1: Tooling preflight

**Files:** none — local environment + GitHub UI work.

- [ ] **Step 1: Install `actionlint` locally**

Install via Homebrew (macOS):

```bash
brew install actionlint
```

Or via Go:

```bash
go install github.com/rhysd/actionlint/cmd/actionlint@latest
```

Verify:

```bash
actionlint --version
```

Expected: prints a version (≥ 1.7).

- [ ] **Step 2: Verify pnpm and Turbo versions**

```bash
pnpm --version
pnpm exec turbo --version
```

Expected: pnpm ≥ 10.0.0, turbo ≥ 2.9.6. Node version (`.nvmrc`) is `v24.11.1` — verify your local node matches:

```bash
node --version
```

If it doesn't match, switch via `nvm use` or your equivalent. CI uses `actions/setup-node` with `node-version-file: '.nvmrc'`, so this is local-dev convenience only.

- [ ] **Step 3: Create the feature branch**

```bash
git checkout main
git pull
git checkout -b ci/efficiency-redesign
```

- [ ] **Step 4: Baseline turbo dry-run (sanity check)**

```bash
pnpm exec turbo run build --dry-run=json --filter=@codaco/shared-consts > /tmp/turbo-baseline.json
jq '.tasks | length' /tmp/turbo-baseline.json
```

Expected: prints `1` (just the shared-consts build, no deps to build).

---

### Task 2: Update `turbo.json` — add `//#lint`, `//#knip`, `build-storybook`; tighten `build` inputs

**Files:**
- Modify: `turbo.json`

- [ ] **Step 1: Replace `turbo.json` contents**

Overwrite `turbo.json` with:

```jsonc
{
	"$schema": "https://turbo.build/schema.json",
	"ui": "tui",
	"tasks": {
		"build": {
			"dependsOn": ["^build"],
			"inputs": [
				"src/**",
				"tsconfig*.json",
				"vite.config.*",
				"electron.vite.config.*",
				"next.config.*",
				"package.json",
				"pnpm-lock.yaml"
			],
			"outputs": ["dist/**", "out/**", ".next/**", "!.next/cache/**"]
		},
		"network-canvas-architect#build": {
			"dependsOn": ["^build", "network-canvas-interviewer#build"],
			"inputs": [
				"src/**",
				"scripts/**",
				"tsconfig*.json",
				"electron.vite.config.*",
				"electron-builder.config.*",
				"package.json"
			],
			"outputs": ["out/**", "dist/**"]
		},
		"@codaco/tailwind-config#build": {
			"dependsOn": ["^build"],
			"inputs": ["shared/plugins/**/*.ts", "tsconfig*.json", "package.json"],
			"outputs": ["shared/plugins/**/*.js"]
		},
		"build-storybook": {
			"dependsOn": ["^build"],
			"inputs": [
				"src/**",
				".storybook/**",
				"stories/**",
				"package.json",
				"tsconfig*.json"
			],
			"outputs": ["storybook-static/**"]
		},
		"//#lint": {
			"inputs": [
				"**/*.{ts,tsx,js,jsx,mjs,cjs,json}",
				"biome.json",
				"!**/dist/**",
				"!**/out/**",
				"!**/.next/**",
				"!**/storybook-static/**",
				"!**/node_modules/**"
			],
			"outputs": []
		},
		"//#knip": {
			"inputs": [
				"**/*.{ts,tsx,js,jsx,mjs,cjs}",
				"**/package.json",
				"knip.json",
				"pnpm-workspace.yaml",
				"pnpm-lock.yaml",
				"!**/dist/**",
				"!**/out/**",
				"!**/.next/**",
				"!**/node_modules/**"
			],
			"outputs": []
		},
		"dev": {
			"dependsOn": ["^build"],
			"cache": false,
			"persistent": true
		},
		"test": {
			"dependsOn": ["^build"],
			"inputs": ["src/**", "__tests__/**", "vitest.config.*", "package.json"],
			"outputs": []
		},
		"test:watch": {
			"cache": false,
			"persistent": true
		},
		"test:e2e": {
			"dependsOn": ["build"],
			"cache": false
		},
		"test:e2e:headed": {
			"dependsOn": ["build"],
			"cache": false
		},
		"typecheck": {
			"dependsOn": ["^build"],
			"inputs": ["src/**", "tsconfig*.json", "package.json"],
			"outputs": []
		}
	}
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('turbo.json','utf8'))" && echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Verify Turbo recognises the new tasks**

```bash
pnpm exec turbo run //#lint --dry-run=json | jq '.tasks | length'
```

Expected: `1`.

```bash
pnpm exec turbo run //#knip --dry-run=json | jq '.tasks | length'
```

Expected: `1`.

```bash
pnpm exec turbo run build-storybook --dry-run=json --filter=@codaco/fresco-ui | jq -r '.tasks[].taskId' | sort
```

Expected: includes `@codaco/fresco-ui#build-storybook` plus all `^build` deps (e.g. `@codaco/shared-consts#build`, `@codaco/protocol-validation#build`, etc.).

- [ ] **Step 4: Format and commit**

```bash
pnpm lint:fix
git add turbo.json
git commit -m "feat(turbo): add lint, knip, build-storybook tasks and tighten build inputs"
```

---

### Task 3: Add GitHub Actions secrets (Netlify + verify existing)

**Files:** none — work happens in the GitHub repo settings UI (Settings → Secrets and variables → Actions).

- [ ] **Step 1: Generate `NETLIFY_AUTH_TOKEN`**

Sign in to Netlify → User settings → Applications → Personal access tokens → New access token. Name it `network-canvas CI`. Copy the value once shown.

- [ ] **Step 2: Capture site IDs**

In the Netlify dashboard:
- Open the documentation site → Site settings → Site details → copy the **Site ID** (UUID).
- Open the architect-web site → Site settings → Site details → copy the **Site ID**.

- [ ] **Step 3: Add the three new secrets to the GitHub repo**

Settings → Secrets and variables → Actions → New repository secret. Add:

| Name | Value |
|---|---|
| `NETLIFY_AUTH_TOKEN` | the personal access token from Step 1 |
| `NETLIFY_SITE_ID_DOCS` | documentation site UUID |
| `NETLIFY_SITE_ID_ARCHITECT` | architect-web site UUID |

- [ ] **Step 4: Verify existing secrets are present**

Confirm these still exist (do not modify them):

- `PROTOCOL_ENCRYPTION_KEY`
- `PROTOCOL_ENCRYPTION_IV`
- `TEST_PROTOCOL_TOKEN`
- `CHROMATIC_PROJECT_TOKEN_FRESCO_UI`
- `CHROMATIC_PROJECT_TOKEN_INTERVIEW`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

If any are missing, the corresponding job will fail at runtime — pause and recover them from Netlify/Chromatic/Clerk before proceeding.

---

### Task 4: Replace `ci-and-release.yml` with the new workflow

**Files:**
- Replace: `.github/workflows/ci-and-release.yml`

- [ ] **Step 1: Overwrite the file**

Replace the entire contents of `.github/workflows/ci-and-release.yml` with:

```yaml
name: CI and Release

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  packages: read
  actions: read
  checks: write
  pull-requests: write

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      any_app: ${{ steps.flags.outputs.any_app }}
      docs: ${{ steps.flags.outputs.docs }}
      architect: ${{ steps.flags.outputs.architect }}
      fresco_ui_storybook: ${{ steps.flags.outputs.fresco_ui_storybook }}
      interview_storybook: ${{ steps.flags.outputs.interview_storybook }}
      interview_e2e: ${{ steps.flags.outputs.interview_e2e }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6
        with:
          node-version-file: '.nvmrc'
      - id: flags
        run: |
          # turbo-ignore: exit 0 = "no changes" → flag false; exit 1 = "changes" → flag true.
          flag() {
            if npx --yes turbo-ignore "$1" --fallback=HEAD^1 >/dev/null 2>&1; then
              echo false
            else
              echo true
            fi
          }
          docs=$(flag @codaco/documentation)
          arch=$(flag @codaco/architect-web)
          fui=$(flag @codaco/fresco-ui)
          intv=$(flag @codaco/interview)
          any_app=false
          if [[ "$docs" == "true" || "$arch" == "true" ]]; then any_app=true; fi
          {
            echo "any_app=$any_app"
            echo "docs=$docs"
            echo "architect=$arch"
            echo "fresco_ui_storybook=$fui"
            echo "interview_storybook=$intv"
            echo "interview_e2e=$intv"
          } >> "$GITHUB_OUTPUT"

  quality:
    runs-on: ubuntu-latest
    env:
      PROTOCOL_ENCRYPTION_KEY: ${{ secrets.PROTOCOL_ENCRYPTION_KEY }}
      PROTOCOL_ENCRYPTION_IV: ${{ secrets.PROTOCOL_ENCRYPTION_IV }}
      GITHUB_TOKEN: ${{ secrets.TEST_PROTOCOL_TOKEN }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6
      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320  # v5
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: ${{ runner.os }}-turbo-
      - name: Write protocol-validation .env (test fixture)
        run: |
          {
            echo "PROTOCOL_ENCRYPTION_KEY=$PROTOCOL_ENCRYPTION_KEY"
            echo "PROTOCOL_ENCRYPTION_IV=$PROTOCOL_ENCRYPTION_IV"
            echo "GITHUB_TOKEN=$GITHUB_TOKEN"
          } > packages/protocol-validation/.env
      - name: Install Playwright chromium (fresco-ui storybook tests)
        run: pnpm --filter @codaco/fresco-ui exec playwright install --with-deps chromium
      - name: Run all gates
        run: |
          pnpm exec turbo run //#lint //#knip typecheck build test \
            --filter='!network-canvas-interviewer' \
            --filter='!network-canvas-architect'
      - name: Validate documentation redirects
        run: pnpm --filter @codaco/documentation validate-redirects

  deploy-netlify:
    needs: [quality, detect]
    if: needs.detect.outputs.any_app == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    outputs:
      docs_url: ${{ steps.docs.outputs.url }}
      architect_url: ${{ steps.architect.outputs.url }}
    env:
      NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: ${{ runner.os }}-turbo-

      - id: docs
        if: needs.detect.outputs.docs == 'true'
        name: Deploy documentation to Netlify
        run: |
          pnpm exec turbo run build --filter=@codaco/documentation
          cd apps/documentation
          if [[ "${{ github.event_name }}" == "push" ]]; then
            json=$(npx --yes netlify-cli@latest deploy --prod --dir=out \
                     --site="${{ secrets.NETLIFY_SITE_ID_DOCS }}" --json)
          else
            json=$(npx --yes netlify-cli@latest deploy --alias="pr-${{ github.event.number }}" \
                     --dir=out --site="${{ secrets.NETLIFY_SITE_ID_DOCS }}" --json)
          fi
          # Mirror to log for human-readable run output.
          echo "$json" | jq .
          url=$(echo "$json" | jq -r '.deploy_url')
          echo "url=$url" >> "$GITHUB_OUTPUT"

      - id: architect
        if: needs.detect.outputs.architect == 'true'
        name: Deploy architect-web to Netlify
        run: |
          pnpm exec turbo run build --filter=@codaco/architect-web
          cd apps/architect-web
          if [[ "${{ github.event_name }}" == "push" ]]; then
            json=$(npx --yes netlify-cli@latest deploy --prod --dir=dist \
                     --site="${{ secrets.NETLIFY_SITE_ID_ARCHITECT }}" --json)
          else
            json=$(npx --yes netlify-cli@latest deploy --alias="pr-${{ github.event.number }}" \
                     --dir=dist --site="${{ secrets.NETLIFY_SITE_ID_ARCHITECT }}" --json)
          fi
          echo "$json" | jq .
          url=$(echo "$json" | jq -r '.deploy_url')
          echo "url=$url" >> "$GITHUB_OUTPUT"

      - if: github.event_name == 'pull_request'
        name: Comment deploy URLs on PR
        uses: actions/github-script@v7
        with:
          script: |
            const lines = ['🚀 **Deploy previews ready**'];
            const docs = '${{ steps.docs.outputs.url }}';
            const architect = '${{ steps.architect.outputs.url }}';
            if (docs) lines.push(`- documentation → ${docs}`);
            if (architect) lines.push(`- architect-web → ${architect}`);
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: lines.join('\n'),
            });

  docs-link-check:
    needs: [detect, deploy-netlify]
    if: needs.detect.outputs.docs == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - run: npx --yes @jthrilly/dead-link-checker "${{ needs.deploy-netlify.outputs.docs_url }}" -v --yes

  docs-redirect-test:
    needs: [detect, deploy-netlify]
    if: needs.detect.outputs.docs == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - working-directory: apps/documentation
        env:
          DEPLOYMENT_URL: ${{ needs.deploy-netlify.outputs.docs_url }}
        run: pnpm run test-redirects

  chromatic-fresco-ui:
    needs: [quality, detect]
    if: needs.detect.outputs.fresco_ui_storybook == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: ${{ runner.os }}-turbo-
      - run: pnpm exec turbo run build-storybook --filter=@codaco/fresco-ui
      - working-directory: packages/fresco-ui
        env:
          CHROMATIC_PROJECT_TOKEN: ${{ secrets.CHROMATIC_PROJECT_TOKEN_FRESCO_UI }}
        run: npx --yes chromatic --exit-once-uploaded --auto-accept-changes main

  chromatic-interview:
    needs: [quality, detect]
    if: needs.detect.outputs.interview_storybook == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: ${{ runner.os }}-turbo-
      - run: pnpm exec turbo run build-storybook --filter=@codaco/interview
      - working-directory: packages/interview
        env:
          CHROMATIC_PROJECT_TOKEN: ${{ secrets.CHROMATIC_PROJECT_TOKEN_INTERVIEW }}
        run: npx --yes chromatic --exit-once-uploaded --auto-accept-changes main

  interview-e2e:
    needs: [quality, detect]
    if: needs.detect.outputs.interview_e2e == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 45
    outputs:
      slug: ${{ steps.meta.outputs.slug }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: ${{ runner.os }}-turbo-
      - id: meta
        env:
          REF: ${{ github.head_ref || github.ref_name }}
        run: |
          SLUG=$(printf '%s' "$REF" | tr '/' '-' | tr '[:upper:]' '[:lower:]')
          printf 'slug=%s\n' "$SLUG" >> "$GITHUB_OUTPUT"
      - name: Run E2E tests
        run: ./packages/interview/e2e/scripts/run.sh
      - name: Reclaim artifact ownership
        if: always()
        run: |
          sudo chown -R "$(id -u):$(id -g)" \
            packages/interview/e2e/playwright-report \
            packages/interview/e2e/test-results 2>/dev/null || true
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: interview-playwright-report
          path: packages/interview/e2e/playwright-report/
          if-no-files-found: warn
          retention-days: 14

  interview-e2e-report:
    needs: interview-e2e
    if: ${{ !cancelled() && needs.interview-e2e.result != 'skipped' }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
      pull-requests: write
    concurrency:
      group: interview-e2e-pages-deploy
      cancel-in-progress: false
    environment:
      name: github-pages
      url: https://complexdatacollective.github.io/network-canvas-monorepo/interview-e2e/${{ needs.interview-e2e.outputs.slug }}/
    steps:
      - name: Download new report
        uses: actions/download-artifact@v4
        with:
          name: interview-playwright-report
          path: new-report
      - name: Fetch existing pages content
        uses: actions/checkout@v4
        with:
          ref: gh-pages
          path: existing-pages
        continue-on-error: true
      - name: Merge report into branch subdirectory
        env:
          SLUG: ${{ needs.interview-e2e.outputs.slug }}
        run: |
          mkdir -p merged
          if [ -d existing-pages ] && [ "$(ls -A existing-pages 2>/dev/null)" ]; then
            cp -r existing-pages/. merged/
            rm -rf merged/.git
          fi
          rm -rf "merged/interview-e2e/$SLUG"
          mkdir -p "merged/interview-e2e/$SLUG"
          cp -r new-report/. "merged/interview-e2e/$SLUG/"
      - uses: actions/upload-pages-artifact@v3
        with:
          path: merged/
      - uses: actions/deploy-pages@v4
      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        env:
          SLUG: ${{ needs.interview-e2e.outputs.slug }}
          OUTCOME: ${{ needs.interview-e2e.result }}
        with:
          script: |
            const { SLUG, OUTCOME } = process.env;
            const url = `https://complexdatacollective.github.io/network-canvas-monorepo/interview-e2e/${SLUG}/`;
            const emoji = OUTCOME === 'success' ? '✅' : '❌';
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `${emoji} Interview E2E — **${OUTCOME}**\n\n📊 [View report](${url})`,
            });

  release:
    needs: quality
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: npm-publish
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    env:
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile --ignore-scripts
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: ${{ runner.os }}-turbo-
      - name: Build all publishable packages
        run: |
          pnpm exec turbo run build \
            --filter='!network-canvas-interviewer' \
            --filter='!network-canvas-architect'
      - uses: changesets/action@63a615b9cd06ba9a3e6d13796c7fbcb080a60a0b  # v1
        with:
          version: pnpm run version-packages
          publish: pnpm run publish-packages
          createGithubReleases: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
```

- [ ] **Step 2: Lint the workflow with actionlint**

```bash
actionlint .github/workflows/ci-and-release.yml
```

Expected: no output (no errors). If errors appear, fix them per `actionlint`'s pointers — common ones are unknown action versions or shellcheck issues inside `run:` blocks.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "feat(ci): consolidate workflow with turbo cache and turbo-ignore detection"
```

---

### Task 5: Delete superseded workflow files and the changeset build script

**Files:**
- Delete: `.github/workflows/interview-e2e.yml`
- Delete: `.github/workflows/chromatic.yml`
- Delete: `.github/workflows/documentation-check-links.yml`
- Delete: `.github/workflows/documentation-test-redirects.yml`
- Delete: `scripts/build-changed-packages.mjs`
- Modify: root `package.json` (remove `build:changed-packages` script entry)

- [ ] **Step 1: Delete the four workflow files**

```bash
git rm .github/workflows/interview-e2e.yml
git rm .github/workflows/chromatic.yml
git rm .github/workflows/documentation-check-links.yml
git rm .github/workflows/documentation-test-redirects.yml
```

- [ ] **Step 2: Delete the changeset build script**

```bash
git rm scripts/build-changed-packages.mjs
```

- [ ] **Step 3: Remove the `build:changed-packages` entry from root `package.json`**

In `package.json`, delete the line:

```jsonc
"build:changed-packages": "node scripts/build-changed-packages.mjs",
```

Verify no other workspace file invokes it:

```bash
grep -r "build:changed-packages\|build-changed-packages" --include="*.json" --include="*.yml" --include="*.sh" --include="*.mjs" --include="*.ts" .
```

Expected: no matches.

- [ ] **Step 4: Format and commit**

```bash
pnpm lint:fix
git add package.json
git commit -m "chore(ci): remove superseded workflows and build:changed-packages script"
```

---

### Task 6: Open draft PR; verify `detect` and `quality` jobs

**Files:** none — observation only.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin ci/efficiency-redesign
```

- [ ] **Step 2: Open a draft pull request**

Use `gh`:

```bash
gh pr create --draft --title "CI efficiency redesign" --body "Implements docs/superpowers/specs/2026-05-13-ci-efficiency-design.md."
```

Note the PR number printed.

- [ ] **Step 3: Watch the `CI and Release` run on the PR**

```bash
gh run watch
```

Expected: a single `CI and Release` workflow appears in PR checks with at minimum `detect` and `quality` jobs visible. Any downstream conditional jobs may or may not appear depending on what files changed in this PR (relative to `main`).

- [ ] **Step 4: Confirm `quality` passes**

`quality` should pass within roughly the same wall-clock as the prior `setup`+`lint`+`test` chain (compute usage materially lower). Open the job's log and verify:

- One `pnpm install` happened (not three).
- Turbo's output shows tasks executed and/or restored from cache.
- All five gates (lint, knip, typecheck, build, test) appear in the Turbo summary line.

- [ ] **Step 5: Confirm `detect` outputs sensible flags**

Open the `detect` job log. The `flag` shell function should emit `true`/`false` per package. Note which downstream jobs were gated in or out, and confirm it matches the files touched in this PR.

If `quality` or `detect` fails, diagnose:

- Job log errors typically point to a missing secret, a bad workflow expression, or a turbo task wiring issue. Fix on the branch, commit, push, and re-run.

Once `quality` is green, proceed.

---

### Task 7: Verify `deploy-netlify` end-to-end with a docs-only change

**Files:**
- Modify (test commit): `apps/documentation/README.md` (any innocuous edit) — to be reverted before merge.

- [ ] **Step 1: Create a test commit that touches the docs app**

```bash
echo "" >> apps/documentation/README.md
git add apps/documentation/README.md
git commit -m "test(ci): trigger docs deploy"
git push
```

- [ ] **Step 2: Watch the run**

```bash
gh run watch
```

Expected: `detect.outputs.docs == 'true'`, `deploy-netlify` runs, its `docs` step executes, and downstream `docs-link-check` and `docs-redirect-test` jobs run. The PR receives a comment with the preview URL.

- [ ] **Step 3: Open the captured preview URL**

The deploy-netlify job log shows the JSON dump from `netlify-cli`. Open `deploy_url` in a browser and verify the docs site loads.

- [ ] **Step 4: Verify link check + redirect test passed**

Both downstream jobs should be green. If either fails, the failure is most likely a real issue in the deployed site (or a pre-existing problem) — diagnose with the failing job's logs.

- [ ] **Step 5: Revert the test commit**

```bash
git revert --no-edit HEAD
git push
```

---

### Task 8: Verify `chromatic-fresco-ui` with a fresco-ui-only change

**Files:**
- Modify (test commit): any file under `packages/fresco-ui/src/`, e.g. add a blank line to `packages/fresco-ui/src/<some component file>` — to be reverted.

- [ ] **Step 1: Make and push a trivial change to a fresco-ui source file**

```bash
echo "// test ci" >> packages/fresco-ui/src/Button.tsx
git add packages/fresco-ui/src/Button.tsx
git commit -m "test(ci): trigger fresco-ui chromatic"
git push
```

- [ ] **Step 2: Watch the run**

```bash
gh run watch
```

Expected: `chromatic-fresco-ui` job runs (and so does `chromatic-interview`, since interview depends on fresco-ui). The job runs `turbo run build-storybook --filter=@codaco/fresco-ui` then `npx chromatic --exit-once-uploaded`. The Chromatic upload should complete; the dashboard at Chromatic.com receives the build under the fresco-ui project.

- [ ] **Step 3: Revert the test commit**

```bash
git revert --no-edit HEAD
git push
```

---

### Task 9: Verify `interview-e2e` and report deploy

**Files:**
- Modify (test commit): a file under `packages/interview/src/`, to be reverted.

- [ ] **Step 1: Push a trivial change to an interview source file**

```bash
echo "// test ci" >> packages/interview/src/index.ts
git add packages/interview/src/index.ts
git commit -m "test(ci): trigger interview e2e"
git push
```

- [ ] **Step 2: Watch the run**

```bash
gh run watch
```

Expected: `interview-e2e` runs (takes up to 45 min). On completion, `interview-e2e-report` runs and deploys the Playwright report to `gh-pages`. The PR receives a comment containing the report URL and ✅/❌ emoji reflecting test outcome.

- [ ] **Step 3: Open the report URL from the PR comment**

Verify the Playwright report is reachable and reflects the e2e outcome.

- [ ] **Step 4: Revert the test commit**

```bash
git revert --no-edit HEAD
git push
```

---

### Task 10: Disable Netlify auto-build per site

**Files:** none — Netlify dashboard work.

This is the final cutover step. Once auto-build is disabled, all preview/production deploys flow through the GH Actions workflow exclusively. Defer this until Tasks 6–9 have all passed at least once on the draft PR.

- [ ] **Step 1: Documentation site — disable auto-build**

Netlify dashboard → documentation site → Site settings → Build & deploy → Continuous deployment → "Stop builds" (or "Build settings" → set `Build command` to blank and disable deploy hooks for `main`). Save.

- [ ] **Step 2: Architect-vite site — disable auto-build**

Same as Step 1 for the architect-web Netlify site.

- [ ] **Step 3: Sanity-check by pushing an empty commit to the branch**

```bash
git commit --allow-empty -m "test(ci): post-cutover sanity"
git push
```

- [ ] **Step 4: Watch the run**

```bash
gh run watch
```

The empty commit touches no app source, so `detect` should output `any_app=false` and `deploy-netlify` should be skipped. Netlify dashboard should show no incoming builds for either site. If Netlify still triggers, auto-build is not fully disabled — recheck Step 1/2.

- [ ] **Step 5: Revert the empty commit (optional)**

```bash
git reset --hard HEAD~1
git push --force-with-lease
```

(The branch is the developer's working branch, not shared; `--force-with-lease` is safe here.)

---

### Task 11: Final verification and merge

- [ ] **Step 1: Confirm a clean run on the branch**

The branch's most recent run should show `quality` passing, no spurious failures in conditional jobs (they either ran successfully where triggered or were correctly skipped).

- [ ] **Step 2: Mark the PR ready for review**

```bash
gh pr ready
```

- [ ] **Step 3: Resolve review feedback if any, then merge**

Use the project's normal merge strategy (squash or merge commit per team convention — check recent `git log` for the pattern).

- [ ] **Step 4: Watch the post-merge `main` run**

```bash
gh run watch
```

Expected: the merge to `main` triggers `CI and Release`. `quality` runs. `release` runs (its `if:` condition is now true). `deploy-netlify` may also run with `--prod` if app source changed in the merge. Verify:

- `release` job completes (no published package changes if there are no pending changesets, which is fine).
- Production deploys land in Netlify (visible in the Netlify dashboard's deploys list, sourced from "GitHub Actions") if app source was part of the merge.

- [ ] **Step 5: Spot-check Netlify production sites**

Open the production URLs for documentation and architect-web in a browser. Confirm they load the expected content.

---

## Rollback

If the new workflow misbehaves on `main`:

- The deleted files are recoverable from git history (`git show HEAD~N:.github/workflows/<file>`).
- Revert the merge commit; CI returns to the prior shape.
- Re-enable Netlify auto-build per site in the Netlify dashboard if rolled back.

---

## Notes for the implementing engineer

- **Action SHAs are pinned** per existing repo convention. If GitHub renumbers releases (it doesn't, but in case of doubt), `actionlint` will flag invalid references. Re-pin from upstream release notes.
- **`npx --yes turbo-ignore`** fetches the package on demand. First run on a cold runner takes ~10s; subsequent runs in the same job are cached by npm.
- **The `flag` shell helper** in `detect` uses `npx --yes turbo-ignore "$1" --fallback=HEAD^1`. Empirically, exit code 0 means "ignore the build" (i.e. no relevant change) and exit code 1 means "continue". If you find inverted output during verification, swap the two branches of the `if` in the helper.
- **`pnpm install --frozen-lockfile --ignore-scripts`** is used everywhere. If a job fails because some package needs its postinstall, the surgical fix is to add `pnpm rebuild <pkg>` after install in that job — do not remove `--ignore-scripts`.
- **The `quality` job** sets `GITHUB_TOKEN` at job env level to override the auto-injected token (mirroring the prior `test` job). No step in `quality` uses an action that needs the GH-issued token, so this is safe.
- **`netlify-cli@latest`** is intentionally unpinned. Pin to a major (`netlify-cli@22` or whatever is current at implementation time) once the deploy flow is verified, to avoid surprise breaking-change days.
- **Chromatic CLI auto-detects** `build-storybook` output in `storybook-static/`. Both fresco-ui and interview already have `chromatic` scripts in their package.json, but the workflow invokes `npx chromatic` directly so we don't depend on those scripts staying in sync. The token is passed via `CHROMATIC_PROJECT_TOKEN` env var (not `--project-token` flag) — preferred by the chromatic CLI.
- **If `interview-e2e-report`'s gh-pages deploy fails** with an auth error, verify the workflow has `pages: write` and `id-token: write` at job level (it does in this plan). The repo's Pages source must be set to "GitHub Actions" in repo settings — it already is per the current `interview-e2e.yml`.

---

## Out of scope

- Migration of `architect-desktop` / `interviewer` Electron app builds.
- `development-protocol-main.yml` / `development-protocol-release.yml` — untouched.
- Turbo Remote Cache via Vercel.
- Self-hosted GitHub runners.
