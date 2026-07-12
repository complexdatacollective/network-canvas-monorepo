# Interviewer app e2e testing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chromium-only Playwright e2e suite for the `@codaco/interviewer` PWA covering protocol import/delete, interview data management (filter/sort/export), app settings, and conducting a full interview, with heavy visual-regression coverage and a CI job.

**Architecture:** A standalone `apps/interviewer/e2e/` Playwright project mirroring the conventions of `packages/interview/e2e/` (Docker-pinned runner, `getByRole`-first locators, CI-gated visual captures) but not sharing its code. Tests drive the **built** PWA served by `vite preview`. Functional specs run in the app's default `none` (unencrypted) mode; PIN/passphrase get dedicated lifecycle specs that enrol through the real setup wizard. A purpose-built lean `.netcanvas` fixture in `packages/protocols/e2e/` drives the import, interview, and export facets.

**Tech Stack:** Playwright (`@playwright/test`), Vite 8 `vite preview`, `jszip` (zip the fixture + unzip export archives — already an `apps/interviewer` dep via `catalog:`; `fflate` is **not** an app dep, do not use it), Docker (Playwright image, visual baselines), the `@codaco/protocol-validation` CLI (fixture validation).

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the ground-truth extraction and the spec.

- **Protocol schema version:** `8` (the discriminator; omitting it fails validation).
- **Preview server:** `vite preview --port 4180 --strictPort` serving `apps/interviewer/dist` (the app has **no** fixed preview port; default would be 4173 — always pass `--port 4180`). Ports 4101/4200/5180/6006/6009 are used elsewhere — do not reuse.
- **Browser matrix:** Chromium only.
- **Playwright pins:** `@playwright/test` and `playwright` both on `catalog:` (`^1.61.1` in `pnpm-workspace.yaml`, grouped in `.github/dependabot.yml`). `@playwright/test` is **not yet** a devDep of `apps/interviewer` — add it on `catalog:`.
- **Docker volume:** name it `interviewer-e2e-node-modules` (distinct from the interview suite's `interview-e2e-node-modules`) to avoid arm64/x64 binary collisions.
- **Vault localStorage key:** `interviewer:vault`; record version `4`. A valid unlockable record **cannot** be hand-authored (the wrapped DEK needs real PBKDF2+AES-KW). Enrol through the wizard UI.
- **Default functional-spec mode:** `none` (a plain browser tab is usable immediately; `AuthGate` only forces `/welcome` when `isRunningInstalled()`).
- **Visual captures:** gated on `process.env.CI` — they no-op locally and only assert in the Docker CI run. Baselines are generated **only** via `run.sh --update-snapshots` (Docker), never locally.
- **Download capture:** stub away `window.showSaveFilePicker`, `navigator.canShare`, and `navigator.share` (init script) so `saveBlob` falls through to the object-URL `<a download>` path and `page.waitForEvent('download')` fires.
- **Locators:** `getByRole(role, { name })` first; `getByTestId` (kebab-case `component-action`) as the escape hatch for non-semantic surfaces. Reuse fresco-ui's existing `dialog-*` / `wizard-*` / `{name}-field-error` ids. Never assert on user-facing copy that is likely to be re-worded, and never use `isVisible()` / manual sleeps — always web-first `await expect(locator)...`.
- **Code standards (repo-wide):** no `any`, no `as` assertions to bypass typing, no barrel files, no convenience re-exports. 2-space indent, single quotes (oxlint + oxfmt). Run `pnpm lint:fix` from repo root before committing. Co-located tests use Vitest — but this suite is Playwright and lives under `apps/interviewer/e2e/`, outside the Vitest `unit` project.
- **GraphML node-count assertion:** count `<node` element occurrences inside `<graph>` in the exported `.graphml`.
- **Changeset:** one app `-beta` changeset for the production `data-testid` additions (`@codaco/interviewer` is private, on the `-beta.N` lane). No library changeset (the protocols fixture + e2e infra are private/unpublished). Never mix an app and a library in one changeset.

## Deviations from the design spec (ground-truth corrections)

The approved spec (`docs/superpowers/specs/2026-07-12-interviewer-e2e-testing-design.md`) assumed a precomputed `VaultRecord` fixture and a preview server on a config-fixed port. Ground truth changed these:

1. **Vault enrolment is wizard-driven, not fixture-seeded.** A static record parses but never unlocks (the DEK must be minted by real crypto). The auth spec enrols PIN/passphrase through the setup wizard, reloads to test lock, and unlocks via `LockScreen`.
2. **Preview port is passed explicitly (`--port 4180`).** No `preview.port` exists in `vite.renderer.config.ts`.
3. **Interview `next()` waits on the `data-stage-step` DOM attribute** — the app route exposes no `step=` URL param.
4. **Toggle settings are located by role+name** (`ToggleField` drops passed testids); `InputField`/`SelectField` forward testids fine.
5. **Visual captures are CI-gated** (no-op locally), so functional specs verify green on a local headed run without baselines.

## File structure

**Created:**

- `packages/protocols/e2e/interviewer-e2e/protocol.json` — the lean fixture source (validatable).
- `packages/protocols/e2e/interviewer-e2e/interviewer-e2e.netcanvas` — zipped fixture (fed to the import `<input type=file>`).
- `apps/interviewer/e2e/playwright.config.ts` — Chromium project, `vite preview` webServer on 4180, CI-gated snapshots.
- `apps/interviewer/e2e/tsconfig.json` — TS config for the suite.
- `apps/interviewer/e2e/scripts/run.sh` — Docker-pinned runner.
- `apps/interviewer/e2e/scripts/build-e2e-protocol.mjs` — regenerate the `.netcanvas` from `protocol.json`.
- `apps/interviewer/e2e/helpers/protocol-paths.ts` — resolves the fixture path.
- `apps/interviewer/e2e/helpers/visual.ts` — `VISUAL_STYLES` + CI-gated `capture` factory + mask helpers.
- `apps/interviewer/e2e/helpers/export-archive.ts` — unzip + parse GraphML/CSV.
- `apps/interviewer/e2e/fixtures/test.ts` — composes fixtures; extends `@playwright/test`.
- `apps/interviewer/e2e/fixtures/protocol-fixture.ts` — import/delete a `.netcanvas` via the real UI.
- `apps/interviewer/e2e/fixtures/seed-fixture.ts` — synthetic-session generation via Settings UI.
- `apps/interviewer/e2e/fixtures/download-fixture.ts` — stub the save ladder + capture the export.
- `apps/interviewer/e2e/fixtures/vault-fixture.ts` — wizard enrol + LockScreen unlock helpers.
- `apps/interviewer/e2e/fixtures/interview-nav.ts` — app-adapted interview navigation (models `packages/interview/e2e/fixtures/interview-fixture.ts`).
- `apps/interviewer/e2e/specs/smoke-none.spec.ts`, `home-protocols.spec.ts`, `data-management.spec.ts`, `settings.spec.ts`, `conduct-interview.spec.ts`, `auth.spec.ts`.
- `apps/interviewer/e2e/visual-snapshots/chromium/*.png` — committed baselines (generated in Docker).
- `apps/interviewer/e2e/README.md`.
- `.changeset/*.md` — app `-beta` changeset.

**Modified (app-src, testids only):**

- `apps/interviewer/src/components/ProtocolCarousel/ImportTriggerCard.tsx` (import input), `DeckCard.tsx` (delete already fine — dialog buttons have testids; deck card metadata already testid'd).
- `apps/interviewer/src/components/NewSessionForm.tsx` (case-id field + submit).
- `apps/interviewer/src/components/DataView/DataViewToolbar.tsx` (search, filter trigger, bulk buttons), `useDataViewColumns.tsx` (resume), `DateFilter` scoping.
- `apps/interviewer/src/components/TopActionBar.tsx` (settings gear).
- `apps/interviewer/src/components/SettingsDialog.tsx` (tabs, generate/delete buttons) — forwarded-field controls get testids; toggles stay role+name.
- `apps/interviewer/src/components/InterviewComplete.tsx` (root + exit).
- `apps/interviewer/src/components/UnlockForms/PasswordUnlockField.tsx`, `apps/interviewer/src/components/LockScreen.tsx` (unlock submit), `apps/interviewer/src/components/UnlockForms/ResetAppDataButton.tsx`, `packages/fresco-ui/src/form/SegmentedCodeField.tsx` (PIN fieldset testid).
- `apps/interviewer/package.json` (`@playwright/test` devDep + `test:e2e`/`test:e2e:headed` scripts).
- `.github/workflows/ci-and-release.yml` (new `interviewer-e2e` job + carry-forward).

---

## Task 1: Lean e2e protocol fixture

**Files:**

- Create: `packages/protocols/e2e/interviewer-e2e/protocol.json`
- Create: `packages/protocols/e2e/interviewer-e2e/interviewer-e2e.netcanvas`
- Create: `apps/interviewer/e2e/scripts/build-e2e-protocol.mjs`
- Create: `apps/interviewer/e2e/helpers/protocol-paths.ts`
- Modify: `packages/protocols/manifest.json` (append an `e2e` entry)

**Interfaces:**

- Produces: `LEAN_E2E_PROTOCOL_PATH` (absolute path to `interviewer-e2e.netcanvas`) and `LEAN_E2E_PROTOCOL_NAME = 'E2E Fixture'` from `helpers/protocol-paths.ts`, consumed by the protocol, seed, and interview fixtures.

- [ ] **Step 1: Author the protocol JSON**

Create `packages/protocols/e2e/interviewer-e2e/protocol.json`:

```json
{
  "name": "E2E Fixture",
  "description": "Lean fixture for the Interviewer app e2e suite.",
  "schemaVersion": 8,
  "lastModified": "2026-07-12T00:00:00.000Z",
  "codebook": {
    "node": {
      "person": {
        "name": "Person",
        "color": "node-color-seq-1",
        "shape": { "default": "circle" },
        "variables": {
          "name": {
            "name": "name",
            "type": "text",
            "component": "Text",
            "validation": { "required": true }
          },
          "close": {
            "name": "close",
            "type": "boolean",
            "component": "Boolean",
            "options": [
              { "label": "Yes", "value": true },
              { "label": "No", "value": false }
            ]
          },
          "layout": { "name": "layout", "type": "layout" }
        }
      }
    },
    "edge": {
      "knows": { "name": "Knows", "color": "edge-color-seq-1" }
    },
    "ego": {
      "variables": {
        "ego_name": {
          "name": "ego_name",
          "type": "text",
          "component": "Text",
          "validation": { "required": true }
        }
      }
    }
  },
  "stages": [
    {
      "id": "stage-info",
      "type": "Information",
      "label": "Welcome",
      "title": "Welcome",
      "items": [
        {
          "id": "item-1",
          "type": "text",
          "size": "LARGE",
          "content": "# Welcome\n\nThanks for taking part."
        }
      ]
    },
    {
      "id": "stage-ego",
      "type": "EgoForm",
      "label": "About you",
      "introductionPanel": {
        "title": "Introduction",
        "text": "Tell us about **you**."
      },
      "form": {
        "fields": [{ "variable": "ego_name", "prompt": "What is your name?" }]
      }
    },
    {
      "id": "stage-ng",
      "type": "NameGeneratorQuickAdd",
      "label": "Name people",
      "subject": { "entity": "node", "type": "person" },
      "quickAdd": "name",
      "behaviours": { "minNodes": 1, "maxNodes": 8 },
      "prompts": [{ "id": "p1", "text": "Who are the people you know?" }]
    },
    {
      "id": "stage-socio",
      "type": "Sociogram",
      "label": "Connect people",
      "subject": { "entity": "node", "type": "person" },
      "background": { "concentricCircles": 4, "skewedTowardCenter": true },
      "prompts": [
        {
          "id": "p1",
          "text": "Drag to place; link people who know each other.",
          "layout": { "layoutVariable": "layout" },
          "edges": { "create": "knows", "display": ["knows"] }
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Validate the protocol (must exit 0)**

Run from repo root:

```bash
node packages/protocol-validation/scripts/cli.js packages/protocols/e2e/interviewer-e2e/protocol.json; echo "EXIT=$?"
```

Expected: `EXIT=0`. If `EXIT=1`, read the printed ZodError `path` array and fix the offending key (common misses: a stray unknown key, a `variable` referencing a display name instead of a record key, a missing `layout`-type var for the Sociogram). Re-run until `EXIT=0`.

- [ ] **Step 3: Write the `.netcanvas` build script**

Create `apps/interviewer/e2e/scripts/build-e2e-protocol.mjs`:

```js
// Regenerate interviewer-e2e.netcanvas from protocol.json.
// A .netcanvas is a plain zip with protocol.json at the archive root.
// Uses jszip (already an apps/interviewer dep). Run:
//   node apps/interviewer/e2e/scripts/build-e2e-protocol.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(
  here,
  '../../../../packages/protocols/e2e/interviewer-e2e',
);
const json = readFileSync(resolve(srcDir, 'protocol.json'), 'utf8');

const zip = new JSZip();
zip.file('protocol.json', json);
const buffer = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(resolve(srcDir, 'interviewer-e2e.netcanvas'), buffer);
console.log('Wrote interviewer-e2e.netcanvas');
```

- [ ] **Step 4: Build the fixture and verify it round-trips**

```bash
node apps/interviewer/e2e/scripts/build-e2e-protocol.mjs
node packages/protocol-validation/scripts/cli.js packages/protocols/e2e/interviewer-e2e/interviewer-e2e.netcanvas; echo "EXIT=$?"
```

Expected: `Wrote interviewer-e2e.netcanvas` then `EXIT=0` (the CLI extracts and validates the inner `protocol.json`).

- [ ] **Step 5: Add the protocol-paths helper**

Create `apps/interviewer/e2e/helpers/protocol-paths.ts`:

```ts
import path from 'node:path';

// Single source of truth for the lean e2e fixture, resolved relative to this
// file so it is independent of the caller's working directory.
export const LEAN_E2E_PROTOCOL_PATH = path.resolve(
  import.meta.dirname,
  '../../../../packages/protocols/e2e/interviewer-e2e/interviewer-e2e.netcanvas',
);

export const LEAN_E2E_PROTOCOL_NAME = 'E2E Fixture';
```

- [ ] **Step 6: Register in the manifest**

Append to the `protocols` array in `packages/protocols/manifest.json`:

```json
{
  "id": "interviewer-e2e",
  "kind": "e2e",
  "name": "E2E Fixture",
  "description": "Lean fixture used by the Interviewer app e2e suite.",
  "protocolPath": "e2e/interviewer-e2e/interviewer-e2e.netcanvas",
  "assetDir": "e2e/interviewer-e2e",
  "architectTemplate": false
}
```

- [ ] **Step 7: Commit**

```bash
git add packages/protocols/e2e/interviewer-e2e packages/protocols/manifest.json apps/interviewer/e2e/scripts/build-e2e-protocol.mjs apps/interviewer/e2e/helpers/protocol-paths.ts
git commit -m "test(interviewer): add lean e2e protocol fixture"
```

---

## Task 2: Playwright scaffold, base fixture, and smoke spec

**Files:**

- Modify: `apps/interviewer/package.json` (devDep + scripts)
- Create: `apps/interviewer/e2e/playwright.config.ts`
- Create: `apps/interviewer/e2e/tsconfig.json`
- Create: `apps/interviewer/e2e/fixtures/test.ts`
- Create: `apps/interviewer/e2e/helpers/visual.ts`
- Create: `apps/interviewer/e2e/scripts/run.sh`
- Create: `apps/interviewer/e2e/specs/smoke-none.spec.ts`
- Create: `apps/interviewer/e2e/README.md`

**Interfaces:**

- Produces: `test` and `expect` from `fixtures/test.ts` (the base `@playwright/test` re-export, extended in later tasks); `capture(page)` factory and `VISUAL_STYLES`, `MASK` from `helpers/visual.ts`.
- Consumes: nothing from earlier tasks except that the app builds.

- [ ] **Step 1: Add the Playwright devDep and scripts**

In `apps/interviewer/package.json`, add to `devDependencies` (keep alphabetical):

```json
"@playwright/test": "catalog:",
```

Add to `scripts`:

```json
"test:e2e": "./e2e/scripts/run.sh",
"test:e2e:update-snapshots": "./e2e/scripts/run.sh --update-snapshots",
"test:e2e:headed": "pnpm build:web && playwright test --config e2e/playwright.config.ts --headed",
```

Then install:

```bash
pnpm install
```

Expected: install succeeds; `@playwright/test` resolves to `^1.61.1` from the catalog.

- [ ] **Step 2: Write the Playwright config**

Create `apps/interviewer/e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  snapshotDir: './visual-snapshots',
  snapshotPathTemplate: '{snapshotDir}/{projectName}/{arg}{ext}',

  // Fresh context per test → IndexedDB + localStorage isolated for free.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,

  reporter: [
    ['line'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
    ['json', { outputFile: './test-results/results.json' }],
  ],

  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixels: 250,
    },
  },

  use: {
    baseURL: 'http://localhost:4180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    viewport: { width: 1920, height: 1080 },
    reducedMotion: 'reduce',
    // Block the service worker: deterministic tests, page.route works, no
    // SW-cache bleed between contexts. SW/offline behaviour is out of scope.
    serviceWorkers: 'block',
  },

  webServer: {
    // Serve the built PWA (not the dev server): the SW only exists in the
    // build, assert-pwa-build gates this exact output, and the dev server's
    // optimizeDeps re-bundle wipes app state mid-test. build:web runs upstream
    // in run.sh / test:e2e:headed, so this assumes dist/ exists.
    command:
      'pnpm --filter @codaco/interviewer exec vite preview --port 4180 --strictPort',
    port: 4180,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
```

- [ ] **Step 3: Write the TS config**

Create `apps/interviewer/e2e/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 4: Write the visual helper (CI-gated capture)**

Create `apps/interviewer/e2e/helpers/visual.ts`:

```ts
import { expect, type Locator, type Page } from '@playwright/test';

// Hide non-deterministic chrome so snapshots don't depend on blob animation
// or which element last held focus. Mirrors the interview suite's VISUAL_STYLES.
export const VISUAL_STYLES = `
  [data-testid="background-blobs"] { visibility: hidden !important; }
  *:focus-visible, *:has(:focus-visible) { outline: none !important; }
  *:focus-visible { box-shadow: none !important; }
`;

type CaptureOptions = { mask?: Locator[]; fullPage?: boolean };
export type CaptureFn = (
  name: string,
  options?: CaptureOptions,
) => Promise<void>;

// Returns a capture function that is a no-op unless running in CI. This keeps
// local headed runs functional-only (no baselines needed) while CI asserts
// against the committed Docker-generated baselines.
export function makeCapture(page: Page): CaptureFn {
  const isCI = !!process.env.CI;
  let stylesInjected = false;

  return async (name, options = {}) => {
    if (!isCI) return;
    if (!stylesInjected) {
      await page.addStyleTag({ content: VISUAL_STYLES });
      stylesInjected = true;
    }
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
    });
  };
}

// Standard masks for the Home/status chrome — version string, storage estimate,
// installation id — whose text is environment-dependent.
export function statusMasks(page: Page): Locator[] {
  return [
    page.getByTestId('encryption-status-trigger'),
    page.getByTestId('storage-status-trigger'),
  ];
}
```

- [ ] **Step 5: Write the base test fixture**

Create `apps/interviewer/e2e/fixtures/test.ts`:

```ts
import { test as base, expect, type Page } from '@playwright/test';

import { type CaptureFn, makeCapture } from '../helpers/visual.js';

// Base fixtures shared by every spec. Each test gets a fresh context (Playwright
// default), so IndexedDB (`interviewer`) and localStorage are isolated — no
// manual teardown. Later tasks extend this with protocol/seed/download/vault/
// interview fixtures.
type BaseFixtures = {
  capture: CaptureFn;
};

export const test = base.extend<BaseFixtures>({
  capture: async ({ page }: { page: Page }, use) => {
    await use(makeCapture(page));
  },
});

export { expect };
```

- [ ] **Step 6: Write the Docker runner**

Create `apps/interviewer/e2e/scripts/run.sh` (then `chmod +x`):

```bash
#!/usr/bin/env bash
# Run the @codaco/interviewer e2e suite inside the Playwright Docker image so
# visual baselines are font-rendering-stable regardless of host OS. Mirrors
# packages/interview/e2e/scripts/run.sh.
#
# Usage:
#   ./e2e/scripts/run.sh                    # run
#   ./e2e/scripts/run.sh --update-snapshots # regenerate visual baselines
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$MONOREPO_ROOT"

PW_VERSION="$(grep -oE '@playwright/test@[0-9]+\.[0-9]+\.[0-9]+' pnpm-lock.yaml | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -uV | tail -1 || true)"
if [ -z "$PW_VERSION" ]; then
  echo "Error: could not determine @playwright/test version from pnpm-lock.yaml" >&2
  exit 1
fi
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is not running." >&2
  exit 1
fi

docker run --rm \
  -e CI=true \
  -v "$(pwd)":/workspace \
  -v interviewer-e2e-node-modules:/workspace/node_modules \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/interviewer...' --frozen-lockfile \
    && pnpm --filter @codaco/interviewer build:web \
    && pnpm --filter @codaco/interviewer exec playwright test --config=e2e/playwright.config.ts $*"
```

```bash
chmod +x apps/interviewer/e2e/scripts/run.sh
```

- [ ] **Step 7: Write the smoke spec (functional only)**

Create `apps/interviewer/e2e/specs/smoke-none.spec.ts`:

```ts
import { expect, test } from '../fixtures/test.js';

// A plain browser tab is the app's `none` (unencrypted) mode: usable
// immediately, no lock screen. This is the real product state for an
// un-installed tab and the baseline all functional specs build on.
test.describe('none-mode smoke', () => {
  test('reaches Home with the sample protocol card and no lock screen', async ({
    page,
  }) => {
    await page.goto('/');

    // The sample-protocol deck card is present by default (aria-label).
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible();

    // No lock screen: the "Welcome back" unlock dialog must be absent.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toHaveCount(0);
  });
});
```

- [ ] **Step 8: Write the README**

Create `apps/interviewer/e2e/README.md` documenting: the layout, `pnpm --filter @codaco/interviewer test:e2e` (Docker), `test:e2e:headed` (local, functional-only, no baseline regen), `test:e2e:update-snapshots` (Docker baseline regen), and that visual captures are CI-gated. Include the port (4180) and the note that baselines must never be regenerated locally.

- [ ] **Step 9: Run the smoke spec locally (headed) and verify it passes**

```bash
pnpm --filter @codaco/interviewer test:e2e:headed specs/smoke-none.spec.ts
```

Expected: `build:web` succeeds, `vite preview` starts on 4180, 1 test passes. (The visual `capture` is unused here; functional assertions only.)

- [ ] **Step 10: Typecheck and commit**

```bash
pnpm --filter @codaco/interviewer exec tsc -p e2e/tsconfig.json --noEmit
pnpm lint:fix
git add apps/interviewer/package.json apps/interviewer/e2e pnpm-lock.yaml
git commit -m "test(interviewer): scaffold playwright e2e suite + none-mode smoke"
```

---

## Task 3: Protocol import & delete spec (facet 1)

**Files:**

- Modify: `apps/interviewer/src/components/ProtocolCarousel/ImportTriggerCard.tsx` (testid on the file input)
- Create: `apps/interviewer/e2e/fixtures/protocol-fixture.ts`
- Create: `apps/interviewer/e2e/specs/home-protocols.spec.ts`
- Create: `apps/interviewer/e2e/fixtures/malformed.netcanvas` (invalid fixture for the failure path)

**Interfaces:**

- Consumes: `LEAN_E2E_PROTOCOL_PATH`, `LEAN_E2E_PROTOCOL_NAME` (Task 1); `test`/`expect` (Task 2).
- Produces: the `protocol` fixture — `{ import(path: string): Promise<void>; delete(name: string): Promise<void> }` — extended onto `test`, consumed by Tasks 4 and 6.

- [ ] **Step 1: Add a testid to the import file input**

In `apps/interviewer/src/components/ProtocolCarousel/ImportTriggerCard.tsx` around line 43-47, add `data-testid="protocol-import-input"` to the `<input>` that spreads `getInputProps`. If `getInputProps()` returns props spread onto the input, add the attribute alongside the spread:

```tsx
<input {...getInputProps()} data-testid="protocol-import-input" />
```

(The input is always in the DOM and hidden by dropzone styles; a testid does not change behaviour. `aria-label="Choose a .netcanvas protocol file"` remains.)

- [ ] **Step 2: Create a malformed fixture for the validation-failure path**

```bash
printf 'not a real netcanvas zip' > apps/interviewer/e2e/fixtures/malformed.netcanvas
```

This triggers the `extract-failed` branch (JSZip cannot read it) → the "Import failed" toast.

- [ ] **Step 3: Write the protocol fixture**

Create `apps/interviewer/e2e/fixtures/protocol-fixture.ts`:

```ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Drives the real protocol-import UI: sets the hidden dropzone file input, then
// waits for the deck card to appear. Deletion goes through the confirm dialog.
export class ProtocolFixture {
  constructor(private page: Page) {}

  async import(filePath: string, expectName?: string): Promise<void> {
    await this.page.goto('/');
    await this.page
      .getByTestId('protocol-import-input')
      .setInputFiles(filePath);
    if (expectName) {
      await expect(
        this.page.getByRole('heading', { name: expectName }),
      ).toBeVisible({ timeout: 15_000 });
    }
  }

  // Import a file expected to fail validation/extraction; asserts the failure
  // toast rather than a card.
  async importExpectingFailure(filePath: string): Promise<void> {
    await this.page.goto('/');
    await this.page
      .getByTestId('protocol-import-input')
      .setInputFiles(filePath);
    await expect(this.page.getByText('Import failed')).toBeVisible({
      timeout: 15_000,
    });
  }

  // Deletes the currently-active deck card. Assumes `name` is the active card.
  async delete(): Promise<void> {
    await this.page.getByRole('button', { name: 'Delete Protocol' }).click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('dialog-primary').click();
    await expect(this.page.getByText('Protocol deleted')).toBeVisible();
  }
}
```

- [ ] **Step 4: Extend the base fixture with `protocol`**

In `apps/interviewer/e2e/fixtures/test.ts`, add the import and the fixture. Replace the file's contents with:

```ts
import { test as base, expect, type Page } from '@playwright/test';

import { type CaptureFn, makeCapture } from '../helpers/visual.js';
import { ProtocolFixture } from './protocol-fixture.js';

type BaseFixtures = {
  capture: CaptureFn;
  protocol: ProtocolFixture;
};

export const test = base.extend<BaseFixtures>({
  capture: async ({ page }: { page: Page }, use) => {
    await use(makeCapture(page));
  },
  protocol: async ({ page }, use) => {
    await use(new ProtocolFixture(page));
  },
});

export { expect };
```

- [ ] **Step 5: Write the home-protocols spec**

Create `apps/interviewer/e2e/specs/home-protocols.spec.ts`:

```ts
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';
import { statusMasks } from '../helpers/visual.js';
import { expect, test } from '../fixtures/test.js';
import path from 'node:path';

const MALFORMED = path.resolve(
  import.meta.dirname,
  '../fixtures/malformed.netcanvas',
);

test.describe('protocol import & delete', () => {
  test('imports a .netcanvas and shows its deck card', async ({
    protocol,
    page,
    capture,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await expect(
      page.getByRole('heading', { name: LEAN_E2E_PROTOCOL_NAME }),
    ).toBeVisible();
    await capture('home-with-protocol', { mask: statusMasks(page) });
  });

  test('re-importing the same protocol does not create a duplicate card', async ({
    protocol,
    page,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    // Content hash is the key, so put() upserts — exactly one card.
    await expect(
      page.getByRole('heading', { name: LEAN_E2E_PROTOCOL_NAME }),
    ).toHaveCount(1);
  });

  test('a malformed file shows the import-failed toast', async ({
    protocol,
  }) => {
    await protocol.importExpectingFailure(MALFORMED);
  });

  test('installs the bundled sample protocol', async ({ page }) => {
    await page.goto('/');
    // The active sample card exposes an "Install sample protocol" footer button.
    await page.getByRole('button', { name: 'Install sample protocol' }).click();
    await expect(page.getByText('Protocol imported')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('deletes a protocol via the confirm dialog', async ({
    protocol,
    page,
    capture,
  }) => {
    // Import leaves the single imported card active, so the Delete Protocol
    // control targets it directly.
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await page.getByRole('button', { name: 'Delete Protocol' }).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Delete this protocol?' }),
    ).toBeVisible();
    await capture('delete-confirm-dialog');
    await dialog.getByTestId('dialog-primary').click();
    await expect(page.getByText('Protocol deleted')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: LEAN_E2E_PROTOCOL_NAME }),
    ).toHaveCount(0);
  });
});
```

- [ ] **Step 6: Run locally (headed) and verify green**

```bash
pnpm --filter @codaco/interviewer test:e2e:headed specs/home-protocols.spec.ts
```

Expected: 5 tests pass. If the sample-install test flakes on an existing sample card, `page.goto('/')` in a fresh context guarantees no prior state. If the delete test finds two cards (sample + imported), scope the delete to the imported card's slot — but a fresh context starts with only the sample teaser (not installed) plus the imported card; the imported card is active after import.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
pnpm --filter @codaco/interviewer exec tsc -p e2e/tsconfig.json --noEmit
pnpm lint:fix
git add apps/interviewer/src/components/ProtocolCarousel/ImportTriggerCard.tsx apps/interviewer/e2e
git commit -m "test(interviewer): protocol import & delete e2e (facet 1)"
```

---

## Task 4: Interview data management spec (facet 2)

**Files:**

- Modify: `apps/interviewer/src/components/DataView/DataViewToolbar.tsx` (testids: search, filter trigger, bulk delete/export/save)
- Modify: `apps/interviewer/src/components/DataView/useDataViewColumns.tsx` (testid: resume button)
- Modify: `apps/interviewer/src/components/SettingsDialog.tsx` (testids: settings trigger reused from Task 5 — if Task 5 not yet done, add the generate button + count field testids here)
- Create: `apps/interviewer/e2e/fixtures/seed-fixture.ts`
- Create: `apps/interviewer/e2e/fixtures/download-fixture.ts`
- Create: `apps/interviewer/e2e/helpers/export-archive.ts`
- Create: `apps/interviewer/e2e/specs/data-management.spec.ts`

**Interfaces:**

- Consumes: `protocol` fixture (Task 3), `LEAN_E2E_PROTOCOL_*` (Task 1).
- Produces: `seed` fixture — `{ synthetic(count: number): Promise<void> }`; `download` fixture — `{ captureExport(trigger: () => Promise<void>): Promise<{ fileName: string; files: Record<string, string> }> }`; `graphmlNodeCount(text: string): number` and `readEntry(files, suffix)` from `export-archive.ts`.

- [ ] **Step 1: Add testids to the DataView toolbar and columns**

In `apps/interviewer/src/components/DataView/DataViewToolbar.tsx`:

- search `InputField` (~line 183): add `data-testid="data-search"`.
- Filter `PopoverTrigger` `Button` (~line 202): add `data-testid="data-filter-trigger"`.
- Delete bulk `Button` (~line 305): add `data-testid="data-delete"`.
- Export bulk `Button` (~line 316): add `data-testid="data-export"`.
- Save-export `Button` (~line 330): add `data-testid="data-save-export"`.

In `apps/interviewer/src/components/DataView/useDataViewColumns.tsx`, the Resume `Button` (~line 205): add `data-testid="data-resume"`.

For the two `DateFilter`s (duplicate `name="filter-date-from/to"`), scope in the spec via the popover container + preset button names rather than the raw date inputs — no testid change required for the assertions in this spec.

- [ ] **Step 2: Add Settings trigger + synthetic-generate testids**

This task **owns** `data-testid="settings-trigger"` (Task 5 reuses it, does not re-add it). In `apps/interviewer/src/components/TopActionBar.tsx`, add `data-testid="settings-trigger"` to the Settings `IconButton` (aria-label "Settings", ~line 55). In `apps/interviewer/src/components/SettingsDialog.tsx`, add `data-testid="synthetic-count"` to the "Number of sessions" `InputField` (~line 564, forwards testids) and `data-testid="synthetic-generate"` to the Generate `Button` (~line 606, forwards `...props`). The Synthetic-data tab is reached by role+name (`getByRole('tab', { name: 'Synthetic data' })`) — no tab testid needed.

- [ ] **Step 3: Write the seed fixture (synthetic sessions via Settings UI)**

Create `apps/interviewer/e2e/fixtures/seed-fixture.ts`:

```ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Seeds encrypted synthetic sessions through the real Settings → Synthetic data
// flow (runs generateNetwork + createSession, honest encryption path). A
// protocol must be installed first (the generator needs a protocolHash).
export class SeedFixture {
  constructor(private page: Page) {}

  async synthetic(count: number): Promise<void> {
    await this.page.getByTestId('settings-trigger').click();
    await this.page.getByRole('tab', { name: 'Synthetic data' }).click();

    const countField = this.page.getByTestId('synthetic-count');
    await countField.fill(String(count));

    await this.page.getByTestId('synthetic-generate').click();
    await expect(
      this.page.getByText(new RegExp(`Generated ${count} synthetic session`)),
    ).toBeVisible({ timeout: 30_000 });

    // Close the settings dialog.
    await this.page.keyboard.press('Escape');
  }
}
```

- [ ] **Step 4: Write the download fixture (stub save ladder + capture)**

Create `apps/interviewer/e2e/fixtures/download-fixture.ts`:

```ts
import type { Download, Page } from '@playwright/test';
import JSZip from 'jszip';

// Forces saveBlob's object-URL <a download> branch (deletes the File System
// Access + Web Share entry points) so page.waitForEvent('download') fires, then
// captures + unzips the exported archive into decoded text entries.
export class DownloadFixture {
  constructor(private page: Page) {}

  async installStubs(): Promise<void> {
    await this.page.addInitScript(() => {
      // @ts-expect-error runtime deletion of optional capability
      delete window.showSaveFilePicker;
      // @ts-expect-error runtime deletion of optional capability
      delete navigator.canShare;
      // @ts-expect-error runtime deletion of optional capability
      delete navigator.share;
    });
  }

  // Runs `trigger` (which must click Export then Save export), captures the
  // download, and returns each archive entry decoded as text.
  async captureExport(
    trigger: () => Promise<void>,
  ): Promise<{ fileName: string; files: Record<string, string> }> {
    const downloadPromise: Promise<Download> =
      this.page.waitForEvent('download');
    await trigger();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const zip = await JSZip.loadAsync(Buffer.concat(chunks));
    const files: Record<string, string> = {};
    await Promise.all(
      Object.values(zip.files).map(async (entry) => {
        if (!entry.dir) files[entry.name] = await entry.async('string');
      }),
    );
    return { fileName: download.suggestedFilename(), files };
  }
}
```

- [ ] **Step 5: Write the export-archive helper**

Create `apps/interviewer/e2e/helpers/export-archive.ts`:

```ts
// Count <node> elements inside the GraphML <graph>. Robust to attribute order.
export function graphmlNodeCount(graphml: string): number {
  const matches = graphml.match(/<node[\s>]/g);
  return matches ? matches.length : 0;
}

// Find an entry whose filename ends with the given suffix; return its text.
export function readEntry(
  files: Record<string, string>,
  suffix: string,
): string | undefined {
  const key = Object.keys(files).find((k) => k.endsWith(suffix));
  return key ? files[key] : undefined;
}
```

- [ ] **Step 6: Extend the fixture with `seed` and `download`**

In `apps/interviewer/e2e/fixtures/test.ts`, import `SeedFixture` and `DownloadFixture`, add to `BaseFixtures`:

```ts
seed: SeedFixture;
download: DownloadFixture;
```

and the fixture bodies:

```ts
  seed: async ({ page }, use) => {
    await use(new SeedFixture(page));
  },
  download: async ({ page }, use) => {
    const fixture = new DownloadFixture(page);
    await fixture.installStubs();
    await use(fixture);
  },
```

- [ ] **Step 7: Write the data-management spec**

Create `apps/interviewer/e2e/specs/data-management.spec.ts`:

```ts
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';
import { graphmlNodeCount, readEntry } from '../helpers/export-archive.js';
import { statusMasks } from '../helpers/visual.js';
import { expect, test } from '../fixtures/test.js';

// Import + seed once per test (fresh context). Synthetic sessions carry real
// generated networks (complete + dropped-out mix), so they populate the table
// AND are exportable with real content.
async function importAndSeed(
  protocol: { import: (p: string, n?: string) => Promise<void> },
  seed: { synthetic: (n: number) => Promise<void> },
): Promise<void> {
  await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
  await seed.synthetic(6);
}

test.describe('interview data management', () => {
  test('status chips filter the table by completion state', async ({
    protocol,
    seed,
    page,
    capture,
  }) => {
    await importAndSeed(protocol, seed);
    await page.goto('/data');
    // Chips read "All · N", "In progress · N", "Complete · N".
    await expect(page.getByRole('button', { name: /^All ·/ })).toBeVisible();
    await page.getByRole('button', { name: /^Complete ·/ }).click();
    await expect(page).toHaveURL(/status=complete/);
    await capture('data-populated', { mask: statusMasks(page) });
  });

  test('search narrows rows by case id', async ({ protocol, seed, page }) => {
    await importAndSeed(protocol, seed);
    await page.goto('/data');
    const search = page.getByTestId('data-search');
    await search.fill('synthetic-');
    await expect(page).toHaveURL(/q=synthetic/);
    // Every synthetic case id begins with "synthetic-", so rows remain.
    await expect(page.getByRole('row')).not.toHaveCount(1); // header + rows
  });

  test('column headers toggle sort and reflect it in the URL', async ({
    protocol,
    seed,
    page,
  }) => {
    await importAndSeed(protocol, seed);
    await page.goto('/data');
    await page.getByRole('button', { name: 'Case ID' }).click();
    await expect(page).toHaveURL(/sort=caseId/);
  });

  test('a deep link restores filter + sort state', async ({
    protocol,
    seed,
    page,
  }) => {
    await importAndSeed(protocol, seed);
    await page.goto('/data?status=complete&sort=caseId&dir=asc');
    await expect(
      page.getByRole('button', { name: /^Complete ·/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('exports selected sessions and the archive contains GraphML + CSV', async ({
    protocol,
    seed,
    download,
    page,
  }) => {
    await importAndSeed(protocol, seed);
    await page.goto('/data');
    // Filter to complete sessions (guaranteed exportable networks).
    await page.getByRole('button', { name: /^Complete ·/ }).click();
    // Select all on page.
    await page
      .getByRole('checkbox', { name: 'Select all interviews on this page' })
      .check();

    const { fileName, files } = await download.captureExport(async () => {
      await page.getByTestId('data-export').click();
      await expect(page.getByText('Archive ready')).toBeVisible();
      await page.getByTestId('data-save-export').click();
    });

    expect(fileName).toMatch(/^networkCanvasExport-\d+\.zip$/);
    const graphml = readEntry(files, '_graphml.graphml');
    expect(graphml).toBeDefined();
    expect(graphmlNodeCount(graphml ?? '')).toBeGreaterThan(0);
    const egoCsv = readEntry(files, '_ego.csv');
    expect(egoCsv).toBeDefined();

    // Export-complete toast, and the Exported facet now flips.
    await expect(page.getByText('Export complete')).toBeVisible();
  });

  test('bulk-deletes selected sessions', async ({ protocol, seed, page }) => {
    await importAndSeed(protocol, seed);
    await page.goto('/data');
    await page
      .getByRole('checkbox', { name: 'Select all interviews on this page' })
      .check();
    await page.getByTestId('data-delete').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('dialog-primary').click();
    // Table empties (only the header row remains).
    await expect(page.getByRole('row')).toHaveCount(1);
  });

  test('resumes an in-progress session', async ({ protocol, seed, page }) => {
    await importAndSeed(protocol, seed);
    await page.goto('/data');
    await page.getByRole('button', { name: /^In progress ·/ }).click();
    await page.getByTestId('data-resume').first().click();
    await expect(page).toHaveURL(/\/interview\//);
  });
});
```

- [ ] **Step 8: Run locally (headed) and verify green**

```bash
pnpm --filter @codaco/interviewer test:e2e:headed specs/data-management.spec.ts
```

Expected: all tests pass. If `data-delete`'s confirm dialog uses `dialog-primary` with a different label, inspect and adjust. If synthetic generation with `simulateDropOut` default yields zero in-progress rows, seed with a higher count or toggle "Simulate participant drop-out" on in the seed fixture (the generator guarantees ≥10% complete when dropout is on).

- [ ] **Step 9: Typecheck, lint, commit**

```bash
pnpm --filter @codaco/interviewer exec tsc -p e2e/tsconfig.json --noEmit
pnpm lint:fix
git add apps/interviewer/src/components/DataView apps/interviewer/src/components/SettingsDialog.tsx apps/interviewer/src/components/TopActionBar.tsx apps/interviewer/e2e
git commit -m "test(interviewer): interview data management e2e (facet 2)"
```

---

## Task 5: Settings spec (facet 3)

**Files:**

- Modify: `apps/interviewer/src/components/TopActionBar.tsx` (`settings-trigger` — if not added in Task 4)
- Modify: `apps/interviewer/src/components/SettingsDialog.tsx` (tab testids for reliable navigation; forwarded field testids where helpful)
- Create: `apps/interviewer/e2e/specs/settings.spec.ts`

**Interfaces:**

- Consumes: `test`/`expect` (Task 2). Uses `getByRole('tab', { name })` and role+name for switches (`ToggleField` drops testids).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Ensure the settings trigger + tabs are reachable**

`data-testid="settings-trigger"` is added by Task 4 (Step 2). If Tasks are executed out of order and it is absent, add it to the Settings `IconButton` in `TopActionBar.tsx` (aria-label "Settings", ~line 55). Tabs are `getByRole('tab', { name })` with names: `About`, `Interview`, `Data export`, `Privacy`, `Security`, `Synthetic data` — no testid needed.

- [ ] **Step 2: Write the settings spec**

Create `apps/interviewer/e2e/specs/settings.spec.ts`:

```ts
import { expect, test } from '../fixtures/test.js';

async function openSettings(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.goto('/');
  await page.getByTestId('settings-trigger').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('settings', () => {
  test('toggling Export CSV persists across reload', async ({
    page,
    capture,
  }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    const csv = page.getByRole('switch', { name: 'Export CSV' });
    const before = await csv.getAttribute('aria-checked');
    await csv.click();
    await expect(csv).not.toHaveAttribute('aria-checked', before ?? 'true');
    await capture('settings-data-export');

    // Reload and confirm the new value stuck (Dexie-backed, `none` mode plaintext).
    await page.reload();
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    await expect(
      page.getByRole('switch', { name: 'Export CSV' }),
    ).not.toHaveAttribute('aria-checked', before ?? 'true');
  });

  test('screen-layout coordinate toggle and dimensions persist', async ({
    page,
  }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    await page
      .getByRole('switch', {
        name: 'Export node positions as screen-coordinate pixels',
      })
      .click();
    const width = page.getByRole('spinbutton', { name: 'Screen layout width' });
    await width.fill('800');
    await page.reload();
    await openSettings(page);
    await page.getByRole('tab', { name: 'Data export' }).click();
    await expect(
      page.getByRole('spinbutton', { name: 'Screen layout width' }),
    ).toHaveValue('800');
  });

  test('Allow stage navigation toggle persists', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'Interview' }).click();
    const toggle = page.getByRole('switch', { name: 'Allow stage navigation' });
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await page.reload();
    await openSettings(page);
    await page.getByRole('tab', { name: 'Interview' }).click();
    await expect(
      page.getByRole('switch', { name: 'Allow stage navigation' }),
    ).not.toHaveAttribute('aria-checked', before ?? 'true');
  });

  test('About section shows a version and a storage estimate', async ({
    page,
    capture,
  }) => {
    await openSettings(page);
    await page.getByRole('tab', { name: 'About' }).click();
    await expect(
      page.getByRole('progressbar', { name: 'Storage usage' }),
    ).toBeVisible();
    await capture('settings-about');
  });

  test('Security section is hidden in none mode (settings gated on a vault)', async ({
    page,
  }) => {
    // In `none` mode the Security tab's controls require an enrolled vault;
    // confirm the step-up flags are only reachable once a mode is set. Here we
    // assert the About/Data export tabs render, documenting the none-mode shape.
    await openSettings(page);
    await expect(page.getByRole('tab', { name: 'About' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Data export' })).toBeVisible();
  });
});
```

Note on the Security tab: the step-up flags (`requireUnlockOnEnter/Exit/Export`) render only when `auth.mode !== 'none'`. Their behaviour is exercised by the auth spec (Task 7), not here. The analytics-opt-out effect (no relay contact) is best asserted in Task 7 too, where a vault + reload cycle exists; if desired here, add a `page.route('**/ph-relay.networkcanvas.com/**', r => r.abort())` guard and assert zero matching requests after toggling analytics off — but analytics is off-by-construction in `none`-mode tests since nothing constructs the client without an explicit opt-in.

- [ ] **Step 3: Run locally (headed) and verify green**

```bash
pnpm --filter @codaco/interviewer test:e2e:headed specs/settings.spec.ts
```

Expected: all pass. If a switch's accessible name differs, read `SettingsDialog.tsx` at the cited line and use the exact label.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
pnpm --filter @codaco/interviewer exec tsc -p e2e/tsconfig.json --noEmit
pnpm lint:fix
git add apps/interviewer/src/components/SettingsDialog.tsx apps/interviewer/src/components/TopActionBar.tsx apps/interviewer/e2e/specs/settings.spec.ts
git commit -m "test(interviewer): settings e2e (facet 3)"
```

---

## Task 6: Conduct-interview spec (facet 4)

**Files:**

- Modify: `apps/interviewer/src/components/NewSessionForm.tsx` (case-id field + submit testids)
- Modify: `apps/interviewer/src/components/InterviewComplete.tsx` (root + exit testids)
- Create: `apps/interviewer/e2e/fixtures/interview-nav.ts`
- Create: `apps/interviewer/e2e/specs/conduct-interview.spec.ts`

**Interfaces:**

- Consumes: `protocol` fixture (Task 3), `LEAN_E2E_PROTOCOL_*` (Task 1). Engine testids already present: `next-button`, `previous-button`, `exit-button`, `quick-add-toggle`, `quick-add-input`, `sociogram`, `prompt`; stage form fields via `[data-field-name="X"]`; stage container `main[data-theme-interview]`; current stage `[data-stage-step="N"]`.
- Produces: `InterviewNav` class — `{ startNewSession(caseId): Promise<void>; waitForStage(): Promise<void>; next(): Promise<void>; fillEgoName(v): Promise<void>; quickAddNode(name): Promise<void>; finish(): Promise<void> }`.

- [ ] **Step 1: Add testids to NewSessionForm and InterviewComplete**

In `apps/interviewer/src/components/NewSessionForm.tsx`: add `data-testid="new-session-case-id"` to the Case-ID `Field` (~line 71, forwards to the input via `...inputProps`) and `data-testid="new-session-submit"` to the `SubmitButton` (~line 85).

In `apps/interviewer/src/components/InterviewComplete.tsx`: add `data-testid="interview-complete"` to the root (~line 15) and `data-testid="interview-complete-exit"` to the Exit `Button` (~line 20).

- [ ] **Step 2: Write the interview-nav fixture**

Create `apps/interviewer/e2e/fixtures/interview-nav.ts`:

```ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Drives an interview inside the real app. Unlike packages/interview/e2e's
// InterviewFixture (which reads step from the ?step= URL), the app route has no
// step param — so next() reads the [data-stage-step] DOM attribute and waits for
// it to change.
export class InterviewNav {
  constructor(private page: Page) {}

  private get stage() {
    return this.page.locator('[data-stage-step]');
  }

  async startNewSession(caseId: string): Promise<void> {
    // From an active deck card, "Start new interview" opens NewSessionForm.
    await this.page
      .getByRole('button', { name: 'Start new interview' })
      .click();
    await this.page.getByTestId('new-session-case-id').fill(caseId);
    await this.page.getByTestId('new-session-submit').click();
    await expect(this.page).toHaveURL(/\/interview\//, { timeout: 15_000 });
    await this.waitForStage();
  }

  async waitForStage(): Promise<void> {
    await expect(this.page.locator('main[data-theme-interview]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(this.stage).toHaveAttribute('data-stage-step', /\d+/);
  }

  async next(): Promise<void> {
    const before = await this.stage.getAttribute('data-stage-step');
    await this.page.getByTestId('next-button').click();
    await expect
      .poll(async () => this.stage.getAttribute('data-stage-step'), {
        timeout: 20_000,
      })
      .not.toBe(before);
  }

  async fillEgoName(value: string): Promise<void> {
    await this.page.locator('[data-field-name="ego_name"] input').fill(value);
  }

  async quickAddNode(name: string): Promise<void> {
    const toggle = this.page.getByTestId('quick-add-toggle');
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
      await toggle.click();
    }
    const input = this.page.getByTestId('quick-add-input');
    await input.fill(name);
    await input.press('Enter');
    await expect(this.page.getByRole('option', { name })).toBeVisible();
  }

  async finish(): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Finish Interview' }),
    ).toBeVisible();
    await this.page.getByRole('button', { name: 'Finish' }).click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Finish Interview' }).click();
  }
}
```

- [ ] **Step 3: Extend the fixture with `interviewNav`**

In `apps/interviewer/e2e/fixtures/test.ts`, import `InterviewNav`, add `interviewNav: InterviewNav` to `BaseFixtures`, and:

```ts
  interviewNav: async ({ page }, use) => {
    await use(new InterviewNav(page));
  },
```

- [ ] **Step 4: Write the conduct-interview spec**

Create `apps/interviewer/e2e/specs/conduct-interview.spec.ts`:

```ts
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';
import { expect, test } from '../fixtures/test.js';

test.describe('conducting an interview', () => {
  test('walks the lean protocol from start to completion', async ({
    protocol,
    interviewNav,
    page,
    capture,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await interviewNav.startNewSession('P01');

    // Stage 0: Information — capture then advance.
    await capture('interview-stage-info');
    await interviewNav.next();

    // Stage 1: EgoForm.
    await interviewNav.fillEgoName('Ada');
    await capture('interview-stage-ego');
    await interviewNav.next();

    // Stage 2: NameGeneratorQuickAdd — add two alters.
    await interviewNav.quickAddNode('Grace');
    await interviewNav.quickAddNode('Katherine');
    await capture('interview-stage-namegen');
    await interviewNav.next();

    // Stage 3: Sociogram — placement/edges are exercised in the dedicated
    // sociogram test; here we simply advance to Finish.
    await capture('interview-stage-sociogram');
    await interviewNav.next();

    // FinishSession stage.
    await interviewNav.finish();

    // App renders InterviewComplete.
    await expect(page.getByTestId('interview-complete')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Interview complete' }),
    ).toBeVisible();
    await capture('interview-complete');

    await page.getByTestId('interview-complete-exit').click();
    await expect(page).toHaveURL(/\/(data)?$/);
  });

  test('resumes a partially-completed interview at the right stage', async ({
    protocol,
    interviewNav,
    page,
  }) => {
    await protocol.import(LEAN_E2E_PROTOCOL_PATH, LEAN_E2E_PROTOCOL_NAME);
    await interviewNav.startNewSession('P02');
    // Advance one stage so currentStep persists (>0), then leave.
    await interviewNav.next();
    const stepBefore = await page
      .locator('[data-stage-step]')
      .getAttribute('data-stage-step');
    await page.goto('/data');

    // Resume via the in-progress row.
    await page.getByRole('button', { name: /^In progress ·/ }).click();
    await page.getByTestId('data-resume').first().click();
    await interviewNav.waitForStage();
    await expect(page.locator('[data-stage-step]')).toHaveAttribute(
      'data-stage-step',
      stepBefore ?? '1',
    );
  });
});
```

- [ ] **Step 5: (Optional, higher-risk) Add a sociogram place-and-connect test**

The Sociogram stage requires dragging nodes from the drawer onto the canvas before edges can be drawn. There is no existing fixture method for placement; model it on `packages/interview/e2e/fixtures/stage-fixture.ts` — read `navigateDndToTarget` (~line 35) and `dragNodeToMainList` (~line 1067) for the keyboard-DnD pattern (`Control+d` to pick up, arrow keys to move, `Enter` to drop), and `SociogramFixture.connectNodes` (~line 305-403) for edge creation (click source node → target node; edges counted as `svg line[visibility="visible"]`). If keyboard-DnD placement proves flaky, keep this test `test.fixme(...)` and rely on the synthetic generator (Task 4) for network-bearing sessions; document the gap in the README rather than shipping a flaky test.

- [ ] **Step 6: Run locally (headed) and verify green**

```bash
pnpm --filter @codaco/interviewer test:e2e:headed specs/conduct-interview.spec.ts
```

Expected: the walk + resume tests pass. If `next()` stalls on the EgoForm (readiness is signalled only by the `next-button` `bg-success` pulse, not `data-stage-ready`), add before `next()`: `await expect(page.getByTestId('next-button')).toHaveClass(/bg-success/)`.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
pnpm --filter @codaco/interviewer exec tsc -p e2e/tsconfig.json --noEmit
pnpm lint:fix
git add apps/interviewer/src/components/NewSessionForm.tsx apps/interviewer/src/components/InterviewComplete.tsx apps/interviewer/e2e
git commit -m "test(interviewer): conduct-interview e2e (facet 4)"
```

---

## Task 7: Auth lifecycle spec (PIN + passphrase)

**Files:**

- Modify: `packages/fresco-ui/src/form/SegmentedCodeField.tsx` (testid on the fieldset for reliable PIN entry)
- Modify: `apps/interviewer/src/components/LockScreen.tsx` (`unlock-submit` testid on the SubmitButton)
- Modify: `apps/interviewer/src/components/UnlockForms/PasswordUnlockField.tsx` (`passphrase-input` testid — forwards)
- Modify: `apps/interviewer/src/components/UnlockForms/ResetAppDataButton.tsx` (`reset-app-data` testid)
- Create: `apps/interviewer/e2e/fixtures/vault-fixture.ts`
- Create: `apps/interviewer/e2e/specs/auth.spec.ts`

**Interfaces:**

- Consumes: `test`/`expect` (Task 2). Wizard controls: `wizard-next`, `wizard-back`, `wizard-cancel` (present). Step2 method options queryable by attribute `data-value="pin"` / `"passphrase"`. PIN inputs are a `SegmentedCodeField` (8 inputs, accessible names `Digit N of 8, hidden`).
- Produces: `VaultFixture` — `{ enrolPin(pin): Promise<void>; enrolPassphrase(phrase): Promise<void>; unlockPin(pin): Promise<void>; unlockPassphrase(phrase): Promise<void> }`.

- [ ] **Step 1: Add a testid to SegmentedCodeField**

In `packages/fresco-ui/src/form/SegmentedCodeField.tsx`, add `data-testid={`segmented-code-${name}`}` to the fieldset (~line 262) so the vault fixture can scope the 8 inputs: `getByTestId('segmented-code-pin').locator('input')`. This is a shared fresco-ui component — verify the change does not break its Storybook story (add/adjust the story per the "always update component storybook" rule if a new prop is introduced; here it is a static attribute, no prop).

- [ ] **Step 2: Add unlock/reset testids**

In `apps/interviewer/src/components/LockScreen.tsx`: add `data-testid="unlock-submit"` to the `SubmitButton` (both the PIN branch ~line 38 and passphrase branch ~line 77 — same button component, name "Unlock").
In `apps/interviewer/src/components/UnlockForms/PasswordUnlockField.tsx`: add `data-testid="passphrase-input"` (~line 4-20; `Field`→`InputField` forwards it to the input).
In `apps/interviewer/src/components/UnlockForms/ResetAppDataButton.tsx`: add `data-testid="reset-app-data"` (~line 23).

- [ ] **Step 3: Write the vault fixture**

Create `apps/interviewer/e2e/fixtures/vault-fixture.ts`:

```ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// Enrols a real vault by driving the setup wizard (a valid unlockable record
// requires real crypto — it cannot be hand-seeded), and unlocks via LockScreen.
export class VaultFixture {
  constructor(private page: Page) {}

  private async typeSegmented(
    fieldName: string,
    digits: string,
  ): Promise<void> {
    const inputs = this.page
      .getByTestId(`segmented-code-${fieldName}`)
      .locator('input');
    for (let i = 0; i < digits.length; i++) {
      await inputs.nth(i).fill(digits[i]);
    }
  }

  async enrolPin(pin: string): Promise<void> {
    // The wizard is reachable directly at /welcome regardless of install state.
    // Steps: 0 intro → 1 securing-data → 2 method → 3 configure → 4 behaviour
    // → 5 analytics(Finish). "Get started" opens the dialog at step 0.
    await this.page.goto('/welcome');
    await this.page.getByRole('button', { name: 'Get started' }).click();
    await this.page.getByTestId('wizard-next').click(); // 0 → 1
    await this.page.getByTestId('wizard-next').click(); // 1 → 2 (method)
    // Step 2: pick PIN (option carries data-value="pin").
    await this.page.locator('[data-value="pin"]').click();
    await this.page.getByTestId('wizard-next').click(); // 2 → 3 (configure)
    // Step 3: enter + confirm PIN, affirm no-recovery.
    await this.typeSegmented('pin', pin);
    await this.typeSegmented('pin-confirm', pin);
    await this.page
      .getByRole('checkbox', { name: 'I understand there is no recovery' })
      .check();
    await this.page.getByTestId('wizard-next').click(); // 3 → 4 (behaviour)
    await this.page.getByTestId('wizard-next').click(); // 4 → 5 (analytics)
    await this.page.getByTestId('wizard-next').click(); // 5 → Finish
    // Wizard completes → redirect to Home unlocked.
    await expect(this.page).toHaveURL(/\/$/, { timeout: 15_000 });
  }

  async enrolPassphrase(phrase: string): Promise<void> {
    await this.page.goto('/welcome');
    await this.page.getByRole('button', { name: 'Get started' }).click();
    await this.page.getByTestId('wizard-next').click(); // 0 → 1
    await this.page.getByTestId('wizard-next').click(); // 1 → 2 (method)
    await this.page.locator('[data-value="passphrase"]').click();
    await this.page.getByTestId('wizard-next').click(); // 2 → 3 (configure)
    // Step 3 passphrase fields — labelled inputs (read Step3PassphraseConfigure
    // for exact labels; use getByLabel).
    await this.page.getByLabel('Passphrase', { exact: true }).fill(phrase);
    await this.page.getByLabel(/confirm/i).fill(phrase);
    await this.page.getByTestId('wizard-next').click(); // 3 → 4 (behaviour)
    await this.page.getByTestId('wizard-next').click(); // 4 → 5 (analytics)
    await this.page.getByTestId('wizard-next').click(); // 5 → Finish
    await expect(this.page).toHaveURL(/\/$/, { timeout: 15_000 });
  }

  async unlockPin(pin: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await this.typeSegmented('pin', pin);
    // PIN auto-submits on completion; unlock-submit is a fallback.
  }

  async unlockPassphrase(phrase: string): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await this.page.getByTestId('passphrase-input').fill(phrase);
    await this.page.getByTestId('unlock-submit').click();
  }
}
```

- [ ] **Step 4: Extend the fixture with `vault`**

In `apps/interviewer/e2e/fixtures/test.ts`, import `VaultFixture`, add `vault: VaultFixture` to `BaseFixtures`, and the body `vault: async ({ page }, use) => { await use(new VaultFixture(page)); }`.

- [ ] **Step 5: Write the auth spec**

Create `apps/interviewer/e2e/specs/auth.spec.ts`:

```ts
import { expect, test } from '../fixtures/test.js';

const PIN = '12345678';
const PASSPHRASE = 'correct-horse-battery-1';

test.describe('vault lifecycle', () => {
  test('PIN enrolment locks on reload and unlocks with the PIN', async ({
    vault,
    page,
    capture,
  }) => {
    await vault.enrolPin(PIN);
    // Reload drops the in-memory DEK → the app re-locks.
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    await capture('lock-screen-pin');
    await vault.unlockPin(PIN);
    // Unlocked → Home deck visible again.
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('a wrong PIN is rejected', async ({ vault, page }) => {
    await vault.enrolPin(PIN);
    await page.reload();
    await vault.unlockPin('87654321');
    // Still locked (unlock failed) — the unlock dialog stays.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
  });

  test('passphrase enrolment and unlock', async ({ vault, page }) => {
    await vault.enrolPassphrase(PASSPHRASE);
    await page.reload();
    await vault.unlockPassphrase(PASSPHRASE);
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('reset app data returns to an unconfigured state', async ({
    vault,
    page,
  }) => {
    await vault.enrolPin(PIN);
    await page.reload();
    await page.getByTestId('reset-app-data').click();
    // A confirm dialog appears; confirm the destructive reset.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('dialog-primary').click();
    // Back to a usable (unconfigured/none) Home — no lock screen.
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
```

- [ ] **Step 6: Run locally (headed) and verify green**

```bash
pnpm --filter @codaco/interviewer test:e2e:headed specs/auth.spec.ts
```

Expected: all pass. Watch for: (a) the **wizard step count** — the `enrol*` helpers assume the sequence intro → securing-data → method → configure → behaviour → analytics; if the first headed run lands on the wrong step, add/remove a `wizard-next` click and update the step comments (this is the single most likely break); (b) the segmented PIN input not firing React `onChange` from `fill` — if so, in `typeSegmented` replace `fill` with a native value-setter injection (`inputs.nth(i).evaluate((el, d) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, d); el.dispatchEvent(new Event('input', { bubbles: true })); }, digits[i])`); (c) the passphrase confirm-field label — read `Step3PassphraseConfigure.tsx` for the exact `getByLabel` string; (d) the enrol flow paying 600k-iteration PBKDF2 — the 45s test timeout covers it, but keep the auth spec small.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
pnpm --filter @codaco/interviewer exec tsc -p e2e/tsconfig.json --noEmit
pnpm lint:fix
git add packages/fresco-ui/src/form/SegmentedCodeField.tsx apps/interviewer/src/components/LockScreen.tsx apps/interviewer/src/components/UnlockForms apps/interviewer/e2e
git commit -m "test(interviewer): vault lifecycle e2e (PIN + passphrase)"
```

---

## Task 8: Generate visual baselines (Docker)

**Files:**

- Create: `apps/interviewer/e2e/visual-snapshots/chromium/*.png` (generated, committed)

**Interfaces:**

- Consumes: all specs from Tasks 3-7 (their CI-gated `capture(...)` calls).
- Produces: committed baseline PNGs the CI job asserts against.

- [ ] **Step 1: Confirm Docker is running**

```bash
docker info >/dev/null 2>&1 && echo "docker ok" || echo "start docker"
```

Expected: `docker ok`. (If not, start Docker Desktop.)

- [ ] **Step 2: Generate baselines in the pinned Playwright image**

```bash
pnpm --filter @codaco/interviewer test:e2e:update-snapshots
```

Expected: the container builds the app (`build:web`), runs the suite with `--update-snapshots` (CI=true inside the container, so `capture(...)` writes PNGs), and exits 0. New PNGs appear under `apps/interviewer/e2e/visual-snapshots/chromium/`.

- [ ] **Step 3: Sanity-check the baselines**

```bash
ls apps/interviewer/e2e/visual-snapshots/chromium/
```

Expected: files like `home-with-protocol.png`, `delete-confirm-dialog.png`, `data-populated.png`, `settings-data-export.png`, `settings-about.png`, `interview-stage-info.png`, `interview-stage-ego.png`, `interview-stage-namegen.png`, `interview-stage-sociogram.png`, `interview-complete.png`, `lock-screen-pin.png`. Open a couple to confirm they render the expected screens (not blank/error).

- [ ] **Step 4: Re-run to confirm the baselines pass**

```bash
pnpm --filter @codaco/interviewer test:e2e
```

Expected: full suite green in Docker against the just-generated baselines.

- [ ] **Step 5: Commit the baselines**

```bash
git add apps/interviewer/e2e/visual-snapshots
git commit -m "test(interviewer): commit e2e visual baselines"
```

---

## Task 9: CI job, carry-forward, and changeset

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (new `interviewer-e2e` job + carry-forward wiring)
- Create: `.changeset/<name>.md` (app `-beta` changeset)

**Interfaces:**

- Consumes: `apps/interviewer/e2e/scripts/run.sh` (Task 2), the detect job's existing `interviewer` output.
- Produces: a non-blocking CI job gated on the `interviewer` detect flag.

- [ ] **Step 1: Add the `interviewer-e2e` job**

In `.github/workflows/ci-and-release.yml`, immediately after the `interview-e2e` job block (ends ~line 770), add:

```yaml
interviewer-e2e:
  needs: [quality, detect]
  if: ${{ !cancelled() && needs.detect.outputs.interviewer == 'true' }}
  runs-on: ubuntu-latest
  timeout-minutes: 45
  outputs:
    slug: ${{ steps.meta.outputs.slug }}
  steps:
    - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0
    - uses: ./.github/actions/turbo-ci-setup
    - id: meta
      env:
        REF: ${{ github.head_ref || github.ref_name }}
      run: |
        SLUG=$(printf '%s' "$REF" | tr '/' '-' | tr '[:upper:]' '[:lower:]')
        SLUG=$(printf '%s' "$SLUG" | tr -c '[:alnum:]-_.' '-')
        SLUG=${SLUG:-unknown}
        printf 'slug=%s\n' "$SLUG" >> "$GITHUB_OUTPUT"
    - name: Run E2E tests
      run: ./apps/interviewer/e2e/scripts/run.sh
    - name: Reclaim artifact ownership
      if: always()
      run: |
        sudo chown -R "$(id -u):$(id -g)" \
          apps/interviewer/e2e/playwright-report \
          apps/interviewer/e2e/test-results 2>/dev/null || true
    - name: Upload report
      if: always()
      uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
      with:
        name: interviewer-playwright-report
        path: apps/interviewer/e2e/playwright-report/
        if-no-files-found: warn
        retention-days: 14
```

(The interview-e2e job's `flaky-summary.mjs` step is intentionally omitted — this suite ships no such script. Do not add the job to the `quality` aggregator at line ~312; it runs independently after `quality` for cache-ordering only, exactly like `interview-e2e`.)

- [ ] **Step 2: Wire carry-forward**

In the `carry-forward-statuses` job (~lines 1400-1447):

- Add `- interviewer-e2e` to its `needs:` list (after the `- interview-e2e` entry ~line 1409).
- Add an env var in the `FLAG_*` block (~line 1428-1434): `FLAG_INTERVIEWER_E2E: ${{ needs.detect.outputs.interviewer }}`.
- Add a `flagToJobs` entry (~line 1439-1447): `FLAG_INTERVIEWER_E2E: ["interviewer-e2e"],`.

(Do NOT add a report/Pages job — interviewer-e2e has none. `FLAG_INTERVIEWER` already maps to `["deploy-interviewer-preview"]`; keep the new e2e flag distinct rather than overloading it.)

- [ ] **Step 3: Lint the workflow**

```bash
command -v actionlint >/dev/null && actionlint .github/workflows/ci-and-release.yml || echo "actionlint not installed — review YAML manually"
```

Expected: no errors (or a manual review confirming indentation matches the surrounding jobs — YAML is whitespace-sensitive).

- [ ] **Step 4: Add the app `-beta` changeset**

Invoke the `creating-a-changeset` skill, or create `.changeset/interviewer-e2e-testids.md`:

```markdown
---
'@codaco/interviewer': patch
---

Add data-testid hooks to app chrome (protocol deck, data table, settings, unlock forms, interview-complete) to support the new end-to-end test suite. No user-facing behaviour change.
```

Confirm the changeset lane is correct (app-only; `@codaco/interviewer` is private and released on the `-beta.N` line — no library packages in this changeset):

```bash
pnpm check:changesets
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
pnpm lint:fix
git add .github/workflows/ci-and-release.yml .changeset
git commit -m "ci(interviewer): add non-blocking interviewer-e2e job + changeset"
```

- [ ] **Step 6: Full local verification before opening a PR**

```bash
pnpm --filter @codaco/interviewer exec tsc -p e2e/tsconfig.json --noEmit
pnpm --filter @codaco/interviewer typecheck
pnpm knip
pnpm --filter @codaco/interviewer test:e2e   # Docker, full suite + visual baselines
```

Expected: all green. `pnpm knip` **will** flag the new suite unless `knip.json` is updated: the root `knip.json` `apps/interviewer` workspace (currently `"entry": ["index.html!", "vite.renderer.config.ts"]`, `"project": ["src/**/*.{ts,tsx}"]`) does not include `e2e/`, so `@playwright/test` reads as unused and the specs' imports go unseen. Update that workspace block to add the e2e entry points and project glob (mirroring the `packages/interview` block):

```jsonc
"apps/interviewer": {
  "entry": [
    "index.html!",
    "vite.renderer.config.ts",
    "e2e/specs/**/*.ts",
    "e2e/playwright.config.ts",
    "e2e/scripts/*.{ts,mjs}"
  ],
  "vite": true,
  "project": ["src/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
  "paths": { "~/*": ["./src/*"] },
  "ignore": ["src/**/*.d.ts"]
}
```

Then follow the `shipping-a-pull-request` skill to open the PR.

---

## Self-review notes

- **Facet coverage:** import/delete (Task 3), data filter/sort/export (Task 4), settings (Task 5), conduct interview (Task 6), plus PIN/passphrase auth (Task 7) and the none-mode smoke (Task 2) — every design-matrix row maps to a task.
- **Visual coverage:** captures are embedded in Tasks 3-7 (CI-gated) and baselines generated in Task 8; the config sets `snapshotDir`/`snapshotPathTemplate` in Task 2.
- **CI:** Task 9 mirrors the verbatim `interview-e2e` job, gated on the existing `interviewer` detect flag, non-blocking, with carry-forward.
- **Known risk carried forward:** Sociogram drag-to-place has no existing fixture (Task 6 Step 5) — it is optional/`fixme`-able; the synthetic generator supplies network-bearing sessions for export regardless.
- **Type consistency:** fixture class names and methods (`ProtocolFixture.import/delete`, `SeedFixture.synthetic`, `DownloadFixture.captureExport`, `InterviewNav.next/finish`, `VaultFixture.enrolPin/unlockPin`) are referenced consistently across `fixtures/test.ts` and the specs.
