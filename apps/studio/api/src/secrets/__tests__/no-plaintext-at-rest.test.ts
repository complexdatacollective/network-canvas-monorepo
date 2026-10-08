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

const SEEDING_TIMEOUT_MS = 360_000;

/**
 * Base64 of `bytes` at each of the three offsets it could sit at inside a
 * larger blob, keeping only the characters that depend on the secret alone.
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
    const whole = Math.floor((offset + bytes.length) / 3) * 4;
    return {
      label: `${encoding}@${offset}`,
      needle: encoded.slice(LEADING_CHARS_TO_DROP[offset]!, whole),
    };
  });
}

function encodings(secret: string): { label: string; needle: string }[] {
  const bytes = Buffer.from(secret, 'utf8');
  return [
    { label: 'plaintext', needle: secret },
    ...base64Alignments(bytes, 'base64'),
    ...base64Alignments(bytes, 'base64url'),
    { label: 'hex', needle: bytes.toString('hex') },
  ];
}

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
          const prefixes = [
            'whsec_',
            'sk.seed-',
            'sk.staged-',
            'ya29.',
            '1//',
            'eyJ',
          ];
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
            if (dump.includes(needle)) found.push(`${label}:${needle.length}`);
          }
        }
        expect(found).toEqual([]);
      }),
    );

    // Last in the file, because it rewrites the rows the dump above was read
    // from.
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
            if (Exit.isFailure(exit)) failures.push(Cause.pretty(exit.cause));
            return exit;
          });

          yield* rotateUnder(testKeyring(['test-9']));
          yield* rotateUnder(
            parseKeyring(
              `test-1:${testKeyringEntry('test-impostor').split(':')[1]!}`,
            ),
          );

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

          expect(Exit.isSuccess(yield* rotateUnder(ROTATED))).toBe(true);

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

          const leaked: string[] = [];
          yield* recordingLogs(leaked)(Effect.logDebug(plaintextSecrets[0]));
          expect(leaksIn(leaked, plaintextSecrets)).not.toEqual([]);
        }).pipe(Effect.orDie),
    );
  });
});
