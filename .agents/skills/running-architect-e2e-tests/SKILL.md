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
- It seeds protocols directly into `ArchitectProtocolDB` (IndexedDB) + `@@remember-*` sessionStorage, and asserts the **autosaved protocol row** read back from IndexedDB. There is **no `window` store hook**.
- Interface specs build each stage **from scratch through the real editor UI**, then snapshot the normalised saved stage JSON via `stageSnapshotJson(...)`.
- The one deliberately-added app-source seam is `data-field-name` on redux-form fields (fresco-ui `UnconnectedField`). Otherwise, locate by accessible role/name and existing fresco-ui testids.

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
- **A visual PNG diff** (`codebook`/`summary`, under `e2e/visual-snapshots/`) means rendered output changed. These baselines are **amd64-truth**: regenerate **only inside Docker** with `pnpm --filter @codaco/architect test:e2e:update-snapshots` — never on the host. The regen run pins `--platform linux/amd64` (glyph metrics differ on arm64, moving text wrap points); on Apple Silicon this needs Docker's Rosetta mode, and under plain QEMU Chromium crashes — in that case adopt the `actual` image from the failing CI run's `playwright-report-architect` artifact as the new baseline. Native arm64 runs skip the pixel comparison automatically (a `[visual] skipping` warning is normal there, not a gap).
- **A locator timeout** usually means the editor UI changed (renamed/moved field, section, or control). Update the locator (below), don't loosen the assertion.

## Updating / adding e2e when a feature changes

- **New interface type** → add a create-from-scratch spec under `e2e/specs/interfaces/` mirroring an existing one (use the `StageEditor` page object, the section-scoped `editor-sections/*` helpers, and `stageSnapshotJson`). Give the snapshot a unique `<type>-stage.json` name (they share one flat `visual-snapshots/chromium/` dir). Add the type to the all-interfaces fixture (`packages/protocols/e2e/all-interfaces/protocol.json`) **and** bump `EXPECTED_STAGE_TYPE_COUNT` in `packages/protocol-validation/src/__tests__/all-interfaces-fixture.test.ts` — the test guards against accidental fixture edits (it asserts a hardcoded count, it does not enforce coverage), so a new type breaks it until the constant is bumped.
- **Changed editor UI** (new/renamed field, section, or control) → update the affected spec's locators and, if shared, the page objects in `e2e/pageobjects/` and `e2e/pageobjects/editor-sections/`. `section(title)` takes the section's `data-name` **title** (which may differ from the component name — grep the real `<Section title=…>` prop). If a stage's saved JSON changes as a result, regenerate that spec's snapshot.
- **Changed app-facet behaviour** (timeline, download/import/clear, codebook, summary, resources) → update the matching `e2e/specs/<facet>.spec.ts`.
- **Locators**: prefer `getByRole` accessible name, existing fresco-ui dialog/wizard/spotlight testids, and the `data-field-name` seam. Do **not** add new app-source `data-testid`s unless a control is genuinely unlocatable otherwise — and if you must, keep it minimal and note it.
- Assert saved data via `readProtocolJson`/`readStageJson` (from `e2e/helpers/read-store.ts`) with runtime narrowing (no `as` casts). Snapshot via `stageSnapshotJson` (from `e2e/helpers/normalize-stage.ts`).

## Reference

Design + plan: `docs/superpowers/specs/2026-07-12-architect-e2e-testing-design.md`, `docs/superpowers/plans/2026-07-12-architect-e2e-testing.md`. Suite layout: `apps/architect/e2e/{specs,pageobjects,helpers,fixtures,scripts}`.
