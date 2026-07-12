# `@codaco/interviewer` E2E

End-to-end tests for the Interviewer PWA. Tests drive the **built** app
(`vite preview`, not the dev server) so the service worker, precache
manifest, and encrypted-vault behaviour match what actually ships.

## Quick start

```sh
# Run the full suite in the official Playwright Docker image (visual
# snapshots included)
pnpm --filter @codaco/interviewer test:e2e

# Regenerate visual baselines (also Docker — never regenerate locally)
pnpm --filter @codaco/interviewer test:e2e:update-snapshots

# Run headed against your local Chromium for debugging — functional
# assertions only, no baseline regeneration
pnpm --filter @codaco/interviewer test:e2e:headed
```

`test:e2e:headed` may need a local Chromium binary installed once first:
`pnpm --filter @codaco/interviewer exec playwright install chromium`.

## Layout

```
e2e/
├── fixtures/
│   └── test.ts            Base test/expect, extended by later fixtures
├── helpers/
│   ├── protocol-paths.ts  Path + name of the lean e2e protocol fixture
│   └── visual.ts          makeCapture(page), statusMasks(page)
├── scripts/
│   ├── build-e2e-protocol.mjs  Builds the lean e2e .netcanvas fixture
│   └── run.sh              Docker entry for test:e2e
├── specs/                  Playwright tests, one file per facet
├── visual-snapshots/       Per-project baseline PNGs (committed, CI-gated)
├── playwright.config.ts
└── tsconfig.json
```

## Why the built app, not the dev server

`playwright.config.ts`'s `webServer` runs `vite preview` on port **4180**
against `dist/`, which `test:e2e` (via `run.sh`) and `test:e2e:headed` both
build first with `build:web`. The dev server isn't usable here: it has no
service worker, and Vite's dev-time `optimizeDeps` re-bundle can wipe app
state mid-test. Each test gets a fresh browser context (Playwright default),
so IndexedDB (`interviewer`) and `localStorage` are isolated per test with no
manual teardown.

## Visual capture is CI-gated

`capture` (from the base fixture, built on `helpers/visual.ts`) is a no-op
unless `CI` is set. Locally — including `test:e2e:headed` — specs run
functional-only: no baseline images are read or written, so there's nothing
to go stale. In CI, `capture(name)` injects `VISUAL_STYLES` (hides the
animated background blobs and focus rings) once per page and asserts against
the committed baseline in `visual-snapshots/`.

**Baselines must never be regenerated locally.** Font rendering is
OS-sensitive; `test:e2e:update-snapshots` runs inside the pinned Playwright
Docker image (`mcr.microsoft.com/playwright:v<version>-noble`, version
derived from the lockfile by `scripts/run.sh`) so the baseline matches what
CI will compare against.

## Running tests in CI vs locally

`pnpm test:e2e` always runs inside the Playwright Docker image — mounts the
monorepo, installs with a frozen lockfile, builds `@codaco/interviewer`, then
runs Playwright with `CI=true` (so visual capture is active). `run.sh`
forwards any extra arguments (e.g. `--update-snapshots`, a spec path).

`pnpm test:e2e:headed` skips Docker: it builds locally, then runs Playwright
headed against your own Chromium install. Useful for stepping through a spec,
but visual assertions are skipped (see above) and results won't match the
Docker/CI environment for anything font-sensitive.
