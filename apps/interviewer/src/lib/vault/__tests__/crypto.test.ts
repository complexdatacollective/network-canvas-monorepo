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
