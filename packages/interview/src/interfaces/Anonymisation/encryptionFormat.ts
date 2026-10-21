/**
 * The encryption format behind encrypted attributes. Every interview has one
 * AES-256-GCM key, derived from the participant's passphrase with PBKDF2 and
 * never stored. Nothing else about the key is stored either: its salt is
 * derived from the interview's id, and the iteration count is a constant of
 * this format, so the passphrase and the id are all it takes to derive the key
 * again. Whether a passphrase is the right one is known only by whether its
 * key decrypts an answer already stored.
 *
 * Each value is padded, then encrypted under that key with a fresh IV and
 * with additional authenticated data naming the node and the variable it
 * belongs to, so a ciphertext copied anywhere else fails to decrypt.
 *
 * Any change to what this module produces makes stored answers unreadable;
 * `encryptionFormat.test.ts` pins it byte for byte. A change must come with a
 * new context version, and a way to read the values written under this one.
 */

const PBKDF2_HASH = 'SHA-256';
const PBKDF2_ITERATIONS = 600_000;
const IV_BYTES = 12;
const PADDING_BLOCK = 32;
const PADDING_MARKER = 0x80;

const VALUE_CONTEXT = 'network-canvas/encrypted-attribute/v1';
const KEY_SALT_CONTEXT = 'network-canvas/interview-key-salt/v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

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

/**
 * The PBKDF2 salt of an interview's key: SHA-256 over the salt context and the
 * interview's id, encoded so that no other context or id gives the same bytes.
 * Unique to the interview without being stored, so the same passphrase used
 * in two interviews derives two unrelated keys.
 */
async function interviewKeySalt(
  interviewId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encodeFields([KEY_SALT_CONTEXT, interviewId]),
  );
  return new Uint8Array(digest);
}

/**
 * The key `passphrase` derives for the interview `interviewId`. Any
 * passphrase derives a key; whether it is the interview's passphrase is known
 * only by whether that key decrypts a value the interview has stored (see
 * `opensValue`).
 */
export async function deriveInterviewKey(
  passphrase: string,
  interviewId: string,
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
      hash: PBKDF2_HASH,
      iterations: PBKDF2_ITERATIONS,
      salt: await interviewKeySalt(interviewId),
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

/**
 * Whether `key` decrypts `encrypted` as belonging to `binding`. AES-GCM
 * authenticates every value, so a key derived from any other passphrase, or
 * for any other interview, never does.
 */
export function opensValue(
  key: CryptoKey,
  encrypted: EncryptedBytes,
  binding: ValueBinding,
): Promise<boolean> {
  return decryptValue(key, encrypted, binding).then(
    () => true,
    () => false,
  );
}
