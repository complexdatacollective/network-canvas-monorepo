import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isPrfSupportedMock = vi.fn<() => Promise<boolean>>();
vi.mock('../../vault/webauthn', () => ({
  isPrfSupported: () => isPrfSupportedMock(),
}));

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
  isPrfSupportedMock.mockReset();
  isPrfSupportedMock.mockResolvedValue(false);
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
    isPrfSupportedMock.mockResolvedValue(false);
    expect(await authApi.isBiometricSupported()).toBe(false);
  });
  it('returns true when PRF is supported', async () => {
    isPrfSupportedMock.mockResolvedValue(true);
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
