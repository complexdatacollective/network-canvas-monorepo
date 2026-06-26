# Architect Web — Offline PWA & In-App Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@codaco/architect-web` an installable, fully-offline PWA with a user-controlled "new version available — reload" update flow.

**Architecture:** Add `vite-plugin-pwa` (Workbox `generateSW`) in `prompt` mode. Precache the app shell (both `index.html` and `preview/index.html` entries + JS/CSS); runtime-cache same-origin images (stage thumbnails) and Google Fonts. Generate install icons from the existing 2048² brand PNG via `@vite-pwa/assets-generator`. A small non-modal `PwaUpdateBanner` component drives the update/offline-ready prompts and an hourly background update check. Netlify `_headers` keep the shell + service worker uncached so updates propagate.

**Tech Stack:** Vite 8.0.16, React 19.2.6, `vite-plugin-pwa@^1.3.0`, `@vite-pwa/assets-generator@^1.0.2`, Workbox 7, Vitest + React Testing Library, Tailwind v4, Netlify.

## Global Constraints

- **No `any` types** — explicitly forbidden across the repo.
- **No `as` type assertions** — resolve the underlying type instead.
- **No barrel files** (no `index.ts` re-export hubs).
- **Only export what other modules import** — run `pnpm knip` before finishing; unused exports fail the CI quality gate.
- **Compose classNames with `cx` from `~/utils/cva`** (the established convention; e.g. `src/components/Badge.tsx`).
- **Format every modified file** — a pre-commit hook runs `oxfmt`/`oxlint` on staged files; do not run the formatter manually per file.
- **No changeset** required for this change (per maintainer).
- **App is served from root `/`** on Netlify; SPA fallback is `public/_redirects` (`/* /index.html 200`).
- **Manifest brand values:** `theme_color: '#00b38f'` (sea-green accent), `background_color: '#edf2f8'` (platinum, the app's light background — `--color-background: hsl(var(--platinum))`).

---

## File structure

| File                                                                   | Responsibility                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/architect-web/package.json`                                      | Add `vite-plugin-pwa` + `@vite-pwa/assets-generator` devDeps |
| `apps/architect-web/vite.config.ts`                                    | Register `VitePWA(...)`; inject `__APP_VERSION__`            |
| `apps/architect-web/pwa-assets.config.ts`                              | Icon-generation preset + source image                        |
| `apps/architect-web/public/architect-icon.png`                         | 2048² source image for icon generation                       |
| `apps/architect-web/index.html`                                        | Add `theme-color` meta                                       |
| `apps/architect-web/src/vite-env.d.ts`                                 | Types for `virtual:pwa-register/react` + `__APP_VERSION__`   |
| `apps/architect-web/src/components/PwaUpdateBanner.tsx`                | Update / offline-ready prompt + hourly update check          |
| `apps/architect-web/src/components/__tests__/PwaUpdateBanner.test.tsx` | Unit tests (mocked `useRegisterSW`)                          |
| `apps/architect-web/src/components/ViewManager/views/App.tsx`          | Mount `<PwaUpdateBanner />` (main app only)                  |
| `apps/architect-web/public/_headers`                                   | Netlify cache-control for SW / shell / assets                |

---

## Task 1: PWA build integration (plugin, manifest, caching, icons)

**Files:**

- Modify: `apps/architect-web/package.json` (devDependencies)
- Modify: `apps/architect-web/vite.config.ts`
- Create: `apps/architect-web/pwa-assets.config.ts`
- Create: `apps/architect-web/public/architect-icon.png` (copy of existing source)
- Modify: `apps/architect-web/index.html` (head meta)
- Modify: `apps/architect-web/src/vite-env.d.ts`

**Interfaces:**

- Produces: a production build that emits `dist/sw.js`, `dist/manifest.webmanifest`, and generated icons (`dist/pwa-192x192.png`, `dist/pwa-512x512.png`, `dist/maskable-icon-512x512.png`, `dist/apple-touch-icon-180x180.png`, `dist/favicon.ico`). Provides the `virtual:pwa-register/react` virtual module (consumed by Task 2) and the `__APP_VERSION__` global (consumed by Task 2).

- [ ] **Step 1: Add dependencies**

Run from the repo root:

```bash
pnpm --filter @codaco/architect-web add -D vite-plugin-pwa@^1.3.0 @vite-pwa/assets-generator@^1.0.2
```

Expected: both appear under `devDependencies` in `apps/architect-web/package.json`; lockfile updates.

- [ ] **Step 2: Copy the icon source into `public/`**

```bash
cp apps/architect-web/src/images/landing/architect-icon.png apps/architect-web/public/architect-icon.png
```

Expected: `apps/architect-web/public/architect-icon.png` exists (2048×2048).

- [ ] **Step 3: Create the icon-generation config**

Create `apps/architect-web/pwa-assets.config.ts`:

```ts
import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/architect-icon.png'],
});
```

- [ ] **Step 4: Register the PWA plugin in `vite.config.ts`**

Replace the full contents of `apps/architect-web/vite.config.ts` with:

```ts
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

import { version } from './package.json';

const rootDir = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    react({}),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'generateSW',
      devOptions: { enabled: false },
      pwaAssets: { config: true },
      manifest: {
        name: 'Network Canvas Architect',
        short_name: 'Architect',
        description: 'Design Network Canvas interview protocols.',
        theme_color: '#00b38f',
        background_color: '#edf2f8',
        display: 'standalone',
        start_url: '/',
        scope: '/',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/preview\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'architect-images',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
        silenceDeprecations: [
          'mixed-decls',
          'import',
          'color-functions',
          'global-builtin',
        ],
        verbose: false,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        preview: resolve(rootDir, 'preview/index.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
```

Note: `import { version } from './package.json'` requires `resolveJsonModule` (inherited from `@codaco/tsconfig`). If `tsc` complains it is unresolved, the JSON import is still valid at runtime (esbuild loads `vite.config.ts`); confirm during the typecheck step.

- [ ] **Step 5: Add ambient types**

Replace the full contents of `apps/architect-web/src/vite-env.d.ts` with:

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;
```

- [ ] **Step 6: Add the `theme-color` meta to `index.html`**

In `apps/architect-web/index.html`, add this line immediately after the `<meta name="viewport" ... />` line (line 5):

```html
<meta name="theme-color" content="#00b38f" />
```

(The web-app-manifest `<link>`, favicon, and apple-touch-icon links are injected automatically by `vite-plugin-pwa` via `pwaAssets`.)

- [ ] **Step 7: Build and verify the PWA artifacts**

Run from the repo root:

```bash
pnpm --filter @codaco/architect-web build
ls apps/architect-web/dist/sw.js apps/architect-web/dist/manifest.webmanifest \
   apps/architect-web/dist/pwa-192x192.png apps/architect-web/dist/pwa-512x512.png \
   apps/architect-web/dist/maskable-icon-512x512.png apps/architect-web/dist/apple-touch-icon-180x180.png
```

Expected: build succeeds; all listed files exist. Then confirm the precache covers both entries and the manifest is well-formed:

```bash
grep -c "preview/index.html" apps/architect-web/dist/sw.js
node -e "const m=require('./apps/architect-web/dist/manifest.webmanifest'); console.log(m.name, m.display, m.start_url, m.icons.length)"
```

Expected: the `grep` prints `1` (preview entry is precached); the node line prints `Network Canvas Architect standalone / ` followed by an icon count ≥ 2.

- [ ] **Step 8: Commit**

```bash
git add apps/architect-web/package.json apps/architect-web/pnpm-lock.yaml pnpm-lock.yaml \
        apps/architect-web/vite.config.ts apps/architect-web/pwa-assets.config.ts \
        apps/architect-web/public/architect-icon.png apps/architect-web/index.html \
        apps/architect-web/src/vite-env.d.ts
git commit -m "feat(architect-web): add PWA build integration (service worker, manifest, icons)"
```

(`pnpm-lock.yaml` lives at the repo root; `git add` ignores the non-existent app-level path silently — keep both for safety.)

---

## Task 2: Update banner component + mount

**Files:**

- Create: `apps/architect-web/src/components/PwaUpdateBanner.tsx`
- Test: `apps/architect-web/src/components/__tests__/PwaUpdateBanner.test.tsx`
- Modify: `apps/architect-web/src/components/ViewManager/views/App.tsx`

**Interfaces:**

- Consumes: `virtual:pwa-register/react` (`useRegisterSW`) and `__APP_VERSION__` from Task 1; `cx` from `~/utils/cva`.
- Produces: default-exported `PwaUpdateBanner` React component, mounted once in `AppContents`.

- [ ] **Step 1: Write the failing tests**

Create `apps/architect-web/src/components/__tests__/PwaUpdateBanner.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockUseRegisterSW } = vi.hoisted(() => ({
  mockUseRegisterSW: vi.fn(),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: mockUseRegisterSW,
}));

import PwaUpdateBanner from '../PwaUpdateBanner';

const setSwState = ({
  offlineReady = false,
  needRefresh = false,
  updateServiceWorker = vi.fn(),
}: {
  offlineReady?: boolean;
  needRefresh?: boolean;
  updateServiceWorker?: ReturnType<typeof vi.fn>;
}) => {
  mockUseRegisterSW.mockReturnValue({
    offlineReady: [offlineReady, vi.fn()],
    needRefresh: [needRefresh, vi.fn()],
    updateServiceWorker,
  });
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('PwaUpdateBanner', () => {
  it('renders nothing when there is no update and the app is not offline-ready', () => {
    setSwState({});
    const { container } = render(<PwaUpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the update prompt and triggers a reloading update on click', () => {
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: true, updateServiceWorker });
    render(<PwaUpdateBanner />);

    expect(
      screen.getByText(/new version of Architect is available/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('shows the offline-ready confirmation', () => {
    setSwState({ offlineReady: true });
    render(<PwaUpdateBanner />);
    expect(screen.getByText(/ready to work offline/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @codaco/architect-web exec vitest run src/components/__tests__/PwaUpdateBanner.test.tsx
```

Expected: FAIL — `Failed to resolve import "../PwaUpdateBanner"` (the component does not exist yet).

- [ ] **Step 3: Implement the component**

Create `apps/architect-web/src/components/PwaUpdateBanner.tsx`:

```tsx
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { cx } from '~/utils/cva';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const OFFLINE_READY_TIMEOUT_MS = 6000;

const PwaUpdateBanner = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, registration) => {
      if (!registration) return;
      window.setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(
      () => setOfflineReady(false),
      OFFLINE_READY_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4',
        'bg-rich-black text-platinum rounded-full border border-white/10 px-5 py-3 shadow-lg',
      )}
    >
      {needRefresh ? (
        <>
          <span>
            A new version of Architect is available. Your work is saved.
          </span>
          <button
            type="button"
            className={cx(
              'bg-sea-green rounded-full px-4 py-1 font-semibold text-white',
            )}
            onClick={() => void updateServiceWorker(true)}
          >
            Reload
          </button>
          <button type="button" aria-label="Dismiss" onClick={dismiss}>
            ✕
          </button>
        </>
      ) : (
        <span>{`Architect v${__APP_VERSION__} is ready to work offline.`}</span>
      )}
    </div>
  );
};

export default PwaUpdateBanner;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @codaco/architect-web exec vitest run src/components/__tests__/PwaUpdateBanner.test.tsx
```

Expected: PASS (3 tests).

If instead the run fails with `Cannot find module 'virtual:pwa-register/react'` (vitest could not resolve the virtual id through the plugin pipeline), add a test alias to `vite.config.ts` `test` block — create `apps/architect-web/src/test/pwaRegisterMock.ts` exporting `export const useRegisterSW = () => {};` and add `alias: { 'virtual:pwa-register/react': resolve(rootDir, 'src/test/pwaRegisterMock.ts') }` under `test`, then add that file to the knip ignore list. Only do this if the `vi.mock` approach fails.

- [ ] **Step 5: Mount the banner in the main app**

In `apps/architect-web/src/components/ViewManager/views/App.tsx`, add the import alongside the other component imports (keep alphabetical grouping):

```tsx
import PwaUpdateBanner from '~/components/PwaUpdateBanner';
```

And render it inside the `AppContents` fragment, after `<DialogManager />`:

```tsx
return (
  <>
    <BackgroundLights intensity={lightsIntensity} />
    <ScrollToTop />
    <Routes />
    <DialogManager />
    <PwaUpdateBanner />
    <JsonPreviewOverlay />
  </>
);
```

(Only the main entry renders `AppView`; `src/preview-main.tsx` renders `PreviewHost` directly, so the banner never appears in the `/preview/` window.)

- [ ] **Step 6: Run the tests again to confirm nothing broke**

```bash
pnpm --filter @codaco/architect-web exec vitest run src/components/__tests__/PwaUpdateBanner.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/architect-web/src/components/PwaUpdateBanner.tsx \
        apps/architect-web/src/components/__tests__/PwaUpdateBanner.test.tsx \
        apps/architect-web/src/components/ViewManager/views/App.tsx
git commit -m "feat(architect-web): add in-app update prompt and offline-ready banner"
```

---

## Task 3: Netlify cache headers

**Files:**

- Create: `apps/architect-web/public/_headers`

**Interfaces:**

- Produces: a Netlify `_headers` file copied verbatim into `dist/` at build, keeping the service worker and HTML shell revalidated so updates propagate while hashed assets stay immutable.

- [ ] **Step 1: Create the headers file**

Create `apps/architect-web/public/_headers`:

```
/sw.js
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
/preview/index.html
  Cache-Control: public, max-age=0, must-revalidate
/manifest.webmanifest
  Cache-Control: public, max-age=0, must-revalidate
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

- [ ] **Step 2: Verify it is emitted to the build output**

```bash
pnpm --filter @codaco/architect-web build
cat apps/architect-web/dist/_headers
```

Expected: the build succeeds and `dist/_headers` contains the rules above (Vite copies `public/` verbatim).

- [ ] **Step 3: Commit**

```bash
git add apps/architect-web/public/_headers
git commit -m "chore(architect-web): set Netlify cache headers for service worker and shell"
```

---

## Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the app**

```bash
pnpm --filter @codaco/architect-web typecheck
```

Expected: no errors. (Confirms `__APP_VERSION__`, the `virtual:pwa-register/react` types, and the JSON `version` import all resolve.)

- [ ] **Step 2: Lint with auto-fix**

```bash
pnpm lint:fix
```

Expected: no remaining errors.

- [ ] **Step 3: Knip (unused exports/deps)**

```bash
pnpm knip
```

Expected: no new unused-export/dependency findings for `architect-web`. `vite-plugin-pwa` and `@vite-pwa/assets-generator` are referenced from `vite.config.ts` / `pwa-assets.config.ts`, so they must not be flagged; if knip cannot see the `pwa-assets.config.ts` usage, add it to the architect-web entry globs in the knip config rather than ignoring the dependency.

- [ ] **Step 4: Run the app's test suite**

```bash
pnpm --filter @codaco/architect-web test
```

Expected: all tests pass, including `PwaUpdateBanner`.

- [ ] **Step 5: Production build**

```bash
pnpm --filter @codaco/architect-web build
```

Expected: build succeeds; `dist/sw.js`, `dist/manifest.webmanifest`, `dist/_headers`, and the generated icons are present.

- [ ] **Step 6: Manual offline / install smoke test (local)**

```bash
pnpm --filter @codaco/architect-web preview
```

Then in a browser (service workers require `localhost` or HTTPS):

1. Load the app; open DevTools → Application → Service Workers and confirm the worker is **activated**.
2. Application → Manifest: confirm name "Network Canvas Architect", icons, and install availability.
3. Toggle DevTools "Offline", reload — the editor (and the `/preview/` window) still load.

(Service-worker registration, install, and the update prompt are exercised manually / in CI — e2e is not run locally per repo convention.)

---

## Self-review

- **Spec coverage:** §1 build integration → Task 1; §2 manifest+icons → Task 1 (steps 2–7); §3 caching strategy → Task 1 (step 4 `workbox`); §4 update flow → Task 2; §5 Netlify headers → Task 3; §6 version surfacing (`__APP_VERSION__`) → Task 1 (define) + Task 2 (offline-ready copy); §7 testing → Task 2 (unit) + Task 4 (build/manual). All spec sections mapped.
- **Placeholder scan:** every code/command step contains literal content; no TBD/TODO. The only conditional ("if vitest cannot resolve…") gives the full fallback recipe.
- **Type consistency:** the component destructures `offlineReady`/`needRefresh`/`updateServiceWorker` exactly as the test's mock provides them; `__APP_VERSION__` is declared in `vite-env.d.ts` and defined in `vite.config.ts`; icon filenames in Task 1 step 7 match `minimal2023Preset` outputs.
