# Architect e2e testing — design

**Date:** 2026-07-12
**App:** `@codaco/architect` (`apps/architect`)
**Status:** approved (brainstorming)

## Problem

Architect (the Vite + Redux protocol designer PWA) has **no end-to-end tests**.
Its only automated coverage is 113 Vitest unit files under
`apps/architect/src/**/__tests__/` (jsdom). The one Playwright suite in the whole
monorepo lives at `packages/interview/e2e/` and exercises the participant-facing
interview runtime, not the authoring tool.

That leaves the authoring surfaces — where a researcher actually builds a
protocol — untested end to end:

1. **Stage editor for every interface type** (19 schema-8 stage types).
2. **App-level functionality**: importing/opening `.netcanvas`, downloading/
   exporting, clearing stored data, undo/redo, migration approval.
3. **Timeline behaviour**: drag-reordering stages, insert-at-index, delete
   (including the FamilyPedigree ← NarrativePedigree deletion guard).
4. **Printable codebook / summary** and the **resource (asset) management**
   screens.

Regressions in these flows currently reach users unless a human notices them.

## Goals

- A Playwright e2e suite for `apps/architect` that covers the four facets above.
- **Full create-from-scratch coverage** of all 19 interface editors: each stage
  is built from the new-stage picker, every required field is filled, the stage
  is saved, and the resulting stage JSON is asserted.
- Functional/JSON assertions as the primary signal, with **targeted visual
  snapshots** on high-value surfaces (printable summary/codebook, resource
  library, one render per interface editor).
- Reuse of the interview suite's proven discipline (production `vite preview`
  host, `reducedMotion`, Docker-pinned baselines, CI detect/carry-forward
  wiring) rather than inventing a parallel approach.
- Robust, low-flake locators and assertions via a small set of **deliberately
  added test seams** in app/`fresco-ui` source.

## Non-goals

- Cross-browser (Firefox/WebKit) parity. Architect is a desktop authoring tool;
  this suite is **Chromium-first**. Adding other browsers later is possible but
  out of scope.
- Testing the `/preview/` popup's _interview_ behaviour — that is the interview
  suite's job. We test that architect _launches_ the preview handshake, not what
  the interview runtime does inside it.
- Migrating or reformatting the existing interview e2e suite.
- Making the architect e2e job a **required** CI check. It is informational,
  like `interview-e2e` (only `quality` is required on the merge queue).

## Background (verified facts that shape the design)

**Architect is a full routed app, not a mountable library.** Entry
`apps/architect/src/main.tsx` → `ViewManager/views/App.tsx` → `Routes.tsx`
(wouter). Screens: `/` (Home / library), `/protocol` (timeline), `/protocol/
assets` (resource library), `/protocol/codebook`, `/protocol/summary` (printable),
`/protocol/stage/:stageId` (editor; `:stageId === 'new'` + `?type=X&
insertAtIndex=N` for creation), `/protocol/experiments`, and a separate
`/preview/` HTML entry.

**Persistence is split.** `redux-remember` persists `['app','activeProtocol']`
to **per-tab `sessionStorage`** (keys `@@remember-app`,
`@@remember-activeProtocol`; the latter serialises only
`{present, activeProtocolId}` — undo history is never persisted). Durable
protocol content and assets live in **IndexedDB (Dexie) `ArchitectProtocolDB`**
(`protocols: 'id, updatedAt'`, `assets: 'id, protocolId'` with compound key
`${protocolId}::${assetId}`). Autosave is a 600ms-debounced write into the
active protocol's Dexie row.

**There are almost no test seams today.** Only three `data-testid`s exist in
architect source (`issue`, `variable-spotlight-empty`, `spotlight-list-item`).
Crucially, architect's redux-form fields **do not emit `data-field-name`** — the
interview suite's `FormFixture` (which targets `[data-field-name]`) is _not_
transferable, because architect wires `fresco-ui` fields through
`FrescoReduxField → UnconnectedField`, a path that renders no `data-field-name`.
There is **no `window` store hook** (unlike interview's `window.__interviewStore`).
The only built-in state-inspection seam is Alt+Shift+J (`JsonPreviewOverlay`).

**Interface registry.** `components/StageEditor/Interfaces.tsx` defines
`INTERFACE_CONFIGS` for all 19 types: `NameGenerator`, `NameGeneratorQuickAdd`,
`NameGeneratorRoster`, `Sociogram`, `NetworkComposer`, `Narrative`, `OrdinalBin`,
`CategoricalBin`, `DyadCensus`, `OneToManyDyadCensus`, `TieStrengthCensus`,
`AlterForm`, `AlterEdgeForm`, `EgoForm`, `Information`, `Geospatial`,
`Anonymisation`, `FamilyPedigree`, `NarrativePedigree`.

**Save/validation semantics.** The "Finished Editing" button (`id:
finished-editing`) renders **only when the draft is dirty**; clicking it runs
redux-form _sync_ validation (blocks submit, populates the Issues panel,
`data-testid="issue"`) and, if valid, commits `updateStage`/`createStage`.
**Zod full-protocol validation gates only the Preview button, not save** — a
saved stage can leave the protocol schema-invalid. Navigating directly to
`/protocol/stage/new?type=X` bypasses the picker's `encryptedVariables`
experiment gate (so Anonymisation is reachable without toggling the experiment).

**Dependencies between stages.** `NarrativePedigree`'s source-stage select is
disabled unless a `FamilyPedigree` stage already exists, and FamilyPedigree
deletion is blocked while a NarrativePedigree references it. Fixture and
create-order must respect this.

**No protocol covers everything.** The development protocol is the broadest
single protocol (15/19 types; missing Geospatial, FamilyPedigree,
NarrativePedigree, NetworkComposer). The only e2e fixture (`silos`) covers 9/19.
`AUTHORING_GUIDE.md` predates the three newest types — they must be authored
from the Zod schemas in `packages/protocol-validation/src/schemas/8/stages/`.

**Existing e2e infra to mirror** (`packages/interview/e2e/`): serial suite,
`vite preview` of a built host on :4101 (dev server explicitly avoided —
optimizeDeps re-bundling wipes Redux state mid-test), `reducedMotion: 'reduce'`,
`maxDiffPixels: 250`, snapshots gated to CI, `run.sh` Docker runner with the
image tag **derived from `pnpm-lock.yaml`** (`mcr.microsoft.com/playwright:
v<@playwright/test version>-noble`), three-way Playwright version lock-step
(catalog `@playwright/test` + catalog `playwright` + derived Docker tag), and a
CI job wired through `detect` → job → `carry-forward-statuses` → `flagToJobs`.

## Approach chosen

**Drive architect's real production build via `vite preview`, seed state through
its real storage layers, and add two small test seams to make locators and
assertions robust.**

Rejected alternatives:

- **Dev-server harness.** Simpler, but the interview suite abandoned it: vite
  optimizeDeps re-bundling forces mid-test full reloads that wipe Redux state,
  and dev has no CSP. Same trap here.
- **Dedicated mount-host (interview-style).** Interview mounts `<Shell/>` in a
  tiny host because it is a _library_. Architect is a full routed app with its
  own boot/persistence; a host would duplicate boot logic and diverge from real
  behaviour. We test the real app.

## Detailed design

### 1. Harness & directory layout

New directory `apps/architect/e2e/` (mirroring the interview split), **not** a
pnpm workspace member — so `@playwright/test` and `playwright` are added to
`apps/architect`'s `devDependencies` using the `catalog:` pins (never a nested
manifest, never hardcoded versions).

```
apps/architect/e2e/
  playwright.config.ts
  fixtures/
    architect-test.ts      # composed test: seeded page + store hook + helpers
    protocol-fixture.ts     # seed sessionStorage / IndexedDB; read store JSON
    mapbox-mocks.ts         # copied/shared from interview for Geospatial editor
    window-test.d.ts        # types for window.__architectStore
  pageobjects/
    home.ts                 # library panel, import, download-per-row, clear-all
    timeline.ts             # reorder drag, insert, delete
    stage-editor.ts         # open/save/cancel, field + section helpers
    new-stage-picker.ts     # pick interface type
    codebook.ts, summary.ts, resources.ts
    editor-sections/        # shared sub-flows: variable CRUD, prompt CRUD,
                            #   form builder, subject/entity picker, filter/skip
  helpers/
    normalize-stage.ts      # strip generated ids for JSON snapshots
    ports.ts
  specs/
    interfaces/             # one spec per interface type (create-from-scratch)
    app-functionality.spec.ts
    timeline.spec.ts
    codebook-and-summary.spec.ts
    resources.spec.ts
  scripts/
    run.sh                  # Docker runner (image tag derived from lockfile)
  visual-snapshots/chromium/
```

`playwright.config.ts` (Chromium-only):

- `testDir: './specs'`, recursive.
- `webServer`: one server — `vite preview` of the **e2e production build**, on a
  pinned `--strictPort` (**4301**, distinct from interview's 4101/4200 so both
  can run locally). `reuseExistingServer: !CI`.
- `use`: `baseURL http://localhost:4301`, `reducedMotion: 'reduce'`,
  `contextOptions: { serviceWorkers: 'block' }`, viewport 1920×1080,
  trace/video/screenshot on-failure.
- `expect.toHaveScreenshot`: `{ animations: 'disabled', maxDiffPixels: 250 }`.
- `snapshotPathTemplate: '{snapshotDir}/{projectName}/{arg}{ext}'`.
- `fullyParallel: false`, `workers: 1` initially (matches interview; revisit
  parallelism once the suite is green — see Risks). `retries: CI ? 2 : 0`.

**No side asset server.** Architect assets are IndexedDB blobs, and the built
app's CSP `connect-src` would block an arbitrary localhost port. Mapbox is the
only external origin the editor touches and it is CSP-allowed, so
`page.route`-based mocking (reused from interview's `mapbox-mocks.ts`) is the
mechanism for deterministic Geospatial editor tests.

### 2. Test seams (app-source changes)

Three additions, each minimal and gated so nothing ships to users:

1. **`data-field-name` on architect's redux-form fields.** Extend
   `FrescoReduxField`/`UnconnectedField` (or the architect wrapper) to emit
   `data-field-name="<name>"` on the field wrapper, matching the attribute
   `fresco-ui` already emits on its connected `useField` path. This makes every
   stage-editor field locatable by its config/variable name. Because
   `fresco-ui` is shared, the change is made so it is inert unless a name is
   present, and the architect story/unit snapshots are updated per the repo's
   "update the component story" convention.

2. **`window.__architectStore`, build-flag gated.** In `ducks/store.ts`, expose
   the store on `window` **only** when a build-time flag is set (e.g.
   `import.meta.env.VITE_E2E === 'true'`), set exclusively by the e2e build
   command — never by `build:web`. Specs read normalized stage/protocol JSON
   from it. This mirrors interview's `window.__interviewStore` (`Shell.tsx`).
   `window-test.d.ts` types it via interface merging.

3. **A few `data-testid`s** on controls that are otherwise ambiguous by
   role/name: timeline stage rows (`stage-row` + index/id), new-stage-picker
   options (`new-stage-option-<type>`), asset rows (`asset-row`). Kept to the
   minimum needed; everything addressable by accessible name/label stays that
   way (toolbar buttons already expose `aria-label`; `fresco-ui` dialogs already
   expose `dialog-primary/-cancel/-secondary/-submit` and `wizard-next/-back/
-cancel`).

All three land in an early PR and are reviewed on their own (see Delivery).

### 3. All-interfaces e2e fixture protocol

Author one canonical `protocol.json` as a **loose protocol** in
`packages/protocols` under a new entry with `kind: 'e2e'` (the manifest is
`{ protocols: [...] }`; architect only surfaces `kind === 'template' &&
architectTemplate`, so an `e2e` fixture never appears in the app UI — the
`silos` `e2e` entry is precedent).

Requirements:

- Covers **all 19** schema-8 stage types, ordered **FamilyPedigree before
  NarrativePedigree** (source-stage dependency).
- Authored against the Zod schemas (three newest types absent from
  `AUTHORING_GUIDE.md`); validated with
  `node packages/protocol-validation/scripts/cli.js <path>` (exit 0).
- Rich codebook (node/edge/ego variables of varied types) so the codebook and
  summary screens have substantive content to snapshot.
- A handful of assets (image/video/network/geojson) for resource-management and
  summary asset-manifest coverage.
- **Avoids the shared testing Mapbox token** in its assetManifest, so the
  `TestingMapboxTokenAlert` banner does not churn `/protocol` snapshots. Where
  Geospatial needs a token in-editor, tests inject/mocks handle it rather than
  the fixture carrying the shared token.

This fixture feeds the timeline / summary / codebook / resources / download /
clear specs. The **create-from-scratch interface specs do not consume it** —
they build each stage themselves.

The fixture is CI-validated by a **dedicated Vitest test** co-located with the
fixture (or in `packages/protocols`) that loads the fixture `protocol.json` and
runs it through `@codaco/protocol-validation`'s `validateProtocol`, asserting it
passes. This runs in the always-on `test` quality gate, so an invalid fixture
fails a required check rather than surfacing as an opaque runtime error — and it
does not depend on the path-filtered `development-protocol-main.yml` workflow
(which only validates the development protocol).

### 4. Seeding & isolation

Two seeding paths, chosen per test:

- **Editor / create-from-scratch / timeline / codebook / summary / resources:**
  seed `sessionStorage` `@@remember-app` + `@@remember-activeProtocol` via
  `addInitScript`, landing directly in an active-protocol editor session with no
  onboarding UI. The `activeProtocol` payload must be exactly
  `{present, activeProtocolId}`; the rehydrate reconcile only discards `present`
  when a **non-null** stamped id mismatches `app.activeProtocolId`, so stamp
  matching ids (or a null stamped id). Autosave cannot corrupt anything when
  only sessionStorage is seeded: `flush()` no-ops when no Dexie row exists.

- **Library-panel tests (per-row download, clear-all, open-from-library):** seed
  IndexedDB `ArchitectProtocolDB` via `page.evaluate` (raw `indexedDB`) before
  load; the Home list uses Dexie `liveQuery`, so it updates reactively.

Isolation rules:

- **One app page per browser context.** Two pages on `/protocol*` trip the
  BroadcastChannel single-editor lock (read-only "open elsewhere", autosave
  off). The `/preview/` popup does not mount the lock, so `launchPreview`
  popups (caught via `context.waitForEvent('page')`) are safe.
- Service workers blocked at the context level; each test starts from a known
  seeded state. Because the suite is serial (`workers: 1`) initially, tests
  reset seeded storage in `beforeEach`.
- Wait out the inline `#boot-loader` (fades ~400ms after mount) before first
  interaction/snapshot.

### 5. Suite organization (the four facets)

**(a) Per-interface editors — create-from-scratch, ×19.** One spec per type
under `specs/interfaces/`. Each:

1. Seeds an empty active protocol (with the minimal codebook a given type needs
   — e.g. an edge type for AlterEdgeForm, a source FamilyPedigree stage already
   present for NarrativePedigree).
2. Opens the new-stage picker → selects the type (`new-stage-option-<type>`) OR
   navigates `/protocol/stage/new?type=X` for types gated behind experiments.
3. Fills **all required fields**, composing shared `editor-sections` sub-flows:
   _create variable_, _add/edit/delete prompt_, _configure form_, _pick
   subject/entity type_, _configure filter / skip-logic_, plus type-specific
   sections (Sociogram layout/edges, Geospatial map options with mapbox mocks,
   Narrative presets, pedigree specifics).
4. Clicks "Finished Editing"; asserts no Issues panel entries; asserts the saved
   stage via a **normalized JSON snapshot** (§7).
5. Takes **one editor render snapshot** of the populated editor.

The complex interfaces (Sociogram, NetworkComposer, Geospatial, FamilyPedigree,
NarrativePedigree) will need the most section sub-flow work; the shared
`editor-sections` page objects keep that DRY.

**(b) App functionality** (`app-functionality.spec.ts`):

- Import `.netcanvas` via the hidden Home file input (`setInputFiles`);
  round-trip a downloaded export back through import.
- Download/export: toolbar "Download" + per-row download; assert via
  `page.waitForEvent('download')` and a **filename regex** (name embeds a
  minute-resolution local timestamp).
- Clear-all-data: Home "Remove all data" → confirm dialog → `clearAllStorage()`
  (localStorage + both Dexie tables cleared + `location.reload()`); assert the
  library is empty after reload.
- Undo/redo toolbar behaviour.
- Migration-approval dialog: open an older-schema `.netcanvas`, approve, assert
  it migrates and opens.

**(c) Timeline** (`timeline.spec.ts`) — against the fixture protocol:

- Reorder via motion `Reorder`: `mouse.down()` → several `mouse.move(..,
{steps})` → `mouse.up()`; assert one `moveStage` committed (new order in
  store JSON). Guard against the 25px² click-vs-drag threshold.
- Insert-at-index via `InsertButton` → picker → new stage lands at the right
  index.
- Delete a stage (hover-revealed delete → confirm); assert the
  FamilyPedigree ← NarrativePedigree deletion guard blocks deletion while a
  dependent NarrativePedigree exists.

**(d) Printable codebook / summary + resources**
(`codebook-and-summary.spec.ts`, `resources.spec.ts`) — against the fixture:

- `/protocol/summary`: assert content renders from redux; snapshot under
  `page.emulateMedia({ media: 'print' })` for print-CSS coverage; stub
  `window.print` (via `addInitScript`) to assert the Print action fires.
- `/protocol/codebook`: entity/variable listing; snapshot.
- Resource library: add an asset (dropzone `setInputFiles`), assert it lists;
  attempt to delete an **in-use** asset (refused) vs an unused one (confirm →
  removed); unused-asset warning badge.

### 6. Shared page objects & helpers

- `stage-editor.ts`: `open(stageId)`, `save()` (waits for dirty → clicks
  `finished-editing` → waits for navigation to `/protocol`), `cancel()`,
  `expectNoIssues()`, `field(name)` (locates via `data-field-name`).
- `editor-sections/`: the reusable CRUD sub-flows named above — these are the
  backbone that makes 19 create-from-scratch specs tractable.
- `new-stage-picker.ts`, `timeline.ts`, `home.ts`, `codebook.ts`, `summary.ts`,
  `resources.ts` as above.
- `normalize-stage.ts`: deep-clones a stage/protocol object and replaces
  generated UUIDs/ids with stable placeholders so JSON snapshots are
  deterministic.

### 7. Assertions

**Primary:** normalized JSON snapshot. Read the saved stage (or whole protocol)
from `window.__architectStore`, run it through `normalize-stage.ts`, and
`expect(json).toMatchSnapshot()`. This gives a strong whole-stage signal with
low per-spec code; intentional schema changes self-update via
`--update-snapshots`. JSON snapshots are **not** font-sensitive, so they compare
identically on macOS and in Docker.

**Secondary:** targeted visual snapshots (§8) on the surfaces where layout/print
CSS is the thing under test.

### 8. Visual snapshots & Docker

Reuse interview's discipline exactly:

- Baselines committed under `apps/architect/e2e/visual-snapshots/chromium/`.
- Snapshots **gated to CI** (a `captureX` fixture that no-ops locally outside
  Docker), so a developer running the suite on macOS gets functional signal
  without spurious pixel diffs.
- Baselines regenerated **only** inside the pinned Playwright Docker image via a
  copied `run.sh` whose tag is **derived from `pnpm-lock.yaml`** (never
  hardcoded). Named volume shields host arm64 `node_modules`.
- `maxDiffPixels: 250`, `animations: 'disabled'`, `reducedMotion: 'reduce'`.
- The e2e build sets `VITE_E2E=true` (store hook) and `VITE_DISABLE_ANALYTICS=
true` (no PostHog pollution).

### 9. CI wiring

Mirror `interview-e2e` in `.github/workflows/ci-and-release.yml`:

- Add a `detect` output flag `architect_e2e` (= did anything in
  `@codaco/architect`'s turbo dep tree change).
- Add job `architect-e2e`: `needs: [quality, detect]`,
  `if: !cancelled() && needs.detect.outputs.architect_e2e == 'true'`,
  `timeout-minutes: 45`, runs `apps/architect/e2e/scripts/run.sh`, `sudo chown`
  reclaims artifacts, uploads the Playwright report (14d).
- Add an informational `architect-e2e-report` job (gh-pages report + PR
  comment), excluded from carry-forward like interview's.
- **Wire the new job into `carry-forward-statuses` `needs:` and its
  `flagToJobs` map** (`FLAG_ARCHITECT_E2E: ["architect-e2e"]`) — omitting this
  makes PRs wrongly skip/block.
- Keep it **non-required** (only `quality` is required; the job is skipped in
  `merge_group`, which is fine for a non-required check).

### 10. Tooling (knip, turbo, deps)

- **knip:** add the e2e spec/host/helper/config files to the `apps/architect`
  workspace entry+project globs in `knip.json` (mirroring the interview
  entries), or the required `quality` gate fails on "unused" specs. Run
  `pnpm knip` before pushing.
- **turbo:** add `test:e2e` (+ `test:e2e:update-snapshots`) scripts to
  `apps/architect/package.json`; the turbo `test:e2e` task already exists
  (`dependsOn: ["build"], cache: false`). Add `preview/index.html` to
  `@codaco/architect#build` inputs (currently omitted — a preview-only edit can
  otherwise serve a stale cached build to e2e).
- **deps:** `@playwright/test` + `playwright` in `apps/architect`
  `devDependencies` via `catalog:`; dependabot already groups the two pins.

## Risks & mitigations

- **Serial suite is slow with 19 create-from-scratch specs.** Start serial
  (matches interview, avoids shared-state surprises); once green, revisit
  `fullyParallel` with per-worker contexts — each test already seeds its own
  isolated storage, so parallelism is plausible later. Track as a follow-up, not
  a blocker.
- **Complex interface editors (Sociogram/NetworkComposer/Geospatial/pedigrees)
  are the long pole.** The shared `editor-sections` sub-flows absorb most of the
  cost; sequence these specs last (see Delivery) so simpler types validate the
  harness first.
- **Adding `data-field-name` touches shared `fresco-ui`.** Keep it inert without
  a name, update the component story/snapshots, run `fresco-ui` unit + storybook
  checks. Reviewed in its own PR.
- **`window.__architectStore` must never ship.** Gate strictly on the e2e-only
  build flag; add a guard/assert in `assert-pwa-build.mjs` (or a unit test) that
  the production `build:web` bundle contains no `__architectStore` reference.
- **Snapshot font sensitivity.** JSON snapshots are the primary signal (font-
  independent); visual baselines are Docker-only and CI-gated, exactly as
  interview does it — never regenerate on macOS.
- **Three-way Playwright lock-step.** Consume `catalog:` pins and derive the
  Docker tag from the lockfile in `run.sh`; never hardcode the image tag.
- **Fixture churn invalidates architect turbo cache.** `packages/protocols/**`
  is a build input for architect; keep the fixture lean (small assets) to limit
  cache-bust cost.
- **Mapbox in the Geospatial editor.** Live `mapbox-gl` map — reuse the
  `page.route` mock; CSP permits `api.mapbox.com` so interception works.

## Delivery plan (one spec → sequenced plan → multiple PRs)

One coherent architecture, chunked for reviewable PRs (not a phased rollout):

1. **Harness + seams + smoke.** e2e dir, `playwright.config.ts`, `vite preview`
   webServer, seeding fixtures, `data-field-name` + `window.__architectStore` +
   minimal testids, knip/turbo/deps wiring, one trivial passing spec (open Home,
   seed a protocol, land on `/protocol`). Own PR (touches shared source).
2. **All-interfaces e2e fixture protocol** + CLI validation wiring. Own PR
   (data + validation only).
3. **App-facet specs**: app-functionality, timeline, codebook/summary,
   resources — against the fixture. One or a few PRs.
4. **Interface editor specs, in batches.** Simple types first (Information,
   forms, name generators, bins, censuses), complex types last (Sociogram,
   NetworkComposer, Geospatial, FamilyPedigree, NarrativePedigree). Batched PRs.
5. **CI job + report + carry-forward wiring.** Own PR (touches
   `ci-and-release.yml`), landed once the suite is green locally/in Docker.

Each PR is independently green (types, lint, knip, unit + the e2e it adds) and
carries the appropriate changeset (app-only vs library, per the repo's changeset
lanes).

## Open questions

None blocking. Deferred, to decide during implementation: whether to enable
`fullyParallel` after the suite is green (perf follow-up), and whether any
create-from-scratch spec should additionally assert the whole-protocol JSON
(vs just the created stage).
