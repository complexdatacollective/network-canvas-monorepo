import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  Logger,
  References,
} from 'effect';
import { describe, expect, test } from 'vitest';

import { seed } from '../../../scripts/seed/seed.ts';
import {
  dumpSchemaRows,
  ownerRows,
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import {
  testKeyring,
  testKeyringEntry,
} from '../../__tests__/support/secrets.ts';
import { type KeyringApi, parseKeyring } from '../keyring.ts';
import { rotateSecrets } from '../rotate.ts';
import { Keyring, SecretsCipher } from '../services.ts';

// The acceptance criterion of #1900, asked of the database rather than of the
// code that writes it: a dump of a seeded Studio contains no webhook signing
// secret, no protocol API key and no OAuth token.
//
// Written as a search over every row of every table — including the job
// queue's schema beside it — rather than over the columns the design named,
// because the failure worth catching is a secret somewhere nobody thought to
// look: copied into an audit event's payload, a queued job, a section
// document, a webhook delivery's body.

/** A tiny seed and a full dump of it; both run once for the whole file. */
const SEEDING_TIMEOUT_MS = 360_000;

/**
 * The base64 renderings of `bytes` at each of the three offsets it could sit
 * at inside a larger encoded blob.
 *
 * Base64 reads its input in three-byte groups, so a secret that starts one or
 * two bytes into what was encoded produces an entirely different string from
 * the one `Buffer.toString('base64')` gives — which is the normal case, since
 * a secret inside a JSON payload or a bytea column is never at offset zero.
 * Searching only the aligned form passed over exactly the leak this test is
 * for.
 *
 * Each rendering keeps only the characters that depend on the secret alone:
 * the leading characters that share a six-bit group with the padding bytes are
 * dropped (none, two and three of them), and so is any trailing partial group,
 * whose bits would be shared with whatever followed the secret in the real
 * blob. Hex needs none of this — it is two characters per byte, so it never
 * straddles a boundary.
 */
function base64Alignments(
  bytes: Buffer,
  encoding: 'base64' | 'base64url',
): { label: string; needle: string }[] {
  const LEADING_CHARS_TO_DROP = [0, 2, 3];
  return [0, 1, 2].map((offset) => {
    const encoded = Buffer.concat([Buffer.alloc(offset), bytes]).toString(
      encoding,
    );
    // Four characters per complete three-byte group; anything past them
    // encodes a group the secret only partly fills.
    const whole = Math.floor((offset + bytes.length) / 3) * 4;
    return {
      label: `${encoding}@${offset}`,
      needle: encoded.slice(LEADING_CHARS_TO_DROP[offset]!, whole),
    };
  });
}

/**
 * Every rendering of a secret a dump could plausibly hold. A value written
 * straight into a column appears as itself; one that travelled through a JSON
 * payload, a bytea column or an encoded envelope appears as one of the
 * others. Searching only for the plaintext would pass over a secret that had
 * been base64'd on the way into a job payload.
 */
function encodings(secret: string): { label: string; needle: string }[] {
  const bytes = Buffer.from(secret, 'utf8');
  return [
    { label: 'plaintext', needle: secret },
    ...base64Alignments(bytes, 'base64'),
    ...base64Alignments(bytes, 'base64url'),
    { label: 'hex', needle: bytes.toString('hex') },
  ];
}

/** Every needle of every secret that `haystacks` holds, never the secret. */
function leaksIn(
  haystacks: readonly string[],
  secrets: readonly string[],
): string[] {
  const found: string[] = [];
  for (const secret of secrets) {
    for (const { label, needle } of encodings(secret)) {
      if (haystacks.some((haystack) => haystack.includes(needle))) {
        found.push(`${label}:${needle.length}`);
      }
    }
  }
  return found;
}

/**
 * Every log line an effect writes, as the process's own logger renders it
 * (`Logger.consoleJson`, src/platform/logger.ts), at every level including the
 * ones production filters out.
 */
const recordingLogs =
  (lines: string[]) =>
  <A, E, R>(body: Effect.Effect<A, E, R>) =>
    body.pipe(
      Effect.provide(
        Logger.layer([
          Logger.map(Logger.formatJson, (line) => {
            lines.push(line);
          }),
        ]),
      ),
      Effect.provideService(References.MinimumLogLevel, 'All'),
    );

const underKeyring = <A, E, R>(
  keyring: KeyringApi,
  body: Effect.Effect<A, E, R>,
) =>
  Effect.provide(
    body,
    SecretsCipher.layer.pipe(
      Layer.provideMerge(Layer.succeed(Keyring, keyring)),
    ),
  );

describe('the needles the dump is searched for', () => {
  // The helper's own oracle, and the reason the search below can fail: a
  // needle that did not actually appear in an encoded blob would make every
  // assertion in this file vacuous, and would fail silently rather than loudly.
  const secret = 'whsec_2f1c9d0b8a7e6f5d4c3b2a190807f6e5';

  test('finds the secret wherever it sits inside an encoded blob', () => {
    for (const encoding of ['base64', 'base64url'] as const) {
      for (const offset of [0, 1, 2, 3, 4, 5]) {
        const blob = Buffer.concat([
          Buffer.from('x'.repeat(offset)),
          Buffer.from(secret),
          Buffer.from('trailing bytes'),
        ]).toString(encoding);
        const needles = base64Alignments(Buffer.from(secret), encoding);
        expect(
          needles.some(({ needle }) => blob.includes(needle)),
          `${encoding} at offset ${offset}`,
        ).toBe(true);
      }
    }
  });

  test('keeps every needle long enough to mean something', () => {
    for (const { label, needle } of encodings(secret)) {
      expect(needle.length, label).toBeGreaterThan(16);
    }
  });
});

class SeededDump extends Context.Service<
  SeededDump,
  {
    readonly plaintextSecrets: readonly string[];
    /** Every row of both schemas, as one string. */
    readonly dump: string;
    readonly participantEmail: string;
  }
>()('@studio/test/no-plaintext-at-rest/SeededDump') {}

const SeededDumpLive = Layer.effect(
  SeededDump,
  Effect.gen(function* () {
    const { plaintextSecrets } = yield* seed({
      secrets: testKeyring(),
      scale: 'tiny',
    });

    const harness = yield* TestDatabase;
    const studio = yield* dumpSchemaRows();
    const jobs = yield* dumpSchemaRows({ schema: harness.jobSchema });
    const dump = [...studio.values(), ...jobs.values()]
      .map((rows) => rows.join('\n'))
      .join('\n');

    const participant = yield* ownerRows<{ email: string }>(
      `select email from participants where email is not null order by email limit 1`,
    );
    return {
      plaintextSecrets,
      dump,
      participantEmail: participant[0]?.email ?? '',
    };
  }).pipe(Effect.orDie),
).pipe(Layer.provideMerge(TestDatabaseLive));

describe.skipIf(!testDb)('a seeded database at rest', () => {
  layer(SeededDumpLive, { timeout: SEEDING_TIMEOUT_MS })((it) => {
    it.effect(
      'dumps something to search, and every secret the seed wrote',
      () =>
        Effect.gen(function* () {
          const { dump, plaintextSecrets } = yield* SeededDump;
          expect(dump.length).toBeGreaterThan(100_000);
          // All three kinds, or the search below would pass while one of them was
          // not written at all: webhook secrets, the admin's three OAuth tokens,
          // and one API key per seeded team.
          const prefixes = ['whsec_', 'sk.seed-', 'ya29.', '1//', 'eyJ'];
          expect(
            prefixes.filter(
              (prefix) =>
                !plaintextSecrets.some((secret) => secret.startsWith(prefix)),
            ),
          ).toEqual([]);
        }),
    );

    it.effect('holds a participant email in the clear', () =>
      Effect.gen(function* () {
        const { dump, participantEmail } = yield* SeededDump;
        // The positive control, and the reason the assertion below can fail: the
        // same search, over the same dump, finds a value that IS stored plainly.
        // Without it, a dump that came back empty — a broken query, a schema name
        // typo — would read as a clean result. It is also the ruling of
        // 2026-09-14 stated as a test: contact details are not encrypted.
        expect(participantEmail).toMatch(/@/);
        expect(dump).toContain(participantEmail);
      }),
    );

    it.effect('holds no secret in any encoding', () =>
      Effect.gen(function* () {
        const { dump, plaintextSecrets } = yield* SeededDump;
        const found: string[] = [];
        for (const secret of plaintextSecrets) {
          for (const { label, needle } of encodings(secret)) {
            // The needle, never the secret, in the failure message.
            if (dump.includes(needle)) found.push(`${label}:${needle.length}`);
          }
        }
        expect(found).toEqual([]);
      }),
    );

    // The other half of the property: what the rotation says while it works
    // and when it refuses. It opens every stored secret, so it is the one
    // program that could put one in a log line or an error message. Last in
    // the file, because it rewrites the rows the dump above was read from.
    it.effect(
      'rotates it without a secret reaching a log line or an error message',
      () =>
        Effect.gen(function* () {
          const { plaintextSecrets } = yield* SeededDump;
          const lines: string[] = [];
          const recorded = recordingLogs(lines);
          const failures: string[] = [];
          const rotateUnder = Effect.fnUntraced(function* (
            keyring: KeyringApi,
          ) {
            const exit = yield* Effect.exit(
              recorded(underKeyring(keyring, rotateSecrets({ batchSize: 2 }))),
            );
            // Everything a refusal publishes: the runtime's rendering of the
            // cause, which carries the message and the stack.
            if (Exit.isFailure(exit)) failures.push(Cause.pretty(exit.cause));
            return exit;
          });

          // Refused before anything is written: ids the keyring does not
          // carry, then the right id under the wrong material.
          yield* rotateUnder(testKeyring(['test-9']));
          yield* rotateUnder(
            parseKeyring(
              `test-1:${testKeyringEntry('test-impostor').split(':')[1]!}`,
            ),
          );

          // Refused mid-run: a token written around the auth adapter, which
          // the rotation will not seal on the way past.
          const planted = `1//planted-${randomUUID()}`;
          const plantedId = randomUUID();
          const [user] = yield* ownerRows<{ id: string }>(
            'select id from "user" order by id limit 1',
          );
          yield* ownerRows(
            `insert into account (id, "accountId", "providerId", "userId", "refreshToken", "updatedAt")
             values ($1, $2, 'google', $3, $4, now())`,
            [plantedId, `sub-${plantedId}`, user!.id, planted],
          );
          const ROTATED = testKeyring(['test-3', 'test-1', 'test-2']);
          yield* rotateUnder(ROTATED);
          yield* ownerRows('delete from account where id = $1', [plantedId]);

          // And the rotation itself, to completion.
          expect(Exit.isSuccess(yield* rotateUnder(ROTATED))).toBe(true);

          // The controls: the recorder saw the progress lines, and each of the
          // three refusals is here in its own words.
          expect(
            lines.filter((line) => line.includes('re-sealed under test-3')),
          ).not.toEqual([]);
          expect(failures).toHaveLength(3);
          expect(failures[0]).toMatch(/cannot produce: test-1/);
          expect(failures[1]).toMatch(/Key id "test-1" in the keyring/);
          expect(failures[2]).toMatch(
            new RegExp(
              `account ${plantedId} refreshToken could not be re-sealed`,
            ),
          );

          expect(
            leaksIn([...lines, ...failures], [...plaintextSecrets, planted]),
          ).toEqual([]);

          // The search's own control: a secret that does reach a debug line
          // through the same recorder is found.
          const leaked: string[] = [];
          yield* recordingLogs(leaked)(Effect.logDebug(plaintextSecrets[0]));
          expect(leaksIn(leaked, plaintextSecrets)).not.toEqual([]);
        }).pipe(Effect.orDie),
    );
  });
});
