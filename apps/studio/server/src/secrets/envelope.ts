import { createCipheriv, createDecipheriv, type KeyObject } from 'node:crypto';

import { type Keyring, KeyringError, type SecretPurpose } from './keyring.ts';

// The byte layout every secret is stored in, and the only code in the server
// that calls a cipher. Internal to `src/secrets`: use sites reach it through
// the purpose-specific functions in cipher.ts, which are what bind a row's
// identity into the ciphertext, so no caller can seal a value without saying
// which row it belongs to.

/**
 * `[version][12-byte nonce][ciphertext][16-byte tag]`. The version byte is
 * what lets a later layout be introduced without guessing at the bytes: a
 * ciphertext that does not start with a version this build knows is refused
 * rather than interpreted.
 */
const ENVELOPE_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Everything in this module is sealed under the one purpose #1900 defines. */
const PURPOSE: SecretPurpose = 'secrets';

/** A ciphertext and the id of the key it was sealed under, stored beside it. */
export type SealedSecret = { ciphertext: Buffer; keyId: string };

/**
 * Injected only by the seed, whose synthetic data must be deterministic; every
 * other caller takes the `crypto.randomBytes` default in cipher.ts.
 */
export type SecretRandom = (bytes: number) => Buffer;

/**
 * The one failure of a read, whatever caused it: an unknown key id, a short or
 * tampered value, an unsupported version, or a ciphertext presented against a
 * row it does not belong to. One type because a caller has the same options in
 * every case, and because distinguishing them at the boundary would tell an
 * attacker which part of a forgery was wrong.
 *
 * The message may name a key id, which is not secret and is what an operator
 * needs. It never carries plaintext, ciphertext or key material.
 */
export class SecretUnreadableError extends Error {
  constructor(detail: string) {
    super(`Stored secret could not be read: ${detail}`);
    this.name = 'SecretUnreadableError';
  }
}

/**
 * The row identity, as authenticated data. JSON framing rather than joining
 * on a delimiter: identifiers that contain the delimiter would otherwise be
 * able to spell each other's tuples, and moving a ciphertext between two such
 * rows would go undetected.
 *
 * UUID-shaped parts are lower-cased because the same identity arrives in two
 * spellings — Postgres returns a uuid lower-cased, while an API caller may
 * send it upper-cased — and a value sealed through one must open through the
 * other.
 */
function additionalData(identity: readonly string[]): Buffer {
  if (identity.length === 0 || identity.some((part) => part === '')) {
    // A missing id would let two different rows share an AAD, which is the
    // one thing the AAD exists to prevent. Callers pass row columns, so this
    // is a programming error rather than a read failure.
    throw new Error(
      'Refusing to use a secret envelope with an incomplete row identity.',
    );
  }
  return Buffer.from(JSON.stringify(identity.map(canonicalUuid)));
}

function canonicalUuid(part: string): string {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(part)
    ? part.toLowerCase()
    : part;
}

function subkeyFor(keyring: Keyring, keyId: string): KeyObject {
  try {
    return keyring.subkey(PURPOSE, keyId);
  } catch (error) {
    if (error instanceof KeyringError) {
      // Rethrown as the read failure it is for a caller: a row sealed under a
      // key this deployment no longer carries reads the same as any other
      // unreadable row, and the boot check (#1900) is what turns it into a
      // refusal to start rather than a surprise at request time.
      throw new SecretUnreadableError(
        `the keyring cannot produce key id "${keyId}".`,
      );
    }
    throw error;
  }
}

export function sealSecret(
  keyring: Keyring,
  identity: readonly string[],
  plaintext: string,
  random: SecretRandom,
): SealedSecret {
  const aad = additionalData(identity);
  const keyId = keyring.currentId;
  const key = subkeyFor(keyring, keyId);
  const nonce = random(NONCE_BYTES);
  if (nonce.byteLength !== NONCE_BYTES) {
    // GCM accepts other nonce lengths, and a short one from an injected
    // generator would weaken every value it sealed without failing.
    throw new Error(
      `A secret nonce must be ${NONCE_BYTES} bytes; the generator returned ${nonce.byteLength}.`,
    );
  }
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad);
  const body = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return {
    keyId,
    ciphertext: Buffer.concat([
      Buffer.from([ENVELOPE_VERSION]),
      nonce,
      body,
      cipher.getAuthTag(),
    ]),
  };
}

export function openSecret(
  keyring: Keyring,
  identity: readonly string[],
  sealed: SealedSecret,
): string {
  const bytes = sealed.ciphertext;
  if (bytes.byteLength < 1 + NONCE_BYTES + TAG_BYTES) {
    throw new SecretUnreadableError(
      'the stored value is too short to be an envelope.',
    );
  }
  if (bytes[0] !== ENVELOPE_VERSION) {
    throw new SecretUnreadableError(
      `envelope version ${bytes[0]} is not one this build can read.`,
    );
  }
  const key = subkeyFor(keyring, sealed.keyId);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    bytes.subarray(1, 1 + NONCE_BYTES),
    { authTagLength: TAG_BYTES },
  );
  decipher.setAAD(additionalData(identity));
  decipher.setAuthTag(bytes.subarray(-TAG_BYTES));
  const pending = decipher.update(bytes.subarray(1 + NONCE_BYTES, -TAG_BYTES));
  let plaintext: Buffer | undefined;
  try {
    // `update` yields unauthenticated bytes: nothing is returned until
    // `final` has verified the tag, so a forged or misaddressed ciphertext
    // never hands a caller a partial plaintext to act on.
    plaintext = Buffer.concat([pending, decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    // Only `final` throws here, and only for a failed tag. The cause is
    // deliberately dropped: it says nothing an operator can act on, and the
    // one thing a caller can do is treat the row as unreadable.
    throw new SecretUnreadableError(
      `authentication failed under key id "${sealed.keyId}"; the value, the row it was read from, or the key does not match the one it was sealed with.`,
    );
  } finally {
    // The plaintext has been copied into a string by then. Zeroing the buffer
    // keeps the bytes out of a heap snapshot for longer than the string can be.
    pending.fill(0);
    plaintext?.fill(0);
  }
}
