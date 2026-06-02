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
