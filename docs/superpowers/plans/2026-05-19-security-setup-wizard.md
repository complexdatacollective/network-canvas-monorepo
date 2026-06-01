# Security Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/interviewer-v7`'s single-screen `SetupScreen` with a multi-step `SetupWizardDialog` (fresco-ui Dialog over a branded backdrop), add `passphrase` and `biometric-native` auth modes, add two new step-up auth toggles (`requireUnlockOnResume`, `requireUnlockOnExport`), and wire step-up into the Interview-resume and Export flows.

**Architecture:** Five auth modes (`webauthn`, `biometric-native`, `pin`, `passphrase`, `none`), never combined. PIN and passphrase share a PBKDF2-HMAC-SHA256 / 600 000-iteration KDF on both renderer (verifier path) and Electron main (envelope-encryption path that wraps the SQLCipher DEK). `biometric-native` is Capacitor-only and is a pure gate (no key derivation — at-rest protection lives in the OS sandbox). The wizard is dismissible; any dismissal routes through a platform-aware `SkipConfirmation` sub-dialog that revokes any committed vault and enrols `mode: none`. Step-up auth runs in an embedded `StepUpAuthDialog` that calls new `verify*` IPC channels — the global `AuthGate` state stays `unlocked` throughout. The app is in development, so schemas change in place — no migrations.

**Tech Stack:** React 19, TypeScript, Vitest, fresco-ui (`useWizard`, `useWizardState`, `RichSelectGroup`, `PasswordField`, `Alert`, `Switch`, `Dialog`), Capacitor 8, `@aparajita/capacitor-biometric-auth`, Electron with `better-sqlite3-multiple-ciphers`, Web Crypto API (`PBKDF2`, `AES-GCM`).

**Spec:** `docs/superpowers/specs/2026-05-19-security-setup-wizard-design.md`

---

## Phase 0 — Dependency & platform plumbing

### Task 1: Add biometric plugin dependency + native config

**Files:**

- Modify: `apps/interviewer-v7/package.json`
- Modify: `apps/interviewer-v7/ios/App/App/Info.plist`
- Modify: `apps/interviewer-v7/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Add the plugin to `dependencies` in `apps/interviewer-v7/package.json`**

Locate the existing `@capacitor/*` block (alphabetised). Add:

```json
"@aparajita/capacitor-biometric-auth": "^9.0.0",
```

Confirm the exact latest 9.x major against npm during the run; the API used here is `BiometricAuth.checkBiometry()` (returns `{ isAvailable, biometryType, reason }`) and `BiometricAuth.authenticate({ reason, allowDeviceCredential })`.

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: lockfile updates, no errors.

- [ ] **Step 3: Add iOS Face ID usage description**

Open `apps/interviewer-v7/ios/App/App/Info.plist`. Inside the top-level `<dict>`, add:

```xml
<key>NSFaceIDUsageDescription</key>
<string>Used to unlock the Network Canvas Interviewer on this device.</string>
```

- [ ] **Step 4: Add Android USE_BIOMETRIC permission**

Open `apps/interviewer-v7/android/app/src/main/AndroidManifest.xml`. Above the `<application>` element, add:

```xml
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
```

- [ ] **Step 5: Sync Capacitor**

```bash
pnpm --filter @codaco/interviewer-v7 capacitor:sync
```

Expected: plugin appears in both iOS and Android sync output.

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v7/package.json apps/interviewer-v7/ios apps/interviewer-v7/android pnpm-lock.yaml
git commit -m "feat(interviewer-v7): add biometric-auth Capacitor plugin and native config"
```

---

## Phase 1 — Auth model & types (renderer, no UI yet)

### Task 2: Extend `VaultMetadata` union with `passphrase` and `biometric-native`

**Files:**

- Modify: `apps/interviewer-v7/src/lib/auth/vaultMetadata.ts`
- Create: `apps/interviewer-v7/src/lib/auth/__tests__/vaultMetadata.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/interviewer-v7/src/lib/auth/__tests__/vaultMetadata.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as vaultMetadata from '../vaultMetadata';

describe('vaultMetadata passphrase variant', () => {
  beforeEach(async () => {
    await vaultMetadata.clear();
  });
  afterEach(async () => {
    await vaultMetadata.clear();
  });

  it('writes and reads a passphrase record', async () => {
    await vaultMetadata.writePassphrase({
      kdfSaltB64: 'salt-base64',
      kdfIterations: 600_000,
      verifierB64: 'verifier-base64',
    });
    const record = await vaultMetadata.read();
    expect(record?.mode).toBe('passphrase');
    if (record?.mode === 'passphrase') {
      expect(record.kdfSaltB64).toBe('salt-base64');
      expect(record.kdfIterations).toBe(600_000);
      expect(record.verifierB64).toBe('verifier-base64');
      expect(record.enrolledAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    }
  });
});

describe('vaultMetadata biometric-native variant', () => {
  beforeEach(async () => {
    await vaultMetadata.clear();
  });
  afterEach(async () => {
    await vaultMetadata.clear();
  });

  it('writes and reads a biometric-native record', async () => {
    await vaultMetadata.writeBiometricNative();
    const record = await vaultMetadata.read();
    expect(record?.mode).toBe('biometric-native');
    if (record?.mode === 'biometric-native') {
      expect(record.enrolledAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @codaco/interviewer-v7 test -- vaultMetadata.test.ts
```

Expected: FAIL — `writePassphrase`/`writeBiometricNative` not exported.

- [ ] **Step 3: Extend `vaultMetadata.ts`**

Replace the `VaultMetadata` type:

```ts
export type VaultMetadata =
  | {
      mode: 'webauthn';
      credentialIdB64: string;
      saltB64: string;
      enrolledAt: string;
    }
  | {
      mode: 'biometric-native';
      enrolledAt: string;
    }
  | {
      mode: 'pin';
      kdfSaltB64: string;
      kdfIterations: number;
      verifierB64: string;
      enrolledAt: string;
    }
  | {
      mode: 'passphrase';
      kdfSaltB64: string;
      kdfIterations: number;
      verifierB64: string;
      enrolledAt: string;
    }
  | {
      mode: 'none';
      enrolledAt: string;
    };
```

In `read()`, after the existing `'pin'` branch and before the `webauthn` fallthrough, add:

```ts
if (mode === 'passphrase') {
  const [kdfSaltB64, kdfIterationsRaw, verifierB64] = await Promise.all([
    readEntry(KEY_KDF_SALT),
    readEntry(KEY_KDF_ITERATIONS),
    readEntry(KEY_VERIFIER),
  ]);
  if (!kdfSaltB64 || !kdfIterationsRaw || !verifierB64) return null;
  const kdfIterations = Number.parseInt(kdfIterationsRaw, 10);
  if (!Number.isFinite(kdfIterations) || kdfIterations <= 0) return null;
  return {
    mode: 'passphrase',
    kdfSaltB64,
    kdfIterations,
    verifierB64,
    enrolledAt,
  };
}

if (mode === 'biometric-native') {
  return { mode: 'biometric-native', enrolledAt };
}
```

Add two new exported writers at the end of the file (next to `writeNone`):

```ts
export async function writePassphrase(args: {
  kdfSaltB64: string;
  kdfIterations: number;
  verifierB64: string;
}): Promise<void> {
  const enrolledAt = new Date().toISOString();
  await clear();
  await Promise.all([
    writeEntry(KEY_MODE, 'passphrase'),
    writeEntry(KEY_KDF_SALT, args.kdfSaltB64),
    writeEntry(KEY_KDF_ITERATIONS, String(args.kdfIterations)),
    writeEntry(KEY_VERIFIER, args.verifierB64),
    writeEntry(KEY_ENROLLED_AT, enrolledAt),
  ]);
}

export async function writeBiometricNative(): Promise<void> {
  const enrolledAt = new Date().toISOString();
  await clear();
  await Promise.all([
    writeEntry(KEY_MODE, 'biometric-native'),
    writeEntry(KEY_ENROLLED_AT, enrolledAt),
  ]);
}
```

(The shared `KEY_KDF_SALT`/`KEY_KDF_ITERATIONS`/`KEY_VERIFIER` keys are reused — the discriminator is `KEY_MODE`.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @codaco/interviewer-v7 test -- vaultMetadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
```

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v7/src/lib/auth/vaultMetadata.ts apps/interviewer-v7/src/lib/auth/__tests__/vaultMetadata.test.ts
git commit -m "feat(interviewer-v7): add passphrase + biometric-native variants to VaultMetadata"
```

---

### Task 3: Extend `AuthStatus` and ambient `electronAPI` typings

**Files:**

- Modify: `apps/interviewer-v7/src/lib/auth/AuthContext.tsx`
- Modify: `apps/interviewer-v7/src/global.d.ts`

- [ ] **Step 1: Read existing `AuthStatus` and `AuthState`**

```bash
grep -n "type AuthStatus\|type AuthState\|AuthStateKind" apps/interviewer-v7/src/lib/auth/AuthContext.tsx
```

- [ ] **Step 2: Extend `AuthStatus['mode']` and `AuthState`**

In `apps/interviewer-v7/src/lib/auth/AuthContext.tsx`, update every union that lists modes to include the two new modes:

```ts
type AuthMode = 'webauthn' | 'biometric-native' | 'pin' | 'passphrase' | 'none';
```

If the file uses inline `'webauthn' | 'pin' | 'none'` unions, replace each with the `AuthMode` alias (define it near the existing `AuthStatus`/`AuthState` types).

Apply the same expansion to:

- The `mode?: ...` field on the renderer's `AuthStatus` type.
- The `mode: ...` field on the unlocked `AuthState` variant.

- [ ] **Step 3: Extend `global.d.ts` electronAPI surface**

In `apps/interviewer-v7/src/global.d.ts`, the `auth.status()` IPC return type should accept the two new modes wherever it lists `'webauthn' | 'pin' | 'none'`. Update to:

```ts
mode?: 'webauthn' | 'biometric-native' | 'pin' | 'passphrase' | 'none';
```

Do **not** add new IPC functions yet — those land in Task 9.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
```

Expected: PASS (no callers reference the new modes yet).

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/src/lib/auth/AuthContext.tsx apps/interviewer-v7/src/global.d.ts
git commit -m "feat(interviewer-v7): widen AuthState/AuthStatus to five auth modes"
```

---

## Phase 2 — Passphrase mode

### Task 4: Renderer-side passphrase enrol / unlock / reEnrol

**Files:**

- Modify: `apps/interviewer-v7/src/lib/auth/api.ts`
- Modify: `apps/interviewer-v7/src/lib/auth/electron.ts`
- Create: `apps/interviewer-v7/src/lib/auth/__tests__/passphrase.test.ts`

- [ ] **Step 1: Write failing tests for passphrase enrol/unlock**

Create `apps/interviewer-v7/src/lib/auth/__tests__/passphrase.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../platform/platform', () => ({
  isElectron: false,
  isCapacitor: false,
  hostAppName: 'web',
}));

import * as authApi from '../api';
import * as vaultMetadata from '../vaultMetadata';

describe('passphrase mode (renderer)', () => {
  beforeEach(async () => {
    await vaultMetadata.clear();
    window.sessionStorage.clear();
  });
  afterEach(async () => {
    await vaultMetadata.clear();
    window.sessionStorage.clear();
  });

  it('rejects passphrases shorter than 12 characters', async () => {
    const r = await authApi.enrolWithPassphrase('short');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/at least 12/i);
  });

  it('rejects passphrases that are 12+ chars but weak', async () => {
    const r = await authApi.enrolWithPassphrase('aaaaaaaaaaaa');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/stronger/i);
  });

  it('enrols and unlocks with a strong 12+ char passphrase', async () => {
    const phrase = 'Tr0ub4dor&3-clever';
    const enrol = await authApi.enrolWithPassphrase(phrase);
    expect(enrol.ok).toBe(true);

    const status = await authApi.status();
    expect(status.configured).toBe(true);
    expect(status.mode).toBe('passphrase');

    // Simulate restart by clearing the unlock flag
    window.sessionStorage.clear();
    const unlock = await authApi.unlockWithPassphrase(phrase);
    expect(unlock.ok).toBe(true);
  });

  it('rejects wrong passphrase on unlock', async () => {
    await authApi.enrolWithPassphrase('Tr0ub4dor&3-clever');
    window.sessionStorage.clear();
    const r = await authApi.unlockWithPassphrase('Tr0ub4dor&3-WRONG!');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/incorrect/i);
  });

  it('reEnrols atomically', async () => {
    const first = 'Tr0ub4dor&3-clever';
    const second = 'C0rrect-h0rse-Battery-Staple';
    await authApi.enrolWithPassphrase(first);
    const r = await authApi.reEnrolWithPassphrase({
      currentPhrase: first,
      nextPhrase: second,
    });
    expect(r.ok).toBe(true);
    window.sessionStorage.clear();
    expect((await authApi.unlockWithPassphrase(first)).ok).toBe(false);
    expect((await authApi.unlockWithPassphrase(second)).ok).toBe(true);
  });

  it('reEnrol rejects when current passphrase is wrong', async () => {
    await authApi.enrolWithPassphrase('Tr0ub4dor&3-clever');
    const r = await authApi.reEnrolWithPassphrase({
      currentPhrase: 'WRONG-PASSPHRASE-1234',
      nextPhrase: 'C0rrect-h0rse-Battery-Staple',
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @codaco/interviewer-v7 test -- passphrase.test.ts
```

Expected: FAIL — `enrolWithPassphrase` not exported.

- [ ] **Step 3: Add passphrase helpers + public API in `api.ts`**

In `apps/interviewer-v7/src/lib/auth/api.ts`, add near the existing PIN helpers:

```ts
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
  // Same derivation as PIN — but kept separate so future tuning (e.g. argon2)
  // can be passphrase-specific without disturbing PIN.
  const salt = fromBase64(saltB64);
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    material,
    PBKDF2_KEY_BYTES * 8,
  );
  return toBase64(new Uint8Array(bits));
}
```

In the same file, extend `status()` to recognise the passphrase variant. Locate the `if (metadata.mode === 'pin')` block and add (in the same shape, immediately after):

```ts
if (metadata.mode === 'passphrase') {
  return {
    configured: true,
    locked: !readWebUnlocked(),
    mode: 'passphrase',
  };
}
if (metadata.mode === 'biometric-native') {
  return {
    configured: true,
    locked: !readWebUnlocked(),
    mode: 'biometric-native',
  };
}
```

Add the three new exported functions at file scope (near `enrolWithPin` / `unlockWithPin` / `reEnrolWithPin`):

```ts
export async function enrolWithPassphrase(
  phrase: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return validation;
  if (isElectron) {
    return electronAuth.setupPassphrase({ phrase });
  }
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
  if (isElectron) {
    return electronAuth.unlockPassphrase({ phrase });
  }
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
  if (isElectron) {
    return electronAuth.reEnrolPassphrase(args);
  }
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
```

- [ ] **Step 4: Add stub IPC wrappers in `electron.ts`**

In `apps/interviewer-v7/src/lib/auth/electron.ts`, add (mirroring `setupPin`):

```ts
export async function setupPassphrase(args: {
  phrase: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().setupPassphrase(args);
}

export async function unlockPassphrase(args: {
  phrase: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().unlockPassphrase(args);
}

export async function reEnrolPassphrase(args: {
  currentPhrase: string;
  nextPhrase: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().reEnrolPassphrase(args);
}
```

These will fail at runtime under Electron until Task 6 wires the preload — the tests stub `isElectron = false` so they don't exercise this path.

- [ ] **Step 5: Extend `electronAPI` typing in `global.d.ts`**

Add to the `auth` object in `apps/interviewer-v7/src/global.d.ts`:

```ts
setupPassphrase: (args: { phrase: string }) =>
  Promise<{ ok: boolean; message?: string }>;
unlockPassphrase: (args: { phrase: string }) =>
  Promise<{ ok: boolean; message?: string }>;
reEnrolPassphrase: (args: { currentPhrase: string; nextPhrase: string }) =>
  Promise<{ ok: boolean; message?: string }>;
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @codaco/interviewer-v7 test -- passphrase.test.ts
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
```

Expected: tests PASS, typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/interviewer-v7/src/lib/auth/api.ts apps/interviewer-v7/src/lib/auth/electron.ts apps/interviewer-v7/src/lib/auth/__tests__/passphrase.test.ts apps/interviewer-v7/src/global.d.ts
git commit -m "feat(interviewer-v7): add renderer-side passphrase enrol/unlock/reEnrol"
```

---

### Task 5: Electron main passphrase enrol / unlock / reEnrol

**Files:**

- Modify: `apps/interviewer-v7/electron/auth/vault.ts`
- Modify: `apps/interviewer-v7/electron/auth/vaultStore.ts`
- Create: `apps/interviewer-v7/electron/auth/__tests__/vault.passphrase.test.ts`

- [ ] **Step 1: Inspect existing `VaultRecord` shape**

```bash
sed -n '1,200p' apps/interviewer-v7/electron/auth/vaultStore.ts
```

Note `CURRENT_VAULT_VERSION` and the `mode` discriminator.

- [ ] **Step 2: Extend `VaultRecord` union in `vaultStore.ts`**

Locate the `VaultRecord` discriminated union. Add a passphrase variant alongside the PIN variant (same shape, different mode):

```ts
| {
    version: typeof CURRENT_VAULT_VERSION;
    mode: 'passphrase';
    kdfSaltB64: string;
    kdfIterations: number;
    wrapIvB64: string;
    wrapCiphertextB64: string;
  }
| {
    version: typeof CURRENT_VAULT_VERSION;
    mode: 'biometric-native';
    wrapIvB64: string;
    wrapCiphertextB64: string;
    // The DEK is wrapped under a randomly-generated KEK that's never persisted;
    // unwrapping is therefore impossible without the in-memory KEK. The
    // biometric prompt acts as a gate before the KEK is held in memory.
    kekB64: string;
  }
```

Wait — re-think the biometric-native shape. On Capacitor there is **no DEK** (no SQLCipher). The variant doesn't need a wrap at all. Since the Electron main vault is Electron-only and `biometric-native` is Capacitor-only, **the Electron `VaultRecord` does NOT get a `biometric-native` variant**. Only `passphrase` is added here.

Revised: add only the passphrase variant to `VaultRecord`. Do not add `biometric-native` to `vaultStore.ts`.

If the file has a `serializeVault` / `parseVault` round-trip or any switch on `mode`, extend it for `'passphrase'` symmetric to `'pin'`.

- [ ] **Step 3: Write failing tests**

Create `apps/interviewer-v7/electron/auth/__tests__/vault.passphrase.test.ts`. Mirror the pattern of any existing vault test in this directory (look at `electron/auth/__tests__/` first — if there's already a `vault.test.ts`, model new tests after it; if not, create a minimal harness).

If no existing vault test exists, use this stand-alone harness that mocks the DB service:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmp = mkdtempSync(join(tmpdir(), 'vault-passphrase-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmp },
}));
vi.mock('../../db/service', () => ({
  openDatabase: vi.fn(),
  openDatabasePlain: vi.fn(),
  closeDatabase: vi.fn(),
  getDbPath: () => join(tmp, 'interviewer-v7.encrypted.db'),
}));

import * as vault from '../vault';
import { deleteVault } from '../vaultStore';

describe('vault passphrase mode', () => {
  beforeEach(() => {
    deleteVault();
  });
  afterEach(() => {
    deleteVault();
  });

  it('setup → unlock round-trip with correct passphrase succeeds', async () => {
    const phrase = 'Tr0ub4dor&3-clever';
    const setup = await vault.setupPassphrase({ phrase });
    expect(setup.ok).toBe(true);

    await vault.lock();
    const unlock = await vault.unlockPassphrase({ phrase });
    expect(unlock.ok).toBe(true);
  });

  it('unlock fails with wrong passphrase', async () => {
    await vault.setupPassphrase({ phrase: 'Tr0ub4dor&3-clever' });
    await vault.lock();
    const r = await vault.unlockPassphrase({ phrase: 'WRONG-PASSPHRASE-1!' });
    expect(r.ok).toBe(false);
  });

  it('reEnrol replaces wrap atomically', async () => {
    const first = 'Tr0ub4dor&3-clever';
    const second = 'C0rrect-h0rse-Battery-Staple';
    await vault.setupPassphrase({ phrase: first });
    const r = await vault.reEnrolPassphrase({
      currentPhrase: first,
      nextPhrase: second,
    });
    expect(r.ok).toBe(true);
    await vault.lock();
    expect((await vault.unlockPassphrase({ phrase: first })).ok).toBe(false);
    expect((await vault.unlockPassphrase({ phrase: second })).ok).toBe(true);
  });

  it('reEnrol fails when current passphrase is wrong', async () => {
    await vault.setupPassphrase({ phrase: 'Tr0ub4dor&3-clever' });
    const r = await vault.reEnrolPassphrase({
      currentPhrase: 'WRONG-PASSPHRASE-1!',
      nextPhrase: 'C0rrect-h0rse-Battery-Staple',
    });
    expect(r.ok).toBe(false);
  });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});
```

- [ ] **Step 4: Run tests to verify failure**

```bash
pnpm --filter @codaco/interviewer-v7 test -- vault.passphrase.test.ts
```

Expected: FAIL — `setupPassphrase` not exported.

- [ ] **Step 5: Add passphrase operations to `vault.ts`**

In `apps/interviewer-v7/electron/auth/vault.ts`, add a `validatePassphrase` helper (mirror PIN's validation but for length 12+ and character classes 3+):

```ts
const PASSPHRASE_MIN_LENGTH = 12;
const PASSPHRASE_MIN_CLASSES = 3;

function validatePassphrase(
  phrase: string,
): { ok: true } | { ok: false; message: string } {
  if (phrase.length < PASSPHRASE_MIN_LENGTH) {
    return {
      ok: false,
      message: `Passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters`,
    };
  }
  let classes = 0;
  if (/[a-z]/.test(phrase)) classes += 1;
  if (/[A-Z]/.test(phrase)) classes += 1;
  if (/[0-9]/.test(phrase)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(phrase)) classes += 1;
  if (classes < PASSPHRASE_MIN_CLASSES) {
    return {
      ok: false,
      message:
        'Passphrase must be stronger — combine uppercase, lowercase, numbers, and symbols',
    };
  }
  return { ok: true };
}

async function deriveKekFromPassphrase(
  phrase: string,
  salt: Buffer,
  iterations: number,
): Promise<WebCryptoKey> {
  // Identical PBKDF2/AES-GCM derivation as deriveKekFromPin — kept separate so
  // future tuning can diverge.
  const material = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return webcrypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
```

Add the three operations (full bodies — do not collapse with PIN):

```ts
export async function setupPassphrase(args: {
  phrase: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePassphrase(args.phrase);
  if (!validation.ok) return validation;
  if (isVaultConfigured()) {
    return { ok: false, message: 'Vault already configured' };
  }
  try {
    const dek = randomBytes(KEY_LEN_BYTES);
    const kdfSalt = randomBytes(PBKDF2_SALT_BYTES);
    const kek = await deriveKekFromPassphrase(
      args.phrase,
      kdfSalt,
      PBKDF2_ITERATIONS,
    );
    const wrapped = await aesEncrypt(kek, dek);
    const record: VaultRecord = {
      version: CURRENT_VAULT_VERSION,
      mode: 'passphrase',
      kdfSaltB64: bufToB64(kdfSalt),
      kdfIterations: PBKDF2_ITERATIONS,
      wrapIvB64: bufToB64(wrapped.iv),
      wrapCiphertextB64: bufToB64(wrapped.ciphertext),
    };
    writeVault(record);
    const hex = bytesToHex(dek);
    openDatabase(hex);
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function unlockPassphrase(args: {
  phrase: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePassphrase(args.phrase);
  if (!validation.ok) {
    return { ok: false, message: 'Incorrect passphrase' };
  }
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (
    record.mode !== 'passphrase' ||
    !record.kdfSaltB64 ||
    !record.kdfIterations
  ) {
    return { ok: false, message: 'Vault is not configured for passphrase' };
  }
  try {
    const kek = await deriveKekFromPassphrase(
      args.phrase,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    let dek: Buffer;
    try {
      dek = await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Incorrect passphrase' };
    }
    const hex = bytesToHex(dek);
    openDatabase(hex);
    unlockedKeyHex = hex;
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function reEnrolPassphrase(args: {
  currentPhrase: string;
  nextPhrase: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const currentValidation = validatePassphrase(args.currentPhrase);
  if (!currentValidation.ok) {
    return { ok: false, message: 'Current passphrase is incorrect' };
  }
  const nextValidation = validatePassphrase(args.nextPhrase);
  if (!nextValidation.ok) return nextValidation;
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (
    record.mode !== 'passphrase' ||
    !record.kdfSaltB64 ||
    !record.kdfIterations
  ) {
    return { ok: false, message: 'Vault is not configured for passphrase' };
  }
  try {
    const currentKek = await deriveKekFromPassphrase(
      args.currentPhrase,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    let dek: Buffer;
    try {
      dek = await aesDecrypt(
        currentKek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Current passphrase is incorrect' };
    }
    const nextSalt = randomBytes(PBKDF2_SALT_BYTES);
    const nextKek = await deriveKekFromPassphrase(
      args.nextPhrase,
      nextSalt,
      PBKDF2_ITERATIONS,
    );
    const wrapped = await aesEncrypt(nextKek, dek);
    const next: VaultRecord = {
      version: CURRENT_VAULT_VERSION,
      mode: 'passphrase',
      kdfSaltB64: bufToB64(nextSalt),
      kdfIterations: PBKDF2_ITERATIONS,
      wrapIvB64: bufToB64(wrapped.iv),
      wrapCiphertextB64: bufToB64(wrapped.ciphertext),
    };
    writeVault(next);
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
```

Update `status()` in `vault.ts` to widen the `mode` return type to include `'passphrase'` (the `record.mode` already carries it; only the function signature needs the union).

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @codaco/interviewer-v7 test -- vault.passphrase.test.ts
pnpm --filter @codaco/interviewer-v7 typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/interviewer-v7/electron/auth/vault.ts apps/interviewer-v7/electron/auth/vaultStore.ts apps/interviewer-v7/electron/auth/__tests__/vault.passphrase.test.ts
git commit -m "feat(interviewer-v7): add passphrase mode to Electron vault (envelope encryption)"
```

---

### Task 6: Wire passphrase IPC channels through preload & handlers

**Files:**

- Modify: `apps/interviewer-v7/electron/handlers/authHandlers.ts`
- Modify: `apps/interviewer-v7/electron/preload.ts`

- [ ] **Step 1: Read existing auth handlers**

```bash
sed -n '1,200p' apps/interviewer-v7/electron/handlers/authHandlers.ts
```

Note the pattern for registering `auth:setup:pin`, `auth:unlock:pin`, `auth:reEnrol:pin`.

- [ ] **Step 2: Register passphrase channels in `authHandlers.ts`**

Add three new `ipcMain.handle(...)` calls inside `registerAuthHandlers()` mirroring the PIN handlers:

```ts
ipcMain.handle(
  'auth:setup:passphrase',
  async (_event, args: { phrase: string }) => vault.setupPassphrase(args),
);
ipcMain.handle(
  'auth:unlock:passphrase',
  async (_event, args: { phrase: string }) => vault.unlockPassphrase(args),
);
ipcMain.handle(
  'auth:reEnrol:passphrase',
  async (_event, args: { currentPhrase: string; nextPhrase: string }) =>
    vault.reEnrolPassphrase(args),
);
```

- [ ] **Step 3: Expose in preload**

In `apps/interviewer-v7/electron/preload.ts`, locate the `auth` object inside the `contextBridge.exposeInMainWorld('api', { ... })` block. Add three new methods:

```ts
setupPassphrase: (args: { phrase: string }) =>
  ipcRenderer.invoke('auth:setup:passphrase', args),
unlockPassphrase: (args: { phrase: string }) =>
  ipcRenderer.invoke('auth:unlock:passphrase', args),
reEnrolPassphrase: (args: { currentPhrase: string; nextPhrase: string }) =>
  ipcRenderer.invoke('auth:reEnrol:passphrase', args),
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
```

Expected: PASS — preload, global.d.ts (Task 4), and electron.ts client (Task 4) all agree.

- [ ] **Step 5: Smoke test (manual)**

Start the Electron dev environment:

```bash
pnpm --filter @codaco/interviewer-v7 electron:dev
```

Open DevTools, run in console: `await window.api?.auth?.setupPassphrase` — should be a function. Quit the dev session (do not enrol — the renderer wizard isn't wired yet).

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v7/electron/handlers/authHandlers.ts apps/interviewer-v7/electron/preload.ts
git commit -m "feat(interviewer-v7): wire passphrase IPC channels (main + preload)"
```

---

## Phase 3 — Biometric-native mode (Capacitor)

### Task 7: `biometricNative.ts` wrapper

**Files:**

- Create: `apps/interviewer-v7/src/lib/auth/biometricNative.ts`
- Create: `apps/interviewer-v7/src/lib/auth/__tests__/biometricNative.test.ts`

- [ ] **Step 1: Read the plugin's published types**

```bash
find node_modules/@aparajita/capacitor-biometric-auth -name '*.d.ts' -maxdepth 3 | head -5
```

Open the index `.d.ts` and locate `BiometricAuth.checkBiometry()` (returns a result with `isAvailable: boolean`, `biometryType`, `reason: BiometryErrorType`, etc.) and `BiometricAuth.authenticate(options?)` (throws on cancel / failure with `code`).

- [ ] **Step 2: Write failing test**

Create `apps/interviewer-v7/src/lib/auth/__tests__/biometricNative.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkBiometryMock = vi.fn();
const authenticateMock = vi.fn();

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: checkBiometryMock,
    authenticate: authenticateMock,
  },
  BiometryErrorType: {
    none: 'none',
    biometryNotAvailable: 'biometryNotAvailable',
    biometryNotEnrolled: 'biometryNotEnrolled',
    passcodeNotSet: 'passcodeNotSet',
  },
}));

vi.mock('../../platform/platform', () => ({
  isElectron: false,
  isCapacitor: true,
  hostAppName: 'capacitor',
}));

import {
  isBiometricNativeAvailable,
  verifyBiometric,
} from '../biometricNative';

describe('biometricNative', () => {
  beforeEach(() => {
    checkBiometryMock.mockReset();
    authenticateMock.mockReset();
  });

  it('reports availability when checkBiometry succeeds', async () => {
    checkBiometryMock.mockResolvedValue({ isAvailable: true });
    const r = await isBiometricNativeAvailable();
    expect(r.ok).toBe(true);
  });

  it('maps biometryNotAvailable to no-hardware', async () => {
    checkBiometryMock.mockResolvedValue({
      isAvailable: false,
      reason: 'biometryNotAvailable',
    });
    const r = await isBiometricNativeAvailable();
    expect(r).toEqual({ ok: false, reason: 'no-hardware' });
  });

  it('maps biometryNotEnrolled to not-enrolled', async () => {
    checkBiometryMock.mockResolvedValue({
      isAvailable: false,
      reason: 'biometryNotEnrolled',
    });
    const r = await isBiometricNativeAvailable();
    expect(r).toEqual({ ok: false, reason: 'not-enrolled' });
  });

  it('maps passcodeNotSet to no-device-passcode', async () => {
    checkBiometryMock.mockResolvedValue({
      isAvailable: false,
      reason: 'passcodeNotSet',
    });
    const r = await isBiometricNativeAvailable();
    expect(r).toEqual({ ok: false, reason: 'no-device-passcode' });
  });

  it('verifies successfully when authenticate resolves', async () => {
    authenticateMock.mockResolvedValue(undefined);
    const r = await verifyBiometric();
    expect(r).toEqual({ ok: true });
    expect(authenticateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowDeviceCredential: true,
      }),
    );
  });

  it('returns ok:false with message when authenticate throws', async () => {
    authenticateMock.mockRejectedValue(
      Object.assign(new Error('User cancelled'), { code: 'userCancel' }),
    );
    const r = await verifyBiometric();
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
pnpm --filter @codaco/interviewer-v7 test -- biometricNative.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `biometricNative.ts`**

```ts
import {
  BiometricAuth,
  BiometryErrorType,
} from '@aparajita/capacitor-biometric-auth';

import { isCapacitor } from '../platform/platform';

export type BiometricAvailability =
  | { ok: true }
  | {
      ok: false;
      reason: 'no-hardware' | 'not-enrolled' | 'no-device-passcode' | 'unknown';
    };

export async function isBiometricNativeAvailable(): Promise<BiometricAvailability> {
  if (!isCapacitor) return { ok: false, reason: 'no-hardware' };
  try {
    const result = await BiometricAuth.checkBiometry();
    if (result.isAvailable) return { ok: true };
    switch (result.reason) {
      case BiometryErrorType.biometryNotAvailable:
        return { ok: false, reason: 'no-hardware' };
      case BiometryErrorType.biometryNotEnrolled:
        return { ok: false, reason: 'not-enrolled' };
      case BiometryErrorType.passcodeNotSet:
        return { ok: false, reason: 'no-device-passcode' };
      default:
        return { ok: false, reason: 'unknown' };
    }
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}

export async function verifyBiometric(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (!isCapacitor) {
    return { ok: false, message: 'Biometric authentication is not available' };
  }
  try {
    await BiometricAuth.authenticate({
      reason: 'Unlock Network Canvas Interviewer',
      allowDeviceCredential: true,
    });
    return { ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, message };
  }
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @codaco/interviewer-v7 test -- biometricNative.test.ts
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v7/src/lib/auth/biometricNative.ts apps/interviewer-v7/src/lib/auth/__tests__/biometricNative.test.ts
git commit -m "feat(interviewer-v7): add biometricNative wrapper around @aparajita/capacitor-biometric-auth"
```

---

### Task 8: Wire biometric-native into `auth/api.ts`

**Files:**

- Modify: `apps/interviewer-v7/src/lib/auth/api.ts`

- [ ] **Step 1: Add three new public functions**

Inside `auth/api.ts`, near `enrolWithPin`, add:

```ts
import { isCapacitor } from '../platform/platform';
import {
  isBiometricNativeAvailable,
  verifyBiometric as verifyBiometricNativePlugin,
} from './biometricNative';

export async function enrolWithBiometricNative(): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (!isCapacitor) {
    return { ok: false, message: 'Biometric authentication is not available' };
  }
  const availability = await isBiometricNativeAvailable();
  if (!availability.ok) {
    return { ok: false, message: 'Biometric authentication is not available' };
  }
  // Prove the user can pass the biometric check before persisting metadata.
  const verify = await verifyBiometricNativePlugin();
  if (!verify.ok) return verify;
  await vaultMetadata.writeBiometricNative();
  writeWebUnlocked(true);
  return { ok: true };
}

export async function unlockWithBiometricNative(): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (!isCapacitor) {
    return { ok: false, message: 'Biometric authentication is not available' };
  }
  const metadata = await vaultMetadata.read();
  if (!metadata || metadata.mode !== 'biometric-native') {
    return {
      ok: false,
      message: 'Biometric authentication is not configured on this device',
    };
  }
  const verify = await verifyBiometricNativePlugin();
  if (!verify.ok) return verify;
  writeWebUnlocked(true);
  return { ok: true };
}
```

Note: the renderer-side `import { isCapacitor }` may already exist — if so, don't re-import; just add the symbols to the existing import line.

- [ ] **Step 2: Manual typecheck**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
```

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v7/src/lib/auth/api.ts
git commit -m "feat(interviewer-v7): add enrolWithBiometricNative/unlockWithBiometricNative"
```

---

## Phase 4 — Verify family (step-up auth backbone)

### Task 9: Add `verify*` functions to renderer & Electron

**Files:**

- Modify: `apps/interviewer-v7/src/lib/auth/api.ts`
- Modify: `apps/interviewer-v7/src/lib/auth/electron.ts`
- Modify: `apps/interviewer-v7/electron/auth/vault.ts`
- Modify: `apps/interviewer-v7/electron/handlers/authHandlers.ts`
- Modify: `apps/interviewer-v7/electron/preload.ts`
- Modify: `apps/interviewer-v7/src/global.d.ts`

- [ ] **Step 1: Add `verify*` to Electron `vault.ts`**

The verify operations re-derive the KEK and attempt the unwrap, but do NOT mutate `unlockedKeyHex` and do NOT open/reopen the DB. Add these alongside `unlockPin` / `unlockPassphrase`:

```ts
export async function verifyPin(args: {
  pin: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePin(args.pin);
  if (!validation.ok) return validation;
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'pin' || !record.kdfSaltB64 || !record.kdfIterations) {
    return { ok: false, message: 'Vault is not configured for PIN' };
  }
  try {
    const kek = await deriveKekFromPin(
      args.pin,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    try {
      await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Incorrect PIN' };
    }
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function verifyPassphrase(args: {
  phrase: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const validation = validatePassphrase(args.phrase);
  if (!validation.ok) {
    return { ok: false, message: 'Incorrect passphrase' };
  }
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (
    record.mode !== 'passphrase' ||
    !record.kdfSaltB64 ||
    !record.kdfIterations
  ) {
    return { ok: false, message: 'Vault is not configured for passphrase' };
  }
  try {
    const kek = await deriveKekFromPassphrase(
      args.phrase,
      b64ToBuf(record.kdfSaltB64),
      record.kdfIterations,
    );
    try {
      await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Incorrect passphrase' };
    }
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export async function verifyWebAuthn(args: {
  prfOutputB64: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!args.prfOutputB64) {
    return {
      ok: false,
      message: 'WebAuthn PRF extension is required and was not provided',
    };
  }
  const record = readVault();
  if (!record) return { ok: false, message: 'Vault not configured' };
  if (record.mode !== 'webauthn') {
    return { ok: false, message: 'Vault is not configured for WebAuthn' };
  }
  try {
    const kek = await importKekFromBytes(b64ToBuf(args.prfOutputB64));
    try {
      await aesDecrypt(
        kek,
        b64ToBuf(record.wrapIvB64),
        b64ToBuf(record.wrapCiphertextB64),
      );
    } catch {
      return { ok: false, message: 'Authenticator unwrap failed' };
    }
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
```

- [ ] **Step 2: Register IPC handlers**

In `authHandlers.ts`:

```ts
ipcMain.handle(
  'auth:verify:webauthn',
  async (_event, args: { prfOutputB64: string }) => vault.verifyWebAuthn(args),
);
ipcMain.handle('auth:verify:pin', async (_event, args: { pin: string }) =>
  vault.verifyPin(args),
);
ipcMain.handle(
  'auth:verify:passphrase',
  async (_event, args: { phrase: string }) => vault.verifyPassphrase(args),
);
```

- [ ] **Step 3: Expose in preload**

In `preload.ts`, inside the `auth` object:

```ts
verifyWebAuthn: (args: { prfOutputB64: string }) =>
  ipcRenderer.invoke('auth:verify:webauthn', args),
verifyPin: (args: { pin: string }) =>
  ipcRenderer.invoke('auth:verify:pin', args),
verifyPassphrase: (args: { phrase: string }) =>
  ipcRenderer.invoke('auth:verify:passphrase', args),
```

- [ ] **Step 4: Add IPC client functions in `electron.ts`**

```ts
export async function verifyWebAuthn(args: {
  prfOutputB64: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().verifyWebAuthn(args);
}

export async function verifyPin(args: {
  pin: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().verifyPin(args);
}

export async function verifyPassphrase(args: {
  phrase: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().verifyPassphrase(args);
}
```

- [ ] **Step 5: Add `verify*` to renderer `api.ts`**

```ts
export async function verifyBiometric(
  signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  if (isCapacitor) {
    return verifyBiometricNativePlugin();
  }
  if (!isWebAuthnAvailable()) {
    return { ok: false, message: 'This browser does not support WebAuthn' };
  }
  const metadata = await vaultMetadata.read();
  const s = isElectron ? await electronAuth.status() : null;
  const credentialIdB64 = isElectron
    ? s?.credentialIdB64
    : metadata?.mode === 'webauthn'
      ? metadata.credentialIdB64
      : undefined;
  const saltB64 = isElectron
    ? s?.saltB64
    : metadata?.mode === 'webauthn'
      ? metadata.saltB64
      : undefined;
  if (!credentialIdB64 || !saltB64) {
    return { ok: false, message: 'No authenticator enrolled' };
  }
  const result = await authenticatePasskey({
    credentialId: fromBase64(credentialIdB64),
    salt: fromBase64(saltB64),
    signal,
  });
  if (!result.ok) return { ok: false, message: result.error };
  if (isElectron) {
    return electronAuth.verifyWebAuthn({
      prfOutputB64: toBase64(result.enrolment.prfOutput),
    });
  }
  return { ok: true };
}

export async function verifyWithPin(
  pin: string,
): Promise<{ ok: boolean; message?: string }> {
  const validation = validatePin(pin);
  if (!validation.ok) return validation;
  if (isElectron) return electronAuth.verifyPin({ pin });
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
  if (isElectron) return electronAuth.verifyPassphrase({ phrase });
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
```

- [ ] **Step 6: Update `global.d.ts`**

Add to the `auth` shape:

```ts
verifyWebAuthn: (args: { prfOutputB64: string }) =>
  Promise<{ ok: boolean; message?: string }>;
verifyPin: (args: { pin: string }) =>
  Promise<{ ok: boolean; message?: string }>;
verifyPassphrase: (args: { phrase: string }) =>
  Promise<{ ok: boolean; message?: string }>;
```

- [ ] **Step 7: Typecheck + lint**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
```

- [ ] **Step 8: Commit**

```bash
git add apps/interviewer-v7/src/lib/auth/api.ts apps/interviewer-v7/src/lib/auth/electron.ts apps/interviewer-v7/src/global.d.ts apps/interviewer-v7/electron/auth/vault.ts apps/interviewer-v7/electron/handlers/authHandlers.ts apps/interviewer-v7/electron/preload.ts
git commit -m "feat(interviewer-v7): add verify-only auth functions for step-up flows"
```

---

## Phase 5 — StoredSettings

### Task 10: Add `requireUnlockOnResume` and `requireUnlockOnExport`

**Files:**

- Modify: `apps/interviewer-v7/src/lib/db/types.ts`
- Modify: `apps/interviewer-v7/src/lib/db/db.ts` (defaults / Dexie schema)
- Modify: `apps/interviewer-v7/electron/db/schema.ts`
- Modify: `apps/interviewer-v7/electron/db/service.ts` (or wherever settings reads/writes happen)
- Modify: `apps/interviewer-v7/src/lib/db/electron-settings.ts`
- Modify: `apps/interviewer-v7/src/global.d.ts` (if the db IPC surface lists settings shape)

- [ ] **Step 1: Extend `StoredSettings` in `types.ts`**

```ts
export type StoredSettings = {
  id: 'device';
  exportGraphML: boolean;
  exportCSV: boolean;
  useScreenLayoutCoordinates: boolean;
  screenLayoutHeight: number;
  screenLayoutWidth: number;
  dismissedUpdates: string[];
  lastActiveProtocolHash?: string;
  lastActiveSessionId?: string;
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnResume: boolean;
  requireUnlockOnExport: boolean;
};
```

- [ ] **Step 2: Update Dexie default settings**

In `apps/interviewer-v7/src/lib/db/db.ts`, locate the helper that seeds defaults for the `'device'` settings row (likely `getSettings()` or an `init` path). Where it merges defaults, include:

```ts
requireUnlockOnResume: true,
requireUnlockOnExport: false,
```

No version bump — the app is in development; existing dev rows pick up the defaults via the merge.

- [ ] **Step 3: Update Electron settings schema and reads/writes**

In `apps/interviewer-v7/electron/db/schema.ts`, add the two columns to the settings table DDL (mirror the existing booleans — they are likely stored as `INTEGER NOT NULL DEFAULT 0` or 1):

```sql
require_unlock_on_resume INTEGER NOT NULL DEFAULT 1,
require_unlock_on_export INTEGER NOT NULL DEFAULT 0,
```

In whichever Electron module reads/writes settings rows (likely in `electron/db/service.ts` or a sibling settings handler), extend the row → object mapping to include the two new fields, and the object → row mapping symmetrically (`Number(value)` for the integer column).

- [ ] **Step 4: Update `electron-settings.ts` renderer-side wrapper**

If `apps/interviewer-v7/src/lib/db/electron-settings.ts` re-declares the shape, extend it to include the two fields.

- [ ] **Step 5: Update `global.d.ts`**

If the `db.settings.get()` / `set()` IPC return shape is declared, add the two booleans to that shape.

- [ ] **Step 6: Run typecheck**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
```

Expected: PASS — no consumer yet writes to these fields, but the type widens.

- [ ] **Step 7: Smoke test**

```bash
pnpm --filter @codaco/interviewer-v7 electron:dev
```

Quit immediately; verify no startup errors related to the new columns. Repeat with `pnpm --filter @codaco/interviewer-v7 dev` (web).

- [ ] **Step 8: Commit**

```bash
git add apps/interviewer-v7/src/lib/db apps/interviewer-v7/electron/db apps/interviewer-v7/src/global.d.ts
git commit -m "feat(interviewer-v7): add requireUnlockOnResume/Export to StoredSettings"
```

---

## Phase 6 — UnlockForms extraction + LockScreen updates

### Task 11: Extract LockScreen forms into shared components

**Files:**

- Read: `apps/interviewer-v7/src/components/LockScreen.tsx` (existing)
- Create: `apps/interviewer-v7/src/components/UnlockForms/BiometricUnlockForm.tsx`
- Create: `apps/interviewer-v7/src/components/UnlockForms/PinUnlockForm.tsx`
- Create: `apps/interviewer-v7/src/components/UnlockForms/PasswordUnlockForm.tsx`
- Modify: `apps/interviewer-v7/src/components/LockScreen.tsx`

- [ ] **Step 1: Read LockScreen**

```bash
sed -n '1,200p' apps/interviewer-v7/src/components/LockScreen.tsx
```

Identify the per-mode form bodies; note the props each one passes (e.g. `onSubmit`, `disabled`, error message rendering).

- [ ] **Step 2: Define the shared form interface**

Each form takes:

```ts
type UnlockFormSubmitHandler<T> = (
  value: T,
) => Promise<{ ok: boolean; message?: string }>;

type BiometricUnlockFormProps = {
  onSubmit: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
  submitLabel?: string;
  disabled?: boolean;
};

type PinUnlockFormProps = {
  onSubmit: UnlockFormSubmitHandler<string>;
  submitLabel?: string;
  disabled?: boolean;
};

type PasswordUnlockFormProps = {
  onSubmit: UnlockFormSubmitHandler<string>;
  submitLabel?: string;
  disabled?: boolean;
};
```

- [ ] **Step 3: Create `BiometricUnlockForm.tsx`**

Lift the existing biometric/passkey button + state machine out of `LockScreen.tsx` into `apps/interviewer-v7/src/components/UnlockForms/BiometricUnlockForm.tsx`. Surface the same props as before but driven by the `onSubmit` callback (do NOT directly call `authApi.unlock` — the parent decides whether the action is unlock or verify).

- [ ] **Step 4: Create `PinUnlockForm.tsx`**

Lift the PIN input form. The submit button calls `props.onSubmit(pin)` and surfaces the result message on failure. Preserve the same input constraints (numeric, 8 digits).

- [ ] **Step 5: Create `PasswordUnlockForm.tsx`**

New form for passphrase entry. Use fresco-ui `PasswordField` with `showStrengthMeter={false}` (we don't show strength when unlocking, only when enrolling). Same submit-with-error-display pattern as `PinUnlockForm`. Submit calls `props.onSubmit(phrase)`.

- [ ] **Step 6: Wire LockScreen to use the shared forms + add passphrase + biometric-native dispatch**

Rewrite `LockScreen.tsx` to:

```tsx
const { state } = useAuth();

switch (state.kind === 'locked' ? state.mode : null) {
  case 'webauthn':
    return (
      <BiometricUnlockForm onSubmit={(signal) => authApi.unlock(signal)} />
    );
  case 'biometric-native':
    return (
      <BiometricUnlockForm
        onSubmit={() => authApi.unlockWithBiometricNative()}
      />
    );
  case 'pin':
    return <PinUnlockForm onSubmit={(pin) => authApi.unlockWithPin(pin)} />;
  case 'passphrase':
    return (
      <PasswordUnlockForm
        onSubmit={(phrase) => authApi.unlockWithPassphrase(phrase)}
      />
    );
  default:
    return null;
}
```

Wrap with whatever surrounding chrome `LockScreen` had (heading, theme, footer). Keep the existing brand header / styling unchanged.

- [ ] **Step 7: Typecheck + lint**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
```

- [ ] **Step 8: Manual smoke**

```bash
pnpm --filter @codaco/interviewer-v7 dev
```

Open the app in web. If there's an existing PIN vault from a prior dev session, verify the LockScreen still works. If not, skip (we'll exercise this once the wizard is wired in later tasks).

- [ ] **Step 9: Commit**

```bash
git add apps/interviewer-v7/src/components/LockScreen.tsx apps/interviewer-v7/src/components/UnlockForms
git commit -m "refactor(interviewer-v7): extract LockScreen forms; add passphrase + biometric-native dispatch"
```

---

## Phase 7 — Step-up auth (provider + dialog + integration)

### Task 12: `StepUpAuthDialog` and `StepUpAuthProvider`

**Files:**

- Create: `apps/interviewer-v7/src/lib/auth/StepUpAuthDialog.tsx`
- Create: `apps/interviewer-v7/src/lib/auth/StepUpAuthProvider.tsx`
- Modify: `apps/interviewer-v7/src/providers/AppProviders.tsx`

- [ ] **Step 1: Implement `StepUpAuthDialog.tsx`**

A fresco-ui Dialog. Reads the auth mode via `useAuth()`. Renders the same `UnlockForms/*` components but the submit handler calls the `verify*` functions, not `unlock*`. Exposes `onResolve(result)` which the parent uses to resolve the pending promise.

```tsx
import { Dialog } from '@codaco/fresco-ui';

import * as authApi from './api';
import { useAuth } from './AuthContext';
import {
  BiometricUnlockForm,
  PasswordUnlockForm,
  PinUnlockForm,
} from '../../components/UnlockForms';

export type StepUpResult = { ok: true } | { ok: false; reason: 'cancelled' };

type Props = {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
};

export default function StepUpAuthDialog({ open, onResolve }: Props) {
  const { state } = useAuth();

  const mode =
    state.kind === 'unlocked' && state.mode !== 'none' ? state.mode : null;

  if (!mode) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onResolve({ ok: false, reason: 'cancelled' });
      }}
      title="Verify your identity"
    >
      {mode === 'webauthn' && (
        <BiometricUnlockForm
          onSubmit={async (signal) => {
            const r = await authApi.verifyBiometric(signal);
            if (r.ok) onResolve({ ok: true });
            return r;
          }}
        />
      )}
      {mode === 'biometric-native' && (
        <BiometricUnlockForm
          onSubmit={async () => {
            const r = await authApi.verifyBiometric();
            if (r.ok) onResolve({ ok: true });
            return r;
          }}
        />
      )}
      {mode === 'pin' && (
        <PinUnlockForm
          onSubmit={async (pin) => {
            const r = await authApi.verifyWithPin(pin);
            if (r.ok) onResolve({ ok: true });
            return r;
          }}
        />
      )}
      {mode === 'passphrase' && (
        <PasswordUnlockForm
          onSubmit={async (phrase) => {
            const r = await authApi.verifyWithPassphrase(phrase);
            if (r.ok) onResolve({ ok: true });
            return r;
          }}
        />
      )}
    </Dialog>
  );
}
```

Adjust the `Dialog` import to whatever fresco-ui's named export actually is — read `packages/fresco-ui/src/dialogs/Dialog.tsx` (or sibling) for the actual API.

- [ ] **Step 2: Implement `StepUpAuthProvider.tsx`**

```tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

import { useAuth } from './AuthContext';
import StepUpAuthDialog, { type StepUpResult } from './StepUpAuthDialog';

type StepUpContextValue = {
  requireFreshUnlock: () => Promise<StepUpResult>;
};

const StepUpAuthContext = createContext<StepUpContextValue | null>(null);

export function StepUpAuthProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const [open, setOpen] = useState(false);
  const pendingResolve = useRef<((r: StepUpResult) => void) | null>(null);

  const handleResolve = useCallback((result: StepUpResult) => {
    setOpen(false);
    pendingResolve.current?.(result);
    pendingResolve.current = null;
  }, []);

  const requireFreshUnlock = useCallback(async (): Promise<StepUpResult> => {
    if (state.kind !== 'unlocked' || state.mode === 'none') {
      return { ok: true };
    }
    return new Promise<StepUpResult>((resolve) => {
      pendingResolve.current = resolve;
      setOpen(true);
    });
  }, [state]);

  return (
    <StepUpAuthContext.Provider value={{ requireFreshUnlock }}>
      {children}
      <StepUpAuthDialog open={open} onResolve={handleResolve} />
    </StepUpAuthContext.Provider>
  );
}

export function useStepUpAuth(): StepUpContextValue {
  const ctx = useContext(StepUpAuthContext);
  if (!ctx) {
    throw new Error('useStepUpAuth must be used within StepUpAuthProvider');
  }
  return ctx;
}
```

- [ ] **Step 3: Mount in `AppProviders.tsx`**

Read the existing provider stack. Add `<StepUpAuthProvider>` inside `<AuthProvider>` and outside the routes:

```tsx
<AuthProvider>
  <StepUpAuthProvider>{children}</StepUpAuthProvider>
</AuthProvider>
```

- [ ] **Step 4: Typecheck + lint**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
```

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/src/lib/auth/StepUpAuthDialog.tsx apps/interviewer-v7/src/lib/auth/StepUpAuthProvider.tsx apps/interviewer-v7/src/providers/AppProviders.tsx
git commit -m "feat(interviewer-v7): add StepUpAuthProvider + StepUpAuthDialog"
```

---

### Task 13: Wire `requireFreshUnlock` into Interview-resume

**Files:**

- Modify: `apps/interviewer-v7/src/routes/Interview.tsx`

- [ ] **Step 1: Read the existing resume entry**

```bash
grep -n "lastActiveSessionId\|resume\|useEffect" apps/interviewer-v7/src/routes/Interview.tsx
```

- [ ] **Step 2: Wire the gate**

At the point in `Interview.tsx` where a session is loaded — typically the `useEffect` that opens the session by id — wrap the open with the step-up call:

```tsx
const { requireFreshUnlock } = useStepUpAuth();
const settings = useSettings(); // existing hook for StoredSettings; if not present, read via `getSettings()` API

useEffect(() => {
  let cancelled = false;
  void (async () => {
    if (settings.requireUnlockOnResume) {
      const r = await requireFreshUnlock();
      if (!r.ok) {
        // User cancelled — bounce back to Home
        navigate('/');
        return;
      }
    }
    if (cancelled) return;
    // ...existing session-load path
  })();
  return () => {
    cancelled = true;
  };
}, [, /* existing deps */ settings.requireUnlockOnResume]);
```

The exact existing session-load code stays unchanged; only its trigger is gated.

- [ ] **Step 3: Typecheck + lint + smoke**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
pnpm --filter @codaco/interviewer-v7 dev
```

Manual: with a configured vault, open a session; verify the dialog appears (after the toggle is `true`, default). Cancel and confirm you return Home.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/src/routes/Interview.tsx
git commit -m "feat(interviewer-v7): require fresh unlock on interview resume when toggle is on"
```

---

### Task 14: Wire `requireFreshUnlock` into Export

**Files:**

- Modify: `apps/interviewer-v7/src/components/ExportDialog.tsx`

- [ ] **Step 1: Read existing ExportDialog**

```bash
grep -n "exportSessions\|onClick\|handleExport\|onSubmit" apps/interviewer-v7/src/components/ExportDialog.tsx
```

- [ ] **Step 2: Gate the confirm-export click**

Find the handler that calls `exportSessions(...)`. Before invoking it, gate on the toggle:

```tsx
const { requireFreshUnlock } = useStepUpAuth();

const handleConfirmExport = async () => {
  if (settings.requireUnlockOnExport) {
    const r = await requireFreshUnlock();
    if (!r.ok) {
      onClose();
      return;
    }
  }
  await exportSessions(/* existing args */);
};
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
git add apps/interviewer-v7/src/components/ExportDialog.tsx
git commit -m "feat(interviewer-v7): require fresh unlock before export when toggle is on"
```

---

## Phase 8 — Wizard scaffolding

### Task 15: `BrandedBackdrop`

**Files:**

- Read: `apps/interviewer-v7/src/components/StageBackground.tsx` (existing)
- Create: `apps/interviewer-v7/src/components/BrandedBackdrop.tsx`

- [ ] **Step 1: Read StageBackground**

```bash
sed -n '1,160p' apps/interviewer-v7/src/components/StageBackground.tsx
```

Decide: can the existing component render in a "no protocol context" variant (e.g. by accepting a `variant` prop or accepting null protocol data)?

- [ ] **Step 2A — If `StageBackground` is trivially reusable**

Skip creating `BrandedBackdrop.tsx`. Instead, in Task 19 (AuthGate update), render `<StageBackground variant="setup" />` (or whatever prop names match the existing API) directly.

- [ ] **Step 2B — Otherwise, create a minimal `BrandedBackdrop.tsx`**

Use `@codaco/art` blob primitives the way `StageBackground` does, but with hardcoded "setup" palette / no protocol dependency. Inspect `packages/art/src/index.ts` and `StageBackground.tsx` for the exact primitive names. Component should be a fixed full-viewport background div.

```tsx
import { Blob } from '@codaco/art';

export default function BrandedBackdrop() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* mirror StageBackground's blob composition; hardcode to the setup
          palette since no protocol is active. */}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v7/src/components/BrandedBackdrop.tsx
git commit -m "feat(interviewer-v7): add BrandedBackdrop for the setup-wizard surface"
```

(Skip this commit if Step 2A applies.)

---

### Task 16: `SetupWizardDialog` skeleton

**Files:**

- Create: `apps/interviewer-v7/src/components/SetupWizardDialog.tsx`

- [ ] **Step 1: Read fresco-ui's wizard Dialog API**

```bash
ls packages/fresco-ui/src/dialogs
grep -n "WizardDialog\|useWizardState\|WizardContext.Provider\|steps:" packages/fresco-ui/src/dialogs/*.tsx
```

Identify the host component that wraps `WizardContext.Provider` and consumes a `steps:` array. Note its prop shape and `onFinish` signature.

- [ ] **Step 2: Create `SetupWizardDialog.tsx`**

```tsx
import { useState } from 'react';
import { WizardDialog } from '@codaco/fresco-ui'; // adjust import path to match actual export

import Step1Intro from './SetupWizard/Step1Intro';
import Step2MethodPicker from './SetupWizard/Step2MethodPicker';
import Step3Configure from './SetupWizard/Step3Configure';
import Step4Behavior from './SetupWizard/Step4Behavior';
import SkipConfirmation from './SetupWizard/SkipConfirmation';

export type WizardSelectedMethod = 'biometric' | 'pin' | 'passphrase';

export type WizardData = {
  selectedMethod: WizardSelectedMethod | null;
  enrolmentCommitted: boolean;
  behavior: {
    idleTimeoutMinutes: 1 | 5 | 15 | 30 | 60;
    requireUnlockOnResume: boolean;
    requireUnlockOnExport: boolean;
  };
};

const DEFAULT_BEHAVIOR: WizardData['behavior'] = {
  idleTimeoutMinutes: 15,
  requireUnlockOnResume: true,
  requireUnlockOnExport: false,
};

export default function SetupWizardDialog() {
  const [skipOpen, setSkipOpen] = useState(false);

  return (
    <>
      <WizardDialog
        open
        steps={[
          { title: 'Secure this device', content: Step1Intro },
          { title: 'Choose a method', content: Step2MethodPicker },
          { title: 'Set up your method', content: Step3Configure },
          { title: 'Lock behavior', content: Step4Behavior },
        ]}
        initialData={
          {
            selectedMethod: null,
            enrolmentCommitted: false,
            behavior: DEFAULT_BEHAVIOR,
          } satisfies WizardData
        }
        onDismiss={() => setSkipOpen(true)}
        onFinish={async (data: WizardData) => {
          // Persist behavior settings (vault is already committed at step 3).
          await persistBehaviorSettings(data.behavior);
        }}
      />
      <SkipConfirmation open={skipOpen} onClose={() => setSkipOpen(false)} />
    </>
  );
}
```

Implement `persistBehaviorSettings` inline (or as a private helper in the same file). It writes the three behavior fields via the existing settings DB API:

```ts
import { setSettings } from '../lib/db/api'; // or whichever module exposes the settings writer

async function persistBehaviorSettings(
  behavior: WizardData['behavior'],
): Promise<void> {
  await setSettings({
    idleTimeoutMinutes: behavior.idleTimeoutMinutes,
    requireUnlockOnResume: behavior.requireUnlockOnResume,
    requireUnlockOnExport: behavior.requireUnlockOnExport,
  });
}
```

The exact settings-writer name and import path may differ — confirm against `apps/interviewer-v7/src/lib/db/api.ts`.

- [ ] **Step 3: Create stub step files**

For each of `Step1Intro.tsx`, `Step2MethodPicker.tsx`, `Step3Configure.tsx`, `Step4Behavior.tsx`, `SkipConfirmation.tsx` create a minimal placeholder so the wizard compiles:

```tsx
// apps/interviewer-v7/src/components/SetupWizard/Step1Intro.tsx
export default function Step1Intro() {
  return <div>Step 1 — Intro (todo: Task 17)</div>;
}
```

Repeat with stubbed text for each step file. (These get fleshed out in subsequent tasks.)

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/src/components/SetupWizardDialog.tsx apps/interviewer-v7/src/components/SetupWizard
git commit -m "feat(interviewer-v7): scaffold SetupWizardDialog and stub step components"
```

---

## Phase 9 — Wizard step contents

### Task 17: Step 1 — Intro + alert

**Files:**

- Modify: `apps/interviewer-v7/src/components/SetupWizard/Step1Intro.tsx`

- [ ] **Step 1: Implement Step1Intro**

```tsx
import { Alert, Heading } from '@codaco/fresco-ui'; // adjust to match exports
import { useWizard } from '@codaco/fresco-ui';

import { isElectron } from '../../lib/platform/platform';
import type { WizardData } from '../SetupWizardDialog';

const ELECTRON_ALERT = `If you do not enable security, your data will be stored without encryption on this device. Anyone with access to this device or its files will be able to read all collected data.`;

const MOBILE_ALERT = `Even without app security, your data is sandboxed by the operating system and is not directly accessible to other apps. Enabling app security adds protection if the device itself is unlocked and physically accessed by someone else.`;

export default function Step1Intro() {
  const wizard = useWizard();

  return (
    <div className="flex flex-col gap-4">
      <Heading level={2}>Secure this device</Heading>
      <p>
        Choose how this device should be secured. Biometric, PIN, and passphrase
        each protect access to the app. You can change or remove this protection
        later from Settings.
      </p>
      <Alert variant={isElectron ? 'warning' : 'info'}>
        {isElectron ? ELECTRON_ALERT : MOBILE_ALERT}
      </Alert>
      <div className="flex justify-end">
        <button
          type="button"
          className="text-link"
          onClick={() => {
            // SetupWizardDialog owns the SkipConfirmation; signal via wizard data or escalate by closing the wizard dialog. Easiest: use the wizard's dismiss path.
            // The fresco-ui WizardDialog should expose a `dismiss()` on the context — confirm against the actual API and replace.
            wizard.setStepData({ requestedSkip: true });
          }}
        >
          Continue without security
        </button>
      </div>
    </div>
  );
}
```

`SetupWizardDialog.tsx` watches `wizard.data.requestedSkip` and triggers the skip flow when it flips to `true`. Adjust the exact signalling mechanism to whatever fresco-ui's `WizardContext` API supports — `setStepData` is a guess based on `useWizard.tsx`. If the real API exposes a `dismiss()` callback or similar, prefer that.

- [ ] **Step 2: Read the actual WizardDialog API and finalise**

Open `packages/fresco-ui/src/dialogs/Wizard*.tsx` (whichever file the dialog component lives in). Read the prop surface and the context. Adjust both `Step1Intro.tsx` and `SetupWizardDialog.tsx` to use the actual mechanism for signalling dismiss from inside a step.

- [ ] **Step 3: Typecheck + lint + commit**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
git add apps/interviewer-v7/src/components/SetupWizard/Step1Intro.tsx apps/interviewer-v7/src/components/SetupWizardDialog.tsx
git commit -m "feat(interviewer-v7): wizard step 1 (intro + platform-aware alert)"
```

---

### Task 18: `SkipConfirmation`

**Files:**

- Modify: `apps/interviewer-v7/src/components/SetupWizard/SkipConfirmation.tsx`

- [ ] **Step 1: Implement SkipConfirmation**

```tsx
import { useEffect, useState } from 'react';

import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
} from '@codaco/fresco-ui'; // adjust to actual exports

import * as authApi from '../../lib/auth/api';
import { isElectron } from '../../lib/platform/platform';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SkipConfirmation({ open, onClose }: Props) {
  const [hasExistingEnrolment, setHasExistingEnrolment] = useState(false);
  const [affirmed, setAffirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAffirmed(false);
    setError(null);
    void authApi.status().then((s) => {
      setHasExistingEnrolment(Boolean(s.configured) && s.mode !== 'none');
    });
  }, [open]);

  const headline = hasExistingEnrolment
    ? 'Cancel security setup? Your selected method will be removed and your data will be unencrypted.'
    : 'Continue without app security?';

  const canConfirm = !submitting && (!isElectron || affirmed);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (hasExistingEnrolment) {
        await authApi.revoke();
      }
      const r = await authApi.enrolWithoutLock();
      if (!r.ok) {
        setError(r.message ?? 'Could not save your choice');
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <p>{headline}</p>
        {isElectron && (
          <label className="flex items-start gap-2">
            <Checkbox
              checked={affirmed}
              onCheckedChange={(c) => setAffirmed(Boolean(c))}
            />
            <span>
              I understand that data on this device will not be encrypted at the
              app layer.
            </span>
          </label>
        )}
        {error && <Alert variant="warning">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Go back
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {hasExistingEnrolment
              ? 'Cancel setup'
              : 'Continue without security'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Adjust imports to fresco-ui's actual exports. If `Checkbox` lives elsewhere, use the right import.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
git add apps/interviewer-v7/src/components/SetupWizard/SkipConfirmation.tsx
git commit -m "feat(interviewer-v7): wizard skip-confirmation sub-dialog (platform-aware)"
```

---

### Task 19: Step 2 — Method picker

**Files:**

- Modify: `apps/interviewer-v7/src/components/SetupWizard/Step2MethodPicker.tsx`

- [ ] **Step 1: Implement Step2MethodPicker**

```tsx
import { useEffect, useState } from 'react';

import { RichSelectGroup } from '@codaco/fresco-ui';
import { useWizard } from '@codaco/fresco-ui';

import { isAuthenticatorSupported } from '../../lib/auth/api';
import { isBiometricNativeAvailable } from '../../lib/auth/biometricNative';
import { isCapacitor } from '../../lib/platform/platform';
import type { WizardSelectedMethod } from '../SetupWizardDialog';

type BiometricAvailability =
  | { ok: true }
  | {
      ok: false;
      reason: 'no-hardware' | 'not-enrolled' | 'no-device-passcode' | 'unknown';
    };

const REASON_TEXT: Record<
  'no-hardware' | 'not-enrolled' | 'no-device-passcode' | 'unknown',
  string
> = {
  'no-hardware': 'No biometric sensor available on this device',
  'not-enrolled': 'No biometric is enrolled in this device',
  'no-device-passcode': 'Set a device passcode first',
  'unknown': 'Biometric authentication is not available',
};

export default function Step2MethodPicker() {
  const wizard = useWizard();
  const [biometric, setBiometric] = useState<BiometricAvailability>({
    ok: false,
    reason: 'unknown',
  });

  useEffect(() => {
    void (async () => {
      if (isCapacitor) {
        setBiometric(await isBiometricNativeAvailable());
      } else {
        setBiometric(
          isAuthenticatorSupported()
            ? { ok: true }
            : { ok: false, reason: 'no-hardware' },
        );
      }
    })();
  }, []);

  const selectedMethod = (wizard.data.selectedMethod ??
    null) as WizardSelectedMethod | null;

  const options = [
    {
      value: 'biometric',
      label: 'Biometric authentication',
      description: biometric.ok
        ? 'Use Face ID, Touch ID, Windows Hello, or another biometric sensor on this device.'
        : REASON_TEXT[biometric.reason],
      disabled: !biometric.ok,
    },
    {
      value: 'pin',
      label: 'PIN code',
      description: 'An 8-digit numeric PIN.',
    },
    {
      value: 'passphrase',
      label: 'Passphrase',
      description: 'A password of at least 12 characters.',
    },
  ];

  return (
    <RichSelectGroup
      orientation="vertical"
      options={options}
      value={selectedMethod ?? undefined}
      onChange={(v) => {
        wizard.setStepData({ selectedMethod: v });
        wizard.setNextEnabled(true);
      }}
    />
  );
}
```

If fresco-ui's `useWizard` exposes a different way to enable/disable the Next button, adjust accordingly. The intent: Next is disabled until a method is selected.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
git add apps/interviewer-v7/src/components/SetupWizard/Step2MethodPicker.tsx
git commit -m "feat(interviewer-v7): wizard step 2 (method picker with availability detection)"
```

---

### Task 20: Step 3 — Configure (three sub-views + read-only revisit)

**Files:**

- Modify: `apps/interviewer-v7/src/components/SetupWizard/Step3Configure.tsx`
- Create: `apps/interviewer-v7/src/components/SetupWizard/Step3BiometricConfigure.tsx`
- Create: `apps/interviewer-v7/src/components/SetupWizard/Step3PinConfigure.tsx`
- Create: `apps/interviewer-v7/src/components/SetupWizard/Step3PassphraseConfigure.tsx`

- [ ] **Step 1: Implement the router (`Step3Configure.tsx`)**

```tsx
import { useState } from 'react';

import { Button } from '@codaco/fresco-ui';
import { useWizard } from '@codaco/fresco-ui';

import Step3BiometricConfigure from './Step3BiometricConfigure';
import Step3PassphraseConfigure from './Step3PassphraseConfigure';
import Step3PinConfigure from './Step3PinConfigure';
import type { WizardSelectedMethod } from '../SetupWizardDialog';

export default function Step3Configure() {
  const wizard = useWizard();
  const method = wizard.data.selectedMethod as WizardSelectedMethod | null;
  const enrolmentCommitted = Boolean(wizard.data.enrolmentCommitted);
  const [editing, setEditing] = useState(!enrolmentCommitted);

  if (!method) return null;

  if (enrolmentCommitted && !editing) {
    return (
      <div className="flex flex-col gap-4">
        <p>
          {method === 'biometric' && 'Biometric is configured.'}
          {method === 'pin' && 'PIN is configured.'}
          {method === 'passphrase' && 'Passphrase is configured.'}
        </p>
        <div>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  switch (method) {
    case 'biometric':
      return <Step3BiometricConfigure />;
    case 'pin':
      return <Step3PinConfigure />;
    case 'passphrase':
      return <Step3PassphraseConfigure />;
    default:
      return null;
  }
}
```

- [ ] **Step 2: Implement `Step3BiometricConfigure.tsx`**

```tsx
import { useEffect, useState } from 'react';

import { Alert, Button, Checkbox } from '@codaco/fresco-ui';
import { useWizard } from '@codaco/fresco-ui';

import * as authApi from '../../lib/auth/api';
import { isCapacitor, isElectron } from '../../lib/platform/platform';

export default function Step3BiometricConfigure() {
  const wizard = useWizard();
  const [affirmed, setAffirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    wizard.setNextEnabled(false);
    wizard.setBeforeNext(async () => {
      if (!affirmed) return false;
      setSubmitting(true);
      try {
        const status = await authApi.status();
        if (status.configured && status.mode !== 'none') {
          await authApi.revoke();
        }
        const result = isCapacitor
          ? await authApi.enrolWithBiometricNative()
          : await authApi.enrol();
        if (!result.ok) {
          setError(result.message ?? 'Biometric enrolment failed');
          return false;
        }
        wizard.setStepData({ enrolmentCommitted: true });
        return true;
      } finally {
        setSubmitting(false);
      }
    });
    return () => wizard.setBeforeNext(null);
  }, [affirmed, wizard]);

  useEffect(() => {
    wizard.setNextEnabled(affirmed && !submitting);
  }, [affirmed, submitting, wizard]);

  return (
    <div className="flex flex-col gap-4">
      <p>
        You'll be prompted to use your device's biometric sensor when you click
        Next.
      </p>
      <label className="flex items-start gap-2">
        <Checkbox
          checked={affirmed}
          onCheckedChange={(c) => setAffirmed(Boolean(c))}
        />
        <span>I understand there is no recovery.</span>
      </label>
      {error && <Alert variant="warning">{error}</Alert>}
    </div>
  );
}
```

- [ ] **Step 3: Implement `Step3PinConfigure.tsx`**

```tsx
import { useEffect, useState } from 'react';

import { Alert, Checkbox, InputField } from '@codaco/fresco-ui';
import { useWizard } from '@codaco/fresco-ui';

import * as authApi from '../../lib/auth/api';

export default function Step3PinConfigure() {
  const wizard = useWizard();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const valid =
    /^\d{8}$/.test(pin) && pin === confirm && affirmed && !submitting;

  useEffect(() => {
    wizard.setNextEnabled(valid);
    wizard.setBeforeNext(async () => {
      if (!valid) return false;
      setSubmitting(true);
      try {
        const status = await authApi.status();
        if (status.configured && status.mode !== 'none') {
          await authApi.revoke();
        }
        const result = await authApi.enrolWithPin(pin);
        if (!result.ok) {
          setError(result.message ?? 'PIN setup failed');
          return false;
        }
        wizard.setStepData({ enrolmentCommitted: true });
        return true;
      } finally {
        setSubmitting(false);
      }
    });
    return () => wizard.setBeforeNext(null);
  }, [pin, confirm, affirmed, valid, wizard]);

  return (
    <div className="flex flex-col gap-4">
      <InputField
        label="Enter PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
        inputMode="numeric"
        maxLength={8}
        autoComplete="off"
      />
      <InputField
        label="Confirm PIN"
        value={confirm}
        onChange={(e) =>
          setConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))
        }
        inputMode="numeric"
        maxLength={8}
        autoComplete="off"
      />
      <label className="flex items-start gap-2">
        <Checkbox
          checked={affirmed}
          onCheckedChange={(c) => setAffirmed(Boolean(c))}
        />
        <span>I understand there is no recovery.</span>
      </label>
      {error && <Alert variant="warning">{error}</Alert>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `Step3PassphraseConfigure.tsx`**

```tsx
import { useEffect, useState } from 'react';

import { Alert, Checkbox, PasswordField } from '@codaco/fresco-ui';
import { useWizard } from '@codaco/fresco-ui';
import { getPasswordStrength } from '@codaco/fresco-ui'; // adjust path if not re-exported

import * as authApi from '../../lib/auth/api';

export default function Step3PassphraseConfigure() {
  const wizard = useWizard();
  const [phrase, setPhrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strong = getPasswordStrength(phrase).score >= 3;
  const lengthOk = phrase.length >= 12;
  const valid =
    lengthOk && strong && phrase === confirm && affirmed && !submitting;

  useEffect(() => {
    wizard.setNextEnabled(valid);
    wizard.setBeforeNext(async () => {
      if (!valid) return false;
      setSubmitting(true);
      try {
        const status = await authApi.status();
        if (status.configured && status.mode !== 'none') {
          await authApi.revoke();
        }
        const result = await authApi.enrolWithPassphrase(phrase);
        if (!result.ok) {
          setError(result.message ?? 'Passphrase setup failed');
          return false;
        }
        wizard.setStepData({ enrolmentCommitted: true });
        return true;
      } finally {
        setSubmitting(false);
      }
    });
    return () => wizard.setBeforeNext(null);
  }, [phrase, confirm, affirmed, valid, wizard]);

  return (
    <div className="flex flex-col gap-4">
      <PasswordField
        label="Enter passphrase"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        showStrengthMeter
      />
      <PasswordField
        label="Confirm passphrase"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <label className="flex items-start gap-2">
        <Checkbox
          checked={affirmed}
          onCheckedChange={(c) => setAffirmed(Boolean(c))}
        />
        <span>I understand there is no recovery.</span>
      </label>
      {error && <Alert variant="warning">{error}</Alert>}
    </div>
  );
}
```

The `getPasswordStrength` import path may need to change — if it isn't re-exported from `@codaco/fresco-ui`, import directly from `@codaco/fresco-ui/src/form/fields/getPasswordStrength` or expose it from the package. (Spec gave permission to update `PasswordField`/related; expose if needed.)

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
git add apps/interviewer-v7/src/components/SetupWizard
git commit -m "feat(interviewer-v7): wizard step 3 (configure biometric/PIN/passphrase + read-only revisit)"
```

---

### Task 21: Step 4 — Behavior

**Files:**

- Modify: `apps/interviewer-v7/src/components/SetupWizard/Step4Behavior.tsx`

- [ ] **Step 1: Implement Step4Behavior**

```tsx
import { useEffect } from 'react';

import { RichSelectGroup, Switch } from '@codaco/fresco-ui';
import { useWizard } from '@codaco/fresco-ui';

import type { WizardData } from '../SetupWizardDialog';

const TIMEOUT_OPTIONS = [
  { value: 1, label: '1 minute' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

export default function Step4Behavior() {
  const wizard = useWizard();
  const behavior = wizard.data.behavior as WizardData['behavior'];

  useEffect(() => {
    wizard.setNextEnabled(true);
    wizard.setNextLabel('Finish');
    return () => wizard.setNextLabel('Next');
  }, [wizard]);

  const update = (patch: Partial<WizardData['behavior']>) =>
    wizard.setStepData({ behavior: { ...behavior, ...patch } });

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend>Auto-lock after</legend>
        <RichSelectGroup
          orientation="vertical"
          value={behavior.idleTimeoutMinutes}
          onChange={(v) =>
            update({ idleTimeoutMinutes: Number(v) as 1 | 5 | 15 | 30 | 60 })
          }
          options={TIMEOUT_OPTIONS}
        />
      </fieldset>
      <label className="flex items-center justify-between">
        <span>Require unlock before resuming an interview</span>
        <Switch
          checked={behavior.requireUnlockOnResume}
          onCheckedChange={(c) => update({ requireUnlockOnResume: c })}
        />
      </label>
      <label className="flex items-center justify-between">
        <span>Require unlock before exporting data</span>
        <Switch
          checked={behavior.requireUnlockOnExport}
          onCheckedChange={(c) => update({ requireUnlockOnExport: c })}
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint + commit**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
git add apps/interviewer-v7/src/components/SetupWizard/Step4Behavior.tsx
git commit -m "feat(interviewer-v7): wizard step 4 (behavior settings)"
```

---

## Phase 10 — Wire wizard into AuthGate

### Task 22: Update `AuthGate` and delete `SetupScreen`

**Files:**

- Modify: `apps/interviewer-v7/src/components/AuthGate.tsx`
- Delete: `apps/interviewer-v7/src/components/SetupScreen.tsx`

- [ ] **Step 1: Update AuthGate**

Read existing AuthGate (small file):

```bash
cat apps/interviewer-v7/src/components/AuthGate.tsx
```

Replace the branch that returned `<SetupScreen/>` with:

```tsx
import BrandedBackdrop from './BrandedBackdrop'; // or StageBackground with the setup variant
import SetupWizardDialog from './SetupWizardDialog';

// ...

if (state.kind === 'unconfigured') {
  return (
    <>
      <BrandedBackdrop />
      <SetupWizardDialog />
    </>
  );
}
```

Other branches (`loading`, `locked`, `unlocked`) stay as-is.

- [ ] **Step 2: Delete `SetupScreen.tsx`**

```bash
git rm apps/interviewer-v7/src/components/SetupScreen.tsx
```

Verify no remaining imports:

```bash
grep -rn "SetupScreen" apps/interviewer-v7/src
```

Expected: no matches.

- [ ] **Step 3: Manual smoke test**

```bash
pnpm --filter @codaco/interviewer-v7 dev
```

If a dev vault exists, clear it (delete the vault file on Electron / `localStorage.clear()` in web devtools / clear Capacitor Preferences in simulator) so you land on `unconfigured`. The wizard should appear over the blob backdrop.

Walk through:

1. Step 1 → Continue without security → SkipConfirmation appears → Confirm → Home renders.
2. Reset, Step 1 → Next → Step 2 → Pick PIN → Next → Step 3 → enter 8 digits twice + affirm → Next → Step 3 commits + Step 4 appears → Finish.
3. Quit/relaunch — LockScreen with PIN form appears. Unlock works.
4. Reset, repeat with Passphrase.
5. (Capacitor only — defer until Phase 11) Repeat with Biometric.

- [ ] **Step 4: Typecheck + lint + commit**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
git add apps/interviewer-v7/src/components/AuthGate.tsx
git commit -m "feat(interviewer-v7): replace SetupScreen with SetupWizardDialog in AuthGate"
```

---

## Phase 11 — Settings UI

### Task 23: Add "Lock behavior" section to `Settings.tsx`

**Files:**

- Modify: `apps/interviewer-v7/src/routes/Settings.tsx`

- [ ] **Step 1: Read current Settings**

```bash
grep -n "idleTimeoutMinutes\|Manage authenticator" apps/interviewer-v7/src/routes/Settings.tsx
```

- [ ] **Step 2: Add a "Lock behavior" section**

Group the existing `idleTimeoutMinutes` control with the two new switches. Compose:

```tsx
const settings = useSettings(); // existing hook
const { state } = useAuth();
const modeLocked = state.kind === 'unlocked' && state.mode !== 'none';

<section>
  <Heading level={3}>Lock behavior</Heading>
  {!modeLocked && (
    <Alert variant="info">
      Enable app security to use these options.
      <Button variant="link" onClick={() => authApi.revoke()}>
        Set up security
      </Button>
    </Alert>
  )}
  <RichSelectGroup
    orientation="vertical"
    options={TIMEOUT_OPTIONS}
    value={settings.idleTimeoutMinutes}
    onChange={(v) =>
      setSettings({ idleTimeoutMinutes: Number(v) as 1 | 5 | 15 | 30 | 60 })
    }
    disabled={!modeLocked}
  />
  <Switch
    checked={settings.requireUnlockOnResume}
    onCheckedChange={(c) => setSettings({ requireUnlockOnResume: c })}
    disabled={!modeLocked}
    label="Require unlock before resuming an interview"
  />
  <Switch
    checked={settings.requireUnlockOnExport}
    onCheckedChange={(c) => setSettings({ requireUnlockOnExport: c })}
    disabled={!modeLocked}
    label="Require unlock before exporting data"
  />
</section>;
```

Keep the existing `Manage authenticator` block in place.

- [ ] **Step 3: Typecheck + lint + smoke**

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
pnpm --filter @codaco/interviewer-v7 dev
```

Manual: go to Settings; toggle the switches; verify they persist across reload.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/src/routes/Settings.tsx
git commit -m "feat(interviewer-v7): add Lock behavior section to Settings"
```

---

## Phase 12 — Docs

### Task 24: Update `apps/interviewer-v7/CLAUDE.md`

**Files:**

- Modify: `apps/interviewer-v7/CLAUDE.md`

- [ ] **Step 1: Update the "Three auth modes" invariant**

Find the "Three auth modes, never combined" bullet. Replace with:

```markdown
- **Five auth modes, never combined.** A vault is one of:
  - `webauthn` — PRF unwraps a wrapped DEK; SQLCipher key on Electron. Used on Electron and web for "Biometric authentication".
  - `biometric-native` — Capacitor-only; native plugin (`@aparajita/capacitor-biometric-auth`) wraps LAContext / BiometricPrompt. Pure gate, no key derivation — at-rest protection is the OS sandbox. Used on iOS / Android for "Biometric authentication".
  - `pin` — exactly 8 digits, PBKDF2-HMAC-SHA256 (600k iterations, 32-byte salt) → KEK that unwraps the DEK on Electron; verifier-only on web/Capacitor.
  - `passphrase` — min 12 characters, ≥ 3 character classes, same PBKDF2 envelope as PIN.
  - `none` — no app-layer protection; Electron opens the DB as plain SQLite via `openDatabasePlain()`, web/Capacitor relies entirely on platform at-rest protections.

  The renderer prefers WebAuthn on Electron/web and the Capacitor plugin on iOS/Android when the corresponding availability check succeeds. Switching between modes requires `revoke()` first (data is wiped). The setup wizard offers all five paths at first launch.
```

- [ ] **Step 2: Update Source Surface table entries**

Add rows for `src/lib/auth/biometricNative.ts`, `src/lib/auth/StepUpAuthProvider.tsx`, `src/lib/auth/StepUpAuthDialog.tsx`, `src/components/SetupWizardDialog.tsx`, `src/components/SetupWizard/`, `src/components/UnlockForms/`, `src/components/BrandedBackdrop.tsx`. Remove the `SetupScreen.tsx` entry.

Update the `src/lib/auth/` row description so it covers the new files and the verify family.

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v7/CLAUDE.md
git commit -m "docs(interviewer-v7): update auth-mode invariant and source surface"
```

---

## Final verification

After Task 24, run the full repo check:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Then smoke-test on the actual platforms:

- **Web (`pnpm --filter @codaco/interviewer-v7 dev`)**: wizard at first launch; pick each method; verify LockScreen unlock; verify Settings toggles; verify step-up dialog on Interview resume + Export.
- **Electron (`pnpm --filter @codaco/interviewer-v7 electron:dev`)**: same checks, plus verify SQLCipher DB is created/opened correctly under each mode (look for the encrypted file in the app data dir).
- **iOS (`pnpm --filter @codaco/interviewer-v7 capacitor:dev:ios`)**: verify Face/Touch ID prompt fires for `biometric-native` enrol and unlock; verify the unavailable-reason text on a simulator without enrolled biometrics.
- **Android (`pnpm --filter @codaco/interviewer-v7 capacitor:dev:android`)**: same as iOS for `BiometricPrompt`.
