import type { NcEncryptionHeader } from '@codaco/shared-consts';

/**
 * The encryption format behind encrypted attributes. Every interview has one
 * AES-256-GCM key, derived once from the participant's passphrase with PBKDF2
 * and never stored. The network's encryption header records how to derive it
 * again, and a check value that only the right passphrase's key decrypts.
 *
 * Each value is padded, then encrypted under that key with a fresh IV and
 * with additional authenticated data naming the node and the variable it
 * belongs to, so a ciphertext copied anywhere else fails to decrypt.
 *
 * Any change to what this module produces makes stored answers unreadable;
 * `encryptionFormat.test.ts` pins it byte for byte.
 */

const FORMAT_VERSION = 1;
const METHOD = 'AES-256-GCM';
const KDF_ALGORITHM = 'PBKDF2';
const KDF_HASH = 'SHA-256';
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const PADDING_BLOCK = 32;
const PADDING_MARKER = 0x80;

/*
 * The bounds a stored header's key derivation must fall within before any
 * key is derived under it. The header is read from the network the host
 * hands over, which nothing validates on the way in, so these are the
 * runtime's own limits rather than the header's.
 *
 * The minimums are what this format writes, so a header cannot weaken the
 * key new answers are encrypted with. The iteration maximum bounds how long
 * one unlock can keep a participant's device busy: about 16 times the
 * format's own work, which takes a few seconds on a recent phone and under a
 * minute on a slow one, leaving room for a later format to raise the count.
 * Without it, a corrupt count of billions would hang the device for hours.
 * A salt longer than 64 bytes adds nothing to a 256-bit key.
 */
const MIN_PBKDF2_ITERATIONS = PBKDF2_ITERATIONS;
const MAX_PBKDF2_ITERATIONS = 10_000_000;
const MIN_SALT_BYTES = SALT_BYTES;
const MAX_SALT_BYTES = 64;

const VALUE_CONTEXT = 'network-canvas/encrypted-attribute/v1';
const CHECK_CONTEXT = 'network-canvas/passphrase-check/v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** The check value is the check context, unpadded, with GCM's tag. */
const CHECK_DATA_BYTES = encoder.encode(CHECK_CONTEXT).length + GCM_TAG_BYTES;

export type EncryptedBytes = { iv: number[]; data: number[] };

/** The node and variable a value is bound to. */
export type ValueBinding = { nodeId: string; variableId: string };

/**
 * Each field as a 32-bit big-endian byte length followed by its UTF-8 bytes,
 * so no two different field lists encode to the same bytes.
 */
function encodeFields(fields: readonly string[]): Uint8Array<ArrayBuffer> {
  const encoded = fields.map((field) => encoder.encode(field));
  const bytes = new Uint8Array(
    encoded.reduce((total, field) => total + 4 + field.length, 0),
  );
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const field of encoded) {
    view.setUint32(offset, field.length);
    bytes.set(field, offset + 4);
    offset += 4 + field.length;
  }
  return bytes;
}

const valueContext = ({ nodeId, variableId }: ValueBinding) =>
  encodeFields([VALUE_CONTEXT, nodeId, variableId]);

const checkContext = () => encodeFields([CHECK_CONTEXT]);

const checkPlaintext = () => encoder.encode(CHECK_CONTEXT);

/**
 * ISO/IEC 7816-4 padding to a multiple of the block: a 0x80 byte, then zeros.
 * A marker is always added, so the padding is never ambiguous.
 */
function pad(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const length = (Math.floor(bytes.length / PADDING_BLOCK) + 1) * PADDING_BLOCK;
  const padded = new Uint8Array(length);
  padded.set(bytes);
  padded[bytes.length] = PADDING_MARKER;
  return padded;
}

function unpad(padded: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (padded.length === 0 || padded.length % PADDING_BLOCK !== 0) {
    throw new Error('Encrypted value is not padded');
  }
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  if (end < 0 || padded[end] !== PADDING_MARKER) {
    throw new Error('Encrypted value is not padded');
  }
  return padded.slice(0, end);
}

const randomBytes = (length: number) =>
  crypto.getRandomValues(new Uint8Array(length));

async function deriveKey(
  passphrase: string,
  kdf: NcEncryptionHeader['kdf'],
): Promise<CryptoKey> {
  // Normalised so the same passphrase typed on another device or keyboard,
  // which may compose accented characters differently, derives the same key.
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: kdf.hash,
      iterations: kdf.iterations,
      salt: new Uint8Array(kdf.salt),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  additionalData: Uint8Array<ArrayBuffer>,
): Promise<EncryptedBytes> {
  const iv = randomBytes(IV_BYTES);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    key,
    plaintext,
  );
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(data)) };
}

async function decryptBytes(
  key: CryptoKey,
  { iv, data }: EncryptedBytes,
  additionalData: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv), additionalData },
    key,
    new Uint8Array(data),
  );
  return new Uint8Array(plaintext);
}

/**
 * A new header for an interview that has none, with the key `passphrase`
 * derives under it.
 */
export async function createEncryptionHeader(
  passphrase: string,
): Promise<{ header: NcEncryptionHeader; key: CryptoKey }> {
  const kdf: NcEncryptionHeader['kdf'] = {
    algorithm: KDF_ALGORITHM,
    hash: KDF_HASH,
    iterations: PBKDF2_ITERATIONS,
    salt: Array.from(randomBytes(SALT_BYTES)),
  };
  const key = await deriveKey(passphrase, kdf);
  const check = await encryptBytes(key, checkPlaintext(), checkContext());
  return {
    header: { version: FORMAT_VERSION, method: METHOD, kdf, check },
    key,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIntegerBetween = (value: unknown, min: number, max: number) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;

// The length is checked first, so an enormous array is refused without
// visiting its elements.
const isBytesOfLength = (value: unknown, min: number, max: number) =>
  Array.isArray(value) &&
  value.length >= min &&
  value.length <= max &&
  value.every((byte: unknown) => isIntegerBetween(byte, 0, 255));

/**
 * Whether a key may be derived under `header`: it names this format, and
 * every setting it supplies is within the bounds the runtime sets. Anything
 * else is refused whole, whatever passphrase is offered.
 */
export function isUsableEncryptionHeader(
  header: unknown,
): header is NcEncryptionHeader {
  if (!isRecord(header)) return false;
  const { kdf, check } = header;
  if (!isRecord(kdf) || !isRecord(check)) return false;
  return (
    header.version === FORMAT_VERSION &&
    header.method === METHOD &&
    kdf.algorithm === KDF_ALGORITHM &&
    kdf.hash === KDF_HASH &&
    isIntegerBetween(
      kdf.iterations,
      MIN_PBKDF2_ITERATIONS,
      MAX_PBKDF2_ITERATIONS,
    ) &&
    isBytesOfLength(kdf.salt, MIN_SALT_BYTES, MAX_SALT_BYTES) &&
    isBytesOfLength(check.iv, IV_BYTES, IV_BYTES) &&
    isBytesOfLength(check.data, CHECK_DATA_BYTES, CHECK_DATA_BYTES)
  );
}

/**
 * The key `passphrase` derives under `header`, or undefined when that key
 * does not decrypt the header's check value: the passphrase is not the one
 * the header was created with.
 *
 * A header outside the runtime's bounds is refused before any key is
 * derived (see `isUsableEncryptionHeader`), so a corrupt or tampered header
 * can neither weaken the key nor keep the device deriving it indefinitely.
 */
export async function openEncryptionHeader(
  header: unknown,
  passphrase: string,
): Promise<CryptoKey | undefined> {
  if (!isUsableEncryptionHeader(header)) return undefined;

  const key = await deriveKey(passphrase, header.kdf);
  try {
    const plaintext = await decryptBytes(key, header.check, checkContext());
    const expected = checkPlaintext();
    const matches =
      plaintext.length === expected.length &&
      plaintext.every((byte, index) => byte === expected[index]);
    return matches ? key : undefined;
  } catch {
    return undefined;
  }
}

export function encryptValue(
  key: CryptoKey,
  plaintext: string,
  binding: ValueBinding,
): Promise<EncryptedBytes> {
  return encryptBytes(
    key,
    pad(encoder.encode(plaintext)),
    valueContext(binding),
  );
}

/**
 * Rejects when the value cannot be decrypted under `key` as belonging to
 * `binding`: it is corrupt, has been tampered with, or was moved from another
 * node or variable.
 */
export async function decryptValue(
  key: CryptoKey,
  encrypted: EncryptedBytes,
  binding: ValueBinding,
): Promise<string> {
  const padded = await decryptBytes(key, encrypted, valueContext(binding));
  return decoder.decode(unpad(padded));
}
