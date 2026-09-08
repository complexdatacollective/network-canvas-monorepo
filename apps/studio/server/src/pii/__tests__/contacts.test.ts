import { webcrypto } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  type Contact,
  createContactBlindIndex,
  InvalidContactError,
  normalizeContact,
} from '../contacts.ts';
import { KeyConfigurationError } from '../keys.ts';
import { configuration, loadTestKeys, rootOne } from './fixtures.ts';

describe('contact normalization and blind indexes', () => {
  it.each([
    [
      { kind: 'email', value: '  Person.Name+tag@EXAMPLE.ORG \n' },
      'person.name+tag@example.org',
    ],
    [{ kind: 'phone', value: ' +1 (312) 555-0100 ' }, '+13125550100'],
    [{ kind: 'phone', value: '+44 20 7946 0000' }, '+442079460000'],
  ] satisfies [Contact, string][])(
    'normalizes $0.kind case %#',
    (contact, normalized) => {
      expect(normalizeContact(contact)).toBe(normalized);
    },
  );

  it.each([
    { kind: 'email', value: '' },
    { kind: 'email', value: 'name only' },
    { kind: 'email', value: 'person @example.org' },
    { kind: 'phone', value: '3125550100' },
    { kind: 'phone', value: '0013125550100' },
    { kind: 'phone', value: '+1 312 555 0100 ext 3' },
    { kind: 'phone', value: '+0 12345' },
    { kind: 'phone', value: '+1' },
    { kind: 'phone', value: '+1234567890123456' },
    { kind: 'phone', value: '+1-800-EXAMPLE' },
  ] satisfies Contact[])('rejects invalid $kind case %#', (contact) => {
    expect(() => normalizeContact(contact)).toThrow(InvalidContactError);
  });

  it.each([
    [
      { kind: 'email', value: ' Person@Example.ORG ' },
      { kind: 'email', value: 'person@example.org' },
    ],
    [
      { kind: 'phone', value: '+1 (312) 555-0100' },
      { kind: 'phone', value: '+13125550100' },
    ],
  ] satisfies [Contact, Contact][])(
    'matches equivalent normalized addresses case %#',
    async (first, second) => {
      const keys = await loadTestKeys();
      const index = createContactBlindIndex(keys, first);
      expect(index).toEqual(createContactBlindIndex(keys, second));
      expect(index.keyId).toBe('index-1');
      expect(Buffer.isBuffer(index.value)).toBe(true);
      expect(index.value).toHaveLength(32);
    },
  );

  it('keeps indexes stable when encryption keys and root material rotate', async () => {
    const contact: Contact = { kind: 'email', value: 'person@example.org' };
    const oldKeys = await loadTestKeys();
    const rotated = configuration();
    rotated.pii.current = 'v2';
    rotated.integration.current = 'v2';
    const newKeys = await loadTestKeys(rotated);
    expect(createContactBlindIndex(newKeys, contact)).toEqual(
      createContactBlindIndex(oldKeys, contact),
    );
    expect(
      createContactBlindIndex(newKeys, {
        ...contact,
        value: 'other@example.org',
      }).value,
    ).not.toEqual(createContactBlindIndex(newKeys, contact).value);
  });

  it('versions index rotation independently and can still address the old index key', async () => {
    const contact: Contact = { kind: 'phone', value: '+13125550100' };
    const oldKeys = await loadTestKeys();
    const rotated = configuration();
    rotated.blindIndex.current = 'index-2';
    const newKeys = await loadTestKeys(rotated);
    const oldIndex = createContactBlindIndex(oldKeys, contact);
    expect(createContactBlindIndex(newKeys, contact).keyId).toBe('index-2');
    expect(createContactBlindIndex(newKeys, contact).value).not.toEqual(
      oldIndex.value,
    );
    expect(
      createContactBlindIndex(newKeys, contact, 'same-root-new-index').value,
    ).not.toEqual(oldIndex.value);
    expect(createContactBlindIndex(newKeys, contact, 'index-1')).toEqual(
      oldIndex,
    );
    expect(() => createContactBlindIndex(newKeys, contact, 'missing')).toThrow(
      KeyConfigurationError,
    );
  });

  it('matches independent WebCrypto HKDF/HMAC for the documented index context', async () => {
    const encoder = new TextEncoder();
    const root = await webcrypto.subtle.importKey(
      'raw',
      rootOne,
      'HKDF',
      false,
      ['deriveKey'],
    );
    const hmacKey = await webcrypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(),
        info: encoder.encode(
          '["studio-encryption.v1","pii-index","index-1","deployment"]',
        ),
      },
      root,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    );
    const expected = await webcrypto.subtle.sign(
      'HMAC',
      hmacKey,
      encoder.encode('person@example.org'),
    );
    const keys = await loadTestKeys();
    expect(
      createContactBlindIndex(keys, {
        kind: 'email',
        value: 'Person@Example.ORG',
      }).value,
    ).toEqual(Buffer.from(expected));
  });
});
