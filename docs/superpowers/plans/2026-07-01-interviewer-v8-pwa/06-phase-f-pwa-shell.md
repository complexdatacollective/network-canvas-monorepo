## Phase F: PWA shell + updates (Workstream C)

Phase F converts the web build into an installable, offline-first PWA that mirrors `apps/architect-web`, adapted for a client interview app. It assumes **Workstream A (native teardown) has already run**: `apps/interviewer-v8/vite.config.ts` is a plain web-only Vite config, `src/lib/platform/platform.ts` no longer exports `isElectron`/`isCapacitor`, `window.electronAPI` and its ambient types are gone from `src/global.d.ts`, and the SW-driven update replaces the deleted `src/lib/update/*` + `StatusRow` update affordance. Every task obeys the global constraints in the shared contract file: no `any`, no `as` bypass assertions, no barrel files, no convenience re-exports; oxlint + oxfmt (2-space, single quotes); Vitest co-located in `__tests__/`; no changeset; TDD with a commit per task and no `Co-Authored-By` trailer.

The single-page host is **Netlify** (confirmed: architect-web's production/preview deploys run `netlify-cli deploy --dir=apps/architect-web/dist` in `.github/workflows/ci-and-release.yml`, and its cache headers come from `apps/architect-web/public/_headers`, which Vite copies from `public/` into `dist/`). Interviewer-v8 has **no web deploy job yet** — only `interviewer-v8-build-test.yml` (Electron, being deleted in Workstream A). Task F8 therefore adds the `public/_headers` file (the Netlify convention architect-web uses) and calls out the missing CI deploy job as an explicit note rather than inventing one.

### Task F1: Add PWA + install-prompt dependencies

**Files:**

- Modify: `apps/interviewer-v8/package.json`

**Interfaces:**

- Consumes: nothing
- Produces: `vite-plugin-pwa`, `@vite-pwa/assets-generator`, `workbox-window` available to later tasks; `virtual:pwa-register/react` resolvable.

- [ ] **Step 1: Write the failing test**
      This is a config task; the verification is that the three deps are declared with the exact versions architect-web already uses (so the monorepo resolves one copy each). Verification command:

```bash
node -e "const p=require('./apps/interviewer-v8/package.json'); const d={...p.dependencies,...p.devDependencies}; const need={'vite-plugin-pwa':'^1.3.0','@vite-pwa/assets-generator':'^1.0.2','workbox-window':'^7.4.1'}; const miss=Object.entries(need).filter(([k,v])=>d[k]!==v); if(miss.length){console.error('missing/mismatched:',miss);process.exit(1)} console.log('ok')"
```

- [ ] **Step 2: Run it, expect fail**
      Run: `node -e "const p=require('./apps/interviewer-v8/package.json'); const d={...p.dependencies,...p.devDependencies}; const need={'vite-plugin-pwa':'^1.3.0','@vite-pwa/assets-generator':'^1.0.2','workbox-window':'^7.4.1'}; const miss=Object.entries(need).filter(([k,v])=>d[k]!==v); if(miss.length){console.error('missing/mismatched:',miss);process.exit(1)} console.log('ok')"`
      Expected: FAIL — prints `missing/mismatched: [ [ 'vite-plugin-pwa', '^1.3.0' ], ... ]` and exits 1 (none are declared yet).
- [ ] **Step 3: Implement**
      Add to `apps/interviewer-v8/package.json`. `vite-plugin-pwa` and `@vite-pwa/assets-generator` go in `devDependencies` (build-time, matching architect-web); `workbox-window` goes in `dependencies` because the generated `registerSW`/`virtual:pwa-register/react` runtime imports it (the known trap: omit it and the SW silently never registers).

Add to `dependencies` (alphabetically, after `wouter`):

```jsonc
    "workbox-window": "^7.4.1",
```

Add to `devDependencies` (alphabetically):

```jsonc
    "@vite-pwa/assets-generator": "^1.0.2",
    "vite-plugin-pwa": "^1.3.0",
```

Then install:

```bash
pnpm install
```

- [ ] **Step 4: Run it, expect pass**
      Run: `node -e "const p=require('./apps/interviewer-v8/package.json'); const d={...p.dependencies,...p.devDependencies}; const need={'vite-plugin-pwa':'^1.3.0','@vite-pwa/assets-generator':'^1.0.2','workbox-window':'^7.4.1'}; const miss=Object.entries(need).filter(([k,v])=>d[k]!==v); if(miss.length){console.error('missing/mismatched:',miss);process.exit(1)} console.log('ok')"`
      Expected: PASS — prints `ok`.
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/package.json pnpm-lock.yaml && git commit -m "build(interviewer-v8): add vite-plugin-pwa, assets-generator, workbox-window"
```

### Task F2: Add `virtual:pwa-register/client` types + `BeforeInstallPromptEvent` / `Navigator.standalone` to `global.d.ts`

**Files:**

- Modify: `apps/interviewer-v8/tsconfig.app.json`
- Modify: `apps/interviewer-v8/src/global.d.ts`

**Interfaces:**

- Consumes: nothing
- Produces: `virtual:pwa-register/react` typed via `vite-plugin-pwa/client`; ambient `BeforeInstallPromptEvent`, `WindowEventMap['beforeinstallprompt']`, `Navigator.standalone` for Tasks F5–F7.

- [ ] **Step 1: Write the failing test**
      Config/types task; verification is that a probe module importing the virtual module and referencing `BeforeInstallPromptEvent` typechecks. Create a throwaway probe and run the app typecheck:

```bash
cat > apps/interviewer-v8/src/pwa-types-probe.ts <<'EOF'
import { useRegisterSW } from 'virtual:pwa-register/react';
const _p: BeforeInstallPromptEvent | null = null;
const _s: boolean | undefined = navigator.standalone;
export const _probe = { useRegisterSW, _p, _s };
EOF
pnpm --filter @codaco/interviewer-v8 typecheck
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: FAIL — `Cannot find module 'virtual:pwa-register/react' or its corresponding type declarations`, and `Property 'standalone' does not exist on type 'Navigator'` / `Cannot find name 'BeforeInstallPromptEvent'`.
- [ ] **Step 3: Implement**
      In `apps/interviewer-v8/tsconfig.app.json`, add the plugin's client types to `types`:

```jsonc
    "types": ["vite/client", "vite-plugin-pwa/client"],
```

In `apps/interviewer-v8/src/global.d.ts`, inside the existing `declare global { … }` block (after the `WireAsset` types, before the closing brace), add — mirroring architect-web's `global.d.ts` but merged into interviewer-v8's global block:

```ts
// iOS Safari exposes installed-PWA (home-screen) state via this non-standard,
// read-only flag, which predates the `display-mode` media query.
interface Navigator {
  readonly standalone?: boolean;
}

// The PWA install prompt event is not in TypeScript's DOM lib. Captured
// pre-React in installPrompt.ts and offered by PwaInstallNudge.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{
    readonly outcome: 'accepted' | 'dismissed';
    readonly platform: string;
  }>;
  prompt(): Promise<void>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: PASS. Then remove the probe:

```bash
rm apps/interviewer-v8/src/pwa-types-probe.ts
pnpm --filter @codaco/interviewer-v8 typecheck
```

Expected: PASS (probe gone, ambient types remain).

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/tsconfig.app.json apps/interviewer-v8/src/global.d.ts && git commit -m "types(interviewer-v8): pwa-register client types + beforeinstallprompt/standalone ambients"
```

### Task F3: Add `pwa-assets.config.ts` + PWA icon source

**Files:**

- Create: `apps/interviewer-v8/pwa-assets.config.ts`
- Create: `apps/interviewer-v8/public/interviewer-icon.png` (generated from `assets/icon-only.png`)

**Interfaces:**

- Consumes: nothing
- Produces: `@vite-pwa/assets-generator` preset + source icon, consumed by the VitePWA `pwaAssets: { config: true }` block (Task F4).

- [ ] **Step 1: Write the failing test**
      The assets-generator reads a single source PNG at `public/interviewer-icon.png` and a config file. Verify both exist and the config uses the `minimal2023Preset` (architect-web's choice, which emits the `pwa-64x64`, `pwa-192x192`, `pwa-512x512`, `maskable-icon-512x512`, `apple-touch-icon-180x180`, `favicon.ico` set the manifest and `_headers` reference):

```bash
test -f apps/interviewer-v8/public/interviewer-icon.png \
  && grep -q "minimal2023Preset" apps/interviewer-v8/pwa-assets.config.ts \
  && grep -q "public/interviewer-icon.png" apps/interviewer-v8/pwa-assets.config.ts \
  && echo ok || { echo missing; exit 1; }
```

- [ ] **Step 2: Run it, expect fail**
      Run: `test -f apps/interviewer-v8/public/interviewer-icon.png && grep -q "minimal2023Preset" apps/interviewer-v8/pwa-assets.config.ts && grep -q "public/interviewer-icon.png" apps/interviewer-v8/pwa-assets.config.ts && echo ok || { echo missing; exit 1; }`
      Expected: FAIL — prints `missing`, exits 1 (neither file exists).
- [ ] **Step 3: Implement**
      Generate the source icon from the existing brand art. `assets/icon-only.png` is the flat 1024² composite (foreground over background) the retired Capacitor/Electron flow already produced (see `scripts/generate-icon-assets.mjs`); reuse it verbatim as the PWA source so the app icon matches the native builds:

```bash
mkdir -p apps/interviewer-v8/public
cp apps/interviewer-v8/assets/icon-only.png apps/interviewer-v8/public/interviewer-icon.png
```

Create `apps/interviewer-v8/pwa-assets.config.ts` (mirrors architect-web's `pwa-assets.config.ts`):

```ts
import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/interviewer-icon.png'],
});
```

- [ ] **Step 4: Run it, expect pass**
      Run: `test -f apps/interviewer-v8/public/interviewer-icon.png && grep -q "minimal2023Preset" apps/interviewer-v8/pwa-assets.config.ts && grep -q "public/interviewer-icon.png" apps/interviewer-v8/pwa-assets.config.ts && echo ok || { echo missing; exit 1; }`
      Expected: PASS — prints `ok`.
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/pwa-assets.config.ts apps/interviewer-v8/public/interviewer-icon.png && git commit -m "feat(interviewer-v8): add PWA icon source and assets-generator config"
```

### Task F4: Add the VitePWA block to the web `vite.config.ts` + build assertion

**Files:**

- Modify: `apps/interviewer-v8/vite.config.ts`
- Create: `apps/interviewer-v8/scripts/assert-pwa-build.mjs`
- Modify: `apps/interviewer-v8/package.json` (add a `build:web` wrapper that runs the assertion after `vite build`)

**Interfaces:**

- Consumes: `pwa-assets.config.ts` (F3), the three deps (F1)
- Produces: `sw.js` + `manifest.webmanifest` + icons emitted into `dist/`; a runtime SW registered via `virtual:pwa-register/react`; runtime caching (images/fonts CacheFirst, Mapbox network-only); a build-time assertion that precache is complete.

The web `vite.config.ts` today just calls `createRendererConfig` (from `vite.renderer.config.ts`) and returns it. Add the VitePWA plugin **around** that shared config so the renderer config stays plugin-agnostic (it is also imported by the Electron slice — but per Workstream A the Electron slice is deleted, so the shared config now only feeds the web build and tests; keeping the PWA plugin in `vite.config.ts` rather than `createRendererConfig` still avoids injecting a SW into the Vitest inline config).

- [ ] **Step 1: Write the failing test**
      The deliverable is a real production build that emits the SW/manifest and precaches every critical chunk (mapbox-gl + interview engine). Drive it with the assertion script the task creates, run against a real build:

```bash
pnpm --filter @codaco/interviewer-v8 exec vite build \
  && node apps/interviewer-v8/scripts/assert-pwa-build.mjs
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vite build && node apps/interviewer-v8/scripts/assert-pwa-build.mjs`
      Expected: FAIL — the build emits no `dist/sw.js`/`dist/manifest.webmanifest` (VitePWA not configured yet), so the assertion script exits 1 with `missing dist/sw.js`. (Before the script exists it fails at `Cannot find module`; the build itself succeeds but produces no SW.)
- [ ] **Step 3: Implement**
      Rewrite `apps/interviewer-v8/vite.config.ts`. Note: `__APP_VERSION__` is **not**
      re-declared here — `createRendererConfig` (in `vite.renderer.config.ts`) already
      sets `define: { __APP_VERSION__: JSON.stringify(appVersion) }`, and the VitePWA
      block is merged onto that shared config via `mergeConfig`, so the define carries
      through untouched.

```ts
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, mergeConfig } from 'vite';

import { createRendererConfig } from './vite.renderer.config';

const here = dirname(fileURLToPath(import.meta.url));
const themeColor = '#1c1c1c'; // interview-mode background; matches index.html theme-color
const backgroundColor = '#1c1c1c';

// mapbox-gl (Geospatial) and the @codaco/interview engine both produce chunks
// well past workbox's 2 MB default. Raise the precache ceiling so no critical
// JS is silently dropped from precache (which would break the offline boot).
// assert-pwa-build.mjs re-checks that nothing critical was excluded.
const MAX_PRECACHE_BYTES = 12 * 1024 * 1024;

export default defineConfig(() =>
  mergeConfig(createRendererConfig({ outDir: 'dist', port: 5180 }), {
    plugins: [
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        strategies: 'generateSW',
        devOptions: { enabled: false },
        pwaAssets: { config: true },
        manifest: {
          name: 'Network Canvas Interviewer',
          short_name: 'Interviewer',
          description:
            'Conduct Network Canvas interviews — offline and installable.',
          theme_color: themeColor,
          background_color: backgroundColor,
          display: 'standalone',
          start_url: '/',
          scope: '/',
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html}'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: MAX_PRECACHE_BYTES,
          runtimeCaching: [
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'interviewer-images',
                expiration: {
                  maxEntries: 400,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'interviewer-fonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Mapbox tiles + search are NETWORK-ONLY (ToS + volume). Never
              // cached: offline Geospatial degrades to a warning + stage error
              // (Workstream D), it must not silently serve stale tiles.
              urlPattern: ({ url }) =>
                url.hostname.endsWith('.mapbox.com') ||
                url.hostname === 'api.mapbox.com' ||
                url.hostname === 'events.mapbox.com',
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    // mapbox-gl + the interview engine are large; splitting them into named
    // chunks keeps any single precached entry well under MAX_PRECACHE_BYTES.
    build: {
      rollupOptions: {
        input: { main: resolve(here, 'index.html') },
        output: {
          manualChunks(id) {
            if (id.includes('mapbox-gl')) return 'mapbox-gl';
            if (id.includes('@codaco/interview')) return 'interview-engine';
            return undefined;
          },
        },
      },
    },
  }),
);
```

Create `apps/interviewer-v8/scripts/assert-pwa-build.mjs`:

```js
#!/usr/bin/env node
// Post-build assertion: a production PWA build must emit the SW + manifest +
// icons, and every critical chunk (mapbox-gl, the interview engine, the entry)
// must be precached — a chunk over the precache limit silently drops from the
// SW manifest and breaks the offline boot.
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const dist = path.join(appRoot, 'dist');

const fail = (msg) => {
  console.error(`PWA build assertion failed: ${msg}`);
  process.exit(1);
};

const swPath = path.join(dist, 'sw.js');
let sw;
try {
  sw = readFileSync(swPath, 'utf8');
} catch {
  fail('missing dist/sw.js');
}

for (const f of [
  'manifest.webmanifest',
  'pwa-192x192.png',
  'pwa-512x512.png',
]) {
  try {
    readFileSync(path.join(dist, f));
  } catch {
    fail(`missing dist/${f}`);
  }
}

// generateSW inlines the precache manifest as `self.__WB_MANIFEST` replaced with
// an array literal of { url, revision } entries. Every emitted .js asset chunk
// must appear there — if workbox skipped one for size, it won't.
const precached = new Set(
  [...sw.matchAll(/["']([^"']+\.js)["']/g)].map((m) =>
    m[1].replace(/^\/+/, ''),
  ),
);

const assetsDir = path.join(dist, 'assets');
let jsAssets = [];
try {
  jsAssets = (await readdir(assetsDir)).filter((f) => f.endsWith('.js'));
} catch {
  fail('missing dist/assets');
}

const critical = jsAssets.filter(
  (f) =>
    f.startsWith('mapbox-gl') ||
    f.startsWith('interview-engine') ||
    f.startsWith('main') ||
    f.startsWith('index'),
);
if (critical.length === 0) {
  fail('no critical chunks (mapbox-gl / interview-engine / entry) found');
}

const excluded = critical.filter((f) => !precached.has(`assets/${f}`));
if (excluded.length > 0) {
  fail(`critical chunk(s) excluded from precache: ${excluded.join(', ')}`);
}

console.log(
  `PWA build ok: sw.js + manifest + icons emitted; ${critical.length} critical chunk(s) precached`,
);
```

In `apps/interviewer-v8/package.json`, add a script that runs the assertion after the build (leaves the existing `build` — which self-routes through turbo — intact; `build:web` is the one CI/Netlify runs to get the guarantee):

```jsonc
    "build:web": "vite build && node scripts/assert-pwa-build.mjs",
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vite build && node apps/interviewer-v8/scripts/assert-pwa-build.mjs`
      Expected: PASS — prints `PWA build ok: sw.js + manifest + icons emitted; N critical chunk(s) precached`.
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/vite.config.ts apps/interviewer-v8/scripts/assert-pwa-build.mjs apps/interviewer-v8/package.json && git commit -m "feat(interviewer-v8): VitePWA generateSW config + precache build assertion"
```

### Task F5: Port `installPrompt.ts` (pre-React install-prompt capture)

**Files:**

- Create: `apps/interviewer-v8/src/lib/pwa/installPrompt.ts`
- Create: `apps/interviewer-v8/src/lib/pwa/__tests__/installPrompt.test.ts`

**Interfaces:**

- Consumes: ambient `BeforeInstallPromptEvent` (F2)
- Produces:

```ts
export function initInstallPromptCapture(): void;
export function getDeferredPrompt(): BeforeInstallPromptEvent | null;
export function subscribeInstallPrompt(listener: () => void): () => void;
export function promptInstall(): Promise<void>;
```

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getDeferredPrompt,
  initInstallPromptCapture,
  promptInstall,
  subscribeInstallPrompt,
} from '../installPrompt';

type FakePrompt = BeforeInstallPromptEvent & {
  preventDefault: () => void;
  prompt: ReturnType<typeof vi.fn>;
};

const makePrompt = (): FakePrompt => {
  const evt = new Event('beforeinstallprompt') as FakePrompt;
  evt.prompt = vi.fn().mockResolvedValue(undefined);
  return evt;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installPrompt', () => {
  it('captures and exposes a fired beforeinstallprompt event', () => {
    initInstallPromptCapture();
    const evt = makePrompt();
    const preventDefault = vi.spyOn(evt, 'preventDefault');

    window.dispatchEvent(evt);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(getDeferredPrompt()).toBe(evt);
  });

  it('notifies subscribers when a prompt is captured', () => {
    initInstallPromptCapture();
    const listener = vi.fn();
    const unsubscribe = subscribeInstallPrompt(listener);

    window.dispatchEvent(makePrompt());
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    window.dispatchEvent(makePrompt());
    expect(listener).not.toHaveBeenCalled();
  });

  it('clears the prompt on appinstalled', () => {
    initInstallPromptCapture();
    window.dispatchEvent(makePrompt());
    expect(getDeferredPrompt()).not.toBeNull();

    window.dispatchEvent(new Event('appinstalled'));
    expect(getDeferredPrompt()).toBeNull();
  });

  it('prompts once then clears (single-shot)', async () => {
    initInstallPromptCapture();
    const evt = makePrompt();
    window.dispatchEvent(evt);

    await promptInstall();

    expect(evt.prompt).toHaveBeenCalledTimes(1);
    expect(getDeferredPrompt()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/pwa/__tests__/installPrompt.test.ts`
      Expected: FAIL — `Cannot find module '../installPrompt'`.
- [ ] **Step 3: Implement**
      `apps/interviewer-v8/src/lib/pwa/installPrompt.ts` (ported from architect-web `src/utils/installPrompt.ts`):

```ts
// Captures the browser's PWA install prompt (Chrome/Edge/Android fire
// `beforeinstallprompt`; Safari/Firefox never do) and exposes it as a small
// external store so the install nudge can offer a real one-tap install.

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let initialized = false;

const notify = () => {
  for (const listener of listeners) listener();
};

// Register the capture listeners. Must run at startup (the event fires early and
// is one-shot), is idempotent, and is a no-op outside a browser.
export const initInstallPromptCapture = (): void => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's default mini-infobar; installation is driven by the nudge.
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
};

export const getDeferredPrompt = (): BeforeInstallPromptEvent | null =>
  deferredPrompt;

export const subscribeInstallPrompt = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Show the native install dialog. The deferred prompt can only be used once, so
// it is cleared immediately (which also hides the nudge).
export const promptInstall = async (): Promise<void> => {
  const prompt = deferredPrompt;
  if (!prompt) return;
  deferredPrompt = null;
  notify();
  await prompt.prompt();
};
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/pwa/__tests__/installPrompt.test.ts`
      Expected: PASS — 4 tests pass.
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/pwa/installPrompt.ts apps/interviewer-v8/src/lib/pwa/__tests__/installPrompt.test.ts && git commit -m "feat(interviewer-v8): port pre-React install-prompt capture store"
```

### Task F6: Port `PwaInstallNudge`

**Files:**

- Create: `apps/interviewer-v8/src/components/PwaInstallNudge.tsx`
- Create: `apps/interviewer-v8/src/components/__tests__/PwaInstallNudge.test.tsx`

**Interfaces:**

- Consumes: `getDeferredPrompt`, `subscribeInstallPrompt`, `promptInstall` (F5); `Button` from `@codaco/fresco-ui/Button`; `cx` from `@codaco/fresco-ui/utils/cva`
- Produces: default-exported `PwaInstallNudge` component (mounted in F9).

- [ ] **Step 1: Write the failing test**

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDeferredPrompt, mockSubscribe, mockPromptInstall } = vi.hoisted(
  () => ({
    mockGetDeferredPrompt: vi.fn(),
    mockSubscribe: vi.fn(() => () => {}),
    mockPromptInstall: vi.fn(),
  }),
);

vi.mock('~/lib/pwa/installPrompt', () => ({
  getDeferredPrompt: mockGetDeferredPrompt,
  subscribeInstallPrompt: mockSubscribe,
  promptInstall: mockPromptInstall,
}));

import PwaInstallNudge from '../PwaInstallNudge';

const DISMISSED_KEY = 'interviewer-v8:pwa-install-nudge-dismissed';
const SHOW_DELAY_MS = 5000;
// A stable object so useSyncExternalStore's snapshot doesn't change identity.
const FAKE_PROMPT = {};

const passDelay = () => act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('PwaInstallNudge', () => {
  it('renders nothing when no install prompt is available', () => {
    mockGetDeferredPrompt.mockReturnValue(null);
    const { container } = render(<PwaInstallNudge />);
    passDelay();
    expect(container).toBeEmptyDOMElement();
  });

  it('waits for the delay before showing', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<PwaInstallNudge />);

    expect(screen.queryByText(/use it like an app/i)).not.toBeInTheDocument();
    passDelay();
    expect(screen.getByText(/use it like an app/i)).toBeInTheDocument();
  });

  it('installs on click once shown', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<PwaInstallNudge />);
    passDelay();

    fireEvent.click(screen.getByRole('button', { name: /^install$/i }));
    expect(mockPromptInstall).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when previously dismissed', () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    const { container } = render(<PwaInstallNudge />);
    passDelay();
    expect(container).toBeEmptyDOMElement();
  });

  it('persists dismissal and hides when dismissed', () => {
    mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
    render(<PwaInstallNudge />);
    passDelay();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(localStorage.getItem(DISMISSED_KEY)).toBe('true');
    expect(screen.queryByText(/use it like an app/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/PwaInstallNudge.test.tsx`
      Expected: FAIL — `Cannot find module '../PwaInstallNudge'`.
- [ ] **Step 3: Implement**
      `apps/interviewer-v8/src/components/PwaInstallNudge.tsx` (ported from architect-web; uses interviewer-v8's fresco-ui `Button` + `cx`, its `~/lib/pwa/installPrompt`, its own `localStorage` key, and researcher-facing copy naming the app "Interviewer"):

```tsx
import { Download, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import Button from '@codaco/fresco-ui/Button';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  getDeferredPrompt,
  promptInstall,
  subscribeInstallPrompt,
} from '~/lib/pwa/installPrompt';

const DISMISSED_KEY = 'interviewer-v8:pwa-install-nudge-dismissed';
const SHOW_DELAY_MS = 5000;

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const PwaInstallNudge = () => {
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getDeferredPrompt,
  );
  const [dismissed, setDismissed] = useState(readDismissed);
  const [ready, setReady] = useState(false);

  // Hold the nudge back for a few seconds so it doesn't interrupt the moment the
  // page loads.
  useEffect(() => {
    if (!deferredPrompt) return undefined;
    const timer = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [deferredPrompt]);

  if (!deferredPrompt || dismissed || !ready) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Private mode etc.: still hide for this session.
    }
    setDismissed(true);
  };

  return (
    <aside
      aria-label="Install Interviewer"
      className={cx(
        'fixed top-(--space-md) right-(--space-md) z-(--z-tooltip)',
        'flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-(--space-sm)',
        'border-border bg-surface-1 text-surface-1-foreground rounded border p-(--space-md) text-sm shadow-lg',
      )}
    >
      {/* Arrow pointing up toward the browser's address-bar install icon. */}
      <span
        aria-hidden
        className="border-border bg-surface-1 absolute top-[-7px] right-7 size-3 rotate-45 border-t border-l"
      />

      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="text-muted-foreground hover:text-surface-1-foreground absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded-full transition-colors hover:bg-current/10"
      >
        <X className="size-4" />
      </button>

      <p className="m-0 pr-(--space-lg)">
        Did you know you can install Interviewer and use it like an app, even
        offline?
      </p>
      <div className="flex justify-end">
        <Button
          color="primary"
          size="sm"
          onClick={() => void promptInstall()}
          icon={<Download />}
        >
          Install
        </Button>
      </div>
    </aside>
  );
};

export default PwaInstallNudge;
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/PwaInstallNudge.test.tsx`
      Expected: PASS — 5 tests pass.
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/PwaInstallNudge.tsx apps/interviewer-v8/src/components/__tests__/PwaInstallNudge.test.tsx && git commit -m "feat(interviewer-v8): port PWA install nudge"
```

### Task F7: Add `PwaUpdateBanner` with the session-aware update guard

**Files:**

- Create: `apps/interviewer-v8/src/components/PwaUpdateBanner.tsx`
- Create: `apps/interviewer-v8/src/components/__tests__/PwaUpdateBanner.test.tsx`

**Interfaces:**

- Consumes: `useRegisterSW` from `virtual:pwa-register/react` (F1/F2); `useLocation` from `wouter`; `Button` from `@codaco/fresco-ui/Button`; `cx` from `@codaco/fresco-ui/utils/cva`
- Produces: default-exported `PwaUpdateBanner` (mounted in F9). Update guard: `updateServiceWorker(true)` is **never** called while the current wouter location matches an interview route; both the silent fresh-load update and the manual Reload are deferred until the location leaves `/interview/`.

The "interview active" signal is the real wouter location: `App.tsx` routes an active interview to `/interview/:sessionId` (and finishing shows the terminal `InterviewComplete` screen still under that path until the user exits). Deriving activity from `useLocation` needs no session-state coupling and is honest — a reload can only happen from a non-interview screen.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockUseRegisterSW, mockUseLocation } = vi.hoisted(() => ({
  mockUseRegisterSW: vi.fn(),
  mockUseLocation: vi.fn(() => ['/']),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: mockUseRegisterSW,
}));

vi.mock('wouter', () => ({
  useLocation: mockUseLocation,
}));

import PwaUpdateBanner from '../PwaUpdateBanner';

// Matches FRESH_LOAD_WINDOW_MS in the component.
const PAST_FRESH_LOAD = 25_000;

const setSwState = ({
  needRefresh = false,
  updateServiceWorker = vi.fn(),
}: {
  needRefresh?: boolean;
  updateServiceWorker?: ReturnType<typeof vi.fn>;
}) => {
  mockUseRegisterSW.mockReturnValue({
    offlineReady: [false, vi.fn()],
    needRefresh: [needRefresh, vi.fn()],
    updateServiceWorker,
  });
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mockUseLocation.mockReturnValue(['/']);
});

describe('PwaUpdateBanner', () => {
  it('renders nothing when there is no update', () => {
    setSwState({});
    const { container } = render(<PwaUpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('silently applies a pending update on a fresh load off an interview', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: true, updateServiceWorker });

    const { container } = render(<PwaUpdateBanner />);

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(container).toBeEmptyDOMElement();
  });

  it('never silently reloads while an interview is active', () => {
    vi.useFakeTimers();
    mockUseLocation.mockReturnValue(['/interview/abc-123']);
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: true, updateServiceWorker });

    render(<PwaUpdateBanner />);

    // Fresh-load silent update suppressed; no banner shown mid-interview either.
    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/new version of Interviewer is available/i),
    ).not.toBeInTheDocument();
  });

  it('prompts for an update that appears during an open session', () => {
    vi.useFakeTimers();
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: false, updateServiceWorker });
    const { rerender } = render(<PwaUpdateBanner />);

    act(() => {
      vi.advanceTimersByTime(PAST_FRESH_LOAD);
    });
    setSwState({ needRefresh: true, updateServiceWorker });
    act(() => rerender(<PwaUpdateBanner />));

    expect(
      screen.getByText(/new version of Interviewer is available/i),
    ).toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('defers a pending update until the interview is exited, then prompts', () => {
    vi.useFakeTimers();
    mockUseLocation.mockReturnValue(['/interview/abc-123']);
    const updateServiceWorker = vi.fn();
    setSwState({ needRefresh: false, updateServiceWorker });
    const { rerender } = render(<PwaUpdateBanner />);

    act(() => {
      vi.advanceTimersByTime(PAST_FRESH_LOAD);
    });
    // Update arrives mid-interview: no banner, no reload.
    setSwState({ needRefresh: true, updateServiceWorker });
    act(() => rerender(<PwaUpdateBanner />));
    expect(
      screen.queryByText(/new version of Interviewer is available/i),
    ).not.toBeInTheDocument();

    // User returns Home: the deferred update now surfaces as a prompt.
    mockUseLocation.mockReturnValue(['/']);
    act(() => rerender(<PwaUpdateBanner />));
    expect(
      screen.getByText(/new version of Interviewer is available/i),
    ).toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('starts an update-check interval on registration and clears it on unmount', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

    let notifyRegistered: (() => void) | undefined;
    mockUseRegisterSW.mockImplementation((options) => {
      notifyRegistered = () => options?.onRegisteredSW?.('/sw.js', {});
      return {
        offlineReady: [false, vi.fn()],
        needRefresh: [false, vi.fn()],
        updateServiceWorker: vi.fn(),
      };
    });

    const { unmount } = render(<PwaUpdateBanner />);
    act(() => notifyRegistered?.());

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const intervalId = setIntervalSpy.mock.results[0]?.value;

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/PwaUpdateBanner.test.tsx`
      Expected: FAIL — `Cannot find module '../PwaUpdateBanner'`.
- [ ] **Step 3: Implement**
      `apps/interviewer-v8/src/components/PwaUpdateBanner.tsx` (ported from architect-web, plus the session-aware guard keyed off the wouter location; uses fresco-ui `Button`/`cx`):

```tsx
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useRegisterSW } from 'virtual:pwa-register/react';

import Button from '@codaco/fresco-ui/Button';
import { cx } from '@codaco/fresco-ui/utils/cva';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
// A pending update that surfaces within this window of loading the page is
// treated as "the latest version was already available when you opened the app",
// and is applied silently. Anything later is an update that arrived during an
// open session, which we surface as a prompt.
const FRESH_LOAD_WINDOW_MS = 20 * 1000;

// The one route where a reload would interrupt data collection. While the
// location is inside it, neither the silent fresh-load update nor the manual
// Reload is allowed — the update is deferred until the researcher leaves.
const isInterviewActive = (location: string): boolean =>
  location.startsWith('/interview/');

const PwaUpdateBanner = () => {
  const [location] = useLocation();
  const interviewActive = isInterviewActive(location);

  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >();
  const [promptVisible, setPromptVisible] = useState(false);
  const loadedAt = useRef(Date.now());

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swScriptUrl, swRegistration) => {
      setRegistration(swRegistration);
    },
  });

  // Poll for a new version during long sessions; clear the timer on unmount so
  // it does not leak or keep firing against a stale registration.
  useEffect(() => {
    if (!registration) return undefined;
    const intervalId = window.setInterval(() => {
      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [registration]);

  // Fresh loads (off an interview) end up on the latest version: a pending
  // update is applied silently. An update that appears later, in an open tab,
  // gets the prompt. While an interview is active, do neither — hold the pending
  // update; when the researcher leaves the interview this effect re-runs
  // (location changed) and the prompt surfaces.
  useEffect(() => {
    if (!needRefresh) return;
    if (interviewActive) return;
    if (Date.now() - loadedAt.current < FRESH_LOAD_WINDOW_MS) {
      void updateServiceWorker(true);
    } else {
      setPromptVisible(true);
    }
  }, [needRefresh, interviewActive, updateServiceWorker]);

  if (!promptVisible || interviewActive) return null;

  return (
    <aside
      aria-label="Update available"
      aria-live="polite"
      className={cx(
        'fixed bottom-(--space-md) left-1/2 z-(--z-global-ui) -translate-x-1/2',
        'flex max-w-[calc(100vw-2rem)] items-center gap-(--space-md)',
        'border-border bg-surface-1 text-surface-1-foreground rounded border p-(--space-md) text-sm shadow-lg',
      )}
    >
      <p className="m-0">
        A new version of Interviewer is available. Your work is saved.
      </p>
      <Button
        color="primary"
        size="sm"
        onClick={() => void updateServiceWorker(true)}
      >
        Reload
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setPromptVisible(false)}
        className="text-muted-foreground hover:text-surface-1-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-current/10"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
};

export default PwaUpdateBanner;
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/PwaUpdateBanner.test.tsx`
      Expected: PASS — 6 tests pass (including the two guard cases: no silent reload mid-interview, and deferral-then-prompt on leaving the interview).
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/PwaUpdateBanner.tsx apps/interviewer-v8/src/components/__tests__/PwaUpdateBanner.test.tsx && git commit -m "feat(interviewer-v8): SW update banner with session-aware reload guard"
```

### Task F8: Add Netlify `_headers` for SW/index no-cache + hashed assets immutable

**Files:**

- Create: `apps/interviewer-v8/public/_headers`

**Interfaces:**

- Consumes: nothing
- Produces: correct cache-control on the built SW/registration/index/manifest/icons and `immutable` on hashed `/assets/*`.

**Host note (explicit):** interviewer-v8 has **no web deploy job in CI yet** — `.github/workflows/ci-and-release.yml` deploys architect-web and the docs/website to **Netlify**, and `interviewer-v8-build-test.yml` only builds the Electron target (removed in Workstream A). This task adds the `_headers` file in the **Netlify convention** the sibling web app (architect-web) already uses, so it takes effect the moment a Netlify web deploy for interviewer-v8 is wired. Wiring that CI job (a `deploy-interviewer-preview`/`-prod` pair running `netlify-cli deploy --dir=apps/interviewer-v8/dist` after `build:web`) is **out of scope for this phase** and must be added when the app is promoted from alpha; without it, `_headers` is emitted into `dist/` but not served. If the eventual host is **not** Netlify, this file must be translated to that host's mechanism (Cloudflare Pages also reads `public/_headers`; Vercel would need `vercel.json` `headers`).

Vite copies `public/*` into `dist/` at build, so `public/_headers` lands at `dist/_headers` where Netlify reads it.

- [ ] **Step 1: Write the failing test**
      Verify the file exists and asserts the required directives (SW + registration + index + manifest no-cache; hashed assets immutable):

```bash
f=apps/interviewer-v8/public/_headers
grep -q "^/sw.js" "$f" \
  && grep -q "^/registerSW.js" "$f" \
  && grep -q "^/index.html" "$f" \
  && grep -q "^/manifest.webmanifest" "$f" \
  && grep -q "must-revalidate" "$f" \
  && grep -q "^/assets/\*" "$f" \
  && grep -q "immutable" "$f" \
  && echo ok || { echo missing; exit 1; }
```

- [ ] **Step 2: Run it, expect fail**
      Run: `f=apps/interviewer-v8/public/_headers; grep -q "^/sw.js" "$f" && grep -q "^/registerSW.js" "$f" && grep -q "^/index.html" "$f" && grep -q "^/manifest.webmanifest" "$f" && grep -q "must-revalidate" "$f" && grep -q "^/assets/\*" "$f" && grep -q "immutable" "$f" && echo ok || { echo missing; exit 1; }`
      Expected: FAIL — prints `missing` (file does not exist), exits 1.
- [ ] **Step 3: Implement**
      Create `apps/interviewer-v8/public/_headers` (mirrors architect-web's `public/_headers`; adds `/registerSW.js` since interviewer-v8 registers via `virtual:pwa-register/react` which emits that runtime file, and drops architect's `/preview/index.html`). The icon filenames match the `minimal2023Preset` outputs from F3/F4:

```
/sw.js
  Cache-Control: public, max-age=0, must-revalidate
/registerSW.js
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
/manifest.webmanifest
  Cache-Control: public, max-age=0, must-revalidate
# PWA icons are not content-hashed, so revalidate them rather than letting a
# renamed-in-place icon serve stale after a release.
/favicon.ico
  Cache-Control: public, max-age=0, must-revalidate
/apple-touch-icon-180x180.png
  Cache-Control: public, max-age=0, must-revalidate
/pwa-64x64.png
  Cache-Control: public, max-age=0, must-revalidate
/pwa-192x192.png
  Cache-Control: public, max-age=0, must-revalidate
/pwa-512x512.png
  Cache-Control: public, max-age=0, must-revalidate
/maskable-icon-512x512.png
  Cache-Control: public, max-age=0, must-revalidate
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

- [ ] **Step 4: Run it, expect pass**
      Run: `f=apps/interviewer-v8/public/_headers; grep -q "^/sw.js" "$f" && grep -q "^/registerSW.js" "$f" && grep -q "^/index.html" "$f" && grep -q "^/manifest.webmanifest" "$f" && grep -q "must-revalidate" "$f" && grep -q "^/assets/\*" "$f" && grep -q "immutable" "$f" && echo ok || { echo missing; exit 1; }`
      Expected: PASS — prints `ok`.
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/public/_headers && git commit -m "chore(interviewer-v8): add Netlify _headers for SW no-cache + immutable assets"
```

### Task F9: Mount the PWA components + capture the install prompt pre-React; surface durability in StatusRow

**Files:**

- Modify: `apps/interviewer-v8/src/main.tsx`
- Modify: `apps/interviewer-v8/src/App.tsx`
- Modify: `apps/interviewer-v8/src/components/StatusRow.tsx`
- Create: `apps/interviewer-v8/src/components/__tests__/StatusRow.test.tsx`

**Interfaces:**

- Consumes: `PwaUpdateBanner` (F7), `PwaInstallNudge` (F6), `initInstallPromptCapture` (F5); `requestPersistentStorage`/`estimateStorage`/`formatBytes` from `~/lib/platform/storage`
- Produces: PWA banner/nudge mounted unconditionally in `App.tsx`; install prompt captured before React mounts; StatusRow shows storage-persisted state.

`requestPersistentStorage()` is already invoked on startup in `main.tsx` (verified). Workstream A removed the `UpdateInfo`/`availableUpdate` update affordance from `StatusRow`; this task rewrites `StatusRow` to drop that prop and instead surface persisted/quota durability (the spec's "surface persisted/quota state in StatusRow"). The SW update prompt is now owned by `PwaUpdateBanner`, mounted globally.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEstimateStorage, mockIsPersisted } = vi.hoisted(() => ({
  mockEstimateStorage: vi.fn(),
  mockIsPersisted: vi.fn(),
}));

vi.mock('~/lib/platform/storage', async () => {
  const actual = await vi.importActual<typeof import('~/lib/platform/storage')>(
    '~/lib/platform/storage',
  );
  return {
    ...actual,
    estimateStorage: mockEstimateStorage,
    isStoragePersisted: mockIsPersisted,
  };
});

vi.mock('wouter', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { StatusRow } from '../StatusRow';

afterEach(() => {
  vi.clearAllMocks();
});

describe('StatusRow', () => {
  it('shows protocol and interview counts', () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
      free: 0,
      percent: 0,
    });
    mockIsPersisted.mockResolvedValue(true);
    render(<StatusRow protocolCount={3} interviewCount={7} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('surfaces persisted-storage durability once resolved', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 1024 * 1024,
      quota: 100 * 1024 * 1024,
      free: 99 * 1024 * 1024,
      percent: 1,
    });
    mockIsPersisted.mockResolvedValue(true);
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage protected/i)).toBeInTheDocument(),
    );
  });

  it('warns when storage is not persisted', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
      free: 0,
      percent: 0,
    });
    mockIsPersisted.mockResolvedValue(false);
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage not protected/i)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/StatusRow.test.tsx`
      Expected: FAIL — `isStoragePersisted` is not exported from `~/lib/platform/storage`, and `StatusRow` still requires `availableUpdate`/`onOpenUpdate` and renders no durability text.
- [ ] **Step 3: Implement**
      Add a `isStoragePersisted` reader to `apps/interviewer-v8/src/lib/platform/storage.ts` (near `requestPersistentStorage`), so StatusRow can query state without re-requesting:

```ts
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
    return false;
  }
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}
```

Rewrite `apps/interviewer-v8/src/components/StatusRow.tsx` (drop the removed `UpdateInfo` import + update affordance; add durability):

```tsx
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';

import { APP_VERSION } from '~/lib/platform/appVersion';
import {
  estimateStorage,
  formatBytes,
  isStoragePersisted,
} from '~/lib/platform/storage';

type StatusRowProps = {
  protocolCount: number;
  interviewCount: number;
};

type Durability = { persisted: boolean; usage: number | null };

const variants = {
  hidden: { opacity: 0, y: '100%' },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 26 },
  },
  exit: {
    opacity: 0,
    y: '100%',
    transition: { duration: 0.25, ease: 'easeIn' },
  },
} as const;

export function StatusRow({ protocolCount, interviewCount }: StatusRowProps) {
  const [durability, setDurability] = useState<Durability | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([isStoragePersisted(), estimateStorage()]).then(
      ([persisted, estimate]) => {
        if (active) setDurability({ persisted, usage: estimate.usage });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <motion.div
      variants={variants}
      className="font-monospace text-text/60 flex items-center justify-between px-11 pb-4 text-xs"
    >
      <Link
        href="/data"
        className="inline-flex cursor-pointer items-center gap-3.5 text-current no-underline"
      >
        <span>
          <strong className="text-text font-bold">{protocolCount}</strong>{' '}
          protocols
        </span>
        <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-current" />
        <span>
          <strong className="text-text font-bold">{interviewCount}</strong>{' '}
          interviews
        </span>
      </Link>
      <div className="flex items-center gap-3.5">
        {durability ? (
          <span
            className="inline-flex items-center gap-1.5"
            title={
              durability.usage !== null
                ? `${formatBytes(durability.usage)} stored`
                : undefined
            }
          >
            {durability.persisted ? (
              <>
                <ShieldCheck className="size-3.5" />
                Storage protected
              </>
            ) : (
              <span className="text-warning inline-flex items-center gap-1.5">
                <ShieldAlert className="size-3.5" />
                Storage not protected
              </span>
            )}
          </span>
        ) : null}
        <span>Interviewer {APP_VERSION}</span>
      </div>
    </motion.div>
  );
}
```

Update `apps/interviewer-v8/src/main.tsx` — capture the install prompt before React mounts (the existing `requestPersistentStorage()` call stays):

```tsx
import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { requestPersistentStorage } from './lib/platform/storage';
import { initInstallPromptCapture } from './lib/pwa/installPrompt';

// The beforeinstallprompt event fires early and is one-shot; capture it before
// React mounts so PwaInstallNudge can offer a real one-tap install.
initInstallPromptCapture();

void requestPersistentStorage();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Mount the PWA components in `apps/interviewer-v8/src/App.tsx`. Add the imports:

```tsx
import PwaInstallNudge from './components/PwaInstallNudge';
import PwaUpdateBanner from './components/PwaUpdateBanner';
```

Then, inside `<AppProviders>`, mount both unconditionally as siblings of the blob backdrop (they portal to fixed positions and must live under the providers but above the route switch). Replace the opening of the `isElectron` drag region — since Workstream A removed `isElectron`, that block is already gone; add the two components immediately after the `<AppProviders>` open tag:

```tsx
        <AppProviders>
          <PwaUpdateBanner />
          <PwaInstallNudge />
          <motion.div
            className="fixed inset-0 -z-10 blur-[10rem]"
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/StatusRow.test.tsx`
      Expected: PASS — 3 tests pass. Then confirm nothing else regressed and the app typechecks:

```bash
pnpm --filter @codaco/interviewer-v8 typecheck
```

Expected: PASS (StatusRow's removed `availableUpdate`/`onOpenUpdate` props are no longer referenced by callers after Workstream A removed the update flow; if a caller still passes them, remove those props at the call site as part of this task).

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/main.tsx apps/interviewer-v8/src/App.tsx apps/interviewer-v8/src/components/StatusRow.tsx apps/interviewer-v8/src/components/__tests__/StatusRow.test.tsx apps/interviewer-v8/src/lib/platform/storage.ts && git commit -m "feat(interviewer-v8): mount PWA banner/nudge, capture install prompt, surface storage durability"
```

### Task F11: Surface persisted/quota durability in SettingsDialog

**Files:**

- Modify: `apps/interviewer-v8/src/components/SettingsDialog.tsx`
- Modify: `apps/interviewer-v8/src/components/__tests__/SettingsDialog.test.tsx`

**Interfaces:**

- Consumes: `estimateStorage`/`formatBytes` and `isStoragePersisted` (F9) from `~/lib/platform/storage`
- Produces: the "About" section's storage row also shows the web durability state (persisted vs best-effort) alongside usage/quota.

The spec's Workstream C row — "surface persisted/quota state in Settings / StatusRow" — has two homes. F9 covered `StatusRow`; this task covers `SettingsDialog`, reusing the exact same `~/lib/platform/storage` helpers so both surfaces read one source of truth. Phase A already removed the old Electron `storage.free` suffix from the About-section `Storage` row's `desc`, so this task adds a web durability line rather than editing that suffix. Copy is researcher-facing ("Offline storage: persisted · X of Y used").

- [ ] **Step 1: Write the failing test**
      Add these cases to `apps/interviewer-v8/src/components/__tests__/SettingsDialog.test.tsx` (the file already mocks `~/lib/db/api`, `useAuth`, `useAnalytics`, etc.; extend its `~/lib/platform/storage` mock to include `isStoragePersisted` and assert the new durability line renders):

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockEstimateStorage, mockIsPersisted } = vi.hoisted(() => ({
  mockEstimateStorage: vi.fn(),
  mockIsPersisted: vi.fn(),
}));

vi.mock('~/lib/platform/storage', async () => {
  const actual = await vi.importActual<typeof import('~/lib/platform/storage')>(
    '~/lib/platform/storage',
  );
  return {
    ...actual,
    estimateStorage: mockEstimateStorage,
    isStoragePersisted: mockIsPersisted,
  };
});

import { SettingsDialog } from '../SettingsDialog';
import { renderSettingsDialog } from './renderSettingsDialog';

describe('SettingsDialog storage durability', () => {
  it('shows the persisted-storage state and usage in the About section', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 1024 * 1024,
      quota: 100 * 1024 * 1024,
      free: 99 * 1024 * 1024,
      percent: 1,
    });
    mockIsPersisted.mockResolvedValue(true);

    renderSettingsDialog(<SettingsDialog open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/offline storage/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/protected from eviction/i)).toBeInTheDocument();
  });

  it('warns when storage is best-effort (not persisted)', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
      free: 0,
      percent: 0,
    });
    mockIsPersisted.mockResolvedValue(false);

    renderSettingsDialog(<SettingsDialog open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/best-effort/i)).toBeInTheDocument(),
    );
  });
});
```

(`renderSettingsDialog` is the existing test helper that wraps the dialog in the Toast/Theme/Auth/Analytics providers the component needs; reuse it — do not re-implement the provider stack. If the existing test file mounts the dialog inline instead of via a helper, mirror that exact setup here rather than importing a helper that doesn't exist.)

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/SettingsDialog.test.tsx`
      Expected: FAIL — `isStoragePersisted` is read by the component but the About section renders no "Offline storage" durability line yet (and the assertions for `/protected from eviction/i` / `/best-effort/i` miss).
- [ ] **Step 3: Implement**
      In `apps/interviewer-v8/src/components/SettingsDialog.tsx`, extend the storage import to include `isStoragePersisted`:

```tsx
import {
  estimateStorage,
  formatBytes,
  isStoragePersisted,
  type StorageEstimate,
} from '~/lib/platform/storage';
```

Add persisted state next to the existing `storage` state:

```tsx
const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
```

Read it in the same `reload` callback that already fetches `estimateStorage`, so both come from one place:

```tsx
const reload = useCallback(async () => {
  const [s, e, persisted] = await Promise.all([
    getSettings(),
    estimateStorage(),
    isStoragePersisted(),
  ]);
  setSettings(s);
  setStorage(e);
  setStoragePersisted(persisted);
  setInstallationId(getInstallationId());
}, []);
```

Derive the researcher-facing durability copy near the existing `storageLabel` (the Electron `free` suffix is already gone per Phase A). `persisted` = the browser has promised not to evict this origin's data; `best-effort` = it may be cleared under storage pressure:

```tsx
const durabilityLabel =
  storagePersisted === null
    ? null
    : storagePersisted
      ? `Offline storage: protected from eviction${
          storage.usage !== null ? ` · ${formatBytes(storage.usage)} used` : ''
        }`
      : 'Offline storage: best-effort — the browser may clear it under storage pressure';
```

Add a durability `SettingsRow` in the About section, immediately after the existing `Storage` row (so usage/quota and durability sit together). It surfaces the persisted state and is muted/warning-toned when best-effort:

```tsx
{
  durabilityLabel ? (
    <SettingsRow
      title="Offline storage"
      desc={durabilityLabel}
      control={
        <span
          className={`inline-flex items-center gap-1.5 text-xs ${
            storagePersisted ? 'text-text/60' : 'text-warning'
          }`}
        >
          {storagePersisted ? (
            <ShieldCheck className="size-3.5" aria-hidden />
          ) : (
            <ShieldAlert className="size-3.5" aria-hidden />
          )}
          {storagePersisted ? 'Persisted' : 'Best-effort'}
        </span>
      }
    />
  ) : null;
}
```

Add the two icons to the existing `lucide-react` import at the top of the file:

```tsx
import {
  FlaskConical,
  Info,
  LineChart,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload as UploadIcon,
} from 'lucide-react';
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/SettingsDialog.test.tsx`
      Expected: PASS — both durability cases pass (the "protected from eviction" line for persisted; the "best-effort" line otherwise), and the existing SettingsDialog tests still pass. Then confirm the app typechecks:

```bash
pnpm --filter @codaco/interviewer-v8 typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/SettingsDialog.tsx apps/interviewer-v8/src/components/__tests__/SettingsDialog.test.tsx && git commit -m "feat(interviewer-v8): surface offline-storage durability in Settings"
```

### Task F10: Whole-phase verification (build, typecheck, unit tests, knip)

**Files:**

- Modify: none (verification only; fix-forward any failures in the files this phase touched)

**Interfaces:**

- Consumes: F1–F9, F11
- Produces: a green PWA build + clean typecheck/lint/knip for the phase.

- [ ] **Step 1: Write the failing test**
      Run the full gate before this phase is considered done:

```bash
pnpm --filter @codaco/interviewer-v8 typecheck \
  && pnpm --filter @codaco/interviewer-v8 test \
  && pnpm --filter @codaco/interviewer-v8 exec vite build \
  && node apps/interviewer-v8/scripts/assert-pwa-build.mjs \
  && pnpm knip
```

- [ ] **Step 2: Run it, expect fail**
      Run: the command above.
      Expected: FAIL if any of: a ported component references a symbol removed in Workstream A; `knip` flags `initInstallPromptCapture`/`isStoragePersisted`/`assert-pwa-build.mjs`/the `build:web` script as unused (they are used by `main.tsx` / StatusRow + SettingsDialog / CI respectively — if flagged, they are genuinely unwired and must be wired, not ignored); or the precache assertion trips because a critical chunk exceeded `MAX_PRECACHE_BYTES` (raise the limit or refine `manualChunks`).
- [ ] **Step 3: Implement**
      Fix-forward only within this phase's files:
- If `knip` reports the new PWA symbols as unused, confirm the F9 wiring landed (`main.tsx` imports `initInstallPromptCapture`; `App.tsx` imports both PWA components) rather than adding a knip ignore.
- If `assert-pwa-build.mjs` reports an excluded critical chunk, add or adjust a `manualChunks` split in `vite.config.ts` (F4) so the offending chunk falls under `MAX_PRECACHE_BYTES`, or raise the limit — never let a critical chunk drop from precache.
- Run `pnpm lint:fix` from the repo root to auto-fix oxlint/oxfmt on the touched files.
- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck && pnpm --filter @codaco/interviewer-v8 test && pnpm --filter @codaco/interviewer-v8 exec vite build && node apps/interviewer-v8/scripts/assert-pwa-build.mjs && pnpm knip`
      Expected: PASS — typecheck clean, all unit tests pass, `PWA build ok: …` printed, knip reports no new unused files/exports/deps.
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore(interviewer-v8): green PWA shell — typecheck, tests, build assertion, knip"
```
