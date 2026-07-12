# Interviewer app e2e testing — design

**Date:** 2026-07-12
**Status:** Approved (design), pending implementation plan
**Scope:** A Playwright end-to-end test suite for the `@codaco/interviewer` PWA
(`apps/interviewer`), covering protocol import/delete, interview data management
(filter/sort/export), app settings, and conducting a full interview.

---

## 1. Context & motivation

`apps/interviewer` is a single-user, offline-first PWA (Vite 8 + `vite-plugin-pwa`,
React 19, wouter, Dexie 4/IndexedDB, in-app Web Crypto vault) that hosts the
`@codaco/interview` engine plus a dashboard for protocol management, session data
management, settings, and running interviews.

**Today it has no e2e coverage.** The only Playwright suite in the repo,
`packages/interview/e2e/`, mounts the interview `Shell` in a standalone Vite host
with **no database, no auth, and mocked `onSync`/`onFinish`**. It verifies stage
behaviour only. It deliberately does _not_ exercise the Interviewer app's own
surfaces: the vault, encrypted persistence, protocol import/delete, the `/data`
table, export, settings, or the create → resume → finish session lifecycle.

This suite closes that gap. It asserts the real production contract of the
Interviewer app end to end.

### What interviewer e2e adds beyond the interview-package suite

- **Persistence seam** — real `onSync` → encrypted Dexie writes, per-id mutation
  serialization, resume-from-`currentStep` after reload, finish-vs-trailing-sync race.
- **Session lifecycle** — create (case-ID form), resume pill, finished-session
  short-circuit, `InterviewComplete`, and DataView/export of the final network.
- **Auth/vault integration** — enter/exit/export step-up gates, lock-on-reload,
  the unlock screen.
- **Asset pipeline** — `.netcanvas` import → encrypted asset storage → blob-URL
  resolver, vs. the host's plain HTTP URLs.
- **Real host wiring** — the built PWA bundle, production CSP/chunking, service
  worker environment, animations enabled.

## 2. Locked decisions

These were resolved during brainstorming and are the ground rules for the plan.

| Decision                              | Choice                                                                                                                                  | Rationale                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Test seams**                        | `data-testid` only. No `window.__test` hooks, no `isE2E` Shell flag in the app.                                                         | Keeps the suite honest against the exact production contract. App-src change limited to adding kebab-case testids.                                                                           |
| **Browser matrix**                    | Chromium only.                                                                                                                          | The app's key surfaces are Chromium-specific: service worker, WebAuthn/PRF, and `showSaveFilePicker`. Firefox/WebKit would force conditional skips and can't test SW/biometric at all.       |
| **Auth modes covered**                | PIN + passphrase (lifecycle specs). Biometric out of scope.                                                                             | Biometric needs a CDP virtual authenticator, is Chromium-fragile, and overlaps PIN for the gate logic.                                                                                       |
| **Default mode for functional specs** | `none` (unencrypted). PIN + passphrase get dedicated lifecycle specs.                                                                   | Fastest workhorse; `none` is a real product state for an un-installed browser tab. The encryption path is still exercised by the auth specs and by the synthetic generator (which encrypts). |
| **Interview protocol**                | A purpose-built lean `.netcanvas` in `packages/protocols/e2e/`.                                                                         | Small and fast, full control over stages, doubles as the import fixture. Avoids SILOS's ~22 MB / ~54 stages.                                                                                 |
| **Visual coverage**                   | Heavy. Chromium baselines across most screens/states + per-stage interview captures.                                                    | Requested. Chromium-only keeps baseline maintenance to a single project.                                                                                                                     |
| **Test target**                       | The built PWA served by `vite preview`.                                                                                                 | The SW only exists in the built app; `assert-pwa-build` gates that exact output; the interview suite learned that a dev server's `optimizeDeps` re-bundle wipes app state mid-test.          |
| **CI**                                | New non-blocking `interviewer-e2e` job, Docker-pinned, gated on the existing `interviewer` detect flag, carry-forward.                  | Mirrors `interview-e2e`. Not added to the required `quality` aggregator initially; promote to required once stable.                                                                          |
| **Data-management seeding**           | The app's own synthetic-session generator, plus one real conducted interview.                                                           | The generator produces real, encrypted, exportable networks — seam-honest and fast.                                                                                                          |
| **Service worker**                    | `serviceWorkers: 'block'` by default. SW/offline/update-prompt behaviour is an optional later extension, not part of these four facets. | Deterministic functional tests; `page.route` works; avoids SW-cache bleed between tests.                                                                                                     |

## 3. Structural approach

**Standalone `apps/interviewer/e2e/`, mirroring the conventions of
`packages/interview/e2e/` but not sharing its code.**

A new Playwright project living inside the app, with its own config, fixtures,
Docker runner, and CI job. It reuses proven _patterns_ — `getByRole`-first
locators with a `getByTestId` escape hatch, Docker-pinned per-project snapshots,
a `vite preview` webServer, a lockfile-derived Playwright image, a
`protocol-paths.ts` helper resolving fixtures from `packages/protocols` — but keeps
ownership app-scoped so turbo change-detection stays clean.

_Alternatives considered and rejected:_

- **Shared `packages/e2e`** — couples the app's suite to the interview package and
  muddies turbo change detection.
- **Vitest browser mode / Storybook project** — cannot drive full-app routing, the
  service worker, real downloads, or the vault. Inadequate for these four facets.

## 4. Directory layout

```
apps/interviewer/e2e/
  playwright.config.ts
  fixtures/
    test.ts              # composes all fixtures
    reset-fixture.ts     # fresh context per test → IndexedDB + localStorage isolated
    protocol-fixture.ts  # import lean .netcanvas via <input type=file>; delete; install sample
    seed-fixture.ts      # drive synthetic-session generator to populate /data
    vault-fixture.ts     # seed precomputed VaultRecord in localStorage + UI-unlock (PIN/passphrase)
    download-fixture.ts  # stub showSaveFilePicker/navigator.share → object-URL path; capture + unzip
  helpers/
    protocol-paths.ts    # LEAN_E2E_PROTOCOL_PATH → packages/protocols/e2e/interviewer-e2e/…
    export-archive.ts    # unzip export, parse GraphML/CSV, assert against known network
    visual.ts            # injected style to hide blobs/focus-rings; mask list
    pin.ts               # typePin helper (native value-setter injection fallback)
  specs/
    home-protocols.spec.ts    # facet 1
    data-management.spec.ts   # facet 2
    settings.spec.ts          # facet 3
    conduct-interview.spec.ts # facet 4
    auth.spec.ts              # PIN + passphrase lifecycle
    smoke-none.spec.ts        # plain-tab 'none' baseline
  visual-snapshots/chromium/*.png   # committed baselines
  scripts/
    run.sh                    # Docker-pinned: build:web upstream + playwright test
    build-e2e-protocol.mjs    # regen lean .netcanvas from protocol.json (documented, not hot-path)
  tsconfig.json
  README.md
```

## 5. Harness & configuration

### `playwright.config.ts`

- `testDir: ./specs`, `snapshotDir: ./visual-snapshots`,
  `snapshotPathTemplate: {snapshotDir}/{projectName}/{arg}{ext}`.
- **`webServer`**: `vite preview` on a **dedicated strict port 4180** (avoids 4101,
  4200, 5180, 6006, 6009 used elsewhere), serving `dist/` built upstream;
  `reuseExistingServer: !process.env.CI`.
- **`fullyParallel: true`** — each test gets a fresh browser context, so IndexedDB
  and `localStorage` are isolated for free. Unlike the interview suite (which is
  serial because it shares a worker-scoped context), this suite needs no
  cross-test state serialization.
- Single Chromium project.
- **`use`**: `baseURL: http://localhost:4180`, `serviceWorkers: 'block'`,
  `reducedMotion: 'reduce'`, viewport 1920×1080, `trace: 'retain-on-failure'`,
  `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'`.
- **`expect.toHaveScreenshot`**: `animations: 'disabled'`, per-surface
  `maxDiffPixels`, dynamic regions handled by `mask` (not by loosening the
  threshold).
- `retries: process.env.CI ? 2 : 0` (matches the interview suite's flake policy).

### Reset

Rely on Playwright's per-test fresh context. No manual DB teardown between tests.

### Vault fixture

The DEK lives only in a module-scope variable (`src/lib/db/sessionKey.ts`) and is
dropped on every reload, so **"unlocked" state can never be restored from
`storageState`** — every new context starts locked in secured modes. The fixture
therefore:

1. Commits a **precomputed `VaultRecord`** (JSON) for a known PIN (`12345678`) and
   a known passphrase, generated once by driving the setup wizard and dumping
   `localStorage['interviewer:vault']`. A regen script documents how to
   reproduce it.
2. Seeds that record into `localStorage` via `addInitScript` before first load.
3. Unlocks through the real `LockScreen` UI, paying the 600k-iteration PBKDF2
   derivation exactly once per context.

Only the auth specs use this fixture. Functional specs run in `none` mode and
never pay the derivation cost. The `typePin` helper injects via the native
value-setter if React's `onChange` doesn't fire from a plain `fill` (known
fresco-ui PIN-field behaviour).

### Protocol fixture

`setInputFiles` on the dropzone's real `<input type=file>` (rendered by
`react-dropzone`'s `getInputProps` in `ImportTriggerCard`) with the lean
`.netcanvas`. Deletion uses the active deck card's `Delete Protocol` control →
confirm dialog.

### Seed fixture (synthetic sessions)

`generateSyntheticSessions({ protocolHash, count, simulateDropOut,
respectSkipLogicAndFiltering })` (`src/lib/synthetic/generate.ts`) requires a
protocol installed first, then writes `count` **encrypted** sessions with real
generated networks and a realistic complete/dropped-out mix (`isSynthetic: true`).
The fixture imports the lean protocol, then drives **Settings → Synthetic data →
Generate**. These sessions populate `/data` for filter/sort/pagination and are
exportable with real content.

### Download / export fixture

`src/lib/files/download.ts`'s `saveBlob` prefers `window.showSaveFilePicker` on
Chromium, which Playwright's `waitForEvent('download')` cannot observe. The
fixture `addInitScript`s to delete `window.showSaveFilePicker` and
`navigator.share`, forcing the object-URL `<a download>` fallback to fire a real
`download` event. It drives the **two-gesture** flow — "Export N selected"
(builds the zip in memory, "Archive ready" toast) then "Save export"
(`handleShareReady` → `saveBlob`) — captures the zip, unzips in Node
(`helpers/export-archive.ts`), and asserts GraphML/CSV contents against the known
network. `exportedAt` is stamped only after a confirmed save, so the Exported
facet flipping is a real assertion.

## 6. Test matrix

### `home-protocols.spec.ts` — facet 1: protocol import & delete

- Import the lean `.netcanvas`: success toast, deck card appears with correct name.
- Duplicate re-import upserts (content hash is the key): no duplicate card.
- Validation-failure path: a deliberately malformed fixture → "Import failed"
  destructive toast + "View details" opens the validation-issues dialog.
- Install the bundled **Sample** protocol via its deck card.
- Delete a protocol: confirm-dialog copy reflects the unexported-session count
  (`deleteProtocolMessage.ts`); cascade removes the protocol's sessions and assets.

### `data-management.spec.ts` — facet 2: filter/sort/export

Seed synthetic sessions, then:

- Status chips (All / In progress / Complete) with counts.
- Global search by case ID and protocol name.
- Filter popover: Case ID text, Protocol faceted filter, Started/Updated date
  ranges, Export-status boolean, Clear-all.
- Column sort across all six sortable columns (caseId, protocolName, startedAt,
  updatedAt, progress, exportedAt) with direction toggle; default `updatedAt desc`.
- URL-state round-trip: a deep link (`/data?protocol=…&status=…&sort=…&dir=…`)
  restores the same filtered/sorted view.
- Pagination (25/page) and the select-all-matching banner.
- **Export**: select → export → unzip → assert GraphML + CSV file presence and
  contents against the seeded network → `exportedAt` set → Exported facet flips.
- Bulk delete → confirm dialog → rows gone.
- Resume an in-progress row → navigates to `/interview/:id`.

### `settings.spec.ts` — facet 3: settings

Each setting persists across reload and takes effect:

- Export format toggles (`exportGraphML` / `exportCSV`) change archive contents.
- `useScreenLayoutCoordinates` (+ width/height) changes sociogram export coords.
- Idle-timeout selection persists.
- The three step-up flags (`requireUnlockOnEnter` / `OnExit` / `OnExport`) gate
  their respective interview boundaries.
- Analytics opt-out (`analyticsEnabled: false`) → no relay contact.
- About section shows the app version and a storage estimate.

### `conduct-interview.spec.ts` — facet 4: conducting an interview

- New session via the case-ID form → walk every stage of the lean protocol →
  FinishSession confirm → `InterviewComplete` → exit to Home.
- Resume path: quit mid-interview → ResumePill or the `/data` Resume row →
  returns to the correct `currentStep`.
- Per-stage visual snapshots (initial + final), mirroring the interview suite's
  capture helper.

### `auth.spec.ts` — PIN + passphrase lifecycle

- PIN: enrol via the setup wizard → reload re-locks → unlock screen → wrong PIN
  rejected → step-up gate appears on interview enter (`requireUnlockOnEnter`).
- Passphrase: enrol → unlock.
- Reset-app-data path (`ResetAppDataButton`).
- Biometric explicitly out of scope.

### `smoke-none.spec.ts` — plain-tab baseline

A fresh browser tab reaches Home in `none` mode with the Sample card visible and
no lock screen — the real product state for an un-installed tab.

## 7. The lean e2e protocol

A small schema-8 `protocol.json` authored in
`packages/protocols/e2e/interviewer-e2e/`, covering one of each **core, offline**
stage type:

- an ego form,
- a name generator (quick-add) with a couple of prompts,
- a sociogram stage (position + edge) — the signature interviewer interaction, and
  the interview suite already ships a sociogram page-object to model on,
- an information screen,
- (the engine appends FinishSession automatically).

**No Geospatial/Mapbox stage** — that dodges the online dependency, the Mapbox
token, and the CSP `connect-src` restriction.

Workflow:

1. Author `protocol.json` against the schema in
   `packages/protocol-validation/src/schemas/8/`, mirroring
   `packages/protocols/development/protocol.json` for stage shapes.
2. Validate to `EXIT=0`:
   `node packages/protocol-validation/scripts/cli.js <protocol.json>; echo "EXIT=$?"`.
3. Zip `protocol.json` (+ any assets) into `interviewer-e2e.netcanvas`, commit the
   binary, and register it in `packages/protocols/manifest.json` with
   `kind: "e2e"`, `id`, `name`, `protocolPath`, `assetDir`,
   `architectTemplate: false`.
4. Expose the path via `apps/interviewer/e2e/helpers/protocol-paths.ts`, exactly
   like `SILOS_PROTOCOL_PATH`.
5. Provide `scripts/build-e2e-protocol.mjs` to regenerate the `.netcanvas` from
   source (documented; not on the test hot path).

This one fixture drives the import, interview, and export facets.

## 8. Visual snapshots (heavy)

Chromium baselines for:

- Empty Home deck; Home with an imported protocol; delete-confirm dialog.
- `/data` empty and populated (with dynamic regions masked).
- Key filter/sort states.
- Each Settings section.
- `LockScreen`; each setup-wizard step.
- `InterviewComplete`.
- Per-stage interview captures (initial + final).

**Masking policy:** mask dynamic regions — app version, storage estimate,
installation id, timestamps, random case IDs — rather than raising
`maxDiffPixels`. Hide background blobs and focus rings via an injected style
(`helpers/visual.ts`), mirroring the interview suite's `VISUAL_STYLES`.

**Baseline generation:** only through the Docker `run.sh --update-snapshots`,
never locally — OS font rendering differs and would poison the committed
baselines. Baselines are committed to git.

## 9. CI & runner

### `scripts/run.sh`

Mirrors `packages/interview/e2e/scripts/run.sh`:

- Derive the image tag `mcr.microsoft.com/playwright:vX.Y.Z-noble` by grepping
  `@playwright/test@X.Y.Z` from `pnpm-lock.yaml` (pins stay on `catalog:` in
  `pnpm-workspace.yaml`, covered by the existing `playwright` dependabot group).
- `docker run` with `CI=true`, the repo mounted at `/workspace`, and a named
  `interviewer-e2e-node-modules` volume shadowing `node_modules`.
- Inside: corepack → frozen filtered install →
  `turbo run build --filter=@codaco/interviewer^...` →
  `pnpm --filter @codaco/interviewer build:web` → `playwright test` (extra args
  via `$*`).

### New `interviewer-e2e` job in `.github/workflows/ci-and-release.yml`

Mirrors the `interview-e2e` job:

- `needs: [quality, detect]`,
  `if: !cancelled() && detect.outputs.interviewer == 'true'` (reuses the existing
  `interviewer` detect flag).
- `ubuntu-latest`, ~45 min timeout, `turbo-ci-setup`, run `run.sh`, `sudo chown`
  the report dirs (Docker writes as root), `flaky-summary.mjs`
  (continue-on-error), upload the `interviewer-playwright-report` artifact.
- Add the flag→job mapping to `carry-forward-statuses`
  (`FLAG_INTERVIEWER → ["interviewer-e2e"]`).
- **Not** added to the required `quality` aggregator (only `quality` is
  branch-ruleset-required). The job is informational with carry-forward
  initially; promote to required once it is proven stable.
- Optional follow-up: a Pages-publishing report job like `interview-e2e-report`.

### Changeset

An app `-beta` changeset for the production `data-testid` additions (`@codaco/interviewer`
is `private` and on the `-beta.N` lane). The `packages/protocols` fixture and the
e2e infra are private/unpublished and need no library changeset. Never mix an app
and a library in one changeset. Author at PR time per the `creating-a-changeset`
skill.

## 10. `data-testid` additions (production code)

Per the "data-testids only" decision, add kebab-case `component-action` ids where
roles/accessible names are ambiguous:

- Deck cards + delete/import triggers (`ProtocolCarousel/`).
- DataView toolbar (search, status chips, filter-popover trigger, sort headers,
  export/save/delete/select-all controls) and rows (`DataView/`).
- Settings section controls (`SettingsDialog.tsx`).
- Unlock forms (`UnlockForms/`) — **reuse** fresco-ui's existing `dialog-*` /
  `wizard-*` / `{name}-field-error` ids rather than inventing new ones.

`getByRole` with an accessible name stays the first-choice locator (it doubles as
an accessibility check). `getByTestId` is the deliberate escape hatch for
non-semantic surfaces. Text-content locators are avoided (i18n-fragile).

## 11. Locator strategy summary

1. `getByRole(role, { name })` first — Base UI gives reliable implicit roles.
2. `getByTestId` for non-semantic surfaces (deck cards, table rows, canvas/graph
   regions, status chrome), kebab-case `component-action`.
3. Reuse fresco-ui's stable `dialog-*` / `wizard-*` / `{name}-field-error` ids.
4. Never assert on user-facing copy (i18n churn).
5. Always web-first assertions (`await expect(locator).toBeVisible()`); never
   `isVisible()` or manual waits.

## 12. Out of scope (this iteration)

- Firefox and WebKit.
- Biometric / WebAuthn-PRF auth mode.
- Service-worker, offline, and update-prompt behaviour (an optional later
  extension; the config leaves a clean seam via `serviceWorkers: 'allow'`).
- Geospatial/Mapbox stages in the lean protocol.
- Promoting the CI job to merge-blocking (deferred until the suite is stable).

## 13. Open risks & notes

- **PBKDF2 cost.** Auth specs pay one 600k-iteration derivation per context. The
  unit-test override (`PBKDF2_ITERATIONS: 10` in `src/test-setup.ts`) is _not_
  available in the built app; we accept the one-time cost and keep the auth suite
  small.
- **PIN input.** May require native value-setter injection to fire React's
  `onChange` (`helpers/pin.ts`), per prior manual-harness experience.
- **`showSaveFilePicker` in CI.** Must be stubbed out (see the download fixture)
  or `waitForEvent('download')` never fires on Chromium.
- **`interviewer` detect flag breadth.** The existing flag also triggers the
  preview-deploy job, so the e2e job may occasionally run on app changes that
  don't affect e2e. Acceptable; a dedicated flag can be added later if noise is a
  problem.
- **Resume fidelity.** `hydrateSession` hard-codes `promptIndex: 0`; the resume
  test should assert on `currentStep`, not prompt position, unless prompt
  restoration is later added.
- **Stale app docs.** `apps/interviewer/PLAN.md` and parts of `docs/analytics.md`
  describe the retired Electron/Capacitor era and should not be trusted when
  writing the suite.
