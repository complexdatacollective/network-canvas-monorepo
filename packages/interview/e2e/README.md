# `@codaco/interview` E2E

End-to-end tests and the interactive dev harness for the interview package.
Self-contained — no database, no auth, no Fresco. Real `.netcanvas` protocols
are extracted into a temp asset directory and served alongside a tiny Vite host
that mounts `Shell` directly.

## Quick start

```sh
# Run the full suite in the official Playwright Docker image
pnpm test:e2e

# Regenerate visual baselines (also Docker)
pnpm test:e2e:update-snapshots

# Run headed against a single browser for local debugging
pnpm test:e2e:headed

# Drop into a live interview in your default browser — no console paste,
# no test runner. Useful for hand-debugging the host environment.
pnpm dev:host
```

`dev:host` is the fastest loop for "I want to click around the silos protocol
and see what happens." It boots both servers, prepares the protocol bundle,
and opens a browser tab pointed at the auto-bootstrap URL — App.tsx installs
the protocol, creates an interview, and redirects to step 0 on its own.

## Layout

```
e2e/
├── data/                  Real .netcanvas protocols used as fixtures
├── host/                  Vite app that mounts <Shell /> for tests + dev:host
│   ├── index.html
│   ├── vite.config.ts     Aliases @codaco/interview to ../src
│   └── src/
│       ├── App.tsx        Reads ?interviewId / ?bootstrap from URL
│       ├── main.tsx
│       ├── mockCallbacks.ts  No-op onSync/onFinish for tests
│       └── testHooks.ts   installProtocol/createInterview/etc, also on window.__test
├── fixtures/              Playwright fixtures
│   ├── test.ts            Composes the rest
│   ├── interview-fixture.ts  goto/next/finish, screenshot capture
│   ├── protocol-fixture.ts   .netcanvas → window.__test bridge
│   ├── stage-fixture.ts      Stage-level interaction helpers
│   └── window-test.d.ts      Typings for window.__test
├── helpers/
│   ├── assetServer.ts     Tiny static server on :4200 for protocol assets
│   └── expectations.ts
├── scripts/
│   ├── run.sh             Docker entry for test:e2e
│   ├── bootstrap-host.ts  Extracts a .netcanvas into .assets/<slug>/
│   └── dev-host.ts        Orchestrator behind `pnpm dev:host`
├── specs/                 Playwright tests (one per protocol or scenario)
├── visual-snapshots/      Per-browser baseline PNGs (committed)
├── playwright.config.ts
└── tsconfig.json
```

The `.assets/` directory is generated and gitignored: extracted protocol files
land here under either a UUID (per-test) or a slug (`dev:host`).

## Architecture

Three processes, all self-contained:

1. **Vite host** (`http://localhost:4101`) — serves the e2e host app from
   `e2e/host/` with `@codaco/interview` aliased to its source so changes
   hot-reload without a rebuild.
2. **Asset server** (`http://localhost:4200`) — a 30-line static server that
   reads from `e2e/.assets/`. Protocol files reference assets via
   `asset://<source>` in the `.netcanvas`; the protocol fixture rewrites those
   to absolute URLs (`http://localhost:4200/<slug-or-id>/<source>`) so the
   running interview can fetch them as if they came from a real CDN.
3. **Playwright** (or your browser, for `dev:host`) — drives the host.

The host has no business logic of its own. State is installed via
`window.__test` hooks defined in `host/src/testHooks.ts`:

```ts
window.__test.installProtocol(payload);
window.__test.setAssetUrl(assetId, url);
window.__test.createInterview(protocolId, participantId); // returns id
window.__test.getNetworkState(); // reads from the live Redux store
window.__test.reset();
```

The same functions are exported as ES modules from `host/src/testHooks.ts` —
`App.tsx` calls them directly for the auto-bootstrap path, while Playwright
fixtures reach them via `page.evaluate(() => window.__test.…)`.

State is held in `sessionStorage` so a `page.goto()` (or the user reloading)
preserves the protocol/interview within the same tab.

## Writing a test

The `interview-test` fixture composes everything — protocol install, interview
creation, navigation helpers, and the screenshot capture wiring:

```ts
import { test, expect } from '../fixtures/test';
import path from 'node:path';

test.describe('My protocol', () => {
  test.beforeAll(async ({ protocol, interview }) => {
    const installed = await protocol.install(
      path.resolve(__dirname, '../data/my-protocol.netcanvas'),
    );
    interview.interviewId = await protocol.createInterview(
      installed.protocolId,
    );
  });

  test('renders the first stage', async ({ interview, page }) => {
    await interview.goto(0);
    await interview.captureInitial();
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await interview.next();
  });
});
```

`captureInitial()` / `captureFinal()` produce per-browser pixel snapshots for
the matrix's `visual`-flagged scenarios in
`visual-snapshots/{chromium,firefox,webkit}-matrix/`. Snapshots are tolerant of
≤250 pixel diffs (`maxDiffPixels` in `playwright.config.ts`) but font rendering
is OS-sensitive — always regenerate baselines via `pnpm test:e2e:update-snapshots`
(which runs in the Playwright Docker image), never locally.

## The configuration matrix

`e2e/matrix/` holds a configuration matrix that exercises **every interface and
its configuration options**. Each option is verified functionally AND
snapshotted, and the whole matrix runs fully parallel.

### Two snapshot tiers

- **Aria snapshots** (`toMatchAriaSnapshot`, baselines in
  `aria-snapshots/{chromium,firefox,webkit}/`) back the config matrix. They
  are structural (accessibility tree, not pixels), so they are **OS-independent
  and regenerated locally** with `--update-snapshots`. Every matrix scenario
  takes an `initial` and a `final` aria snapshot around its interactions.
- **Pixel snapshots** (a small `visual`-flagged subset, baselines in
  `visual-snapshots/{chromium,firefox,webkit}-matrix/`) guard the rendered
  look of representative configurations. Pixels are OS-sensitive, so they are
  **only regenerated in Docker** via `pnpm test:e2e:update-snapshots`, and
  captures are CI-only at runtime.

  One webkit-only quirk: the matrix fixture disables `backdrop-filter` on
  webkit (see `fixtures/matrix-test.ts`) because Playwright's Linux WebKit
  re-runs each blur in software on every rendering update that invalidates it
  (the dialog overlay's full-viewport blur, floating frosted panels over
  animating canvases), stalling actionability checks and click dispatch.
  Webkit baselines therefore show sharp content behind translucent veils and
  panels (the tint remains, the blur does not), where chromium/firefox
  baselines show blurred content.

### Registry pattern

Each interface owns `matrix/<iface>.scenarios.ts` exporting an
`InterfaceScenarios` (`interfaceType` + a list of `ScenarioDefinition`s — see
`matrix/types.ts`). A `ScenarioDefinition` is a self-contained cell: `build()`
returns a `SyntheticInterview`, `run()` performs interactions + functional
assertions, and flags (`smoke`, `visual`, `chromiumOnly`, `slow`,
`seedNetwork`, `captureMask`, …) tune how it runs. `matrix/all-scenarios.ts`
aggregates every registry; `specs/matrix/<iface>.spec.ts` is a three-line file
that calls `defineScenarioTests(<registry>)`. The shared cross-cutting suite
(`matrix/cross-cutting.scenarios.ts`) proves the engine-level `skipLogic` and
stage `filter` machinery once — both skip actions and every Filter operator —
rather than re-testing it per interface.

### Coverage manifest

`matrix/option-inventory.ts` enumerates the configuration keys each interface
must cover. `matrix/coverage-manifest.test.ts` (a vitest unit test) asserts
that every inventoried key is claimed by some scenario's `covers`, that ids are
unique with exactly one `smoke` per interface, and — by walking the Zod stage
schema — that the inventory itself has not drifted from the protocol schema.
Keys handled by the cross-cutting suite are recorded in
`matrix/shared-claims.ts`.

### Adding a scenario

1. Add the option key(s) to that interface's list in `option-inventory.ts`.
2. Add a `ScenarioDefinition` to `matrix/<iface>.scenarios.ts` whose `covers`
   names those keys; write the functional assertions in `run()`.
3. Run the manifest: `pnpm --filter @codaco/interview exec vitest run --project units e2e/matrix/coverage-manifest.test.ts`.
4. Generate its aria baseline:
   `pnpm exec playwright test --config e2e/playwright.config.ts --project=chromium-matrix --update-snapshots -g "<id>"`.
5. If the scenario is `visual`, its pixel baseline is generated in the Docker
   update run, not locally.

### Projects

`playwright.config.ts` defines six projects: `{chromium,firefox,webkit}` ×
`{matrix, visual}`, all fully parallel. To keep the browser matrix affordable,
the `firefox-matrix` / `webkit-matrix` projects run only the `@smoke` subset (one
scenario per interface) while `chromium-matrix` runs the full matrix. Worker
count is `PW_WORKERS ?? '50%'` (CI pins `PW_WORKERS=4` — high parallelism lets
the crypto-heavy Anonymisation scenarios contend and flake).

### Sharding escape hatch (dormant)

CI runs the whole suite in one job under the 45-minute budget with no shard
matrix. If wall-clock ever exceeds that budget, enable sharding:

1. Add `strategy.matrix.shard: [1/2, 2/2]` to the `interview-e2e` job and pass
   `--shard=${{ matrix.shard }}` through to `run.sh`.
2. Set `PW_BLOB: 1` on the job — `playwright.config.ts` then emits the `blob`
   reporter instead of line/html/json.
3. The dormant `Merge sharded blob reports` step (already present, gated on
   `env.PW_BLOB == '1'`) merges the per-shard `blob-report` dirs into one HTML
   report. Give it the downloaded blob dirs.

The criterion for enabling shards is measured wall-clock over budget — not a
guess. Caching the in-container `pnpm install`/build is a cheaper first lever.

## The `?bootstrap=<slug>` URL

Used by `dev:host` and any other entry point that wants to drop a user into a
live interview without a console paste:

1. `bootstrap-host.ts <protocolPath> <slug>` extracts the `.netcanvas` into
   `e2e/.assets/<slug>/`, writes the rewritten protocol JSON + asset URL map
   to `e2e/.assets/<slug>/bootstrap.json`.
2. Browser navigates to `http://localhost:4101/?bootstrap=<slug>`.
3. `App.tsx` fetches the bootstrap JSON, calls `installProtocol` /
   `setAssetUrl` / `createInterview`, and replaces the URL with
   `?interviewId=<new>&step=0`. The user lands in the interview.

Reloading uses the existing `interviewId`; opening a new tab needs a fresh
bootstrap because `sessionStorage` is per-tab.

## Running tests in CI vs locally

`pnpm test:e2e` always runs inside the official Playwright Docker image
(`mcr.microsoft.com/playwright:v<version>-noble`), where `<version>` is the exact
`@playwright/test` version the lockfile resolves to — `scripts/run.sh` derives the
tag so the container's browser binaries always match the JS runner.
This is non-negotiable for snapshot tests: the same browser version against
the same fonts at the same DPI, regardless of whether you're on macOS arm64,
Linux x86, or a CI runner. The wrapper script (`scripts/run.sh`) mounts the
monorepo into the container and reuses a named Docker volume for
`node_modules` so subsequent runs don't reinstall.

`pnpm test:e2e:headed` skips Docker and runs Playwright against your local
browsers — useful for stepping through a test, but **do not regenerate
snapshots this way**: the resulting baselines won't match in CI.

## Troubleshooting

- **"interviewId must be set before calling goto()"** — set `interview.interviewId`
  in `beforeAll` after `protocol.createInterview()`.
- **Stage doesn't render / "Unknown interview ID"** — `installProtocol` runs
  in browser context; if the page navigated since you called it, sessionStorage
  may have been cleared. Use the `interview-test` fixture, which handles this.
- **Asset 404s** — the asset server reads from `e2e/.assets/<slug-or-id>/`.
  Confirm the directory exists and the rewritten URL in the protocol payload
  matches what the server is serving.
- **Snapshot diffs > 250 px on a CI run** — almost always a real change. If it
  isn't, regenerate via `pnpm test:e2e:update-snapshots` and inspect the diff.
