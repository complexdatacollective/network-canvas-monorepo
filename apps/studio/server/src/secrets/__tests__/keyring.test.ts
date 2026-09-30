import { createHash, hkdfSync } from 'node:crypto';
import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { isKeyId, KeyringError, parseKeyring } from '../keyring.ts';

const rootOne = createHash('sha256').update('keyring-test-one').digest();
const rootTwo = createHash('sha256').update('keyring-test-two').digest();
const encodedOne = rootOne.toString('base64');
const encodedTwo = rootTwo.toString('base64');
const entryOne = `k1:${encodedOne}`;
const entryTwo = `k2:${encodedTwo}`;

describe('reading a keyring', () => {
  it('takes the first entry as current and keeps the rest readable', () => {
    const keyring = parseKeyring(`${entryOne},${entryTwo}`);
    expect(keyring.currentId).toBe('k1');
    expect(keyring.ids()).toEqual(['k1', 'k2']);
    expect(keyring.has('k2')).toBe(true);
    expect(keyring.has('k3')).toBe(false);
  });

  it('accepts the separators a file and a variable each produce', () => {
    // One per line is what an operator editing a mounted secret writes; a
    // comma-separated list is what fits in an environment variable.
    for (const text of [
      `${entryOne}\n${entryTwo}\n`,
      `  ${entryOne} ${entryTwo}  `,
      `${entryOne},\n${entryTwo}`,
      `${entryOne},${entryTwo}`,
    ]) {
      expect(parseKeyring(text).ids()).toEqual(['k1', 'k2']);
    }
  });

  it('reads a single-entry keyring, which is what a new deployment has', () => {
    expect(parseKeyring(entryOne).currentId).toBe('k1');
  });
});

describe('a keyring that cannot be used', () => {
  const rejected: [name: string, text: string][] = [
    ['nothing at all', ''],
    ['whitespace only', ' \n\t '],
    ['commas only', ',,'],
    ['an entry with no separator', encodedOne],
    ['an id with no key', 'k1:'],
    ['a key with no id', `:${encodedOne}`],
    ['an empty id', `:${encodedOne},${entryTwo}`],
    ['a space in the id', `key one:${encodedOne}`],
    ['an id that starts with a dot', `.k1:${encodedOne}`],
    ['an id past 64 characters', `${'k'.repeat(65)}:${encodedOne}`],
    ['an id and key written the other way round', `${encodedOne}:k1`],
    ['a value that is not base64', 'k1:not-a-key'],
    ['a 16-byte key', `k1:${Buffer.alloc(16).toString('base64')}`],
    ['a 31-byte key', `k1:${Buffer.alloc(31).toString('base64')}`],
    ['a 33-byte key', `k1:${Buffer.alloc(33).toString('base64')}`],
    ['an unpadded key', `k1:${encodedOne.slice(0, -1)}`],
    // Decodes to the same 32 bytes as A…A=, with pad bits Node ignores: a
    // value that is not exactly what the keyring would write out again.
    ['a non-canonical encoding', `k1:${'A'.repeat(42)}B=`],
    ['base64url instead of base64', `k1:${rootOne.toString('base64url')}=`],
    ['the same id twice', `${entryOne},k1:${encodedTwo}`],
    [
      'more entries than a rotation could leave',
      Array.from({ length: 33 }, (_, index) => `k${index}:${encodedOne}`).join(
        ',',
      ),
    ],
  ];

  it.each(rejected)('refuses %s', (_name, text) => {
    expect(() => parseKeyring(text)).toThrow(KeyringError);
  });

  it.each(rejected)('says nothing about the value it read (%s)', (_, text) => {
    const error = (() => {
      try {
        parseKeyring(text);
        return undefined;
      } catch (caught: unknown) {
        return caught;
      }
    })();
    // A boot failure is the thing most likely to be pasted into an issue, and
    // the whole input is key material — including the halves of a malformed
    // entry, which may be a key written into the id's place.
    const printed = inspect(error);
    for (const secret of [encodedOne, encodedTwo, encodedOne.slice(0, 20)]) {
      expect(printed).not.toContain(secret);
    }
  });

  it('names the position of the entry that is wrong', () => {
    expect(() => parseKeyring(`${entryOne},${entryTwo},k3:short`)).toThrow(
      /position 3/,
    );
  });

  it('names a duplicated id, which is safe to print and is the whole fault', () => {
    expect(() => parseKeyring(`${entryOne},k1:${encodedTwo}`)).toThrow(
      /key id "k1" twice/,
    );
  });

  it('tells the operator the command that produces a valid entry', () => {
    // The refusal has to be actionable: "not a 32-byte key" is only useful
    // beside the one command that prints one.
    expect(() => parseKeyring('k1:not-a-key')).toThrow(
      /openssl rand -base64 32/,
    );
  });
});

describe('subkeys', () => {
  const keyring = parseKeyring(`${entryOne},${entryTwo},k9:${encodedOne}`);

  function derive(purpose: string, id: string, root: Buffer): Buffer {
    return Buffer.from(
      hkdfSync(
        'sha256',
        root,
        '',
        JSON.stringify(['studio-secrets.v1', purpose, id]),
        32,
      ),
    );
  }

  it('derives HKDF-SHA256 over the purpose and the key id', () => {
    // Pinned against an independent derivation rather than against itself:
    // the purpose and the id are in the info string, which is what makes a
    // later participant-data purpose derive different material from the same
    // root, and what makes a key id an identity rather than a label.
    expect(keyring.subkey('secrets', 'k1').export()).toEqual(
      derive('secrets', 'k1', rootOne),
    );
    expect(keyring.subkey('secrets', 'k1').export()).toHaveLength(32);
    expect(derive('participant-data', 'k1', rootOne)).not.toEqual(
      derive('secrets', 'k1', rootOne),
    );
  });

  it('is not the root key', () => {
    expect(keyring.subkey('secrets', 'k1').export()).not.toEqual(rootOne);
  });

  it('separates two ids that name the same root', () => {
    // `k9` carries the same 32 bytes as `k1`. Rotation depends on this: a
    // ciphertext's key id must select the key that opens it, not merely hint
    // at it.
    expect(keyring.subkey('secrets', 'k9').export()).not.toEqual(
      keyring.subkey('secrets', 'k1').export(),
    );
  });

  it('refuses an id the keyring does not carry, naming it', () => {
    expect(() => keyring.subkey('secrets', 'gone')).toThrow(KeyringError);
    expect(() => keyring.subkey('secrets', 'gone')).toThrow(
      /cannot produce key id "gone"/,
    );
  });
});

describe('what a keyring shows of itself', () => {
  const keyring = parseKeyring(`${entryOne},${entryTwo}`);

  it('serialises to nothing', () => {
    expect(JSON.stringify(keyring)).toBe('{}');
    expect(JSON.stringify({ env: { secrets: keyring } })).toBe(
      '{"env":{"secrets":{}}}',
    );
  });

  it('inspects as its ids, never its material', () => {
    // An environment object reaches a log or a debugger far more often than a
    // key does on its own, and `util.inspect` is what prints it.
    const printed = inspect({ secrets: keyring }, { depth: 5 });
    expect(printed).toContain("ids: [ 'k1', 'k2' ]");
    expect(printed).toContain("current: 'k1'");
    expect(printed).not.toContain(encodedOne);
    expect(printed).not.toContain(encodedTwo);
  });
});

describe('the id shape shared with the stored OAuth form', () => {
  it('accepts what a keyring accepts and refuses what it refuses', () => {
    expect(isKeyId('k1')).toBe(true);
    expect(isKeyId('key.one_2-3')).toBe(true);
    expect(isKeyId('k'.repeat(64))).toBe(true);
    expect(isKeyId('k'.repeat(65))).toBe(false);
    // A `:` would make the id unreadable back out of
    // `studio-secret:<keyId>:<value>`, and out of SQL's `split_part`.
    expect(isKeyId('k:1')).toBe(false);
    expect(isKeyId('')).toBe(false);
    expect(isKeyId('-k1')).toBe(false);
  });
});
