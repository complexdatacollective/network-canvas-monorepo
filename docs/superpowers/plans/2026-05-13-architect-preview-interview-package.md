# Architect preview: `@codaco/interview` direct integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `architect-vite`'s remote Fresco preview flow with in-browser preview rendered by `@codaco/interview`'s `<Shell>`, opened in a new tab via a postMessage handshake.

**Architecture:** Editor tab calls `launchPreview()`, opens `/preview` in a new tab, and serves a `CurrentProtocol` + `startStage` payload over postMessage. The preview tab's `<PreviewHost>` converts the protocol to `ProtocolPayload`, optionally seeds a synthetic network (`generateNetwork`), resolves assets from the existing Dexie store as object URLs, and mounts `<Shell>`. Remote Fresco code and env vars are deleted.

**Tech Stack:** React, TypeScript, Vite, vitest, jsdom, `@reduxjs/toolkit`, `redux-remember`, `wouter`, `@codaco/interview`, `@codaco/fresco-ui`, `@codaco/protocol-validation`, `@base-ui/react`, Dexie.

**Spec:** `docs/superpowers/specs/2026-05-13-architect-preview-interview-package-design.md`.

---

## File map

**Create:**

- `apps/architect-vite/src/components/PreviewHost/messages.ts`
- `apps/architect-vite/src/components/PreviewHost/currentProtocolToPayload.ts`
- `apps/architect-vite/src/components/PreviewHost/useAssetResolver.ts`
- `apps/architect-vite/src/components/PreviewHost/launchPreview.ts`
- `apps/architect-vite/src/components/PreviewHost/PreviewHost.tsx`
- `apps/architect-vite/src/components/PreviewHost/__tests__/messages.test.ts`
- `apps/architect-vite/src/components/PreviewHost/__tests__/currentProtocolToPayload.test.ts`
- `apps/architect-vite/src/components/PreviewHost/__tests__/useAssetResolver.test.ts`
- `apps/architect-vite/src/components/PreviewHost/__tests__/launchPreview.test.ts`
- `apps/architect-vite/src/components/PreviewHost/__tests__/PreviewHost.test.tsx`
- `apps/architect-vite/src/ducks/modules/__tests__/app.test.ts`

**Modify:**

- `apps/architect-vite/package.json`
- `apps/architect-vite/src/main.tsx`
- `apps/architect-vite/src/ducks/modules/app.ts`
- `apps/architect-vite/src/components/Routes.tsx`
- `apps/architect-vite/src/components/__tests__/Routes.test.tsx`
- `apps/architect-vite/src/components/StageEditor/StageEditor.tsx`
- `apps/architect-vite/.env`
- `apps/architect-vite/.env.example`
- `apps/architect-vite/README.md`

**Delete:**

- `apps/architect-vite/src/utils/preview/uploadPreview.ts`
- `apps/architect-vite/src/utils/preview/types.ts`
- `apps/architect-vite/src/utils/preview/` (directory, once empty)
- `apps/architect-vite/src/utils/__mocks__/previewDriver.ts`

---

## Task 1: Add workspace dependencies and interview stylesheet

**Files:**

- Modify: `apps/architect-vite/package.json`
- Modify: `apps/architect-vite/src/main.tsx`

- [ ] **Step 1.1: Add `@codaco/interview` and `@codaco/fresco-ui` to architect-vite dependencies**

Edit `apps/architect-vite/package.json`. In the `dependencies` block, add (keep alphabetical order — both go between `@codaco/...` entries that already exist):

```json
"@codaco/fresco-ui": "workspace:*",
"@codaco/interview": "workspace:*",
```

- [ ] **Step 1.2: Install the new workspace links**

Run from repo root: `pnpm install`
Expected: clean install, no version conflicts, `node_modules/@codaco/interview` symlinked into architect-vite.

- [ ] **Step 1.3: Import the interview package stylesheet**

Edit `apps/architect-vite/src/main.tsx`. Add this import as the **second** line (after the existing `import "./analytics";`):

```ts
import '@codaco/interview/styles.css';
```

- [ ] **Step 1.4: Verify dev server still boots and existing tests pass**

Run:

```bash
pnpm --filter architect-vite dev
```

Expected: Vite starts, no module-resolution errors. Manually load `http://localhost:5173/`, confirm Home renders, then Ctrl+C.

Then run:

```bash
pnpm --filter architect-vite test
```

Expected: existing suite still green (no behavior change yet).

- [ ] **Step 1.5: Commit**

```bash
git add apps/architect-vite/package.json apps/architect-vite/src/main.tsx pnpm-lock.yaml
git commit -m "feat(architect-vite): add @codaco/interview and fresco-ui deps for in-browser preview"
```

---

## Task 2: Typed preview preference on the `app` slice

**Files:**

- Modify: `apps/architect-vite/src/ducks/modules/app.ts`
- Create: `apps/architect-vite/src/ducks/modules/__tests__/app.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `apps/architect-vite/src/ducks/modules/__tests__/app.test.ts`:

```ts
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import appReducer, {
  getPreviewUseSyntheticData,
  setPreviewUseSyntheticData,
} from '../app';

function createStore() {
  return configureStore({ reducer: { app: appReducer } });
}

describe('app slice — preview preferences', () => {
  it('getPreviewUseSyntheticData defaults to true when unset', () => {
    const store = createStore();
    expect(getPreviewUseSyntheticData(store.getState())).toBe(true);
  });

  it('setPreviewUseSyntheticData(false) flips the preference', () => {
    const store = createStore();
    store.dispatch(setPreviewUseSyntheticData(false));
    expect(getPreviewUseSyntheticData(store.getState())).toBe(false);
  });

  it('setPreviewUseSyntheticData(true) restores the preference', () => {
    const store = createStore();
    store.dispatch(setPreviewUseSyntheticData(false));
    store.dispatch(setPreviewUseSyntheticData(true));
    expect(getPreviewUseSyntheticData(store.getState())).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/ducks/modules/__tests__/app.test.ts
```

Expected: failure — `getPreviewUseSyntheticData` and `setPreviewUseSyntheticData` not exported.

- [ ] **Step 2.3: Implement typed wrapper**

Replace the body of `apps/architect-vite/src/ducks/modules/app.ts` with:

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { get } from 'es-toolkit/compat';
import type { RootState } from './root';

type AppState = {
  [key: string]: unknown;
};

const initialState: AppState = {};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setProperty: (
      state,
      action: PayloadAction<{ key: string; value: unknown }>,
    ) => {
      const { key, value } = action.payload;
      state[key] = value;
    },
    clearProperty: (state, action: PayloadAction<{ key: string }>) => {
      const { key } = action.payload;
      delete state[key];
    },
  },
});

const { setProperty, clearProperty } = appSlice.actions;

const PREVIEW_USE_SYNTHETIC_DATA_KEY = 'previewUseSyntheticData';

export function setPreviewUseSyntheticData(value: boolean) {
  return setProperty({ key: PREVIEW_USE_SYNTHETIC_DATA_KEY, value });
}

export function getPreviewUseSyntheticData(state: RootState): boolean {
  const raw = get(state, ['app', PREVIEW_USE_SYNTHETIC_DATA_KEY]);
  return raw === undefined ? true : Boolean(raw);
}

export { clearProperty, setProperty };
export default appSlice.reducer;
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/ducks/modules/__tests__/app.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 2.5: Commit**

```bash
git add apps/architect-vite/src/ducks/modules/app.ts apps/architect-vite/src/ducks/modules/__tests__/app.test.ts
git commit -m "feat(architect-vite): add typed preview-synthetic-data preference"
```

---

## Task 3: `currentProtocolToPayload` helper

**Files:**

- Create: `apps/architect-vite/src/components/PreviewHost/currentProtocolToPayload.ts`
- Create: `apps/architect-vite/src/components/PreviewHost/__tests__/currentProtocolToPayload.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `apps/architect-vite/src/components/PreviewHost/__tests__/currentProtocolToPayload.test.ts`:

```ts
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { describe, expect, it } from 'vitest';
import { currentProtocolToPayload } from '../currentProtocolToPayload';

function makeBaseProtocol(
  overrides: Partial<CurrentProtocol> = {},
): CurrentProtocol {
  return {
    name: 'Test',
    description: '',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
    ...overrides,
  } as CurrentProtocol;
}

describe('currentProtocolToPayload', () => {
  it('assigns a fresh uuid, ISO importedAt, and a stable hash', () => {
    const protocol = makeBaseProtocol();
    const a = currentProtocolToPayload(protocol);
    const b = currentProtocolToPayload(protocol);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.id).not.toBe(a.id);
    expect(() => new Date(a.importedAt).toISOString()).not.toThrow();
    expect(a.hash).toBe(b.hash); // hash is content-derived; uuid/timestamp are not in the hash input
  });

  it('transforms file assetManifest entries into ResolvedAsset[] using source as name', () => {
    const payload = currentProtocolToPayload(
      makeBaseProtocol({
        assetManifest: {
          'asset-1': {
            id: 'asset-1',
            name: 'logo',
            type: 'image',
            source: 'logo.png',
          },
        },
      }),
    );
    expect(payload.assets).toEqual([
      { assetId: 'asset-1', name: 'logo.png', type: 'image' },
    ]);
  });

  it('transforms apikey assetManifest entries with embedded value', () => {
    const payload = currentProtocolToPayload(
      makeBaseProtocol({
        assetManifest: {
          'key-1': {
            id: 'key-1',
            name: 'Mapbox',
            type: 'apikey',
            value: 'secret-token',
          },
        },
      }),
    );
    expect(payload.assets).toEqual([
      {
        assetId: 'key-1',
        name: 'Mapbox',
        type: 'apikey',
        value: 'secret-token',
      },
    ]);
  });

  it('omits assetManifest from the payload', () => {
    const payload = currentProtocolToPayload(makeBaseProtocol());
    expect('assetManifest' in payload).toBe(false);
  });

  it('does not mutate the input protocol', () => {
    const protocol = makeBaseProtocol({
      assetManifest: {
        a: { id: 'a', name: 'x', type: 'image', source: 'x.png' },
      },
    });
    const before = JSON.stringify(protocol);
    currentProtocolToPayload(protocol);
    expect(JSON.stringify(protocol)).toBe(before);
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/currentProtocolToPayload.test.ts
```

Expected: failure — module not found.

- [ ] **Step 3.3: Implement the helper**

Create `apps/architect-vite/src/components/PreviewHost/currentProtocolToPayload.ts`:

```ts
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { hashProtocol } from '@codaco/protocol-validation';
import type { ProtocolPayload, ResolvedAsset } from '@codaco/interview';
import { v4 as uuid } from 'uuid';

export function currentProtocolToPayload(
  protocol: CurrentProtocol,
): ProtocolPayload {
  const { assetManifest, ...rest } = protocol;
  const assets: ResolvedAsset[] = Object.entries(assetManifest ?? {}).map(
    ([assetId, asset]) => {
      if (asset.type === 'apikey') {
        return {
          assetId,
          name: asset.name,
          type: 'apikey',
          value: asset.value,
        };
      }
      return { assetId, name: asset.source, type: asset.type };
    },
  );

  return {
    ...rest,
    id: uuid(),
    hash: hashProtocol({
      codebook: protocol.codebook,
      stages: protocol.stages,
    }),
    importedAt: new Date().toISOString(),
    assets,
  };
}
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/currentProtocolToPayload.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 3.5: Commit**

```bash
git add apps/architect-vite/src/components/PreviewHost/currentProtocolToPayload.ts apps/architect-vite/src/components/PreviewHost/__tests__/currentProtocolToPayload.test.ts
git commit -m "feat(architect-vite): add currentProtocolToPayload helper"
```

---

## Task 4: `useAssetResolver` hook

**Files:**

- Create: `apps/architect-vite/src/components/PreviewHost/useAssetResolver.ts`
- Create: `apps/architect-vite/src/components/PreviewHost/__tests__/useAssetResolver.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `apps/architect-vite/src/components/PreviewHost/__tests__/useAssetResolver.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssetResolver } from '../useAssetResolver';

const getMock = vi.fn();

vi.mock('~/utils/assetDB', () => ({
  assetDb: {
    assets: {
      get: (args: { id: string }) => getMock(args),
    },
  },
}));

let createUrlSpy: ReturnType<typeof vi.spyOn>;
let revokeUrlSpy: ReturnType<typeof vi.spyOn>;
let urlCounter = 0;

beforeEach(() => {
  getMock.mockReset();
  urlCounter = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:test/${++urlCounter}`);
  globalThis.URL.revokeObjectURL = vi.fn();
  createUrlSpy = vi.spyOn(globalThis.URL, 'createObjectURL');
  revokeUrlSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL');
});

afterEach(() => {
  createUrlSpy.mockRestore();
  revokeUrlSpy.mockRestore();
});

describe('useAssetResolver', () => {
  it('returns an object URL for a blob fetched from assetDb', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    getMock.mockResolvedValueOnce({ id: 'a1', data: blob });

    const { result } = renderHook(() => useAssetResolver());
    const url = await result.current('a1');

    expect(url).toBe('blob:test/1');
    expect(createUrlSpy).toHaveBeenCalledWith(blob);
  });

  it('caches subsequent requests for the same asset', async () => {
    const blob = new Blob(['x']);
    getMock.mockResolvedValue({ id: 'a1', data: blob });

    const { result } = renderHook(() => useAssetResolver());
    const first = await result.current('a1');
    const second = await result.current('a1');

    expect(second).toBe(first);
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('revokes all issued URLs on unmount', async () => {
    getMock.mockImplementation(({ id }) =>
      Promise.resolve({ id, data: new Blob([id]) }),
    );

    const { result, unmount } = renderHook(() => useAssetResolver());
    const u1 = await result.current('a1');
    const u2 = await result.current('a2');
    expect(u1).not.toBe(u2);

    unmount();

    expect(revokeUrlSpy).toHaveBeenCalledWith(u1);
    expect(revokeUrlSpy).toHaveBeenCalledWith(u2);
  });

  it('rejects when assetDb returns no entry', async () => {
    getMock.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAssetResolver());
    await expect(result.current('missing')).rejects.toThrow(/missing/);
  });

  it('rejects when assetDb returns a string-typed data field', async () => {
    getMock.mockResolvedValueOnce({ id: 'a1', data: 'not-a-blob' });
    const { result } = renderHook(() => useAssetResolver());
    await expect(result.current('a1')).rejects.toThrow();
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/useAssetResolver.test.ts
```

Expected: failure — module not found.

- [ ] **Step 4.3: Implement the hook**

Create `apps/architect-vite/src/components/PreviewHost/useAssetResolver.ts`:

```ts
import type { AssetRequestHandler } from '@codaco/interview';
import { useCallback, useEffect, useRef } from 'react';
import { assetDb } from '~/utils/assetDB';

export function useAssetResolver(): AssetRequestHandler {
  const cache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const owned = cache.current;
    return () => {
      for (const url of owned.values()) {
        URL.revokeObjectURL(url);
      }
      owned.clear();
    };
  }, []);

  return useCallback(async (assetId: string) => {
    const cached = cache.current.get(assetId);
    if (cached) return cached;

    const entry = await assetDb.assets.get({ id: assetId });
    if (!entry || typeof entry.data === 'string') {
      throw new Error(`Asset ${assetId} not found in local store`);
    }

    const blob =
      entry.data instanceof Blob ? entry.data : new Blob([entry.data]);
    const url = URL.createObjectURL(blob);
    cache.current.set(assetId, url);
    return url;
  }, []);
}
```

- [ ] **Step 4.4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/useAssetResolver.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 4.5: Commit**

```bash
git add apps/architect-vite/src/components/PreviewHost/useAssetResolver.ts apps/architect-vite/src/components/PreviewHost/__tests__/useAssetResolver.test.ts
git commit -m "feat(architect-vite): add useAssetResolver for in-tab preview asset resolution"
```

---

## Task 5: postMessage wire format

**Files:**

- Create: `apps/architect-vite/src/components/PreviewHost/messages.ts`
- Create: `apps/architect-vite/src/components/PreviewHost/__tests__/messages.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `apps/architect-vite/src/components/PreviewHost/__tests__/messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isPreviewMessage } from '../messages';

describe('isPreviewMessage', () => {
  it('accepts a preview:ready message', () => {
    expect(isPreviewMessage({ type: 'preview:ready' })).toBe(true);
  });

  it('accepts a preview:payload message', () => {
    expect(
      isPreviewMessage({
        type: 'preview:payload',
        protocol: {},
        startStage: 0,
        useSyntheticData: true,
      }),
    ).toBe(true);
  });

  it('rejects unknown shapes', () => {
    expect(isPreviewMessage(null)).toBe(false);
    expect(isPreviewMessage(undefined)).toBe(false);
    expect(isPreviewMessage('preview:ready')).toBe(false);
    expect(isPreviewMessage({ type: 'other' })).toBe(false);
    expect(isPreviewMessage({})).toBe(false);
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/messages.test.ts
```

Expected: failure — module not found.

- [ ] **Step 5.3: Implement messages.ts**

Create `apps/architect-vite/src/components/PreviewHost/messages.ts`:

```ts
import type { CurrentProtocol } from '@codaco/protocol-validation';

export type PreviewReady = { type: 'preview:ready' };

export type PreviewPayload = {
  type: 'preview:payload';
  protocol: CurrentProtocol;
  startStage: number;
  useSyntheticData: boolean;
};

export type PreviewMessage = PreviewReady | PreviewPayload;

export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return type === 'preview:ready' || type === 'preview:payload';
}
```

- [ ] **Step 5.4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/messages.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5.5: Commit**

```bash
git add apps/architect-vite/src/components/PreviewHost/messages.ts apps/architect-vite/src/components/PreviewHost/__tests__/messages.test.ts
git commit -m "feat(architect-vite): add preview postMessage wire types"
```

---

## Task 6: Editor-side `launchPreview`

**Files:**

- Create: `apps/architect-vite/src/components/PreviewHost/launchPreview.ts`
- Create: `apps/architect-vite/src/components/PreviewHost/__tests__/launchPreview.test.ts`

This is the most behavior-dense unit. The test exercises: happy-path handshake, popup-blocked rejection, 10s timeout, ignoring messages from the wrong source/origin, and PostHog capture with the right properties.

- [ ] **Step 6.1: Write the failing test**

Create `apps/architect-vite/src/components/PreviewHost/__tests__/launchPreview.test.ts`:

```ts
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureMock = vi.fn();
vi.mock('~/analytics', () => ({ posthog: { capture: captureMock } }));

import { launchPreview } from '../launchPreview';

function makePopupStub() {
  return { postMessage: vi.fn(), closed: false } as unknown as Window;
}

function makeProtocol(): CurrentProtocol {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [{}, {}, {}],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {
      a: { id: 'a', name: 'x', type: 'image', source: 'x.png' },
    },
  } as CurrentProtocol;
}

function postReadyFromSource(source: unknown, origin = window.location.origin) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'preview:ready' },
      source: source as MessageEventSource,
      origin,
    }),
  );
}

describe('launchPreview', () => {
  let popup: Window;
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureMock.mockReset();
    popup = makePopupStub();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    openSpy.mockRestore();
  });

  it('opens /preview, then delivers the payload on receiving preview:ready', async () => {
    const protocol = makeProtocol();
    const promise = launchPreview({
      protocol,
      startStage: 2,
      useSyntheticData: true,
    });

    expect(openSpy).toHaveBeenCalledWith('/preview', '_blank');

    postReadyFromSource(popup);
    await promise;

    expect(popup.postMessage).toHaveBeenCalledWith(
      {
        type: 'preview:payload',
        protocol,
        startStage: 2,
        useSyntheticData: true,
      },
      window.location.origin,
    );
  });

  it('captures protocol_previewed with the resolved preference', async () => {
    const protocol = makeProtocol();
    const promise = launchPreview({
      protocol,
      startStage: 1,
      useSyntheticData: false,
    });
    postReadyFromSource(popup);
    await promise;

    expect(captureMock).toHaveBeenCalledWith('protocol_previewed', {
      stage_count: 3,
      start_stage_index: 1,
      asset_count: 1,
      use_synthetic_data: false,
    });
  });

  it('rejects with a popup-blocked error when window.open returns null', async () => {
    openSpy.mockReturnValueOnce(null);
    await expect(
      launchPreview({
        protocol: makeProtocol(),
        startStage: 0,
        useSyntheticData: true,
      }),
    ).rejects.toThrow(/popup/i);
  });

  it('ignores ready messages from a different source', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
    });

    // Forged message from a different window
    postReadyFromSource(makePopupStub());

    // Real ready from the popup
    postReadyFromSource(popup);
    await promise;

    expect(popup.postMessage).toHaveBeenCalledTimes(1);
  });

  it('ignores ready messages from a different origin', async () => {
    const protocol = makeProtocol();
    const promise = launchPreview({
      protocol,
      startStage: 0,
      useSyntheticData: true,
    });

    postReadyFromSource(popup, 'https://attacker.example');
    postReadyFromSource(popup); // legitimate one
    await promise;

    expect(popup.postMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects when no preview:ready arrives within 10 seconds', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
    });
    const expectation = expect(promise).rejects.toThrow(/didn't load/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await expectation;
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/launchPreview.test.ts
```

Expected: failure — module not found.

- [ ] **Step 6.3: Implement `launchPreview`**

Create `apps/architect-vite/src/components/PreviewHost/launchPreview.ts`:

```ts
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { posthog } from '~/analytics';
import { isPreviewMessage, type PreviewPayload } from './messages';

const HANDSHAKE_TIMEOUT_MS = 10_000;

type LaunchOptions = {
  protocol: CurrentProtocol;
  startStage: number;
  useSyntheticData: boolean;
};

export function launchPreview({
  protocol,
  startStage,
  useSyntheticData,
}: LaunchOptions): Promise<void> {
  const popup = window.open('/preview', '_blank');
  if (!popup) {
    return Promise.reject(
      new Error(
        'Your browser blocked the preview popup. Allow popups for this site and try again.',
      ),
    );
  }

  posthog.capture('protocol_previewed', {
    stage_count: protocol.stages?.length ?? 0,
    start_stage_index: startStage,
    asset_count: Object.keys(protocol.assetManifest ?? {}).length,
    use_synthetic_data: useSyntheticData,
  });

  const expectedOrigin = window.location.origin;
  const payload: PreviewPayload = {
    type: 'preview:payload',
    protocol,
    startStage,
    useSyntheticData,
  };

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timeoutId);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== popup) return;
      if (event.origin !== expectedOrigin) return;
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type !== 'preview:ready') return;

      popup.postMessage(payload, expectedOrigin);
      cleanup();
      resolve();
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new Error("Preview tab didn't load in time. Close it and try again."),
      );
    }, HANDSHAKE_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
  });
}
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/launchPreview.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 6.5: Commit**

```bash
git add apps/architect-vite/src/components/PreviewHost/launchPreview.ts apps/architect-vite/src/components/PreviewHost/__tests__/launchPreview.test.ts
git commit -m "feat(architect-vite): add launchPreview editor-side handshake"
```

---

## Task 7: `PreviewHost` route component

**Files:**

- Create: `apps/architect-vite/src/components/PreviewHost/PreviewHost.tsx`
- Create: `apps/architect-vite/src/components/PreviewHost/__tests__/PreviewHost.test.tsx`

The component does five things: (1) on mount, if `window.opener` is null, render the "preview ended" view; (2) otherwise post `preview:ready` to the opener; (3) listen for `preview:payload`; (4) on receipt, build the `InterviewPayload` (with or without a synthetic network) and mount `<Shell>`; (5) verify source/origin on every received message.

`<Shell>` itself is heavy and not what we're testing here — mock it for the unit tests and verify it receives the correct payload prop.

- [ ] **Step 7.1: Write the failing test**

Create `apps/architect-vite/src/components/PreviewHost/__tests__/PreviewHost.test.tsx`:

```tsx
import type { InterviewPayload } from '@codaco/interview';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shellMock = vi.fn();
vi.mock('@codaco/interview', async () => {
  const actual =
    await vi.importActual<typeof import('@codaco/interview')>(
      '@codaco/interview',
    );
  return {
    ...actual,
    Shell: (props: Record<string, unknown>) => {
      shellMock(props);
      return <div data-testid="shell-mounted" />;
    },
  };
});

vi.mock('~/utils/assetDB', () => ({
  assetDb: { assets: { get: vi.fn() } },
}));

import { PreviewHost } from '../PreviewHost';

function makeProtocol() {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [{ id: 's1', type: 'Information', label: 'A' }],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  };
}

function postPayload(
  source: unknown,
  data: unknown,
  origin = window.location.origin,
) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        source: source as MessageEventSource,
        origin,
      }),
    );
  });
}

describe('PreviewHost', () => {
  let originalOpener: Window | null;
  let openerStub: { postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    originalOpener = window.opener;
    openerStub = { postMessage: vi.fn() };
    Object.defineProperty(window, 'opener', {
      value: openerStub,
      configurable: true,
    });
    shellMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, 'opener', {
      value: originalOpener,
      configurable: true,
    });
  });

  it('posts preview:ready to the opener on mount', () => {
    render(<PreviewHost />);
    expect(openerStub.postMessage).toHaveBeenCalledWith(
      { type: 'preview:ready' },
      window.location.origin,
    );
  });

  it('mounts Shell with the payload after receiving preview:payload', () => {
    render(<PreviewHost />);
    const protocol = makeProtocol();
    postPayload(openerStub, {
      type: 'preview:payload',
      protocol,
      startStage: 0,
      useSyntheticData: false,
    });

    expect(screen.getByTestId('shell-mounted')).toBeInTheDocument();
    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
    };
    expect(call.payload.protocol.name).toBe('T');
    expect(call.payload.session.currentStep).toBe(0);
    expect(call.payload.session.network.nodes).toEqual([]);
  });

  it('seeds a synthetic network when useSyntheticData is true', () => {
    render(<PreviewHost />);
    const protocol = makeProtocol();
    postPayload(openerStub, {
      type: 'preview:payload',
      protocol,
      startStage: 0,
      useSyntheticData: true,
    });

    const call = shellMock.mock.calls.at(-1)?.[0] as {
      payload: InterviewPayload;
    };
    // generateNetwork should run; for an Information stage it may still produce 0 nodes,
    // but the call should resolve without error and currentStep should respect startStage.
    expect(call.payload.session.currentStep).toBe(0);
  });

  it('ignores payload messages from a non-opener source', () => {
    render(<PreviewHost />);
    const protocol = makeProtocol();
    postPayload(
      {},
      {
        type: 'preview:payload',
        protocol,
        startStage: 0,
        useSyntheticData: false,
      },
    );
    expect(shellMock).not.toHaveBeenCalled();
  });

  it('ignores payload messages from a different origin', () => {
    render(<PreviewHost />);
    const protocol = makeProtocol();
    postPayload(
      openerStub,
      {
        type: 'preview:payload',
        protocol,
        startStage: 0,
        useSyntheticData: false,
      },
      'https://attacker.example',
    );
    expect(shellMock).not.toHaveBeenCalled();
  });

  it('renders the preview-ended fallback when window.opener is null', () => {
    Object.defineProperty(window, 'opener', {
      value: null,
      configurable: true,
    });
    render(<PreviewHost />);
    expect(screen.getByText(/preview has ended/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/PreviewHost.test.tsx
```

Expected: failure — module not found.

- [ ] **Step 7.3: Implement `PreviewHost`**

Create `apps/architect-vite/src/components/PreviewHost/PreviewHost.tsx`:

```tsx
import {
  createInitialNetwork,
  generateNetwork,
  type InterviewPayload,
  Shell,
  type SessionPayload,
} from '@codaco/interview';
import { useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { currentProtocolToPayload } from './currentProtocolToPayload';
import { isPreviewMessage, type PreviewPayload } from './messages';
import { useAssetResolver } from './useAssetResolver';

const noopSync = async () => {};
const noopFinish = async () => {};

function buildSession(payload: PreviewPayload): SessionPayload {
  const now = new Date().toISOString();
  const network = payload.useSyntheticData
    ? generateNetwork(payload.protocol.codebook, payload.protocol.stages)
        .network
    : createInitialNetwork();
  return {
    id: uuid(),
    startTime: now,
    finishTime: null,
    exportTime: null,
    lastUpdated: now,
    network,
    currentStep: payload.startStage,
  };
}

export function PreviewHost() {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const opener = typeof window !== 'undefined' ? window.opener : null;
  const onRequestAsset = useAssetResolver();

  useEffect(() => {
    if (!opener) return;

    const expectedOrigin = window.location.origin;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== opener) return;
      if (event.origin !== expectedOrigin) return;
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type !== 'preview:payload') return;
      setPayload(event.data);
    };

    window.addEventListener('message', onMessage);
    opener.postMessage({ type: 'preview:ready' }, expectedOrigin);
    return () => window.removeEventListener('message', onMessage);
  }, [opener]);

  const interviewPayload: InterviewPayload | null = useMemo(() => {
    if (!payload) return null;
    return {
      protocol: currentProtocolToPayload(payload.protocol),
      session: buildSession(payload),
    };
  }, [payload]);

  if (!opener) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">This preview has ended</h1>
        <p>Return to Architect and click Preview again to start a new one.</p>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-md bg-accent px-4 py-2 text-white"
        >
          Close tab
        </button>
      </div>
    );
  }

  if (!interviewPayload) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <p>Loading preview…</p>
      </div>
    );
  }

  return (
    <Shell
      payload={interviewPayload}
      onSync={noopSync}
      onFinish={noopFinish}
      onRequestAsset={onRequestAsset}
      currentStep={interviewPayload.session.currentStep}
      disableAnalytics
      analytics={{
        installationId: 'architect-preview',
        hostApp: 'architect-preview',
      }}
    />
  );
}
```

- [ ] **Step 7.4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/PreviewHost/__tests__/PreviewHost.test.tsx
```

Expected: 6 passing tests.

- [ ] **Step 7.5: Commit**

```bash
git add apps/architect-vite/src/components/PreviewHost/PreviewHost.tsx apps/architect-vite/src/components/PreviewHost/__tests__/PreviewHost.test.tsx
git commit -m "feat(architect-vite): add PreviewHost component for /preview route"
```

---

## Task 8: Wire the `/preview` route

**Files:**

- Modify: `apps/architect-vite/src/components/Routes.tsx`
- Modify: `apps/architect-vite/src/components/__tests__/Routes.test.tsx`

- [ ] **Step 8.1: Extend the existing Routes test**

Open `apps/architect-vite/src/components/__tests__/Routes.test.tsx`. After the existing `vi.mock("~/components/Protocol"…)` block, add another mock so the test doesn't have to render real `<PreviewHost>`:

```ts
vi.mock("~/components/PreviewHost/PreviewHost", () => ({
	PreviewHost: () => <div data-testid="preview" />,
}));
```

Then add a new test inside the existing `describe("Routes", …)` block, alongside the others:

```tsx
it('renders PreviewHost on /preview', () => {
  mockLocation.mockReturnValue('/preview');

  render(<Routes />, {
    wrapper: createWrapper(store),
  });

  expect(screen.getByTestId('preview')).toBeInTheDocument();
});
```

- [ ] **Step 8.2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/__tests__/Routes.test.tsx
```

Expected: failure on the new test (the route is not declared yet).

- [ ] **Step 8.3: Add the route**

Edit `apps/architect-vite/src/components/Routes.tsx`. Add the import (in alphabetical order with the others):

```ts
import { PreviewHost } from '~/components/PreviewHost/PreviewHost';
```

Inside the `<Switch>`, add the route. The full file becomes:

```tsx
import { Route, Switch } from 'wouter';
import Home from '~/components/Home/Home';
import { PreviewHost } from '~/components/PreviewHost/PreviewHost';
import Protocol from '~/components/Protocol';
import {
  AssetsPage,
  CodebookPage,
  ExperimentsPage,
  StageEditorPage,
  SummaryPage,
} from '~/components/pages';

const Routes = () => {
  return (
    <Switch>
      <Route path="/preview" component={PreviewHost} />
      <Route path="/protocol" component={Protocol} />
      <Route path="/protocol/assets" component={AssetsPage} />
      <Route path="/protocol/codebook" component={CodebookPage} />
      <Route path="/protocol/summary" component={SummaryPage} />
      <Route path="/protocol/stage/:stageId" component={StageEditorPage} />
      <Route path="/protocol/experiments" component={ExperimentsPage} />

      <Route path="/" component={Home} />
    </Switch>
  );
};

export default Routes;
```

- [ ] **Step 8.4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/__tests__/Routes.test.tsx
```

Expected: all Routes tests pass, including the new one.

- [ ] **Step 8.5: Commit**

```bash
git add apps/architect-vite/src/components/Routes.tsx apps/architect-vite/src/components/__tests__/Routes.test.tsx
git commit -m "feat(architect-vite): mount PreviewHost at /preview"
```

---

## Task 9: Wire StageEditor to use `launchPreview` + options popover

**Files:**

- Modify: `apps/architect-vite/src/components/StageEditor/StageEditor.tsx`

There are no existing unit tests for `StageEditor` (it's redux-form heavy). This task is integration-by-construction; manual smoke-test in dev validates it.

- [ ] **Step 9.1: Replace the upload import and progress state**

In `apps/architect-vite/src/components/StageEditor/StageEditor.tsx`:

Remove the existing import:

```ts
import {
  getProgressText,
  type UploadProgress,
  uploadProtocolForPreview,
} from '~/utils/preview/uploadPreview';
```

Add:

```ts
import { Popover } from '@base-ui/react/popover';
import { Settings } from 'lucide-react';
import {
  getPreviewUseSyntheticData,
  setPreviewUseSyntheticData,
} from '~/ducks/modules/app';
import { launchPreview } from '~/components/PreviewHost/launchPreview';
import Switch from '~/components/NewComponents/Switch';
```

Inside the component, delete the two upload-progress state hooks:

```ts
const [isUploadingPreview, setIsUploadingPreview] = useState(false);
const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
  null,
);
```

Replace them with a single opening-state hook and a preference selector:

```ts
const [isOpeningPreview, setIsOpeningPreview] = useState(false);
const useSyntheticData = useSelector(getPreviewUseSyntheticData);
```

- [ ] **Step 9.2: Replace the preview handler body**

Find the `handlePreview` callback. Replace its body so that, after validation, it calls `launchPreview` instead of `uploadProtocolForPreview` and no longer opens a window itself (the launcher does that). Updated body (keep the same `useCallback` and dependency list, adjusted as shown):

```tsx
const handlePreview = useCallback(async () => {
  if (!protocol || !formValues) {
    dispatch(
      dialogActions.openDialog({
        type: 'Error',
        title: 'Preview Error',
        message: 'No protocol loaded',
      }),
    );
    return;
  }

  const normalizedStage = omit(formValues, ['_modified']) as Stage;
  const previewProtocol = buildProtocolWithStage(
    protocol,
    normalizedStage,
    id,
    insertAtIndex,
  );

  const validationResult = await validateProtocol(previewProtocol);
  if (!validationResult.success) {
    dispatch(
      dialogActions.openDialog({
        type: 'Error',
        title: 'Cannot Preview',
        message: ensureError(validationResult.error).message,
      }),
    );
    return;
  }

  const startStage =
    stageIndex !== -1 ? stageIndex : (insertAtIndex ?? protocol.stages.length);
  setIsOpeningPreview(true);
  try {
    await launchPreview({
      protocol: previewProtocol,
      startStage,
      useSyntheticData,
    });
  } catch (error) {
    dispatch(
      dialogActions.openDialog({
        type: 'Error',
        title: 'Preview Failed',
        message:
          error instanceof Error ? error.message : 'Failed to open preview',
      }),
    );
  } finally {
    setIsOpeningPreview(false);
  }
}, [
  protocol,
  stageIndex,
  dispatch,
  formValues,
  id,
  insertAtIndex,
  useSyntheticData,
]);
```

- [ ] **Step 9.3: Replace the preview button label and add the options popover**

Find the existing `previewButton`:

```tsx
const previewButton = (
  <Button
    key="preview"
    onClick={handlePreview}
    color="barbie-pink"
    disabled={isUploadingPreview || isStageInvalid}
  >
    {isUploadingPreview ? getProgressText(uploadProgress) : 'Preview'}
  </Button>
);
```

Replace with:

```tsx
const previewOptions = (
  <Popover.Root>
    <Popover.Trigger
      render={
        <button
          type="button"
          aria-label="Preview options"
          className="rounded-md p-2 hover:bg-input-active"
        >
          <Settings className="size-4" />
        </button>
      }
    />
    <Popover.Portal>
      <Popover.Positioner side="top" sideOffset={8}>
        <Popover.Popup className="rounded-md bg-surface-accent p-3 text-surface-accent-foreground shadow-lg">
          <label className="flex items-center gap-3">
            <Switch
              checked={useSyntheticData}
              onCheckedChange={(checked) =>
                dispatch(setPreviewUseSyntheticData(checked))
              }
            />
            <span className="text-sm">Start preview with example data</span>
          </label>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
);

const previewButton = (
  <span key="preview" className="inline-flex items-center gap-1">
    {previewOptions}
    <Button
      onClick={handlePreview}
      color="barbie-pink"
      disabled={isOpeningPreview || isStageInvalid}
    >
      {isOpeningPreview ? 'Opening preview…' : 'Preview'}
    </Button>
  </span>
);
```

- [ ] **Step 9.4: Typecheck the file in isolation**

```bash
pnpm --filter architect-vite typecheck
```

Expected: no errors. If `@base-ui/react/popover` exports a different surface than the one used here, adjust to match the version actually in `node_modules/@base-ui/react/popover` — refer to the `Tooltip` component (which uses the same library) for the matching import pattern. The pattern (`Root` / `Trigger` / `Portal` / `Positioner` / `Popup`) mirrors `Tooltip` exactly.

- [ ] **Step 9.5: Manually smoke-test the preview flow**

```bash
pnpm --filter architect-vite dev
```

In the browser:

1. Open architect, create or load a protocol with at least one stage.
2. Click an existing stage → enter the editor.
3. Click the gear icon → confirm the "Start preview with example data" toggle reflects `true` initially.
4. Toggle it off, refresh the page, re-enter the stage editor — toggle should still read `off` (persisted via redux-remember).
5. Click Preview → new tab opens at `/preview`, the Shell renders, the stage shown matches your starting stage.
6. Toggle synthetic data on, click Preview again, confirm the network reflects synthetic nodes in subsequent stages.
7. Reload the preview tab → confirm the "preview has ended" fallback renders.
8. Disable popups in the browser, click Preview → confirm an error dialog appears.

- [ ] **Step 9.6: Commit**

```bash
git add apps/architect-vite/src/components/StageEditor/StageEditor.tsx
git commit -m "feat(architect-vite): use local launchPreview and add synthetic-data toggle"
```

---

## Task 10: Delete the remote-Fresco preview path

**Files:**

- Delete: `apps/architect-vite/src/utils/preview/uploadPreview.ts`
- Delete: `apps/architect-vite/src/utils/preview/types.ts`
- Delete: `apps/architect-vite/src/utils/preview/` (empty)
- Delete: `apps/architect-vite/src/utils/__mocks__/previewDriver.ts`
- Modify: `apps/architect-vite/.env`
- Modify: `apps/architect-vite/.env.example`
- Modify: `apps/architect-vite/README.md`

- [ ] **Step 10.1: Verify nothing imports the doomed files**

```bash
grep -rn "utils/preview\|previewDriver\|uploadProtocolForPreview\|getProgressText\|VITE_FRESCO_PREVIEW" apps/architect-vite/src
```

Expected: no matches. If anything still references these, return to Task 9 — the StageEditor edit was incomplete.

- [ ] **Step 10.2: Delete the files**

```bash
git rm apps/architect-vite/src/utils/preview/uploadPreview.ts \
       apps/architect-vite/src/utils/preview/types.ts \
       apps/architect-vite/src/utils/__mocks__/previewDriver.ts
rmdir apps/architect-vite/src/utils/preview
```

- [ ] **Step 10.3: Remove env vars from `.env`**

Open `apps/architect-vite/.env` and delete the two lines:

```
VITE_FRESCO_PREVIEW_URL=http://localhost:3000
VITE_FRESCO_PREVIEW_API_TOKEN=
```

- [ ] **Step 10.4: Remove env vars from `.env.example`**

Open `apps/architect-vite/.env.example` and delete the two corresponding lines:

```
VITE_FRESCO_PREVIEW_URL=http://localhost:3000
VITE_FRESCO_PREVIEW_API_TOKEN=
```

- [ ] **Step 10.5: Remove README references**

Open `apps/architect-vite/README.md`. Find the bullets:

```
- `VITE_FRESCO_PREVIEW_URL` - Base URL for the Fresco preview service used to upload and view protocol previews
- `VITE_FRESCO_PREVIEW_API_TOKEN` - API token used to authenticate requests to the Fresco preview service
```

Delete both bullets. If there's a surrounding paragraph that introduces them ("To preview protocols…"), trim it to match the new in-browser preview reality — single line, e.g.:

> Protocols are previewed in a local browser tab using the bundled `@codaco/interview` runtime; no remote service is required.

Place that sentence wherever the deleted bullets used to live.

- [ ] **Step 10.6: Run lint + typecheck**

```bash
pnpm --filter architect-vite lint
pnpm --filter architect-vite typecheck
```

Expected: both clean.

- [ ] **Step 10.7: Commit**

```bash
git add apps/architect-vite/.env apps/architect-vite/.env.example apps/architect-vite/README.md
git commit -m "chore(architect-vite): drop remote Fresco preview path and env vars"
```

---

## Task 11: Full verification

**Files:** none (verification only).

- [ ] **Step 11.1: Run architect-vite test suite**

```bash
pnpm --filter architect-vite test
```

Expected: green.

- [ ] **Step 11.2: Run workspace lint and typecheck**

```bash
pnpm lint
pnpm typecheck
```

Expected: green.

- [ ] **Step 11.3: Run knip on architect-vite**

```bash
pnpm knip
```

Expected: no new unused dependencies, no orphaned files in the `utils/preview` neighborhood. If knip flags anything in the new `PreviewHost/` folder as unused, the missing wire is likely the route registration in `Routes.tsx` (Task 8) — verify before deleting anything.

- [ ] **Step 11.4: End-to-end manual run**

```bash
pnpm --filter architect-vite dev
```

Walk through:

1. New protocol → add a Sociogram stage somewhere mid-flow.
2. Preview from the Sociogram with synthetic data on → confirm the sociogram renders with nodes.
3. Preview again with synthetic data off → confirm the sociogram renders empty.
4. Add an image asset to the protocol → reference it in a stage → preview → confirm the image renders (asset resolution from Dexie works).
5. Close the preview tab, click Preview again → confirm a fresh handshake works (no stale-closure bugs).

- [ ] **Step 11.5: Final commit if anything else was touched during verification**

If steps 11.1–11.4 surfaced small fixes, commit them separately with a clear scope. Otherwise no commit is required for this task.

---

## Out-of-scope follow-ups (documented in the spec, not implemented here)

- `validateProtocol` memoization (now the dominant cost of "time to preview").
- Promoting `currentProtocolToPayload` to `@codaco/interview` when a second consumer materializes.
