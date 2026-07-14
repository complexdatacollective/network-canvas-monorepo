# Interview interface e2e configuration matrix — design

**Date:** 2026-07-13
**Status:** Approved (pending spec review)
**Scope:** `@codaco/interview` e2e suite (`packages/interview/e2e/`), plus builder
extensions in `@codaco/protocol-utilities` and CI wiring in
`.github/workflows/ci-and-release.yml`

## Goal

Give every wired configuration option of all 20 interview interfaces e2e
coverage in the existing Playwright harness. Each scenario:

- builds a protocol expressing the configuration under test,
- verifies the option's functionality with targeted assertions (DOM +
  `getNetworkState()`),
- pins structure with an aria snapshot (`toMatchAriaSnapshot`),

and a separate, small **visual suite** captures pixel snapshots for one
representative configuration per interface plus every configuration whose only
observable effect is visual. The whole matrix runs fully parallel; the suite
stays PR-informational (not a merge-queue gate).

The existing silos serial suite (`e2e/specs/silos-protocol.spec.ts`) is
untouched and remains the real-`.netcanvas`, cross-browser integration layer.

## Background (research summary)

A 26-agent research pass (2026-07-13) inventoried the full configuration
surface and harness constraints. Key facts the design rests on:

- **~418 schema options across 20 interfaces** (19 schema-8 stage types plus
  the runtime-only `FinishSession` sentinel, which is injected by the Redux
  protocol module, not authorable in a protocol). Bundling co-varying options
  into coherent scenarios yields **~207 scenarios**. Per-interface option
  inventories with wiring citations live in the research archive (see
  "Research artifacts" below).
- **Raw payload install already works.** `window.__test.installProtocol`
  (`e2e/host/src/testHooks.ts:93-100`) accepts a `ProtocolPayload`
  (`src/contract/types.ts:32-37`: `Omit<CurrentProtocol, 'assetManifest'> &
{ id, hash, importedAt, assets: ResolvedAsset[] }`) — no `.netcanvas`
  needed. The Playwright-side `ProtocolFixture.install()` only supports
  `.netcanvas` paths today.
- **`testHooks.createInterview()` always starts from an empty network at step
  0** (`testHooks.ts:108-129`). Roughly a third of scenarios need pre-seeded
  alters/edges/ego attributes; without a seeding hook they'd fall back to slow
  UI-driven setup.
- **`SyntheticInterview.getInterviewPayload()` is not the real contract**: no
  `hash`, an `assets` array instead of `assetManifest`-derived
  `ResolvedAsset[]`, plus `isPreview`/`isPending` fields nothing else uses.
  The only existing adapter is Storybook's
  (`packages/interview/.storybook/StoryInterviewShell.tsx:52-116`,
  `buildPayload`).
- **Builder gaps**: `AddStageInput` cannot express `skipLogic` or stage-level
  `filter`; `addPanel` takes only `{ title, dataSource }` (no panel `filter`);
  Sociogram `prompts[].sortOrder` isn't passed through; Anonymisation
  `validation` and protocol `experiments` are unmapped; form-field
  `hint`/`showValidationHints`/`parameters` don't pass through; the builder's
  default AlterForm `form.title` is rejected by `TitlelessFormSchema`.
- **Builder output is never validated against `CurrentProtocolSchema`**, so a
  config that type-checks can still fail the real schema's cross-reference
  `superRefine`s at runtime.
- **8 of 16 stage-fixture helpers are empty placeholders** (DyadCensus,
  TieStrengthCensus, OneToManyDyadCensus, NameGeneratorRoster, Narrative,
  Anonymisation, SlidesForm, FamilyPedigree — `e2e/fixtures/stage-fixture.ts`).
- **Parallelism is off today**: `workers: 1`, `fullyParallel: false`, one
  worker-scoped shared page (`interview-test.ts:103-148`). Per-protocol asset
  writes are already UUID-namespaced (collision-safe), but
  `AssetServer.cleanup()` (`helpers/assetServer.ts:107-114`) recursively
  deletes the whole shared `.assets` dir (currently dead code).
- **CI**: the `interview-e2e` job (`ci-and-release.yml:727-769`, 45-min
  timeout) is not a required check and never runs on `merge_group`. `run.sh`
  passes CLI args through (`$*`), so `--shard`/`--project` work without script
  changes. The in-container `pnpm install`/build is uncached in CI, so every
  shard re-pays that fixed cost.
- **Zero fixture coverage anywhere** for NetworkComposer, FamilyPedigree, and
  NarrativePedigree; their Storybook capture stories (e.g.
  `comprehensivePedigreeFixture.ts`) are the only prior art.

## Decisions

| Decision          | Choice                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matrix shape      | Coherent bundles (~207 scenarios) + shared cross-cutting suites for skipLogic/filter operator matrices; dead config asserted-absent inside existing scenarios |
| Browsers          | Full matrix on chromium; `@smoke`-tagged subset (~1/interface) on firefox + webkit; small visual suite on all three                                           |
| Snapshots         | Matrix: aria snapshots (initial + final states). Visual suite: pixel snapshots (initial + final) for representative + visually-only configs                   |
| CI gating         | PR-informational, as today; not added to `quality` or `merge_group`                                                                                           |
| Protocol sourcing | `SyntheticInterview` + payload adapter + seeded-interview hook; `.netcanvas` route reserved for the existing silos suite                                      |

## Snapshot strategy (two tiers)

**Tier 1 — visual suite (pixel snapshots).** A single spec
(`e2e/specs/matrix/visual.spec.ts`) that iterates every scenario flagged
`visual: true` across the per-interface registries — reusing that scenario's
`buildProtocol`/`seedNetwork`/`run` to reach the same states, but capturing
pixel snapshots instead of aria snapshots. A scenario is flagged `visual` when
it is the interface's representative configuration or when its option's only
observable effect is pixels. It covers:

- one representative, information-dense configuration per interface, and
- every configuration whose only observable effect is pixels: Sociogram
  background image / concentric-circle count / skew, node/edge/bin/highlight
  color options, panels-open and intro-panel layouts, and the canvas-rendered
  pedigree interfaces (the accessibility tree is blind to canvas content).

≈2–3 scenarios per interface → **~50–60 baselines per browser**, run on all
three browsers, `captureInitial`/`captureFinal` convention, regenerated only
via the Docker-pinned `test:e2e:update-snapshots` flow. Anonymisation's
continuously-animated `EncryptedBackground` is masked here (and only matters
here).

**Tier 2 — config matrix (aria snapshots + functional assertions).** Every
scenario asserts its option's behavior directly, then takes
`toMatchAriaSnapshot` snapshots at its initial and final states. Aria
snapshots are YAML accessibility-tree serializations: PR-diffable,
OS-deterministic (no font rasterization), regenerable locally without Docker,
immune to Tailwind class and motion inline-style churn, and a passive a11y
check. They catch structural regressions targeted assertions miss (a config
accidentally hiding the prompt carousel; a button losing its accessible name).

**Accepted residual risk:** a config-specific CSS-only regression in a config
not in the visual suite goes unseen. Mitigation: configs with visually
distinct _layouts_ (not just content) are promoted to tier 1. This is the same
risk class Chromatic accepts. The e2e visual suite's distinct value over the
existing `chromatic-interview` Storybook coverage is that it tests the built
host's rendering, where dev/prod CSS differences have bitten before
(lightningcss `@layer` flattening).

## Harness extensions

Four pieces, landing together:

1. **`SyntheticInterview` extensions** (`@codaco/protocol-utilities`): add
   `skipLogic` and stage-level `filter` to `AddStageInput`; `filter` on
   `addPanel`; Sociogram prompt `sortOrder` passthrough; Anonymisation
   `validation` + protocol `experiments`; form-field
   `hint`/`showValidationHints`/`parameters` passthrough; fix the AlterForm
   default-title/`TitlelessFormSchema` conflict. Storybook stories benefit
   too. (Update the builder's own tests + any affected stories per repo
   convention.)
2. **Payload adapter** (new module under `e2e/`): converts
   `getInterviewPayload()` output to a real `ProtocolPayload` — computes
   `hash`, maps assets to `ResolvedAsset[]` with asset-server URLs, and
   **parses the protocol with `CurrentProtocolSchema`** so an invalid builder
   config fails loudly at install, not as a mystery render. Ports the
   `StoryInterviewShell.buildPayload` logic to the e2e host contract rather
   than duplicating conversion ad hoc.
3. **Seeded interviews**: extend `testHooks.createInterview()` (and its
   Playwright fixture wrapper) to accept optional seeded `NcNetwork`,
   `currentStep`, and `stageMetadata`, mirroring what `StoryInterviewShell`
   already does for Storybook.
4. **Fixture surface**: new `protocol.installPayload()` method beside the
   `.netcanvas` install; implement the 8 placeholder stage fixtures with the
   interaction helpers their scenarios need (porting
   `familyPedigreeWizardHelpers.ts` for FamilyPedigree). Fix the stale
   `restoreSnapshot()` comment in `silos-protocol.spec.ts:17` (the real
   mechanism is `window.__test.reset()`), and add a guard that
   `AssetServer.cleanup()` stays unwired from any teardown (or scope it
   per-test-id) before raising worker counts.

## Test organization & coverage enforcement

- **Scenario registry**: `e2e/matrix/<interface>.scenarios.ts` exports typed
  scenario definitions:
  `{ id, covers: OptionKey[], smoke?, visual?, buildProtocol, seedNetwork?, run }`.
  One spec file per interface (`e2e/specs/matrix/<interface>.spec.ts`)
  iterates its registry. Every scenario installs its own protocol + interview
  — order-independent by construction.
- **Coverage manifest test** (vitest, in the interview package's `units`
  project): programmatically extracts each stage schema's option inventory
  (top-level + prompt-level keys via Zod shape introspection, with a manual
  list for nested sub-options where introspection is impractical) and asserts
  every option key is claimed by ≥1 scenario's `covers`. "All options
  covered" becomes a red/green invariant. Dead config keys are claimed by
  absence-assertion scenarios; skipLogic/filter keys are claimed by the shared
  suites.
- **Shared cross-cutting suites**: one interface-agnostic spec for the
  skip-logic operator matrix and one for the `Filter` operator matrix
  (~15–20 scenarios total), plus one representative skip/filter wiring
  scenario per interface. This is the biggest lever keeping the matrix at
  ~207 instead of 300+.
- **FinishSession** is special-cased: not protocol-authorable, reached by
  completing a minimal protocol; its scenarios cover confirm/cancel,
  pending/error/abort states, and menu exclusion.

### Estimated scenario bundles per interface

Planning-time estimates from the research pass (refined during implementation
planning; the coverage manifest, not this table, is the source of truth):

| Interface             | Est. | Key bundles                                                                                                                                                       |
| --------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NameGenerator         | 12   | form-fields mega, panels (existing/external/filtered), prompts + additionalAttributes, min/maxNodes, encrypted, NodeBin delete, external-data error, keyboard-DnD |
| NameGeneratorQuickAdd | 8    | quickAdd cascade, additionalAttributes, maxNodes-vs-panel-drag regression pin, encrypted, shared panels                                                           |
| NameGeneratorRoster   | 12   | CSV vs JSON dataSource, error state, cardOptions, sortOptions, searchOptions, min/maxNodes, cross-prompt exclusion                                                |
| Sociogram             | 13   | auto vs manual layout, background variants, edge display-vs-create, highlighting, drawer sortOrder, subject/filter                                                |
| NetworkComposer       | 14   | add-node, edge draw/toggle, hulls + lasso, automaticLayout precedence, background (incl. dead `image`), node/edge form mega, autosave gating, undo/redo           |
| Information           | 9    | text, image/audio/video with size bands, missing-asset fallback, markdown allowlist                                                                               |
| OrdinalBin            | 9    | bins from codebook, negative-value bin, bucket/bin sort, filter, subject scoping                                                                                  |
| CategoricalBin        | 10   | bins, other-bin dialog, bucket/bin sort, filter, multi-value membership                                                                                           |
| Narrative             | 12   | read-only invariant, presets, hulls, edges, highlighting, allowRepositioning, freeDraw, background                                                                |
| AlterForm             | 11   | intro/slide flow, field mega, validation family, encrypted, discard dialog, zero-node short-circuit                                                               |
| EgoForm               | 14   | field mega (12 components), validation incl. cross-field, scroll-nudge, pre-population                                                                            |
| AlterEdgeForm         | 12   | field mega, validation, edge color, zero-edges intro-skip                                                                                                         |
| DyadCensus            | 8    | required intro, pair flow, createEdge prefill, subject/filter                                                                                                     |
| TieStrengthCensus     | 9    | option cards, decline, pre-selection, sibling-prompt scoping, auto-advance                                                                                        |
| Anonymisation         | 7    | form + validation, confirm mismatch, downstream encryption end-to-end, experiments-off no-op                                                                      |
| OneToManyDyadCensus   | 7    | focal iteration, removeAfterConsideration, sort, filter/subject                                                                                                   |
| Geospatial            | 12   | map-options bundle (chromium-only), stub mode (fx/wk), search, showTransit, outside-area, error overlay                                                           |
| FamilyPedigree        | 14   | framing modes, boundaries, introScreen, nomination prompts, family-shape wizard walks                                                                             |
| NarrativePedigree     | 9    | inheritance-pattern walks, showAtRiskStatuses, membership scoping, misconfigured sourceStageId                                                                    |
| FinishSession         | 5    | confirm/cancel, pending/error/abort, next-disabled, menu exclusion                                                                                                |

## Parallelism & CI

- **Playwright projects split**: `chromium-legacy` / `firefox-legacy` /
  `webkit-legacy` keep the silos suite exactly as-is (serial, shared page).
  New projects `chromium-matrix` (all matrix specs, `fullyParallel: true`),
  `firefox-matrix` / `webkit-matrix` (`grep: /@smoke/`), and the visual suite
  on all three. Matrix specs use per-test isolated `page`/`context` — no
  shared-page fixture.
- **Snapshot naming**: prefix auto-derived from `test.info().titlePath` in the
  fixture so cross-file collisions are impossible rather than
  documented-against.
- **Workers**: CI-tunable (`'50%'` default in the Docker container, explicit
  env override in CI) — raised only after the isolation/guard changes above.
- **Sharding**: wire the blob reporter + `merge-reports` step into the
  workflow, but enable a shard matrix **only if** the measured single-job
  wall-clock exceeds the existing 45-minute budget; each shard re-pays the
  uncached in-container install/build, so shards are a measured fallback, not
  a default.
- The 3-way Playwright version lock-step (two catalog pins +
  run.sh-derived Docker tag) is unchanged and remains load-bearing.

## Determinism rules

Enforced by the scenario helper/fixtures, not by convention:

- Every attribute visible in an assertion or snapshot is explicitly seeded —
  the builder randomizes unset attributes on manual nodes.
- Auto-layout scenarios rely on the `isE2E` deterministic mock layout worker
  and wait on `data-simulation-running="false"` / `data-layout-mode`; no
  snapshot is ever taken against real d3-force output.
- Timer-driven UI (DyadCensus/TieStrengthCensus 350 ms auto-advance, EgoForm
  15 s scroll-nudge, 4 s node-limit toasts) uses `page.clock` or explicit
  settle-waits, never fixed sleeps.
- Geospatial: chromium runs real mapbox-gl against `mapbox-mocks.ts`
  interception and is `test.slow()`; firefox/webkit use the app-level stub
  mode; map-visual assertions (style/color/showTransit/center) are
  chromium-only matrix cells.
- Categorical attribute values are asserted as arrays, per repo convention.

## Deliverable & follow-ups

Single deliverable: harness extensions, adapter, seeding hook, stage fixtures,
scenario registries + coverage manifest, shared suites, visual suite, CI
wiring, and generated baselines land together on one branch.

Follow-ups explicitly out of scope, recorded as issues when implementation
confirms them:

- Schema/implementation coherence gaps found by research (silent no-ops like
  `CategoricalBin.otherOptionLabel` without `otherVariable`, unvalidated
  `OrdinalBin.prompts[].color`, dead `NetworkComposer.background.image`,
  Sociogram-ignored `allowRepositioning`/`freeDraw`) — these get pinning tests
  in the matrix now; fixing them is schema+migration work, routed separately.
- Promoting the suite to a required/merge-queue check.
- Caching the in-container install/build (prerequisite to aggressive
  sharding).

## Research artifacts

Full per-interface option inventories (with wiring citations), harness
reports, and the synthesis are archived from workflow run `wf_ca62fd86-737`
(2026-07-13). The inventories inform the coverage manifest's manual entries;
the manifest test is the durable representation.
