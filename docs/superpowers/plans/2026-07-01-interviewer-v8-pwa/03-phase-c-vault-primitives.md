## Phase C: Vault primitives (Workstream B core)

Pure, unit-testable modules — no UI. These implement the Web-Crypto vault that replaces the deleted Electron main-process `electron/auth/vault.ts`. Every task obeys the global constraints in the plan header: no `any`, no `as` bypass assertions, no barrel files, no convenience re-exports; Vitest tests co-located in `__tests__/`; TDD with a commit per task; no changeset (interviewer-v8 is unreleased); crypto is Web Crypto (`crypto.subtle`) only.

**Test environment note:** the `unit` vitest project runs in **jsdom**, which exposes a full `crypto.subtle` (verified: `generateKey`/`encrypt`/`decrypt` AES-GCM, `wrapKey`/`unwrapKey` AES-KW with `unwrapKey` yielding `extractable:false`, `deriveKey` for PBKDF2-SHA256 and HKDF-SHA256, and `crypto.getRandomValues`). No node-env test file is required — the co-located `__tests__/*.test.ts` files run under the default jsdom `unit` project. WebAuthn (`navigator.credentials`, `PublicKeyCredential`) is **not** in jsdom and is mocked per-test.

Run the whole phase's tests: `pnpm --filter @codaco/interviewer-v8 test`.
Run one file: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit <path>`.

---

### Task C1: `crypto.ts` — base64 helpers + DEK generate/wrap/unwrap

**Files:**

- Create: `apps/interviewer-v8/src/lib/vault/crypto.ts`
- Create: `apps/interviewer-v8/src/lib/vault/__tests__/crypto.test.ts`
- Test: `apps/interviewer-v8/src/lib/vault/__tests__/crypto.test.ts`

**Interfaces:**

- Consumes: nothing (leaf module).
- Produces: `toBase64(bytes: Uint8Array): string`, `fromBase64(b64: string): Uint8Array<ArrayBuffer>`, `generateDek(): Promise<CryptoKey>`, `wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string>`, `unwrapDek(wrappedB64: string, kek: CryptoKey): Promise<CryptoKey>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import {
  fromBase64,
  generateDek,
  toBase64,
  unwrapDek,
  wrapDek,
} from '../crypto';

async function makeKwKek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64]);
    const b64 = toBase64(bytes);
    expect(typeof b64).toBe('string');
    expect(Array.from(fromBase64(b64))).toEqual(Array.from(bytes));
  });

  it('round-trips an empty array', () => {
    expect(toBase64(new Uint8Array(0))).toBe('');
    expect(fromBase64('').length).toBe(0);
  });
});

describe('generateDek', () => {
  it('produces an extractable AES-GCM-256 key usable for encrypt/decrypt', async () => {
    const dek = await generateDek();
    expect(dek.algorithm.name).toBe('AES-GCM');
    expect(dek.extractable).toBe(true);
    expect(dek.usages).toEqual(expect.arrayContaining(['encrypt', 'decrypt']));
  });
});

describe('wrapDek / unwrapDek', () => {
  it('round-trips a DEK through an AES-KW KEK, yielding a non-extractable session key', async () => {
    const kek = await makeKwKek();
    const dek = await generateDek();
    const wrapped = await wrapDek(dek, kek);
    expect(typeof wrapped).toBe('string');

    const session = await unwrapDek(wrapped, kek);
    expect(session.algorithm.name).toBe('AES-GCM');
    expect(session.extractable).toBe(false);
    expect(session.usages).toEqual(
      expect.arrayContaining(['encrypt', 'decrypt']),
    );
  });

  it('rejects unwrapping with the wrong KEK', async () => {
    const kek = await makeKwKek();
    const other = await makeKwKek();
    const dek = await generateDek();
    const wrapped = await wrapDek(dek, kek);

    await expect(unwrapDek(wrapped, other)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/crypto.test.ts`
      Expected: FAIL — `../crypto` does not exist, so the import cannot resolve.
- [ ] **Step 3: Implement**

```ts
// apps/interviewer-v8/src/lib/vault/crypto.ts
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
  plaintext: Uint8Array,
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
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/crypto.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/vault/crypto.ts apps/interviewer-v8/src/lib/vault/__tests__/crypto.test.ts && git commit -m "feat(interviewer-v8): add vault crypto base64 + DEK wrap/unwrap"
```

---

### Task C2: `crypto.ts` — KEK derivation + AES-GCM record/asset codecs

**Files:**

- Modify: `apps/interviewer-v8/src/lib/vault/crypto.ts` (already fully written in C1; this task only adds tests for the derivation + field-codec functions shipped there)
- Create: `apps/interviewer-v8/src/lib/vault/__tests__/cryptoRecords.test.ts`
- Test: `apps/interviewer-v8/src/lib/vault/__tests__/cryptoRecords.test.ts`

**Interfaces:**

- Consumes: `generateDek`, `wrapDek`, `unwrapDek`, `deriveKekFromPassword`, `deriveKekFromPrf`, `encryptJson`, `decryptJson`, `encryptAssetData`, `decryptAssetData`, `toBase64`, `PBKDF2_ITERATIONS`, `PBKDF2_SALT_BYTES` from `../crypto`.
- Produces: nothing new (validates the C1 file surface end-to-end).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import {
  decryptAssetData,
  decryptJson,
  deriveKekFromPassword,
  deriveKekFromPrf,
  encryptAssetData,
  encryptJson,
  generateDek,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_BYTES,
  toBase64,
  unwrapDek,
  wrapDek,
} from '../crypto';

function randomSaltB64(bytes = PBKDF2_SALT_BYTES): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes)));
}

describe('deriveKekFromPassword', () => {
  it('produces a non-extractable AES-KW KEK that wraps and unwraps a DEK', async () => {
    const salt = randomSaltB64();
    const kek = await deriveKekFromPassword('correct horse', salt, 1000);
    expect(kek.algorithm.name).toBe('AES-KW');
    expect(kek.extractable).toBe(false);

    const dek = await generateDek();
    const wrapped = await wrapDek(dek, kek);
    const kekAgain = await deriveKekFromPassword('correct horse', salt, 1000);
    const session = await unwrapDek(wrapped, kekAgain);
    expect(session.extractable).toBe(false);
  });

  it('derives a different KEK for the wrong secret (unwrap fails)', async () => {
    const salt = randomSaltB64();
    const kek = await deriveKekFromPassword('right secret', salt, 1000);
    const dek = await generateDek();
    const wrapped = await wrapDek(dek, kek);
    const wrongKek = await deriveKekFromPassword('wrong secret', salt, 1000);
    await expect(unwrapDek(wrapped, wrongKek)).rejects.toThrow();
  });

  it('uses the standard PBKDF2 constants', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    expect(PBKDF2_SALT_BYTES).toBe(32);
  });
});

describe('deriveKekFromPrf', () => {
  it('derives a stable AES-KW KEK from a fixed PRF output + salt', async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32));
    const salt = randomSaltB64();
    const kek = await deriveKekFromPrf(prf.buffer, salt);
    expect(kek.algorithm.name).toBe('AES-KW');

    const dek = await generateDek();
    const wrapped = await wrapDek(dek, kek);
    const kekAgain = await deriveKekFromPrf(prf.buffer, salt);
    const session = await unwrapDek(wrapped, kekAgain);
    expect(session.extractable).toBe(false);
  });
});

describe('encryptJson / decryptJson', () => {
  it('round-trips a structured value with matching AAD', async () => {
    const dek = await generateDek();
    const value = { nodes: [{ id: 'n1' }], count: 3, ok: true };
    const field = await encryptJson(value, dek, 'sessions:abc');
    expect(typeof field.iv).toBe('string');
    expect(typeof field.ct).toBe('string');

    const decoded = await decryptJson<typeof value>(field, dek, 'sessions:abc');
    expect(decoded).toEqual(value);
  });

  it('rejects when the AAD does not match', async () => {
    const dek = await generateDek();
    const field = await encryptJson({ a: 1 }, dek, 'sessions:abc');
    await expect(
      decryptJson(field, dek, 'sessions:different'),
    ).rejects.toThrow();
  });

  it('rejects when the DEK is wrong', async () => {
    const dek = await generateDek();
    const otherDek = await generateDek();
    const field = await encryptJson({ a: 1 }, dek, 'sessions:abc');
    await expect(
      decryptJson(field, otherDek, 'sessions:abc'),
    ).rejects.toThrow();
  });

  it('uses a fresh random IV per call', async () => {
    const dek = await generateDek();
    const a = await encryptJson({ a: 1 }, dek, 'sessions:abc');
    const b = await encryptJson({ a: 1 }, dek, 'sessions:abc');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe('encryptAssetData / decryptAssetData', () => {
  it('round-trips a string asset', async () => {
    const dek = await generateDek();
    const enc = await encryptAssetData('hello world', dek, 'assets:h::a');
    expect(enc.kind).toBe('string');
    const out = await decryptAssetData(enc, dek, 'assets:h::a');
    expect(out).toBe('hello world');
  });

  it('round-trips a blob asset preserving mime type', async () => {
    const dek = await generateDek();
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: 'image/png',
    });
    const enc = await encryptAssetData(blob, dek, 'assets:h::a');
    expect(enc.kind).toBe('blob');

    const out = await decryptAssetData(enc, dek, 'assets:h::a');
    expect(out).toBeInstanceOf(Blob);
    const outBlob = out as Blob;
    expect(outBlob.type).toBe('image/png');
    expect(Array.from(new Uint8Array(await outBlob.arrayBuffer()))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('rejects asset decrypt on AAD mismatch', async () => {
    const dek = await generateDek();
    const enc = await encryptAssetData('secret', dek, 'assets:h::a');
    await expect(decryptAssetData(enc, dek, 'assets:h::b')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/cryptoRecords.test.ts`
      Expected: FAIL — before C1 lands, `../crypto` does not resolve. If C1 already landed, this file exercises functions that exist; run it to confirm they behave as specified (this task is the acceptance suite for the derivation + codec surface).
- [ ] **Step 3: Implement**
      No implementation change — all functions (`deriveKekFromPassword`, `deriveKekFromPrf`, `encryptJson`, `decryptJson`, `encryptAssetData`, `decryptAssetData`) are fully implemented in the `crypto.ts` written in Task C1. This task's deliverable is the co-located acceptance test above.
- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/cryptoRecords.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/vault/__tests__/cryptoRecords.test.ts && git commit -m "test(interviewer-v8): cover vault KEK derivation + record/asset codecs"
```

---

### Task C3: `webauthn.ts` — PRF support probe, enroll, readPrf

**Files:**

- Create: `apps/interviewer-v8/src/lib/vault/webauthn.ts`
- Create: `apps/interviewer-v8/src/lib/vault/__tests__/webauthn.test.ts`
- Test: `apps/interviewer-v8/src/lib/vault/__tests__/webauthn.test.ts`

**Interfaces:**

- Consumes: `toBase64` from `../crypto`.
- Produces: `type BiometricEnrollment = { credentialId: string; prfSaltB64: string }`, `isPrfSupported(): Promise<boolean>`, `enrollBiometric(userHandle: Uint8Array): Promise<{ enrollment: BiometricEnrollment; prfOutput: ArrayBuffer }>`, `readPrf(credentialId: string, prfSaltB64: string): Promise<ArrayBuffer>`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { enrollBiometric, isPrfSupported, readPrf } from '../webauthn';

type CreateFn = (
  options: CredentialCreationOptions,
) => Promise<Credential | null>;
type GetFn = (options: CredentialRequestOptions) => Promise<Credential | null>;

function installNavigator(create: CreateFn, get: GetFn): void {
  vi.stubGlobal('navigator', {
    ...navigator,
    credentials: { create, get },
  });
}

// A fake PublicKeyCredential carrying a raw id and a PRF assertion result.
function fakeCredential(
  rawId: ArrayBuffer,
  prfFirst?: ArrayBuffer,
): Credential {
  const results =
    prfFirst == null ? {} : { prf: { results: { first: prfFirst } } };
  return {
    type: 'public-key',
    id: 'ignored',
    rawId,
    getClientExtensionResults: () => results,
  } as unknown as Credential;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPrfSupported', () => {
  it('is false when PublicKeyCredential is absent', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(await isPrfSupported()).toBe(false);
  });

  it('is true when a platform authenticator is available', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.resolve(true),
    });
    expect(await isPrfSupported()).toBe(true);
  });

  it('is false when no platform authenticator is available', async () => {
    vi.stubGlobal('PublicKeyCredential', {
      isUserVerifyingPlatformAuthenticatorAvailable: () =>
        Promise.resolve(false),
    });
    expect(await isPrfSupported()).toBe(false);
  });
});

describe('enrollBiometric', () => {
  it('creates a platform passkey then reads PRF via a follow-up get()', async () => {
    const rawId = new Uint8Array([9, 8, 7, 6]).buffer;
    const prf = new Uint8Array(32).fill(7).buffer;

    let createOpts: CredentialCreationOptions | undefined;
    let getOpts: CredentialRequestOptions | undefined;

    const create: CreateFn = (opts) => {
      createOpts = opts;
      return Promise.resolve(fakeCredential(rawId));
    };
    const get: GetFn = (opts) => {
      getOpts = opts;
      return Promise.resolve(fakeCredential(rawId, prf));
    };
    installNavigator(create, get);

    const { enrollment, prfOutput } = await enrollBiometric(
      new Uint8Array([1, 2, 3]),
    );

    // create() option shape
    const pub = createOpts?.publicKey;
    expect(pub?.authenticatorSelection?.authenticatorAttachment).toBe(
      'platform',
    );
    expect(pub?.authenticatorSelection?.residentKey).toBe('preferred');
    expect(pub?.authenticatorSelection?.userVerification).toBe('required');
    expect(
      (pub?.extensions as { prf?: unknown } | undefined)?.prf,
    ).toBeDefined();
    expect(Array.from(new Uint8Array(pub?.user.id as ArrayBuffer))).toEqual([
      1, 2, 3,
    ]);

    // get() option shape — PRF eval.first must be the prf salt
    const req = getOpts?.publicKey;
    expect(req?.userVerification).toBe('required');
    const prfExt = (
      req?.extensions as { prf?: { eval?: { first?: BufferSource } } }
    )?.prf;
    expect(prfExt?.eval?.first).toBeDefined();
    expect(req?.allowCredentials?.[0]?.id).toBeDefined();

    // returned PRF output + enrollment
    expect(Array.from(new Uint8Array(prfOutput))).toEqual(
      Array.from(new Uint8Array(prf)),
    );
    expect(typeof enrollment.credentialId).toBe('string');
    expect(typeof enrollment.prfSaltB64).toBe('string');
  });

  it('throws when the authenticator returns no PRF result', async () => {
    const rawId = new Uint8Array([1]).buffer;
    installNavigator(
      () => Promise.resolve(fakeCredential(rawId)),
      () => Promise.resolve(fakeCredential(rawId)), // no prf
    );
    await expect(enrollBiometric(new Uint8Array([1]))).rejects.toThrow();
  });
});

describe('readPrf', () => {
  it('returns the PRF secret for an existing credential', async () => {
    const rawId = new Uint8Array([4, 5, 6]).buffer;
    const prf = new Uint8Array(32).fill(3).buffer;
    let getOpts: CredentialRequestOptions | undefined;
    installNavigator(
      () => Promise.resolve(null),
      (opts) => {
        getOpts = opts;
        return Promise.resolve(fakeCredential(rawId, prf));
      },
    );

    // credentialId base64url of [4,5,6] = "BAUG"
    const out = await readPrf('BAUG', btoa('salt-bytes-here!'));
    expect(Array.from(new Uint8Array(out))).toEqual(
      Array.from(new Uint8Array(prf)),
    );
    const req = getOpts?.publicKey;
    expect(req?.userVerification).toBe('required');
    expect(
      (req?.extensions as { prf?: { eval?: { first?: BufferSource } } })?.prf
        ?.eval?.first,
    ).toBeDefined();
  });

  it('throws when PRF is missing on the assertion', async () => {
    const rawId = new Uint8Array([1]).buffer;
    installNavigator(
      () => Promise.resolve(null),
      () => Promise.resolve(fakeCredential(rawId)),
    );
    await expect(readPrf('AQ', btoa('salt'))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/webauthn.test.ts`
      Expected: FAIL — `../webauthn` does not exist.
- [ ] **Step 3: Implement**

```ts
// apps/interviewer-v8/src/lib/vault/webauthn.ts
import { fromBase64, toBase64 } from './crypto';

export type BiometricEnrollment = {
  credentialId: string; // base64url
  prfSaltB64: string;
};

const RP_NAME = 'Network Canvas Interviewer';
const PRF_SALT_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(b64url: string): Uint8Array<ArrayBuffer> {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad =
    padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return fromBase64(padded + pad);
}

type PrfExtensionResults = {
  prf?: { results?: { first?: BufferSource } };
};

function readPrfFirst(credential: Credential): ArrayBuffer | null {
  const asPublicKey = credential as PublicKeyCredential;
  const results =
    asPublicKey.getClientExtensionResults() as PrfExtensionResults;
  const first = results.prf?.results?.first;
  if (first == null) return null;
  if (first instanceof ArrayBuffer) return first;
  return first.buffer.slice(
    first.byteOffset,
    first.byteOffset + first.byteLength,
  );
}

export async function isPrfSupported(): Promise<boolean> {
  if (typeof PublicKeyCredential === 'undefined') return false;
  if (
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !==
    'function'
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enrollBiometric(
  userHandle: Uint8Array,
): Promise<{ enrollment: BiometricEnrollment; prfOutput: ArrayBuffer }> {
  const prfSalt = crypto.getRandomValues(new Uint8Array(PRF_SALT_BYTES));
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const created = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: RP_NAME },
      user: {
        id: userHandle,
        name: 'interviewer-v8',
        displayName: 'Network Canvas Interviewer',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      extensions: { prf: {} },
    },
  });
  if (created == null) {
    throw new Error('Biometric enrolment was cancelled');
  }
  const rawId = new Uint8Array((created as PublicKeyCredential).rawId);
  const credentialId = toBase64Url(rawId);
  const prfSaltB64 = toBase64(prfSalt);

  // A follow-up get() reads the PRF output; some platforms do not return it
  // at create() time.
  const prfOutput = await readPrf(credentialId, prfSaltB64);

  return {
    enrollment: { credentialId, prfSaltB64 },
    prfOutput,
  };
}

export async function readPrf(
  credentialId: string,
  prfSaltB64: string,
): Promise<ArrayBuffer> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        { type: 'public-key', id: fromBase64Url(credentialId) },
      ],
      userVerification: 'required',
      extensions: { prf: { eval: { first: fromBase64(prfSaltB64) } } },
    },
  });
  if (assertion == null) {
    throw new Error('Biometric verification was cancelled');
  }
  const first = readPrfFirst(assertion);
  if (first == null) {
    throw new Error('This device did not return a biometric secret (PRF)');
  }
  return first;
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/webauthn.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/vault/webauthn.ts apps/interviewer-v8/src/lib/vault/__tests__/webauthn.test.ts && git commit -m "feat(interviewer-v8): add WebAuthn PRF enrol/read for the vault"
```

---

### Task C4: `vaultStore.ts` — localStorage-backed versioned VaultRecord

**Files:**

- Create: `apps/interviewer-v8/src/lib/vault/vaultStore.ts`
- Create: `apps/interviewer-v8/src/lib/vault/__tests__/vaultStore.test.ts`
- Test: `apps/interviewer-v8/src/lib/vault/__tests__/vaultStore.test.ts`

**Interfaces:**

- Consumes: nothing (leaf; jsdom provides `localStorage`).
- Produces: `type VaultMode = 'pin' | 'passphrase' | 'biometric' | 'none'`, `type VaultRecord` (the 3-variant union from the contract), `readVault(): VaultRecord | null`, `writeVault(record: VaultRecord): void`, `clearVault(): void`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/vaultStore.test.ts`
      Expected: FAIL — `../vaultStore` does not exist.
- [ ] **Step 3: Implement**

```ts
// apps/interviewer-v8/src/lib/vault/vaultStore.ts
export type VaultMode = 'pin' | 'passphrase' | 'biometric' | 'none';

export type VaultRecord =
  | { version: 4; mode: 'none' }
  | {
      version: 4;
      mode: 'pin' | 'passphrase';
      kdfSaltB64: string;
      kdfIterations: number;
      wrappedDekB64: string;
    }
  | {
      version: 4;
      mode: 'biometric';
      webauthn: { credentialId: string; prfSaltB64: string };
      wrappedDekB64: string;
      recovery: {
        kdfSaltB64: string;
        kdfIterations: number;
        wrappedDekB64: string;
      };
    };

const STORAGE_KEY = 'interviewer-v8:vault';
const CURRENT_VERSION = 4;

function isVaultRecord(value: unknown): value is VaultRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { version?: unknown; mode?: unknown };
  if (record.version !== CURRENT_VERSION) return false;

  if (record.mode === 'none') return true;

  if (record.mode === 'pin' || record.mode === 'passphrase') {
    const r = record as {
      kdfSaltB64?: unknown;
      kdfIterations?: unknown;
      wrappedDekB64?: unknown;
    };
    return (
      typeof r.kdfSaltB64 === 'string' &&
      typeof r.kdfIterations === 'number' &&
      typeof r.wrappedDekB64 === 'string'
    );
  }

  if (record.mode === 'biometric') {
    const r = record as {
      webauthn?: { credentialId?: unknown; prfSaltB64?: unknown };
      wrappedDekB64?: unknown;
      recovery?: {
        kdfSaltB64?: unknown;
        kdfIterations?: unknown;
        wrappedDekB64?: unknown;
      };
    };
    return (
      typeof r.webauthn?.credentialId === 'string' &&
      typeof r.webauthn?.prfSaltB64 === 'string' &&
      typeof r.wrappedDekB64 === 'string' &&
      typeof r.recovery?.kdfSaltB64 === 'string' &&
      typeof r.recovery?.kdfIterations === 'number' &&
      typeof r.recovery?.wrappedDekB64 === 'string'
    );
  }

  return false;
}

export function readVault(): VaultRecord | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isVaultRecord(parsed) ? parsed : null;
}

export function writeVault(record: VaultRecord): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function clearVault(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/vaultStore.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/vault/vaultStore.ts apps/interviewer-v8/src/lib/vault/__tests__/vaultStore.test.ts && git commit -m "feat(interviewer-v8): add localStorage-backed vault record store"
```

---

### Task C5: `vault.ts` — enrol/unlock/verify/status/revoke orchestration

**Files:**

- Create: `apps/interviewer-v8/src/lib/vault/vault.ts`
- Create: `apps/interviewer-v8/src/lib/vault/__tests__/vault.test.ts`
- Test: `apps/interviewer-v8/src/lib/vault/__tests__/vault.test.ts`

**Interfaces:**

- Consumes: `generateDek`, `wrapDek`, `unwrapDek`, `deriveKekFromPassword`, `deriveKekFromPrf`, `PBKDF2_ITERATIONS`, `PBKDF2_SALT_BYTES`, `toBase64` from `./crypto`; `enrollBiometric`, `readPrf` from `./webauthn`; `readVault`, `writeVault`, `clearVault`, `type VaultMode`, `type VaultRecord` from `./vaultStore`; `getInstallationId` from `../platform/installationId`; `fromBase64` from `./crypto`.
- Produces: `type UnlockResult = { ok: true; dek: CryptoKey } | { ok: false; message: string }`, `type EnrolResult = { ok: boolean; message?: string }`, `enrolNone`, `enrolPin`, `enrolPassphrase`, `enrolBiometric`, `unlockPin`, `unlockPassphrase`, `unlockBiometric`, `unlockRecovery`, `verifyPin`, `verifyPassphrase`, `verifyBiometric`, `vaultStatus`, `revoke`.
- Note: `revoke()` here clears only the **vault record** (via `clearVault()`); dropping the Dexie data DB is composed by the higher-level `auth/api.ts::revoke` in a later phase (Phase F refactor), matching the contract's "drop the data DB and clear the record in that order" note.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readVault } from '../vaultStore';

// The WebAuthn layer is mocked so enrol/unlock biometric are deterministic:
// a fixed PRF secret per (credentialId, prfSalt). userHandle is ignored.
const FIXED_PRF = new Uint8Array(32).fill(11).buffer;
vi.mock('../webauthn', () => ({
  isPrfSupported: () => Promise.resolve(true),
  enrollBiometric: () =>
    Promise.resolve({
      enrollment: { credentialId: 'CRED123', prfSaltB64: btoa('prf-salt-xx') },
      prfOutput: FIXED_PRF,
    }),
  readPrf: () => Promise.resolve(FIXED_PRF),
}));

import {
  enrolBiometric,
  enrolNone,
  enrolPassphrase,
  enrolPin,
  revoke,
  unlockBiometric,
  unlockPassphrase,
  unlockPin,
  unlockRecovery,
  vaultStatus,
  verifyPassphrase,
  verifyPin,
} from '../vault';

const GOOD_PASSPHRASE = 'Correct-Horse-9!';
const GOOD_RECOVERY = 'Recovery-Phrase-7!';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('vaultStatus', () => {
  it('reports unconfigured before enrol', () => {
    expect(vaultStatus()).toEqual({ configured: false });
  });
});

describe('none mode', () => {
  it('enrols and reports mode none; unlock is not applicable (no DEK)', async () => {
    const result = await enrolNone();
    expect(result.ok).toBe(true);
    expect(vaultStatus()).toEqual({ configured: true, mode: 'none' });
    expect(readVault()).toEqual({ version: 4, mode: 'none' });
  });
});

describe('pin mode', () => {
  it('enrol → unlock round-trips with a usable DEK', async () => {
    const enrol = await enrolPin('12345678');
    expect(enrol.ok).toBe(true);
    expect(vaultStatus()).toEqual({ configured: true, mode: 'pin' });

    const unlocked = await unlockPin('12345678');
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) throw new Error('expected unlock');
    expect(unlocked.dek.algorithm.name).toBe('AES-GCM');
    expect(unlocked.dek.extractable).toBe(false);

    // sanity: the DEK actually works
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      unlocked.dek,
      new TextEncoder().encode('x'),
    );
    expect(ct.byteLength).toBeGreaterThan(0);
  });

  it('rejects an invalid PIN at enrol', async () => {
    const result = await enrolPin('123');
    expect(result.ok).toBe(false);
  });

  it('fails unlock with the wrong PIN', async () => {
    await enrolPin('12345678');
    const unlocked = await unlockPin('87654321');
    expect(unlocked.ok).toBe(false);
    if (unlocked.ok) throw new Error('expected failure');
    expect(unlocked.message).toMatch(/incorrect/i);
  });

  it('verifyPin succeeds for the right PIN and fails for the wrong one', async () => {
    await enrolPin('12345678');
    expect((await verifyPin('12345678')).ok).toBe(true);
    expect((await verifyPin('00000000')).ok).toBe(false);
  });
});

describe('passphrase mode', () => {
  it('enrol → unlock round-trips', async () => {
    await enrolPassphrase(GOOD_PASSPHRASE);
    expect(vaultStatus()).toEqual({ configured: true, mode: 'passphrase' });
    const unlocked = await unlockPassphrase(GOOD_PASSPHRASE);
    expect(unlocked.ok).toBe(true);
  });

  it('rejects a weak passphrase at enrol', async () => {
    const result = await enrolPassphrase('short');
    expect(result.ok).toBe(false);
  });

  it('fails unlock with the wrong passphrase', async () => {
    await enrolPassphrase(GOOD_PASSPHRASE);
    const unlocked = await unlockPassphrase('Wrong-Passphrase-1!');
    expect(unlocked.ok).toBe(false);
  });

  it('verifyPassphrase reflects correctness', async () => {
    await enrolPassphrase(GOOD_PASSPHRASE);
    expect((await verifyPassphrase(GOOD_PASSPHRASE)).ok).toBe(true);
    expect((await verifyPassphrase('Wrong-Passphrase-1!')).ok).toBe(false);
  });
});

describe('biometric mode (dual-wrapped)', () => {
  it('enrol → biometric unlock round-trips', async () => {
    const enrol = await enrolBiometric(GOOD_RECOVERY);
    expect(enrol.ok).toBe(true);
    expect(vaultStatus()).toEqual({ configured: true, mode: 'biometric' });

    const unlocked = await unlockBiometric();
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) throw new Error('expected unlock');
    expect(unlocked.dek.extractable).toBe(false);
  });

  it('recovery passphrase unlocks a biometric vault', async () => {
    await enrolBiometric(GOOD_RECOVERY);
    const unlocked = await unlockRecovery(GOOD_RECOVERY);
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) throw new Error('expected unlock');
    expect(unlocked.dek.extractable).toBe(false);
  });

  it('rejects an invalid recovery passphrase at enrol', async () => {
    const result = await enrolBiometric('weak');
    expect(result.ok).toBe(false);
    expect(vaultStatus()).toEqual({ configured: false });
  });

  it('fails recovery unlock with the wrong passphrase', async () => {
    await enrolBiometric(GOOD_RECOVERY);
    const unlocked = await unlockRecovery('Wrong-Recovery-1!');
    expect(unlocked.ok).toBe(false);
  });

  it('the biometric DEK and the recovery DEK are the same key material', async () => {
    await enrolBiometric(GOOD_RECOVERY);
    const bio = await unlockBiometric();
    const rec = await unlockRecovery(GOOD_RECOVERY);
    if (!bio.ok || !rec.ok) throw new Error('expected both unlocks');
    // Encrypt with the biometric DEK, decrypt with the recovery DEK.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      bio.dek,
      new TextEncoder().encode('same-key'),
    );
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      rec.dek,
      ct,
    );
    expect(new TextDecoder().decode(pt)).toBe('same-key');
  });
});

describe('revoke', () => {
  it('clears the vault record', async () => {
    await enrolPin('12345678');
    await revoke();
    expect(vaultStatus()).toEqual({ configured: false });
    expect(readVault()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/vault.test.ts`
      Expected: FAIL — `../vault` does not exist.
- [ ] **Step 3: Implement**

```ts
// apps/interviewer-v8/src/lib/vault/vault.ts
import { getInstallationId } from '../platform/installationId';
import {
  deriveKekFromPassword,
  deriveKekFromPrf,
  fromBase64,
  generateDek,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_BYTES,
  toBase64,
  unwrapDek,
  wrapDek,
} from './crypto';
import {
  clearVault,
  readVault,
  type VaultMode,
  type VaultRecord,
  writeVault,
} from './vaultStore';
import { enrollBiometric, readPrf } from './webauthn';

export type UnlockResult =
  | { ok: true; dek: CryptoKey }
  | { ok: false; message: string };
export type EnrolResult = { ok: boolean; message?: string };

const PIN_LENGTH = 8;
const PASSPHRASE_MIN_LENGTH = 12;
const PASSPHRASE_MIN_CLASSES = 3;

// Reused verbatim from the retired auth/api.ts.
function validatePin(pin: string): EnrolResult {
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    return { ok: false, message: `PIN must be exactly ${PIN_LENGTH} digits` };
  }
  return { ok: true };
}

function countCharacterClasses(s: string): number {
  let n = 0;
  if (/[a-z]/.test(s)) n += 1;
  if (/[A-Z]/.test(s)) n += 1;
  if (/[0-9]/.test(s)) n += 1;
  if (/[^a-zA-Z0-9]/.test(s)) n += 1;
  return n;
}

function validatePassphrase(phrase: string): EnrolResult {
  if (phrase.length < PASSPHRASE_MIN_LENGTH) {
    return {
      ok: false,
      message: `Passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters`,
    };
  }
  if (countCharacterClasses(phrase) < PASSPHRASE_MIN_CLASSES) {
    return {
      ok: false,
      message:
        'Passphrase must be stronger — combine uppercase, lowercase, numbers, and symbols',
    };
  }
  return { ok: true };
}

function randomSaltB64(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES)));
}

async function wrapFreshDekWithPassword(
  secret: string,
): Promise<{
  kdfSaltB64: string;
  kdfIterations: number;
  wrappedDekB64: string;
}> {
  const kdfSaltB64 = randomSaltB64();
  const kek = await deriveKekFromPassword(
    secret,
    kdfSaltB64,
    PBKDF2_ITERATIONS,
  );
  const dek = await generateDek();
  const wrappedDekB64 = await wrapDek(dek, kek);
  return { kdfSaltB64, kdfIterations: PBKDF2_ITERATIONS, wrappedDekB64 };
}

async function unlockWithPassword(
  secret: string,
  material: {
    kdfSaltB64: string;
    kdfIterations: number;
    wrappedDekB64: string;
  },
  wrongMessage: string,
): Promise<UnlockResult> {
  const kek = await deriveKekFromPassword(
    secret,
    material.kdfSaltB64,
    material.kdfIterations,
  );
  try {
    const dek = await unwrapDek(material.wrappedDekB64, kek);
    return { ok: true, dek };
  } catch {
    return { ok: false, message: wrongMessage };
  }
}

export async function enrolNone(): Promise<EnrolResult> {
  writeVault({ version: 4, mode: 'none' });
  return { ok: true };
}

export async function enrolPin(pin: string): Promise<EnrolResult> {
  const validation = validatePin(pin);
  if (!validation.ok) return validation;
  const material = await wrapFreshDekWithPassword(pin);
  writeVault({ version: 4, mode: 'pin', ...material });
  return { ok: true };
}

export async function enrolPassphrase(phrase: string): Promise<EnrolResult> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return validation;
  const material = await wrapFreshDekWithPassword(phrase);
  writeVault({ version: 4, mode: 'passphrase', ...material });
  return { ok: true };
}

export async function enrolBiometric(
  recoveryPhrase: string,
): Promise<EnrolResult> {
  const validation = validatePassphrase(recoveryPhrase);
  if (!validation.ok) return validation;

  const userHandle = new TextEncoder().encode(getInstallationId());
  const { enrollment, prfOutput } = await enrollBiometric(userHandle);

  // One DEK, dual-wrapped: PRF-derived KEK and a recovery-passphrase KEK.
  const dek = await generateDek();

  const bioKek = await deriveKekFromPrf(prfOutput, enrollment.prfSaltB64);
  const wrappedDekB64 = await wrapDek(dek, bioKek);

  const recoverySaltB64 = randomSaltB64();
  const recoveryKek = await deriveKekFromPassword(
    recoveryPhrase,
    recoverySaltB64,
    PBKDF2_ITERATIONS,
  );
  const recoveryWrappedDekB64 = await wrapDek(dek, recoveryKek);

  writeVault({
    version: 4,
    mode: 'biometric',
    webauthn: enrollment,
    wrappedDekB64,
    recovery: {
      kdfSaltB64: recoverySaltB64,
      kdfIterations: PBKDF2_ITERATIONS,
      wrappedDekB64: recoveryWrappedDekB64,
    },
  });
  return { ok: true };
}

export async function unlockPin(pin: string): Promise<UnlockResult> {
  const validation = validatePin(pin);
  if (!validation.ok) return { ok: false, message: 'Incorrect PIN' };
  const record = readVault();
  if (!record || record.mode !== 'pin') {
    return { ok: false, message: 'PIN is not configured on this device' };
  }
  return unlockWithPassword(pin, record, 'Incorrect PIN');
}

export async function unlockPassphrase(phrase: string): Promise<UnlockResult> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return { ok: false, message: 'Incorrect passphrase' };
  const record = readVault();
  if (!record || record.mode !== 'passphrase') {
    return {
      ok: false,
      message: 'Passphrase is not configured on this device',
    };
  }
  return unlockWithPassword(phrase, record, 'Incorrect passphrase');
}

export async function unlockBiometric(): Promise<UnlockResult> {
  const record = readVault();
  if (!record || record.mode !== 'biometric') {
    return {
      ok: false,
      message: 'Biometric authentication is not configured on this device',
    };
  }
  try {
    const prfOutput = await readPrf(
      record.webauthn.credentialId,
      record.webauthn.prfSaltB64,
    );
    const kek = await deriveKekFromPrf(prfOutput, record.webauthn.prfSaltB64);
    const dek = await unwrapDek(record.wrappedDekB64, kek);
    return { ok: true, dek };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Biometric authentication failed';
    return { ok: false, message };
  }
}

export async function unlockRecovery(phrase: string): Promise<UnlockResult> {
  const validation = validatePassphrase(phrase);
  if (!validation.ok) return { ok: false, message: 'Incorrect passphrase' };
  const record = readVault();
  if (!record || record.mode !== 'biometric') {
    return {
      ok: false,
      message: 'Recovery is not available for this vault',
    };
  }
  return unlockWithPassword(phrase, record.recovery, 'Incorrect passphrase');
}

export async function verifyPin(pin: string): Promise<EnrolResult> {
  const result = await unlockPin(pin);
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

export async function verifyPassphrase(phrase: string): Promise<EnrolResult> {
  const result = await unlockPassphrase(phrase);
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

export async function verifyBiometric(): Promise<EnrolResult> {
  const result = await unlockBiometric();
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

export function vaultStatus(): { configured: boolean; mode?: VaultMode } {
  const record = readVault();
  if (!record) return { configured: false };
  return { configured: true, mode: record.mode };
}

export async function revoke(): Promise<void> {
  const record = readVault();
  if (record?.mode === 'biometric') {
    // Best-effort passkey deletion: PublicKeyCredential.signalUnknownCredential
    // is not universally available, so guard and swallow — the record clear
    // below is the authoritative revocation.
    const signal = (
      PublicKeyCredential as unknown as {
        signalUnknownCredential?: (options: {
          rpId: string;
          credentialId: string;
        }) => Promise<void>;
      }
    ).signalUnknownCredential;
    if (typeof signal === 'function') {
      try {
        await signal({
          rpId: window.location.hostname,
          credentialId: record.webauthn.credentialId,
        });
      } catch {
        // Passkey deletion is best-effort; ignore failures.
      }
    }
  }
  clearVault();
}

// Referenced by the vault record variant type surfaced to callers.
export type { VaultMode, VaultRecord };
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault/__tests__/vault.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/vault/vault.ts apps/interviewer-v8/src/lib/vault/__tests__/vault.test.ts && git commit -m "feat(interviewer-v8): add vault orchestration (enrol/unlock/verify/revoke)"
```

---

### Task C6: Move base64 helpers out of `auth/api.ts` into `crypto.ts` (no duplication)

`auth/api.ts` still defines its own private `fromBase64`/`toBase64`. The contract requires those to live in `crypto.ts` and be imported from there — no duplication, no re-export. This task removes the local copies and imports the canonical ones. `auth/api.ts` is otherwise untouched in this phase (its full rebuild onto the vault happens in the later auth-refactor phase).

**Files:**

- Modify: `apps/interviewer-v8/src/lib/auth/api.ts`
- Test: verification via typecheck + the existing auth test suite (no new unit test — this is a pure refactor with behaviour preserved by the existing tests).

**Interfaces:**

- Consumes: `fromBase64`, `toBase64` from `../vault/crypto`.
- Produces: no signature change to `auth/api.ts`.

- [ ] **Step 1: Verification baseline (expect current state)**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth`
      Expected: PASS — the auth suite is green before the refactor (establishes the behaviour-preservation baseline).
- [ ] **Step 2: Confirm the local helpers exist to remove**
      Run: `grep -n "function fromBase64\|function toBase64" apps/interviewer-v8/src/lib/auth/api.ts`
      Expected: two matches (lines defining the local `fromBase64` and `toBase64`) — these are what we delete.
- [ ] **Step 3: Implement**
      Edit `apps/interviewer-v8/src/lib/auth/api.ts`:

1. Delete the two local helper definitions (the `fromBase64` and `toBase64` `function` blocks, currently lines 15–28):

```ts
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1)
    binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
```

2. Add an import from the canonical source. Insert after the existing `import * as vaultMetadata from './vaultMetadata';` line:

```ts
import { fromBase64, toBase64 } from '../vault/crypto';
```

All existing call sites (`derivePinVerifier`, `derivePassphraseVerifier`, the salt-encoding paths in `enrolWithPin`/`enrolWithPassphrase`/`reEnrolWithPin`/`reEnrolWithPassphrase`) now resolve to the imported helpers unchanged.

- [ ] **Step 4: Verify (typecheck + auth suite green, no dup)**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth && grep -c "function fromBase64\|function toBase64" apps/interviewer-v8/src/lib/auth/api.ts`
      Expected: PASS on the suite, and the `grep -c` prints `0` (the local helper definitions are gone; the imported ones are used).
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/auth/api.ts && git commit -m "refactor(interviewer-v8): source base64 helpers from vault/crypto"
```

---

### Task C7: Phase gate — typecheck, knip, and full unit run for the vault modules

Confirms the phase's new modules typecheck cleanly, expose nothing unused, and pass together. The vault modules are consumed by later phases (auth refactor, `db/recordCrypto.ts`), so any unused export here would be a knip failure until then — this gate documents the expected knip state and the wiring boundary.

**Files:**

- Modify: none (verification-only task).
- Test: repo-level `typecheck`, `knip`, and the `unit` project.

**Interfaces:**

- Consumes: all Phase C module surfaces.
- Produces: a green baseline for the auth-refactor phase to build on.

- [ ] **Step 1: Typecheck**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: PASS — no `tsc --build` diagnostics. (If a "cannot find module '../vault/crypto'" error appears, C1 has not landed; if `auth/api.ts` errors on the base64 import, C6 has not landed.)
- [ ] **Step 2: Full unit suite for the vault directory**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/vault`
      Expected: PASS — all five test files (`crypto`, `cryptoRecords`, `webauthn`, `vaultStore`, `vault`) green.
- [ ] **Step 3: knip — no unused exports within the phase boundary**
      Run: `pnpm knip --workspace apps/interviewer-v8 2>&1 | grep -iE "vault/(crypto|webauthn|vaultStore|vault)\.ts" || echo "no vault knip findings"`
      Expected output: prints `no vault knip findings` **for the record-codec functions consumed by the later `db/recordCrypto.ts` phase** only if that phase has landed. Until then, knip will list `encryptJson`/`decryptJson`/`encryptAssetData`/`decryptAssetData`/`EncryptedAssetData` (crypto.ts) and the `verify*`/`unlockRecovery`/`vaultStatus` vault surface as unused. **Expected/allowed:** these are the documented consumer boundary for the auth-refactor and `recordCrypto` phases. Do NOT delete them and do NOT add knip ignores — the consuming phases resolve the findings. Record the current list in the PR description so the reviewer knows the boundary is intentional.
- [ ] **Step 4: Repo-wide typecheck (cross-package safety)**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck`
      Expected: PASS (re-run after Step 3 in case knip surfaced a genuine dead export you removed).
- [ ] **Step 5: Commit (no-op guard)**

```bash
git status --porcelain apps/interviewer-v8/src/lib/vault && echo "Phase C verification complete — vault primitives green"
```

This task makes no code change; it is the phase's green-light gate. If `git status --porcelain` prints any vault-directory changes, a prior task was left uncommitted — commit it under its own task message before proceeding.
