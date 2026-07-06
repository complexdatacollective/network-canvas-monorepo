export type EncryptedField = { iv: string; ct: string }; // both base64
export type EncryptedAssetData =
  | { kind: 'blob'; mime: string; iv: string; ct: string }
  | { kind: 'string'; iv: string; ct: string };

// Moved verbatim from auth/api.ts — the single source for base64 in the vault.
export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1)
    binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_SALT_BYTES = 32;

const HKDF_INFO = 'interviewer-v8-dek-wrap';
const IV_BYTES = 12;

// DEK is generated extractable only long enough to be wrapped at enrolment;
// unwrapDek reconstructs it as a non-extractable session key.
export function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, 'AES-KW');
  return toBase64(new Uint8Array(wrapped));
}

export function unwrapDek(
  wrappedB64: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  const wrapped = fromBase64(wrappedB64);
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    kek,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// As unwrapDek, but the recovered DEK is extractable so it can be re-wrapped
// under a new KEK. Used ONLY by non-destructive re-enrolment: the extractable
// copy is transient (rewrap-then-discard) and never becomes the session DEK —
// the in-memory session key stays the non-extractable one from unwrapDek.
export function unwrapDekExtractable(
  wrappedB64: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  const wrapped = fromBase64(wrappedB64);
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    kek,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// KEKs are AES-KW-256, non-extractable, usages ['wrapKey','unwrapKey'].
export async function deriveKekFromPassword(
  secret: string,
  saltB64: string,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(saltB64),
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export async function deriveKekFromPrf(
  prfOutput: ArrayBuffer,
  saltB64: string,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: fromBase64(saltB64),
      info: new TextEncoder().encode(HKDF_INFO),
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function encryptBytes(
  plaintext: Uint8Array<ArrayBuffer>,
  dek: CryptoKey,
  aad: string,
): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(aad),
    },
    dek,
    plaintext,
  );
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
}

async function decryptBytes(
  ivB64: string,
  ctB64: string,
  dek: CryptoKey,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64(ivB64),
      additionalData: new TextEncoder().encode(aad),
    },
    dek,
    fromBase64(ctB64),
  );
  return new Uint8Array(decrypted);
}

export async function encryptJson(
  value: unknown,
  dek: CryptoKey,
  aad: string,
): Promise<EncryptedField> {
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  return encryptBytes(plaintext, dek, aad);
}

export async function decryptJson<T>(
  field: EncryptedField,
  dek: CryptoKey,
  aad: string,
): Promise<T> {
  const bytes = await decryptBytes(field.iv, field.ct, dek, aad);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function encryptAssetData(
  data: Blob | string,
  dek: CryptoKey,
  aad: string,
): Promise<EncryptedAssetData> {
  if (typeof data === 'string') {
    const { iv, ct } = await encryptBytes(
      new TextEncoder().encode(data),
      dek,
      aad,
    );
    return { kind: 'string', iv, ct };
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const { iv, ct } = await encryptBytes(bytes, dek, aad);
  return { kind: 'blob', mime: data.type, iv, ct };
}

export async function decryptAssetData(
  enc: EncryptedAssetData,
  dek: CryptoKey,
  aad: string,
): Promise<Blob | string> {
  const bytes = await decryptBytes(enc.iv, enc.ct, dek, aad);
  if (enc.kind === 'string') {
    return new TextDecoder().decode(bytes);
  }
  return new Blob([bytes], { type: enc.mime });
}
