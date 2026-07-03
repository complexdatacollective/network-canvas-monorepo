import { afterEach, describe, expect, it } from 'vitest';

import {
  clearVault,
  readVault,
  type VaultRecord,
  writeVault,
} from '../vaultStore';

afterEach(() => {
  window.localStorage.clear();
});

describe('vaultStore', () => {
  it('returns null when no record is stored', () => {
    expect(readVault()).toBeNull();
  });

  it('round-trips a none record', () => {
    const record: VaultRecord = { version: 4, mode: 'none' };
    writeVault(record);
    expect(readVault()).toEqual(record);
  });

  it('round-trips a pin record', () => {
    const record: VaultRecord = {
      version: 4,
      mode: 'pin',
      kdfSaltB64: 'c2FsdA==',
      kdfIterations: 600_000,
      wrappedDekB64: 'd3JhcA==',
    };
    writeVault(record);
    expect(readVault()).toEqual(record);
  });

  it('round-trips a passphrase record', () => {
    const record: VaultRecord = {
      version: 4,
      mode: 'passphrase',
      kdfSaltB64: 'c2FsdA==',
      kdfIterations: 600_000,
      wrappedDekB64: 'd3JhcA==',
    };
    writeVault(record);
    expect(readVault()).toEqual(record);
  });

  it('round-trips a biometric record with recovery material', () => {
    const record: VaultRecord = {
      version: 4,
      mode: 'biometric',
      webauthn: { credentialId: 'AQID', prfSaltB64: 'c2FsdA==' },
      wrappedDekB64: 'Ymlv',
      recovery: {
        kdfSaltB64: 'cmVjb3Zlcg==',
        kdfIterations: 600_000,
        wrappedDekB64: 'cmVjd3JhcA==',
      },
    };
    writeVault(record);
    expect(readVault()).toEqual(record);
  });

  it('clearVault removes the record', () => {
    writeVault({ version: 4, mode: 'none' });
    clearVault();
    expect(readVault()).toBeNull();
  });

  it('returns null for a wrong-version record', () => {
    window.localStorage.setItem(
      'interviewer-v8:vault',
      JSON.stringify({ version: 3, mode: 'none' }),
    );
    expect(readVault()).toBeNull();
  });

  it('returns null for a corrupt record', () => {
    window.localStorage.setItem('interviewer-v8:vault', 'not-json');
    expect(readVault()).toBeNull();
  });
});
