# Architect e2e testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chromium-first Playwright e2e suite for `apps/architect` that creates every one of the 19 interface stages from scratch and asserts the saved stage JSON, plus covers protocol import/download/clear, timeline reordering, the printable summary/codebook, and resource management.

**Architecture:** Playwright drives architect's real production build served by `vite preview` (dev server wipes Redux state via optimizeDeps reloads). Two deliberately-added test seams make it robust: `data-field-name` on redux-form fields (for locators) and a build-flag-gated `window.__architectStore` (for JSON assertions). State is seeded through architect's real storage layers — IndexedDB `ArchitectProtocolDB` (durable) and per-tab `sessionStorage` (`@@remember-app` / `@@remember-activeProtocol`). Create-from-scratch specs build stages via the real editor UI using shared page-object sub-flows; app-facet specs run against one hand-authored all-19-interfaces fixture protocol.

**Tech Stack:** Playwright (`@playwright/test` `catalog:` = `^1.61.1`), Vite + Redux (architect), redux-form, Dexie/IndexedDB, JSZip, `@codaco/protocol-validation` (Zod schema 8), Docker (`mcr.microsoft.com/playwright:v<version>-noble`) for visual baselines, turbo + GitHub Actions.

## Global Constraints

Every task's requirements implicitly include this section. Exact values are load-bearing.

- **Chromium only.** One Playwright project (`Desktop Chrome`). No Firefox/WebKit.
- **Playwright deps via `catalog:`.** Add `"@playwright/test": "catalog:"` and `"playwright": "catalog:"` to `apps/architect` `devDependencies`. Catalog pins are `^1.61.1` in `pnpm-workspace.yaml` (lines 44, 83), grouped in dependabot. Never hardcode versions.
- **Docker image tag derived from the lockfile** in `run.sh` (never hardcoded): `PW_VERSION="$(grep -oE '@playwright/test@[0-9]+\.[0-9]+\.[0-9]+' pnpm-lock.yaml | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -uV | tail -1)"`, `IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"`.
- **Visual snapshots are CI-gated and Docker-only.** The capture helper no-ops unless `process.env.CI` is set; baselines are regenerated only inside the Docker image (font rendering). `toHaveScreenshot`: `{ animations: 'disabled', maxDiffPixels: 250 }`. Never regenerate baselines on macOS.
- **`window.__architectStore` is gated on `import.meta.env.VITE_E2E === 'true'`** and must never appear in the production `build:web` bundle (asserted in `assert-pwa-build.mjs`).
- **Pinned port `4301` with `--strictPort`** (distinct from interview's 4101/4200 so both run locally).
- **One app page per browser context.** Two pages on `/protocol*` trip the BroadcastChannel single-editor lock (read-only, autosave off). `serviceWorkers: 'block'` and `reducedMotion: 'reduce'` on the context.
- **CI job is informational, not required** (only `quality` is required on the merge queue). A new conditional job must be wired into FOUR places in `ci-and-release.yml`: a `detect` output, the job itself, `carry-forward-statuses` `needs:`, and its `flagToJobs`/`env` map.
- **knip is part of the required `quality` gate.** e2e spec/helper/config files must be added to the `apps/architect` knip `entry`/`project` globs or CI fails.
- **The all-interfaces fixture is validated in the always-on `test` gate** via a dedicated Vitest test (not the path-filtered development-protocol workflow).
- **Field locator rules** (verified): architect redux-form fields get `data-field-name="<reduxFormFieldName>"` after Task 2. RichText/Tiptap fields are `role="textbox"` with `aria-label` equal to the field name (e.g. `introductionPanel.text`, `text`, `prompt`). The stage-name input is `<input aria-label="Stage name">`. `EntitySelectField` renders clickable pills + a `Create new {node|edge} type` button (NOT a `<select>`). Sections are scoped by `[data-name="..."]`. fresco-ui dialog buttons: `dialog-primary`/`dialog-cancel`/`dialog-secondary`/`dialog-submit`; wizard: `wizard-next`/`wizard-back`/`wizard-cancel`. Variable spotlight rows: `data-testid="spotlight-list-item"`.
- **Save semantics:** the "Finished Editing" toolbar button (`id: finished-editing`) renders ONLY once the draft is dirty; clicking it dispatches `submit('edit-stage')` and only commits if all mounted sync validators pass. Setting `subject` (node/edge type) FIRST is mandatory — dependent sections stay disabled (and their validators unmounted) until it is set.

---

## PR 1 — Harness, seams, seeding, smoke

Produces a runnable e2e harness and a green smoke test. Touches shared `fresco-ui` and app source, so it is its own PR.

### Task 1: Playwright harness scaffold + config + tooling wiring

**Files:**

- Modify: `apps/architect/package.json` (add devDeps + scripts)
- Create: `apps/architect/e2e/playwright.config.ts`
- Create: `apps/architect/e2e/tsconfig.json`
- Modify: `knip.json` (`apps/architect` workspace entry — lines 117–126)
- Modify: `apps/architect/.gitignore` (or root `.gitignore`)

**Interfaces:**

- Produces: an `apps/architect/e2e/` dir with a Playwright config whose `webServer` previews a `dist-e2e` build on port 4301; package scripts `test:e2e`, `test:e2e:headed`, `build:e2e`, `preview:e2e`.

- [ ] **Step 1: Add Playwright devDependencies and scripts to `apps/architect/package.json`**

Add to `devDependencies` (keep alphabetical): `"@playwright/test": "catalog:"`, `"playwright": "catalog:"`. Add to `scripts`:

```jsonc
"build:e2e": "cross-env VITE_E2E=true vite build --outDir dist-e2e",
"preview:e2e": "vite preview --outDir dist-e2e --port 4301 --strictPort",
"test:e2e": "./e2e/scripts/run.sh",
"test:e2e:headed": "pnpm build:e2e && playwright test --config e2e/playwright.config.ts --headed"
```

Check whether `cross-env` is already a dependency (`grep cross-env apps/architect/package.json`); if absent, prefer the shell form `"build:e2e": "VITE_E2E=true vite build --outDir dist-e2e"` (macOS/Linux CI only — this repo's CI is ubuntu, and local dev is darwin, so the bare-env form is safe).

- [ ] **Step 2: Install and verify the dep resolves**

Run: `pnpm install`
Expected: completes; `pnpm --filter @codaco/architect exec playwright --version` prints `Version 1.61.x`.

- [ ] **Step 3: Write `apps/architect/e2e/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  snapshotDir: './visual-snapshots',
  snapshotPathTemplate: '{snapshotDir}/{projectName}/{arg}{ext}',

  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,

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
    baseURL: 'http://localhost:4301',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    viewport: { width: 1920, height: 1080 },
    contextOptions: { reducedMotion: 'reduce', serviceWorkers: 'block' },
  },

  webServer: {
    // Preview a production build (VITE_E2E=true) — NOT the dev server, whose
    // optimizeDeps re-bundling forces mid-test reloads that wipe Redux state.
    // The dist-e2e build is produced upstream by run.sh (Docker) or the
    // test:e2e:headed script; assumes apps/architect/dist-e2e/ exists.
    command:
      'pnpm --filter @codaco/architect exec vite preview --outDir dist-e2e --port 4301 --strictPort',
    port: 4301,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
```

- [ ] **Step 4: Write `apps/architect/e2e/tsconfig.json`**

Mirror the interview e2e tsconfig split:

```jsonc
{
  "extends": "@codaco/tsconfig/web.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "@playwright/test", "vite/client"],
    "paths": { "~/*": ["../src/*"] },
  },
  "include": ["**/*.ts", "fixtures/window-test.d.ts"],
}
```

- [ ] **Step 5: Extend the `apps/architect` knip entry (knip.json lines 117–126)**

Replace the `apps/architect` block with:

```jsonc
    "apps/architect": {
      "entry": [
        "index.html!",
        "preview/index.html!",
        "src/preview-main.tsx!",
        "e2e/specs/**/*.ts",
        "e2e/scripts/*.ts",
        "e2e/fixtures/window-test.d.ts"
      ],
      "vite": true,
      "project": ["src/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
      "paths": {
        "~/*": ["./src/*"]
      },
      "ignoreDependencies": ["@types/recompose"],
      "ignore": ["src/**/*.d.ts"]
    },
```

- [ ] **Step 6: Ignore build/report artifacts**

Add to `apps/architect/.gitignore` (create if missing):

```
dist-e2e/
e2e/playwright-report/
e2e/test-results/
```

(`**/test-results/` and `**/playwright-report/` may already be root-ignored; `dist-e2e/` is architect-specific.)

- [ ] **Step 7: Add `preview/index.html` to the architect build turbo inputs**

`@codaco/architect#build` (turbo.json:65–85) lists `index.html` but not `preview/index.html`, so a preview-only edit can serve a stale cached build. Add `"preview/index.html"` to that task's `inputs` array (right after `"index.html"`):

```jsonc
        "index.html",
        "preview/index.html",
```

- [ ] **Step 8: Verify config parses (no specs yet is fine)**

Run: `pnpm --filter @codaco/architect exec playwright test --config e2e/playwright.config.ts --list`
Expected: "Error: No tests found" or an empty list — NOT a config parse error. (The webServer will not start for `--list`.)

- [ ] **Step 9: Commit**

```bash
git add apps/architect/package.json apps/architect/e2e/playwright.config.ts apps/architect/e2e/tsconfig.json knip.json apps/architect/.gitignore turbo.json pnpm-lock.yaml
git commit -m "test(architect): scaffold Playwright e2e harness"
```

---

### Task 2: `data-field-name` locator seam in fresco-ui

**Files:**

- Modify: `packages/fresco-ui/src/form/Field/UnconnectedField.tsx:75-118`
- Modify: `apps/architect/src/components/Form/FrescoReduxField.tsx:108` (name type)
- Test: `packages/fresco-ui/src/form/Field/__tests__/UnconnectedField.test.tsx` (create or extend)

**Interfaces:**

- Produces: architect redux-form fields render a wrapper `<div data-field-name="<reduxFormFieldName>">`. Consumed by every interface spec's `editor.field(name)` locator.

- [ ] **Step 1: Write the failing test**

Create `packages/fresco-ui/src/form/Field/__tests__/UnconnectedField.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Input from '../../fields/Input';
import UnconnectedField from '../UnconnectedField';

describe('UnconnectedField', () => {
  it('emits data-field-name on the field wrapper for e2e targeting', () => {
    const { container } = render(
      <UnconnectedField
        name="introductionPanel.title"
        label="Title"
        component={Input}
        input={{ value: '', onChange: () => {}, onBlur: () => {} }}
      />,
    );
    expect(
      container.querySelector('[data-field-name="introductionPanel.title"]'),
    ).not.toBeNull();
  });
});
```

Note: confirm the correct minimal `component` and `input` shape by reading a sibling fresco-ui field test (`grep -rl UnconnectedField packages/fresco-ui/src`); adjust the `component=` import and required props to match a real field component's contract. The assertion (the `[data-field-name]` selector) is the load-bearing part.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run src/form/Field/__tests__/UnconnectedField.test.tsx`
Expected: FAIL — the wrapper has no `data-field-name`.

- [ ] **Step 3: Forward `name` to `BaseField` in `UnconnectedField.tsx`**

In the component signature destructure (currently `{ label, hint, inline, errors, showErrors, component, ...componentProps }`), pull `name` out explicitly so it stops leaking into `mergedProps`, and pass it to `BaseField`:

```tsx
export default function UnconnectedField<C extends ValidFieldComponent>({
  name,
  label,
  hint,
  inline,
  errors,
  showErrors,
  component,
  ...componentProps
}: UnconnectedFieldProps<C>) {
  const id = useId();
  const required = Boolean(componentProps.required);

  const describedBy = [hint && `${id}-hint`, errors?.length && `${id}-error`]
    .filter(Boolean)
    .join(' ');

  const mergedProps: React.ComponentProps<C> = {
    ...componentProps,
    id,
    'aria-required': required,
    'aria-describedby': describedBy || undefined,
  } as React.ComponentProps<C>;

  return (
    <LayoutGroup id={id}>
      <BaseField
        id={id}
        name={name}
        label={label}
        hint={hint}
        inline={inline}
        required={required}
        errors={errors}
        showErrors={showErrors}
        containerProps={{ 'data-field-name': name }}
      >
        {createElement(component, mergedProps)}
      </BaseField>
    </LayoutGroup>
  );
}
```

`BaseField` already accepts `name` and `containerProps` and spreads `containerProps` onto its wrapper `<div>` (`BaseField.tsx:63`), so no BaseField change is required. (Removing `name` from `mergedProps` means the inner input element no longer receives a stray `name` attribute — acceptable, since the connected `Field.tsx` re-adds `name` deliberately for controlled fields but `UnconnectedField` is used for redux-form-driven fields where the wrapper name is what matters.)

- [ ] **Step 4: Fix the `name` type at the architect adapter**

`FrescoReduxField.tsx:108` passes `name={input.name ?? undefined}` but `FieldOwnProps.name` is `string`. `input.name` from redux-form's `WrappedFieldProps` is always a string, so change to:

```tsx
      name={input.name}
```

Verify `input.name` is typed `string` in `FrescoReduxFieldProps` (`FrescoReduxField.tsx:10-20`); if the local type widens it, narrow there rather than casting.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @codaco/fresco-ui exec vitest run src/form/Field/__tests__/UnconnectedField.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck both packages and update any affected story/snapshot**

Run: `pnpm --filter @codaco/fresco-ui typecheck && pnpm --filter @codaco/architect typecheck`
Expected: PASS. If a fresco-ui `UnconnectedField`/`Field` story or snapshot exists, run `pnpm --filter @codaco/fresco-ui test` and update snapshots that now include the `data-field-name` attribute (`vitest run -u`). Per repo convention, if a component story exists for the Field, it needs no new variant here (attribute-only change) — but re-run its snapshot.

- [ ] **Step 7: Commit**

```bash
git add packages/fresco-ui/src/form/Field/UnconnectedField.tsx packages/fresco-ui/src/form/Field/__tests__/UnconnectedField.test.tsx apps/architect/src/components/Form/FrescoReduxField.tsx
git commit -m "feat(fresco-ui): forward name as data-field-name on UnconnectedField wrapper"
```

---

### Task 3: `window.__architectStore` assertion seam

**Files:**

- Modify: `apps/architect/src/ducks/store.ts` (after line 85 / near `export { store }` line 111)
- Create: `apps/architect/e2e/fixtures/window-test.d.ts`
- Modify: `apps/architect/scripts/assert-pwa-build.mjs` (insert before the success `console.log` at line 86)
- Test: `apps/architect/scripts/__tests__/assert-pwa-build.test.mjs` OR a manual build verification step

**Interfaces:**

- Produces: `window.__architectStore` (the Redux store) present only when `import.meta.env.VITE_E2E === 'true'`. Consumed by `helpers/read-store.ts` (Task 13).

- [ ] **Step 1: Add the gated hook to `store.ts`**

After the store is created (after line 85) and before `export { store };` (line 111), add:

```ts
// e2e assertion seam — only present in the VITE_E2E build (never in build:web),
// so specs can read protocol/stage JSON directly from the store. The gate is a
// static literal at build time, so the branch is tree-shaken out of production
// bundles (asserted by scripts/assert-pwa-build.mjs).
if (import.meta.env.VITE_E2E === 'true') {
  (window as unknown as { __architectStore: typeof store }).__architectStore =
    store;
}
```

- [ ] **Step 2: Type the global in `window-test.d.ts`**

```ts
import type { store } from '~/ducks/store';

declare global {
  interface Window {
    __architectStore: typeof store;
  }
}

export {};
```

- [ ] **Step 3: Add the "no hook in prod bundle" assertion to `assert-pwa-build.mjs`**

The script already enumerates `jsAssets` (lines 52–60) and imports `readFileSync` from `node:fs` (line 9). Insert before the success `console.log` (line 86):

```js
for (const asset of jsAssets) {
  const contents = readFileSync(path.join(dist, asset), 'utf8');
  if (contents.includes('__architectStore')) {
    fail(
      `production bundle ${asset} references __architectStore — the e2e store hook leaked into build:web`,
    );
  }
}
```

- [ ] **Step 4: Verify the prod build stays clean**

Run: `pnpm --filter @codaco/architect build:web`
Expected: exits 0 with "PWA build ok: ..." — the assertion passes because `VITE_E2E` is unset for `build:web`, so the branch is eliminated.

- [ ] **Step 5: Verify the e2e build exposes the hook**

Run: `pnpm --filter @codaco/architect build:e2e && grep -rl "__architectStore" apps/architect/dist-e2e/assets/*.js | head -1`
Expected: at least one chunk contains `__architectStore` (the VITE_E2E build keeps the branch).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @codaco/architect typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/architect/src/ducks/store.ts apps/architect/e2e/fixtures/window-test.d.ts apps/architect/scripts/assert-pwa-build.mjs
git commit -m "feat(architect): gated window.__architectStore e2e seam + build guard"
```

---

### Task 4: seeding fixtures (IndexedDB + sessionStorage)

**Files:**

- Create: `apps/architect/e2e/fixtures/seed.ts`
- Create: `apps/architect/e2e/fixtures/architect-test.ts`
- Create: `apps/architect/e2e/helpers/read-store.ts`

**Interfaces:**

- Produces:
  - `seedProtocol(page, protocol, opts?)` — writes a `StoredProtocolRow` into IndexedDB `ArchitectProtocolDB.protocols` and (optionally) `StoredAsset` rows, plus the two `@@remember-*` sessionStorage keys, via `page.addInitScript` + `page.evaluate`. Signature: `async (page: Page, protocol: CurrentProtocol, opts?: { id?: string; name?: string; assets?: SeedAsset[] }) => string` (returns the protocol id).
  - `test` / `expect` — the composed architect test fixture exposing `architectPage: Page` (SW-blocked, boot-loader settled) and `seed: (protocol, opts?) => Promise<string>`.
  - `readProtocolJson(page)` / `readStageJson(page, index)` — read from `window.__architectStore`.
- Consumes: `window.__architectStore` (Task 3); the `StoredProtocolRow`/`StoredAsset`/`assetKey` contract from `apps/architect/src/utils/assetDB.ts`.

- [ ] **Step 1: Write the seeding helper `fixtures/seed.ts`**

The seeder writes raw IndexedDB (Dexie is not on `window`). `@@remember-*` must be set via `addInitScript` (before boot) so redux-remember rehydrates them; IndexedDB rows are written after a first navigation so the Dexie schema exists.

```ts
import type { Page } from '@playwright/test';
import type { CurrentProtocol } from '@codaco/protocol-validation';

export type SeedAsset = {
  assetId: string;
  name: string;
  data: Blob | string;
};

const DB_NAME = 'ArchitectProtocolDB';

// Deterministic id so create-from-scratch snapshots are stable across runs.
const FIXED_ID = 'e2e-protocol';

export async function seedProtocol(
  page: Page,
  protocol: CurrentProtocol,
  opts: { id?: string; name?: string; assets?: SeedAsset[] } = {},
): Promise<string> {
  const id = opts.id ?? FIXED_ID;
  const name = opts.name ?? protocol.name ?? 'E2E Protocol';

  // 1. Seed sessionStorage BEFORE the app boots, so redux-remember rehydrates
  //    straight into /protocol with this protocol active.
  await page.addInitScript(
    ([storageId, proto]) => {
      sessionStorage.setItem(
        '@@remember-app',
        JSON.stringify({ activeProtocolId: storageId }),
      );
      sessionStorage.setItem(
        '@@remember-activeProtocol',
        JSON.stringify({ present: proto, activeProtocolId: storageId }),
      );
    },
    [id, protocol] as const,
  );

  // 2. Navigate once so Dexie creates ArchitectProtocolDB, then write the
  //    durable protocol row + asset rows via raw IndexedDB.
  await page.goto('/');
  await page.evaluate(
    async ({ dbName, storageId, protocolName, proto, assets }) => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      const db = await open();
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['protocols', 'assets'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore('protocols').put({
          id: storageId,
          name: protocolName,
          description: (proto as { description?: string }).description,
          schemaVersion: (proto as { schemaVersion: number }).schemaVersion,
          protocol: proto,
          sourceRef: { kind: 'e2e', id: 'e2e-fixture' },
          createdAt: now,
          updatedAt: now,
        });
        for (const a of assets) {
          tx.objectStore('assets').put({
            id: `${storageId}::${a.assetId}`,
            assetId: a.assetId,
            protocolId: storageId,
            name: a.name,
            data: a.data,
          });
        }
      });
      db.close();
    },
    {
      dbName: DB_NAME,
      storageId: id,
      protocolName: name,
      proto: protocol,
      assets: opts.assets ?? [],
    },
  );

  return id;
}

// A minimal empty schema-8 protocol for create-from-scratch specs.
export function emptyProtocol(): CurrentProtocol {
  return {
    name: 'E2E Protocol',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  } as unknown as CurrentProtocol;
}
```

Note: import `CurrentProtocol` as a type from `@codaco/protocol-validation` (Task fixture-delivery confirms it is exported). If TS complains about the `emptyProtocol` cast, build the object to satisfy `CurrentProtocolSchema` instead of casting — read `packages/protocol-validation/src/schemas/index.ts` for the exact `codebook` shape (`{ node?, edge?, ego? }`, all optional).

- [ ] **Step 2: Write `helpers/read-store.ts`**

```ts
import type { Page } from '@playwright/test';

export async function readProtocolJson(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const state = window.__architectStore.getState();
    return state.activeProtocol.present;
  });
}

export async function readStageJson(
  page: Page,
  index: number,
): Promise<Record<string, unknown>> {
  return page.evaluate((i) => {
    const state = window.__architectStore.getState();
    const stages = (
      state.activeProtocol.present as { stages: Record<string, unknown>[] }
    ).stages;
    return stages[i];
  }, index);
}
```

Verify the state path `activeProtocol.present.stages` against `apps/architect/src/selectors/protocol.ts` (`getStageList`) and adjust if the slice nests differently.

- [ ] **Step 3: Write the composed fixture `fixtures/architect-test.ts`**

```ts
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { test as base, expect, type Page } from '@playwright/test';

import { seedProtocol, type SeedAsset } from './seed.js';

type ArchitectFixtures = {
  architectPage: Page;
  seed: (
    protocol: CurrentProtocol,
    opts?: { id?: string; name?: string; assets?: SeedAsset[] },
  ) => Promise<string>;
};

export const test = base.extend<ArchitectFixtures>({
  architectPage: async ({ page }, use) => {
    await use(page);
  },
  seed: async ({ page }, use) => {
    await use((protocol, opts) => seedProtocol(page, protocol, opts));
  },
});

export { expect };

export async function gotoProtocol(page: Page): Promise<void> {
  await page.goto('/protocol');
  // Wait out the inline #boot-loader fade (main.tsx adds boot-loader--hidden
  // ~400ms after React mounts).
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}
```

- [ ] **Step 4: Typecheck the e2e dir**

Run: `pnpm --filter @codaco/architect exec tsc -p e2e/tsconfig.json --noEmit`
Expected: PASS (fix any import-path issues surfaced here).

- [ ] **Step 5: Commit**

```bash
git add apps/architect/e2e/fixtures/seed.ts apps/architect/e2e/fixtures/architect-test.ts apps/architect/e2e/helpers/read-store.ts
git commit -m "test(architect): e2e seeding fixtures + store readers"
```

---

### Task 5: smoke spec + Docker runner

**Files:**

- Create: `apps/architect/e2e/specs/smoke.spec.ts`
- Create: `apps/architect/e2e/scripts/run.sh` (chmod +x)

**Interfaces:**

- Consumes: `test`/`expect`/`gotoProtocol` (Task 4), `readProtocolJson` (Task 4).
- Produces: a green smoke test proving seed → boot → store-read works end to end; a Docker runner mirroring interview's.

- [ ] **Step 1: Write the smoke spec**

```ts
import { emptyProtocol } from '../fixtures/seed.js';
import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { readProtocolJson } from '../helpers/read-store.js';

test('seeds a protocol and lands in the timeline', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol(), { name: 'Smoke Protocol' });
  await gotoProtocol(architectPage);

  // The timeline renders (empty) and the store exposes the seeded protocol.
  const protocol = (await readProtocolJson(architectPage)) as {
    name: string;
    stages: unknown[];
  };
  expect(protocol.name).toBe('Smoke Protocol');
  expect(protocol.stages).toHaveLength(0);
});
```

- [ ] **Step 2: Build the e2e bundle and run the smoke test locally**

Run: `pnpm --filter @codaco/architect build:e2e && pnpm --filter @codaco/architect exec playwright test --config e2e/playwright.config.ts`
Expected: 1 passed. If the store path assertion fails, fix `read-store.ts`'s state path against the real slice shape; if `#boot-loader` never hides, relax the wait (it's `.catch`-guarded already).

- [ ] **Step 3: Write `apps/architect/e2e/scripts/run.sh`**

```bash
#!/usr/bin/env bash
# Run the @codaco/architect e2e suite inside the pinned Playwright Docker image.
# Visual snapshots are font-sensitive, so baselines must be generated here, never
# on the host. The image tag is derived from pnpm-lock.yaml so it stays in
# lock-step with the @playwright/test / playwright catalog pins.
#
#   ./e2e/scripts/run.sh                    # run all specs
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
  -v architect-e2e-node-modules:/workspace/node_modules \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/architect...' --frozen-lockfile \
    && pnpm turbo build --filter @codaco/architect \
    && VITE_E2E=true pnpm --filter @codaco/architect exec vite build --outDir dist-e2e \
    && pnpm --filter @codaco/architect exec playwright test --config=e2e/playwright.config.ts $*"
```

Then: `chmod +x apps/architect/e2e/scripts/run.sh`.

- [ ] **Step 4: Verify the Docker runner (optional if Docker available)**

Run: `pnpm --filter @codaco/architect test:e2e -- --project=chromium`
Expected: builds in-container and runs the smoke spec to green. (Skip if Docker is unavailable locally; CI exercises it.)

- [ ] **Step 5: Run lint + knip on the new files**

Run: `pnpm knip && pnpm --filter @codaco/architect exec oxlint e2e`
Expected: no new knip failures (specs are registered as knip entries via Task 1), no lint errors.

- [ ] **Step 6: Commit**

```bash
git add apps/architect/e2e/specs/smoke.spec.ts apps/architect/e2e/scripts/run.sh
git commit -m "test(architect): e2e smoke spec + Docker runner"
```

**PR 1 ships here.** Open a PR; it touches shared `fresco-ui` + app source, so it carries an app changeset (architect) and a library changeset (fresco-ui) — two separate changesets (never mix app + library). Run `pnpm typecheck && pnpm lint && pnpm knip && pnpm test` before opening.

---

## PR 2 — All-19-interfaces fixture protocol

Produces one hand-authored schema-8 protocol covering all 19 stage types, validated in the `test` gate. Data + validation only.

### Task 6: author the fixture protocol + assets + manifest entry

**Files:**

- Create: `packages/protocols/e2e/all-interfaces/protocol.json`
- Create: `packages/protocols/e2e/all-interfaces/assets/mapbox.txt` (apikey value) — or inline as `apikey` `value`
- Create: `packages/protocols/e2e/all-interfaces/assets/regions.geojson` (geojson with a `name` property)
- Modify: `packages/protocols/manifest.json` (append an `e2e` entry)

**Interfaces:**

- Produces: `packages/protocols/e2e/all-interfaces/protocol.json` — a valid schema-8 `CurrentProtocol` with 19 stages. Consumed by every PR 3 app-facet spec.

- [ ] **Step 1: Rebuild protocol-validation dist (bypass turbo cache) so the CLI validates against current schema**

Run: `npx turbo run build --filter=@codaco/protocol-validation --force`
Then verify: `grep -o 'egoVariable:[^,]*' packages/protocol-validation/dist/index.js`
Expected: shows `subject: {` (object descriptor), confirming the current FamilyPedigree schema is built (the stale dist resolves `egoVariable` against ego, which would make the fixture fail).

- [ ] **Step 2: Author `protocol.json` — codebook first**

Build the codebook to satisfy every stage's cross-references. Required entities/variables (variable keys are UUIDs or `/^[a-zA-Z0-9._:-]+$/` slugs; `.name` unique per entity):

- `codebook.node.person`: `{ name, color: 'node-color-seq-1', shape: { default: 'circle' }, variables: {...} }` with:
  - a text label var, a boolean ego var, a text relationship var, a categorical `biologicalSex` var whose options EXACTLY equal `BIOLOGICAL_SEX_OPTIONS` (`female/Female`, `male/Male`, `intersex/Intersex or a variation in sex characteristics`, `unknown/Don’t know`, `preferNotToSay/Prefer not to say`) — for FamilyPedigree `nodeConfig`.
  - a boolean disease var — for NarrativePedigree `diseases[].variable`.
  - a text `composerName` var + a `layout` var + a `location` var — for NetworkComposer / Sociogram / Geospatial.
  - an ordinal var (≥2 options) + a categorical var (≥2 options) — for OrdinalBin / CategoricalBin / TieStrengthCensus.
- `codebook.edge.family_edge`: `{ name, color: 'edge-color-seq-1', variables: {...} }` with a categorical `relationshipType` (options == `RELATIONSHIP_TYPE_OPTIONS`), a boolean `isActive`, a boolean `isGestationalCarrier`, a categorical `gameteRole` (options == `GAMETE_ROLE_OPTIONS` `egg/Egg`, `sperm/Sperm`) — for FamilyPedigree `edgeConfig`. Add a second plain edge type `knows` for census `createEdge`/AlterEdgeForm.
- `codebook.ego.variables`: at least one var for EgoForm.

Read the canonical option sets verbatim from `packages/shared-consts/src/family-pedigree.ts` (do not transcribe from memory — the exact `{value,label}` pairs are validated).

- [ ] **Step 3: Author the 19 stages**

Use the dev protocol (`packages/protocols/development/protocol.json`) as the verbatim authoring reference for the 15 documented types (EgoForm, Sociogram, Information, NameGenerator, NameGeneratorQuickAdd, NameGeneratorRoster, DyadCensus, OneToManyDyadCensus, TieStrengthCensus, OrdinalBin, CategoricalBin, AlterForm, AlterEdgeForm, Narrative, Anonymisation). For the 4 undocumented types, use these validated minimal skeletons (adapt ids/refs to the codebook above), and **order FamilyPedigree before NarrativePedigree**:

FamilyPedigree:

```json
{
  "id": "family-pedigree-1",
  "type": "FamilyPedigree",
  "label": "Family Pedigree",
  "nodeConfig": {
    "type": "person",
    "nodeLabelVariable": "<labelVar>",
    "egoVariable": "<egoVar>",
    "relationshipVariable": "<relVar>",
    "biologicalSexVariable": "<bioSexVar>"
  },
  "edgeConfig": {
    "type": "family_edge",
    "relationshipTypeVariable": "<relTypeVar>",
    "isActiveVariable": "<isActiveVar>",
    "isGestationalCarrierVariable": "<isGcVar>",
    "gameteRoleVariable": "<gameteRoleVar>"
  },
  "framing": { "mode": "fixed", "value": "gamete" },
  "boundaries": {
    "requireGrandparents": "off",
    "requireChildrenContributors": "off"
  },
  "censusPrompt": "Who is in your family?"
}
```

NarrativePedigree (its `diseases[].variable` must be the boolean disease var on `person`):

```json
{
  "id": "narrative-pedigree-1",
  "type": "NarrativePedigree",
  "label": "Narrative Pedigree",
  "sourceStageId": "family-pedigree-1",
  "diseases": [
    {
      "id": "disease-1",
      "label": "Condition X",
      "color": "#cc0000",
      "variable": "<diseaseBoolVar>",
      "inheritancePattern": "autosomalDominant"
    }
  ]
}
```

NetworkComposer:

```json
{
  "id": "network-composer-1",
  "type": "NetworkComposer",
  "label": "Network Composer",
  "subject": { "entity": "node", "type": "person" },
  "quickAdd": "<composerNameTextVar>",
  "layoutVariable": "<layoutVar>"
}
```

Geospatial (needs the apikey + geojson assets from Step 4; `prompts[].variable` must be a `location`-type node var):

```json
{
  "id": "geospatial-1",
  "type": "Geospatial",
  "label": "Geospatial",
  "subject": { "entity": "node", "type": "person" },
  "mapOptions": {
    "tokenAssetId": "mapbox_token",
    "style": "mapbox://styles/mapbox/standard",
    "center": [-74.0, 40.7],
    "initialZoom": 10,
    "dataSourceAssetId": "geo_data",
    "color": "#3399ff",
    "targetFeatureProperty": "name"
  },
  "prompts": [
    {
      "id": "geo-prompt-1",
      "text": "Where do you live?",
      "variable": "<locationVar>"
    }
  ]
}
```

- [ ] **Step 4: Add the assetManifest + asset files**

In `protocol.json` add:

```json
"assetManifest": {
  "mapbox_token": { "name": "Mapbox Token", "type": "apikey", "value": "<TESTING_TOKEN>" },
  "geo_data": { "name": "Regions", "type": "geojson", "source": "regions.geojson" }
}
```

Use the shared testing Mapbox token from `apps/architect/src/templates/testingMapboxToken.ts` for `<TESTING_TOKEN>`. Create `assets/regions.geojson` as a small FeatureCollection whose features carry a `name` property (so `targetFeatureProperty: "name"` resolves). (The apikey is inline `value`, so `assets/mapbox.txt` is unnecessary — the geojson is the only loose asset file.)

- [ ] **Step 5: Validate the fixture**

Run: `node packages/protocol-validation/scripts/cli.js packages/protocols/e2e/all-interfaces/protocol.json`
Expected: exit 0. On exit 1, read the ZodError JSON on stderr (`.path` + `.message` per issue) and fix. Common failures: option-set mismatch on the locked categorical vars; a variable ref pointing at the wrong entity; a missing `shape` on the node def.

- [ ] **Step 6: Append the manifest entry**

Append to `manifest.json`'s `protocols` array:

```json
{
  "id": "all-interfaces",
  "kind": "e2e",
  "name": "All Interfaces (e2e)",
  "description": "Schema-8 protocol covering all 19 interface types, used by the Architect e2e suite.",
  "protocolPath": "e2e/all-interfaces/protocol.json",
  "assetDir": "e2e/all-interfaces/assets",
  "architectTemplate": false
}
```

(This is inert for the app — `BUNDLED_TEMPLATES` filters to `kind === 'template' && architectTemplate`, and the vite glob only bundles `templates/*/protocol.json`. It documents the fixture for tooling.)

- [ ] **Step 7: Commit**

```bash
git add packages/protocols/e2e/all-interfaces packages/protocols/manifest.json
git commit -m "test(protocols): all-19-interfaces e2e fixture protocol"
```

---

### Task 7: fixture validation test in the `test` gate

**Files:**

- Create: `packages/protocols/__tests__/all-interfaces-fixture.test.ts`
- Modify: `packages/protocols/package.json` (ensure a `test` script + vitest devDep exist)

**Interfaces:**

- Consumes: the fixture from Task 6; `validateProtocol`/`CurrentProtocolSchema` from `@codaco/protocol-validation`.
- Produces: a Vitest test that fails CI if the fixture drifts out of schema validity.

- [ ] **Step 1: Confirm packages/protocols can run vitest**

Run: `cat packages/protocols/package.json`
If there is no `test` script, add `"test": "vitest run"` and `"vitest": "catalog:"` (or the repo's vitest catalog alias) to `devDependencies`. If packages/protocols is a pure-data package with no test runner, instead co-locate this test in `packages/protocol-validation/src/__tests__/` (which already runs vitest) and import the fixture by relative path.

- [ ] **Step 2: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { validateProtocol } from '@codaco/protocol-validation';
import { describe, expect, it } from 'vitest';

describe('all-interfaces e2e fixture', () => {
  it('is a valid schema-8 protocol', async () => {
    const raw = readFileSync(
      path.resolve(import.meta.dirname, '../e2e/all-interfaces/protocol.json'),
      'utf8',
    );
    const result = await validateProtocol(JSON.parse(raw));
    expect(result.isValid, JSON.stringify(result.errors, null, 2)).toBe(true);
  });

  it('covers all 19 stage types', () => {
    const raw = readFileSync(
      path.resolve(import.meta.dirname, '../e2e/all-interfaces/protocol.json'),
      'utf8',
    );
    const types = new Set(
      (JSON.parse(raw).stages as { type: string }[]).map((s) => s.type),
    );
    expect(types.size).toBe(19);
  });
});
```

Confirm `validateProtocol`'s exact return shape (`isValid`/`errors` vs a throwing API) by reading `packages/protocol-validation/src/index.ts` and adapt the assertion accordingly (it may be `{ isValid, errors }` or you may need to `CurrentProtocolSchema.parse` + a `logic` validator — mirror how `development-protocol-main.yml` / the CLI validate).

- [ ] **Step 3: Run it**

Run: `pnpm --filter @codaco/protocols test` (or the package you co-located it in)
Expected: PASS (both tests). If the coverage test reports <19, a stage type is missing from the fixture — add it.

- [ ] **Step 4: Commit**

```bash
git add packages/protocols/__tests__/all-interfaces-fixture.test.ts packages/protocols/package.json
git commit -m "test(protocols): validate all-interfaces e2e fixture in CI"
```

**PR 2 ships here.** Library-only change (packages/protocols is private, no npm release, but keep it its own PR). Run `pnpm typecheck && pnpm test && pnpm knip`.

---

## PR 3 — App-facet specs

Runs against the Task 6 fixture. Covers import/download/clear, timeline, summary/codebook, resources. May land as one PR or split (timeline + app-functionality; codebook/summary + resources).

### Task 8: app-facet page objects + fixture loader

**Files:**

- Create: `apps/architect/e2e/helpers/load-fixture.ts`
- Create: `apps/architect/e2e/pageobjects/toolbar.ts`
- Create: `apps/architect/e2e/pageobjects/timeline.ts`

**Interfaces:**

- Produces:
  - `loadAllInterfacesFixture(): { protocol: CurrentProtocol; assets: SeedAsset[] }` — reads `packages/protocols/e2e/all-interfaces/protocol.json` + its geojson asset via fs.
  - `Toolbar` page object: `download()`, `undo()`, `redo()`, `returnToStart()`, `print()`, `expectLabel(id, text)`.
  - `Timeline` page object: `rows()`, `stageRowByLabel(label)`, `dragStage(fromLabel, toLabel)`, `insertAt(index)`, `deleteStage(label)`, `openStage(label)`.
- Consumes: `seedProtocol` (Task 4).

- [ ] **Step 1: Write `helpers/load-fixture.ts`**

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import type { SeedAsset } from '../fixtures/seed.js';

const FIXTURE_DIR = path.resolve(
  import.meta.dirname,
  '../../../../packages/protocols/e2e/all-interfaces',
);

export function loadAllInterfacesFixture(): {
  protocol: CurrentProtocol;
  assets: SeedAsset[];
} {
  const protocol = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, 'protocol.json'), 'utf8'),
  ) as CurrentProtocol;

  const geojson = readFileSync(
    path.join(FIXTURE_DIR, 'assets', 'regions.geojson'),
    'utf8',
  );
  const assets: SeedAsset[] = [
    { assetId: 'geo_data', name: 'Regions', data: geojson },
  ];
  return { protocol, assets };
}
```

Verify the `../../../../` depth resolves to the monorepo `packages/protocols/...` from `apps/architect/e2e/helpers/` (adjust if off by one). The apikey asset is inline `value` in the manifest, so it is not seeded as a `StoredAsset`.

- [ ] **Step 2: Write `pageobjects/toolbar.ts`**

```ts
import { expect, type Page } from '@playwright/test';

export class Toolbar {
  constructor(private readonly page: Page) {}

  button(id: string) {
    // ActionToolbar renders items with aria-label = label (icon-only) or
    // visible text; target by accessible name.
    return this.page.getByRole('button', { name: this.labelFor(id) });
  }

  private labelFor(id: string): string {
    const map: Record<string, string> = {
      'download': 'Download',
      'undo': 'Undo',
      'redo': 'Redo',
      'return-to-start': 'Return to Start Screen',
      'print': 'Print',
      'finished-editing': 'Finished Editing',
    };
    return map[id] ?? id;
  }

  async download() {
    await this.button('download').click();
  }
  async undo() {
    await this.button('undo').click();
  }
  async redo() {
    await this.button('redo').click();
  }
  async expectDownloadLabel(
    text: 'Download' | 'Downloading...' | 'Downloaded',
  ) {
    await expect(this.page.getByRole('button', { name: text })).toBeVisible();
  }
}
```

- [ ] **Step 3: Write `pageobjects/timeline.ts`**

The Reorder rows have no testids; locate by the stage-label `h4` text. Drag via `mouse.down/move(steps)/up` (motion Reorder is pointer-based; a <5px move is treated as a click).

```ts
import { type Page } from '@playwright/test';

export class Timeline {
  constructor(private readonly page: Page) {}

  stageRow(label: string) {
    // Reorder.Item containing the stage label.
    return this.page
      .locator('[data-testid="stage-row"], li, div')
      .filter({ has: this.page.getByRole('heading', { name: label }) })
      .first();
  }

  async openStage(label: string) {
    await this.stageRow(label).click();
    await this.page.waitForURL(/\/protocol\/stage\//);
  }

  async dragStage(fromLabel: string, toLabel: string) {
    const from = this.stageRow(fromLabel);
    const to = this.stageRow(toLabel);
    const fromBox = await from.boundingBox();
    const toBox = await to.boundingBox();
    if (!fromBox || !toBox) throw new Error('stage row not found');
    await this.page.mouse.move(
      fromBox.x + fromBox.width / 2,
      fromBox.y + fromBox.height / 2,
    );
    await this.page.mouse.down();
    // Several steps so motion registers a drag (didDrag), not a click.
    await this.page.mouse.move(
      toBox.x + toBox.width / 2,
      toBox.y + toBox.height / 2,
      { steps: 12 },
    );
    await this.page.mouse.up();
  }

  async deleteStage(label: string) {
    const row = this.stageRow(label);
    await row.hover(); // Delete button is opacity-0 until hover.
    await row.getByRole('button', { name: 'Delete stage' }).click();
  }
}
```

Add a `data-testid="stage-row"` to the `Reorder.Item` in `apps/architect/src/components/Timeline/Timeline.tsx` (Task global-constraint permits minimal testids on ambiguous controls) to make `stageRow` robust; if you add it, update the locator to `[data-testid="stage-row"]` only.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @codaco/architect exec tsc -p e2e/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/architect/e2e/helpers/load-fixture.ts apps/architect/e2e/pageobjects/toolbar.ts apps/architect/e2e/pageobjects/timeline.ts apps/architect/src/components/Timeline/Timeline.tsx
git commit -m "test(architect): app-facet page objects + fixture loader"
```

---

### Task 9: app-functionality spec

**Files:**

- Create: `apps/architect/e2e/specs/app-functionality.spec.ts`

**Interfaces:**

- Consumes: `test`/`seed`/`gotoProtocol` (Task 4), `loadAllInterfacesFixture` (Task 8), `Toolbar` (Task 8), `readProtocolJson` (Task 4).

- [ ] **Step 1: Write the download test**

```ts
import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { Toolbar } from '../pageobjects/toolbar.js';

test('downloads the active protocol as a .netcanvas', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const toolbar = new Toolbar(architectPage);
  const [download] = await Promise.all([
    architectPage.waitForEvent('download'),
    toolbar.download(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^All_Interfaces-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.netcanvas$/,
  );
  await toolbar.expectDownloadLabel('Downloaded');
});
```

- [ ] **Step 2: Write the clear-all test**

Seed a protocol into IndexedDB via the library (open `/`), click the "Clear all protocols from this browser" `IconButton` (aria-label exact), confirm the "Remove all data?" dialog (`dialog-primary`), assert the library empties after the automatic reload:

```ts
test('clears all stored protocols', async ({ architectPage, seed }) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'To Be Cleared' });
  await architectPage.goto('/');
  await architectPage
    .getByRole('button', { name: 'Clear all protocols from this browser' })
    .click();
  await architectPage.getByTestId('dialog-primary').click(); // "Remove all"
  // clearAllStorage() calls location.reload(); wait for the empty state.
  await expect(architectPage.getByText('To Be Cleared')).toHaveCount(0);
});
```

Confirm the recents-list card exposes the protocol name text (`LibraryPanel`); adjust the empty-state assertion to whatever the recents list renders when empty.

- [ ] **Step 3: Write the import test**

Download the fixture to a temp path first (or reuse a committed small `.netcanvas`), then `setInputFiles` on Home's hidden `input[type=file]`:

```ts
test('imports a .netcanvas via the home dropzone', async ({
  architectPage,
}) => {
  await architectPage.goto('/');
  await architectPage
    .locator('input[type="file"]')
    .setInputFiles('e2e/fixtures/files/all-interfaces.netcanvas');
  await architectPage.waitForURL(/\/protocol$/);
  await expect(architectPage).toHaveURL(/\/protocol$/);
});
```

Produce `e2e/fixtures/files/all-interfaces.netcanvas` by zipping the fixture (`cd packages/protocols/e2e/all-interfaces && zip -r -0 <out>.netcanvas protocol.json assets`) as a committed test file, OR generate it in a `beforeAll` from the download test's blob. Prefer a committed file for determinism; add it to git and to the knip project globs if flagged.

- [ ] **Step 4: Write the undo/redo test**

Seed, enter a stage editor, make an edit, save, then assert `undo` reverts the stage change in the store JSON and `redo` restores it. (Keep this minimal — one field edit round-trip.)

- [ ] **Step 5: Run the spec**

Run: `pnpm --filter @codaco/architect build:e2e && pnpm --filter @codaco/architect exec playwright test --config e2e/playwright.config.ts specs/app-functionality.spec.ts`
Expected: all pass. Debug locator mismatches against the live app with `--headed`.

- [ ] **Step 6: Commit**

```bash
git add apps/architect/e2e/specs/app-functionality.spec.ts apps/architect/e2e/fixtures/files/
git commit -m "test(architect): app-functionality e2e (import/download/clear/undo)"
```

---

### Task 10: timeline spec

**Files:**

- Create: `apps/architect/e2e/specs/timeline.spec.ts`

**Interfaces:**

- Consumes: `Timeline` (Task 8), `readProtocolJson` (Task 4), `seed`/`gotoProtocol`.

- [ ] **Step 1: Write the reorder test**

```ts
import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { Timeline } from '../pageobjects/timeline.js';

test('reorders stages via drag and commits one moveStage', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const before = (await readProtocolJson(architectPage)) as {
    stages: { id: string; label: string }[];
  };
  const timeline = new Timeline(architectPage);
  await timeline.dragStage(before.stages[0].label, before.stages[2].label);

  await expect
    .poll(async () => {
      const after = (await readProtocolJson(architectPage)) as {
        stages: { id: string }[];
      };
      return after.stages[0].id;
    })
    .not.toBe(before.stages[0].id);
});
```

- [ ] **Step 2: Write the insert-at-index test**

Click an `InsertButton` between two rows → the `NewStageScreen` dialog opens → search + select `Information` → assert the route is `/protocol/stage/new?type=Information&insertAtIndex=<n>` and that saving a minimal Information stage lands it at index `n` (assert via store JSON).

- [ ] **Step 3: Write the delete + FamilyPedigree-guard test**

```ts
test('blocks deleting a FamilyPedigree stage referenced by NarrativePedigree', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const timeline = new Timeline(architectPage);
  await timeline.deleteStage('Family Pedigree');
  // Guard shows an acknowledge dialog, not the destructive confirm.
  await expect(
    architectPage.getByRole('alertdialog', { name: 'Cannot delete stage' }),
  ).toBeVisible();
});
```

Also add a positive delete: delete a leaf stage (e.g. `Information`), confirm via the destructive dialog, assert its stage id is gone from the store JSON.

- [ ] **Step 4: Run + commit**

Run: `pnpm --filter @codaco/architect exec playwright test --config e2e/playwright.config.ts specs/timeline.spec.ts` (after `build:e2e`).
Expected: pass. Then:

```bash
git add apps/architect/e2e/specs/timeline.spec.ts
git commit -m "test(architect): timeline reorder/insert/delete e2e"
```

---

### Task 11: codebook + summary spec (print snapshots)

**Files:**

- Create: `apps/architect/e2e/specs/codebook-and-summary.spec.ts`
- Create: `apps/architect/e2e/helpers/visual.ts` (CI-gated capture, copied from interviewer)

**Interfaces:**

- Produces: `makeCapture(page)` → `capture(name, opts?)` — the CI-gated `toHaveScreenshot` wrapper (no-op unless `process.env.CI`) with a rAF spring-rest poller and blob/light-hiding styles.
- Consumes: `seed`/`gotoProtocol`, fixture loader.

- [ ] **Step 1: Copy `apps/interviewer/e2e/helpers/visual.ts` → `apps/architect/e2e/helpers/visual.ts`**

Do **not** hand-roll a naive `toHaveScreenshot` wrapper — architect is the same `@codaco/art` blob/motion-heavy Vite app as interviewer, and its background lights/blobs drift via `requestAnimationFrame` springs seeded with `Math.random()`, which `animations: 'disabled'` and `reducedMotion: 'reduce'` do **not** stop. A naive capture flakes. Copy interviewer's `helpers/visual.ts` whole; it already provides the load-bearing pieces:

- `makeCapture(page)` returning a `capture(name, opts)` fn that early-returns when `!process.env.CI` (baselines compare only under Docker/CI — font-stable).
- `VISUAL_STYLES` injected via `addStyleTag` that hides the rAF-driven background elements and focus rings.
- A **spring-rest poller** (`page.evaluate`): samples rounded `getBoundingClientRect` of up to ~1500 `#root *, [role="dialog"] *` nodes until `REQUIRED_STABLE = 4` consecutive identical frames (≈150-frame cap), so the shot is taken only once the JS springs have settled.
- A toast-viewport hide wrapped in try/finally.

Architect-specific swaps when copying:

- Replace interviewer's background-element `data-testid`s in `VISUAL_STYLES` with architect's (`BackgroundLights` in `components/ViewManager/views/App.tsx`; confirm the actual `data-testid`/class and target it).
- The poller samples `#root` because the interviewer app has no `<main>` landmark on plain routes — pick architect's actual mount node (architect renders a `<main>` on `/protocol*`; sample the app root that always exists, e.g. `#root`).
- Drop or adapt the interviewer-only `settingsAboutMasks` export (architect has no settings-about screen; add architect-specific env-varying masks if any surface — e.g. the `time-ago` testid on library cards).

- [ ] **Step 2: Write the summary print snapshot test**

```ts
import { makeCapture } from '../helpers/visual.js';
import { expect, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';

test('renders the printable summary under print media', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  const capture = makeCapture(architectPage);
  await architectPage.goto('/protocol/summary');
  await expect(architectPage.getByText('Loading protocol...')).toHaveCount(0);
  await architectPage.emulateMedia({ media: 'print' });
  await capture('summary-print', { fullPage: true });
});
```

- [ ] **Step 3: Write the print-action test (stub window.print)**

Stub `window.print` via `addInitScript` to record that it fired and that `document.title` was a `.pdf` name during the call; click the Print toolbar action; assert the stub captured the expected title pattern. (Title is restored synchronously in `finally`, so assert from inside the stub.)

- [ ] **Step 4: Write the codebook snapshot test**

Navigate `/protocol/codebook`, assert the entity/variable list renders (e.g. `person` node type + a known variable name), then `const capture = makeCapture(page); await capture('codebook')`.

- [ ] **Step 5: Generate baselines in Docker + run**

Run: `pnpm --filter @codaco/architect test:e2e:update-snapshots -- specs/codebook-and-summary.spec.ts` (Docker). Commit the baselines under `e2e/visual-snapshots/chromium/`.
Expected: baselines created; a second `run.sh` invocation is green.

- [ ] **Step 6: Commit**

```bash
git add apps/architect/e2e/helpers/visual.ts apps/architect/e2e/specs/codebook-and-summary.spec.ts apps/architect/e2e/visual-snapshots/
git commit -m "test(architect): codebook + printable summary e2e with print snapshots"
```

---

### Task 12: resources spec

**Files:**

- Create: `apps/architect/e2e/specs/resources.spec.ts`

**Interfaces:**

- Consumes: `seed`/`gotoProtocol`, fixture loader.

- [ ] **Step 1: Write the add-asset test**

Navigate `/protocol/assets`, use the resource dropzone's hidden `input[type=file]` (`AssetBrowser` → `Dropzone`, `noClick:false`) to `setInputFiles` a small image, assert the asset appears in the `Assets` list.

- [ ] **Step 2: Write the in-use delete refusal test**

The fixture's geojson (`geo_data`) is used by the Geospatial stage. Attempt to delete it → assert the "Cannot delete resource" acknowledge dialog (info intent, OK only), and that it remains listed.

- [ ] **Step 3: Write the unused-asset delete test**

Add an unused asset (Step 1), delete it via the destructive "Delete Resource?" confirm (`dialog-primary` "Delete Resource"), assert it's removed from the list and from `assetManifest` in the store JSON.

- [ ] **Step 4: Run + commit**

Run the spec (after `build:e2e`); expect pass. Then:

```bash
git add apps/architect/e2e/specs/resources.spec.ts apps/architect/e2e/fixtures/files/
git commit -m "test(architect): resource management e2e (add/delete/in-use)"
```

**PR 3 ships here** (or split into two PRs: 9+10, then 11+12). architect-only changeset.

---

## PR 4 — Interface editor create-from-scratch specs

The core coverage: build each of the 19 stages from scratch and snapshot the normalized stage JSON. Batched into family PRs after a shared-helpers foundation.

### Task 13: shared editor helpers + normalized-JSON assertion

**Files:**

- Create: `apps/architect/e2e/pageobjects/stage-editor.ts`
- Create: `apps/architect/e2e/pageobjects/editor-sections/entity-types.ts`
- Create: `apps/architect/e2e/pageobjects/editor-sections/variables.ts`
- Create: `apps/architect/e2e/pageobjects/editor-sections/prompts.ts`
- Create: `apps/architect/e2e/pageobjects/editor-sections/forms.ts`
- Create: `apps/architect/e2e/helpers/normalize-stage.ts`

**Interfaces:**

- Produces the shared sub-flow API consumed by all 19 interface specs:
  - `class StageEditor { createNew(type, insertAtIndex?); setStageName(name); save(); expectNoIssues(); section(dataName): Locator; field(name): Locator; fillRichText(ariaLabel, text); }`
  - `selectOrCreateNodeType(page, name): Promise<void>` / `selectOrCreateEdgeType(page, name): Promise<void>`
  - `createVariableViaSpotlight(page, { variableName, buttonName? }): Promise<void>` — clicks a `Select Variable` button, types a name in the spotlight, creates it.
  - `createVariableWithOptions(page, { variableName, options }): Promise<void>` — for NewVariableWindow flows (ordinal/categorical with ≥2 options).
  - `addPrompt(page, fill: () => Promise<void>): Promise<void>` — opens the "Create new" prompt dialog, runs `fill`, clicks "Add".
  - `addFormField(page, { variableName, promptText, inputControl? }): Promise<void>`
  - `normalizeStage(stage): unknown` — strips generated ids/uuids for stable snapshots.
- Consumes: `readStageJson` (Task 4), the field-locator rules (Global Constraints).

- [ ] **Step 1: Write `pageobjects/stage-editor.ts`**

```ts
import { expect, type Locator, type Page } from '@playwright/test';

export class StageEditor {
  constructor(private readonly page: Page) {}

  async createNew(type: string, insertAtIndex = 0): Promise<void> {
    await this.page.goto(
      `/protocol/stage/new?type=${type}&insertAtIndex=${insertAtIndex}`,
    );
    await this.page
      .locator('#boot-loader')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .catch(() => {});
  }

  async setStageName(name: string): Promise<void> {
    const input = this.page.getByRole('textbox', { name: 'Stage name' });
    await input.fill(name);
  }

  section(dataName: string): Locator {
    return this.page.locator(`[data-name="${dataName}"]`);
  }

  field(name: string): Locator {
    return this.page.locator(`[data-field-name="${name}"]`);
  }

  async fillRichText(ariaLabel: string, text: string): Promise<void> {
    const editor = this.page.getByRole('textbox', { name: ariaLabel });
    await editor.click();
    await editor.fill(text); // Tiptap contenteditable; fill works for plain text
  }

  async expectNoIssues(): Promise<void> {
    await expect(this.page.getByTestId('issue')).toHaveCount(0);
  }

  async save(): Promise<void> {
    // "Finished Editing" only renders once the draft is dirty.
    await this.page.getByRole('button', { name: 'Finished Editing' }).click();
    await this.page.waitForURL(/\/protocol$/);
  }
}
```

If `fillRichText`'s `fill` does not update the Tiptap editor (contenteditable), fall back to `editor.click()` then `page.keyboard.type(text)`.

- [ ] **Step 2: Write `editor-sections/entity-types.ts`**

```ts
import { type Page } from '@playwright/test';

export async function selectOrCreateNodeType(
  page: Page,
  name: string,
): Promise<void> {
  const existing = page.locator('[data-name="Node Type"]').getByText(name, {
    exact: true,
  });
  if (await existing.count()) {
    await existing.first().click();
    return;
  }
  await page.getByRole('button', { name: 'Create new node type' }).click();
  await page.getByRole('textbox', { name: 'Node type name' }).fill(name);
  await page.getByRole('button', { name: 'Save and Close' }).click();
}

export async function selectOrCreateEdgeType(
  page: Page,
  name: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Create new edge type' }).click();
  await page.getByRole('textbox', { name: 'Edge type name' }).fill(name);
  await page.getByRole('button', { name: 'Save and Close' }).click();
}
```

- [ ] **Step 3: Write `editor-sections/variables.ts`**

```ts
import { type Page } from '@playwright/test';

// Spotlight create-flow: click a "Select Variable" button, type a name, create.
export async function createVariableViaSpotlight(
  page: Page,
  opts: { variableName: string; buttonName?: string },
): Promise<void> {
  await page
    .getByRole('button', { name: opts.buttonName ?? 'Select Variable' })
    .click();
  const search = page.getByRole('textbox', {
    name: 'Find or create a variable',
  });
  await search.fill(opts.variableName);
  // Click the "Create new variable called ..." row, or press Enter.
  const createRow = page
    .getByTestId('spotlight-list-item')
    .filter({ hasText: 'Create' })
    .first();
  if (await createRow.count()) {
    await createRow.click();
  } else {
    await search.press('Enter');
  }
}

// NewVariableWindow flow (ordinal/categorical): name + ≥2 options + Save.
export async function createVariableWithOptions(
  page: Page,
  opts: { variableName: string; options: string[] },
): Promise<void> {
  await page
    .getByRole('textbox', { name: 'Variable name' })
    .fill(opts.variableName);
  for (let i = 0; i < opts.options.length; i += 1) {
    await page.getByRole('button', { name: 'Add new' }).click();
    await page
      .getByRole('textbox', { name: `options[${i}].label` })
      .fill(opts.options[i]);
    await page
      .getByRole('textbox', { name: 'Value' })
      .nth(i)
      .fill(opts.options[i].toLowerCase());
  }
  await page.getByRole('button', { name: 'Save and Close' }).click();
}
```

The exact spotlight search aria-label and the NewVariableWindow option-row locators are from the per-interface investigation (Task 6/detail); verify against `VariableSpotlight.tsx` / `NewVariableWindow` and adjust. This is the highest-churn helper — iterate it with `--headed` while implementing the first bin spec.

- [ ] **Step 4: Write `editor-sections/prompts.ts` and `forms.ts`**

```ts
// prompts.ts
import { type Page } from '@playwright/test';

export async function addPrompt(
  page: Page,
  fill: () => Promise<void>,
): Promise<void> {
  await page.getByRole('button', { name: 'Create new' }).click();
  await fill(); // fill the "Edit Prompt" dialog's fields
  await page.getByRole('button', { name: 'Add' }).click();
}
```

```ts
// forms.ts
import { type Page } from '@playwright/test';

import { createVariableViaSpotlight } from './variables.js';

export async function addFormField(
  page: Page,
  opts: { variableName: string; promptText: string; inputControl?: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Create new' }).click(); // opens "Edit Field"
  await createVariableViaSpotlight(page, { variableName: opts.variableName });
  await page.getByRole('textbox', { name: 'prompt' }).click();
  await page.getByRole('textbox', { name: 'prompt' }).fill(opts.promptText);
  await page
    .getByLabel('Input control')
    .selectOption({ label: opts.inputControl ?? 'Text Input' });
  await page.getByRole('button', { name: 'Add' }).click();
}
```

- [ ] **Step 5: Write `helpers/normalize-stage.ts`**

```ts
// Replace generated UUIDs with stable placeholders so stage-JSON snapshots are
// deterministic across runs. Keeps structural keys, prompt text, config values.
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function normalizeStage(input: unknown): unknown {
  let counter = 0;
  const idMap = new Map<string, string>();
  const mapId = (v: string) => {
    if (!idMap.has(v)) idMap.set(v, `id-${(counter += 1)}`);
    return idMap.get(v)!;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(UUID_RE, (m) => mapId(m));
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        // Stage/prompt/variable ids are generated; stabilise them by position.
        out[k] = k === 'id' && typeof val === 'string' ? mapId(val) : walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(input);
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @codaco/architect exec tsc -p e2e/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/architect/e2e/pageobjects/stage-editor.ts apps/architect/e2e/pageobjects/editor-sections apps/architect/e2e/helpers/normalize-stage.ts
git commit -m "test(architect): shared stage-editor page objects + JSON normaliser"
```

---

### Task 14: reference interface spec — Information (fully worked)

**Files:**

- Create: `apps/architect/e2e/specs/interfaces/information.spec.ts`

**Interfaces:**

- Consumes: `StageEditor` (Task 13), `readStageJson`/`normalizeStage`, `seed`/`emptyProtocol`.
- Produces: the canonical shape every other interface spec follows.

- [ ] **Step 1: Write the spec**

```ts
import { emptyProtocol } from '../../fixtures/seed.js';
import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { readStageJson } from '../../helpers/read-store.js';
import { normalizeStage } from '../../helpers/normalize-stage.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid Information stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Information');
  await editor.setStageName('About This Study');

  // title (required by the editor even though schema marks it optional)
  await editor.field('title').getByRole('textbox').fill('Welcome');

  // items: at least one — open the "Create new" item dialog, pick Text, type content
  await architectPage.getByRole('button', { name: 'Create new' }).click();
  await architectPage.getByRole('radio', { name: 'Text' }).click();
  await architectPage
    .getByRole('textbox', { name: 'content' })
    .fill('Thanks for taking part.');
  await architectPage.getByRole('button', { name: 'Add' }).click();

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Information');
  expect(normalizeStage(stage)).toMatchSnapshot('information-stage.json');
});
```

- [ ] **Step 2: Run + create the snapshot**

Run: `pnpm --filter @codaco/architect build:e2e && pnpm --filter @codaco/architect exec playwright test --config e2e/playwright.config.ts specs/interfaces/information.spec.ts --update-snapshots`
Expected: pass; `information-stage.json` snapshot written under `e2e/specs/interfaces/information.spec.ts-snapshots/`. (JSON snapshots are font-independent, so `--update-snapshots` locally is fine — unlike PNG baselines.)

- [ ] **Step 3: Re-run without update to confirm stability**

Run: `pnpm --filter @codaco/architect exec playwright test --config e2e/playwright.config.ts specs/interfaces/information.spec.ts`
Expected: pass (snapshot matches).

- [ ] **Step 4: Commit**

```bash
git add apps/architect/e2e/specs/interfaces/information.spec.ts apps/architect/e2e/specs/interfaces/*-snapshots
git commit -m "test(architect): Information interface create-from-scratch e2e"
```

---

### Task 15: forms family — EgoForm, AlterForm, AlterEdgeForm

**Files:**

- Create: `apps/architect/e2e/specs/interfaces/ego-form.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/alter-form.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/alter-edge-form.spec.ts`

**Interfaces:**

- Consumes: `StageEditor`, `addFormField`, `selectOrCreateNodeType`/`selectOrCreateEdgeType`, snapshot helpers.

Each spec follows Task 14's shape: `seed(emptyProtocol())` → `gotoProtocol` → `editor.createNew(type)` → fill → `expectNoIssues()` → `save()` → snapshot `normalizeStage(readStageJson(page,0))`. Type-specific required fields:

- [ ] **Step 1: EgoForm** (subject is ego — no node type). Fill: `introductionPanel.title` (`getByLabel('Title')`), `introductionPanel.text` (`fillRichText('introductionPanel.text', ...)`), then `addFormField(page, { variableName: 'age', promptText: "What is your name?", inputControl: 'Text Input' })` (creates an ego variable). Save + snapshot `ego-form-stage.json`.

- [ ] **Step 2: AlterForm** (subject = node). Order: `selectOrCreateNodeType(page, 'person')` FIRST (Form section is disabled until subject set), then `introductionPanel.title`, `introductionPanel.text`, then `addFormField(...)`. Save + snapshot.

- [ ] **Step 3: AlterEdgeForm** (subject = edge). `selectOrCreateEdgeType(page, 'knows')` FIRST, then `introductionPanel.title`/`text`, then `addFormField(...)`. Save + snapshot.

- [ ] **Step 4: Run all three, create snapshots, re-run for stability**

Run: `... playwright test specs/interfaces/ego-form.spec.ts specs/interfaces/alter-form.spec.ts specs/interfaces/alter-edge-form.spec.ts --update-snapshots` then re-run without `--update-snapshots`.
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/architect/e2e/specs/interfaces/ego-form.spec.ts apps/architect/e2e/specs/interfaces/alter-form.spec.ts apps/architect/e2e/specs/interfaces/alter-edge-form.spec.ts apps/architect/e2e/specs/interfaces/*-snapshots
git commit -m "test(architect): form interfaces create-from-scratch e2e"
```

---

### Task 16: name-generator family — NameGenerator, NameGeneratorQuickAdd, NameGeneratorRoster

**Files:**

- Create: `apps/architect/e2e/specs/interfaces/name-generator.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/name-generator-quick-add.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/name-generator-roster.spec.ts`

Type-specific recipes (subject FIRST in all):

- [ ] **Step 1: NameGenerator** — `selectOrCreateNodeType('person')`, then in the Form section fill `form.title` (`getByLabel(/Form heading/)`) + `addFormField({ variableName, promptText, inputControl: 'Text Input' })`, then `addPrompt(page, async () => { await editor.fillRichText('text', 'Name someone you know'); })`. Save + snapshot.

- [ ] **Step 2: NameGeneratorQuickAdd** (lightest) — `selectOrCreateNodeType('person')`, then QuickAdd `createVariableViaSpotlight(page, { variableName: 'name', buttonName: 'Select Variable' })`, then `addPrompt(...)` with only `text`. Save + snapshot.

- [ ] **Step 3: NameGeneratorRoster** — needs a network data asset. Seed the protocol with a small network asset in `assetManifest` + IndexedDB (`seed(rosterProtocol, { assets: [{ assetId:'roster', name:'Roster', data: <csv-or-json blob> }] })`); in the editor `selectOrCreateNodeType('person')`, click `Select resource` in the ExternalDataSource section → pick the seeded asset in the "Resource Browser" dialog, then `addPrompt(...)` (text only). Save + snapshot. (Seeding the asset avoids driving a real file upload inside the dialog.)

- [ ] **Step 4: Run + snapshots + commit** (as Task 15 Step 4/5).

```bash
git add apps/architect/e2e/specs/interfaces/name-generator*.spec.ts apps/architect/e2e/specs/interfaces/*-snapshots
git commit -m "test(architect): name-generator interfaces create-from-scratch e2e"
```

---

### Task 17: census family — DyadCensus, OneToManyDyadCensus, TieStrengthCensus

**Files:**

- Create: `apps/architect/e2e/specs/interfaces/dyad-census.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/one-to-many-dyad-census.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/tie-strength-census.spec.ts`

- [ ] **Step 1: DyadCensus** — `selectOrCreateNodeType('person')`, `introductionPanel.title`/`text`, then `addPrompt(page, async () => { await editor.fillRichText('text', 'Do they know each other?'); await selectOrCreateEdgeType(page, 'knows'); })` (the prompt dialog's `createEdge` is an `EntitySelectField` → pill or "Create new edge type"). Save + snapshot.

- [ ] **Step 2: OneToManyDyadCensus** — no IntroductionPanel; behaviours pre-set by template. `selectOrCreateNodeType('person')`, then `addPrompt(...)` with `text` + `createEdge` (as above). Save + snapshot.

- [ ] **Step 3: TieStrengthCensus** (heaviest) — `selectOrCreateNodeType('person')`, `introductionPanel.title`/`text`, then `addPrompt(page, async () => { ... })` filling, in order: `text` (RichText), `createEdge` (native `<select>` — `selectOption` or the `_create` inline-input path), then `edgeVariable` via `createVariableWithOptions(page, { variableName:'strength', options:['Low','High'] })` in the NewVariableWindow (type preset ordinal, ≥2 options), then `negativeLabel` (RichText). Save + snapshot. Note `variableOptions` auto-syncs; `onBeforeSave` strips it — assert the saved prompt is `{id,text,createEdge,edgeVariable,negativeLabel}`.

- [ ] **Step 4: Run + snapshots + commit.**

```bash
git add apps/architect/e2e/specs/interfaces/*census*.spec.ts apps/architect/e2e/specs/interfaces/*-snapshots
git commit -m "test(architect): census interfaces create-from-scratch e2e"
```

---

### Task 18: bins + anonymisation — OrdinalBin, CategoricalBin, Anonymisation

**Files:**

- Create: `apps/architect/e2e/specs/interfaces/ordinal-bin.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/categorical-bin.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/anonymisation.spec.ts`

- [ ] **Step 1: OrdinalBin** — `selectOrCreateNodeType('person')`, then `addPrompt(page, async () => { await editor.fillRichText('text', 'Rank these'); await createVariableViaSpotlight(page, { variableName:'rank' }); /* -> NewVariableWindow, type preset ordinal */ await createVariableWithOptions(page, { variableName:'rank', options:['Low','High'] }); })`. `color` is template-seeded. Save + snapshot. (Iterate the spotlight→NewVariableWindow chain here first — it's the reusable path for all bins/censuses.)

- [ ] **Step 2: CategoricalBin** — same as OrdinalBin but the created variable is categorical; do NOT open the "Follow-up Other Option" section (adds 3 required fields). No `color` field. Save + snapshot.

- [ ] **Step 3: Anonymisation** (simplest; experiment-gated for discovery only) — navigate directly via `editor.createNew('Anonymisation')` (bypasses the picker experiment gate). Fill `explanationText.title` (`getByLabel('Title')`) + `explanationText.body` (`fillRichText('explanationText.body', ...)`). No subject, no prompts. Save + snapshot.

- [ ] **Step 4: Run + snapshots + commit.**

```bash
git add apps/architect/e2e/specs/interfaces/ordinal-bin.spec.ts apps/architect/e2e/specs/interfaces/categorical-bin.spec.ts apps/architect/e2e/specs/interfaces/anonymisation.spec.ts apps/architect/e2e/specs/interfaces/*-snapshots
git commit -m "test(architect): bin + anonymisation interfaces create-from-scratch e2e"
```

---

### Task 19: canvas family — Sociogram, NetworkComposer, Narrative

**Files:**

- Create: `apps/architect/e2e/specs/interfaces/sociogram.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/network-composer.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/narrative.spec.ts`

- [ ] **Step 1: Sociogram** — `selectOrCreateNodeType('person')`, fill `background.concentricCircles` (number input labelled "Number of concentric circles to use:") with `4`, then `addPrompt(page, async () => { await editor.fillRichText('text', 'Place them'); await createVariableViaSpotlight(page, { variableName:'layout', buttonName:'Select Variable' }); })` (creates a layout var). Save + snapshot.

- [ ] **Step 2: NetworkComposer** — `selectOrCreateNodeType('person')`, then in NodeConfiguration: `quickAdd` via `createVariableViaSpotlight({ variableName:'name' })` (text) and `layoutVariable` via spotlight (layout), then `background.concentricCircles = 4`. Save + snapshot.

- [ ] **Step 3: Narrative** — `selectOrCreateNodeType('person')`, `background.concentricCircles = 4` (no image chooser), then `addPrompt`/preset dialog: fill preset `label` (input, placeholder "Enter a label for the preset...") + `layoutVariable` via spotlight. Save + snapshot.

- [ ] **Step 4: Run + snapshots + commit.**

```bash
git add apps/architect/e2e/specs/interfaces/sociogram.spec.ts apps/architect/e2e/specs/interfaces/network-composer.spec.ts apps/architect/e2e/specs/interfaces/narrative.spec.ts apps/architect/e2e/specs/interfaces/*-snapshots
git commit -m "test(architect): canvas interfaces create-from-scratch e2e"
```

---

### Task 20: geo + pedigree — Geospatial, FamilyPedigree, NarrativePedigree

**Files:**

- Create: `apps/architect/e2e/specs/interfaces/geospatial.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/family-pedigree.spec.ts`
- Create: `apps/architect/e2e/specs/interfaces/narrative-pedigree.spec.ts`
- Reuse: `apps/architect/e2e/fixtures/mapbox-mocks.ts` (copy from interview, install in a `test.beforeEach` for Geospatial)

**Interfaces:**

- Consumes: `mapbox-mocks` (copy), the testing token from `apps/architect/src/templates/testingMapboxToken.ts`, `createVariableWithOptions`, `selectOrCreateNodeType`/`selectOrCreateEdgeType`.

- [ ] **Step 1: Copy `mapbox-mocks.ts`** from `packages/interview/e2e/fixtures/mapbox-mocks.ts` into `apps/architect/e2e/fixtures/mapbox-mocks.ts` verbatim (it is app-agnostic `page.route` interception).

- [ ] **Step 2: Geospatial** — install mapbox mocks; seed a protocol carrying a geojson asset with a `name` property + an apikey asset with the real testing token (so the live map instantiates). In the editor, order: `selectOrCreateNodeType('person')` → set API key (APIKeyBrowser: create key with name + the testing token value, then select it) → select the geojson data source → select `targetFeatureProperty = name` (`data-field-name="mapOptions.targetFeatureProperty"` select) → set `color` + `style` (`data-field-name="mapOptions.style"`) → open "Set Map View", pan/zoom the live map to fire a `move`, click "Save Changes" → `addPrompt` with `text` + a `location` variable (spotlight → NewVariableWindow type 'location'). Save + snapshot. This is the heaviest spec; budget iteration time and rely on the mocks for tile determinism.

- [ ] **Step 3: FamilyPedigree** — `selectOrCreateNodeType('person')` in Node Configuration, then create/bind the 4 node variables via the picker→NewVariableWindow flow: `nodeLabelVariable` (text), `egoVariable` (boolean), `relationshipVariable` (text), `biologicalSexVariable` (categorical — options auto-locked to `BIOLOGICAL_SEX_OPTIONS`, so only type the name). Then Edge Configuration: `selectOrCreateEdgeType('family_edge')` + the 4 edge variables (`relationshipTypeVariable` categorical-locked, `isActiveVariable` boolean, `isGestationalCarrierVariable` boolean, `gameteRoleVariable` categorical-locked). Fill `censusPrompt` (RichText). framing/boundaries/introScreen are template-valid. Save + snapshot. (Locate each variable row by its label within `[data-name="Node Configuration"]`/`[data-name="Edge Configuration"]`.)

- [ ] **Step 4: NarrativePedigree** — HARD PREREQUISITE: a saved FamilyPedigree stage with a boolean node variable must exist. Seed a protocol that already contains a valid FamilyPedigree stage + its codebook (reuse the Task 6 fixture's FamilyPedigree slice, or seed a two-stage protocol). In the editor: select the source stage in `sourceStageId` (StyledSelectField, "Family Pedigree stage") FIRST, then `addPrompt`/disease dialog: `label` (input) + `color` (ColorPicker swatch) + `variable` (pick the boolean node var — pick-only, no create) + `inheritancePattern` (StyledSelectField → "Autosomal Dominant"). Save + snapshot.

- [ ] **Step 5: Run + snapshots + commit.**

```bash
git add apps/architect/e2e/specs/interfaces/geospatial.spec.ts apps/architect/e2e/specs/interfaces/family-pedigree.spec.ts apps/architect/e2e/specs/interfaces/narrative-pedigree.spec.ts apps/architect/e2e/fixtures/mapbox-mocks.ts apps/architect/e2e/specs/interfaces/*-snapshots
git commit -m "test(architect): geospatial + pedigree interfaces create-from-scratch e2e"
```

**PR 4 ships across batches** (Tasks 14–20; land as 2–4 PRs — e.g. reference+forms+namegen, then censuses+bins+anon, then canvas, then geo+pedigree). Each PR runs green under `run.sh` in Docker before opening. architect-only changeset.

---

## PR 5 — CI wiring

Wires the suite into `ci-and-release.yml` as a non-required, informational job. Landed last, once the suite is green in Docker.

### Task 21: detect flag + architect-e2e job + carry-forward

**Template:** mirror the merged **`interviewer-e2e`** wiring in `ci-and-release.yml`, NOT `interview-e2e`. The interviewer app suite (PR #926) is the direct precedent for a full-app-PWA e2e gate: a single job that uploads its report artifact, with **no** companion Pages/`-report` job and **no** slug plumbing (those belong only to the library `interview-e2e` suite). Line numbers below are current as of the post-#926 tree.

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (detect outputs, flag emission, new job, carry-forward)

**Interfaces:**

- Consumes: `run.sh` (Task 5), the existing `arch` detect flag (`arch=$(flag @codaco/architect)`, line 153).

- [ ] **Step 1: Add the `architect_e2e` detect output**

In the `detect` job `outputs:` block (after `interviewer_e2e`, line 62) add:

```yaml
      architect_e2e: ${{ steps.flags.outputs.architect_e2e }}
```

In the flag-emission block (after `echo "interviewer_e2e=$intvr"`, line 213), reusing the existing `arch` flag (line 153), add:

```yaml
            echo "architect_e2e=$arch"
```

(This reuses the same `@codaco/architect`-tree change flag that already drives `deploy-architect-preview`, exactly as `interviewer_e2e` reuses `intvr`.)

- [ ] **Step 2: Add the `architect-e2e` job** (copy the `interviewer-e2e` job, lines 739–766, changing only names/paths)

```yaml
  architect-e2e:
    needs: [quality, detect]
    if: ${{ !cancelled() && needs.detect.outputs.architect_e2e == 'true' }}
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0
        with:
          # The Dockerized test run mounts the workspace; don't leave the
          # checkout token in .git/config for test/build code to read.
          persist-credentials: false
      - uses: ./.github/actions/turbo-ci-setup
      - name: Run E2E tests
        run: ./apps/architect/e2e/scripts/run.sh
      - name: Reclaim artifact ownership
        if: always()
        run: |
          sudo chown -R "$(id -u):$(id -g)" \
            apps/architect/e2e/playwright-report \
            apps/architect/e2e/test-results 2>/dev/null || true
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: architect-playwright-report
          path: apps/architect/e2e/playwright-report/
          if-no-files-found: warn
          retention-days: 14
```

No `outputs.slug`, no `id: meta` step, no flaky-summary step — the interviewer app job has none of these (they are interview-library-suite-only).

- [ ] **Step 3: Wire carry-forward** (the `carry-forward-statuses` job, lines 1462–1512)

Add `architect-e2e` to the `needs:` list (after `interviewer-e2e`, line 1472):

```yaml
      - architect-e2e
```

Add to the `env:` block (after `FLAG_INTERVIEWER_E2E`, line 1498):

```yaml
          FLAG_ARCHITECT_E2E: ${{ needs.detect.outputs.architect_e2e }}
```

Add to the `flagToJobs` map (after `FLAG_INTERVIEWER_E2E`, line 1511):

```js
              FLAG_ARCHITECT_E2E: ["architect-e2e"],
```

There is no `architect-e2e-report` job to exclude (unlike `interview-e2e-report`) — the interviewer template omits the Pages/report companion, and so does this suite.

- [ ] **Step 4: Validate the workflow YAML**

Run: `npx --yes @action-validator/cli .github/workflows/ci-and-release.yml` (or `actionlint .github/workflows/ci-and-release.yml` if available)
Expected: no errors. Also confirm indentation/anchors with `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci-and-release.yml'))"`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci-and-release.yml
git commit -m "ci: add informational architect-e2e job with detect + carry-forward wiring"
```

**PR 5 ships here.** No changeset needed (CI-only). Open the PR; the `architect-e2e` job runs on it (the workflow file changed → all detect flags forced true), proving the wiring end to end.

---

## Appendix: per-interface required-field reference

Condensed from the editor investigation. For each type: sections, the sync-required fields, and prerequisites. "subject FIRST" means set the node/edge type before other sections mount their validators.

- **Information** — Title, ContentGrid, SkipLogic, InterviewScript. Required: `label` (auto), `title` (editor-required), `items` ≥1 (Text item via "Create new" → radio Text → `content` RichText → "Add"). No prereq.
- **EgoForm** — IntroductionPanel, Form, SkipLogic, InterviewScript. Required: `introductionPanel.title`, `introductionPanel.text`, `form.fields` ≥1 (creates an ego var). Subject is ego (no node type).
- **AlterForm** — FilteredNodeType, IntroductionPanel, Form, … Required: `subject` (node, FIRST), `introductionPanel.title/text`, `form.fields` ≥1.
- **AlterEdgeForm** — FilteredEdgeType, IntroductionPanel, Form, … Required: `subject` (edge, FIRST), `introductionPanel.title/text`, `form.fields` ≥1.
- **NameGenerator** — NodeType, Form, NameGeneratorPrompts, … Required: `subject` (FIRST), `form.title`, `form.fields` ≥1, `prompts` ≥1 (text).
- **NameGeneratorQuickAdd** — NodeType, QuickAdd, NameGeneratorPrompts, … Required: `subject` (FIRST), `quickAdd` var, `prompts` ≥1 (text). No Form.
- **NameGeneratorRoster** — NodeType, ExternalDataSource, …, Prompts. Required: `subject` (FIRST), `dataSource` (network asset — seed it), `prompts` ≥1 (text). Prompts need subject AND dataSource.
- **DyadCensus** — FilteredNodeType, IntroductionPanel, DyadCensusPrompts, … Required: `subject` (FIRST), `introductionPanel.title/text`, `prompts` ≥1 (`text` + `createEdge` EntitySelectField).
- **OneToManyDyadCensus** — FilteredNodeType, RemoveAfterConsideration, Prompts, … Required: `subject` (FIRST), `prompts` ≥1 (`text` + `createEdge`). behaviours template-seeded; no IntroductionPanel.
- **TieStrengthCensus** — FilteredNodeType, IntroductionPanel, Prompts, … Required: `subject`, `introductionPanel.title/text`, `prompts` ≥1 (`text` + `createEdge` native select + `edgeVariable` ordinal ≥2 options + `negativeLabel`).
- **OrdinalBin** — FilteredNodeType, OrdinalBinPrompts, … Required: `subject` (FIRST), `prompts` ≥1 (`text` + ordinal `variable` ≥2 options; `color` template-seeded).
- **CategoricalBin** — FilteredNodeType, CategoricalBinPrompts, … Required: `subject` (FIRST), `prompts` ≥1 (`text` + categorical `variable` ≥2 options). Don't open "Follow-up Other Option".
- **Anonymisation** — AnonymisationExplanation, …, EncryptedVariables. Required: `explanationText.title`, `explanationText.body`. No subject/prompts. Reach via direct `?type=Anonymisation` URL.
- **Sociogram** — FilteredNodeType, Background, …, SociogramPrompts. Required: `subject` (FIRST), `background.concentricCircles` (positive int), `prompts` ≥1 (`text` + `layout.layoutVariable`).
- **NetworkComposer** — NodeType, NodeConfiguration, …, Background. Required: `subject` (FIRST), `quickAdd` (text var), `layoutVariable` (layout var), `background.concentricCircles`.
- **Narrative** — FilteredNodeType, Background, NarrativePresets, … Required: `subject` (FIRST), `background.concentricCircles`, `presets` ≥1 (`label` + `layoutVariable`). No image chooser.
- **Geospatial** — FilteredNodeType, MapOptions, GeospatialPrompts, … Required (order-sensitive): `subject`, `mapOptions.tokenAssetId` (apikey, real token), `mapOptions.dataSourceAssetId` (geojson w/ properties), `mapOptions.targetFeatureProperty`, `mapOptions.color`+`style`, map center/zoom via live map, `prompts` ≥1 (`text` + `location` var). Needs mapbox mocks + real token.
- **FamilyPedigree** — …, NodeConfiguration, EdgeConfiguration, CensusPrompt, … Required: node `type` + 4 node vars (label/ego/relationship/biologicalSex-locked), edge `type` + 4 edge vars (relationshipType-locked/isActive/isGestationalCarrier/gameteRole-locked), `censusPrompt`. framing/boundaries/introScreen template-valid.
- **NarrativePedigree** — SourceStage, Diseases, AtRiskStatuses, … Required: `sourceStageId` (must reference an existing FamilyPedigree, select FIRST), `diseases` ≥1 (`label`+`color`+boolean node `variable` [pick-only]+`inheritancePattern`). Prereq: a saved FamilyPedigree with a boolean node var.
