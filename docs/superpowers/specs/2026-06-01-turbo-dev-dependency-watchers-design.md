# Turbo dev dependency watchers — design

Date: 2026-06-01
Status: approved (pending spec review)

## Problem

Workspace packages consume each other as **built `dist/`** (their `exports` map to
`./dist/*`; there is no `source`/`development` export condition, and the tsconfigs
do not alias `@codaco/*` to source). So whenever a consumer task runs **without
first (re)building changed dependencies**, it silently uses stale dependency
output. This is not a loud failure in the common case:

- **Stale `dist`** (a dep was built once, its source changed since) → the consumer
  builds/runs against old code, no error.
- **Absent `dist`** (dep never built) → the only loud failure, and it is rare.

This was hit in practice: running `pnpm --filter @codaco/interview storybook`
failed with `@codaco/shared-consts` "not exporting `StageMetadataSchema`" — the
symbol exists in source, but `shared-consts` had not been rebuilt and Storybook
was not launched through turbo, so `^build` never ran.

Turbo's dependency graph (`dependsOn: ["^build"]`) and cache only apply when a task
is invoked via `turbo run`. A direct `pnpm <script>` bypasses both.

## Decision

Keep consuming dependencies as `dist` (no source-resolution / export-condition
change — see "Alternatives"). Instead, **when a dev-server task runs, run its
dependencies' `dev` watchers alongside it** so their `dist` + `.d.ts` stay fresh,
and route one-shot tasks through turbo so deps are built once first.

This is delivered through the existing `scripts/with-turbo.mjs` guard, which
already detects direct (non-turbo) invocation via the absence of the `TURBO_HASH`
environment variable and re-dispatches through turbo.

### Explicitly deferred

Live reflection of a dependency edit inside an **already-running** app/Storybook
dev server (true HMR / page reload) is a separate future effort. Vite ignores
`node_modules` in its watcher and does not Fast-Refresh built `dist`, so a running
server may not visibly update without additional consumer config. Running the
dependency watcher (this design) is necessary for that future work but may not be
sufficient on its own. See "Open verification item".

## Task taxonomy

Every dependency-bearing task is wrapped with `with-turbo.mjs`, re-dispatched
according to its kind:

| Bucket                    | Tasks                                                                          | Behaviour on a direct (non-turbo) run                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared watcher**        | web/lib `dev`                                                                  | `turbo run dev --filter=...<pkg>` — runs the package's dev server **and** every dist-built dependency's `dev` watcher in one turbo process (`dev` is the task every dist-built package shares, so `...` expands to exactly the watchers we want). Used for non-Electron `dev` (`architect-web`, `interviewer-v7` web `dev`, and the libraries).                                         |
| **Server + dep watchers** | `storybook`, **all Electron dev-servers** (`electron:dev`; legacy apps' `dev`) | The guard: (1) `turbo run build --filter=<pkg>^...` to build the dep closure once (no cold-start race), (2) starts `turbo run dev --filter=<pkg>^... --ui=stream` in the **background** (deps' `dev` watchers; `--ui=stream` so they don't fight the server for the TUI), (3) runs the real server in the **foreground**, (4) tears the background watchers down when the server exits. |
| **One-shot build**        | `build`, `build-storybook`, `electron:build`                                   | `turbo run <task> --filter=<pkg>` — dependencies built once via `^build`, no watchers.                                                                                                                                                                                                                                                                                                  |

Why Storybook and Electron share the `--watch-deps` path for two different reasons:

- **Storybook** _cannot_ use `...` — its task name is not shared by deps, so
  `--filter=...<pkg>` would launch deps' own `storybook` (fresco-ui + interview
  both bind port 6006 → clash), and turbo forbids a persistent task depending on a
  persistent one.
- **Electron** dev-servers _could_ technically use `--with-deps` (the legacy apps'
  task is literally named `dev`), but we deliberately put **all** Electron apps on
  `--watch-deps` so they behave identically, and so the Electron process runs in
  the **foreground** (where you interact with it) rather than as one persistent
  task among the library watchers inside a single `turbo run`.

Rule of thumb: **non-Electron `dev`** uses `--with-deps`; **Storybook and every
Electron dev-server** use `--watch-deps`; everything else is the plain wrap.

## Guard changes (`scripts/with-turbo.mjs`)

Two flags are added; absence of a flag keeps today's behaviour.

- `--with-deps` — re-dispatch with `--filter=...<pkg>` instead of `--filter=<pkg>`.
  Used for non-Electron `dev`.
- `--watch-deps` — the orchestration in the "Server + dep watchers" row above.
  Used for `storybook` and **all** Electron dev-servers (`electron:dev` and the
  legacy apps' `dev`).

In all modes, when `TURBO_HASH` is already set (i.e. turbo is the caller, including
when the guard's own re-dispatch re-enters the script), the guard simply runs the
real command — this is what prevents infinite recursion and stops a dependency's
`dev` watcher (run under turbo) from re-orchestrating.

The background watcher process must be terminated when the foreground server
exits, and `turbo` is resolved from `<repo-root>/node_modules/.bin/turbo` with a
PATH fallback (as today).

### Prerequisite normalization

Four libraries define `dev` as `npm run build -- --watch`: `network-exporters`,
`network-query`, `shared-consts`, `protocol-validation`. All four have
`build: "vite build"`, so this is exactly `vite build --watch`. Normalize their
`dev` to `vite build --watch` directly. This (a) removes the guard's arg-dropping
hazard (the guard re-dispatches by task name, which would drop a `--watch` passed
through `npm run build -- --watch`) and (b) lets their `build` be wrapped without
breaking `dev`.

### Wrapped

- **`dev`** — `--with-deps` for the non-Electron servers: `architect-web`,
  `interviewer-v7` (web `dev`), and the libs `fresco-ui`, `interview`,
  `network-exporters`, `network-query`, `protocol-utilities`,
  `protocol-validation`, `shared-consts`.
- **Electron dev-servers** — `--watch-deps`: `interviewer-v7` `electron:dev`,
  legacy `architect-desktop` `dev`, legacy `interviewer` `dev`.
- **`storybook`** — `--watch-deps`: `fresco-ui`, `interview`, `art`.
- **`build`** — plain wrap for every package whose build consumes dist-built
  workspace deps: the seven libs above + `architect-web`. (`interviewer-v7`'s
  `build` and the legacy apps' `build` are already wrapped.)
- **`build-storybook`** — plain: `fresco-ui`, `interview`, `art` (already wrapped).
- **`electron:build`** — plain: `interviewer-v7` (already wrapped).

`art` is a source package (no `build`/`dev`) so it has no `dist` to stale; its
`storybook`/`build-storybook` get the standard wrap and its dep-watcher set is just
whatever dist-built packages it depends on (possibly empty — a harmless no-op).

### Intentionally not wrapped

- `documentation` — `dev`/`build` are compound (`writeSidebarJson && …`) which the
  guard cannot wrap cleanly, and its only `@codaco/*` dependency is `@codaco/art`
  (source, no `dist`), so it needs no dependency watcher or pre-build.
- Leaf tooling with no dist-built workspace deps (`tooling/tsconfig`,
  `tooling/tailwind`) — wrapping their `build` would be a no-op re-dispatch.
- `electron:dist*`, `capacitor:*` — unchanged (dist scripts already route their
  build through turbo; capacitor builds via the already-wrapped `build`).

## Invocation — both paths

- **Automatic** — the wrapped scripts mean `pnpm dev`, `pnpm --filter X dev`,
  `pnpm storybook`, `pnpm build-storybook`, `pnpm electron:dev` all bring up the
  right dependency tasks with no extra ceremony.
- **Documented** — root `CLAUDE.md` "Running tasks through turbo" gains the
  explicit commands and the bucket rationale:
  - dev for an app/lib + dep watchers: `turbo run dev --filter=...<pkg>`
  - everything's watchers: `pnpm dev` (root) = `turbo watch dev`
  - a non-`dev` server + dep watchers, by hand: `turbo run dev --filter=<pkg>^...`
    in one terminal, the server in another.

## Documentation

Extend the root `CLAUDE.md` "Running tasks through turbo" section (added earlier)
with the taxonomy and the commands above, so the pattern is discoverable and other
packages can adopt the correct wrap.

## Alternatives considered

- **Source resolution via `development` export condition** — bundlers resolve
  `@codaco/*` to `src` in dev. Rejected: requires curating large `exports` maps
  (fresco-ui has ~150 subpath entries), `transpilePackages` for Next.js, and
  Tailwind `@source` changes; per-package surface.
- **Dev-time source alias** (the pattern `interviewer-v7` already uses for
  fresco-ui via `command === 'serve'`). Gives true Fast Refresh and is lighter
  than export conditions, but still puts dependency source in each consumer's
  graph. Rejected in favour of the watcher approach, which needs no per-package or
  per-consumer source wiring; HMR quality is revisited in the deferred work.

## Open verification item (implementation)

Confirm whether interview's **running** Storybook visibly reflects a `fresco-ui`
source edit once fresco-ui's `dev` watcher rebuilds its `dist`. If Vite pre-bundles
the workspace dep rather than treating it as linked, add the minimal
`optimizeDeps.exclude` / `server.watch` config needed. The watcher orchestration is
wired regardless; propagation is not claimed until observed.

## Verification

- Dry-run the turbo plans for each bucket (`--dry`) to confirm the expected task
  set and no persistent-dependency errors.
- Smoke-test: start `pnpm --filter @codaco/interview storybook`, edit a
  `shared-consts`/`fresco-ui` source file, confirm the dependency `dist` rebuilds
  (and per the open item, whether Storybook reflects it).
- Confirm `pnpm build` (root) and `pnpm dev` (root) are unaffected — the guard is
  transparent to turbo when `TURBO_HASH` is set.
- Format/lint changed files; keep the diff isolated from the unrelated in-tree
  changes.
