import { describe, expect, test } from 'vitest';

import { encryptedNameOf, NameDecryptor } from '../encryptedNames';
import { encryptedPerson, person } from './fixtures';

const PASSPHRASE = 'correct horse battery staple';

describe('encryptedNameOf', () => {
  test('reads an encrypted name, and nothing from a name held as text or none', async () => {
    const encrypted = await encryptedPerson('bea', 'Bea', PASSPHRASE);
    expect(encryptedNameOf(encrypted, 'name')).toMatchObject({
      data: expect.any(Array),
      secureAttributes: {
        iv: expect.any(Array),
        salt: expect.any(Array),
      },
    });
    expect(encryptedNameOf(person('tom', { name: 'Tom' }), 'name')).toBe(
      undefined,
    );
    expect(encryptedNameOf(person('unnamed'), 'name')).toBe(undefined);
    // Ciphertext with no record of how it was made cannot be decrypted.
    expect(encryptedNameOf(person('orphan', { name: [1, 2, 3] }), 'name')).toBe(
      undefined,
    );
  });
});

describe('NameDecryptor', () => {
  test('decrypts each encrypted name with the passphrase', async () => {
    const nodes = [
      await encryptedPerson('bea', 'Bea', PASSPHRASE),
      await encryptedPerson('cal', 'Cal', PASSPHRASE),
      person('tom', { name: 'Tom' }),
      person('unnamed'),
    ];
    const decryptor = new NameDecryptor();
    // Nothing is known before decryption.
    expect(decryptor.read(nodes, 'name', PASSPHRASE)).toEqual({
      names: new Map(),
      failed: false,
      settled: false,
    });

    const result = await decryptor.decrypt(nodes, 'name', PASSPHRASE);
    expect(result).toEqual({
      names: new Map([
        ['bea', 'Bea'],
        ['cal', 'Cal'],
      ]),
      failed: false,
      settled: true,
    });
    // And is remembered.
    expect(decryptor.read(nodes, 'name', PASSPHRASE)).toEqual(result);
  });

  test('a name the passphrase cannot decrypt fails, and another passphrase tries it again', async () => {
    const nodes = [await encryptedPerson('bea', 'Bea', PASSPHRASE)];
    const decryptor = new NameDecryptor();
    await expect(decryptor.decrypt(nodes, 'name', 'wrong')).resolves.toEqual({
      names: new Map(),
      failed: true,
      settled: true,
    });
    await expect(
      decryptor.decrypt(nodes, 'name', PASSPHRASE),
    ).resolves.toMatchObject({
      names: new Map([['bea', 'Bea']]),
      failed: false,
    });
  });

  test('a name the stage has just written is read as its text until its ciphertext is decrypted', async () => {
    const nodes = [await encryptedPerson('bea', 'Bea', PASSPHRASE)];
    const decryptor = new NameDecryptor();
    const expected = new Map([['bea', 'Bea']]);
    expect(decryptor.read(nodes, 'name', PASSPHRASE, expected)).toEqual({
      names: new Map([['bea', 'Bea']]),
      failed: false,
      settled: false,
    });
    // Failing to decrypt is not covered over by what was expected.
    await decryptor.decrypt(nodes, 'name', 'wrong');
    expect(decryptor.read(nodes, 'name', 'wrong', expected)).toMatchObject({
      names: new Map(),
      failed: true,
    });
  });
});
