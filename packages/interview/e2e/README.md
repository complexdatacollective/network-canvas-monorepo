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
│   └── silos.netcanvas
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
window.__test.installProtocol(payload)
window.__test.setAssetUrl(assetId, url)
window.__test.createInterview(protocolId, participantId) // returns id
window.__test.getNetworkState()  // reads from the live Redux store
window.__test.reset()
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
import { test, expect } from "../fixtures/test";
import path from "node:path";

test.describe("My protocol", () => {
  test.beforeAll(async ({ protocol, interview }) => {
    const installed = await protocol.install(
      path.resolve(__dirname, "../data/my-protocol.netcanvas"),
    );
    interview.interviewId = await protocol.createInterview(installed.protocolId);
  });

  test("renders the first stage", async ({ interview, page }) => {
    await interview.goto(0);
    await interview.captureInitial();
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
    await interview.next();
  });
});
```

`captureInitial()` / `captureFinal()` produce per-browser snapshots in
`visual-snapshots/{chromium,firefox,webkit}/`. Snapshots are tolerant of
≤250 pixel diffs (`maxDiffPixels` in `playwright.config.ts`) but font rendering
is OS-sensitive — always regenerate baselines via `pnpm test:e2e:update-snapshots`
(which runs in the Playwright Docker image), never locally.

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

`pnpm test:e2e` always runs inside `mcr.microsoft.com/playwright:v1.59.1-noble`.
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
