# Architect Web — Offline PWA & In-App Updates

**Date:** 2026-06-26
**Status:** Approved (design)
**App:** `apps/architect-web` (`@codaco/architect-web`)

## Summary

Make Architect Web installable and fully usable offline as a Progressive Web
App, and give users a controlled "a new version is available — reload" update
flow. The app is already offline on the _data_ side (protocols and assets live
in IndexedDB via Dexie; app state in `localStorage` via `redux-remember`; there
is no server sync), so this work is about caching the app shell and assets,
adding a web app manifest + icons, and wiring the service-worker update
lifecycle into a small in-app prompt.

## Goals

- The app loads and the full editor works with no network connection
  (including the live stage **Preview** window).
- The app is installable (manifest + icons, `display: standalone`).
- When a new version is deployed, a running session shows a non-intrusive
  prompt and updates only when the user chooses to reload.
- Updates reliably propagate (correct CDN cache-control headers).

## Non-goals

- Server-side sync or multi-device protocol sync (out of scope; app remains
  purely client-side).
- Self-hosting Google Fonts (noted as an alternative below; not chosen).
- Precaching the entire stage-thumbnail set at install time (noted below; not
  chosen).
- Push notifications / background sync.

## Decisions (from brainstorming)

| Decision         | Choice                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Update behaviour | **Prompt to reload** (`registerType: 'prompt'`)                                                                         |
| Offline scope    | **Full editor offline** (app shell precached + images/fonts runtime-cached)                                             |
| Icon source      | **Derive** from existing brand assets (`architect-icon.png` / `NC-Mark.svg`)                                            |
| Fonts            | **Runtime-cache** Google Fonts (not self-hosted)                                                                        |
| Thumbnails       | **Runtime-cache** on demand (relying on existing idle-preload), not precached                                           |
| Template install | **Offline** — bundled template + Sample assets warmed into the SW cache at idle; dev-only Development protocol excluded |

## Offline gated to installed-PWA sessions

Offline support (service-worker registration, precaching, runtime caching, the
template-asset warm, and the update prompt) is enabled **only when the app runs
as an installed PWA**. In a normal browser tab the app stays online-only with
plain HTTP caching and registers **no service worker**.

`isRunningAsInstalledPwa()` (`src/utils/pwa.ts`) detects this via the
`display-mode` media query (`standalone` / `window-controls-overlay`) plus iOS
Safari's `navigator.standalone`. It deliberately does **not** treat `fullscreen`
or `minimal-ui` as installed: `(display-mode: fullscreen)` also matches when a
normal tab enters Fullscreen-API fullscreen (e.g. fullscreening a `<video>`), so
including it would register the service worker in a plain tab. The result is
evaluated **once at startup** (`OFFLINE_ENABLED` in `ViewManager/views/App.tsx`),
not per render, so a transient display-mode change cannot flip it. It gates:

- **SW registration** — `PwaUpdateBanner` (which registers the worker via
  `useRegisterSW`) is mounted only when installed (`ViewManager/views/App.tsx`).
- **The template-asset warm** — skipped in a tab (`main.tsx`).

Notes / caveats:

- A service worker is **origin-scoped**, so once a user installs and the worker
  registers, it also controls that user's browser tabs (offline "leaks" into the
  tab for that user). This is unavoidable and accepted.
- Install does not require a service worker — modern Chrome (93+) offers the
  install prompt from a valid manifest alone — so gating the SW to installed
  sessions does not block installation.
- Stage-thumbnail idle-preloading still runs in tabs (it only warms the HTTP
  cache for speed; it is not service-worker-specific).

## Offline template installation

Bundled templates (the "Templates" tab) and the Sample protocol instantiate by
`fetch()`-ing their bundled asset files and writing the resulting Blobs into
IndexedDB (`src/templates/*`). For that to work offline on first use, those
asset files must already be in the service-worker cache. They are warmed at idle
after load by `warmBundledTemplateAssets` (`src/templates/warmBundledAssets.ts`),
which waits for the worker to **control** the page (`controllerchange`, enabled
by `clientsClaim`) before fetching, and a `CacheFirst` rule for same-origin
`/assets/*` stores them. The Development protocol is excluded — it is a dev-only
entry (`import.meta.env.DEV` in `LibraryPanel`) shipping a ~24 MB video. Once a
protocol is in the library its assets live in IndexedDB and are offline
regardless of the service worker.

## Approach

Use **`vite-plugin-pwa@^1.3.0`** with Workbox's **`generateSW`** strategy.
Confirmed compatible with the app's `vite@8.0.16` (peer range includes
`^8.0.0`). Icons via **`@vite-pwa/assets-generator@^1`**.

Rejected alternatives:

- **`injectManifest`** (hand-written SW): more control than needed; all required
  caching is expressible declaratively via `runtimeCaching`.
- **Fully hand-rolled service worker**: reinvents Workbox precache/versioning
  with no benefit.

## Current-state facts that shape the design

- **Bundler:** Vite 8.0.16, `@vitejs/plugin-react-swc`, `@tailwindcss/vite`.
  React 19.2.6. No existing SW / manifest / PWA tooling.
- **Two build entries:** `index.html` → `src/main.tsx` (the app) and
  `preview/index.html` → `src/preview-main.tsx` (the `PreviewHost`). The preview
  is opened as a **real top-level window** via `window.open('/preview/', …)`
  (trailing slash required — a bare `/preview` hits the SPA HTML fallback), not
  an iframe.
- **Routing:** Wouter SPA. `public/_redirects` already does `/* /index.html 200`.
- **Deployment:** Netlify (`apps/architect-web/dist`), served from root `/`. CI
  builds via Turbo; per-PR preview aliases + production on `main`.
- **Assets:** stage thumbnails come from `@codaco/interface-images` and are
  bundled by Vite into same-origin hashed files under `dist/assets`. They are
  already **idle-preloaded** (`requestIdleCallback`) on first load. Google Fonts
  (Inclusive Sans, Nunito) load via external `<link>` to `fonts.googleapis.com`
  / `fonts.gstatic.com`.
- **UI:** brand accent `--sea-green` (HSL `168 100% 35%`). The app has a Redux
  **modal** dialog system (`dialogs` slice + `DialogManager`) but **no**
  lightweight toast/banner primitive — the update prompt needs a new
  self-contained non-modal component.
- **Version:** `package.json` version `7.0.0-beta.1`; not currently surfaced at
  runtime.

## Detailed design

### 1. Build integration — `vite.config.ts`

Add the PWA plugin alongside the existing plugins:

```ts
VitePWA({
  registerType: 'prompt',
  strategies: 'generateSW',
  devOptions: { enabled: false },
  includeAssets: [
    /* favicon, apple-touch-icon, etc. */
  ],
  manifest: {
    /* see §2 */
  },
  workbox: {
    /* see §3 */
  },
});
```

- `devOptions.enabled = false`: no service worker in `vite dev` (avoids dev
  caching confusion).
- The plugin auto-discovers **both** HTML entries from the existing
  `build.rollupOptions.input` (`main`, `preview`) and precaches them.

Inject the app version for the update UI and any About/footer use:

```ts
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
```

with a matching `declare const __APP_VERSION__: string;` ambient type and
`virtual:pwa-register/react` added to the app's type references.

### 2. Manifest + icons

Generate icons with `@vite-pwa/assets-generator` from
`src/images/landing/architect-icon.png` (fallback `src/images/NC-Mark.svg` if a
higher-resolution square source is preferable):

- `192x192` and `512x512` (`purpose: any`)
- `512x512` (`purpose: maskable`)
- `apple-touch-icon` (180px) and a favicon

Manifest:

```jsonc
{
  "name": "Network Canvas Architect",
  "short_name": "Architect",
  "description": "Design Network Canvas interview protocols.",
  "display": "standalone",
  "start_url": "/",
  "scope": "/",
  "theme_color": "<brand>", // sea-green accent
  "background_color": "<app bg>", // app dark background for splash
  "icons": [
    /* generated set */
  ],
}
```

Add to `index.html`: `theme-color` meta and `apple-touch-icon` link. The
`manifest` link element is injected by the plugin. Exact `theme_color` /
`background_color` values are read from the app's resolved CSS at implementation
time so the splash screen matches the running app.

### 3. Caching strategy (Workbox `generateSW`)

**Precache (install-time):** the app shell — both HTML entries, all hashed
JS/CSS, the manifest, and icons. Large images are **excluded** from
`globPatterns` and handled by runtime caching instead, to keep install light.

**`navigateFallback`:** `'index.html'` with
`navigateFallbackDenylist: [/^\/preview\//]` so navigations to `/preview/`
resolve to the precached preview page rather than the SPA shell. (`directoryIndex`
maps `/preview/` → `preview/index.html` in precache.)

**Runtime caches (`runtimeCaching`):**

| Match                                            | Strategy               | Notes                                                                                                                                                          |
| ------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-origin images (`png/webp/jpg/jpeg/svg/gif`) | `CacheFirst`           | `ExpirationPlugin` ~300 entries / 30d. Covers stage thumbnails; combined with existing idle-preload → full timeline + Preview cached after one online session. |
| `fonts.googleapis.com` (CSS)                     | `StaleWhileRevalidate` | Font stylesheet.                                                                                                                                               |
| `fonts.gstatic.com` (font files)                 | `CacheFirst`           | Long expiration; `cacheableResponse: { statuses: [0, 200] }` for opaque responses.                                                                             |

`cleanupOutdatedCaches: true` so superseded precache entries are removed on
activation.

### 4. Update flow — "prompt to reload"

New self-contained component `PwaUpdateBanner` (Tailwind-styled, non-modal),
mounted at the **main** app root only (not in `preview-main.tsx`). Uses
`useRegisterSW()` from `virtual:pwa-register/react`:

- `needRefresh === true` → render a small fixed banner:
  _"A new version of Architect is available. Your work is saved — Reload to
  update."_ with a **Reload** button calling `updateServiceWorker(true)`
  (triggers `skipWaiting` + full reload) and a dismiss affordance.
- `offlineReady === true` → a subtle, auto-dismissing _"Ready to work offline"_
  confirmation.
- `onRegisteredSW(swUrl, registration)` → `setInterval(() => registration.update(),
60 * 60 * 1000)` so long editing sessions are notified of new deploys without a
  manual reload.

Reloading is safe because autosave continuously persists to IndexedDB; the
banner copy reflects that.

### 5. Deployment — Netlify cache headers

Add `public/_headers` so updates propagate reliably:

- `sw.js`, `registerSW.js`, `index.html` → `Cache-Control: no-cache` (must
  revalidate) so a new service worker / shell is always discovered.
- Hashed `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`.

`public/_redirects` is unchanged (the SPA fallback still applies). Per-PR
Netlify preview aliases are separate origins, so their service workers are
isolated from production — no cross-contamination.

### 6. Version surfacing

`__APP_VERSION__` (from `package.json`) is shown in the update banner and is
available for an About/footer line. No other UI change required.

## Components / units

| Unit                               | Responsibility                                      | Depends on                                      |
| ---------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `vite.config.ts` PWA block         | Configure plugin, manifest, workbox, version define | `vite-plugin-pwa`, `@vite-pwa/assets-generator` |
| `pwa-assets.config.ts` (or inline) | Icon generation source + presets                    | `@vite-pwa/assets-generator`                    |
| `PwaUpdateBanner` component        | Render update / offline-ready prompts               | `virtual:pwa-register/react`                    |
| `index.html` head additions        | theme-color meta, apple-touch-icon                  | generated icons                                 |
| `public/_headers`                  | CDN cache-control for SW/shell/assets               | Netlify                                         |

## Testing

- **Unit (Vitest + React Testing Library):** `PwaUpdateBanner` with a mocked
  `useRegisterSW` — asserts (a) nothing renders when no update, (b) banner
  appears on `needRefresh` and the Reload button calls `updateServiceWorker`,
  (c) offline-ready state renders its confirmation.
- **Build assertion:** a test confirming the production build emits `sw.js`,
  `manifest.webmanifest`, and the generated icons.
- Service-worker registration, offline load, and install behaviour are verified
  in CI / manually (repo convention: e2e/Playwright is not run locally).

## Alternatives considered (not chosen)

- **Self-host Google Fonts** — stronger offline guarantee (fonts present even on
  a first offline visit) and avoids a third-party request, but a larger change
  to `index.html` and asset pipeline. Runtime-caching chosen per the offline-scope
  decision; can be revisited.
- **Precache all stage thumbnails** — guarantees offline on the very first visit
  but bloats the install by tens of MB. Runtime-cache + existing idle-preload
  chosen instead.
- **Reuse the modal dialog system for the update prompt** — too intrusive for a
  passive "new version available" signal; a dedicated non-modal banner is better
  UX and an isolated unit.

## Risks / notes

- **Stale shell on Netlify:** mitigated by the `_headers` `no-cache` rules for
  `index.html`/`sw.js`. Without them, updates would silently fail to appear.
- **First-visit offline gaps:** by design, thumbnails/fonts are cached after the
  first online session (acceptable per the chosen runtime-cache approach).
- **Storage eviction:** when installed, `requestPersistentStorage()`
  (`src/utils/pwa.ts`, called from `main.tsx`) requests persistent storage so the
  browser is less likely to evict the offline caches and the IndexedDB protocol
  library under pressure (notably relevant on iOS). Best-effort and a no-op where
  the Storage API is absent; failures to fetch a bundled asset still surface a
  visible error dialog rather than corrupting state.
- **Non-hashed icons:** the generated PWA icons (`pwa-*.png`,
  `apple-touch-icon-*.png`, `maskable-icon-512x512.png`, `favicon.ico`) keep
  stable names, so `public/_headers` marks them `max-age=0, must-revalidate` to
  avoid serving a stale icon after a renamed-in-place change; only the
  content-hashed `/assets/*` are `immutable`.
- **Changeset:** not required for this change (per maintainer).
