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

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});
