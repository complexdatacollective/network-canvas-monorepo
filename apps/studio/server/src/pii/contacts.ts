import { createHmac } from 'node:crypto';

import { z } from 'zod';

import type { EncryptionKeys } from './keys.ts';

export type Contact =
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string };

export class InvalidContactError extends Error {
  constructor() {
    super('The contact address is invalid.');
    this.name = 'InvalidContactError';
  }
}

export function normalizeContact(contact: Contact): string {
  if (contact.kind === 'email') {
    const value = contact.value.trim().toLowerCase();
    if (!z.email().max(320).safeParse(value).success) {
      throw new InvalidContactError();
    }
    return value;
  }

  // No country inference: the calling product must collect an international
  // number. Formatting punctuation is allowed; national prefixes, extensions,
  // letters, and guesses about a participant's region are not.
  const value = contact.value.trim().replaceAll(/[\s().-]/g, '');
  if (!/^\+[1-9][0-9]{1,14}$/.test(value)) throw new InvalidContactError();
  return value;
}

/** Deployment-scoped and untruncated; no team or encryption-key selector. */
export function createContactBlindIndex(
  keys: EncryptionKeys,
  contact: Contact,
  id = keys.currentId('pii-index'),
): { keyId: string; value: Buffer } {
  const key = keys.derive('pii-index', id, ['deployment']);
  return {
    keyId: id,
    value: createHmac('sha256', key).update(normalizeContact(contact)).digest(),
  };
}
