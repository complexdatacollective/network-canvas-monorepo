import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NcEncryptionHeader } from '@codaco/shared-consts';

import {
  createEncryptionHeader,
  decryptValue,
  encryptValue,
  isUsableEncryptionHeader,
  openEncryptionHeader,
} from '../encryptionFormat';
import { encryptionFor } from './encryptionFixtures';

const sequence = (start: number, length: number) =>
  Array.from({ length }, (_, index) => (start + index) & 0xff);

const fromHex = (hex: string) =>
  Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Makes the next calls to `crypto.getRandomValues` return these bytes. */
function returnRandomBytes(...draws: number[][]) {
  const spy = vi.spyOn(crypto, 'getRandomValues');
  for (const bytes of draws) {
    spy.mockImplementationOnce((array) => {
      if (!(array instanceof Uint8Array) || array.length !== bytes.length) {
        throw new Error('Unexpected request for random bytes');
      }
      array.set(bytes);
      return array;
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

/*
 * Known-answer vectors, computed independently of this implementation with
 * Node's own crypto module: pbkdf2Sync(NFC(passphrase), salt, 600000, 32,
 * 'sha256') for the key, then createCipheriv('aes-256-gcm') with the AAD
 * (each field as a u32 big-endian length and its UTF-8 bytes) and the tag
 * appended to the ciphertext. The value is padded to 32 bytes with 0x80 and
 * zeros before encrypting.
 *
 * The second passphrase is typed fully decomposed (NFD), with a ligature that
 * only compatibility normalisation would change, so its check value pins NFC
 * itself: NFD, NFKC or no normalisation each derive another key.
 */
const PASSPHRASE = 'correct horse battery staple';
const SALT = sequence(0x00, 16);
const CHECK_IV = sequence(0x10, 12);
const VALUE_IV = sequence(0x20, 12);
const CHECK_DATA = fromHex(
  '627709b27f8dc35aa8dbf7bead805b8a704be994ee15b7d8a61d7882adda2bc0e8f205b4097165ce83a63008c4d1ec33a98f',
);
const VALUE_DATA = fromHex(
  '0bf3bc62c1554aa8ecbff964b8dfff646487315bd097478fb568f0d9f22dc8e504229cfe78b5a06e50dc26aebb6f0f23',
);
const BINDING = { nodeId: 'node-1', variableId: 'name' };

const DECOMPOSED_PASSPHRASE = `${String.fromCodePoint(0xfb01)}ne cafe${String.fromCodePoint(0x301)} au lait, u${String.fromCodePoint(0x308)}ber`;
const DECOMPOSED_CHECK_DATA = fromHex(
  '1f14a9c982c06cae30a25a82950b5c403211d977c79ed433801b0d32a63ade62092bb7dd119d225faa43173ba79c8177e635',
);

const KNOWN_HEADER: NcEncryptionHeader = {
  version: 1,
  method: 'AES-256-GCM',
  kdf: {
    algorithm: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 600_000,
    salt: SALT,
  },
  check: { iv: CHECK_IV, data: CHECK_DATA },
};

const CHECK_CONTEXT = 'network-canvas/passphrase-check/v1';

/**
 * A header for PASSPHRASE built outside the module under test, so its key
 * derivation and check plaintext can be ones the module would never write.
 */
async function buildHeader({
  iterations,
  salt,
  hash = 'SHA-256',
  checkPlaintext = CHECK_CONTEXT,
}: {
  iterations: number;
  salt: number[];
  hash?: string;
  checkPlaintext?: string;
}) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(PASSPHRASE),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash,
      iterations,
      salt: new Uint8Array(salt),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const context = encoder.encode(CHECK_CONTEXT);
  const additionalData = new Uint8Array(4 + context.length);
  new DataView(additionalData.buffer).setUint32(0, context.length);
  additionalData.set(context, 4);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(CHECK_IV), additionalData },
    key,
    encoder.encode(checkPlaintext),
  );
  return {
    ...KNOWN_HEADER,
    kdf: { ...KNOWN_HEADER.kdf, hash, iterations, salt },
    check: { iv: CHECK_IV, data: Array.from(new Uint8Array(data)) },
  };
}

describe('the encryption format', () => {
  it('writes the known header and value bytes', async () => {
    returnRandomBytes(SALT, CHECK_IV);
    const { header, key } = await createEncryptionHeader(PASSPHRASE);
    expect(header).toEqual(KNOWN_HEADER);

    returnRandomBytes(VALUE_IV);
    await expect(encryptValue(key, 'Ada Lovelace', BINDING)).resolves.toEqual({
      iv: VALUE_IV,
      data: VALUE_DATA,
    });
  });

  it('writes the known header for a passphrase typed decomposed', async () => {
    expect(DECOMPOSED_PASSPHRASE.normalize('NFD')).toBe(DECOMPOSED_PASSPHRASE);

    returnRandomBytes(SALT, CHECK_IV);
    const { header } = await createEncryptionHeader(DECOMPOSED_PASSPHRASE);
    expect(header).toEqual({
      ...KNOWN_HEADER,
      check: { iv: CHECK_IV, data: DECOMPOSED_CHECK_DATA },
    });
  });

  it('opens the known header for a passphrase typed decomposed', async () => {
    const header = {
      ...KNOWN_HEADER,
      check: { iv: CHECK_IV, data: DECOMPOSED_CHECK_DATA },
    };
    await expect(
      openEncryptionHeader(header, DECOMPOSED_PASSPHRASE),
    ).resolves.toEqual(expect.any(CryptoKey));
  });

  it('reads the known header and value bytes', async () => {
    const key = await openEncryptionHeader(KNOWN_HEADER, PASSPHRASE);
    if (!key) throw new Error('expected the passphrase to open the header');

    await expect(
      decryptValue(key, { iv: VALUE_IV, data: VALUE_DATA }, BINDING),
    ).resolves.toBe('Ada Lovelace');
  });

  it('pads every value to a multiple of 32 bytes, and reads it back', async () => {
    const { key } = await encryptionFor(PASSPHRASE);
    const cases: [string, number][] = [
      ['', 32],
      ['a'.repeat(31), 32],
      ['a'.repeat(32), 64],
      ['a'.repeat(33), 64],
      // Multibyte UTF-8: an accent, CJK and an emoji, 19 bytes in all.
      ['Zoë 李小龍 🙂', 32],
      ['李'.repeat(11), 64],
    ];

    for (const [plaintext, padded] of cases) {
      const encrypted = await encryptValue(key, plaintext, BINDING);
      expect(encrypted.iv).toHaveLength(12);
      // The ciphertext is the padded value and a 16-byte tag.
      expect(encrypted.data).toHaveLength(padded + 16);
      expect(byteLength(plaintext)).toBeLessThan(padded);
      await expect(decryptValue(key, encrypted, BINDING)).resolves.toBe(
        plaintext,
      );
    }
  });

  it('uses a fresh IV for every value', async () => {
    const { key } = await encryptionFor(PASSPHRASE);
    const first = await encryptValue(key, 'Ada Lovelace', BINDING);
    const second = await encryptValue(key, 'Ada Lovelace', BINDING);
    expect(first.iv).not.toEqual(second.iv);
    expect(first.data).not.toEqual(second.data);
  });

  it('refuses a value moved to another node or variable', async () => {
    const { key } = await encryptionFor(PASSPHRASE);
    const encrypted = await encryptValue(key, 'Ada Lovelace', BINDING);

    await expect(
      decryptValue(key, encrypted, { ...BINDING, nodeId: 'node-2' }),
    ).rejects.toThrow();
    await expect(
      decryptValue(key, encrypted, { ...BINDING, variableId: 'nickname' }),
    ).rejects.toThrow();
  });

  it('binds the node and the variable without ambiguity', async () => {
    const { key } = await encryptionFor(PASSPHRASE);
    const encrypted = await encryptValue(key, 'value', {
      nodeId: 'ab',
      variableId: 'c',
    });

    await expect(
      decryptValue(key, encrypted, { nodeId: 'a', variableId: 'bc' }),
    ).rejects.toThrow();
  });

  it('refuses a value that has been altered', async () => {
    const { key } = await encryptionFor(PASSPHRASE);
    const encrypted = await encryptValue(key, 'Ada Lovelace', BINDING);
    const [first = 0, ...rest] = encrypted.data;

    await expect(
      decryptValue(key, { ...encrypted, data: [first ^ 1, ...rest] }, BINDING),
    ).rejects.toThrow();
  });
});

describe('opening an encryption header', () => {
  it('turns away a passphrase other than the one it was created with', async () => {
    const { header } = await encryptionFor(PASSPHRASE);
    await expect(
      openEncryptionHeader(header, 'correct horse battery stapler'),
    ).resolves.toBeUndefined();
  });

  it('accepts the passphrase however its accents are composed', async () => {
    const composed = 'café au lait';
    const decomposed = `cafe${String.fromCodePoint(0x301)} au lait`;
    expect(decomposed).not.toBe(composed);

    const { header } = await encryptionFor(composed);
    await expect(openEncryptionHeader(header, decomposed)).resolves.toEqual(
      expect.any(CryptoKey),
    );
  });

  it('refuses a header with a weakened key derivation, even one the passphrase opens', async () => {
    // The control: a header built this way, with the format's own settings,
    // does open.
    await expect(
      openEncryptionHeader(
        await buildHeader({ iterations: 600_000, salt: SALT }),
        PASSPHRASE,
      ),
    ).resolves.toEqual(expect.any(CryptoKey));

    await expect(
      openEncryptionHeader(
        await buildHeader({ iterations: 1000, salt: SALT }),
        PASSPHRASE,
      ),
    ).resolves.toBeUndefined();
    await expect(
      openEncryptionHeader(
        await buildHeader({ iterations: 600_000, salt: SALT.slice(8) }),
        PASSPHRASE,
      ),
    ).resolves.toBeUndefined();
    await expect(
      openEncryptionHeader(
        await buildHeader({ iterations: 600_000, salt: SALT, hash: 'SHA-1' }),
        PASSPHRASE,
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses a header whose check value is not the check constant', async () => {
    await expect(
      openEncryptionHeader(
        await buildHeader({
          iterations: 600_000,
          salt: SALT,
          checkPlaintext: 'something else',
        }),
        PASSPHRASE,
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses a header whose check value has been altered', async () => {
    const [first = 0, ...rest] = CHECK_DATA;
    await expect(
      openEncryptionHeader(
        {
          ...KNOWN_HEADER,
          check: { iv: CHECK_IV, data: [first ^ 1, ...rest] },
        },
        PASSPHRASE,
      ),
    ).resolves.toBeUndefined();
  });
});

const withKdf = (kdf: Record<string, unknown>) => ({
  ...KNOWN_HEADER,
  kdf: { ...KNOWN_HEADER.kdf, ...kdf },
});

const withCheck = (check: Record<string, unknown>) => ({
  ...KNOWN_HEADER,
  check: { ...KNOWN_HEADER.check, ...check },
});

/*
 * Every setting the runtime reads from a stored header, pushed just outside
 * the bounds it accepts. Each would otherwise reach key derivation: an
 * iteration count can keep a device busy for hours, a hash or salt can weaken
 * the key, and the rest are not what this format writes.
 */
const refusedHeaders: { label: string; header: unknown }[] = [
  { label: 'is not an object', header: 'AES-256-GCM' },
  { label: 'is null', header: null },
  {
    label: 'has no key derivation',
    header: { version: 1, method: 'AES-256-GCM', check: KNOWN_HEADER.check },
  },
  {
    label: 'has no check value',
    header: { version: 1, method: 'AES-256-GCM', kdf: KNOWN_HEADER.kdf },
  },
  { label: 'has another version', header: { ...KNOWN_HEADER, version: 2 } },
  {
    label: 'has another method',
    header: { ...KNOWN_HEADER, method: 'AES-128-GCM' },
  },
  {
    label: 'has another key derivation algorithm',
    header: withKdf({ algorithm: 'scrypt' }),
  },
  { label: 'has a weaker hash', header: withKdf({ hash: 'SHA-1' }) },
  { label: 'has a slower hash', header: withKdf({ hash: 'SHA-512' }) },
  {
    label: 'asks for more iterations than the maximum',
    header: withKdf({ iterations: 10_000_001 }),
  },
  {
    label: 'asks for an iteration count no device could finish',
    header: withKdf({ iterations: 2 ** 32 - 1 }),
  },
  {
    label: 'asks for fewer iterations than the minimum',
    header: withKdf({ iterations: 599_999 }),
  },
  {
    label: 'has a fractional iteration count',
    header: withKdf({ iterations: 600_000.5 }),
  },
  {
    label: 'has an infinite iteration count',
    header: withKdf({ iterations: Number.POSITIVE_INFINITY }),
  },
  {
    label: 'has an iteration count that is not a number',
    header: withKdf({ iterations: '600000' }),
  },
  {
    label: 'has a salt shorter than the minimum',
    header: withKdf({ salt: sequence(0, 15) }),
  },
  {
    label: 'has a salt longer than the maximum',
    header: withKdf({ salt: sequence(0, 65) }),
  },
  {
    label: 'has a salt with a value that is not a byte',
    header: withKdf({ salt: [...sequence(0, 15), 256] }),
  },
  {
    label: 'has a salt with a negative value',
    header: withKdf({ salt: [...sequence(0, 15), -1] }),
  },
  {
    label: 'has a salt with a fractional value',
    header: withKdf({ salt: [...sequence(0, 15), 1.5] }),
  },
  {
    label: 'has a salt that is not an array',
    header: withKdf({ salt: 'AAECAwQFBgcICQoLDA0ODw==' }),
  },
  {
    label: 'has a check IV shorter than the format’s',
    header: withCheck({ iv: CHECK_IV.slice(1) }),
  },
  {
    label: 'has a check IV longer than the format’s',
    header: withCheck({ iv: [...CHECK_IV, 0] }),
  },
  {
    label: 'has a check IV with a value that is not a byte',
    header: withCheck({ iv: [...CHECK_IV.slice(1), 300] }),
  },
  {
    label: 'has check data shorter than the check value',
    header: withCheck({ data: CHECK_DATA.slice(1) }),
  },
  {
    label: 'has check data longer than the check value',
    header: withCheck({ data: [...CHECK_DATA, 0] }),
  },
  {
    label: 'has check data with a value that is not a byte',
    header: withCheck({ data: [...CHECK_DATA.slice(1), -5] }),
  },
];

/**
 * Makes any key derivation fail loudly, so a test can show that a header was
 * refused before one started.
 */
function refuseKeyDerivation() {
  const derived = new Error('A key was derived from a refused header');
  return [
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValue(derived),
    vi.spyOn(crypto.subtle, 'deriveKey').mockRejectedValue(derived),
  ];
}

describe('the bounds on an encryption header', () => {
  it('accepts the header the format writes', () => {
    expect(isUsableEncryptionHeader(KNOWN_HEADER)).toBe(true);
  });

  it.each(refusedHeaders)('refuses a header that $label', ({ header }) => {
    expect(isUsableEncryptionHeader(header)).toBe(false);
  });

  it.each(refusedHeaders)(
    'refuses to open a header that $label before deriving any key',
    async ({ header }) => {
      const derivation = refuseKeyDerivation();

      await expect(
        openEncryptionHeader(header, PASSPHRASE),
      ).resolves.toBeUndefined();
      for (const spy of derivation) expect(spy).not.toHaveBeenCalled();
    },
  );

  it.each([
    { label: 'the fewest iterations', kdf: { iterations: 600_000 } },
    { label: 'the most iterations', kdf: { iterations: 10_000_000 } },
    { label: 'the shortest salt', kdf: { salt: sequence(0, 16) } },
    { label: 'the longest salt', kdf: { salt: sequence(0, 64) } },
  ])('accepts a header with $label it allows', ({ kdf }) => {
    expect(isUsableEncryptionHeader(withKdf(kdf))).toBe(true);
  });
});
