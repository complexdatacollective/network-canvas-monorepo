## Phase A: Native teardown (spec Workstream A)

This phase collapses the tri-target (Electron desktop / Capacitor tablet / web) app down to a single web target, deleting the Electron and Capacitor surfaces and the native storage/keystore stack **before** any crypto work begins. Every task obeys the global constraints in the plan header (no `any`, no `as`, no barrel files, no re-exports, oxlint/oxfmt, no changeset, TDD/frequent commits, single-user invariant). These are deletion/config tasks, so each uses a concrete verification command (`pnpm --filter @codaco/interviewer-v8 typecheck`, `... test`, `... build`, and `pnpm knip`) rather than a new unit test, and ends with a commit. Order matters: source branches are collapsed to `web` first (so the app keeps building at every step), then dead directories and dependencies are removed, then root workspace config is cleaned so `knip` stays green.

### Task A1: Collapse `platform.ts` to web-only and drop `electronAPI` typings

**Files:**

- Modify: `apps/interviewer-v8/src/lib/platform/platform.ts`
- Modify: `apps/interviewer-v8/src/global.d.ts`

**Interfaces:**

- Consumes: nothing (leaf module).
- Produces: `hostAppName: string` (the only surviving export). `isElectron` and `isCapacitor` are **removed** — later tasks in this phase delete every consumer, so no consumer of the removed exports may remain after Phase A completes. `window.electronAPI` is removed from the global `Window` type.

This task removes the two exports first so that the subsequent tasks' typecheck runs surface every remaining consumer as a hard error, giving a deterministic worklist. Because A2–A9 still reference `isElectron`/`isCapacitor` until they are individually collapsed, this task's own verification is scoped to the two files it edits plus a grep census; the app-wide typecheck goes green at Task A9.

- [ ] **Step 1: Verify current consumer census (baseline)**
      Run: `cd apps/interviewer-v8 && rg -l "isElectron|isCapacitor" src | sort`
      Expected: lists `src/App.tsx`, `src/components/SettingsDialog.tsx`, `src/components/SetupWizard/Step2MethodPicker.tsx`, `src/components/SetupWizardDialog.tsx`, `src/lib/analytics/nativePreference.ts`, `src/lib/auth/api.ts`, `src/lib/auth/useBiometric.ts`, `src/lib/auth/vaultMetadata.ts`, `src/lib/db/api.ts`, `src/lib/files/download.ts`, `src/lib/files/fetchFromUrl.ts`, `src/lib/files/pickFile.ts`, `src/lib/platform/storage.ts`, `src/lib/platform/useNavigationOrientation.ts`, `src/lib/protocol/importProtocol.ts`, `src/lib/update/checkForUpdate.ts`, and their `__tests__` — this is the worklist A2–A9 clear.

- [ ] **Step 2: Rewrite `platform.ts`**

```ts
// apps/interviewer-v8/src/lib/platform/platform.ts
// Interviewer-v8 is a web-only PWA. There is no longer an Electron or Capacitor
// host, so `hostAppName` is a fixed constant and no platform detection remains.
export const hostAppName = 'interviewer-v8';
```

- [ ] **Step 3: Remove `electronAPI` from `global.d.ts`**
      Delete, from `apps/interviewer-v8/src/global.d.ts`:
- the `import type { UpdateInfo } from './lib/update/types';` line (the `src/lib/update` tree is deleted in Task A8),
- the `AuthStatus` `mode` union members `'biometric-keystore'` and `'biometric-native'` — leave `'pin' | 'passphrase' | 'none'`,
- the entire `DbBridge`, `AuthBridge`, `SystemBridge`, `UpdateProgress`, `UpdateBridge`, and `ElectronAPI` type blocks,
- the `interface Window { electronAPI?: ElectronAPI }` declaration and its explanatory comment.

Keep the top `/// <reference types="vite/client" />`, `declare module '*.css';`, the `__APP_VERSION__` declaration, and the `WireAsset` / `WireAssetInput` global types (still referenced by the Dexie types). The file's remaining `declare global { … }` block should contain only `__APP_VERSION__`, `WireAsset`, and `WireAssetInput`.

- [ ] **Step 4: Verify the two edited files parse and the census shrank**
      Run: `cd apps/interviewer-v8 && rg "isElectron|isCapacitor|electronAPI" src/lib/platform/platform.ts src/global.d.ts`
      Expected: no matches (exit code 1) — both symbols are gone from these two files.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/platform/platform.ts apps/interviewer-v8/src/global.d.ts
git commit -m "refactor(interviewer-v8): collapse platform.ts to web-only; drop electronAPI types"
```

### Task A2: Collapse the DB facade to the Dexie repos

**Files:**

- Modify: `apps/interviewer-v8/src/lib/db/api.ts`
- Delete: `apps/interviewer-v8/src/lib/db/electron-protocols.ts`
- Delete: `apps/interviewer-v8/src/lib/db/electron-sessions.ts`
- Delete: `apps/interviewer-v8/src/lib/db/electron-settings.ts`

**Interfaces:**

- Consumes: the Dexie repos `src/lib/db/protocols.ts`, `src/lib/db/sessions.ts`, and `src/lib/db/db.ts` (`getSettings`/`updateSettings`) — all unchanged.
- Produces: `src/lib/db/api.ts` keeps its full exported surface (`listProtocols`, `getProtocolByHash`, `getProtocolsByHashes`, `saveProtocol`, `deleteProtocol`, `getProtocolAssets`, `getProtocolAsset`, `listSessions`, `querySessions`, `queryMatchingSessionIds`, `getSession`, `getSessionsByIds`, `createSession`, `updateSession`, `markSessionFinished`, `markSessionsExported`, `deleteSessions`, `countSyntheticSessions`, `deleteSyntheticSessions`, `getSettings`, `updateSettings`) with identical signatures, now delegating unconditionally to the Dexie repos. Phase D re-enters this file to insert the record-crypto boundary.

- [ ] **Step 1: Rewrite `api.ts` to route straight to Dexie**

```ts
// apps/interviewer-v8/src/lib/db/api.ts
import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import * as dexieSettings from './db';
import * as dexieProtocols from './protocols';
import * as dexieSessions from './sessions';
import type {
  ProtocolWithCounts,
  SessionQueryParams,
  SessionQueryResult,
  StoredAsset,
  StoredProtocol,
  StoredSession,
  StoredSessionLite,
  StoredSettings,
} from './types';

export async function listProtocols(): Promise<ProtocolWithCounts[]> {
  return dexieProtocols.listProtocols();
}

export async function getProtocolByHash(
  hash: string,
): Promise<StoredProtocol | undefined> {
  return dexieProtocols.getProtocolByHash(hash);
}

export async function getProtocolsByHashes(
  hashes: readonly string[],
): Promise<StoredProtocol[]> {
  return dexieProtocols.getProtocolsByHashes(hashes);
}

export async function saveProtocol(
  protocol: CurrentProtocol,
  hash: string,
  assets: { id: string; name: string; data: Blob | string }[],
): Promise<StoredProtocol> {
  return dexieProtocols.saveProtocol(protocol, hash, assets);
}

export async function deleteProtocol(hash: string): Promise<void> {
  return dexieProtocols.deleteProtocol(hash);
}

export async function getProtocolAssets(hash: string): Promise<StoredAsset[]> {
  return dexieProtocols.getProtocolAssets(hash);
}

export async function getProtocolAsset(
  hash: string,
  assetId: string,
): Promise<StoredAsset | undefined> {
  return dexieProtocols.getProtocolAsset(hash, assetId);
}

export async function listSessions(): Promise<StoredSessionLite[]> {
  return dexieSessions.listSessions();
}

export async function querySessions(
  params: SessionQueryParams,
): Promise<SessionQueryResult> {
  return dexieSessions.querySessions(params);
}

export async function queryMatchingSessionIds(
  params: SessionQueryParams,
): Promise<string[]> {
  return dexieSessions.queryMatchingSessionIds(params);
}

export async function getSession(
  id: string,
): Promise<StoredSession | undefined> {
  return dexieSessions.getSession(id);
}

export async function getSessionsByIds(
  ids: readonly string[],
): Promise<StoredSession[]> {
  return dexieSessions.getSessionsByIds(ids);
}

export async function createSession(args: {
  protocolHash: string;
  protocolName: string;
  caseId: string;
  initialNetwork: NcNetwork;
  isSynthetic?: boolean;
}): Promise<StoredSession> {
  return dexieSessions.createSession(args);
}

export async function updateSession(
  id: string,
  patch: Partial<StoredSession>,
): Promise<StoredSession | undefined> {
  return dexieSessions.updateSession(id, patch);
}

export async function markSessionFinished(id: string): Promise<void> {
  return dexieSessions.markSessionFinished(id);
}

export async function markSessionsExported(ids: string[]): Promise<void> {
  return dexieSessions.markSessionsExported(ids);
}

export async function deleteSessions(ids: string[]): Promise<void> {
  return dexieSessions.deleteSessions(ids);
}

export async function countSyntheticSessions(): Promise<number> {
  return dexieSessions.countSyntheticSessions();
}

export async function deleteSyntheticSessions(): Promise<number> {
  return dexieSessions.deleteSyntheticSessions();
}

export async function getSettings(): Promise<StoredSettings> {
  return dexieSettings.getSettings();
}

export async function updateSettings(
  patch: Partial<Omit<StoredSettings, 'id'>>,
): Promise<StoredSettings> {
  return dexieSettings.updateSettings(patch);
}
```

- [ ] **Step 2: Delete the Electron DB wrappers**

```bash
git rm apps/interviewer-v8/src/lib/db/electron-protocols.ts \
       apps/interviewer-v8/src/lib/db/electron-sessions.ts \
       apps/interviewer-v8/src/lib/db/electron-settings.ts
```

- [ ] **Step 3: Verify the db-facade unit tests still pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/db/__tests__`
      Expected: PASS — `defaultSettings.test.ts` and `sessions.test.ts` are Dexie-backed (fake-indexeddb) and never touched the electron path.

- [ ] **Step 4: Verify no dangling imports of the deleted modules**
      Run: `cd apps/interviewer-v8 && rg "electron-protocols|electron-sessions|electron-settings" src`
      Expected: no matches (exit code 1).

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/db/api.ts
git commit -m "refactor(interviewer-v8): route DB facade straight to Dexie repos"
```

### Task A3: Collapse `pickFile.ts`, `download.ts`, and `fetchFromUrl.ts` to the web path

**Files:**

- Modify: `apps/interviewer-v8/src/lib/files/pickFile.ts`
- Modify: `apps/interviewer-v8/src/lib/files/download.ts`
- Modify: `apps/interviewer-v8/src/lib/files/fetchFromUrl.ts`
- Modify: `apps/interviewer-v8/src/lib/files/__tests__/download.test.ts`

**Interfaces:**

- Consumes: `hostAppName` is not needed here; these modules previously imported `isElectron`/`isCapacitor` from `platform.ts` (removed in A1).
- Produces: `pickProtocolFile(): Promise<PickedFile | null>` (web `<input type=file>` path only). `downloadBlob(blob, suggestedName): Promise<DownloadResult>` where `DownloadResult = { saved: boolean; path?: string }` — object-URL `<a download>` path only. `fetchProtocolFromUrl(url): Promise<Uint8Array>` — plain `fetch` only. **Note:** the `download.ts` accept fix and the Web-Share `shareOrDownloadBlob` upgrade belong to Phase B; this task only removes the native arms.

- [ ] **Step 1: Rewrite `pickFile.ts`**

```ts
// apps/interviewer-v8/src/lib/files/pickFile.ts
export type PickedFile = {
  name: string;
  file: File;
};

export async function pickProtocolFile(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.netcanvas,application/zip';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, file } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
```

- [ ] **Step 2: Rewrite `download.ts`**

```ts
// apps/interviewer-v8/src/lib/files/download.ts
export type DownloadResult = {
  saved: boolean;
  path?: string;
};

export async function downloadBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DownloadResult> {
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
```

- [ ] **Step 3: Rewrite `fetchFromUrl.ts`**

```ts
// apps/interviewer-v8/src/lib/files/fetchFromUrl.ts
// Web-only: plain fetch applies and the user is responsible for hosting the
// protocol on a CORS-enabled origin.
export async function fetchProtocolFromUrl(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(
      `Server responded with ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}
```

- [ ] **Step 4: Rewrite `download.test.ts` for the web path**
      The existing test mocked the Capacitor share path (now deleted). Replace it with a jsdom-anchor test for the object-URL download.

```ts
// apps/interviewer-v8/src/lib/files/__tests__/download.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '../download';

function makeBlob() {
  return new Blob(['export-bytes'], { type: 'application/zip' });
}

describe('downloadBlob (web)', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('triggers an anchor download and reports saved', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const result = await downloadBlob(makeBlob(), 'network-canvas-export.zip');

    expect(result).toEqual({ saved: true });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('revokes the object URL after the anchor is clicked', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadBlob(makeBlob(), 'export.zip');
    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
```

- [ ] **Step 5: Run the files tests, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/files/__tests__`
      Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v8/src/lib/files/pickFile.ts \
        apps/interviewer-v8/src/lib/files/download.ts \
        apps/interviewer-v8/src/lib/files/fetchFromUrl.ts \
        apps/interviewer-v8/src/lib/files/__tests__/download.test.ts
git commit -m "refactor(interviewer-v8): collapse file open/save/fetch to web path"
```

### Task A4: Collapse remaining platform-branched modules (import, storage, orientation, analytics mirror)

**Files:**

- Modify: `apps/interviewer-v8/src/lib/protocol/importProtocol.ts`
- Modify: `apps/interviewer-v8/src/lib/platform/storage.ts`
- Delete: `apps/interviewer-v8/src/lib/platform/useNavigationOrientation.ts`
- Delete: `apps/interviewer-v8/src/lib/analytics/nativePreference.ts`
- Modify: `apps/interviewer-v8/src/lib/analytics/AnalyticsProvider.tsx`
- Modify: `apps/interviewer-v8/src/lib/analytics/config.ts`

**Interfaces:**

- Consumes: `fetchProtocolFromUrl` (A3), the Dexie facade (A2).
- Produces: `importProtocolFromUrl`/`importProtocolFromFile` unchanged in signature but web-only internally. `estimateStorage(): Promise<StorageEstimate>` and `formatBytes`/`requestPersistentStorage` unchanged. `useNavigationOrientation` is **removed** (its only value on web was `undefined`; the Shell derives orientation from the viewport itself). `writeNativeAnalyticsPreference` is **removed** (no native SDK to mirror into).

First confirm `useNavigationOrientation`'s consumers so their call sites are cleaned in the same task.

- [ ] **Step 1: Census the orientation consumers**
      Run: `cd apps/interviewer-v8 && rg -n "useNavigationOrientation" src`
      Expected: matches in `src/lib/platform/useNavigationOrientation.ts` (definition) and `src/routes/Interview.tsx` (the sole consumer, which passes the result as the Shell's `navigationOrientation` prop). Read `src/routes/Interview.tsx` to confirm the prop is optional (`NavigationOrientation | undefined`) before removing the hook.

- [ ] **Step 2: Collapse `importProtocol.ts`**
      In `apps/interviewer-v8/src/lib/protocol/importProtocol.ts`, remove `import { isCapacitor, isElectron } from '../platform/platform';` and rewrite the fetch branch in `importProtocolFromUrl` so the web streaming path is unconditional:

```ts
let buffer: Uint8Array;
try {
  // Web: stream the response so we can report determinate progress when
  // Content-Length is present.
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    return {
      success: false,
      error: 'fetch-failed',
      message: `Server responded with ${response.status} ${response.statusText}`,
    };
  }
  buffer = await readStreamedBuffer(response, onProgress);
} catch (cause) {
  return {
    success: false,
    error: 'fetch-failed',
    message: cause instanceof Error ? cause.message : String(cause),
  };
}
return importFromBuffer(
  buffer,
  deriveNameFromUrl(url),
  onProgress,
  nameOverride,
);
```

Then remove the now-unused `import { fetchProtocolFromUrl } from '../files/fetchFromUrl';` line **only if** `fetchProtocolFromUrl` is no longer referenced anywhere in the file (it isn't after this rewrite — grep to confirm: `rg "fetchProtocolFromUrl" src/lib/protocol/importProtocol.ts` returns nothing). `fetchProtocolFromUrl` remains exported from `fetchFromUrl.ts` for any other consumer; if the census in the final typecheck shows it is now entirely unused, knip will flag it — resolve that in A11 by deleting `fetchFromUrl.ts` if and only if it has zero consumers.

- [ ] **Step 3: Collapse `storage.ts` to the web estimate**

```ts
// apps/interviewer-v8/src/lib/platform/storage.ts
export type StorageEstimate = {
  usage: number | null;
  quota: number | null;
  // Derived quota - usage.
  free: number | null;
  percent: number | null;
};

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    const already = await navigator.storage.persisted?.();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function estimateStorage(): Promise<StorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: null, quota: null, free: null, percent: null };
  }
  try {
    const e = await navigator.storage.estimate();
    const usage = e.usage ?? null;
    const quota = e.quota ?? null;
    const free =
      usage !== null && quota !== null ? Math.max(0, quota - usage) : null;
    const percent =
      usage !== null && quota !== null && quota > 0
        ? (usage / quota) * 100
        : null;
    return { usage, quota, free, percent };
  } catch {
    return { usage: null, quota: null, free: null, percent: null };
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unitIndex]}`;
}
```

- [ ] **Step 4: Remove the orientation hook and its call site**
      Delete the file:

```bash
git rm apps/interviewer-v8/src/lib/platform/useNavigationOrientation.ts
```

In `src/routes/Interview.tsx`, remove the `import { useNavigationOrientation } from '~/lib/platform/useNavigationOrientation';` line, delete the `const navigationOrientation = useNavigationOrientation();` call, and remove the `navigationOrientation={navigationOrientation}` prop from the Shell element (the Shell prop is optional, so the Shell falls back to viewport-derived orientation on web).

- [ ] **Step 5: Remove the native analytics mirror**
      Delete the file:

```bash
git rm apps/interviewer-v8/src/lib/analytics/nativePreference.ts
```

In `src/lib/analytics/AnalyticsProvider.tsx`, remove `import { writeNativeAnalyticsPreference } from './nativePreference';` and both call sites (`void writeNativeAnalyticsPreference(settings.analyticsEnabled);` around the init effect and `await writeNativeAnalyticsPreference(next);` inside `setEnabled`). In `src/lib/analytics/config.ts`, remove the `NATIVE_ANALYTICS_PREF_KEY` export and its comment block (no consumer remains once `nativePreference.ts` is gone).

- [ ] **Step 6: Verify the affected unit tests pass and no dangling imports remain**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/protocol src/lib/platform && cd apps/interviewer-v8 && rg "useNavigationOrientation|writeNativeAnalyticsPreference|NATIVE_ANALYTICS_PREF_KEY" src`
      Expected: tests PASS; the `rg` prints no matches (exit code 1).

- [ ] **Step 7: Commit**

```bash
git add apps/interviewer-v8/src/lib/protocol/importProtocol.ts \
        apps/interviewer-v8/src/lib/platform/storage.ts \
        apps/interviewer-v8/src/lib/analytics/AnalyticsProvider.tsx \
        apps/interviewer-v8/src/lib/analytics/config.ts \
        apps/interviewer-v8/src/routes/Interview.tsx
git commit -m "refactor(interviewer-v8): collapse import/storage/orientation/analytics to web-only"
```

### Task A5: Collapse the auth API to the web verifier path; delete `electron.ts` and `biometricNative.ts`

**Files:**

- Modify: `apps/interviewer-v8/src/lib/auth/api.ts`
- Delete: `apps/interviewer-v8/src/lib/auth/electron.ts`
- Delete: `apps/interviewer-v8/src/lib/auth/biometricNative.ts`
- Delete: `apps/interviewer-v8/src/lib/auth/__tests__/biometricNative.test.ts`
- Modify: `apps/interviewer-v8/src/lib/auth/vaultMetadata.ts`
- Modify: `apps/interviewer-v8/src/lib/auth/useBiometric.ts`

**Interfaces:**

- Consumes: the surviving `validatePin`/`validatePassphrase`/`derivePinVerifier`/`derivePassphraseVerifier`/`constantTimeEqual` helpers already inside `api.ts`; `vaultMetadata` (localStorage adapter, Capacitor-free after this task); `db` from `../db/db`.
- Produces: `api.ts` keeps its **full** exported surface so `AuthContext.tsx` and the setup/lock/step-up components typecheck unchanged. The web PIN/passphrase/none verifier path is preserved intact (Phase E replaces this whole module with the real vault). The biometric-shaped exports (`isBiometricSupported`, `enrol`, `unlock`, `reEnrol`, `verifyBiometric`, `enrolWithBiometricNative`, `unlockWithBiometricNative`) survive **with the same signatures** but now unconditionally return the "not available" result on web — the scope note's "gate to unavailable". `vaultMetadata.ts` retains its `VaultMetadata` union (including the `'biometric-native'` variant, harmless localStorage typing) but drops all `@capacitor/*` imports and uses `localStorage` only.

- [ ] **Step 1: Rewrite `api.ts` — remove electron/capacitor arms, keep web verifier path**
      Full replacement:

```ts
// apps/interviewer-v8/src/lib/auth/api.ts
import { db } from '../db/db';
import * as vaultMetadata from './vaultMetadata';

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 32;
const PBKDF2_KEY_BYTES = 32;
const PIN_LENGTH = 8;

const BIOMETRIC_UNAVAILABLE = {
  ok: false,
  message: 'Biometric authentication is not available',
} as const;

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1)
    binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

// The unlock flag lives in sessionStorage, not a module variable: a page reload
// (F5, Vite HMR) wipes module state and would otherwise re-show the LockScreen
// on every dev save. sessionStorage clears when the tab is killed, matching the
// "re-lock on app close" requirement.
const WEB_UNLOCK_KEY = 'interviewer-v8:web-unlocked';

function readWebUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(WEB_UNLOCK_KEY) === '1';
}

function writeWebUnlocked(value: boolean): void {
  if (typeof window === 'undefined') return;
  if (value) {
    window.sessionStorage.setItem(WEB_UNLOCK_KEY, '1');
  } else {
    window.sessionStorage.removeItem(WEB_UNLOCK_KEY);
  }
}

function validatePin(
  pin: string,
): { ok: true } | { ok: false; message: string } {
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    return { ok: false, message: `PIN must be exactly ${PIN_LENGTH} digits` };
  }
  return { ok: true };
}

async function derivePinVerifier(
  pin: string,
  saltB64: string,
  iterations: number,
): Promise<string> {
  const salt = fromBase64(saltB64);
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    PBKDF2_KEY_BYTES * 8,
  );
  return toBase64(new Uint8Array(bits));
}

const PASSPHRASE_MIN_LENGTH = 12;
const PASSPHRASE_MIN_CLASSES = 3;

function countCharacterClasses(s: string): number {
  let n = 0;
  if (/[a-z]/.test(s)) n += 1;
  if (/[A-Z]/.test(s)) n += 1;
  if (/[0-9]/.test(s)) n += 1;
  if (/[^a-zA-Z0-9]/.test(s)) n += 1;
  return n;
}

function validatePassphrase(
  phrase: string,
): { ok: true } | { ok: false; message: string } {
  if (phrase.length < PASSPHRASE_MIN_LENGTH) {
    return {
      ok: false,
      message: `Passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters`,
    };
  }
  if (countCharacterClasses(phrase) < PASSPHRASE_MIN_CLASSES) {
    return {
      ok: false,
      message:
        'Passphrase must be stronger — combine uppercase, lowercase, numbers, and symbols',
    };
  }
  return { ok: true };
}

async function derivePassphraseVerifier(
  phrase: string,
  saltB64: string,
  iterations: number,
): Promise<string> {
  const salt = fromBase64(saltB64);
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    PBKDF2_KEY_BYTES * 8,
  );
  return toBase64(new Uint8Array(bits));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Biometric is not available on the web target. Phase E replaces this with
// WebAuthn-PRF enrolment/unlock.
export async function isBiometricSupported(): Promise<boolean> {
  return false;
}

export async function status(): Promise<AuthStatus> {
  const metadata = await vaultMetadata.read();
  if (!metadata) {
    return { configured: false, locked: false };
  }
  if (metadata.mode === 'pin') {
    return { configured: true, locked: !readWebUnlocked(), mode: 'pin' };
  }
  if (metadata.mode === 'passphrase') {
    return { configured: true, locked: !readWebUnlocked(), mode: 'passphrase' };
  }
  return { configured: true, locked: false, mode: 'none' };
}

export async function enrol(
  _signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  return BIOMETRIC_UNAVAILABLE;
}

export async function enrolWithoutLock(): Promise<{
  ok: boolean;
  message?: string;
}> {
  await vaultMetadata.writeNone();
  writeWebUnlocked(true);
  return { ok: true };
}

export async function enrolWithPin(
  pin: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePin(pin);
  if (!validation.ok) return validation;
  const salt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(salt);
  const saltB64 = toBase64(salt);
  const verifierB64 = await derivePinVerifier(pin, saltB64, PBKDF2_ITERATIONS);
  await vaultMetadata.writePin({
    kdfSaltB64: saltB64,
    kdfIterations: PBKDF2_ITERATIONS,
    verifierB64,
  });
  writeWebUnlocked(true);
  return { ok: true };
}

export async function enrolWithBiometricNative(): Promise<{
  ok: boolean;
  message?: string;
}> {
  return BIOMETRIC_UNAVAILABLE;
}

export async function unlockWithBiometricNative(): Promise<{
  ok: boolean;
  message?: string;
}> {
  return BIOMETRIC_UNAVAILABLE;
}

export async function unlock(
  _signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  return BIOMETRIC_UNAVAILABLE;
}

export async function unlockWithPin(
  pin: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePin(pin);
  if (!validation.ok) return validation;
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'pin') {
    return { ok: false, message: 'PIN is not configured on this device' };
  }
  const verifier = await derivePinVerifier(
    pin,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(verifier, metadata.verifierB64)) {
    return { ok: false, message: 'Incorrect PIN' };
  }
  writeWebUnlocked(true);
  return { ok: true };
}

export async function lock(): Promise<void> {
  writeWebUnlocked(false);
}

export async function reEnrol(
  _signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  return BIOMETRIC_UNAVAILABLE;
}

export async function reEnrolWithPin(args: {
  currentPin: string;
  nextPin: string;
}): Promise<{ ok: boolean; message?: string }> {
  const nextValidation = validatePin(args.nextPin);
  if (!nextValidation.ok) return nextValidation;
  const currentValidation = validatePin(args.currentPin);
  if (!currentValidation.ok)
    return { ok: false, message: 'Current PIN is incorrect' };
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'pin') {
    return { ok: false, message: 'PIN is not configured on this device' };
  }
  const currentVerifier = await derivePinVerifier(
    args.currentPin,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(currentVerifier, metadata.verifierB64)) {
    return { ok: false, message: 'Current PIN is incorrect' };
  }
  const nextSalt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(nextSalt);
  const nextSaltB64 = toBase64(nextSalt);
  const nextVerifierB64 = await derivePinVerifier(
    args.nextPin,
    nextSaltB64,
    PBKDF2_ITERATIONS,
  );
  await vaultMetadata.writePin({
    kdfSaltB64: nextSaltB64,
    kdfIterations: PBKDF2_ITERATIONS,
    verifierB64: nextVerifierB64,
  });
  writeWebUnlocked(true);
  return { ok: true };
}

export async function enrolWithPassphrase(
  phrase: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return validation;
  const salt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(salt);
  const saltB64 = toBase64(salt);
  const verifierB64 = await derivePassphraseVerifier(
    phrase,
    saltB64,
    PBKDF2_ITERATIONS,
  );
  await vaultMetadata.writePassphrase({
    kdfSaltB64: saltB64,
    kdfIterations: PBKDF2_ITERATIONS,
    verifierB64,
  });
  writeWebUnlocked(true);
  return { ok: true };
}

export async function unlockWithPassphrase(
  phrase: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return { ok: false, message: 'Incorrect passphrase' };
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'passphrase') {
    return {
      ok: false,
      message: 'Passphrase is not configured on this device',
    };
  }
  const verifier = await derivePassphraseVerifier(
    phrase,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(verifier, metadata.verifierB64)) {
    return { ok: false, message: 'Incorrect passphrase' };
  }
  writeWebUnlocked(true);
  return { ok: true };
}

export async function reEnrolWithPassphrase(args: {
  currentPhrase: string;
  nextPhrase: string;
}): Promise<{ ok: boolean; message?: string }> {
  const nextValidation = validatePassphrase(args.nextPhrase);
  if (!nextValidation.ok) return nextValidation;
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'passphrase') {
    return {
      ok: false,
      message: 'Passphrase is not configured on this device',
    };
  }
  const currentVerifier = await derivePassphraseVerifier(
    args.currentPhrase,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(currentVerifier, metadata.verifierB64)) {
    return { ok: false, message: 'Current passphrase is incorrect' };
  }
  const nextSalt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(nextSalt);
  const nextSaltB64 = toBase64(nextSalt);
  const nextVerifierB64 = await derivePassphraseVerifier(
    args.nextPhrase,
    nextSaltB64,
    PBKDF2_ITERATIONS,
  );
  await vaultMetadata.writePassphrase({
    kdfSaltB64: nextSaltB64,
    kdfIterations: PBKDF2_ITERATIONS,
    verifierB64: nextVerifierB64,
  });
  writeWebUnlocked(true);
  return { ok: true };
}

export async function verifyBiometric(
  _signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  return BIOMETRIC_UNAVAILABLE;
}

export async function verifyWithPin(
  pin: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePin(pin);
  if (!validation.ok) return { ok: false, message: 'Incorrect PIN' };
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'pin') {
    return { ok: false, message: 'PIN is not configured on this device' };
  }
  const verifier = await derivePinVerifier(
    pin,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(verifier, metadata.verifierB64)) {
    return { ok: false, message: 'Incorrect PIN' };
  }
  return { ok: true };
}

export async function verifyWithPassphrase(
  phrase: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return { ok: false, message: 'Incorrect passphrase' };
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'passphrase') {
    return {
      ok: false,
      message: 'Passphrase is not configured on this device',
    };
  }
  const verifier = await derivePassphraseVerifier(
    phrase,
    metadata.kdfSaltB64,
    metadata.kdfIterations,
  );
  if (!constantTimeEqual(verifier, metadata.verifierB64)) {
    return { ok: false, message: 'Incorrect passphrase' };
  }
  return { ok: true };
}

export async function revoke(): Promise<void> {
  // Order matters: drop the Dexie DB first, then clear metadata. If we fail
  // mid-revoke, leaving metadata behind keeps the install in a recoverable
  // "configured but locked" state instead of an orphaned DB without a vault.
  await db.delete({ disableAutoOpen: false });
  await vaultMetadata.clear();
  writeWebUnlocked(false);
}
```

- [ ] **Step 2: Delete the electron/biometric-native modules and the native test**

```bash
git rm apps/interviewer-v8/src/lib/auth/electron.ts \
       apps/interviewer-v8/src/lib/auth/biometricNative.ts \
       apps/interviewer-v8/src/lib/auth/__tests__/biometricNative.test.ts
```

- [ ] **Step 3: Drop Capacitor imports from `vaultMetadata.ts`**
      In `apps/interviewer-v8/src/lib/auth/vaultMetadata.ts`, remove:

```ts
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';

import { isCapacitor } from '../platform/platform';
```

Delete the `RESUME_WAIT_TIMEOUT_MS` constant, the `waitForNextResume()` helper, and the `readEntryFromPreferences()` helper. Replace `readEntry`/`writeEntry`/`removeEntry` with the localStorage-only variants:

```ts
function readEntry(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

function writeEntry(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

function removeEntry(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}
```

These are now synchronous. Update `read()` to drop the `await` on `readEntry` calls (it can remain `async` and return a `Promise` to keep every caller's `await vaultMetadata.read()` valid; inside, use `readEntry(KEY_MODE)` without `await`). `clear()` stays `async` but calls `removeEntry` synchronously in a loop: `for (const key of ALL_KEYS) removeEntry(key);`. Keep the `writePin`/`writeNone`/`writePassphrase`/`writeBiometricNative` functions `async` (callers `await` them) but drop the `Promise.all` around the now-synchronous writes. The `VaultMetadata` union and its `'biometric-native'` variant are retained (localStorage-only typing, no runtime cost).

- [ ] **Step 4: Collapse `useBiometric.ts`**
      `biometricNative.ts` is gone, so `useBiometric` can no longer import it. Rewrite:

```ts
// apps/interviewer-v8/src/lib/auth/useBiometric.ts
import { useEffect, useState } from 'react';

import { isBiometricSupported } from './api';

type BiometricState =
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: string };

const NO_HARDWARE_REASON = 'No biometric sensor available on this device';

export function useBiometric(): BiometricState {
  const [biometric, setBiometric] = useState<BiometricState>({
    status: 'checking',
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supported = await isBiometricSupported();
        if (!active) return;
        setBiometric(
          supported
            ? { status: 'available' }
            : { status: 'unavailable', reason: NO_HARDWARE_REASON },
        );
      } catch {
        if (!active) return;
        setBiometric({ status: 'unavailable', reason: NO_HARDWARE_REASON });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return biometric;
}
```

This keeps `Step2MethodPicker`'s `biometric.status === 'unavailable'` / `biometric.reason` usage valid and shows the biometric option as disabled — the scope note's "gate to unavailable" for the wizard. Phase E rewires `isBiometricSupported` to the real WebAuthn-PRF check.

- [ ] **Step 5: Run the auth unit tests, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__`
      Expected: PASS — `passphrase.test.ts`, `vaultMetadata.test.ts`, and `revoke.test.ts` all run the web path (`isElectron: false`), which is now the only path. The deleted `biometricNative.test.ts` no longer runs. The `passphrase.test.ts` and `Interview.test.tsx` still `vi.mock('../../platform/platform', …)` with `isElectron`/`isCapacitor` keys — those extra keys are inert (the factory return is not type-checked against the module) and the mocked module still exports `hostAppName`, so they remain valid.

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v8/src/lib/auth/api.ts \
        apps/interviewer-v8/src/lib/auth/vaultMetadata.ts \
        apps/interviewer-v8/src/lib/auth/useBiometric.ts
git commit -m "refactor(interviewer-v8): collapse auth API to web verifier path; remove native biometric"
```

### Task A6: Remove the `isElectron` chrome from `App.tsx`, `SettingsDialog.tsx`, and `SetupWizardDialog.tsx`

**Files:**

- Modify: `apps/interviewer-v8/src/App.tsx`
- Modify: `apps/interviewer-v8/src/components/SettingsDialog.tsx`
- Modify: `apps/interviewer-v8/src/components/SetupWizardDialog.tsx`

**Interfaces:**

- Consumes: nothing new; these three components imported `isElectron` from `platform.ts` (removed in A1).
- Produces: no signature changes — these are internal UI cleanups.

- [ ] **Step 1: `App.tsx` — drop the Electron titlebar drag strip**
      Remove `import { isElectron } from './lib/platform/platform';` and delete the `{isElectron && ( <div aria-hidden className="app-drag fixed inset-x-0 top-0 z-50 h-8" /> )}` block from the provider tree.

- [ ] **Step 2: `SettingsDialog.tsx` — drop the Electron `free` storage suffix**
      Remove `import { isElectron } from '~/lib/platform/platform';`. In the `storageLabel` computation, remove the `isElectron && storage.free !== null ? …` suffix so the label reads:

```ts
const storageLabel = storageHasValues
  ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}${
      storage.percent !== null ? ` (${storage.percent.toFixed(1)}%)` : ''
    }`
  : 'Unknown';
```

- [ ] **Step 3: `SetupWizardDialog.tsx` — make the "sandboxed" notice unconditional**
      Remove `import { isElectron } from '~/lib/platform/platform';`. The Secure Data Storage surface's `{!isElectron && ( <Alert …>…sandboxed by the operating system…</Alert> )}` block described the web/Capacitor at-rest story, which is now always true — remove the `!isElectron &&` guard so the Alert renders unconditionally (keep the `<Alert>` element and its copy verbatim).

- [ ] **Step 4: Verify no `isElectron` remains in these files**
      Run: `cd apps/interviewer-v8 && rg "isElectron" src/App.tsx src/components/SettingsDialog.tsx src/components/SetupWizardDialog.tsx`
      Expected: no matches (exit code 1).

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/App.tsx \
        apps/interviewer-v8/src/components/SettingsDialog.tsx \
        apps/interviewer-v8/src/components/SetupWizardDialog.tsx
git commit -m "refactor(interviewer-v8): remove Electron-only chrome from App/Settings/SetupWizard"
```

### Task A7: Rewire the SetupWizard biometric step to the web-unavailable path

**Files:**

- Modify: `apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.tsx`

**Interfaces:**

- Consumes: `authApi.enrol()` (now returns `BIOMETRIC_UNAVAILABLE` after A5), `authApi.status()`, `authApi.revoke()`.
- Produces: no signature changes. The `Step2MethodPicker` already disables the biometric option (via `useBiometric` → `unavailable` from A5), so `Step3BiometricConfigure` is unreachable on web in practice; this task removes its Capacitor branch so it typechecks and, if ever reached, surfaces the "not available" message honestly.

**Scope note (from the phase brief):** the SetupWizard biometric steps still reference native biometric. Phase A only makes them typecheck; Phase E rewires them to WebAuthn. This task delivers exactly that minimal gate.

- [ ] **Step 1: Remove the Capacitor arm from the enrolment `beforeNext`**
      In `apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.tsx`, remove `import { isCapacitor } from '~/lib/platform/platform';` and replace the platform-branched enrolment with the single web call:

```ts
// Web target: biometric enrolment is not available yet (Phase E adds
// WebAuthn-PRF). Step2MethodPicker already disables this option; if this
// step is reached, surface the unavailable message rather than branching.
const result = await authApi.enrol();

if (!result.ok) {
  setError(result.message ?? 'Biometric enrolment failed.');
  return false;
}

wizard.setStepData({ enrolmentCommitted: true });
return true;
```

- [ ] **Step 2: Verify no `isCapacitor`/`enrolWithBiometricNative` reference remains in the file**
      Run: `cd apps/interviewer-v8 && rg "isCapacitor|enrolWithBiometricNative" src/components/SetupWizard/Step3BiometricConfigure.tsx`
      Expected: no matches (exit code 1).

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.tsx
git commit -m "refactor(interviewer-v8): gate SetupWizard biometric step to web-unavailable"
```

### Task A8: Delete the legacy update system and its home-screen affordances

**Files:**

- Delete: `apps/interviewer-v8/src/lib/update/` (entire directory: `checkForUpdate.ts`, `devSimulation.ts`, `githubReleases.ts`, `storeUrls.ts`, `types.ts`, `useUpdateCheck.ts`, `version.ts`, and `__tests__/`)
- Delete: `apps/interviewer-v8/src/components/UpdateDialog.tsx`
- Modify: `apps/interviewer-v8/src/components/StatusRow.tsx`
- Modify: `apps/interviewer-v8/src/routes/Home.tsx`

**Interfaces:**

- Consumes: `APP_VERSION` from `~/lib/platform/appVersion` (kept, per scope).
- Produces: `StatusRow` loses its `availableUpdate`/`onOpenUpdate` props and always renders the version string. `Home.tsx` stops calling `useUpdateCheck`. The service-worker update UX arrives in Phase F.

- [ ] **Step 1: Delete the update tree and dialog**

```bash
git rm -r apps/interviewer-v8/src/lib/update
git rm apps/interviewer-v8/src/components/UpdateDialog.tsx
```

- [ ] **Step 2: Simplify `StatusRow.tsx`**

```tsx
// apps/interviewer-v8/src/components/StatusRow.tsx
import { motion } from 'motion/react';
import { Link } from 'wouter';

import { APP_VERSION } from '~/lib/platform/appVersion';

type StatusRowProps = {
  protocolCount: number;
  interviewCount: number;
};

const variants = {
  hidden: { opacity: 0, y: '100%' },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 26 },
  },
  // Tween instead of motion's default unbounded spring: a y: '100%' exit with
  // the default spring settled in ~1.5s, which made AnimatePresence mode="wait"
  // hold up the data view's enter.
  exit: {
    opacity: 0,
    y: '100%',
    transition: { duration: 0.25, ease: 'easeIn' },
  },
} as const;

export function StatusRow({ protocolCount, interviewCount }: StatusRowProps) {
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
      <span>Interviewer {APP_VERSION}</span>
    </motion.div>
  );
}
```

- [ ] **Step 3: Drop the update wiring from `Home.tsx`**
      Remove `import { useUpdateCheck } from '~/lib/update/useUpdateCheck';`, delete the `const { availableUpdate, openUpdateDialog } = useUpdateCheck();` line, and change the `<StatusRow>` usage to:

```tsx
<StatusRow protocolCount={protocols.length} interviewCount={sessions.length} />
```

- [ ] **Step 4: Verify nothing still imports the update tree**
      Run: `cd apps/interviewer-v8 && rg "lib/update|UpdateDialog|useUpdateCheck|availableUpdate|onOpenUpdate" src`
      Expected: no matches (exit code 1).

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/StatusRow.tsx apps/interviewer-v8/src/routes/Home.tsx
git commit -m "refactor(interviewer-v8): remove legacy update system and home-screen update affordance"
```

### Task A9: Delete the Electron and Capacitor surfaces and their build config

**Files:**

- Delete: `apps/interviewer-v8/electron/` (directory)
- Delete: `apps/interviewer-v8/electron.vite.config.ts`
- Delete: `apps/interviewer-v8/electron-builder.config.cjs`
- Delete: `apps/interviewer-v8/build-resources/` (directory)
- Delete: `apps/interviewer-v8/capacitor.config.ts`
- Delete: `apps/interviewer-v8/android/` (directory)
- Delete: `apps/interviewer-v8/ios/` (directory)
- Delete: `apps/interviewer-v8/scripts/cap-dev.mjs`
- Delete: `apps/interviewer-v8/scripts/sync-platform-versions.mjs`
- Delete: `apps/interviewer-v8/scripts/add-ios-app-icon.mjs`
- Modify: `apps/interviewer-v8/tsconfig.app.json`
- Modify: `apps/interviewer-v8/tsconfig.node.json`

**Interfaces:**

- Consumes: nothing — all renderer references to these surfaces were removed in A1–A8.
- Produces: the app is now a single-target Vite web app. `tsconfig.node.json` covers only `vite.config.ts` and `vite.renderer.config.ts`; `tsconfig.app.json` no longer needs to exclude `electron`.

- [ ] **Step 1: Delete the native surfaces and their config/scripts**

```bash
git rm -r apps/interviewer-v8/electron \
          apps/interviewer-v8/build-resources \
          apps/interviewer-v8/android \
          apps/interviewer-v8/ios
git rm apps/interviewer-v8/electron.vite.config.ts \
       apps/interviewer-v8/electron-builder.config.cjs \
       apps/interviewer-v8/capacitor.config.ts \
       apps/interviewer-v8/scripts/cap-dev.mjs \
       apps/interviewer-v8/scripts/sync-platform-versions.mjs \
       apps/interviewer-v8/scripts/add-ios-app-icon.mjs
```

- [ ] **Step 2: Trim `tsconfig.node.json` to the web build config only**

```jsonc
// apps/interviewer-v8/tsconfig.node.json
{
  "extends": "@codaco/tsconfig/node.json",
  "include": ["vite.config.ts", "vite.renderer.config.ts"],
}
```

- [ ] **Step 3: Drop the `electron` exclude from `tsconfig.app.json`**
      Change the `exclude` array from `["node_modules", "dist", "electron"]` to `["node_modules", "dist"]`. Leave the rest of the file unchanged.

- [ ] **Step 4: Verify the app typechecks and builds green**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck && pnpm --filter @codaco/interviewer-v8 test`
      Expected: PASS — no `TS` errors (every `isElectron`/`isCapacitor`/`electronAPI`/`lib/update` consumer has been collapsed across A1–A8) and all unit tests green.

Run: `pnpm --filter @codaco/interviewer-v8 build`
Expected: `vite build` completes, emitting `dist/index.html` and the hashed asset bundle, with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/tsconfig.app.json apps/interviewer-v8/tsconfig.node.json
git commit -m "chore(interviewer-v8): delete Electron and Capacitor surfaces and build config"
```

### Task A10: Remove native dependencies and scripts from the app `package.json`

**Files:**

- Modify: `apps/interviewer-v8/package.json`

**Interfaces:**

- Consumes: nothing — every importer of these packages was removed in A1–A9.
- Produces: a web-only manifest: no `main` field, no `electron:*`/`capacitor:*`/`assets:generate-*`/`version:sync` scripts, and no Electron/Capacitor/SQLCipher/biometric-keystore dependencies.

- [ ] **Step 1: Remove the `main` field and native scripts**
      In `apps/interviewer-v8/package.json`:
- delete `"main": "dist-electron/main/index.cjs",`
- from `scripts`, delete `version:sync`, `electron:dev`, `electron:build`, `electron:rebuild-deps`, `electron:dist`, `electron:dist:mac`, `electron:dist:mac:local`, `electron:dist:win`, `electron:dist:linux`, `capacitor:sync`, `capacitor:add:ios`, `capacitor:add:android`, `capacitor:open:ios`, `capacitor:open:android`, `capacitor:run:ios`, `capacitor:run:android`, `capacitor:dev:android`, `capacitor:dev:ios`, `assets:generate-inputs`, `assets:generate-android`, `assets:generate-ios`, `assets:generate-all`, and `capacitor:sync:before`. Keep `dev`, `build`, `preview`, `typecheck`, `test`, `test:watch`, `test:storybook`, `storybook`, `build-storybook`, `chromatic`.

- [ ] **Step 2: Remove native dependencies**
      From `dependencies`, delete: `@aparajita/capacitor-biometric-auth`, `@capacitor/android`, `@capacitor/app`, `@capacitor/core`, `@capacitor/filesystem`, `@capacitor/ios`, `@capacitor/keyboard`, `@capacitor/preferences`, `@capacitor/share`, `@codaco/biometric-keystore`, `better-sqlite3-multiple-ciphers`, `electron-updater`.
      From `devDependencies`, delete: `@capacitor/assets`, `@capacitor/cli`, `electron`, `electron-builder`, `electron-vite`, `png-to-ico`, `sharp`, `xcode`. (`png-to-ico`, `sharp`, and `xcode` were used only by the deleted icon/asset generation scripts.)

- [ ] **Step 3: Reinstall so the lockfile drops the removed packages**
      Run: `pnpm install`
      Expected: completes; `pnpm-lock.yaml` no longer lists `electron`, `electron-vite`, `electron-builder`, `electron-updater`, `better-sqlite3-multiple-ciphers`, `@codaco/biometric-keystore`, or the `@capacitor/*` packages for `apps/interviewer-v8`.

- [ ] **Step 4: Verify the app still typechecks and builds without the native deps**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck && pnpm --filter @codaco/interviewer-v8 build`
      Expected: PASS / build exit code 0.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/package.json pnpm-lock.yaml
git commit -m "chore(interviewer-v8): drop Electron, Capacitor, SQLCipher and biometric-keystore deps"
```

### Task A11: Delete the `@codaco/biometric-keystore` workspace package and clean root workspace config

**Files:**

- Delete: `packages/biometric-keystore/` (directory)
- Delete: `patches/better-sqlite3-multiple-ciphers@12.9.0.patch`
- Modify: `pnpm-workspace.yaml`
- Modify: `knip.json`
- Modify: `turbo.json`
- Conditionally delete: `apps/interviewer-v8/src/lib/files/fetchFromUrl.ts` (only if now unused — see Step 1)

**Interfaces:**

- Consumes: nothing — the app's `@codaco/biometric-keystore` and `better-sqlite3-multiple-ciphers` dependencies were removed in A10, so no workspace consumer remains.
- Produces: a workspace with no biometric-keystore package, no SQLCipher patch, and root config (`pnpm-workspace.yaml`, `knip.json`, `turbo.json`) with no dangling references. `pnpm knip` passes.

- [ ] **Step 1: Confirm `@codaco/biometric-keystore` has no remaining consumers, and resolve `fetchFromUrl.ts`**
      Run: `cd /Users/jmh629/Projects/network-canvas/.claude/worktrees/dreamy-wescoff-6d158d && rg -l "@codaco/biometric-keystore|better-sqlite3-multiple-ciphers" --glob '!pnpm-lock.yaml' --glob '!packages/biometric-keystore/**' && rg -l "fetchProtocolFromUrl" apps/interviewer-v8/src`
      Expected: the first pattern matches only root config files about to be edited (`pnpm-workspace.yaml`, `turbo.json`, `knip.json` if present) — no source imports. For the second: if `fetchProtocolFromUrl` has **zero** matches (importProtocol.ts stopped calling it in A4), delete the now-dead module and its test in this step:

```bash
git rm apps/interviewer-v8/src/lib/files/fetchFromUrl.ts
# also remove any fetchFromUrl-specific test file if one exists
```

If it still has a consumer, leave the file in place.

- [ ] **Step 2: Delete the package and the SQLCipher patch**

```bash
git rm -r packages/biometric-keystore
git rm patches/better-sqlite3-multiple-ciphers@12.9.0.patch
```

- [ ] **Step 3: Clean `pnpm-workspace.yaml`**
      In `pnpm-workspace.yaml`:
- from `allowBuilds`, remove the `electron: false`, `electron-winstaller: false`, and `better-sqlite3-multiple-ciphers: true` entries,
- from the `catalog`, remove the `@capacitor/*` entries (`@capacitor/android`, `@capacitor/app`, `@capacitor/assets`, `@capacitor/browser`, `@capacitor/cli`, `@capacitor/core`, `@capacitor/device`, `@capacitor/filesystem`, `@capacitor/ios`, `@capacitor/share`, `@capawesome/capacitor-file-picker`) and the `electron`, `electron-builder`, `electron-vite` entries — **but only if no other workspace package still references them.** First check: `rg -l "catalog:" apps/*/package.json packages/*/package.json | xargs rg -l "@capacitor|electron"`. The legacy `apps/interviewer` and `apps/architect` pin Electron/Capacitor via their own `package.json` version ranges (not the catalog), so removing the catalog entries is safe **only** for entries no consumer resolves through `catalog:`. If a legacy app resolves any of these via `catalog:`, leave that entry. Remove the entire `patchedDependencies` block (its only entry was the deleted SQLCipher patch).

- [ ] **Step 4: Clean `knip.json`**
      In `knip.json`, under `workspaces["apps/interviewer-v8"]`:
- remove `"electron.vite.config.ts"`, `"electron-builder.config.cjs"`, `"electron/main.ts"`, and `"electron/preload.ts"` from `entry` (leaving `"index.html!"` and `"vite.renderer.config.ts"`),
- change `project` from `["src/**/*.{ts,tsx}", "electron/**/*.ts"]` to `["src/**/*.{ts,tsx}"]`.

There is no biometric-keystore or Capacitor-SPM `ignoreDependencies` entry under the `apps/interviewer-v8` workspace (those live under the legacy `apps/interviewer` block, which is unchanged), so no other edit is needed here.

- [ ] **Step 5: Clean `turbo.json`**
      In `turbo.json`, delete the four now-orphaned task blocks: `"@codaco/biometric-keystore#build"`, `"@codaco/interviewer-v8#electron:build"`, `"@codaco/interviewer-v8#electron:rebuild-deps"`, and `"@codaco/interviewer-v8#electron:dev"`. The generic `build`, `dev`, `test`, and `typecheck` task definitions remain and now cover the web-only app.

- [ ] **Step 6: Reinstall and verify workspace integrity + knip**
      Run: `cd /Users/jmh629/Projects/network-canvas/.claude/worktrees/dreamy-wescoff-6d158d && pnpm install && pnpm knip`
      Expected: `pnpm install` completes with no missing-workspace-package error; `pnpm knip` reports no unused files, unlisted/unused dependencies, or unresolved entries for `apps/interviewer-v8`.

- [ ] **Step 7: Verify the whole app still typechecks, tests, and builds**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck && pnpm --filter @codaco/interviewer-v8 test && pnpm --filter @codaco/interviewer-v8 build`
      Expected: typecheck PASS, tests PASS, build exit code 0. This is the Phase A exit gate: a green web-only app with no Electron/Capacitor/native storage remaining.

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml knip.json turbo.json pnpm-lock.yaml
git commit -m "chore: remove biometric-keystore package and native workspace config"
```

I've completed the Phase A section. Here is a summary of what I produced and the load-bearing facts my tasks rely on.

The section (returned above as markdown) contains 11 right-sized tasks (A1–A11) that collapse interviewer-v8 from a tri-target app to web-only, in build-safe order: collapse source platform branches first (A1–A8), then delete the native directories/config (A9), then drop deps (A10), then remove the workspace package and clean root config (A11). Each task ends with the required verification command(s) and a commit.

Key repo facts I verified and encoded into the tasks (absolute paths):

- `apps/interviewer-v8/src/lib/platform/platform.ts` exports `isElectron`, `isCapacitor`, `hostAppName`; the full consumer census is the 16 source files + tests I listed in A1 Step 1.
- The DB facade `apps/interviewer-v8/src/lib/db/api.ts` branches on `isElectron` into `electron-{protocols,sessions,settings}.ts`; the Dexie repos (`protocols.ts`, `sessions.ts`, `db.ts`) are the unconditional targets.
- `apps/interviewer-v8/src/lib/auth/api.ts` holds the reusable `validatePin`/`validatePassphrase`/`derivePinVerifier`/`derivePassphraseVerifier`/`constantTimeEqual` helpers; the contract file says Phase E moves base64 helpers to `vault/crypto.ts`, so A5 keeps them in place and preserves the full export surface consumed by `AuthContext.tsx`, `LockScreen.tsx`, `StepUpAuthDialog.tsx`, and the SetupWizard steps.
- `vaultMetadata.ts` imports `@capacitor/app` + `@capacitor/preferences` (must be dropped in A5); `useBiometric.ts` and `Step3BiometricConfigure.tsx` import the deleted `biometricNative.ts` (rewired in A5/A7).
- Files with native branches NOT in the original enumerated list but which import removed symbols/deps — `importProtocol.ts`, `storage.ts`, `useNavigationOrientation.ts`, `nativePreference.ts`/`AnalyticsProvider.tsx`/`config.ts` (Capacitor), `download.test.ts`/`checkForUpdate.test.ts`/`biometricNative.test.ts` — are handled so every task ends green (A3, A4, A5, A8).
- Root config touch-points: `pnpm-workspace.yaml` (allowBuilds/catalog/patchedDependencies), `knip.json` (`apps/interviewer-v8` entry/project only — the Capacitor-SPM ignore lives under legacy `apps/interviewer`, not interviewer-v8), `turbo.json` (4 orphaned task blocks), and `patches/better-sqlite3-multiple-ciphers@12.9.0.patch`.

One judgment call flagged inside the tasks: the phase brief said to drop a "Capacitor-SPM ignore" from interviewer-v8's knip block, but that ignore actually lives under the legacy `apps/interviewer` workspace (unchanged here) — A11 Step 4 notes this so the writer/executor doesn't hunt for a non-existent entry. A11 Steps 3 also guards catalog-entry removal behind a consumer check, since legacy `apps/interviewer`/`apps/architect` may resolve Electron/Capacitor ranges.
