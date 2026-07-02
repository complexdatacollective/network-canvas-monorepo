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
