import { createSecretKey, hkdfSync, type KeyObject } from 'node:crypto';
import { inspect } from 'node:util';

// The keyring is the whole of Studio's key custody (#1900): one value, read
// once at boot from a Compose file secret or an environment variable, holding
// every root key the deployment can still read a ciphertext under. There is no
// KMS and no per-team custody; the deployment backs this value up beside the
// database, because losing it makes every stored secret unreadable.

/**
 * `<id>:<base64 of 32 bytes>` entries separated by commas and/or whitespace,
 * the first being current. Whitespace is a separator so the file form can put
 * one entry per line, which is what an operator editing a Compose secret
 * reaches for.
 */
const ENTRY_SEPARATOR = /[\s,]+/;

/**
 * No `:`, so the id can never be confused with the separator inside an entry,
 * and no characters that would need escaping in the message that names an id
 * at boot. The 64-character ceiling is the `char_length(key_id) BETWEEN 1 AND
 * 64` check the tables storing a key id beside a ciphertext already carry.
 */
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Shared with the OAuth token form in cipher.ts, which reads a key id back out
 * of a stored value: the two must agree about what an id can look like, or a
 * value written by one would be unreadable to the other.
 */
export function isKeyId(value: string): boolean {
  return KEY_ID.test(value);
}

const KEY_BYTES = 32;

/**
 * Exactly what `openssl rand -base64 32` prints — the command the refusal
 * message and the documentation tell an operator to run. Node's base64 decoder
 * is permissive (it ignores stray characters and tolerates non-canonical pad
 * bits), so the shape is checked here and the canonical encoding is confirmed
 * by re-encoding below.
 */
const KEY_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * A rotation adds one entry and removes one; a keyring longer than this is a
 * value that has stopped being maintained, or a paste of something else.
 */
const MAX_ENTRIES = 32;

/**
 * The only purpose in use. A later participant-data purpose (the seam #1900
 * records rather than builds) derives its own subkey from the same roots, so
 * no key material is ever shared between the two.
 */
export type SecretPurpose = 'secrets';

/**
 * Never carries the offending entry, an id read out of a malformed entry, or
 * any part of the value: the whole input is key material, and a boot failure
 * is the thing most likely to be pasted into an issue. Positions and ids that
 * already parsed are safe to name, and are what an operator needs to find the
 * mistake.
 */
export class KeyringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyringError';
  }
}

/** Parsed key material, as everything that seals or opens a secret sees it. */
export type KeyringApi = {
  /** The key everything is sealed under; every other id is readable only. */
  readonly currentId: string;

  has(id: string): boolean;

  /** Current first, then the rest in the order the value listed them. */
  ids(): string[];

  /**
   * Internal to `src/secrets`: `envelope.ts` is the only caller, and there is
   * no exported encrypt or decrypt anywhere, so this is the entire path from
   * the keyring to a cipher. HKDF binds the purpose and the key id into the
   * derived key, which is why a ciphertext sealed under one purpose cannot be
   * read under another even with the same root, and why a key id is an
   * identity rather than a label.
   */
  subkey(purpose: SecretPurpose, id: string): KeyObject;

  toJSON(): Record<string, never>;

  [inspect.custom](): string;
};

/**
 * Takes already-validated entries, current first: `parseKeyring` below is the
 * only caller, so every keyring in the process came through the parse.
 *
 * A closure rather than a class, so the roots live in a `Map` that only the
 * functions returned here close over: nothing reaches them by walking
 * properties, cloning the value, or stringifying an object graph. `toJSON` and
 * the inspect hook state what the two printers do with it, rather than leaving
 * the safe behaviour to be incidental.
 */
function makeKeyring(
  entries: readonly { id: string; key: KeyObject }[],
): KeyringApi {
  if (entries.length === 0) {
    throw new KeyringError('The secrets keyring is empty.');
  }
  const roots = new Map(entries.map((entry) => [entry.id, entry.key]));
  const currentId = entries[0]!.id;
  const ids = (): string[] => [...roots.keys()];

  return {
    currentId,

    has: (id) => roots.has(id),

    ids,

    subkey: (purpose, id) => {
      const root = roots.get(id);
      if (!root) {
        throw new KeyringError(
          `The secrets keyring cannot produce key id "${id}".`,
        );
      }
      const info = JSON.stringify(['studio-secrets.v1', purpose, id]);
      const bytes = Buffer.from(hkdfSync('sha256', root, '', info, KEY_BYTES));
      const key = createSecretKey(bytes);
      bytes.fill(0);
      return key;
    },

    toJSON: () => ({}),

    [inspect.custom]: () =>
      `Keyring { ids: [ ${ids()
        .map((id) => `'${id}'`)
        .join(', ')} ], current: '${currentId}' }`,
  };
}

/**
 * Reads the configured value. Every failure is a `KeyringError` naming the
 * position or the id and nothing else — see the error's own comment.
 */
export function parseKeyring(text: string): KeyringApi {
  const entries = text.split(ENTRY_SEPARATOR).filter((entry) => entry !== '');
  if (entries.length === 0) {
    throw new KeyringError(
      'The secrets keyring is empty: it must hold at least one <id>:<base64 of 32 bytes> entry.',
    );
  }
  if (entries.length > MAX_ENTRIES) {
    throw new KeyringError(
      `The secrets keyring holds more than ${MAX_ENTRIES} entries.`,
    );
  }

  const parsed: { id: string; key: KeyObject }[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const position = index + 1;
    const separator = entry.indexOf(':');
    if (separator === -1) {
      throw new KeyringError(
        `The secrets keyring entry at position ${position} is not <id>:<base64 of 32 bytes>.`,
      );
    }
    const id = entry.slice(0, separator);
    const encoded = entry.slice(separator + 1);
    if (!KEY_ID.test(id)) {
      throw new KeyringError(
        `The secrets keyring entry at position ${position} has an invalid key id: ` +
          'an id is 1 to 64 characters of letters, digits, ".", "_" or "-", starting with a letter or a digit.',
      );
    }
    if (seen.has(id)) {
      throw new KeyringError(
        `The secrets keyring lists the key id "${id}" twice; each id appears once, the first being current.`,
      );
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (
      !KEY_BASE64.test(encoded) ||
      bytes.byteLength !== KEY_BYTES ||
      bytes.toString('base64') !== encoded
    ) {
      throw new KeyringError(
        `The secrets keyring entry at position ${position} is not a 32-byte key: ` +
          'write the value `openssl rand -base64 32` prints, 44 characters of standard base64.',
      );
    }
    seen.add(id);
    parsed.push({ id, key: createSecretKey(bytes) });
    bytes.fill(0);
  }

  return makeKeyring(parsed);
}
