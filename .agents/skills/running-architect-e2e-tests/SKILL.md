---
name: running-architect-e2e-tests
description: 'Use as final verification after adding or changing ANY feature in the Architect app (apps/architect) — a stage editor / interface type, the timeline, protocol download/import/clear, the printable codebook or summary, or resource management. Covers how to run the Playwright end-to-end suite, how to read a JSON stage-snapshot vs a CI-gated visual-baseline failure, and how to update or add e2e specs, fixtures, and page objects when the app changes. Keywords: architect, e2e, end-to-end, playwright, stage editor, interface, create-from-scratch, snapshot, visual baseline, regression, run.sh, test:e2e, vite preview, IndexedDB, data-field-name.'
---

# Running Architect e2e tests

The Architect app has a Chromium Playwright e2e suite in `apps/architect/e2e/`. **Run it as the final verification step whenever you add or change an Architect feature**, and update it when the change alters observable behaviour. A red e2e test is either a real regression (fix the app) or an intended change (update the test/snapshot deliberately) — never fake, weaken, or delete an assertion to get to green.

## When to use

After implementing (and unit-testing) any change under `apps/architect/src/` that affects: a stage editor or a new/changed interface type; the timeline (reorder/insert/delete); protocol download / import / clear-history / undo-redo; the printable codebook or summary; or resource management. This is the last gate before opening the PR.

## How the suite works (so failures make sense)

- It serves the **real production build** (`vite preview` of `dist/`) on port 4301 — not the dev server. So a build is required first.
- It seeds protocols directly into the app's own library, `ArchitectProtocolDB-v9` (IndexedDB), + `@@remember-v9-*` sessionStorage, and asserts the **autosaved protocol row** read back from IndexedDB. There is **no `window` store hook**. Every storage name comes from `apps/architect/src/utils/storageNames.ts`; import it rather than writing a literal.
- `ArchitectProtocolDB` (no suffix) and `@@remember-*` belong to **Architect 8**, served at `/v8/` on the same origin. Architect 9 only ever reads that database, so a spec must never open it with a versionless `indexedDB.open` (that creates it): check `indexedDB.databases()` first. To seed it, create it exactly as Architect 8's Dexie does — native version `10`, stores `protocols` (keyPath `id`, index `updatedAt`) and `assets` (keyPath `id`, index `protocolId`) — or Architect 8 will bump its schema when it next opens it.
- Seeded Architect 8 rows appear in the home library as **Schema 8** rows. Clicking one opens the upgrade-or-keep choice; the researcher's last pick per protocol is remembered in the `legacyProtocolChoices` table of `ArchitectProtocolDB-v9` (clear it between tests that depend on the dialog appearing). Files passed to Architect 8 go through `ArchitectHandoffDB` (`HANDOFF_DB_NAME` in `src/utils/handoffStore.ts`) and the `/v8/?import=<key>` URL; Architect 8 sends protocols back through `/?upgrade=<id>` and `/?import=<key>`, which the app strips from the address at startup.
- Every Architect 8 action (the "Keep editing as schema 8" button, "Open in Architect 8") is gated on the `__ARCHITECT_V8__` build define. A build without Architect 8 bundled (and vitest and Storybook, which define it as `null`) shows only the upgrade path, so specs for the keep path need a build that bundles `/v8/`.
- Helpers for that: `seedLegacyProtocols` (`e2e/fixtures/seed.ts`) writes Architect 8 rows in its native layout; `e2e/fixtures/legacy-protocol.ts` has a schema 8 protocol, its resource rows and a `.netcanvas` of it; `readLegacyLibraryFingerprint`, `readHandoffRecords`, `readLibraryRows` and `readDatabaseNames` (`e2e/helpers/read-store.ts`) list a database before opening it, so they never create one. Assert "Architect 8's library untouched" by comparing fingerprints taken before and after.
- Specs that follow a protocol out to Architect 8 (`specs/legacy-architect-handoff.spec.ts`) use the `bundledLegacyArchitect` fixture (`e2e/fixtures/legacy-architect.ts`) instead of the suite's build: once per worker it builds the app with `__ARCHITECT_V8__` set (`e2e/scripts/preview-with-legacy-architect.mjs`, about half a minute), serves it with `vite preview` on port 4311+, and puts a stub page at `/v8/index.html`, which the app's preview middleware serves for every `/v8/` URL. They assert the URL and the stored hand-off record or choice, not Architect 8 itself. `specs/legacy-library.spec.ts` covers the rest (legacy rows, upgrade a copy, `/?upgrade=`, Clear all) against the suite's own build.
- Interface specs build each stage **from scratch through the real editor UI**, then snapshot the normalised saved stage JSON via `stageSnapshotJson(...)`.
- The one deliberately-added app-source seam is `data-field-name` on redux-form fields (fresco-ui `UnconnectedField`). Otherwise, locate by accessible role/name and existing fresco-ui testids.
- **No real Mapbox traffic, ever.** The all-interfaces fixture carries the shared Mapbox testing token, and a live `mapboxgl.Map` bills it. The `architect-test` fixture installs `installMapboxMocks` (`e2e/fixtures/mapbox-mocks.ts`) on the browser context, so every page in it — second tabs and popups included — gets the mocks, and any other `*.mapbox.com` request is aborted and fails the test in teardown. A failure listing Mapbox paths means a new endpoint needs a mock there — or a spec built its own context outside the fixture and must install them itself.

## Running it

```bash
# Fast local run (JSON stage-snapshots ARE compared; visual PNG baselines are CI-gated and no-op locally):
pnpm turbo run build --filter=@codaco/architect
pnpm --filter @codaco/architect exec playwright test --config e2e/playwright.config.ts
# scope to one spec: … playwright test --config e2e/playwright.config.ts specs/interfaces/<type>.spec.ts

# Debug locators against the live app:
pnpm --filter @codaco/architect test:e2e:headed          # (add --trace on / --debug)

# Full run inside the pinned Playwright Docker image (the CI path; also compares visual baselines):
pnpm --filter @codaco/architect test:e2e
```

## Reading a failure

- **A JSON stage-snapshot diff** (`specs/interfaces/*.spec.ts`, `*-stage.json`) means the **saved stage shape changed**. If the change is intended, regenerate: `… playwright test <spec> --update-snapshots` (JSON snapshots are font-independent, so regenerating locally is fine). If it's _not_ intended, it's a regression — fix the app, don't update the snapshot.
- **A visual PNG diff** (`codebook`/`summary`, under `e2e/visual-snapshots/`) means rendered output changed. Invoke `regenerating-e2e-visual-snapshots` to generate the two `@visual` captures with the manual CI workflow, inspect them, and adopt only intended changes. These baselines are **amd64-truth**. The local fallback, `pnpm --filter @codaco/architect test:e2e:update-snapshots`, pins `--platform linux/amd64`; under plain QEMU Chromium may crash, so prefer the CI artifact on Apple Silicon. Native arm64 runs skip the pixel comparison automatically (a `[visual] skipping` warning is normal there, not a gap).
- **A locator timeout** usually means the editor UI changed (renamed/moved field, section, or control). Update the locator (below), don't loosen the assertion.

## Updating / adding e2e when a feature changes

- **New interface type** → add a create-from-scratch spec under `e2e/specs/interfaces/` mirroring an existing one (use the `StageEditor` page object, the section-scoped `editor-sections/*` helpers, and `stageSnapshotJson`). Give the snapshot a unique `<type>-stage.json` name (they share one flat `visual-snapshots/chromium/` dir). Add the type to the all-interfaces fixture (`packages/protocols/e2e/all-interfaces/protocol.json`) **and** bump `EXPECTED_STAGE_TYPE_COUNT` in `packages/protocol-validation/src/__tests__/all-interfaces-fixture.test.ts` — the test guards against accidental fixture edits (it asserts a hardcoded count, it does not enforce coverage), so a new type breaks it until the constant is bumped.
- **Changed editor UI** (new/renamed field, section, or control) → update the affected spec's locators and, if shared, the page objects in `e2e/pageobjects/` and `e2e/pageobjects/editor-sections/`. `section(title)` takes the section's `data-name` **title** (which may differ from the component name — grep the real `<Section title=…>` prop). If a stage's saved JSON changes as a result, regenerate that spec's snapshot.
- **Changed app-facet behaviour** (timeline, download/import/clear, codebook, summary, resources) → update the matching `e2e/specs/<facet>.spec.ts`.
- **Locators**: prefer `getByRole` accessible name, existing fresco-ui dialog/wizard/spotlight testids, and the `data-field-name` seam. Do **not** add new app-source `data-testid`s unless a control is genuinely unlocatable otherwise — and if you must, keep it minimal and note it.
- Assert saved data via `readProtocolJson`/`readStageJson` (from `e2e/helpers/read-store.ts`) with runtime narrowing (no `as` casts). Snapshot via `stageSnapshotJson` (from `e2e/helpers/normalize-stage.ts`).

## Reference

Design + plan: `docs/superpowers/specs/2026-07-12-architect-e2e-testing-design.md`, `docs/superpowers/plans/2026-07-12-architect-e2e-testing.md`. Suite layout: `apps/architect/e2e/{specs,pageobjects,helpers,fixtures,scripts}`.
