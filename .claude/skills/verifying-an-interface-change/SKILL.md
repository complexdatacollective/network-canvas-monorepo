---
name: verifying-an-interface-change
description: 'Use when you have changed an EXISTING Network Canvas interface — its interview runtime (packages/interview/src/interfaces/<Name>), its stage schema (packages/protocol-validation), or its Architect editor (apps/architect) — and need to confirm the e2e configuration matrix still passes and update it if the change is intentional. NOT for adding a brand-new stage type (use creating-a-network-canvas-interface). Keywords: changed an interface, edited a stage, modified interface schema, interface editor change, interview e2e, matrix test, run interface e2e, targeted e2e, coverage manifest, option inventory, aria snapshot, pixel baseline, update interface snapshots, stage-config schema support, did I break the interface.'
---

# Verifying an interface change

## Overview

`packages/interview/e2e/matrix/` holds an e2e **configuration matrix**: one suite
per interface that exercises every configuration option functionally AND
snapshots it, so a change to an interface's runtime, schema, or the config it
accepts is caught here. This skill tells you how to run the **targeted** slice
of that matrix for the interface you touched, and how to update it when the
change is intentional. Run all commands from `packages/interview` unless noted.

**First, map your change to what actually needs rebuilding and running — this is
the step people skip and then chase phantom failures.**

## 1. What did you change?

| You changed…                                                                                    | Also affects                               | Must rebuild before running e2e                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Interview **runtime** (`src/interfaces/<Name>/…`, shared runtime)                               | rendered DOM / pixels                      | the e2e **host bundle** (it inlines interview _source_): `pnpm exec vite build --config e2e/host/vite.config.ts`                                                                     |
| A workspace **dependency** (`@codaco/fresco-ui`, `protocol-utilities`, `protocol-validation`)   | builder output, validation, rendered DOM   | that package's **dist**, then the host bundle: `pnpm turbo build --filter @codaco/interview` (builds the dep closure) → host build                                                   |
| A **stage schema** (`packages/protocol-validation/src/schemas/8/stages/<name>.ts` or `common/`) | what the builder may emit + what validates | `protocol-validation` dist (covered by the turbo build above). The vitest checks below are the fast first signal.                                                                    |
| The **Architect editor** only (`apps/architect`, no schema change)                              | the config _authors produce_               | Nothing here — the interview matrix does not drive Architect. Verify via Architect's own tests. If the editor changed the config **shape**, that is a schema change: cover it below. |

The e2e host is served by `vite preview` from a **pre-built** `e2e/host/dist/`
and `reuseExistingServer` is on locally, so a stale preview keeps serving the old
bundle. After any rebuild, free the port so Playwright starts a fresh one:
`lsof -ti :4101 | xargs kill 2>/dev/null`.

## 2. Run the fast checks first (vitest, no browser)

These validate the builder + schema in milliseconds and localize most schema
breakage before you spin up a browser:

```sh
pnpm exec vitest run --project units \
  e2e/matrix/coverage-manifest.test.ts \
  e2e/matrix/stage-config-schema-support.test.ts
```

- **coverage-manifest** schema-walks every stage definition: if your schema
  change added or renamed a stage key not in `e2e/matrix/option-inventory.ts`,
  this fails — telling you exactly which option now lacks coverage.
- **stage-config-schema-support** re-parses each interface's generated stage
  config against its `stageSchema` union member with `skipLogic`/`filter`
  injected. If your change altered whether a stage accepts those keys (e.g. you
  added/removed a `filter` field, or a strict-object composition), it fails and
  names the interface. A claim the schema now rejects is a bogus config key.

## 3. Run the targeted matrix suite

`<name>` is the interface in kebab-case (`NameGeneratorRoster` →
`name-generator-roster`). After the rebuild from step 1:

```sh
# Functional + aria snapshots for one interface (chromium = full matrix)
pnpm exec playwright test --config e2e/playwright.config.ts \
  --project=chromium-matrix e2e/specs/matrix/<name>.spec.ts
```

Cross-browser smoke (only the one `@smoke` scenario runs on ff/wk):

```sh
pnpm exec playwright test --config e2e/playwright.config.ts \
  --project=firefox-matrix --project=webkit-matrix e2e/specs/matrix/<name>.spec.ts
```

Playwright auto-starts the preview (:4101) + asset server (:4200). If you only
edited scenario/test files (no interface/schema/dep change), no rebuild is
needed — Playwright loads the TS scenarios directly.

## 4. Read the failure before touching baselines

| Failure                                            | Meaning                                                         | Do                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A `toMatchAriaSnapshot` diff                       | rendered structure changed                                      | If the change is **intended**, regenerate the baseline (step 5). If not, it's a regression — fix the code.                |
| A functional `expect(...)` in a scenario's `run()` | behaviour changed                                               | Regression, or the scenario's assumption is now stale — decide, then fix code or update the scenario.                     |
| `buildSyntheticPayload` / schema parse throws      | the builder emitted a config the schema rejects (or vice-versa) | Your schema and the `SyntheticInterview` builder disagree — reconcile the builder (`protocol-utilities`) with the schema. |
| coverage-manifest "option not claimed"             | schema gained a key with no scenario                            | Add the key to `option-inventory.ts` and a scenario that `covers` it (step 5).                                            |

A stale preview bundle (skipped step 1) presents as "my code change had no
effect" — rebuild + kill :4101 before concluding anything.

## 5. Update the tests when the change is intentional

- **New / changed / removed config option:** edit that interface's list in
  `e2e/matrix/option-inventory.ts`, then add or adjust a `ScenarioDefinition` in
  `e2e/matrix/<name>.scenarios.ts` whose `covers` names the key and whose `run()`
  asserts the option's effect. Keep exactly one `smoke: true` per suite. Re-run
  the vitest checks in step 2.
- **Intended DOM change → aria baselines** (OS-independent, regenerate locally):

  ```sh
  pnpm exec playwright test --config e2e/playwright.config.ts \
    --project=chromium-matrix --update-snapshots e2e/specs/matrix/<name>.spec.ts
  # plus the smoke baselines if the smoke scenario's DOM changed:
  pnpm exec playwright test --config e2e/playwright.config.ts \
    --project=firefox-matrix --project=webkit-matrix --update-snapshots \
    e2e/specs/matrix/<name>.spec.ts
  ```

  Note: `toMatchAriaSnapshot` is a **subset** match — extra DOM passes a stale
  baseline silently. If a scenario now reaches a materially richer end-state,
  delete its `-final.aria.yml` and regenerate so the baseline captures it.

- **Intended pixel change → pixel baselines (Docker ONLY):** the `visual`-flagged
  scenarios' PNGs are font-rendering-sensitive and must be regenerated in the
  pinned Playwright container — never locally:

  ```sh
  ./e2e/scripts/run.sh --update-snapshots --project=chromium-visual -g "<Name>"
  # (omit -g / --project to regenerate the whole visual suite)
  ```

  Verify the legacy silos pixels (`visual-snapshots/{chromium,firefox,webkit}/`)
  show NO diff afterward — only `*-matrix/` dirs should change.

- **Changed a shared cross-cutting mechanism** (`skipLogic`, stage `filter`):
  update `e2e/matrix/cross-cutting.scenarios.ts` and re-run its spec; the
  schema-support test (step 2) is what guards which stages accept those keys.

## When NOT to use this skill

- Adding a stage type that does not exist yet → `creating-a-network-canvas-interface`
  (the matrix needs a whole new suite + inventory entry, not an update).
- Any interface work at all → follow `developing-in-network-canvas` first for
  reuse, accessibility, i18n, and participant tone; this skill is only the
  verification loop.

## Quick reference

- **Suites:** `e2e/matrix/<name>.scenarios.ts` (cells) → `e2e/specs/matrix/<name>.spec.ts` (3-line runner) → aggregated in `e2e/matrix/all-scenarios.ts`.
- **Coverage contract:** `e2e/matrix/option-inventory.ts` + `e2e/matrix/coverage-manifest.test.ts` + `e2e/matrix/stage-config-schema-support.test.ts`.
- **Projects:** `{chromium,firefox,webkit}` × `{legacy,matrix,visual}`; ff/wk matrix run `@smoke` only. Aria baselines in `e2e/aria-snapshots/`, pixels in `e2e/visual-snapshots/*-matrix/`.
- **Rebuild rule:** runtime change → host build; dep/schema change → `turbo build --filter @codaco/interview` then host build; then free :4101.
- **Full architecture:** `packages/interview/e2e/README.md` (the "configuration matrix" section).
