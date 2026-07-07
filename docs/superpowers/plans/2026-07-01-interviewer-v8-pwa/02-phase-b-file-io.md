## Phase B: File I/O & protocol sources (Workstream A.1)

### Task B1: Remove the import-from-URL feature end to end

Post-Phase-A baseline: `apps/interviewer-v8/electron/`, `capacitor.config.ts`,
`android/`, and `ios/` are already deleted, and `fetchFromUrl.ts` was already
removed by Phase A (which collapsed `importProtocolFromUrl` to a plain web-only
`fetch()` and dropped the native fetch helper). This task removes the remaining
web-only URL-import surface: the `importProtocolFromUrl` (`fetch()`) +
`deriveNameFromUrl` functions in `importProtocol.ts`, the `source: 'url'` request
in `useProtocolImport.ts`, and the "Import from URL" section in `ImportDialog.tsx`.

**Files:**

- Modify: `apps/interviewer-v8/src/lib/protocol/importProtocol.ts`
- Modify: `apps/interviewer-v8/src/lib/protocol/useProtocolImport.ts`
- Modify: `apps/interviewer-v8/src/components/ImportDialog.tsx`
- Delete: `apps/interviewer-v8/src/lib/protocol/__tests__/importProtocol.test.ts` (its only test exercises `importProtocolFromUrl`, which is being removed)
- Modify: `apps/interviewer-v8/src/lib/protocol/__tests__/useProtocolImport.test.ts` (drop the `source:'url'` mock/case; retarget to the sample source, which Task B2 rewires)
- Create: `apps/interviewer-v8/src/lib/protocol/__tests__/noUrlImport.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `importProtocol.ts` no longer exports `importProtocolFromUrl`, `deriveNameFromUrl`, or the `'fetching'` `ImportPhase`; `ImportRequest` loses its `{ source: 'url' }` member; `PendingImport['source']` becomes `'file' | 'sample'`. Task B2 depends on the trimmed `importProtocol.ts` (it adds a buffer-less local install path) and on `useProtocolImport.ts`'s sample branch existing but no longer calling `importProtocolFromUrl`.

- [ ] **Step 1: Write the failing test** — add a guard test that pins the removal so a later re-introduction is caught. Create `apps/interviewer-v8/src/lib/protocol/__tests__/noUrlImport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import * as importProtocol from '../importProtocol';
import type { ImportRequest } from '../useProtocolImport';

describe('URL import is removed', () => {
  it('importProtocol.ts exposes no URL entry points', () => {
    const names = Object.keys(importProtocol);
    expect(names).not.toContain('importProtocolFromUrl');
    expect(names).not.toContain('deriveNameFromUrl');
  });

  it('ImportPhase no longer includes a network fetch phase', () => {
    // `fetching` was the URL-only phase; a valid local phase must remain.
    const localPhases: importProtocol.ImportPhase[] = ['extracting', 'saving'];
    expect(localPhases).toHaveLength(2);
  });

  it('ImportRequest is file-only', () => {
    const request: ImportRequest = {
      source: 'file',
      file: new File([], 'x.netcanvas'),
      label: 'x.netcanvas',
    };
    // @ts-expect-error — url is no longer an allowed source
    const bad: ImportRequest = { source: 'url', url: 'https://x', label: 'x' };
    expect(request.source).toBe('file');
    expect(bad).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/protocol/__tests__/noUrlImport.test.ts`
      Expected: FAIL — `importProtocolFromUrl`/`deriveNameFromUrl` are still exported, `ImportPhase` still includes `'fetching'`, and `ImportRequest` still accepts `source:'url'` (so the `@ts-expect-error` is unused and the runtime `not.toContain` assertions fail).

- [ ] **Step 3: Implement**

In `apps/interviewer-v8/src/lib/protocol/importProtocol.ts`:

- Remove the web `fetch()` import branch: the `import { deriveNameFromUrl }`/`isProbablyValidUrl` helpers and the `importProtocolFromUrl` function (which, post-Phase-A, is a plain web-only `fetch(url)` → `importFromBuffer`). Delete the exported `deriveNameFromUrl` and the entire exported `importProtocolFromUrl` function.
- Change `ImportPhase` to `export type ImportPhase = 'extracting' | 'saving';` (drop the URL-only `'fetching'` member).
- Remove `'fetch-failed'` from the `ImportProtocolFailure['error']` union.

Resulting tail of `importProtocol.ts` (everything after `importProtocolFromFile`) is just `importProtocolFromFile`; the file ends at its close. Keep `importFromBuffer` exported-internal for Task B2.

In `apps/interviewer-v8/src/lib/protocol/useProtocolImport.ts`:

- Drop `importProtocolFromUrl` from the `./importProtocol` import.
- Change `ImportRequest` to `export type ImportRequest = { source: 'file'; file: File; label: string };`.
- Change `PendingImport['source']` to `'file' | 'sample'`.
- In `createPendingImport`, delete the `request.source === 'url'` branch; the sample branch's `phase` becomes `'extracting'` (no fetch phase remains). Update its signature's `request` param type to `ImportRequest | { source: 'sample' }` (unchanged) — the `'url'` member is simply gone.
- In `run()`, delete the `else if (request.source === 'url')` branch. The sample branch currently calls `importProtocolFromUrl`; that call is replaced by the bundled-install path introduced in Task B2. For this task, temporarily leave the sample branch throwing `throw new Error('sample install rewired in B2');` so the file type-checks (Task B2's test replaces it before it can run — see Task B2 Step 3).

In `apps/interviewer-v8/src/components/ImportDialog.tsx`:

- Remove the `deriveNameFromUrl` import, the `CloudDownload` lucide import, `useState`/`url` state, `isProbablyValidUrl`, `handleFetchUrl`, and the `useToast` usage if it becomes unused (it is — remove the `toast` binding and the `useToast` import). Keep `Button` only if still used elsewhere in the file; it is not after removal, so remove the `Button`, `InputField`, `Surface`, and `Heading` imports.
- Delete the `<div>` "or" separator and the entire `<Surface as="section">…Import from URL…</Surface>` block.
- `reset`/`handleClose` keep only `setDragOver(false)`.

Update `apps/interviewer-v8/src/lib/protocol/__tests__/useProtocolImport.test.ts`: delete the `importProtocolFromUrl` key from the `vi.mock('../importProtocol', …)` factory, remove the `import { importProtocolFromUrl }` line, and change the test to a `source:'file'` request asserting the pending card appears and `importProtocolFromFile` is not called until the delay elapses:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProtocolImport } from '../useProtocolImport';

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));
vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));
vi.mock('~/lib/db/api', () => ({
  updateSettings: vi.fn(),
}));
vi.mock('../importProtocol', () => ({
  importProtocolFromFile: vi.fn(() => new Promise(() => {})),
  peekProtocolName: vi.fn(async () => null),
}));

import { importProtocolFromFile } from '../importProtocol';

describe('useProtocolImport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows the pending card immediately but delays the import work', async () => {
    const { result } = renderHook(() =>
      useProtocolImport({ onInstalled: () => {} }),
    );

    await act(async () => {
      await result.current.startImport({
        source: 'file',
        file: new File([new Uint8Array()], 'study.netcanvas'),
        label: 'study.netcanvas',
      });
    });

    expect(result.current.pendingImports).toHaveLength(1);
    expect(importProtocolFromFile).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(importProtocolFromFile).toHaveBeenCalledTimes(1);
  });
});
```

Delete `apps/interviewer-v8/src/lib/protocol/__tests__/importProtocol.test.ts`.

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/protocol/__tests__/noUrlImport.test.ts src/lib/protocol/__tests__/useProtocolImport.test.ts && pnpm --filter @codaco/interviewer-v8 typecheck && pnpm knip`
      Expected: PASS — both test files green; typecheck clean (no dangling `importProtocolFromUrl`/`deriveNameFromUrl` references); knip reports no newly-unused exports/files (the removed URL-import exports are gone).

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/protocol/importProtocol.ts apps/interviewer-v8/src/lib/protocol/useProtocolImport.ts apps/interviewer-v8/src/components/ImportDialog.tsx apps/interviewer-v8/src/lib/protocol/__tests__ && git commit -m "feat(interviewer-v8): remove import-from-URL; imports are local files only"
```

---

### Task B2: Bundle the sample + development protocols for local (no-network) install

**Files:**

- Modify: `apps/interviewer-v8/package.json` (add `@codaco/sample-protocol` + `@codaco/development-protocol` as `workspace:*` deps)
- Rewrite: `apps/interviewer-v8/src/lib/protocol/sampleProtocol.ts`
- Create: `apps/interviewer-v8/src/lib/protocol/bundledProtocols.ts`
- Modify: `apps/interviewer-v8/src/lib/protocol/importProtocol.ts` (export a buffer-less local-install entry point)
- Modify: `apps/interviewer-v8/src/lib/protocol/useProtocolImport.ts` (sample branch installs from bundled bytes)
- Create: `apps/interviewer-v8/src/lib/protocol/__tests__/bundledProtocols.test.ts`

**Interfaces:**

- Consumes: from Task B1, `importProtocol.ts` exports `importFromBuffer`-adjacent internals and no longer has a URL path; `useProtocolImport.ts`'s sample branch is a stub throwing.
- Produces:

```ts
// sampleProtocol.ts
export const SAMPLE_PROTOCOL: { name: string; description: string };
// bundledProtocols.ts
export type BundledProtocol = {
  document: unknown;
  assets: ExtractedAsset[];
  name: string;
};
export function loadBundledSampleProtocol(): Promise<BundledProtocol>;
export function loadBundledDevelopmentProtocol(): Promise<BundledProtocol>;
// importProtocol.ts (new export)
export function importBundledProtocol(
  bundled: { document: unknown; assets: ExtractedAsset[]; name: string },
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult>;
```

Task B4 (accept relaxation) and later phases don't depend on this; the deck (`deckEntries.ts`, `DeckSlotCard.tsx`) already consume `SAMPLE_PROTOCOL.name`/`.description`, which are preserved.

- [ ] **Step 1: Write the failing test** — `apps/interviewer-v8/src/lib/protocol/__tests__/bundledProtocols.test.ts`. It asserts the sample installs through the real pipeline with `fetch` forced to throw, proving no network is used, and that the bundled document is schema-8 (no migration) with its assets attached.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadBundledSampleProtocol } from '../bundledProtocols';
import { importBundledProtocol } from '../importProtocol';

// Any network access during a "bundled" install is a defect: fail loudly.
const throwingFetch = vi.fn(() => {
  throw new Error('fetch must not be called during a bundled install');
});

const saveProtocol = vi.fn(async () => ({}) as never);
vi.mock('../../db/api', () => ({
  saveProtocol: (...args: unknown[]) => saveProtocol(...args),
}));

describe('bundled sample protocol', () => {
  beforeEach(() => {
    saveProtocol.mockClear();
    vi.stubGlobal('fetch', throwingFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the bundled sample document and its assets without network', async () => {
    const bundled = await loadBundledSampleProtocol();
    const doc = bundled.document as { schemaVersion: number; name: string };

    expect(doc.schemaVersion).toBe(8);
    expect(bundled.name).toBe('Sample Protocol');
    // Sample protocol ships media assets; they must be resolved to Blobs.
    expect(bundled.assets.length).toBeGreaterThan(0);
    for (const asset of bundled.assets) {
      expect(asset.data instanceof Blob || typeof asset.data === 'string').toBe(
        true,
      );
    }
  });

  it('installs through the real detect→validate→save pipeline, no fetch', async () => {
    const bundled = await loadBundledSampleProtocol();
    const phases: string[] = [];

    const result = await importBundledProtocol(bundled, (e) =>
      phases.push(e.phase),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.migrated).toBe(false); // already schema 8
    }
    expect(saveProtocol).toHaveBeenCalledTimes(1);
    expect(throwingFetch).not.toHaveBeenCalled();
    expect(phases).toContain('saving');
  });
});
```

Note for the implementer: under vitest (jsdom) `import.meta.glob(..., { query: '?url', import: 'default', eager: true })` resolves to file URLs, and `bundledProtocols.ts` must read the asset bytes without `fetch` so this test passes with `fetch` stubbed to throw. Use the Vite `?arraybuffer` glob query (below), which inlines the bytes at build/transform time — no runtime `fetch` — instead of architect-web's `?url` + `fetch` pattern (that pattern relies on the service worker / dev server and would call `fetch`).

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/protocol/__tests__/bundledProtocols.test.ts`
      Expected: FAIL — `../bundledProtocols` and `importBundledProtocol` do not exist yet (module-not-found / not-a-function).

- [ ] **Step 3: Implement**

Add deps in `apps/interviewer-v8/package.json` `dependencies`:

```jsonc
"@codaco/sample-protocol": "workspace:*",
"@codaco/development-protocol": "workspace:*",
```

Then run `pnpm install` from the repo root so the workspace links resolve.

Rewrite `apps/interviewer-v8/src/lib/protocol/sampleProtocol.ts` (drop the remote URL; keep display copy the deck reads):

```ts
export const SAMPLE_PROTOCOL = {
  name: 'Sample Protocol',
  description:
    'A complete reference protocol from the Network Canvas team — useful for exploring how stages, prompts, and codebooks fit together.',
} as const;
```

Create `apps/interviewer-v8/src/lib/protocol/bundledProtocols.ts`:

```ts
import type { ExtractedAsset } from '@codaco/protocol-validation';
import developmentProtocolJson from '@codaco/development-protocol';
import sampleProtocolJson from '@codaco/sample-protocol';

export type BundledProtocol = {
  document: unknown;
  assets: ExtractedAsset[];
  name: string;
};

type ManifestEntry = {
  id: string;
  name: string;
  source?: string;
  type: string;
};

// Vite inlines each bundled asset's raw bytes at transform time (`?arraybuffer`),
// so a bundled install never touches the network — required for offline install
// and enforced by the test that stubs `fetch` to throw. The map key is the file
// name, which matches the `source` of the corresponding `assetManifest` entry.
const sampleAssetBytes = import.meta.glob<ArrayBuffer>(
  '../../../../../packages/sample-protocol/assets/*',
  { query: '?arraybuffer', import: 'default', eager: true },
);
const developmentAssetBytes = import.meta.glob<ArrayBuffer>(
  '../../../../../packages/development-protocol/assets/*',
  { query: '?arraybuffer', import: 'default', eager: true },
);

function bytesBySource(
  globbed: Record<string, ArrayBuffer>,
): Map<string, ArrayBuffer> {
  return new Map(
    Object.entries(globbed).map(([path, bytes]) => [
      path.slice(path.lastIndexOf('/') + 1),
      bytes,
    ]),
  );
}

function resolveAssets(
  document: unknown,
  globbed: Record<string, ArrayBuffer>,
): ExtractedAsset[] {
  const bySource = bytesBySource(globbed);
  const manifest =
    (document as { assetManifest?: Record<string, ManifestEntry> })
      .assetManifest ?? {};
  const assets: ExtractedAsset[] = [];
  for (const entry of Object.values(manifest)) {
    if (entry.type === 'apikey') {
      const value = (entry as { value?: string }).value ?? '';
      assets.push({ id: entry.id, name: entry.name, data: value });
      continue;
    }
    if (!entry.source) continue;
    const bytes = bySource.get(entry.source);
    if (!bytes) {
      throw new Error(
        `Missing bundled asset "${entry.source}" for ${entry.id}`,
      );
    }
    assets.push({ id: entry.id, name: entry.name, data: new Blob([bytes]) });
  }
  return assets;
}

export function loadBundledSampleProtocol(): Promise<BundledProtocol> {
  const document = sampleProtocolJson as unknown;
  return Promise.resolve({
    document,
    assets: resolveAssets(document, sampleAssetBytes),
    name: 'Sample Protocol',
  });
}

export function loadBundledDevelopmentProtocol(): Promise<BundledProtocol> {
  const document = developmentProtocolJson as unknown;
  return Promise.resolve({
    document,
    assets: resolveAssets(document, developmentAssetBytes),
    name: 'Development Protocol',
  });
}
```

In `apps/interviewer-v8/src/lib/protocol/importProtocol.ts`, refactor so the detect→migrate→validate→hash→save tail is reachable from an already-parsed document. `importFromBuffer` currently parses the zip then runs that tail; extract the tail into `importParsedProtocol` and have `importFromBuffer` call it. Add the new export `importBundledProtocol`:

```ts
async function importParsedProtocol(
  document: unknown,
  assets: ExtractedAsset[],
  sourceName: string,
  onProgress?: OnImportProgress,
  nameOverride?: string,
): Promise<ImportProtocolResult> {
  const version = detectSchemaVersion(document);

  let migratedDocument: unknown = document;
  let didMigrate = false;
  if (version !== APP_SCHEMA_VERSION) {
    const info = getMigrationInfo(version, APP_SCHEMA_VERSION);
    if (!info.canMigrate) {
      return {
        success: false,
        error: 'unsupported-version',
        message: `Protocol schema version ${version} cannot be migrated to ${APP_SCHEMA_VERSION}.`,
      };
    }
    try {
      migratedDocument = migrateProtocol(document, APP_SCHEMA_VERSION, {
        name: nameOverride ?? sourceName.replace(/\.netcanvas$/i, ''),
      });
      didMigrate = true;
    } catch (cause) {
      return {
        success: false,
        error: 'validation-failed',
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  const validation = await validateProtocol(
    migratedDocument as Parameters<typeof validateProtocol>[0],
  );
  if (!validation.success) {
    return {
      success: false,
      error: 'validation-failed',
      message: 'Protocol failed schema validation.',
      issues: validation.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }

  const validated = validation.data as CurrentProtocol;
  const hash = hashProtocol(validated);

  onProgress?.({ phase: 'saving' });

  try {
    await saveProtocol(validated, hash, assets);
  } catch (cause) {
    return {
      success: false,
      error: 'save-failed',
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }

  return { success: true, protocol: validated, hash, migrated: didMigrate };
}
```

Rewrite the existing `importFromBuffer` so, after `extractZip`, it delegates:

```ts
async function importFromBuffer(
  buffer: Uint8Array,
  sourceName: string,
  onProgress?: OnImportProgress,
  nameOverride?: string,
): Promise<ImportProtocolResult> {
  onProgress?.({ phase: 'extracting' });
  let extracted: { protocol: unknown; assets: ExtractedAsset[] };
  try {
    extracted = await extractZip(buffer);
  } catch (cause) {
    return {
      success: false,
      error: 'extract-failed',
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
  return importParsedProtocol(
    extracted.protocol,
    extracted.assets,
    sourceName,
    onProgress,
    nameOverride,
  );
}
```

Add the exported bundled entry point:

```ts
export function importBundledProtocol(
  bundled: { document: unknown; assets: ExtractedAsset[]; name: string },
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult> {
  onProgress?.({ phase: 'extracting' });
  return importParsedProtocol(
    bundled.document,
    bundled.assets,
    bundled.name,
    onProgress,
    bundled.name,
  );
}
```

In `apps/interviewer-v8/src/lib/protocol/useProtocolImport.ts`, replace the B1 stub sample branch in `run()` with a real bundled install, and import the loader + `importBundledProtocol`:

```ts
import {
  type ImportPhase,
  type ImportProgressEvent,
  type ImportProtocolResult,
  importBundledProtocol,
  importProtocolFromFile,
  peekProtocolName,
} from './importProtocol';
import { loadBundledSampleProtocol } from './bundledProtocols';
```

Sample branch body:

```ts
if (request.source === 'file') {
  result = await importProtocolFromFile(
    request.file,
    onProgress,
    peekedName ?? undefined,
  );
} else {
  const bundled = await loadBundledSampleProtocol();
  result = await importBundledProtocol(bundled, onProgress);
}
```

Leave the `sampleProtocolDismissed` bookkeeping and toasts unchanged.

Development-protocol gating (DEV only): wire `loadBundledDevelopmentProtocol` behind `import.meta.env.DEV` at its single call site. In `apps/interviewer-v8/src/routes/Home.tsx`, alongside `handleInstallSample`, add:

```ts
const handleInstallDevelopment = useCallback(() => {
  if (!import.meta.env.DEV) return;
  void startImport({ source: 'development' });
}, [startImport]);
```

and add a `{ source: 'development' }` member handled in `useProtocolImport.ts`'s `run()` (guarded by `import.meta.env.DEV`, calling `loadBundledDevelopmentProtocol()` → `importBundledProtocol`) plus `PendingImport['source']` gaining `'development'`. The dev-only trigger is rendered under an existing `import.meta.env.DEV` block in Home (a small "Install development protocol" button next to the deck); production builds tree-shake both the branch and the `@codaco/development-protocol` import via the DEV guard.

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/protocol/__tests__/bundledProtocols.test.ts src/lib/protocol/__tests__/useProtocolImport.test.ts && pnpm --filter @codaco/interviewer-v8 typecheck && pnpm knip`
      Expected: PASS — bundled install succeeds with `fetch` stubbed to throw and `saveProtocol` called once; typecheck clean; knip reports the two new protocol deps as used.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/package.json apps/interviewer-v8/src/lib/protocol/sampleProtocol.ts apps/interviewer-v8/src/lib/protocol/bundledProtocols.ts apps/interviewer-v8/src/lib/protocol/importProtocol.ts apps/interviewer-v8/src/lib/protocol/useProtocolImport.ts apps/interviewer-v8/src/routes/Home.tsx apps/interviewer-v8/src/lib/protocol/__tests__/bundledProtocols.test.ts pnpm-lock.yaml && git commit -m "feat(interviewer-v8): install bundled sample/development protocols offline, no network fetch"
```

---

### Task B3: Rework `download.ts` into `shareOrDownloadBlob` (Web Share + object-URL fallback)

Post-Phase-A baseline: `download.ts` is already web-only — a single object-URL
`<a download>` path returning `DownloadResult`, with no Electron/Capacitor branches
and no `@capacitor` imports. This task adds the Web Share path in front of that
fallback and renames the exported function to `shareOrDownloadBlob`, dropping the
now-unused `path?` from `DownloadResult`.

**Files:**

- Modify: `apps/interviewer-v8/src/lib/files/download.ts`
- Modify: `apps/interviewer-v8/src/lib/files/__tests__/download.test.ts`
- Modify: `apps/interviewer-v8/src/components/DataView/useSessionMutations.ts` (call the renamed function via the two-step gesture-safe flow)
- Modify: `apps/interviewer-v8/src/components/DataView/DataViewToolbar.tsx` (render the gesture-fresh "Save export" button)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:

```ts
export type DownloadResult = { saved: boolean };
export function shareOrDownloadBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DownloadResult>;
```

The prior export name (`downloadBlob`) is removed; update every consumer to `shareOrDownloadBlob`. The export flow in `useSessionMutations.ts` splits archive-build from share so `shareOrDownloadBlob` runs in a fresh user gesture.

- [ ] **Step 1: Write the failing test** — replace `apps/interviewer-v8/src/lib/files/__tests__/download.test.ts`. Mock only `navigator.share`/`navigator.canShare` (no electron/capacitor mocks). Cover: the share path is chosen when `navigator.canShare({files})` is true; the object-URL `<a download>` fallback is used when `canShare` is false or absent; and share cancellation (`AbortError`) → `saved:false`.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { shareOrDownloadBlob } from '../download';

function makeBlob() {
  return new Blob(['export-bytes'], { type: 'application/zip' });
}

describe('shareOrDownloadBlob (web)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shares via navigator.share when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { share, canShare });

    const result = await shareOrDownloadBlob(makeBlob(), 'export.zip');

    expect(canShare).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array) }),
    );
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.any(Array),
        title: 'export.zip',
      }),
    );
    expect(result).toEqual({ saved: true });
  });

  it('returns saved:false when the user cancels the share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const share = vi.fn().mockRejectedValue(abort);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { share, canShare });

    const result = await shareOrDownloadBlob(makeBlob(), 'export.zip');

    expect(result).toEqual({ saved: false });
  });

  it('falls back to an object-URL <a download> when canShare is false', async () => {
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(false) });
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const anchor = { href: '', download: '', click, remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(
      anchor as unknown as HTMLAnchorElement,
    );
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      (node) => node as never,
    );

    const result = await shareOrDownloadBlob(makeBlob(), 'export.zip');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('export.zip');
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });

  it('falls back when navigator has no canShare (older browsers)', async () => {
    vi.stubGlobal('navigator', {});
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(
      anchor as unknown as HTMLAnchorElement,
    );
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      (node) => node as never,
    );

    const result = await shareOrDownloadBlob(makeBlob(), 'export.zip');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/files/__tests__/download.test.ts`
      Expected: FAIL — `shareOrDownloadBlob` is not exported (only the post-Phase-A `downloadBlob` object-URL path exists), and that path ignores `navigator.canShare`, so the share-path test never calls `navigator.share`.

- [ ] **Step 3: Implement** — rewrite `apps/interviewer-v8/src/lib/files/download.ts` (no electron, no capacitor, no `@capacitor` imports):

```ts
export type DownloadResult = { saved: boolean };

// Shares or saves a Blob. Must be called from within a user gesture so
// Web Share / the download is allowed to proceed. Web Share is preferred when
// the platform can share files (iOS/Android/desktop Safari + Chrome), otherwise
// falls back to an object-URL <a download>.
export async function shareOrDownloadBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DownloadResult> {
  const file = new File([blob], suggestedName, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: suggestedName });
      return { saved: true };
    } catch (cause) {
      if (isShareCanceled(cause)) return { saved: false };
      throw cause;
    }
  }

  return downloadViaObjectUrl(blob, suggestedName);
}

function downloadViaObjectUrl(
  blob: Blob,
  suggestedName: string,
): DownloadResult {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved: true };
}

function isShareCanceled(cause: unknown): boolean {
  if (cause instanceof Error && cause.name === 'AbortError') return true;
  return /cancel/i.test(errorMessage(cause));
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'message' in cause &&
    typeof cause.message === 'string'
  ) {
    return cause.message;
  }
  return '';
}
```

Then update the export caller. In `apps/interviewer-v8/src/components/DataView/useSessionMutations.ts`, split the build from the share so `shareOrDownloadBlob` runs in a _fresh_ user gesture (share() must be called from a gesture that hasn't been consumed by the long-running archive build). Rename the import to `shareOrDownloadBlob` and split `handleExport` into build-then-share.

Before (the current single-step handler that shares inline):

```ts
import { downloadBlob } from '~/lib/files/download';

// …inside useSessionMutations:
const handleExport = useCallback(async () => {
  const authed = await stepUp();
  if (!authed) return;
  const { blob, fileName } = await runExport(selectedIds, protocol);
  await markSessionsExported(selectedIds);
  track({ type: 'ExportCompleted', count: selectedIds.length });
  const outcome = await downloadBlob(blob, fileName);
  if (outcome.saved) {
    toast.add({
      title: 'Export complete',
      description: fileName,
      variant: 'success',
    });
  }
}, [selectedIds, protocol, stepUp, markSessionsExported, track, toast]);

return { handleExport /* … */ };
```

After (build stores the archive in state; a separate gesture-fresh handler shares it):

```ts
import { shareOrDownloadBlob } from '~/lib/files/download';

// …inside useSessionMutations:
const [pendingShare, setPendingShare] = useState<{
  blob: Blob;
  fileName: string;
} | null>(null);

const handleExport = useCallback(async () => {
  const authed = await stepUp();
  if (!authed) return;
  const { blob, fileName } = await runExport(selectedIds, protocol);
  await markSessionsExported(selectedIds);
  track({ type: 'ExportCompleted', count: selectedIds.length });
  setPendingShare({ blob, fileName });
  toast.add({
    title: 'Archive ready',
    description: 'Tap Save to share or download the export.',
  });
}, [selectedIds, protocol, stepUp, markSessionsExported, track, toast]);

const handleShareReady = useCallback(async () => {
  if (!pendingShare) return;
  const { blob, fileName } = pendingShare;
  const outcome = await shareOrDownloadBlob(blob, fileName);
  setPendingShare(null);
  if (!outcome.saved) {
    toast.add({
      title: 'Export canceled',
      description: 'The archive was not saved.',
    });
    return;
  }
  toast.add({
    title: 'Export complete',
    description: fileName,
    variant: 'success',
  });
}, [pendingShare, toast]);

return { handleExport, handleShareReady, pendingShare /* … */ };
```

Then wire the gesture-fresh button in `apps/interviewer-v8/src/components/DataView/DataViewToolbar.tsx`. The toolbar already consumes `useSessionMutations`; destructure the two new values and render a "Save export" button when `pendingShare` is set.

Before (existing export button only):

```tsx
const { handleExport /* … */ } = useSessionMutations(/* … */);

// …in the returned toolbar JSX:
<Button onClick={handleExport}>Export</Button>;
```

After (add the gesture-fresh save button next to it):

```tsx
const { handleExport, handleShareReady, pendingShare /* … */ } =
  useSessionMutations(/* … */);

// …in the returned toolbar JSX:
<Button onClick={handleExport}>Export</Button>;
{
  pendingShare ? <Button onClick={handleShareReady}>Save export</Button> : null;
}
```

The "Save export" click is a distinct user gesture, so `navigator.share` fires inside its own gesture. (This two-step is required only because the archive build is async and long enough to invalidate the original click's gesture; keeping build and share on separate buttons guarantees the share call is gesture-fresh on iOS Safari.)

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/files/__tests__/download.test.ts && pnpm --filter @codaco/interviewer-v8 typecheck && pnpm knip`
      Expected: PASS — the share/fallback/cancel tests green; typecheck clean (no remaining `downloadBlob` references, `DownloadResult` has no `path`); knip clean.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/files/download.ts apps/interviewer-v8/src/lib/files/__tests__/download.test.ts apps/interviewer-v8/src/components/DataView/useSessionMutations.ts apps/interviewer-v8/src/components/DataView/DataViewToolbar.tsx && git commit -m "feat(interviewer-v8): shareOrDownloadBlob via Web Share with gesture-safe two-step export"
```

---

### Task B4: Relax `pickFile.ts` accept so `.netcanvas` is selectable in the iOS Files picker

**Files:**

- Modify: `apps/interviewer-v8/src/lib/files/pickFile.ts`
- Create: `apps/interviewer-v8/src/lib/files/__tests__/pickFile.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `pickProtocolFile` unchanged in signature (`Promise<PickedFile | null>`); the created `<input>` uses a permissive `accept` and relies on the existing post-selection zip validation in `importProtocol.ts` to reject non-protocol files.

Rationale: iOS Files greys out `.netcanvas` when `accept=".netcanvas,application/zip"` because it has no registered UTI for the extension and reports the file as `application/octet-stream`. An empty/omitted `accept` lets the user pick any file; `importFromBuffer`'s `extractZip` already rejects anything that is not a valid zip containing `protocol.json`, so no unsafe input reaches storage.

- [ ] **Step 1: Write the failing test** — `apps/interviewer-v8/src/lib/files/__tests__/pickFile.test.ts`. Assert the created input carries a permissive accept (does not force `application/zip`, which is what breaks iOS), and that a picked file resolves to `{ name, file }`.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pickProtocolFile } from '../pickFile';

describe('pickProtocolFile (browser input)', () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = document.createElement('input');
    vi.spyOn(input, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue(input);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not constrain accept to application/zip (breaks iOS Files picker)', async () => {
    const pending = pickProtocolFile();
    // accept must not force the zip mime; either empty or extension-only is fine.
    expect(input.accept).not.toContain('application/zip');
    // Resolve the pending promise so it doesn't leak.
    input.oncancel?.(new Event('cancel'));
    await pending;
  });

  it('resolves to the selected file', async () => {
    const file = new File([new Uint8Array()], 'study.netcanvas');
    const pending = pickProtocolFile();
    Object.defineProperty(input, 'files', { value: [file], writable: true });
    input.onchange?.(new Event('change'));
    await expect(pending).resolves.toEqual({
      name: 'study.netcanvas',
      file,
    });
  });

  it('resolves null on cancel', async () => {
    const pending = pickProtocolFile();
    input.oncancel?.(new Event('cancel'));
    await expect(pending).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/files/__tests__/pickFile.test.ts`
      Expected: FAIL — `input.accept` is currently `'.netcanvas,application/zip'`, so the `not.toContain('application/zip')` assertion fails.

- [ ] **Step 3: Implement** — in `apps/interviewer-v8/src/lib/files/pickFile.ts`, change the accept line so it no longer forces a mime the iOS picker can't match. Keep the extension hint (helps desktop pickers surface `.netcanvas` first) but drop `application/zip`:

```ts
// `.netcanvas` has no iOS UTI, so any mime constraint greys the file out in
// the Files picker. Hint the extension only and rely on post-selection zip
// validation (extractZip in importProtocol) to reject non-protocol files.
input.accept = '.netcanvas';
```

(The line replaces `input.accept = '.netcanvas,application/zip';`.)

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/files/__tests__/pickFile.test.ts && pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: PASS — accept no longer contains `application/zip`; selection/cancel resolve correctly; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/files/pickFile.ts apps/interviewer-v8/src/lib/files/__tests__/pickFile.test.ts && git commit -m "fix(interviewer-v8): relax file picker accept so .netcanvas is selectable on iOS"
```
