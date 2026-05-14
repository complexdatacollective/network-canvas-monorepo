# CLAUDE.md — `@codaco/modern-interviewer`

Guidance for Claude Code (and humans) working inside this app.

The repo-wide `CLAUDE.md` at the monorepo root documents toolchain
conventions (Biome, pnpm catalog, no `any`, no barrel files). **Read it
first.** This file adds app-specific guidance that doesn't apply to the
rest of the workspace.

## What this app is

Modern, ground-up reimplementation of the legacy Network Canvas
Interviewer (`apps/interviewer`). One Vite codebase ships to:

- **Web** (browser).
- **Desktop** (Electron, `electron-vite` + `electron-builder`).
- **Tablet** (Capacitor → iPadOS / Android).

It is **not** a port of the legacy app's React 16 code — the interview
engine itself lives in `@codaco/interview` and is consumed here as a
black-box `<Shell />` component.

## Architecture map

```
src/
├── main.tsx                 # ReactDOM root. Imports global CSS.
├── App.tsx                  # Provider stack + wouter router.
├── env.ts                   # Runtime platform detection.
├── styles/tailwind.css      # Tailwind v4 entry; imports fresco theme.
├── lib/
│   ├── db.ts                # Dexie database (protocols, assets, interviews).
│   ├── format.ts            # Date / size / truncate helpers.
│   └── installation-id.ts   # Persistent installation ID (LocalStorage).
├── platform/
│   ├── index.ts             # `platform: Platform` resolved at module load.
│   ├── web.ts               # HTML file input + anchor download.
│   ├── desktop.ts           # Delegates to window.modernInterviewerNative.
│   └── tablet.ts            # Capacitor Filesystem.
├── protocols/
│   ├── import-protocol.ts   # extractProtocol → migrate → validate → hash → persist.
│   └── asset-resolution.ts  # AssetRecord → ResolvedAsset; AssetUrlCache (object URLs).
├── interviews/
│   ├── create-interview.ts  # Build initial network, write Dexie record.
│   ├── load-interview.ts    # Hydrate InterviewPayload from Dexie.
│   ├── sync-interview.ts    # SyncHandler implementation.
│   └── finish-interview.ts  # FinishHandler implementation.
├── exports/
│   ├── repositories.ts      # Effect Layers wrapping Dexie for the exporter.
│   ├── browser-zip.ts       # ZipOutput sink that produces a Blob/Uint8Array.
│   └── run-export.ts        # Top-level driver; wires layers + progress queue.
├── components/              # Dashboard chrome (AppShell, PageHeader, dialogs).
└── pages/                   # One file per route.

electron/                    # Electron main + preload (ESM, contextBridge).
capacitor.config.ts          # Capacitor app config (webDir = "dist").
ios/                         # git-ignored; created by `cap add ios`.
android/                     # git-ignored; created by `cap add android`.
```

## Dependencies you should know

| Package                          | Role                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| `@codaco/interview`              | `<Shell />` component + InterviewPayload types + `generateNetwork`. |
| `@codaco/protocol-validation`    | `extractProtocol`, `migrateProtocol`, `validateProtocol`, `hashProtocol`. |
| `@codaco/network-exporters`      | `exportPipeline` + repository / output service tags (Effect-TS).    |
| `@codaco/fresco-ui`              | Button, Dialog, DialogProvider, Spinner, …                          |
| `@codaco/tailwind-config`        | Fresco theme + Tailwind v4 plugins; imported via `fresco.css`.      |
| `@codaco/network-query`          | Transitive runtime dep of `@codaco/interview`.                      |
| `@codaco/shared-consts`          | `NcNetwork`, `NcNode`, property keys.                               |
| `dexie`                          | IndexedDB wrapper. One DB, three tables.                            |
| `effect`                         | Used by `network-exporters`; bring our own Layers in `exports/`.    |
| `wouter`                         | Routing (`<Switch>` / `<Route>` / `<Link>`).                        |
| `uuid`                           | Used to generate stable IDs.                                        |

Workspace packages must be **built** before the app's `typecheck` /
`build` will resolve them:

```bash
pnpm --filter @codaco/fresco-ui --filter @codaco/interview \
     --filter @codaco/network-exporters --filter @codaco/network-query \
     --filter @codaco/protocol-validation --filter @codaco/shared-consts \
     --filter @codaco/tailwind-config build
```

## How the three deployment targets interact

A single `dist/` (the regular Vite build) feeds all three targets:

- **Web**: served directly from `dist/` (or `pnpm preview`).
- **Desktop**: Electron's main process loads `dist/index.html` via
  `file://` in production; in dev `ELECTRON_RENDERER_URL` points at
  `electron-vite`'s dev server. The renderer has access to a tiny
  contextBridge-exposed API at `window.modernInterviewerNative`.
- **Tablet**: Capacitor copies `dist/` into the iOS/Android native
  containers on each `cap sync`. Inside the WebView the
  `Capacitor.isNativePlatform()` check returns `true`.

`src/platform/index.ts` picks a `Platform` implementation at module load
time using feature detection (not build-time flags), so the same bundle
runs everywhere without conditional builds. **Do not add build-time
target flags.** If you need new capabilities, add a method to the
`Platform` interface and implement it three times.

## Local persistence (Dexie)

A single database `modern-interviewer` with three object stores defined
in `src/lib/db.ts`:

- `protocols(id, hash, importedAt, lastUsedAt)`
- `assets(assetId, protocolId, type)`
- `interviews(id, protocolId, protocolHash, startTime, lastUpdated, finishTime, exportTime)`

The interview engine writes every reducer commit via `onSync`, so the
on-disk record always reflects the latest network. Importing the same
`.netcanvas` twice is idempotent — duplicates are detected by
`hashProtocol`.

When wiping the database (Settings → "Erase all local data"), wrap
deletes in `db.transaction("rw", …)` so partial states are impossible.

## Conventions

- **No `any`**, **no barrel files**, **tabs for indentation**, **double
  quotes**, **120-char line width** — same as the rest of the monorepo.
  Run `pnpm exec biome check apps/modern-interviewer` before committing.
- **Path alias**: `~/foo` resolves to `src/foo`. Prefer relative imports
  inside the app (the alias exists for symmetry with `architect-web`).
- **Comments**: explain _why_, not _what_. Hidden invariants (e.g. "the
  preload script must be `.mjs` because the package is ESM and sandbox
  is therefore false") earn a comment; render-loop boilerplate does not.
- **Public types**: types exported from `src/exports/`, `src/protocols/`,
  `src/interviews/`, and `src/lib/db.ts` that are part of the module's
  API surface but consumed inline by callers carry a `/** @public */`
  JSDoc tag so `knip` doesn't flag them. Drop the tag if the type
  becomes truly unused.
- **Routing**: use `<Link href="…">…</Link>` directly — wouter renders
  the `<a>` for you. Do **not** nest a manual `<a>` inside `<Link>`;
  Biome's `useValidAnchor` will reject the `<a>` without an explicit
  href (and the nested anchor was deprecated in wouter v3 anyway).

## Common tasks

### "Add a new dashboard page"

1. Add a route in `src/App.tsx` (inside the second `<Switch>` so it
   inherits the `AppShell` chrome).
2. Add a nav entry in `src/components/AppShell.tsx` (the `navItems`
   array; pick a `lucide-react` icon).
3. Create `src/pages/MyPage.tsx`. Use the existing `PageHeader` and
   `EmptyState` components for visual parity.

### "Persist a new field on an interview"

1. Extend `InterviewRecord` in `src/lib/db.ts`.
2. Bump the Dexie `version()` number and provide a `.upgrade(tx => …)`
   if existing records need backfilling.
3. Update `src/interviews/sync-interview.ts` and
   `src/interviews/load-interview.ts` so the field round-trips between
   the engine's `SessionPayload` and the persisted record.

### "Add a new export option"

1. The shared `network-exporters` package owns the option schema —
   extend it there if the option is broadly useful.
2. Surface the toggle on `src/pages/ExportPage.tsx`.
3. Pass it through `runExport` in `src/exports/run-export.ts` to
   `exportOptions.globalOptions` (or a new top-level field).

### "Add a new native (Electron) capability"

1. Add an IPC handler in `electron/main.ts` (use `ipcMain.handle`).
2. Expose it in `electron/preload.ts` via the `api` object — keep the
   surface minimal; never expose raw `ipcRenderer`.
3. Mirror the type in `vite-env.d.ts`'s `ModernInterviewerNative`.
4. Add a default + fallback implementation to `src/platform/desktop.ts`.
5. If the same capability makes sense on web and/or tablet, implement
   it there too so the call sites can stay platform-agnostic.

## Quality gates

Before you commit, run (from this directory or with `--filter` from the
root):

```bash
pnpm typecheck     # tsc with --noEmit on src and tooling configs.
pnpm test          # vitest, jsdom environment.
pnpm exec biome check .   # lint + format.
pnpm build         # vite production build.
```

The Electron pipeline can be smoke-tested with `pnpm electron:build`
(headless — it doesn't try to launch a window). The Capacitor pipeline
likewise has `pnpm capacitor:sync` which copies the freshly-built
`dist/` into the native projects.

## Known limitations / future work

- **Bundle size.** The renderer bundle is around 9 MB unsplit; the
  interview engine drags in d3, base-ui, mapbox stubs, etc. Code-split
  the runner route lazily once we hit a real perf bottleneck.
- **No cloud sync.** Interviews live in IndexedDB on a single device.
  Exporting to ZIP is the canonical way to move data off-device.
- **No translations.** English-only. Add an i18n layer (e.g. lingui)
  when we have a second locale to ship.
- **Auto-update.** Electron's `electron-updater` isn't wired up yet;
  desktop users install new versions manually.
- **iPadOS / Android packaging.** `cap build` requires a macOS host
  with Xcode (iOS) or the Android SDK (Android). Neither is configured
  in CI — packaging happens on a developer machine.
