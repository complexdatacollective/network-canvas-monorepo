# CI efficiency redesign

**Date:** 2026-05-13
**Status:** Implemented — see PR #529 and `docs/superpowers/plans/2026-05-13-ci-efficiency-redesign.md`
**Goal:** Eliminate duplicated work across the monorepo's CI workflows and make change-detection driven by Turbo's dep graph instead of hand-maintained `paths:` lists.

## Problem

`ci-and-release.yml` runs on every PR with no `paths:` filter and performs three full `pnpm install`s per PR (`setup`, `lint`, `test` jobs). `setup` builds `shared-consts` and `protocol-validation`, then ships their `dist/`s as artifacts that the other jobs download and place at the expected paths. The `release` job repeats the artifact dance and runs a custom `scripts/build-changed-packages.mjs` to rebuild packages flagged by changesets.

`interview-e2e.yml` and `chromatic.yml` are gated by hand-maintained `paths:` lists naming six workspace packages each. The lists duplicate Turbo's dep graph and drift when packages are added or refactored.

Netlify deploy previews fire on every PR via the dashboard-configured GitHub integration, with no awareness of which packages actually changed. Netlify's build environment cannot see the monorepo's `.turbo` cache, so each deploy rebuilds from cold. Both `apps/documentation` and `apps/architect-web` deploy to Netlify; future apps will join. (The `vercel.json` in `apps/architect-web` is stale — Vercel is no longer in use.)

Two follow-up workflows (`documentation-check-links.yml`, `documentation-test-redirects.yml`) listen for `deployment_status` events emitted by the external Netlify integration. They run dead-link and redirect checks against whatever URL is in the event payload.

`turbo.json` already declares correct `inputs`/`outputs`/`dependsOn` relationships for `build`, `typecheck`, and `test`. Nothing in CI is using the Turbo cache, so this metadata buys nothing today.

## Approach

A single `actions/cache@v4` step in each workflow restores `.turbo` and saves it back, keyed `${{ runner.os }}-turbo-${{ github.sha }}` with `restore-keys: ${{ runner.os }}-turbo-`. That gives Turbo's content-addressed cache cross-job and cross-workflow continuity. The artifact upload/download dance for `shared-consts-dist` / `protocol-validation-dist` is removed; `dist/`s flow through `.turbo`.

Every gate that was previously its own job (lint, knip, typecheck, build, test) runs in one combined `turbo run` invocation inside a single `quality` job. Turbo's internal scheduler parallelises the tasks across cores as the dep graph allows. The single-step structure means one GH status indicator for the whole gate; the trade-off (per-task statuses would require either multiple parallel jobs with duplicated install overhead, or shell-level backgrounding with custom check-run emission) is accepted in favour of minimal overhead. The job uses `pnpm install --frozen-lockfile --ignore-scripts` and exposes `PROTOCOL_ENCRYPTION_KEY`, `PROTOCOL_ENCRYPTION_IV`, and `TEST_PROTOCOL_TOKEN` at step level — defence-in-depth holds because no lifecycle scripts run.

Change-detection for downstream workflows uses `turbo-ignore <package>`, which walks the workspace dep graph from the named package and short-circuits if `git diff <base>..HEAD` doesn't touch any file in that tree. The base is auto-detected on PR (merge base with `main`) and `HEAD^1` on push; pinned via `--fallback=HEAD^1`. This replaces the `paths:` lists in `interview-e2e.yml` and `chromatic.yml`, which are deleted.

Netlify deploys move into the monorepo's CI workflow. A single `detect` job (running in parallel with `quality`) runs `turbo-ignore` against every package that drives a conditional downstream job — apps, storybook packages, e2e — and outputs flags for each. A `deploy-netlify` job, gated on `detect.outputs.any_app == 'true'` and `needs: [quality, detect]`, builds each affected app via `turbo run build --filter=<app>` (cache hit because `quality` already ran `turbo run build`) and ships it via `netlify-cli deploy --dir=<out-or-dist>`. PR pushes use `--alias=pr-<num>` for preview URLs; main pushes use `--prod`. The deploy step captures `deploy_url` from `netlify-cli`'s `--json` output and publishes it as a job output. `docs-link-check` and `docs-redirect-test` jobs read that output and run their checks against the captured URL. Netlify auto-build is disabled per-site in the Netlify dashboard at cutover.

Chromatic moves to CLI: `chromaui/action@v16` is replaced with `turbo run build-storybook --filter=<package>` followed by `npx chromatic --project-token=… --exit-once-uploaded --auto-accept-changes main`. `build-storybook` becomes a cached Turbo task. Both `packages/fresco-ui` and `packages/interview` already have `build-storybook` and `chromatic` package.json scripts.

Interview e2e stays a logical pipeline of its own (the playwright run plus the gh-pages report deploy), but moves into `ci-and-release.yml` as jobs that `needs: quality`. This guarantees e2e reads Turbo's cache after `quality` has written it (no cross-workflow cache race) and that broken `quality` blocks e2e from running on broken code.

Release runs `turbo run build` (cache hits across the board, since `quality` already built everything for this SHA) instead of `scripts/build-changed-packages.mjs`. The custom script is deleted. The artifact-download steps for `shared-consts-dist` and `protocol-validation-dist` are removed — those `dist/`s are restored via the `.turbo` cache. The job retains `pnpm install --frozen-lockfile --ignore-scripts`, its existing `id-token: write` / `contents: write` / `pull-requests: write` permissions, `environment: npm-publish`, and the `changesets/action` invocation.

`interview-e2e` runs the playwright suite without `continue-on-error`; if tests fail, the job fails. `interview-e2e-report` declares `if: ${{ !cancelled() && needs.interview-e2e.result != 'skipped' }}` so the report deploys to gh-pages and the PR comment fires even when tests fail. The standalone `result` job from the existing `interview-e2e.yml` is no longer needed — workflow status reflects e2e outcome directly through job result. `interview-e2e-report` declares its own job-level `permissions: { contents: read, pages: write, id-token: write, pull-requests: write }` (overriding the workflow-level default).

## Final workflow inventory

`ci-and-release.yml` (single workflow, all jobs explicitly chained by `needs`):

```
detect                                           (turbo-ignore per package; outputs flags
                                                  for docs, architect, fresco-ui-storybook,
                                                  interview-storybook, interview-e2e)
quality                                          (lint/knip/typecheck/build/test in one turbo run)
  ├── deploy-netlify                             (needs: [quality, detect];
  │                                               if: detect.outputs.any_app == 'true';
  │                                               per-app deploy steps; outputs deploy_url per app)
  │     ├── docs-link-check                      (if detect.outputs.docs == 'true')
  │     └── docs-redirect-test                   (if detect.outputs.docs == 'true')
  ├── chromatic-fresco-ui                        (needs: [quality, detect];
  │                                               if: detect.outputs.fresco_ui_storybook == 'true')
  ├── chromatic-interview                        (needs: [quality, detect];
  │                                               if: detect.outputs.interview_storybook == 'true')
  ├── interview-e2e                              (needs: [quality, detect];
  │                                               if: detect.outputs.interview_e2e == 'true')
  │     └── interview-e2e-report                 (needs: interview-e2e;
  │                                               if: !cancelled() && needs result != 'skipped';
  │                                               deploys report + PR comment even on test failure)
  └── release                                    (needs: quality; main-push-only)
```

`detect` runs in parallel with `quality` — it only needs git history (`fetch-depth: 0`), not the Turbo cache. All downstream jobs reference both via `needs: [quality, detect]` so they wait for quality's cache writeback before running, and read detection flags from `detect`.

`development-protocol-main.yml` and `development-protocol-release.yml` are out of scope and unchanged.

Deleted: `interview-e2e.yml`, `chromatic.yml`, `documentation-check-links.yml`, `documentation-test-redirects.yml`, `scripts/build-changed-packages.mjs`.

## `detect` job — shape

```yaml
detect:
  runs-on: ubuntu-latest
  outputs:
    any_app: …
    docs: …
    architect: …
    fresco_ui_storybook: …
    interview_storybook: …
    interview_e2e: …
  steps:
    - uses: actions/checkout@<sha>
      with: { fetch-depth: 0 }
    - uses: actions/setup-node@<sha>
      with: { node-version-file: '.nvmrc' }
    - id: flags
      run: |
        flag() { npx turbo-ignore "$1" --fallback=HEAD^1 && echo false || echo true; }
        docs=$(flag @codaco/documentation)
        arch=$(flag @codaco/architect-web)
        fui=$(flag @codaco/fresco-ui)
        intv=$(flag @codaco/interview)
        any_app=false; { [[ $docs == true ]] || [[ $arch == true ]]; } && any_app=true
        {
          echo "any_app=$any_app"
          echo "docs=$docs"
          echo "architect=$arch"
          echo "fresco_ui_storybook=$fui"
          echo "interview_storybook=$intv"
          echo "interview_e2e=$intv"   # same dep tree as chromatic-interview
        } >> "$GITHUB_OUTPUT"
```

`turbo-ignore` exit semantics: exit 0 = "ignore the build" (no relevant changes); exit 1 = "continue" (changes detected). The `flag` helper inverts to `true`/`false` flags for clarity.

## `quality` job — concrete shape

```yaml
quality:
  runs-on: ubuntu-latest
  env:
    PROTOCOL_ENCRYPTION_KEY: ${{ secrets.PROTOCOL_ENCRYPTION_KEY }}
    PROTOCOL_ENCRYPTION_IV: ${{ secrets.PROTOCOL_ENCRYPTION_IV }}
    GITHUB_TOKEN: ${{ secrets.TEST_PROTOCOL_TOKEN }}
  steps:
    - uses: actions/checkout@<pinned-sha>
    - uses: pnpm/action-setup@<pinned-sha>
    - uses: actions/setup-node@<pinned-sha>
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile --ignore-scripts
    - uses: actions/cache@v4
      with:
        path: .turbo
        key: ${{ runner.os }}-turbo-${{ github.sha }}
        restore-keys: ${{ runner.os }}-turbo-
    - run: |
        # protocol-validation test reads .env at runtime; current workflow writes it.
        echo "PROTOCOL_ENCRYPTION_KEY=$PROTOCOL_ENCRYPTION_KEY" > packages/protocol-validation/.env
        echo "PROTOCOL_ENCRYPTION_IV=$PROTOCOL_ENCRYPTION_IV"  >> packages/protocol-validation/.env
        echo "GITHUB_TOKEN=$GITHUB_TOKEN"                       >> packages/protocol-validation/.env
    - run: pnpm --filter @codaco/fresco-ui exec playwright install --with-deps chromium
    - run: pnpm exec turbo run //#lint //#knip typecheck build test
    - run: pnpm --filter @codaco/documentation validate-redirects
```

The trailing `validate-redirects` step preserves a check that lives in the current `lint` job and isn't covered by the Turbo gates (the script reads `netlify.toml` and validates redirect syntax — see `apps/documentation/scripts/validate-redirects.ts`).

## `turbo.json` changes

```jsonc
{
  "tasks": {
    // existing build task — add pnpm-lock.yaml to inputs
    "build": {
      "dependsOn": ["^build"],
      "inputs": [
        "src/**", "tsconfig*.json", "vite.config.*",
        "electron.vite.config.*", "next.config.*", "package.json",
        "pnpm-lock.yaml"
      ],
      "outputs": ["dist/**", "out/**", ".next/**", "!.next/cache/**"]
    },

    // new root tasks
    "//#lint": {
      "inputs": [
        "**/*.{ts,tsx,js,jsx,mjs,cjs,json}",
        "biome.json",
        "!**/dist/**", "!**/out/**", "!**/.next/**", "!**/storybook-static/**"
      ],
      "outputs": []
    },
    "//#knip": {
      "inputs": [
        "**/*.{ts,tsx,js,jsx,mjs,cjs}",
        "**/package.json", "knip.json",
        "pnpm-workspace.yaml", "pnpm-lock.yaml",
        "!**/dist/**", "!**/out/**", "!**/.next/**"
      ],
      "outputs": []
    },

    // new per-package task
    "build-storybook": {
      "dependsOn": ["^build"],
      "inputs": [
        "src/**", ".storybook/**", "stories/**",
        "package.json", "tsconfig*.json"
      ],
      "outputs": ["storybook-static/**"]
    }
  }
}
```

The existing `network-canvas-architect#build` and `@codaco/tailwind-config#build` overrides remain unchanged.

## Required secrets

Existing:

- `PROTOCOL_ENCRYPTION_KEY`, `PROTOCOL_ENCRYPTION_IV`, `TEST_PROTOCOL_TOKEN` — test job
- `CHROMATIC_PROJECT_TOKEN_FRESCO_UI`, `CHROMATIC_PROJECT_TOKEN_INTERVIEW` — chromatic jobs
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — release job

New:

- `NETLIFY_AUTH_TOKEN` — single auth token used by all deploys
- `NETLIFY_SITE_ID_DOCS` — documentation site
- `NETLIFY_SITE_ID_ARCHITECT` — architect-web site

## Netlify dashboard changes

Outside the repo, as part of cutover:

- Disable auto-build for both Netlify sites (`apps/documentation`, `apps/architect-web`).
- Generate `NETLIFY_AUTH_TOKEN` from Netlify user settings.
- Capture `NETLIFY_SITE_ID_*` from each site's settings.

## Cache reuse summary

| Asset | Reused across workflows? | Mechanism |
|---|---|---|
| pnpm content-addressed store (`~/.local/share/pnpm/store`) | yes | `setup-node` pnpm cache; install runs but is fast |
| `.turbo/` build outputs | yes | `actions/cache@v4` keyed on SHA with `restore-keys` fallback |
| `node_modules/` | no | each job runs `pnpm install --frozen-lockfile --ignore-scripts` against warm pnpm store (~15–20s) |

Cache writeback within `ci-and-release.yml` is naturally sequential because every job that does Turbo work `needs: quality` (directly or transitively). `quality` writes the SHA-specific cache slot; downstream jobs restore it and either no-op (cache hit) or rebuild a small delta. Since all Turbo-using jobs live in this single workflow, there are no cross-workflow writers competing for the cache key.

## Open implementation details

- Verify `pnpm install --frozen-lockfile --ignore-scripts` works for every gate (lint/knip/typecheck/build), not only test. Empirically, `--ignore-scripts` works for the current `test` job; the same toolchain (biome, esbuild, swc, tailwindcss-oxide, sharp) is used by the other gates. If a specific package requires its postinstall to function, the surgical fix is `pnpm rebuild <package>` after install — not splitting the job.
- `netlify-cli deploy --json` suppresses the normal deploy summary on stdout. Tee output to a log file for human-readable workflow logs, parse JSON separately.
- Validate that `turbo-ignore @codaco/documentation` correctly detects locale-content changes (`messages/**` JSON files etc) if those live outside `apps/documentation/`. If they do, ensure the dep graph captures them (likely via a workspace dependency).
- The `quality` job sets `GITHUB_TOKEN: ${{ secrets.TEST_PROTOCOL_TOKEN }}` at job env level (mirroring the current `test` job). This overrides the auto-injected `GITHUB_TOKEN` for the whole job. Verify no step inside `quality` relies on the auto-injected token; if any does, switch to scoping `TEST_PROTOCOL_TOKEN` to only the test-running step.
- During cutover, run one PR with both old and new workflows in parallel to verify e2e/chromatic outcomes match. Disable Netlify auto-build only after the GH-driven path is confirmed working end-to-end (including the Deploy Hook on `main`).

## Out of scope

- Migration of `architect-desktop` and `interviewer` (Electron apps) builds — they remain excluded from the root `pnpm build` script and are not part of CI gating.
- `development-protocol-*` workflows — narrow, already path-filtered, not duplicated.
- Reorganising Turbo task definitions beyond the additions listed above.
- Turbo Remote Cache via Vercel — `actions/cache` on `.turbo` is sufficient and avoids the third-party dependency.
- Self-hosted runners — current runners are GitHub-hosted; no change.
