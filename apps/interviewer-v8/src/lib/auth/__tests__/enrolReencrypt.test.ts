// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

// Deterministic WebAuthn so enrolWithBiometric runs end-to-end (mirrors
// vault.test.ts). A fixed PRF secret makes the dual-wrap reproducible.
const FIXED_PRF = new Uint8Array(32).fill(11).buffer;
vi.mock('../../vault/webauthn', () => ({
  isPrfSupported: () => Promise.resolve(true),
  enrollBiometric: () =>
    Promise.resolve({
      enrollment: { credentialId: 'CRED123', prfSaltB64: btoa('prf-salt-xx') },
      prfOutput: FIXED_PRF,
    }),
  readPrf: () => Promise.resolve(FIXED_PRF),
  signalCredentialUnknown: () => Promise.resolve(),
}));

import { getSettings, updateSettings } from '../../db/api';
import { db } from '../../db/db';
import { encryptSession } from '../../db/recordCrypto';
import { getSessionDek, setSessionDek } from '../../db/sessionKey';
import type { StoredSession } from '../../db/types';
import { clearVault } from '../../vault/vaultStore';
import * as authApi from '../api';

const STRONG = 'Tr0ub4dor&3-clever';
const RECOVERY = 'Recovery-Phrase-7!';

const network: NcNetwork = {
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'n1',
      type: 'person',
      [entityAttributesProperty]: { name: 'Ada' },
    },
  ],
  edges: [],
};

const PRE_SECURED_TIMESTAMP = '2026-05-05T05:05:05.555Z';

function makeSession(): StoredSession {
  return {
    id: 's1',
    protocolHash: 'h1',
    protocolName: 'Study',
    caseId: 'case-1',
    startedAt: PRE_SECURED_TIMESTAMP,
    lastUpdatedAt: PRE_SECURED_TIMESTAMP,
    finishedAt: null,
    exportedAt: null,
    currentStep: 2,
    progress: 30,
    network,
    stageMetadata: undefined,
    isSynthetic: false,
  };
}

// Seed one PLAINTEXT session row (no DEK held ⇒ no `_enc`), modelling data
// collected while the device was unconfigured, then confirm it is plaintext.
async function seedPlaintextSession(): Promise<void> {
  setSessionDek(null);
  await db.sessions.put(await encryptSession(makeSession()));
  const raw = await db.sessions.get('s1');
  expect(raw?._enc).toBeUndefined();
  expect(raw?.network).toEqual(network);
}

beforeEach(async () => {
  clearVault();
  setSessionDek(null);
  await db.sessions.clear();
});
afterEach(async () => {
  clearVault();
  setSessionDek(null);
  await db.sessions.clear();
});

describe('initial enrol sweeps pre-secured plaintext rows', () => {
  it('enrolWithPin re-encrypts the existing plaintext session', async () => {
    await seedPlaintextSession();
    expect((await authApi.enrolWithPin('12345678')).ok).toBe(true);

    const raw = await db.sessions.get('s1');
    expect(raw?._enc?.network).toBeDefined();
    expect(raw?.network).toBeUndefined();
    // Field-preserving: the pre-secured timestamp is untouched.
    expect(raw?.lastUpdatedAt).toBe(PRE_SECURED_TIMESTAMP);
    expect(raw?.startedAt).toBe(PRE_SECURED_TIMESTAMP);
    // The enrol left the device unlocked (DEK held).
    expect((await authApi.status()).locked).toBe(false);
  });

  it('enrolWithPassphrase re-encrypts the existing plaintext session', async () => {
    await seedPlaintextSession();
    expect((await authApi.enrolWithPassphrase(STRONG)).ok).toBe(true);

    const raw = await db.sessions.get('s1');
    expect(raw?._enc?.network).toBeDefined();
    expect(raw?.network).toBeUndefined();
    expect(raw?.lastUpdatedAt).toBe(PRE_SECURED_TIMESTAMP);
  });

  it('enrolWithBiometric re-encrypts the existing plaintext session', async () => {
    await seedPlaintextSession();
    expect((await authApi.enrolWithBiometric(RECOVERY)).ok).toBe(true);

    const raw = await db.sessions.get('s1');
    expect(raw?._enc?.network).toBeDefined();
    expect(raw?.network).toBeUndefined();
    expect(raw?.lastUpdatedAt).toBe(PRE_SECURED_TIMESTAMP);
  });
});

describe('paths that must NOT sweep', () => {
  it('enrolWithoutLock leaves the plaintext session plaintext (mode none, by design)', async () => {
    await seedPlaintextSession();
    expect((await authApi.enrolWithoutLock()).ok).toBe(true);
    expect(getSessionDek()).toBeNull();

    const raw = await db.sessions.get('s1');
    expect(raw?._enc).toBeUndefined();
    expect(raw?.network).toEqual(network);
  });

  it('reEnrolWithPin does not sweep again (rows already encrypted; timestamps unchanged)', async () => {
    await seedPlaintextSession();
    await authApi.enrolWithPin('12345678');

    // After initial enrol the row is encrypted; capture its ciphertext.
    const afterEnrol = await db.sessions.get('s1');
    const cipherBefore = JSON.stringify(afterEnrol?._enc);

    expect((await authApi.reEnrolWithPin('12345678', '87654321')).ok).toBe(
      true,
    );

    // reEnrol rewraps the SAME DEK, so no re-encryption runs — the stored
    // ciphertext and every field are byte-for-byte unchanged.
    const afterReEnrol = await db.sessions.get('s1');
    expect(JSON.stringify(afterReEnrol?._enc)).toBe(cipherBefore);
    expect(afterReEnrol?.lastUpdatedAt).toBe(PRE_SECURED_TIMESTAMP);
  });

  it('reEnrolWithPassphrase does not sweep again', async () => {
    await seedPlaintextSession();
    await authApi.enrolWithPassphrase(STRONG);

    const afterEnrol = await db.sessions.get('s1');
    const cipherBefore = JSON.stringify(afterEnrol?._enc);

    expect(
      (await authApi.reEnrolWithPassphrase(STRONG, 'Fresh-Passphrase-4!')).ok,
    ).toBe(true);

    const afterReEnrol = await db.sessions.get('s1');
    expect(JSON.stringify(afterReEnrol?._enc)).toBe(cipherBefore);
    expect(afterReEnrol?.lastUpdatedAt).toBe(PRE_SECURED_TIMESTAMP);
  });
});

describe('resume-on-unlock finishes an interrupted sweep', () => {
  it('unlockWithPin re-encrypts a leftover plaintext row and clears the flag', async () => {
    // Enrol on an empty DB: the sweep is a no-op and the flag ends false.
    expect((await authApi.enrolWithPin('12345678')).ok).toBe(true);
    expect((await getSettings()).reencryptionPending).toBe(false);

    // Simulate an initial-enrol sweep that failed partway: a plaintext row
    // remains and the pending flag is set; then the device locks (DEK dropped).
    // The row is written directly (encryptSession fails closed once a secured
    // vault exists, which is exactly the protection this all rests on).
    setSessionDek(null);
    await db.sessions.put(makeSession());
    await updateSettings({ reencryptionPending: true });
    expect((await db.sessions.get('s1'))?._enc).toBeUndefined();

    // Unlocking finishes the sweep and clears the flag.
    expect((await authApi.unlockWithPin('12345678')).ok).toBe(true);
    expect((await db.sessions.get('s1'))?._enc?.network).toBeDefined();
    expect((await db.sessions.get('s1'))?.network).toBeUndefined();
    expect((await getSettings()).reencryptionPending).toBe(false);
  });
});
