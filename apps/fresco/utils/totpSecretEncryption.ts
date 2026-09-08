import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * Encryption at rest for TOTP secrets.
 *
 * A TOTP secret has to stay readable to verify codes, so unlike passwords,
 * recovery codes, and API tokens it cannot be stored as a hash. Instead the
 * Base32 seed is sealed with AES-256-GCM under a key that lives outside the
 * database, and only the sealed envelope reaches the `TotpCredential.secret`
 * column. A copy of the database alone therefore no longer yields the seed for
 * future codes; an attacker needs the deployment's key material as well.
 *
 * The key material comes from the deployment environment, so that an upgrade
 * needs no action from the operator: by default it is the database password
 * inside `DATABASE_URL`, which every deployment already holds outside the
 * database, and an explicit `TOTP_ENCRYPTION_KEY` takes precedence when set
 * (see `resolveTotpKeyMaterials`). Because the default may be a password an
 * operator typed by hand, the key is derived with scrypt rather than a fast
 * KDF, which is what makes guessing it from a leaked dump expensive.
 *
 * This module is plain Node crypto with no `server-only` guard and no `~/env`
 * import, because `scripts/setup-database.ts` (which runs under tsx before the
 * server starts) seals legacy plaintext rows with the same envelope the app
 * reads. The app-facing wrappers that bind the environment live in
 * `lib/auth/totp.ts`.
 *
 * Envelope format, stored as a plain string, every part base64url:
 *
 *   v1:<12-byte nonce>:<ciphertext>:<16-byte GCM tag>
 *
 * A Base32 secret only ever contains `A-Z`, `2-7` and `=`, so the lowercase
 * `v1:` prefix is unambiguous: a stored value either carries it and is an
 * envelope, or it is a legacy plaintext row the startup migration has not
 * sealed yet.
 */

/**
 * Shortest `TOTP_ENCRYPTION_KEY` accepted. `env.js` enforces the same bound on
 * the validated environment; `resolveTotpKeyMaterials` enforces it for the
 * deploy-time script, which reads the variable before validation runs.
 */
export const TOTP_ENCRYPTION_KEY_MIN_LENGTH = 32;

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const ENVELOPE_VERSION = 'v1';
const ENVELOPE_PREFIX = `${ENVELOPE_VERSION}:`;

// The salt is fixed because derivation has to be reproducible from the
// environment alone, with nothing stored beside the ciphertext; the cost
// parameters are what resist guessing. 2^16 / 8 / 1 is ~90ms on a laptop core
// and 64MB, paid once per process per key material (see the cache below).
const KDF_SALT = 'fresco-totp-secret-encryption';
const SCRYPT_N = 2 ** 16;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2;

const derivedKeys = new Map<string, Buffer>();

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

export type TotpKeySources = {
  /** `TOTP_ENCRYPTION_KEY`, when the deployment sets it. */
  overrideKey: string | undefined;
  /** `DATABASE_URL`, which every deployment has. */
  databaseUrl: string;
};

/** Key materials a deployment can open TOTP secrets with, preferred first. */
export type TotpKeyMaterials = [primary: string, ...fallbacks: string[]];

/**
 * Resolve the key materials for a deployment. Secrets are always sealed under
 * the first one; the rest are tried when opening, so that a deployment which
 * starts setting `TOTP_ENCRYPTION_KEY` can still read rows sealed under the
 * database password until the startup step has re-sealed them.
 *
 * A connection URL without a password (peer or token authentication) offers
 * nothing secret to derive from — host, user and database names are exactly
 * what a database dump reveals — so such a deployment must set
 * `TOTP_ENCRYPTION_KEY`. This throws rather than deriving from public
 * metadata; the deploy-time script resolves materials before it writes
 * anything, so the message reaches the operator with nothing sealed.
 */
export function resolveTotpKeyMaterials({
  overrideKey,
  databaseUrl,
}: TotpKeySources): TotpKeyMaterials {
  // The same rule env.js applies, so a value the server will refuse can never
  // seal a row first: rows sealed under a key that is then corrected would be
  // unreadable under both the corrected key and the database password.
  if (
    overrideKey !== undefined &&
    overrideKey.length < TOTP_ENCRYPTION_KEY_MIN_LENGTH
  ) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY must be at least ${TOTP_ENCRYPTION_KEY_MIN_LENGTH} characters long; generate one with \`openssl rand -base64 32\`.`,
    );
  }

  const password = databasePassword(databaseUrl);

  if (overrideKey) {
    return password ? [overrideKey, password] : [overrideKey];
  }
  if (!password) {
    throw new Error(
      'DATABASE_URL carries no password to derive the two-factor authentication encryption key from, so TOTP_ENCRYPTION_KEY is required: set it to a long random string of at least 32 characters, for example the output of `openssl rand -base64 32`.',
    );
  }
  return [password];
}

/**
 * The password the database driver will actually use, decoded; empty when
 * absent. `pg` (behind `PrismaPg`) lets a `?password=` query parameter take
 * precedence over the userinfo password, so this does the same: keying on a
 * userinfo value the driver ignores would seal rows under a credential that
 * can be removed without anyone noticing.
 */
function databasePassword(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return '';
  }
  const fromQuery = url.searchParams.get('password');
  if (fromQuery) return fromQuery;
  try {
    return decodeURIComponent(url.password);
  } catch {
    // A stray percent sign: the raw value is still stable and secret.
    return url.password;
  }
}

export function deriveTotpEncryptionKey(keyMaterial: string): Buffer {
  if (keyMaterial.length === 0) {
    throw new Error('TOTP secret encryption needs non-empty key material.');
  }

  const cached = derivedKeys.get(keyMaterial);
  if (cached) return cached;

  const key = scryptSync(keyMaterial, KDF_SALT, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  derivedKeys.set(keyMaterial, key);
  return key;
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
      'The stored TOTP secret could not be decrypted with the current key material. Either the key material changed since the secret was stored, or the stored value was altered.',
    );
  }
}

/**
 * Open an envelope with the first key material that fits. `keyIndex` says
 * which one did, so a caller can re-seal a row that only a fallback opened.
 */
export function decryptTotpSecretWithAny(
  stored: string,
  keyMaterials: TotpKeyMaterials,
): { secret: string; keyIndex: number } {
  let wrongKey: TotpSecretDecryptError | undefined;

  for (const [keyIndex, keyMaterial] of keyMaterials.entries()) {
    try {
      return { secret: decryptTotpSecret(stored, keyMaterial), keyIndex };
    } catch (error) {
      if (
        error instanceof TotpSecretDecryptError &&
        error.reason === 'wrong-key'
      ) {
        wrongKey = error;
        continue;
      }
      throw error;
    }
  }

  throw (
    wrongKey ??
    new TotpSecretDecryptError(
      'wrong-key',
      'No key material was available to open the stored TOTP secret.',
    )
  );
}
