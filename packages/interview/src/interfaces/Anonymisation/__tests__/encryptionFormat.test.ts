import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  decryptValue,
  deriveInterviewKey,
  encryptValue,
  opensValue,
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
 * Node's own crypto module. The salt is sha256 over the fields
 * ['network-canvas/interview-key-salt/v1', interviewId], each field a u32
 * big-endian length and its UTF-8 bytes. The key is pbkdf2Sync(NFC(passphrase),
 * salt, 600000, 32, 'sha256'). The value is padded to 32 bytes with 0x80 and
 * zeros, then encrypted with createCipheriv('aes-256-gcm'), its AAD the fields
 * ['network-canvas/encrypted-attribute/v1', nodeId, variableId], and the tag
 * appended to the ciphertext.
 *
 * The second passphrase is typed fully decomposed (NFD), with a ligature that
 * only compatibility normalisation would change, so its value pins NFC itself:
 * NFD, NFKC or no normalisation each derive another key.
 */
const PASSPHRASE = 'correct horse battery staple';
const INTERVIEW_ID = 'interview-1';
const KEY_SALT = fromHex(
  '54dce35c3036eeda87bcf5965abdaadcabf53948ec812ba6dff93610ecb94d4f',
);
const VALUE_IV = sequence(0x20, 12);
const VALUE_DATA = fromHex(
  'c843e54a38b65199c6cf9f78e7b454aaaea29edb82eae11d7015a2a6447f9fa4d634a0402da5f2e90e38df9d6dc187aa',
);
const BINDING = { nodeId: 'node-1', variableId: 'name' };

const DECOMPOSED_PASSPHRASE = `${String.fromCodePoint(0xfb01)}ne cafe${String.fromCodePoint(0x301)} au lait, u${String.fromCodePoint(0x308)}ber`;
const DECOMPOSED_VALUE_DATA = fromHex(
  '2d86e6bb21ad4b0a86f955a0dc17a12ede7ebed7154fc1702e48e3b0d914f9b9015e91fdc2f3c73d91d421b49cc99f09',
);

/** The same value encrypted for another interview with the same passphrase. */
const OTHER_INTERVIEW_VALUE_DATA = fromHex(
  '741e6783e428e3e60474d94d3b157d14d336ed07fbcf78f8ff062cacbbc5e33804555def0c97f2628c1a0a4af2356313',
);

describe('the encryption format', () => {
  it('derives the key with the known salt, hash and iteration count', async () => {
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');
    await deriveInterviewKey(PASSPHRASE, INTERVIEW_ID);

    expect(deriveKey).toHaveBeenCalledTimes(1);
    const params = deriveKey.mock.calls[0]?.[0] as Pbkdf2Params | undefined;
    expect(params).toMatchObject({
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 600_000,
    });
    expect(Array.from(new Uint8Array(params?.salt as ArrayBuffer))).toEqual(
      KEY_SALT,
    );
  });

  it('writes the known value bytes', async () => {
    const key = await deriveInterviewKey(PASSPHRASE, INTERVIEW_ID);
    returnRandomBytes(VALUE_IV);
    await expect(encryptValue(key, 'Ada Lovelace', BINDING)).resolves.toEqual({
      iv: VALUE_IV,
      data: VALUE_DATA,
    });
  });

  it('writes the known value bytes for a passphrase typed decomposed', async () => {
    expect(DECOMPOSED_PASSPHRASE.normalize('NFD')).toBe(DECOMPOSED_PASSPHRASE);

    const key = await deriveInterviewKey(DECOMPOSED_PASSPHRASE, INTERVIEW_ID);
    returnRandomBytes(VALUE_IV);
    await expect(encryptValue(key, 'Ada Lovelace', BINDING)).resolves.toEqual({
      iv: VALUE_IV,
      data: DECOMPOSED_VALUE_DATA,
    });
  });

  it('reads the known value bytes', async () => {
    const key = await deriveInterviewKey(PASSPHRASE, INTERVIEW_ID);
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

describe('checking a passphrase against a stored value', () => {
  const stored = { iv: VALUE_IV, data: VALUE_DATA };

  it('opens a value with the key of the passphrase and interview it was written with', async () => {
    const key = await deriveInterviewKey(PASSPHRASE, INTERVIEW_ID);
    await expect(opensValue(key, stored, BINDING)).resolves.toBe(true);
  });

  it('does not open it with the key of any other passphrase', async () => {
    const key = await deriveInterviewKey(
      'correct horse battery stapler',
      INTERVIEW_ID,
    );
    await expect(opensValue(key, stored, BINDING)).resolves.toBe(false);
  });

  it('does not open it with the same passphrase’s key for another interview', async () => {
    const key = await deriveInterviewKey(PASSPHRASE, 'interview-2');
    await expect(opensValue(key, stored, BINDING)).resolves.toBe(false);
  });

  it('opens it with the passphrase however its accents are composed', async () => {
    const composed = 'café au lait';
    const decomposed = `cafe${String.fromCodePoint(0x301)} au lait`;
    expect(decomposed).not.toBe(composed);

    const written = await encryptValue(
      (await encryptionFor(composed)).key,
      'Ada Lovelace',
      BINDING,
    );
    const { key } = await encryptionFor(decomposed);
    await expect(opensValue(key, written, BINDING)).resolves.toBe(true);
  });
});

describe('keys for different interviews', () => {
  it('differ for the same passphrase', async () => {
    const first = await deriveInterviewKey(PASSPHRASE, INTERVIEW_ID);
    const second = await deriveInterviewKey(PASSPHRASE, 'interview-2');

    returnRandomBytes(VALUE_IV, VALUE_IV);
    const underFirst = await encryptValue(first, 'Ada Lovelace', BINDING);
    const underSecond = await encryptValue(second, 'Ada Lovelace', BINDING);

    expect(underFirst.data).toEqual(VALUE_DATA);
    expect(underSecond.data).toEqual(OTHER_INTERVIEW_VALUE_DATA);
    await expect(decryptValue(second, underFirst, BINDING)).rejects.toThrow();
    await expect(decryptValue(first, underSecond, BINDING)).rejects.toThrow();
  });
});
