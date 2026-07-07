## Phase E: Auth rebuild + UI wiring (spec Workstream B, app integration)

This section rebuilds the renderer auth surface on top of the Phase C vault (`src/lib/vault/vault.ts`) and the Phase D session-DEK holder (`src/lib/db/sessionKey.ts`), and rewires the WebAuthn biometric + recovery-passphrase UI. It assumes the native teardown (Phase A) has already deleted `electron.ts`, `biometricNative.ts`, `useBiometric.ts`'s native branch, and the Capacitor imports.

> **Plan-header constraints apply to every task below:** No `any`, no `as` bypass. No barrel files, no convenience re-exports. oxlint + oxfmt (2-space, single quotes); `pnpm lint:fix` from repo root before each commit. Vitest unit project only; run `pnpm --filter @codaco/interviewer-v8 test`. No changeset. No local e2e. TDD; each task ends with a commit (no `Co-Authored-By`). Web Crypto only. Single-user invariant: `installationId` is the device handle, never a user id. **Reload re-locks is intended** — the session DEK lives only in memory.

Here is the section:

---

## Phase E: Auth rebuild + UI wiring

Rebuilds `src/lib/auth/api.ts` to delegate to the Phase C `vault.ts` surface and drive the Phase D `sessionKey.ts` holder; reworks `AuthContext` to hold no raw DEK and to use the new mode set (`'pin' | 'passphrase' | 'biometric' | 'none'`); and rewires the SetupWizard biometric step, LockScreen/UnlockForms, and StepUp/ManageAuthenticator onto WebAuthn + recovery passphrase.

**Consumes from earlier phases (contract-fixed signatures):**

- `src/lib/vault/vault.ts` — `enrolNone`, `enrolPin(pin)`, `enrolPassphrase(phrase)`, `enrolBiometric(recoveryPhrase)`, `unlockPin(pin)`, `unlockPassphrase(phrase)`, `unlockBiometric()`, `unlockRecovery(phrase)`, `verifyPin(pin)`, `verifyPassphrase(phrase)`, `verifyBiometric()`, `vaultStatus()`, `revoke()`, and the types `UnlockResult`, `EnrolResult`, `VaultMode`.
- `src/lib/vault/webauthn.ts` — `isPrfSupported()`.
- `src/lib/db/sessionKey.ts` — `setSessionDek(dek | null)`, `getSessionDek()`.

---

### Task E1: Rebuild `auth/api.ts` onto the vault + session-DEK holder

**Files:**

- Modify: `apps/interviewer-v8/src/lib/auth/api.ts` (replace the whole module)
- Modify: `apps/interviewer-v8/src/global.d.ts` (narrow the ambient `AuthStatus.mode` union to the new set)
- Delete: `apps/interviewer-v8/src/lib/auth/vaultMetadata.ts` and `apps/interviewer-v8/src/lib/auth/__tests__/vaultMetadata.test.ts`
- Delete: `apps/interviewer-v8/src/lib/auth/__tests__/passphrase.test.ts` (its assertions — `sessionStorage.clear()` re-locks, `verifierB64` metadata — describe the retired model; replaced by E1's suite)
- Delete: `apps/interviewer-v8/src/lib/auth/__tests__/revoke.test.ts` (rewritten as part of this suite so it drives `revoke()` through the vault, not `vaultMetadata`)
- Create: `apps/interviewer-v8/src/lib/auth/__tests__/api.test.ts`

**Interfaces:**

- Consumes: everything in the vault + sessionKey contracts above.
- Produces (the surface `AuthContext`/StepUp/wizard consume):

  ```ts
  export type AuthMode = 'pin' | 'passphrase' | 'biometric' | 'none';
  export type AuthResult = { ok: boolean; message?: string };
  export function isBiometricSupported(): Promise<boolean>;
  export function status(): Promise<AuthStatus>;
  export function enrolWithoutLock(): Promise<AuthResult>;
  export function enrolWithPin(pin: string): Promise<AuthResult>;
  export function enrolWithPassphrase(phrase: string): Promise<AuthResult>;
  export function enrolWithBiometric(
    recoveryPhrase: string,
  ): Promise<AuthResult>;
  export function unlockWithPin(pin: string): Promise<AuthResult>;
  export function unlockWithPassphrase(phrase: string): Promise<AuthResult>;
  export function unlockWithBiometric(): Promise<AuthResult>;
  export function unlockWithRecovery(phrase: string): Promise<AuthResult>;
  export function verifyWithPin(pin: string): Promise<AuthResult>;
  export function verifyWithPassphrase(phrase: string): Promise<AuthResult>;
  export function verifyBiometric(): Promise<AuthResult>;
  export function lock(): Promise<void>;
  export function revoke(): Promise<void>;
  ```

  The unlock/enrol functions call `setSessionDek(dek)` on success; `lock` calls `setSessionDek(null)`. `revoke()` **wipes participant data** — it drops the Dexie data DB (`db.delete`) BEFORE clearing the vault record (`vault.revoke()`, which clears the localStorage vault record + best-effort passkey delete), then `setSessionDek(null)`. The data DB is dropped here in Phase E, not deferred to any later phase. There is no `sessionStorage` unlock flag — locked ⟺ `getSessionDek() === null` for a secured mode. A reload drops module + memory state, so the app re-locks. `re-enrol` is removed from this surface (mode switching is `revoke()` — which wipes data + deletes the passkey best-effort — then re-run setup, per spec §"Auth modes"); `ManageAuthenticator` is reworked in E6 accordingly.

- [ ] **Step 1: Write the failing test**

```ts
// apps/interviewer-v8/src/lib/auth/__tests__/api.test.ts
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isPrfSupported = vi.fn<() => Promise<boolean>>();
vi.mock('../../vault/webauthn', () => ({ isPrfSupported }));

import { db } from '../../db/db';
import { getSessionDek, setSessionDek } from '../../db/sessionKey';
import type { StoredSession } from '../../db/types';
import { clearVault } from '../../vault/vaultStore';
import * as authApi from '../api';

const STRONG = 'Tr0ub4dor&3-clever';

const SESSION_ROW: StoredSession = {
  id: 'to-wipe',
  protocolHash: 'hash',
  protocolName: 'Protocol',
  caseId: 'case-1',
  startedAt: '2026-07-01T00:00:00.000Z',
  lastUpdatedAt: '2026-07-01T00:00:00.000Z',
  finishedAt: null,
  exportedAt: null,
  currentStep: 0,
  network: { nodes: [], edges: [], ego: { _uid: 'ego-1', attributes: {} } },
};

beforeEach(() => {
  clearVault();
  setSessionDek(null);
  isPrfSupported.mockReset();
  isPrfSupported.mockResolvedValue(false);
});
afterEach(() => {
  clearVault();
  setSessionDek(null);
});

describe('auth/api — status + none mode', () => {
  it('reports unconfigured before enrolment', async () => {
    const s = await authApi.status();
    expect(s.configured).toBe(false);
  });

  it('enrolWithoutLock configures mode none and leaves the DEK null (mode none is never "locked")', async () => {
    const r = await authApi.enrolWithoutLock();
    expect(r.ok).toBe(true);
    const s = await authApi.status();
    expect(s).toEqual({ configured: true, locked: false, mode: 'none' });
    expect(getSessionDek()).toBeNull();
  });
});

describe('auth/api — pin mode delegates to the vault + sets the session DEK', () => {
  it('rejects a non-8-digit PIN via the vault validator', async () => {
    const r = await authApi.enrolWithPin('123');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/8 digits/i);
  });

  it('enrol holds the DEK; a simulated reload (fresh sessionKey) re-locks; unlock re-derives it', async () => {
    expect((await authApi.enrolWithPin('12345678')).ok).toBe(true);
    expect(getSessionDek()).not.toBeNull();
    const s1 = await authApi.status();
    expect(s1).toMatchObject({ configured: true, locked: false, mode: 'pin' });

    // Simulate reload: the in-memory DEK is gone but the vault record persists.
    setSessionDek(null);
    const s2 = await authApi.status();
    expect(s2).toMatchObject({ configured: true, locked: true, mode: 'pin' });

    expect((await authApi.unlockWithPin('99999999')).ok).toBe(false);
    expect(getSessionDek()).toBeNull();
    expect((await authApi.unlockWithPin('12345678')).ok).toBe(true);
    expect(getSessionDek()).not.toBeNull();
  });

  it('lock() clears the session DEK without dropping the vault record', async () => {
    await authApi.enrolWithPin('12345678');
    await authApi.lock();
    expect(getSessionDek()).toBeNull();
    expect((await authApi.status()).locked).toBe(true);
    expect((await authApi.unlockWithPin('12345678')).ok).toBe(true);
  });

  it('verifyWithPin re-checks without touching the gate', async () => {
    await authApi.enrolWithPin('12345678');
    await authApi.lock();
    expect((await authApi.verifyWithPin('12345678')).ok).toBe(true);
    // verify must NOT unlock the gate.
    expect(getSessionDek()).toBeNull();
    expect((await authApi.verifyWithPin('00000000')).ok).toBe(false);
  });
});

describe('auth/api — passphrase mode', () => {
  it('rejects a weak passphrase and unlocks a strong one', async () => {
    expect((await authApi.enrolWithPassphrase('short')).ok).toBe(false);
    expect((await authApi.enrolWithPassphrase(STRONG)).ok).toBe(true);
    setSessionDek(null);
    expect((await authApi.unlockWithPassphrase('wrong-but-strong-99')).ok).toBe(
      false,
    );
    expect((await authApi.unlockWithPassphrase(STRONG)).ok).toBe(true);
  });
});

describe('auth/api — isBiometricSupported delegates to the vault PRF check', () => {
  it('returns false when PRF is unsupported', async () => {
    isPrfSupported.mockResolvedValue(false);
    expect(await authApi.isBiometricSupported()).toBe(false);
  });
  it('returns true when PRF is supported', async () => {
    isPrfSupported.mockResolvedValue(true);
    expect(await authApi.isBiometricSupported()).toBe(true);
  });
});

describe('auth/api — revoke wipes and re-locks', () => {
  it('drops the encrypted data DB, the session DEK, and the vault record', async () => {
    await authApi.enrolWithPin('12345678');

    // A participant row exists in the encrypted data DB before revoke.
    await db.sessions.put(SESSION_ROW);
    expect(await db.sessions.get('to-wipe')).toBeDefined();

    const deleteSpy = vi.spyOn(db, 'delete');
    await authApi.revoke();

    // revoke() drops the whole Dexie data DB (participant data is wiped),
    // clears the vault record, and re-locks.
    expect(deleteSpy).toHaveBeenCalledWith({ disableAutoOpen: false });
    expect(await db.sessions.get('to-wipe')).toBeUndefined();
    expect(getSessionDek()).toBeNull();
    expect((await authApi.status()).configured).toBe(false);
    deleteSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/api.test.ts`
      Expected: FAIL — the current `api.ts` still imports `./electron`, `./biometricNative`, and `./vaultMetadata` (deleted in Phase A / this task) and exposes the old `unlockWithBiometricNative`/`reEnrolWithPin` surface with the `sessionStorage` flag; `enrolWithBiometric`/`unlockWithRecovery`/`isBiometricSupported`-via-vault do not yet exist.
- [ ] **Step 3: Implement**

```ts
// apps/interviewer-v8/src/lib/auth/api.ts
import { db } from '../db/db';
import { getSessionDek, setSessionDek } from '../db/sessionKey';
import { isPrfSupported } from '../vault/webauthn';
import * as vault from '../vault/vault';

export type AuthMode = 'pin' | 'passphrase' | 'biometric' | 'none';
export type AuthResult = { ok: boolean; message?: string };

function toAuthResult(result: vault.EnrolResult): AuthResult {
  return result.message === undefined
    ? { ok: result.ok }
    : { ok: result.ok, message: result.message };
}

// Unlock/enrol take custody of the freshly derived session DEK. A reload drops
// this module + the holder, which re-locks the app (spec: reload re-locks).
async function applyUnlock(result: vault.UnlockResult): Promise<AuthResult> {
  if (!result.ok) return { ok: false, message: result.message };
  setSessionDek(result.dek);
  return { ok: true };
}

// PRF availability gates biometric enrolment in the setup wizard.
export function isBiometricSupported(): Promise<boolean> {
  return isPrfSupported();
}

export async function status(): Promise<AuthStatus> {
  const s = vault.vaultStatus();
  if (!s.configured || !s.mode) {
    return { configured: false, locked: false };
  }
  if (s.mode === 'none') {
    return { configured: true, locked: false, mode: 'none' };
  }
  // Secured modes are locked whenever no session DEK is held (fresh load,
  // after lock/idle/blur). No persisted unlock flag exists any more.
  return { configured: true, locked: getSessionDek() === null, mode: s.mode };
}

export async function enrolWithoutLock(): Promise<AuthResult> {
  const result = await vault.enrolNone();
  if (result.ok) setSessionDek(null);
  return toAuthResult(result);
}

export async function enrolWithPin(pin: string): Promise<AuthResult> {
  const enrolled = await vault.enrolPin(pin);
  if (!enrolled.ok) return toAuthResult(enrolled);
  return applyUnlock(await vault.unlockPin(pin));
}

export async function enrolWithPassphrase(phrase: string): Promise<AuthResult> {
  const enrolled = await vault.enrolPassphrase(phrase);
  if (!enrolled.ok) return toAuthResult(enrolled);
  return applyUnlock(await vault.unlockPassphrase(phrase));
}

export async function enrolWithBiometric(
  recoveryPhrase: string,
): Promise<AuthResult> {
  const enrolled = await vault.enrolBiometric(recoveryPhrase);
  if (!enrolled.ok) return toAuthResult(enrolled);
  return applyUnlock(await vault.unlockBiometric());
}

export async function unlockWithPin(pin: string): Promise<AuthResult> {
  return applyUnlock(await vault.unlockPin(pin));
}

export async function unlockWithPassphrase(
  phrase: string,
): Promise<AuthResult> {
  return applyUnlock(await vault.unlockPassphrase(phrase));
}

export async function unlockWithBiometric(): Promise<AuthResult> {
  return applyUnlock(await vault.unlockBiometric());
}

export async function unlockWithRecovery(phrase: string): Promise<AuthResult> {
  return applyUnlock(await vault.unlockRecovery(phrase));
}

// Step-up verification: re-checks the secret / re-prompts biometrics WITHOUT
// changing the gate. Never calls setSessionDek — the session stays as it was.
export async function verifyWithPin(pin: string): Promise<AuthResult> {
  return toAuthResult(await vault.verifyPin(pin));
}

export async function verifyWithPassphrase(
  phrase: string,
): Promise<AuthResult> {
  return toAuthResult(await vault.verifyPassphrase(phrase));
}

export async function verifyBiometric(): Promise<AuthResult> {
  return toAuthResult(await vault.verifyBiometric());
}

export async function lock(): Promise<void> {
  setSessionDek(null);
}

export async function revoke(): Promise<void> {
  // Drop the encrypted data DB first, then clear the vault record. If we fail
  // mid-revoke, leaving the vault record keeps a recoverable "configured but
  // locked" state instead of an orphaned DB without a vault.
  await db.delete({ disableAutoOpen: false });
  await vault.revoke(); // clears the localStorage vault record + best-effort passkey delete
  setSessionDek(null);
}
```

Then narrow the ambient status type in `global.d.ts` so the renderer surface matches the new mode set:

```ts
// apps/interviewer-v8/src/global.d.ts — replace the AuthStatus.mode union
type AuthStatus = {
  configured: boolean;
  locked: boolean;
  mode?: 'pin' | 'passphrase' | 'biometric' | 'none';
};
```

Delete `src/lib/auth/vaultMetadata.ts`, `src/lib/auth/__tests__/vaultMetadata.test.ts`, and `src/lib/auth/__tests__/passphrase.test.ts`.

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/api.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/auth/api.ts apps/interviewer-v8/src/global.d.ts apps/interviewer-v8/src/lib/auth/__tests__/api.test.ts && \
git rm apps/interviewer-v8/src/lib/auth/vaultMetadata.ts apps/interviewer-v8/src/lib/auth/__tests__/vaultMetadata.test.ts apps/interviewer-v8/src/lib/auth/__tests__/passphrase.test.ts apps/interviewer-v8/src/lib/auth/__tests__/revoke.test.ts && \
git commit -m "refactor(interviewer-v8): rebuild auth/api onto the web vault + session DEK"
```

---

### Task E2: Rework `AuthContext` — new mode set, session-DEK custody, no leaked raw DEK

**Files:**

- Modify: `apps/interviewer-v8/src/lib/auth/AuthContext.tsx`
- Create: `apps/interviewer-v8/src/lib/auth/__tests__/AuthContext.test.tsx`

**Interfaces:**

- Consumes: the E1 `authApi` surface; `getSessionDek`/`setSessionDek` (via `authApi`, indirectly); `useIdleTimer` (unchanged).
- Produces (the `useAuth()` value the UI consumes):

  ```ts
  export type AuthMode = 'pin' | 'passphrase' | 'biometric' | 'none';
  export type AuthState = {
    kind: 'loading' | 'unconfigured' | 'locked' | 'unlocked';
    biometricSupported: boolean;
    mode?: AuthMode;
    idleTimeoutMinutes: IdleTimeoutMinutes;
  };
  // actions:
  refresh;
  lock;
  setIdleTimeoutMinutes;
  enrolWithoutLock;
  enrolWithPin;
  enrolWithPassphrase;
  enrolWithBiometric;
  unlockWithPin;
  unlockWithPassphrase;
  unlockWithBiometric;
  unlockWithRecovery;
  revoke;
  ```

  The provider holds **no** `CryptoKey` in React state — the DEK lives only in the `sessionKey` module (set by `authApi`). On lock/idle/blur it calls `authApi.lock()` (which clears the holder) then `refresh()`. The old `pinMetadata`/`passphraseMetadata`/`biometricNativeMetadata`/`authenticatorSupported`/`enrolAuthenticator`/`unlockWithAuthenticator`/`enrolWithBiometricNative`/`unlockWithBiometricNative`/`reEnrolWith*` members are removed (no vault record carries `enrolledAt`; mode switching is revoke-then-setup).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/interviewer-v8/src/lib/auth/__tests__/AuthContext.test.tsx
import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getSessionDek, setSessionDek } from '../../db/sessionKey';
import { clearVault } from '../../vault/vaultStore';
import * as authApi from '../api';
import { AuthProvider, useAuth } from '../AuthContext';

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="kind">{auth.kind}</span>
      <span data-testid="mode">{auth.mode ?? '-'}</span>
      <button onClick={() => void auth.enrolWithPin('12345678')}>enrol</button>
      <button onClick={() => void auth.lock()}>lock</button>
      <button onClick={() => void auth.unlockWithPin('12345678')}>
        unlock
      </button>
    </div>
  );
}

beforeEach(() => {
  clearVault();
  setSessionDek(null);
});
afterEach(() => {
  clearVault();
  setSessionDek(null);
});

describe('AuthProvider transitions', () => {
  it('starts unconfigured, moves to unlocked on enrol, and holds no DEK in React state', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unconfigured'),
    );

    await userEvent.click(screen.getByText('enrol'));
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('pin');
    // The DEK lives in the module holder, not in the provider's rendered state.
    expect(getSessionDek()).not.toBeNull();
  });

  it('lock clears the session DEK and flips to locked; unlock restores it', async () => {
    await authApi.enrolWithPin('12345678');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );

    await userEvent.click(screen.getByText('lock'));
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );
    expect(getSessionDek()).toBeNull();

    await userEvent.click(screen.getByText('unlock'));
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );
    expect(getSessionDek()).not.toBeNull();
  });

  it('a simulated reload (fresh holder, existing record) renders locked', async () => {
    await authApi.enrolWithPin('12345678');
    act(() => setSessionDek(null)); // reload drops the in-memory DEK
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('pin');
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/AuthContext.test.tsx`
      Expected: FAIL — the current `AuthContext` reads `vaultMetadata` (deleted) and the retired `AuthMode` union/actions; `enrolWithBiometric`/`unlockWithRecovery` and the session-DEK-driven `kind` do not exist yet.
- [ ] **Step 3: Implement**

```tsx
// apps/interviewer-v8/src/lib/auth/AuthContext.tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { getSettings, updateSettings } from '../db/api';
import { DEFAULT_SETTINGS } from '../db/types';
import * as authApi from './api';
import { useIdleTimer } from './idle';

export type AuthStateKind = 'loading' | 'unconfigured' | 'locked' | 'unlocked';
export type AuthMode = 'pin' | 'passphrase' | 'biometric' | 'none';
export type IdleTimeoutMinutes = 1 | 5 | 15 | 30 | 60;

export type AuthState = {
  kind: AuthStateKind;
  biometricSupported: boolean;
  mode?: AuthMode;
  idleTimeoutMinutes: IdleTimeoutMinutes;
};

type AuthActions = {
  refresh: () => Promise<void>;
  enrolWithoutLock: () => Promise<authApi.AuthResult>;
  enrolWithPin: (pin: string) => Promise<authApi.AuthResult>;
  enrolWithPassphrase: (phrase: string) => Promise<authApi.AuthResult>;
  enrolWithBiometric: (recoveryPhrase: string) => Promise<authApi.AuthResult>;
  unlockWithPin: (pin: string) => Promise<authApi.AuthResult>;
  unlockWithPassphrase: (phrase: string) => Promise<authApi.AuthResult>;
  unlockWithBiometric: () => Promise<authApi.AuthResult>;
  unlockWithRecovery: (phrase: string) => Promise<authApi.AuthResult>;
  lock: () => Promise<void>;
  revoke: () => Promise<void>;
  setIdleTimeoutMinutes: (minutes: IdleTimeoutMinutes) => Promise<void>;
};

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

// Lock 30s after window blur / tab hide, separate from the idle timeout — a
// brief grace period to alt-tab without losing the session. Disabled in dev
// (Vite live-reload constantly steals focus).
const BLUR_LOCK_DELAY_MS = import.meta.env.DEV ? null : 30_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    kind: 'loading',
    biometricSupported: false,
    idleTimeoutMinutes: DEFAULT_SETTINGS.idleTimeoutMinutes,
  });

  const refresh = useCallback(async () => {
    const biometricSupported = await authApi.isBiometricSupported();
    const s = await authApi.status();
    const kind: AuthStateKind = !s.configured
      ? 'unconfigured'
      : s.locked
        ? 'locked'
        : 'unlocked';

    let idleTimeoutMinutes: IdleTimeoutMinutes =
      DEFAULT_SETTINGS.idleTimeoutMinutes;
    if (kind === 'unlocked') {
      const settings = await getSettings();
      idleTimeoutMinutes =
        settings?.idleTimeoutMinutes ?? DEFAULT_SETTINGS.idleTimeoutMinutes;
    }

    setState({ kind, biometricSupported, mode: s.mode, idleTimeoutMinutes });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const lock = useCallback(async () => {
    await authApi.lock();
    await refresh();
  }, [refresh]);

  const idleTimeoutMs = state.idleTimeoutMinutes * 60_000;
  useIdleTimer({
    timeoutMs: idleTimeoutMs,
    enabled: state.kind === 'unlocked' && state.mode !== 'none',
    onIdle: () => {
      void lock();
    },
    lockOnBlurMs: state.mode === 'none' ? null : BLUR_LOCK_DELAY_MS,
  });

  const runAndRefresh = useCallback(
    async (op: () => Promise<authApi.AuthResult>) => {
      const result = await op();
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const enrolWithoutLock = useCallback(
    () => runAndRefresh(() => authApi.enrolWithoutLock()),
    [runAndRefresh],
  );
  const enrolWithPin = useCallback(
    (pin: string) => runAndRefresh(() => authApi.enrolWithPin(pin)),
    [runAndRefresh],
  );
  const enrolWithPassphrase = useCallback(
    (phrase: string) =>
      runAndRefresh(() => authApi.enrolWithPassphrase(phrase)),
    [runAndRefresh],
  );
  const enrolWithBiometric = useCallback(
    (recoveryPhrase: string) =>
      runAndRefresh(() => authApi.enrolWithBiometric(recoveryPhrase)),
    [runAndRefresh],
  );
  const unlockWithPin = useCallback(
    (pin: string) => runAndRefresh(() => authApi.unlockWithPin(pin)),
    [runAndRefresh],
  );
  const unlockWithPassphrase = useCallback(
    (phrase: string) =>
      runAndRefresh(() => authApi.unlockWithPassphrase(phrase)),
    [runAndRefresh],
  );
  const unlockWithBiometric = useCallback(
    () => runAndRefresh(() => authApi.unlockWithBiometric()),
    [runAndRefresh],
  );
  const unlockWithRecovery = useCallback(
    (phrase: string) => runAndRefresh(() => authApi.unlockWithRecovery(phrase)),
    [runAndRefresh],
  );

  const revoke = useCallback(async () => {
    await authApi.revoke();
    await refresh();
  }, [refresh]);

  const setIdleTimeoutMinutes = useCallback(
    async (minutes: IdleTimeoutMinutes) => {
      await updateSettings({ idleTimeoutMinutes: minutes });
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      refresh,
      enrolWithoutLock,
      enrolWithPin,
      enrolWithPassphrase,
      enrolWithBiometric,
      unlockWithPin,
      unlockWithPassphrase,
      unlockWithBiometric,
      unlockWithRecovery,
      lock,
      revoke,
      setIdleTimeoutMinutes,
    }),
    [
      state,
      refresh,
      enrolWithoutLock,
      enrolWithPin,
      enrolWithPassphrase,
      enrolWithBiometric,
      unlockWithPin,
      unlockWithPassphrase,
      unlockWithBiometric,
      unlockWithRecovery,
      lock,
      revoke,
      setIdleTimeoutMinutes,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/AuthContext.test.tsx`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/auth/AuthContext.tsx apps/interviewer-v8/src/lib/auth/__tests__/AuthContext.test.tsx && \
git commit -m "refactor(interviewer-v8): AuthContext holds session DEK via holder, new mode set"
```

---

### Task E3: Rewire `useBiometric` to the WebAuthn PRF check (drop the native branch)

**Files:**

- Modify: `apps/interviewer-v8/src/lib/auth/useBiometric.ts`
- Create: `apps/interviewer-v8/src/lib/auth/__tests__/useBiometric.test.tsx`

**Interfaces:**

- Consumes: `authApi.isBiometricSupported()` (E1 → vault `isPrfSupported`).
- Produces:

  ```ts
  export type BiometricState =
    | { status: 'checking' }
    | { status: 'available' }
    | { status: 'unavailable'; reason: string };
  export function useBiometric(): BiometricState;
  ```

  On web there is no Capacitor plugin. When `isBiometricSupported()` resolves `false`, the reason is the PRF-unavailable message; the `Step2MethodPicker` disables the biometric option using this.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/interviewer-v8/src/lib/auth/__tests__/useBiometric.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const isBiometricSupported = vi.fn<() => Promise<boolean>>();
vi.mock('../api', () => ({ isBiometricSupported }));

import { useBiometric } from '../useBiometric';

function Probe() {
  const b = useBiometric();
  return (
    <span data-testid="s">
      {b.status}
      {b.status === 'unavailable' ? `:${b.reason}` : ''}
    </span>
  );
}

afterEach(() => isBiometricSupported.mockReset());

describe('useBiometric (web / WebAuthn PRF)', () => {
  it('reports available when PRF is supported', async () => {
    isBiometricSupported.mockResolvedValue(true);
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId('s')).toHaveTextContent('available'),
    );
  });

  it('reports unavailable with a reason when PRF is unsupported', async () => {
    isBiometricSupported.mockResolvedValue(false);
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId('s')).toHaveTextContent(/unavailable:/),
    );
  });

  it('reports unavailable when the check throws', async () => {
    isBiometricSupported.mockRejectedValue(new Error('boom'));
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId('s')).toHaveTextContent(/unavailable:/),
    );
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/useBiometric.test.tsx`
      Expected: FAIL — the current hook imports `./biometricNative` and `../platform/platform` `isCapacitor` (removed in Phase A) and branches on the Capacitor plugin, so it neither compiles nor returns the web PRF reason.
- [ ] **Step 3: Implement**

```ts
// apps/interviewer-v8/src/lib/auth/useBiometric.ts
import { useEffect, useState } from 'react';

import { isBiometricSupported } from './api';

export type BiometricState =
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: string };

const UNSUPPORTED_REASON =
  'This browser or device does not support biometric unlock. Use a PIN or passphrase instead.';

export function useBiometric(): BiometricState {
  const [biometric, setBiometric] = useState<BiometricState>({
    status: 'checking',
  });

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const supported = await isBiometricSupported();
        if (!active) return;
        setBiometric(
          supported
            ? { status: 'available' }
            : { status: 'unavailable', reason: UNSUPPORTED_REASON },
        );
      } catch {
        if (!active) return;
        setBiometric({ status: 'unavailable', reason: UNSUPPORTED_REASON });
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, []);

  return biometric;
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/useBiometric.test.tsx`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/auth/useBiometric.ts apps/interviewer-v8/src/lib/auth/__tests__/useBiometric.test.tsx && \
git commit -m "refactor(interviewer-v8): useBiometric gates on WebAuthn PRF support"
```

---

### Task E4: SetupWizard biometric step — WebAuthn enrol + required recovery passphrase

**Files:**

- Modify: `apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.tsx`
- Modify: `apps/interviewer-v8/src/components/SetupWizard/NoRecoveryNotice.tsx` (retune the `biometric` copy — biometric now HAS recovery)
- Create: `apps/interviewer-v8/src/components/SetupWizard/__tests__/Step3BiometricConfigure.test.tsx`

**Interfaces:**

- Consumes: `useWizard()` (`setNextEnabled`, `setBeforeNext`, `setStepData`); `authApi.status`/`authApi.revoke`/`authApi.enrolWithBiometric(recoveryPhrase)` (E1); the `getPasswordStrength` validator + `PasswordField` already used by `Step3PassphraseConfigure`.
- Produces: the biometric step now captures a recovery passphrase (≥12 chars / ≥3 classes, confirmed) and enrols via `authApi.enrolWithBiometric(phrase)`, gated on `isPrfSupported()` upstream in `Step2MethodPicker` (already wired through `useBiometric` in E3). Copy states the passphrase IS the recovery method (researcher tone), replacing the "no recovery" affirmation for the biometric path.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/interviewer-v8/src/components/SetupWizard/__tests__/Step3BiometricConfigure.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setNextEnabled = vi.fn<(v: boolean) => void>();
const setBeforeNext = vi.fn<(fn: (() => Promise<boolean>) | null) => void>();
const setStepData = vi.fn<(patch: Record<string, unknown>) => void>();
vi.mock('@codaco/fresco-ui/dialogs/useWizard', () => ({
  useWizard: () => ({ setNextEnabled, setBeforeNext, setStepData, data: {} }),
}));

const status = vi.fn(async () => ({ configured: false, locked: false }));
const revoke = vi.fn(async () => {});
const enrolWithBiometric = vi.fn(async () => ({ ok: true }));
vi.mock('~/lib/auth/api', () => ({ status, revoke, enrolWithBiometric }));

import Step3BiometricConfigure from '../Step3BiometricConfigure';

afterEach(() => {
  setNextEnabled.mockReset();
  setBeforeNext.mockReset();
  setStepData.mockReset();
  enrolWithBiometric.mockReset().mockResolvedValue({ ok: true });
  status.mockReset().mockResolvedValue({ configured: false, locked: false });
});

function lastBeforeNext(): () => Promise<boolean> {
  const calls = setBeforeNext.mock.calls.filter(
    ([fn]) => typeof fn === 'function',
  );
  const fn = calls.at(-1)?.[0];
  if (!fn) throw new Error('no beforeNext registered');
  return fn;
}

describe('Step3BiometricConfigure — recovery passphrase capture', () => {
  it('disables Next until a strong, confirmed recovery passphrase is entered', async () => {
    render(<Step3BiometricConfigure />);
    await waitFor(() => expect(setNextEnabled).toHaveBeenCalledWith(false));

    const [phrase, confirm] = screen.getAllByLabelText(/passphrase/i);
    await userEvent.type(phrase, 'Tr0ub4dor&3-clever');
    await userEvent.type(confirm, 'Tr0ub4dor&3-clever');

    await waitFor(() => expect(setNextEnabled).toHaveBeenLastCalledWith(true));
  });

  it('enrols biometric with the recovery passphrase on Next', async () => {
    render(<Step3BiometricConfigure />);
    const [phrase, confirm] = screen.getAllByLabelText(/passphrase/i);
    await userEvent.type(phrase, 'Tr0ub4dor&3-clever');
    await userEvent.type(confirm, 'Tr0ub4dor&3-clever');
    await waitFor(() => expect(setNextEnabled).toHaveBeenLastCalledWith(true));

    const ok = await lastBeforeNext()();
    expect(ok).toBe(true);
    expect(enrolWithBiometric).toHaveBeenCalledWith('Tr0ub4dor&3-clever');
    expect(setStepData).toHaveBeenCalledWith({ enrolmentCommitted: true });
  });

  it('surfaces an enrolment failure and does not advance', async () => {
    enrolWithBiometric.mockResolvedValue({ ok: false, message: 'Cancelled' });
    render(<Step3BiometricConfigure />);
    const [phrase, confirm] = screen.getAllByLabelText(/passphrase/i);
    await userEvent.type(phrase, 'Tr0ub4dor&3-clever');
    await userEvent.type(confirm, 'Tr0ub4dor&3-clever');
    await waitFor(() => expect(setNextEnabled).toHaveBeenLastCalledWith(true));

    const ok = await lastBeforeNext()();
    expect(ok).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancelled');
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/SetupWizard/__tests__/Step3BiometricConfigure.test.tsx`
      Expected: FAIL — the current step imports `isCapacitor` + `authApi.enrol()`/`enrolWithBiometricNative()` (removed) and has no recovery-passphrase field; `enrolWithBiometric` is never called.
- [ ] **Step 3: Implement**

```tsx
// apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.tsx
import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import { getPasswordStrength } from '@codaco/fresco-ui/form/fields/getPasswordStrength';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';

export default function Step3BiometricConfigure() {
  const wizard = useWizard();
  const [phrase, setPhrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const strength = getPasswordStrength(phrase);
  const isValid =
    phrase.length >= 12 && strength.score >= 3 && phrase === confirm;

  useEffect(() => {
    wizard.setNextEnabled(isValid);
  }, [isValid, wizard]);

  useEffect(() => {
    wizard.setBeforeNext(async () => {
      setError(null);

      const status = await authApi.status();
      if (status.configured && status.mode !== 'none') {
        await authApi.revoke();
      }

      // Enrol via authApi directly — a context action would refresh() and flip
      // AuthGate to `unlocked`, revealing Home behind the still-open wizard.
      // SetupWizardDialog runs one refresh after the wizard closes.
      const result = await authApi.enrolWithBiometric(phrase);
      if (!result.ok) {
        setError(result.message ?? 'Biometric setup failed.');
        return false;
      }

      wizard.setStepData({ enrolmentCommitted: true });
      return true;
    });
  }, [wizard, phrase]);

  return (
    <>
      <Paragraph>
        Biometric unlock uses your device's Face ID, Touch ID, or Windows Hello.
        When you click Next you'll be prompted to register it.
      </Paragraph>
      <Alert variant="info">
        <AlertTitle>Set a recovery passphrase</AlertTitle>
        <AlertDescription>
          If your biometric ever becomes unavailable — you reset Face ID,
          replace the device, or remove the credential — this passphrase is the
          only way to unlock your data. Store it somewhere safe.
        </AlertDescription>
      </Alert>
      <UnconnectedField
        name="recovery-passphrase"
        label="Recovery passphrase"
        hint="At least 12 characters combining uppercase, lowercase, numbers, and symbols."
        component={PasswordField}
        value={phrase}
        onChange={(v) => setPhrase(v ?? '')}
        autoComplete="off"
        showStrengthMeter={true}
        placeholder="Enter recovery passphrase"
      />
      <UnconnectedField
        name="recovery-passphrase-confirm"
        label="Confirm recovery passphrase"
        component={PasswordField}
        value={confirm}
        onChange={(v) => setConfirm(v ?? '')}
        autoComplete="off"
        showStrengthMeter={false}
        placeholder="Confirm recovery passphrase"
      />
      {confirm.length > 0 && phrase !== confirm && (
        <Paragraph margin="none" className="text-destructive text-sm">
          Passphrases do not match.
        </Paragraph>
      )}
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
    </>
  );
}
```

Retune the biometric copy in `NoRecoveryNotice.tsx` so it no longer claims biometric is unrecoverable (PIN/passphrase paths keep theirs; biometric no longer renders this notice, but the map entry must not lie if reused):

```tsx
// apps/interviewer-v8/src/components/SetupWizard/NoRecoveryNotice.tsx — replace the biometric entry
  biometric:
    'Biometric unlock is protected by a recovery passphrase you set during setup. Keep that passphrase safe: if you lose both your biometric and the recovery passphrase, data on this device cannot be recovered.',
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/SetupWizard/__tests__/Step3BiometricConfigure.test.tsx`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.tsx apps/interviewer-v8/src/components/SetupWizard/NoRecoveryNotice.tsx apps/interviewer-v8/src/components/SetupWizard/__tests__/Step3BiometricConfigure.test.tsx && \
git commit -m "feat(interviewer-v8): biometric setup enrols WebAuthn + captures recovery passphrase"
```

---

### Task E5: LockScreen + a recovery-passphrase fallback form for the biometric vault

**Files:**

- Modify: `apps/interviewer-v8/src/components/LockScreen.tsx`
- Create: `apps/interviewer-v8/src/components/UnlockForms/BiometricLockBody.tsx`
- Create: `apps/interviewer-v8/src/components/__tests__/LockScreen.test.tsx`

**Interfaces:**

- Consumes: `useAuth()` → `{ kind, mode, unlockWithPin, unlockWithPassphrase, unlockWithBiometric, unlockWithRecovery }` (E2); the existing `PinUnlockForm`, `PasswordUnlockField`, `BiometricUnlockForm`, `UnlockEmblem`.
- Produces: for `mode: 'biometric'` the LockScreen offers a primary "Unlock with biometrics" button (`unlockWithBiometric`) and a "Use recovery passphrase" toggle that swaps in a passphrase form calling `unlockWithRecovery`. `pin`/`passphrase`/`none` behaviour is unchanged apart from dropping the retired `biometric-keystore`/`biometric-native`/`unlockWithAuthenticator`/`unlockWithBiometricNative` cases.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/interviewer-v8/src/components/__tests__/LockScreen.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useAuth = vi.fn();
vi.mock('~/lib/auth/AuthContext', () => ({ useAuth }));

import { LockScreen } from '../LockScreen';

const base = {
  kind: 'locked' as const,
  unlockWithPin: vi.fn(async () => ({ ok: true })),
  unlockWithPassphrase: vi.fn(async () => ({ ok: true })),
  unlockWithBiometric: vi.fn(async () => ({ ok: true })),
  unlockWithRecovery: vi.fn(async () => ({ ok: true })),
};

afterEach(() => {
  useAuth.mockReset();
  base.unlockWithBiometric.mockClear().mockResolvedValue({ ok: true });
  base.unlockWithRecovery.mockClear().mockResolvedValue({ ok: true });
});

describe('LockScreen — biometric vault', () => {
  it('offers biometric unlock and a recovery-passphrase fallback', async () => {
    useAuth.mockReturnValue({ ...base, mode: 'biometric' });
    render(<LockScreen />);

    await userEvent.click(
      screen.getByRole('button', { name: /unlock with biometrics/i }),
    );
    expect(base.unlockWithBiometric).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole('button', { name: /use recovery passphrase/i }),
    );
    await userEvent.type(
      screen.getByLabelText(/passphrase/i),
      'Tr0ub4dor&3-clever',
    );
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    await waitFor(() =>
      expect(base.unlockWithRecovery).toHaveBeenCalledWith(
        'Tr0ub4dor&3-clever',
      ),
    );
  });

  it('renders the PIN form for a pin vault', () => {
    useAuth.mockReturnValue({ ...base, mode: 'pin' });
    render(<LockScreen />);
    expect(screen.getByText(/enter your pin/i)).toBeInTheDocument();
  });

  it('renders nothing when unlocked', () => {
    useAuth.mockReturnValue({ ...base, kind: 'unlocked', mode: 'pin' });
    const { container } = render(<LockScreen />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/LockScreen.test.tsx`
      Expected: FAIL — the current LockScreen has no `mode: 'biometric'` case (only the retired `biometric-keystore`/`biometric-native`) and no recovery-passphrase fallback; `BiometricLockBody` does not exist.
- [ ] **Step 3: Implement**

```tsx
// apps/interviewer-v8/src/components/UnlockForms/BiometricLockBody.tsx
import { Fingerprint, RectangleEllipsis } from 'lucide-react';
import { useId, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import BiometricUnlockForm from './BiometricUnlockForm';
import PasswordUnlockField from './PasswordUnlockField';
import { UnlockEmblem } from './UnlockEmblem';

const LOCK_TITLE = 'Welcome back';

type BiometricLockBodyProps = {
  unlockWithBiometric: () => Promise<{ ok: boolean; message?: string }>;
  unlockWithRecovery: (
    phrase: string,
  ) => Promise<{ ok: boolean; message?: string }>;
};

export function BiometricLockBody({
  unlockWithBiometric,
  unlockWithRecovery,
}: BiometricLockBodyProps) {
  const [useRecovery, setUseRecovery] = useState(false);
  const formId = useId();

  if (useRecovery) {
    return (
      <FormStoreProvider>
        <Dialog
          open
          dismissible={false}
          title={LOCK_TITLE}
          footer={
            <SubmitButton form={formId} submittingText="Unlocking…">
              Unlock
            </SubmitButton>
          }
        >
          <div className="mb-6 flex flex-col items-center gap-4 text-center">
            <UnlockEmblem icon={RectangleEllipsis} seed="recovery-unlock" />
            <Paragraph margin="none" emphasis="muted">
              Enter your recovery passphrase to unlock.
            </Paragraph>
          </div>
          <FormWithoutProvider
            id={formId}
            onSubmit={async (values): Promise<FormSubmissionResult> => {
              const phrase =
                typeof values.passphrase === 'string' ? values.passphrase : '';
              const result = await unlockWithRecovery(phrase);
              return result.ok
                ? { success: true }
                : {
                    success: false,
                    formErrors: [result.message ?? 'Incorrect passphrase.'],
                  };
            }}
          >
            <PasswordUnlockField autoFocus />
          </FormWithoutProvider>
          <Button
            type="button"
            color="secondary"
            className="mt-4"
            onClick={() => setUseRecovery(false)}
          >
            Back to biometrics
          </Button>
        </Dialog>
      </FormStoreProvider>
    );
  }

  return (
    <Dialog open dismissible={false} title={LOCK_TITLE}>
      <div className="mb-6 flex flex-col items-center gap-4 text-center">
        <UnlockEmblem icon={Fingerprint} seed="biometric-unlock" />
        <Paragraph margin="none" emphasis="muted">
          Authenticate to unlock and pick up where you left off.
        </Paragraph>
      </div>
      <BiometricUnlockForm
        submitLabel="Unlock with biometrics"
        onSubmit={() => unlockWithBiometric()}
      />
      <Button
        type="button"
        color="secondary"
        className="mt-4"
        onClick={() => setUseRecovery(true)}
      >
        Use recovery passphrase
      </Button>
    </Dialog>
  );
}
```

Then rewrite the LockScreen switch to the new mode set:

```tsx
// apps/interviewer-v8/src/components/LockScreen.tsx
import { KeyRound, RectangleEllipsis } from 'lucide-react';
import { useId } from 'react';

import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAuth } from '~/lib/auth/AuthContext';

import { BiometricLockBody } from './UnlockForms/BiometricLockBody';
import PasswordUnlockField from './UnlockForms/PasswordUnlockField';
import { PinUnlockForm } from './UnlockForms/PinUnlockForm';
import { UnlockEmblem } from './UnlockForms/UnlockEmblem';

const LOCK_TITLE = 'Welcome back';

function PinLockBody({
  verifyPin,
}: {
  verifyPin: (pin: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const formId = useId();
  return (
    <FormStoreProvider>
      <Dialog
        open
        dismissible={false}
        title={LOCK_TITLE}
        footer={
          <SubmitButton form={formId} submittingText="Unlocking…">
            Unlock
          </SubmitButton>
        }
      >
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <UnlockEmblem icon={KeyRound} seed="pin-unlock" />
          <Paragraph margin="none" emphasis="muted">
            Enter your PIN to unlock and pick up where you left off.
          </Paragraph>
        </div>
        <PinUnlockForm formId={formId} verifyPin={verifyPin} />
      </Dialog>
    </FormStoreProvider>
  );
}

function PassphraseLockBody({
  onSubmit,
}: {
  onSubmit: (phrase: string) => Promise<FormSubmissionResult>;
}) {
  const formId = useId();
  return (
    <FormStoreProvider>
      <Dialog
        open
        dismissible={false}
        title={LOCK_TITLE}
        footer={
          <SubmitButton form={formId} submittingText="Unlocking…">
            Unlock
          </SubmitButton>
        }
      >
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <UnlockEmblem icon={RectangleEllipsis} seed="passphrase-unlock" />
          <Paragraph margin="none" emphasis="muted">
            Enter your passphrase to unlock and pick up where you left off.
          </Paragraph>
        </div>
        <FormWithoutProvider
          id={formId}
          onSubmit={(values) =>
            onSubmit(
              typeof values.passphrase === 'string' ? values.passphrase : '',
            )
          }
        >
          <PasswordUnlockField autoFocus />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
}

export function LockScreen() {
  const {
    kind,
    mode,
    unlockWithPin,
    unlockWithPassphrase,
    unlockWithBiometric,
    unlockWithRecovery,
  } = useAuth();

  if (kind !== 'locked') {
    return null;
  }

  switch (mode) {
    case 'biometric':
      return (
        <BiometricLockBody
          unlockWithBiometric={unlockWithBiometric}
          unlockWithRecovery={unlockWithRecovery}
        />
      );
    case 'pin':
      return (
        <PinLockBody
          verifyPin={async (pin) => {
            const result = await unlockWithPin(pin);
            return result.ok
              ? { ok: true }
              : { ok: false, message: result.message ?? 'Incorrect PIN.' };
          }}
        />
      );
    case 'passphrase':
      return (
        <PassphraseLockBody
          onSubmit={async (phrase) => {
            const result = await unlockWithPassphrase(phrase);
            return result.ok
              ? { success: true }
              : {
                  success: false,
                  formErrors: [result.message ?? 'Incorrect passphrase.'],
                };
          }}
        />
      );
    case 'none':
    case undefined:
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/LockScreen.test.tsx`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/LockScreen.tsx apps/interviewer-v8/src/components/UnlockForms/BiometricLockBody.tsx apps/interviewer-v8/src/components/__tests__/LockScreen.test.tsx && \
git commit -m "feat(interviewer-v8): LockScreen biometric unlock + recovery-passphrase fallback"
```

---

### Task E6: StepUp dialog + ManageAuthenticator on the new mode set

**Files:**

- Modify: `apps/interviewer-v8/src/lib/auth/StepUpAuthDialog.tsx`
- Modify: `apps/interviewer-v8/src/components/ManageAuthenticator.tsx`
- Create: `apps/interviewer-v8/src/lib/auth/__tests__/StepUpAuthDialog.test.tsx`

**Interfaces:**

- Consumes: `useAuth().mode` (E2); `authApi.verifyWithPin`/`verifyWithPassphrase`/`verifyBiometric` (E1) — these re-check without changing the gate; `useAuth().revoke`; `getSessionDek` is not touched by verify (asserted in E1). `StepUpAuthProvider.requireFreshUnlock()` and the `requireUnlockOnEnter/Exit/Export` behaviour are preserved (the provider already short-circuits `mode === 'none'`).
- Produces: the StepUp dialog's `biometric` case runs a fresh `verifyBiometric()` (WebAuthn `get()`) without toggling the gate. `ManageAuthenticator` drops the retired `pinMetadata.enrolledAt` read + PIN re-enrol form (mode switching is revoke-then-setup per spec §"Auth modes"); it shows the current mode and routes changes through `ResetDeviceRow`'s `revoke()`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/interviewer-v8/src/lib/auth/__tests__/StepUpAuthDialog.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useAuth = vi.fn();
vi.mock('../AuthContext', () => ({ useAuth }));

const verifyBiometric = vi.fn(async () => ({ ok: true }));
const verifyWithPin = vi.fn(async () => ({ ok: true }));
const verifyWithPassphrase = vi.fn(async () => ({ ok: true }));
vi.mock('../api', () => ({
  verifyBiometric,
  verifyWithPin,
  verifyWithPassphrase,
}));

import StepUpAuthDialog from '../StepUpAuthDialog';

afterEach(() => {
  useAuth.mockReset();
  verifyBiometric.mockClear().mockResolvedValue({ ok: true });
});

describe('StepUpAuthDialog', () => {
  it('biometric mode resolves via a fresh verifyBiometric (no gate change)', async () => {
    useAuth.mockReturnValue({ mode: 'biometric' });
    const onResolve = vi.fn();
    render(<StepUpAuthDialog open onResolve={onResolve} />);

    await userEvent.click(
      screen.getByRole('button', { name: /verify identity/i }),
    );
    await waitFor(() => expect(verifyBiometric).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenCalledWith({ ok: true });
  });

  it('renders nothing for mode none', () => {
    useAuth.mockReturnValue({ mode: 'none' });
    const { container } = render(<StepUpAuthDialog open onResolve={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/StepUpAuthDialog.test.tsx`
      Expected: FAIL — the current dialog gates the biometric branch on `mode === 'biometric-keystore' || mode === 'biometric-native'`, so `mode: 'biometric'` renders `null` and no verify runs.
- [ ] **Step 3: Implement**
      In `StepUpAuthDialog.tsx`, replace the dispatch condition:

```tsx
// apps/interviewer-v8/src/lib/auth/StepUpAuthDialog.tsx — dispatch in StepUpAuthDialog()
if (mode === 'biometric') {
  return (
    <BiometricStepUp
      open={open}
      onResolve={onResolve}
      handleCancel={handleCancel}
    />
  );
}
```

(The `PinStepUp`/`PassphraseStepUp`/`BiometricStepUp` bodies are unchanged — they already call `authApi.verifyWithPin`/`verifyWithPassphrase`/`verifyBiometric`, which are verify-only in E1.)

Then rework `ManageAuthenticator.tsx` to drop the retired metadata read and the PIN re-enrol form (mode switching is revoke-then-setup):

```tsx
// apps/interviewer-v8/src/components/ManageAuthenticator.tsx
import { ShieldOff } from 'lucide-react';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { SettingsRow } from '~/components/SettingsRow';
import { useAuth } from '~/lib/auth/AuthContext';

const MODE_LABEL: Record<string, string> = {
  pin: 'PIN',
  passphrase: 'Passphrase',
  biometric: 'Biometric (with recovery passphrase)',
  none: 'No device lock',
};

export function ManageAuthenticator() {
  const auth = useAuth();

  return (
    <section>
      <Heading level="label" margin="none">
        {auth.mode === 'none' ? 'Device lock' : 'Authenticator'}
      </Heading>
      {auth.mode === 'none' && (
        <Paragraph intent="smallText" emphasis="muted">
          No device lock is configured. Data on this device is not encrypted at
          the app layer. To enable a lock, reset the device first and run setup
          again.
        </Paragraph>
      )}
      <dl className="font-monospace mt-4 mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-text/60">Mode</dt>
        <dd>{auth.mode ? (MODE_LABEL[auth.mode] ?? auth.mode) : 'unknown'}</dd>
      </dl>
      {auth.mode !== 'none' && (
        <Paragraph intent="smallText" emphasis="muted">
          To change your unlock method, reset the device and run setup again.
          Resetting destroys all data on this device.
        </Paragraph>
      )}
    </section>
  );
}

export function ResetDeviceRow() {
  const auth = useAuth();
  const { confirm } = useDialog();

  const handleRevoke = async () => {
    await confirm({
      title:
        auth.mode === 'none'
          ? 'Reset device and wipe data?'
          : 'Revoke device lock and wipe data?',
      description: 'This will destroy all data on this device. Continue?',
      confirmLabel: 'Destroy device data',
      intent: 'destructive',
      onConfirm: async () => {
        await auth.revoke();
      },
    });
  };

  const isReset = auth.mode === 'none';
  return (
    <SettingsRow
      title={isReset ? 'Reset device' : 'Revoke device lock'}
      desc="Destroy all protocols, sessions, and stored credentials on this device, then restart setup."
      control={
        <Button
          color="destructive"
          onClick={() => void handleRevoke()}
          icon={<ShieldOff className="size-4" />}
        >
          {isReset ? 'Reset device' : 'Revoke'}
        </Button>
      }
    />
  );
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/StepUpAuthDialog.test.tsx`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/auth/StepUpAuthDialog.tsx apps/interviewer-v8/src/components/ManageAuthenticator.tsx apps/interviewer-v8/src/lib/auth/__tests__/StepUpAuthDialog.test.tsx && \
git commit -m "refactor(interviewer-v8): StepUp + ManageAuthenticator on the new auth mode set"
```

---

### Task E7: Phase-E typecheck + knip gate (remove dangling exports/imports)

**Files:**

- Modify: any residual Phase-E consumer flagged by typecheck/knip (e.g. an unused `SegmentedCodeField`/`PasswordField`/`useToast` import left over in `ManageAuthenticator.tsx`, or a stale `AuthMode`/`biometricSupported` reference in `SettingsDialog.tsx`, `Step2MethodPicker.tsx`, `SetupWizardDialog.tsx`).

**Interfaces:**

- Consumes: the whole Phase-E surface (E1–E6).
- Produces: a green `typecheck` + `knip` for the app — no `any`, no `as`, no orphaned exports from the deleted `vaultMetadata`/native paths.

- [ ] **Step 1: Verification command (typecheck)**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: initially FAIL — consumers still reference removed members (`auth.pinMetadata`, `authenticatorSupported`, `unlockWithBiometricNative`, `reEnrolWithPin`, the retired `AuthMode` union members) or leave now-unused imports.
- [ ] **Step 2: Fix each reported site**
      Concrete actions:
- In `src/components/SettingsDialog.tsx` and anywhere else consuming `useAuth()`: replace `authenticatorSupported` with `biometricSupported`; replace `mode === 'biometric-keystore' | 'biometric-native'` with `mode === 'biometric'`; remove references to `pinMetadata`/`passphraseMetadata`/`enrolAuthenticator`/`unlockWithAuthenticator`/`enrolWithBiometricNative`/`unlockWithBiometricNative`/`reEnrolWith*`.
- In `src/components/SetupWizard/Step2MethodPicker.tsx`: the option list is unchanged (`biometric | pin | passphrase | none`); confirm `useBiometric()` still supplies `biometricDisabled`/`biometricDescription` (it does after E3). No `as const` on the option `value` fields needs an `as` bypass — leave the existing `as const` literals (they are value assertions, permitted).
- In `ManageAuthenticator.tsx`: remove now-unused imports (`KeyRound`, `useState`, `UnconnectedField`, `PasswordField`, `SegmentedCodeField`, `TimeAgo`, `useToast`) surfaced by lint after E6.
- Run `pnpm lint:fix` from the repo root to auto-fix import ordering/unused-import removals.
- [ ] **Step 3: Verify typecheck passes**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: PASS (no errors).
- [ ] **Step 4: Verify knip is clean**
      Run: `pnpm --filter @codaco/interviewer-v8 knip`
      Expected: PASS — no unused files/exports (the deleted `vaultMetadata.ts`, `biometricNative.ts`, `electron.ts` are gone; no orphaned exports remain).
- [ ] **Step 5: Commit**

```bash
git add -A apps/interviewer-v8/src && git commit -m "chore(interviewer-v8): reconcile auth consumers with the rebuilt web auth surface"
```
