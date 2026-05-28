import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const tmp = mkdtempSync(join(tmpdir(), 'vault-biometric-'));

// In-memory keystore fake: writes go to a map; reads succeed unless
// `failNextLoad` is set, simulating a cancelled biometric prompt.
let stored: Buffer | null = null;
let failNextLoad: Error | null = null;

vi.mock('electron', () => ({
  app: { getPath: () => tmp },
}));
vi.mock('../../db/service', () => ({
  openDatabase: vi.fn(),
  openDatabasePlain: vi.fn(),
  closeDatabase: vi.fn(),
  getDbPath: () => join(tmp, 'interviewer-v7.encrypted.db'),
}));
vi.mock('../biometricKeystore', () => ({
  isAvailable: vi.fn(async () => true),
  storeDek: vi.fn(async (dek: Buffer) => {
    stored = Buffer.from(dek);
  }),
  loadDek: vi.fn(async () => {
    if (failNextLoad) {
      const err = failNextLoad;
      failNextLoad = null;
      throw err;
    }
    if (!stored) throw new Error('No keychain item found');
    return Buffer.from(stored);
  }),
  deleteDek: vi.fn(async () => {
    stored = null;
  }),
}));

import * as vault from '../vault';
import { deleteVault } from '../vaultStore';

describe('vault biometric-keystore mode', () => {
  beforeEach(() => {
    deleteVault();
    stored = null;
    failNextLoad = null;
  });
  afterEach(() => {
    deleteVault();
    stored = null;
    failNextLoad = null;
  });

  it('setup writes to the keystore and leaves the vault unlocked', async () => {
    const r = await vault.setupBiometric();
    expect(r.ok).toBe(true);
    expect(stored).not.toBeNull();
    expect(stored?.length).toBe(32);
    const status = await vault.status();
    expect(status.mode).toBe('biometric-keystore');
    expect(status.locked).toBe(false);
  });

  it('lock → unlock round-trip reopens the DB with the same DEK', async () => {
    const { openDatabase } = await import('../../db/service');
    await vault.setupBiometric();
    const setupKey = vi.mocked(openDatabase).mock.calls.at(-1)?.[0];
    await vault.lock();
    const unlock = await vault.unlockBiometric();
    expect(unlock.ok).toBe(true);
    const unlockKey = vi.mocked(openDatabase).mock.calls.at(-1)?.[0];
    expect(unlockKey).toBe(setupKey);
    expect((await vault.status()).locked).toBe(false);
  });

  it('unlock returns ok:false when the keystore load throws (user cancelled)', async () => {
    await vault.setupBiometric();
    await vault.lock();
    failNextLoad = new Error('User cancelled the biometric prompt');
    const unlock = await vault.unlockBiometric();
    expect(unlock.ok).toBe(false);
    if (!unlock.ok) {
      expect(unlock.message).toMatch(/cancelled/i);
    }
    expect((await vault.status()).locked).toBe(true);
  });

  it('verifyBiometric triggers the keystore prompt without unlocking', async () => {
    const { openDatabase } = await import('../../db/service');
    await vault.setupBiometric();
    await vault.lock();
    const callsBefore = vi.mocked(openDatabase).mock.calls.length;
    const verify = await vault.verifyBiometric();
    expect(verify.ok).toBe(true);
    expect(vi.mocked(openDatabase).mock.calls.length).toBe(callsBefore);
    expect((await vault.status()).locked).toBe(true);
  });

  it('revoke deletes the keystore item', async () => {
    await vault.setupBiometric();
    expect(stored).not.toBeNull();
    await vault.revoke();
    expect(stored).toBeNull();
  });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});
