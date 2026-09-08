import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * Encryption at rest for TOTP secrets.
 *
 * A TOTP secret has to stay readable to verify codes, so unlike passwords,
 * recovery codes, and API tokens it cannot be stored as a hash. Instead the
 * Base32 seed is sealed with AES-256-GCM under a key derived from the
 * deployment's `TOTP_ENCRYPTION_KEY`, and only the sealed envelope reaches the
 * database. A copy of the database alone therefore no longer yields the seed
 * for future codes; an attacker needs the key from the deployment environment
 * as well.
 *
 * This module is plain Node crypto with no `server-only` guard and no `~/env`
 * import, because `scripts/setup-database.ts` (which runs under tsx before the
 * server starts) seals legacy plaintext rows with the same envelope the app
 * reads. The app-facing wrappers that bind the environment key live in
 * `lib/auth/totp.ts`.
 *
 * Envelope format, stored as a plain string in the `TotpCredential.secret`
 * column, every part base64url:
 *
 *   v1:<12-byte nonce>:<ciphertext>:<16-byte GCM tag>
 *
 * A Base32 secret only ever contains `A-Z`, `2-7` and `=`, so the lowercase
 * `v1:` prefix is unambiguous: a stored value either carries it and is an
 * envelope, or it is a legacy plaintext row the startup migration has not
 * sealed yet.
 */

/** Shortest `TOTP_ENCRYPTION_KEY` accepted; `env.js` enforces the same bound. */
export const TOTP_ENCRYPTION_KEY_MIN_LENGTH = 32;

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const ENVELOPE_VERSION = 'v1';
const ENVELOPE_PREFIX = `${ENVELOPE_VERSION}:`;
const HKDF_INFO = 'fresco-totp-secret-encryption';

export type TotpSecretDecryptFailure =
  /** The stored value is a legacy plaintext secret, not an envelope. */
  | 'not-encrypted'
  /** The stored value carries the envelope prefix but is not a valid envelope. */
  | 'malformed'
  /** GCM authentication failed: a different key, or an altered envelope. */
  | 'wrong-key';

export class TotpSecretDecryptError extends Error {
  readonly reason: TotpSecretDecryptFailure;

  constructor(reason: TotpSecretDecryptFailure, message: string) {
    super(message);
    this.name = 'TotpSecretDecryptError';
    this.reason = reason;
  }
}

/**
 * Derive the AES-256 key from the deployment's key material. HKDF gives the
 * key a fixed length whatever the operator pasted, and the info string keeps
 * this key separate from any other purpose the same material might serve.
 */
export function deriveTotpEncryptionKey(keyMaterial: string): Buffer {
  if (keyMaterial.length < TOTP_ENCRYPTION_KEY_MIN_LENGTH) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY must be at least ${TOTP_ENCRYPTION_KEY_MIN_LENGTH} characters long; generate one with \`openssl rand -base64 32\`.`,
    );
  }

  return Buffer.from(hkdfSync('sha256', keyMaterial, '', HKDF_INFO, KEY_BYTES));
}

export function isEncryptedTotpSecret(stored: string): boolean {
  return stored.startsWith(ENVELOPE_PREFIX);
}

/** Seal a Base32 TOTP secret. Every call draws a fresh random nonce. */
export function encryptTotpSecret(secret: string, keyMaterial: string): string {
  const key = deriveTotpEncryptionKey(keyMaterial);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, {
    authTagLength: TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);

  return [
    ENVELOPE_VERSION,
    nonce.toString('base64url'),
    ciphertext.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join(':');
}

/**
 * Open an envelope produced by `encryptTotpSecret`. Throws
 * `TotpSecretDecryptError` rather than returning a wrong secret, so a caller
 * never verifies codes against garbage.
 */
export function decryptTotpSecret(stored: string, keyMaterial: string): string {
  if (!isEncryptedTotpSecret(stored)) {
    throw new TotpSecretDecryptError(
      'not-encrypted',
      'The stored TOTP secret is not encrypted. The startup migration that seals legacy secrets has not run against this database.',
    );
  }

  const parts = stored.split(':');
  const nonce = Buffer.from(parts[1] ?? '', 'base64url');
  const ciphertext = Buffer.from(parts[2] ?? '', 'base64url');
  const tag = Buffer.from(parts[3] ?? '', 'base64url');

  if (
    parts.length !== 4 ||
    nonce.length !== NONCE_BYTES ||
    ciphertext.length === 0 ||
    tag.length !== TAG_BYTES
  ) {
    throw new TotpSecretDecryptError(
      'malformed',
      'The stored TOTP secret is not a valid encrypted envelope.',
    );
  }

  const key = deriveTotpEncryptionKey(keyMaterial);
  const decipher = createDecipheriv(ALGORITHM, key, nonce, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new TotpSecretDecryptError(
      'wrong-key',
      'The stored TOTP secret could not be decrypted with the configured TOTP_ENCRYPTION_KEY. Either the key changed since the secret was stored, or the stored value was altered.',
    );
  }
}
