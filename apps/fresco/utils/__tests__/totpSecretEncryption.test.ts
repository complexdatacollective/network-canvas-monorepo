import { Secret, TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';

import {
  decryptTotpSecret,
  decryptTotpSecretWithAny,
  deriveTotpEncryptionKey,
  encryptTotpSecret,
  isEncryptedTotpSecret,
  resolveTotpKeyMaterials,
  TOTP_ENCRYPTION_KEY_MIN_LENGTH,
  TotpSecretDecryptError,
} from '~/utils/totpSecretEncryption';

const KEY = 'release-test-totp-encryption-key-0123456789';
const OTHER_KEY = 'a-different-totp-encryption-key-9876543210';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function expectDecryptFailure(
  run: () => unknown,
  reason: TotpSecretDecryptError['reason'],
) {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TotpSecretDecryptError);
  if (caught instanceof TotpSecretDecryptError) {
    expect(caught.reason).toBe(reason);
  }
}

describe('encryptTotpSecret / decryptTotpSecret', () => {
  it('round-trips a Base32 secret through the envelope', () => {
    const stored = encryptTotpSecret(SECRET, KEY);
    expect(decryptTotpSecret(stored, KEY)).toBe(SECRET);
  });

  it('keeps the Base32 secret out of the stored value', () => {
    const stored = encryptTotpSecret(SECRET, KEY);

    expect(stored).not.toContain(SECRET);
    // The envelope is not the secret in a different alphabet either: the
    // Base32 seed must not survive base64url decoding of any envelope part.
    for (const part of stored.split(':').slice(1)) {
      expect(Buffer.from(part, 'base64url').toString('utf8')).not.toContain(
        SECRET,
      );
    }
    expect(stored).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  });

  it('draws a fresh nonce per call so equal secrets never share ciphertext', () => {
    const first = encryptTotpSecret(SECRET, KEY);
    const second = encryptTotpSecret(SECRET, KEY);

    expect(first).not.toBe(second);
    expect(first.split(':')[1]).not.toBe(second.split(':')[1]);
    expect(decryptTotpSecret(first, KEY)).toBe(SECRET);
    expect(decryptTotpSecret(second, KEY)).toBe(SECRET);
  });

  it('verifies a code generated from the original secret after a round trip', () => {
    const secret = new Secret();
    const stored = encryptTotpSecret(secret.base32, KEY);
    const opened = decryptTotpSecret(stored, KEY);

    const code = new TOTP({ secret }).generate();
    expect(
      new TOTP({ secret: Secret.fromBase32(opened) }).validate({
        token: code,
        window: 0,
      }),
    ).toBe(0);
  });

  it('refuses to open the envelope with a different key', () => {
    const stored = encryptTotpSecret(SECRET, KEY);
    expectDecryptFailure(
      () => decryptTotpSecret(stored, OTHER_KEY),
      'wrong-key',
    );
  });

  it('refuses an envelope whose ciphertext was altered', () => {
    const [version, nonce, ciphertext, tag] = encryptTotpSecret(
      SECRET,
      KEY,
    ).split(':');
    const bytes = Buffer.from(ciphertext ?? '', 'base64url');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const altered = [version, nonce, bytes.toString('base64url'), tag].join(
      ':',
    );

    expectDecryptFailure(() => decryptTotpSecret(altered, KEY), 'wrong-key');
  });

  it('refuses a legacy plaintext secret instead of treating it as decrypted', () => {
    expectDecryptFailure(() => decryptTotpSecret(SECRET, KEY), 'not-encrypted');
  });

  it.each([
    ['too few parts', 'v1:abc:def'],
    [
      'short nonce',
      `v1:${Buffer.alloc(4).toString('base64url')}:AAAA:${Buffer.alloc(16).toString('base64url')}`,
    ],
    [
      'short tag',
      `v1:${Buffer.alloc(12).toString('base64url')}:AAAA:${Buffer.alloc(4).toString('base64url')}`,
    ],
    [
      'empty ciphertext',
      `v1:${Buffer.alloc(12).toString('base64url')}::${Buffer.alloc(16).toString('base64url')}`,
    ],
  ])('refuses a malformed envelope (%s)', (_label, stored) => {
    expectDecryptFailure(() => decryptTotpSecret(stored, KEY), 'malformed');
  });
});

describe('decryptTotpSecretWithAny', () => {
  it('opens with the primary material and says so', () => {
    const stored = encryptTotpSecret(SECRET, KEY);
    expect(decryptTotpSecretWithAny(stored, [KEY, OTHER_KEY])).toEqual({
      secret: SECRET,
      keyIndex: 0,
    });
  });

  it('falls back to a later material and reports which one opened the row', () => {
    const stored = encryptTotpSecret(SECRET, OTHER_KEY);
    expect(decryptTotpSecretWithAny(stored, [KEY, OTHER_KEY])).toEqual({
      secret: SECRET,
      keyIndex: 1,
    });
  });

  it('fails as wrong-key when no material fits', () => {
    const stored = encryptTotpSecret(
      SECRET,
      'yet-another-key-material-000000000',
    );
    expectDecryptFailure(
      () => decryptTotpSecretWithAny(stored, [KEY, OTHER_KEY]),
      'wrong-key',
    );
  });

  it('does not try further materials on a plaintext or malformed value', () => {
    expectDecryptFailure(
      () => decryptTotpSecretWithAny(SECRET, [KEY, OTHER_KEY]),
      'not-encrypted',
    );
    expectDecryptFailure(
      () => decryptTotpSecretWithAny('v1:truncated', [KEY, OTHER_KEY]),
      'malformed',
    );
  });
});

describe('isEncryptedTotpSecret', () => {
  it('recognises an envelope and rejects a Base32 secret', () => {
    expect(isEncryptedTotpSecret(encryptTotpSecret(SECRET, KEY))).toBe(true);
    expect(isEncryptedTotpSecret(SECRET)).toBe(false);
    expect(isEncryptedTotpSecret(new Secret().base32)).toBe(false);
  });
});

describe('resolveTotpKeyMaterials', () => {
  const NEON_URL =
    'postgresql://neondb_owner:npg_AbC%40123@ep-x-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

  it('uses the database password when no override is set', () => {
    expect(
      resolveTotpKeyMaterials({
        overrideKey: undefined,
        databaseUrl: NEON_URL,
      }),
    ).toEqual(['npg_AbC@123']);
  });

  it('puts the override first and keeps the database password as a fallback', () => {
    expect(
      resolveTotpKeyMaterials({ overrideKey: KEY, databaseUrl: NEON_URL }),
    ).toEqual([KEY, 'npg_AbC@123']);
  });

  it('refuses an override shorter than the minimum, so a row can never be sealed under it', () => {
    const short = 'x'.repeat(TOTP_ENCRYPTION_KEY_MIN_LENGTH - 1);

    expect(() =>
      resolveTotpKeyMaterials({ overrideKey: short, databaseUrl: NEON_URL }),
    ).toThrow(/TOTP_ENCRYPTION_KEY must be at least 32 characters/);
    expect(
      resolveTotpKeyMaterials({
        overrideKey: 'x'.repeat(TOTP_ENCRYPTION_KEY_MIN_LENGTH),
        databaseUrl: NEON_URL,
      })[0],
    ).toBe('x'.repeat(TOTP_ENCRYPTION_KEY_MIN_LENGTH));
  });

  it('never yields the same material for two different database passwords', () => {
    const [a] = resolveTotpKeyMaterials({
      overrideKey: undefined,
      databaseUrl: 'postgres://postgres:one@postgres:5432/postgres',
    });
    const [b] = resolveTotpKeyMaterials({
      overrideKey: undefined,
      databaseUrl: 'postgres://postgres:two@postgres:5432/postgres',
    });
    expect(a).not.toBe(b);
  });

  it('falls back to the whole connection string when the URL has no password', () => {
    const url = 'postgres://postgres@postgres:5432/postgres';
    expect(
      resolveTotpKeyMaterials({ overrideKey: undefined, databaseUrl: url }),
    ).toEqual([url]);
  });

  it('falls back to the raw value when the URL does not parse', () => {
    expect(
      resolveTotpKeyMaterials({
        overrideKey: undefined,
        databaseUrl: 'not a url',
      }),
    ).toEqual(['not a url']);
  });
});

describe('deriveTotpEncryptionKey', () => {
  it('derives a 32-byte key deterministically from the same material', () => {
    const first = deriveTotpEncryptionKey(KEY);
    const second = deriveTotpEncryptionKey(KEY);
    expect(first.length).toBe(32);
    expect(first.equals(second)).toBe(true);
    expect(first.equals(deriveTotpEncryptionKey(OTHER_KEY))).toBe(false);
  });

  it('derives different keys for a short password and its neighbours', () => {
    expect(
      deriveTotpEncryptionKey('CHANGE_ME').equals(
        deriveTotpEncryptionKey('CHANGE_ME2'),
      ),
    ).toBe(false);
  });

  it('rejects empty key material', () => {
    expect(() => deriveTotpEncryptionKey('')).toThrow(/non-empty/);
    expect(() => encryptTotpSecret(SECRET, '')).toThrow(/non-empty/);
  });
});
