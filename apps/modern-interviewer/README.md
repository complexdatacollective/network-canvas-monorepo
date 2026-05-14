# @codaco/modern-interviewer

A modern Network Canvas Interviewer app, built on React 19 + Vite + TypeScript.

One Vite codebase, three deployment targets:

- **Web** — runs in any modern browser.
- **Desktop** — Electron (`electron-vite` + `electron-builder`) for macOS, Windows, and Linux.
- **Tablet** — Capacitor for iPadOS and Android.

## What's in the box

- A **dashboard** that lists protocols and interviews, with stats and recents.
- A **protocol manager** that imports `.netcanvas` files (drag-and-drop or
  system file picker), validates and migrates them via
  `@codaco/protocol-validation`, and stores them locally with their assets.
- An **interview runner** that hosts `<Shell />` from `@codaco/interview`
  to drive a participant through an interview. Step state, the ego
  network, stage metadata, and finish time are all persisted to IndexedDB
  so a crashed or restarted session can be resumed.
- An **exporter** that drives `@codaco/network-exporters` against the
  local store and produces a CSV/GraphML ZIP archive. The archive is
  saved through the platform-appropriate mechanism (anchor download on
  web, native Save dialog on desktop, Capacitor Filesystem on tablet).
- A **settings page** with installation ID, storage counters, and a
  destructive "erase all local data" action.

Styling is the shared Fresco theme from `@codaco/tailwind-config`,
loaded through the Tailwind v4 `@tailwindcss/vite` plugin. UI primitives
(Button, Dialog, Spinner, …) come from `@codaco/fresco-ui`. Routing is
[`wouter`](https://github.com/molefrog/wouter). Local persistence is
[Dexie](https://dexie.org/) (IndexedDB).

## Quick start

```bash
# From the monorepo root
pnpm install

# Build the workspace packages this app depends on
pnpm --filter @codaco/fresco-ui --filter @codaco/interview \
     --filter @codaco/network-exporters --filter @codaco/network-query \
     --filter @codaco/protocol-validation --filter @codaco/shared-consts \
     --filter @codaco/tailwind-config build

# Start the web dev server
pnpm --filter @codaco/modern-interviewer dev
```

The dev server runs at <http://localhost:5180/>. The app stores
everything in IndexedDB, so a fresh browser profile starts empty.

## Scripts

All scripts are scoped to this app — prefix with
`pnpm --filter @codaco/modern-interviewer …` when running from the
monorepo root.

### Web

| Script        | What it does                                  |
| ------------- | --------------------------------------------- |
| `dev`         | Vite dev server with HMR.                     |
| `build`       | Production web build into `dist/`.            |
| `preview`     | Serve the production build for smoke-testing. |
| `typecheck`   | TypeScript only, no emit.                     |
| `test`        | Vitest in run mode.                           |
| `test:watch`  | Vitest in watch mode.                         |

### Desktop (Electron)

| Script                  | What it does                                                       |
| ----------------------- | ------------------------------------------------------------------ |
| `electron:dev`          | Boot main + preload + renderer with HMR (window opens locally).    |
| `electron:build`        | Produce `out/main`, `out/preload`, `out/renderer` bundles.         |
| `electron:dist`         | Package for the current host platform via `electron-builder`.      |
| `electron:dist:mac`     | DMG + zip targets for x64 and arm64.                               |
| `electron:dist:win`     | NSIS installer for x64.                                            |
| `electron:dist:linux`   | AppImage, deb, and rpm targets.                                    |

### Tablet (Capacitor)

The iOS and Android native projects live in `ios/` and `android/`, which
are git-ignored. Run the `add:*` scripts once on a fresh checkout to
scaffold them; everything else assumes they exist.

| Script                    | What it does                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `capacitor:add:ios`       | Scaffold `ios/App/…` (requires CocoaPods + Xcode on macOS).                           |
| `capacitor:add:android`   | Scaffold `android/…` (requires Android SDK / Android Studio).                         |
| `capacitor:sync`          | `build` + `cap sync` (copy assets + update plugins on both platforms).                |
| `capacitor:sync:ios`      | Same, scoped to iOS.                                                                  |
| `capacitor:sync:android`  | Same, scoped to Android.                                                              |
| `capacitor:dev:ios`       | `build` + `cap run ios --live-reload --external` (runs on simulator/device).          |
| `capacitor:dev:android`   | Same for Android.                                                                     |
| `capacitor:open:ios`      | Open the Xcode workspace.                                                             |
| `capacitor:open:android`  | Open the Android Studio project.                                                      |
| `capacitor:dist:ios`      | `build` + `cap sync ios` + `cap build ios` (produces release artifacts via xcodebuild).|
| `capacitor:dist:android`  | `build` + `cap sync android` + `cap build android` (produces APK / AAB via Gradle).   |

The `dev:*` scripts rely on `cap run --live-reload --external`, which
serves the running Vite dev server over LAN so the device can hot-reload
without needing a rebuild. Make sure the host and the device are on the
same network.

## Configuration files

| File                              | Purpose                                                |
| --------------------------------- | ------------------------------------------------------ |
| `vite.config.ts`                  | Shared Vite config (web + desktop renderer).            |
| `vitest.config.ts`                | Test config (merges `vite.config.ts`).                  |
| `electron.vite.config.ts`         | Three-process Electron config (main, preload, renderer).|
| `electron-builder.config.cjs`     | Packaging for `.dmg`, `.exe`, `.AppImage`, etc.         |
| `capacitor.config.ts`             | App ID, web dir, iOS / Android tweaks.                  |
| `tsconfig.json`                   | App TypeScript config (extends `@codaco/tsconfig/web`). |
| `tsconfig.node.json`              | Node-side configs (vite/electron-vite/capacitor).       |

See `SPECIFICATION.md` for the architectural deep-dive, and `CLAUDE.md`
for guidance on extending the app.

## License

This package is private to the `network-canvas-monorepo` workspace and
inherits its licensing.
