# Legacy Interviewer — restore iPad/Android support via Capacitor

**Date:** 2026-06-08
**Status:** Design — pending review
**Scope:** Spec 1 of 2 (the mobile capability). Spec 2 (CI builds + distribution) is a
separate design.

## Problem

The legacy Network Canvas Interviewer (`apps/interviewer`, `network-canvas-interviewer`)
historically shipped on iPadOS and Android using **Cordova**. During the move into this
monorepo the Cordova platform, `config.xml`, `www/`, and native projects were stripped;
only vestigial runtime **detection** (`isCordova()`, `window.cordova`, `cordova.file.*`,
`window.sqlitePlugin`, `window.device`) remains across ~25 renderer files, and those
branches are dead. Cordova itself is effectively unmaintained.

The broader legacy-apps effort is about extending these apps' usable lifespan. Restoring
the mobile capability on a maintained runtime — **Capacitor** — is part of that. The new
`apps/interviewer-v7` already runs on Capacitor and serves as a working reference.

**Goal:** functional parity with the old Cordova mobile build, with minimal churn to the
shared renderer, by replacing the dead Cordova adapter layer with Capacitor, adding a web
build, and committing native iOS/Android projects.

## Capability inventory (from the original `config.xml` + renderer audit)

The original `complexdatacollective/Interviewer` `config.xml` (v6.5.4) declared:
`cordova-plugin-device`, `-zeroconf`, `-inappbrowser`, `-network-information`, `-chooser`,
`cordova-sqlite-storage`; tablet-only; landscape; iOS scheme `app://localhost`
(`WKWebViewOnly`); Android `minSdk 24` / `targetSdk 35`, `largeHeap`, cleartext.

| Capability                                            | Old (Cordova)                                                                                  | New (Capacitor)                                                                                       | In scope        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------- |
| Data/cache paths                                      | `cordova.file.dataDirectory` / `cacheDirectory`                                                | `Directory.Data` / `Directory.Cache`                                                                  | ✅              |
| File read/write/mkdir/rename/rmdir/stream             | cordova-plugin-file (`resolveLocalFileSystemURL`, `FileWriter`/`FileReader`, `DirectoryEntry`) | **`@capacitor/filesystem`** (base64 for binary)                                                       | ✅              |
| redux-persist storage engine                          | `cordova-sqlite-storage` (`window.sqlitePlugin`)                                               | **IndexedDB via `localforage`**                                                                       | ✅              |
| Media asset URLs (iOS WKWebView can't load `file://`) | `WkWebView.convertFilePath` → `app://`                                                         | **`Capacitor.convertFileSrc()`**                                                                      | ✅              |
| Export session bundle off device                      | wrote to `dataDirectory` (share never wired)                                                   | write to `Directory.Cache` + **`@capacitor/share`** sheet                                             | ✅              |
| Import `.netcanvas`                                   | `cordova-plugin-chooser` + file-open                                                           | file picker (**`@capawesome/capacitor-file-picker`**) + **`@capacitor/app`** `appUrlOpen` (open-with) | ✅              |
| Device / version info                                 | `window.device`, app-version                                                                   | **`@capacitor/device`** + **`@capacitor/app`** `getInfo()`                                            | ✅              |
| External links                                        | `cordova-plugin-inappbrowser` / `window.open`                                                  | **`@capacitor/browser`**                                                                              | ✅              |
| `deviceready` gating                                  | `deviceready` event                                                                            | removed — `Capacitor.isNativePlatform()` (ready synchronously)                                        | ✅              |
| Server pairing / discovery                            | `cordova-plugin-zeroconf`, `-network-information`, Bonjour `_nc-server-6._tcp.`                | —                                                                                                     | ❌ out of scope |

**Out of scope:** Network Canvas Server pairing / zeroconf / mDNS / network-information.
Server is deprecated and the capability is already non-functional in the current renderer
(only leftover `Pairing.jsx` + pairing styles remain, with no discovery or API code). The
vestigial Pairing UI is left untouched, not revived. Also out: CI mobile builds, signing,
store/Play/MDM distribution, store asset pipelines, biometric unlock (→ Spec 2 / N/A).

## Decisions

1. **Persistence backend:** IndexedDB via `localforage` (redux-persist storage engine), not
   native SQLite. Webview-native, no native plugin, effectively unlimited, async. Modern
   equivalent of the old SQLite engine; the old engine used SQLite only to dodge mobile
   `localStorage` size limits, which IndexedDB also solves.
2. **Bundle identifiers — preserve published-app continuity (per-platform, they differ):**
   - **Android `applicationId`:** `org.codaco.NetworkCanvasInterviewer6`
   - **iOS `CFBundleIdentifier`:** `org.codaco.networkCanvasInterviewerBusiness`
   - Capacitor's single `appId` seeds `cap add`; the committed native projects then carry
     each platform's real id. `capacitor.config.ts` `appId` is set to the Android id; the
     iOS Xcode `PRODUCT_BUNDLE_IDENTIFIER` is set to the iOS id after `cap add ios`.
3. **Native projects committed**, mirroring `apps/interviewer-v7` (its `ios/` and `android/`
   are tracked, with Capacitor's own nested `.gitignore` excluding build artifacts).
4. **Single package.** Web build + Capacitor live in `apps/interviewer` alongside the
   existing electron targets, mirroring v7 (one package, multiple targets).
5. **Capacitor major:** match v7's `@capacitor` 8.x line (via catalog where the monorepo
   already catalogs them).
6. **Form factor:** tablet-primary, **landscape**, fullscreen — matching the old
   `target-device=tablet` / `Orientation=landscape` preferences.

## Design

### A. Renderer environment layer (the core change)

`src/utils/Environment.js` exposes `inEnvironment(tree)` switching on
`ELECTRON | CORDOVA | WEB`. Replace `CORDOVA` with `CAPACITOR` end to end:

- `Environment.js`: add `isCapacitor()` = `!!window.Capacitor?.isNativePlatform?.()`;
  redefine `isIOS`/`isAndroid` via `Capacitor.getPlatform()`; `getEnvironment()` →
  `CAPACITOR` when native, else `ELECTRON`, else `WEB`. `environments.js`: `CORDOVA` →
  `CAPACITOR`.
- For every adapter file, swap the `environments.CORDOVA` branch for a
  `environments.CAPACITOR` branch implemented with the plugin from the table above, keeping
  each exported function's **signature unchanged** so renderer call sites don't change:
  `filesystem.js`, `export/saveExport.js`, `storageAdapters.js`, `DeviceInfo.js`,
  `getVersion.js`, `protocol/getMediaAssetUrl.js`, `protocol/protocolPath.js`,
  `protocol/importProtocol.jsx`, `protocol/preloadWorkers.js`, `protocol/zipValidation.js`,
  `csvDecoder.worker.js`, `exportProcess.jsx`, `ducks/store.js`, `ducks/modules/reset.js`,
  `index.jsx`, `components/ExternalLink.jsx`,
  `components/SettingsMenu/Sections/VisualPreferences.jsx`,
  `containers/SessionManagementScreen/SessionManagementScreen.jsx`.

`@capacitor/filesystem` is path-and-`Directory`-based rather than URL-and-`DirectoryEntry`-
based, so `filesystem.js` is the largest rewrite: map the app's `cordova.file.*`-rooted URL
strings onto `{ path, directory: Directory.Data|Cache }`, base64-encode binary for
`writeFile`/decode for `readFile`, and collapse the chunked `FileWriter` stream path (the
current `@codaco/network-exporters` pipeline yields a `Blob`, so streaming chunk-writes are
no longer required on mobile — write the blob via one `Filesystem.writeFile`).

### B. Persistence

`storageAdapters.js`: replace `sqliteStorageEngine` (cordova-sqlite-storage) with a
`localforageStorageEngine` (redux-persist `getItem`/`setItem`/`removeItem` backed by
`localforage` → IndexedDB). `ducks/store.js` selects the engine by environment: `CAPACITOR`
→ localforage; `ELECTRON`/`WEB` → existing `localStorageEngine` (unchanged). Drop the
`deviceready` wait (`checkDeviceIsReady`) for Capacitor.

### C. Web build target

Capacitor loads a static web bundle from `webDir`. The interviewer has no web build today
(electron-vite only). Extract the shared renderer Vite config — root, `@`/`~` aliases, the
`react-resize-aware` shim, scss `loadPaths`, worker `format`, `optimizeDeps`
(csvtojson/`@codaco/ui`, exclude `@codaco/protocol-validation`) — into a module reused by
both `electron.vite.config.js` (`renderer`) and a new `vite.web.config.js` that builds to
`dist-web/`. In a plain browser the app degrades to the existing `WEB` behaviour; native
calls are gated by `Capacitor.isNativePlatform()`.

### D. Capacitor project

- `capacitor.config.ts` (modelled on v7): `appId: 'org.codaco.NetworkCanvasInterviewer6'`,
  `appName: 'Network Canvas Interviewer'`, `webDir: 'dist-web'`, `server.androidScheme:
'https'`, optional `server.url` from `CAP_DEV_SERVER_URL` (cleartext) for device
  live-reload, `ios.contentInset: 'always'`.
- Plugins (Capacitor 8.x): `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`,
  `@capacitor/filesystem`, `@capacitor/share`, `@capacitor/app`, `@capacitor/device`,
  `@capacitor/browser`. Dev dep: `@capacitor/cli`, `@capawesome/capacitor-file-picker`,
  `localforage`.
- `cap add ios` / `cap add android`; commit `ios/` and `android/`. Set the iOS Xcode
  `PRODUCT_BUNDLE_IDENTIFIER` to `org.codaco.networkCanvasInterviewerBusiness`. Configure
  landscape-only, fullscreen, tablet idiom; Android `minSdk 24`.
- `package.json` scripts mirroring v7: `build:web` (vite), `cap:sync`, `cap:run:ios`,
  `cap:run:android`, plus a `CAP_DEV_SERVER_URL`-based dev recipe (vite dev server on a
  dedicated port, e.g. 5181, distinct from v7's 5180 and the electron renderer's 3000).
- Turbo: `build:web` is a cacheable task feeding `cap:sync`.

### E. Testing

`src/utils/__mocks__/Environment.js` already mocks the environment switch — extend it with
`CAPACITOR` and `isCapacitor`/`isIOS`/`isAndroid`. Add vitest mocks for `@capacitor/...`
plugins (Filesystem/Share/App/Device) and write parity unit tests for the rewritten
adapters (`filesystem`, `saveExport`, `storageAdapters`, `getMediaAssetUrl`), mirroring the
existing `export/__tests__/saveExport.test.js` pattern. The renderer's existing vitest suite
continues to validate the shared (environment-agnostic) logic.

## Risks

- **`filesystem.js` URL→`Directory` mapping** is the highest-risk rewrite: the app threads
  `cordova.file.dataDirectory`-prefixed URL strings through many call sites. The adapter must
  faithfully translate those to `@capacitor/filesystem` `{ path, directory }` pairs. Mitigation:
  centralise path translation in `filesystem.js`, cover with parity unit tests, and verify a
  real protocol import → interview → export round-trip on device.
- **Asset URLs / CSP:** media must load over Capacitor's local scheme via `convertFileSrc`;
  the renderer's CSP (currently `asset:`/`app:`/`file://`/`localhost`) needs a Capacitor-scheme
  entry. Verify images/audio/video render in a stage on device.
- **No runtime verification in this environment:** mobile builds need a Mac/Xcode + Android
  SDK. The plan must call out on-device smoke tests as explicit manual steps.

## Prerequisites (not blockers for Spec 1 code)

- Apple Developer + Google Play accounts and signing identities are needed to _ship_ (Spec 2),
  not to build/run locally on a simulator/device.
