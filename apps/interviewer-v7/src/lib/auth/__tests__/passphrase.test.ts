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
