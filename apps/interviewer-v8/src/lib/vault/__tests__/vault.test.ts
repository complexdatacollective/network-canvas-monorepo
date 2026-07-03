import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readVault } from '../vaultStore';

// The WebAuthn layer is mocked so enrol/unlock biometric are deterministic:
// a fixed PRF secret per (credentialId, prfSalt). userHandle is ignored.
// vi.fn wrappers let individual tests override behaviour (e.g. simulate a
// cancelled OS biometric sheet by rejecting).
const FIXED_PRF = new Uint8Array(32).fill(11).buffer;
const enrollBiometricMock = vi.fn(() =>
  Promise.resolve({
    enrollment: { credentialId: 'CRED123', prfSaltB64: btoa('prf-salt-xx') },
    prfOutput: FIXED_PRF,
  }),
);
const readPrfMock = vi.fn(() => Promise.resolve(FIXED_PRF));
const signalCredentialUnknownMock = vi.fn<
  (credentialId: string) => Promise<void>
>(() => Promise.resolve());
vi.mock('../webauthn', () => ({
  isPrfSupported: () => Promise.resolve(true),
  enrollBiometric: () => enrollBiometricMock(),
  readPrf: () => readPrfMock(),
  signalCredentialUnknown: (credentialId: string) =>
    signalCredentialUnknownMock(credentialId),
}));

import {
  enrolBiometric,
  enrolNone,
  enrolPassphrase,
  enrolPin,
  reEnrolPassphrase,
  reEnrolPin,
  revoke,
  unlockBiometric,
  unlockPassphrase,
  unlockPin,
  unlockRecovery,
  vaultStatus,
  verifyBiometric,
  verifyPassphrase,
  verifyPin,
  verifyRecovery,
} from '../vault';

const GOOD_PASSPHRASE = 'Correct-Horse-9!';
const GOOD_RECOVERY = 'Recovery-Phrase-7!';

beforeEach(() => {
  window.localStorage.clear();
  enrollBiometricMock.mockReset().mockResolvedValue({
    enrollment: { credentialId: 'CRED123', prfSaltB64: btoa('prf-salt-xx') },
    prfOutput: FIXED_PRF,
  });
  readPrfMock.mockReset().mockResolvedValue(FIXED_PRF);
  signalCredentialUnknownMock.mockClear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('vaultStatus', () => {
  it('reports unconfigured before enrol', () => {
    expect(vaultStatus()).toEqual({ configured: false });
  });
});

describe('none mode', () => {
  it('enrols and reports mode none; unlock is not applicable (no DEK)', async () => {
    const result = await enrolNone();
    expect(result.ok).toBe(true);
    expect(vaultStatus()).toEqual({ configured: true, mode: 'none' });
    expect(readVault()).toEqual({ version: 4, mode: 'none' });
  });
});

describe('pin mode', () => {
  it('enrol → unlock round-trips with a usable DEK', async () => {
    const enrol = await enrolPin('12345678');
    expect(enrol.ok).toBe(true);
    expect(vaultStatus()).toEqual({ configured: true, mode: 'pin' });

    const unlocked = await unlockPin('12345678');
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) throw new Error('expected unlock');
    expect(unlocked.dek.algorithm.name).toBe('AES-GCM');
    expect(unlocked.dek.extractable).toBe(false);

    // sanity: the DEK actually works
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      unlocked.dek,
      new TextEncoder().encode('x'),
    );
    expect(ct.byteLength).toBeGreaterThan(0);
  });

  it('rejects an invalid PIN at enrol', async () => {
    const result = await enrolPin('123');
    expect(result.ok).toBe(false);
  });

  it('fails unlock with the wrong PIN', async () => {
    await enrolPin('12345678');
    const unlocked = await unlockPin('87654321');
    expect(unlocked.ok).toBe(false);
    if (unlocked.ok) throw new Error('expected failure');
    expect(unlocked.message).toMatch(/incorrect/i);
  });

  it('verifyPin succeeds for the right PIN and fails for the wrong one', async () => {
    await enrolPin('12345678');
    expect((await verifyPin('12345678')).ok).toBe(true);
    expect((await verifyPin('00000000')).ok).toBe(false);
  });
});

describe('passphrase mode', () => {
  it('enrol → unlock round-trips', async () => {
    await enrolPassphrase(GOOD_PASSPHRASE);
    expect(vaultStatus()).toEqual({ configured: true, mode: 'passphrase' });
    const unlocked = await unlockPassphrase(GOOD_PASSPHRASE);
    expect(unlocked.ok).toBe(true);
  });

  it('rejects a weak passphrase at enrol', async () => {
    const result = await enrolPassphrase('short');
    expect(result.ok).toBe(false);
  });

  it('fails unlock with the wrong passphrase', async () => {
    await enrolPassphrase(GOOD_PASSPHRASE);
    const unlocked = await unlockPassphrase('Wrong-Passphrase-1!');
    expect(unlocked.ok).toBe(false);
  });

  it('verifyPassphrase reflects correctness', async () => {
    await enrolPassphrase(GOOD_PASSPHRASE);
    expect((await verifyPassphrase(GOOD_PASSPHRASE)).ok).toBe(true);
    expect((await verifyPassphrase('Wrong-Passphrase-1!')).ok).toBe(false);
  });
});

describe('biometric mode (dual-wrapped)', () => {
  it('enrol returns the freshly-unwrapped DEK (no extra unlock prompt needed)', async () => {
    const enrol = await enrolBiometric(GOOD_RECOVERY);
    expect(enrol.ok).toBe(true);
    if (!enrol.ok) throw new Error('expected enrol');
    expect(enrol.dek.algorithm.name).toBe('AES-GCM');
    expect(enrol.dek.extractable).toBe(false);
    expect(vaultStatus()).toEqual({ configured: true, mode: 'biometric' });
    // Enrol prompts twice (create + readPrf); it must NOT prompt a third time.
    expect(readPrfMock).toHaveBeenCalledTimes(0);
    expect(enrollBiometricMock).toHaveBeenCalledTimes(1);
  });

  it('a cancelled biometric sheet resolves to { ok: false } instead of throwing', async () => {
    enrollBiometricMock.mockRejectedValueOnce(
      Object.assign(new Error('The operation was cancelled'), {
        name: 'NotAllowedError',
      }),
    );
    const enrol = await enrolBiometric(GOOD_RECOVERY);
    expect(enrol.ok).toBe(false);
    if (enrol.ok) throw new Error('expected failure');
    expect(enrol.message).toMatch(/cancel/i);
    // A failed enrol must not leave a half-written vault record.
    expect(vaultStatus()).toEqual({ configured: false });
  });

  it('enrol → biometric unlock round-trips', async () => {
    const enrol = await enrolBiometric(GOOD_RECOVERY);
    expect(enrol.ok).toBe(true);
    expect(vaultStatus()).toEqual({ configured: true, mode: 'biometric' });

    const unlocked = await unlockBiometric();
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) throw new Error('expected unlock');
    expect(unlocked.dek.extractable).toBe(false);
  });

  it('verifyBiometric succeeds after enrol', async () => {
    await enrolBiometric(GOOD_RECOVERY);
    expect((await verifyBiometric()).ok).toBe(true);
  });

  it('verifyRecovery re-checks the recovery passphrase', async () => {
    await enrolBiometric(GOOD_RECOVERY);
    expect((await verifyRecovery(GOOD_RECOVERY)).ok).toBe(true);
    expect((await verifyRecovery('Wrong-Recovery-1!')).ok).toBe(false);
  });

  it('recovery passphrase unlocks a biometric vault', async () => {
    await enrolBiometric(GOOD_RECOVERY);
    const unlocked = await unlockRecovery(GOOD_RECOVERY);
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) throw new Error('expected unlock');
    expect(unlocked.dek.extractable).toBe(false);
  });

  it('rejects an invalid recovery passphrase at enrol', async () => {
    const result = await enrolBiometric('weak');
    expect(result.ok).toBe(false);
    expect(vaultStatus()).toEqual({ configured: false });
  });

  it('fails recovery unlock with the wrong passphrase', async () => {
    await enrolBiometric(GOOD_RECOVERY);
    const unlocked = await unlockRecovery('Wrong-Recovery-1!');
    expect(unlocked.ok).toBe(false);
  });

  it('the biometric DEK and the recovery DEK are the same key material', async () => {
    await enrolBiometric(GOOD_RECOVERY);
    const bio = await unlockBiometric();
    const rec = await unlockRecovery(GOOD_RECOVERY);
    if (!bio.ok || !rec.ok) throw new Error('expected both unlocks');
    // Encrypt with the biometric DEK, decrypt with the recovery DEK.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      bio.dek,
      new TextEncoder().encode('same-key'),
    );
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      rec.dek,
      ct,
    );
    expect(new TextDecoder().decode(pt)).toBe('same-key');
  });
});

describe('reEnrol (non-destructive PIN / passphrase change)', () => {
  it('pin: the new PIN unlocks and the old PIN fails after re-enrol', async () => {
    await enrolPin('12345678');
    const result = await reEnrolPin('12345678', '87654321');
    expect(result.ok).toBe(true);

    expect((await unlockPin('87654321')).ok).toBe(true);
    expect((await unlockPin('12345678')).ok).toBe(false);
  });

  it('passphrase: the new passphrase unlocks and the old fails after re-enrol', async () => {
    await enrolPassphrase(GOOD_PASSPHRASE);
    const next = 'Brand-New-Phrase-2!';
    const result = await reEnrolPassphrase(GOOD_PASSPHRASE, next);
    expect(result.ok).toBe(true);

    expect((await unlockPassphrase(next)).ok).toBe(true);
    expect((await unlockPassphrase(GOOD_PASSPHRASE)).ok).toBe(false);
  });

  // Load-bearing: re-enrol only rewraps the SAME DEK material, so data
  // encrypted before the change must still decrypt after it.
  it('data encrypted BEFORE re-enrol still decrypts AFTER (DEK material unchanged)', async () => {
    await enrolPin('12345678');
    const before = await unlockPin('12345678');
    if (!before.ok) throw new Error('expected unlock');

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      before.dek,
      new TextEncoder().encode('sensitive-row'),
    );

    const result = await reEnrolPin('12345678', '87654321');
    expect(result.ok).toBe(true);

    const after = await unlockPin('87654321');
    if (!after.ok) throw new Error('expected unlock with new PIN');
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      after.dek,
      ct,
    );
    expect(new TextDecoder().decode(pt)).toBe('sensitive-row');
  });

  it('wrong current PIN returns { ok: false } and leaves the record unchanged', async () => {
    await enrolPin('12345678');
    const before = readVault();
    const result = await reEnrolPin('00000000', '87654321');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.message).toMatch(/current pin/i);
    // The old PIN still unlocks; the record was not rewritten.
    expect(readVault()).toEqual(before);
    expect((await unlockPin('12345678')).ok).toBe(true);
  });

  it('wrong current passphrase returns { ok: false } and leaves the record unchanged', async () => {
    await enrolPassphrase(GOOD_PASSPHRASE);
    const before = readVault();
    const result = await reEnrolPassphrase(
      'Wrong-Current-1!',
      'Brand-New-Phrase-2!',
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(readVault()).toEqual(before);
    expect((await unlockPassphrase(GOOD_PASSPHRASE)).ok).toBe(true);
  });

  it('rejects a weak new PIN before touching the record', async () => {
    await enrolPin('12345678');
    const before = readVault();
    const result = await reEnrolPin('12345678', '123');
    expect(result.ok).toBe(false);
    expect(readVault()).toEqual(before);
  });

  it('rejects a weak new passphrase before touching the record', async () => {
    await enrolPassphrase(GOOD_PASSPHRASE);
    const before = readVault();
    const result = await reEnrolPassphrase(GOOD_PASSPHRASE, 'short');
    expect(result.ok).toBe(false);
    expect(readVault()).toEqual(before);
  });

  it('fails when no matching vault is configured', async () => {
    expect((await reEnrolPin('12345678', '87654321')).ok).toBe(false);
    await enrolPassphrase(GOOD_PASSPHRASE);
    // A passphrase vault is not a pin vault.
    expect((await reEnrolPin('12345678', '87654321')).ok).toBe(false);
  });
});

describe('revoke', () => {
  it('clears the vault record', async () => {
    await enrolPin('12345678');
    await revoke();
    expect(vaultStatus()).toEqual({ configured: false });
    expect(readVault()).toBeNull();
  });

  it('signals the enrolled passkey as unknown when revoking a biometric vault', async () => {
    await enrolBiometric(GOOD_RECOVERY);
    await revoke();
    expect(signalCredentialUnknownMock).toHaveBeenCalledWith('CRED123');
    expect(readVault()).toBeNull();
  });
});
