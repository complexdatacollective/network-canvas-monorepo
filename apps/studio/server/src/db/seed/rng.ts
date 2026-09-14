// Deterministic primitives for the synthetic-data seed.
//
// Every value the seed writes has to come from the pinned faker PRNG or from
// the fixed anchor below, because `seed.test.ts` seeds two scratch schemas and
// compares full ordered dumps. That rules out `node:crypto`'s randomUUID and
// randomBytes, and it rules out letting Postgres fill a `defaultNow()` column:
// two runs a millisecond apart would disagree. Hashing is still `node:crypto`
// — a digest of deterministic input is deterministic.
import { createHash, createHmac } from 'node:crypto';

import { faker } from '@faker-js/faker';

/**
 * Every seeded timestamp is this instant plus a faker-drawn offset. A fixed
 * anchor rather than `Date.now()`: a dump taken today and a dump taken
 * tomorrow must be byte-identical.
 */
const SEED_ANCHOR_MS = Date.UTC(2026, 8, 1, 9, 0, 0);

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** The anchor shifted by whole days and minutes; negative values are earlier. */
export function seedTime(days: number, minutes = 0): Date {
  return new Date(SEED_ANCHOR_MS + days * DAY_MS + minutes * MINUTE_MS);
}

export function shiftMinutes(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * MINUTE_MS);
}

export function shiftDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/** An id from the seeded PRNG. Never `randomUUID()`: that ignores the seed. */
export function seedUuid(): string {
  return faker.string.uuid();
}

/** Lowercase hex of `bytes` bytes, drawn from the seeded PRNG. */
export function seedHex(bytes: number): string {
  return faker.string.fromCharacters('0123456789abcdef', bytes * 2);
}

export function seedBytes(bytes: number): Buffer {
  return Buffer.from(seedHex(bytes), 'hex');
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function sha256Bytes(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

export function base64url(input: Buffer): string {
  return input.toString('base64url');
}

/**
 * A placeholder keying for the contact blind indexes, so seeded opt-outs
 * actually suppress seeded deliveries. The production foundation is in
 * pii/contacts.ts; this deliberately remains synthetic hex until #1258's
 * bytea schema/seed migration converts every caller. It is published here
 * deliberately — a development-only key that protects nothing must not look
 * like a secret.
 */
const SEED_BLIND_INDEX_KEY = 'studio-development-blind-index-key';

/** Synthetic seed HMAC; never use this key or representation in production. */
export function contactBlindIndex(address: string): string {
  return createHmac('sha256', SEED_BLIND_INDEX_KEY)
    .update(address.trim().toLowerCase())
    .digest('hex');
}

/** Draws `count` distinct members of `items`, or all of them if fewer. */
export function pickSome<T>(items: readonly T[], count: number): T[] {
  return faker.helpers.arrayElements(items, Math.min(count, items.length));
}
