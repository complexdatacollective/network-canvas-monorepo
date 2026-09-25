// The secret-store registry against real rows (#1900).
//
// Every property these stores have is a property of their statements, so all
// of it is measured against a real server: that "not under the current key"
// means the same thing to the count and to the batch, that a held row is
// stepped over rather than waited on, that a key id nothing could hold is
// reported rather than dropped, and that a sealed value moved to another row
// stops opening.
//
// Every statement runs in a MAINTENANCE scope, which stamps no team: the
// tenant tables force row-level security, so any other role would see one
// team's rows and a check that passed would mean nothing.
import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { describe, expect } from 'vitest';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { testKeyring } from '../../__tests__/support/secrets.ts';
import { AUTH_TABLES } from '../../db/auth-schema.ts';
import { sqlErrorsOnly } from '../../db/errors.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';
import { WEBHOOK_TABLES } from '../../webhook/schema.ts';
import { createSecretsCipher } from '../cipher.ts';
import {
  notUnderCurrentKeySql,
  SECRET_STORES,
  type SecretStore,
} from '../stores.ts';

const { account } = AUTH_TABLES;
const { webhookSubscriptions } = WEBHOOK_TABLES;

const TEAM = 'team-secret-stores';
const USER = 'user-secret-stores';
const PROTOCOL = '9b3d7c22-1f40-4e6a-8b95-2c7d0e1a3f64';

/** `test-2` current: what the fixtures below are written under. */
const BEFORE = createSecretsCipher(testKeyring(['test-2', 'test-1']));
/** `test-1` current: the keyring a rotation deploys. */
const AFTER = createSecretsCipher(testKeyring(['test-1', 'test-2']));

const storeNamed = (name: string): SecretStore => {
  const store = SECRET_STORES.find((candidate) => candidate.name === name);
  if (!store) throw new Error(`no secret store named ${name}`);
  return store;
};

const webhookStore = storeNamed('webhook_subscriptions');
const accountStore = storeNamed('account');
const assetKeyStore = storeNamed('protocol_asset_keys');

/**
 * The team, the user and the protocol line the fixtures hang off, and an empty
 * slate in all three stores. Every case starts from this: the stores are
 * database-wide, so a row left behind by one case is a row the next one counts.
 */
const reset = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  yield* harness.onOwner(
    Effect.gen(function* () {
      const { sql } = harness.owner;
      yield* sql`delete from webhook_subscriptions`;
      yield* sql`delete from account`;
      yield* sql`delete from protocol_asset_keys`;
      yield* sql`insert into teams (id, name, slug)
                 values (${TEAM}, ${TEAM}, ${TEAM})
                 on conflict (id) do nothing`;
      yield* sql`insert into "user" (id, name, email, "emailVerified")
                 values (${USER}, 'Stores', 'stores@example.test', true)
                 on conflict (id) do nothing`;
      // `protocol_asset_keys` rows are pinned to a protocol by a composite
      // foreign key, so the line has to exist before any key is stored on it.
      yield* sql`insert into protocols (id, team_id, name)
                 values (${PROTOCOL}, ${TEAM}, 'Stores protocol')
                 on conflict (id) do nothing`;
    }),
  );
});

/** A subscription sealed by `cipher`, returning its id and its plaintext. */
const newSubscription = Effect.fnUntraced(function* (
  cipher = BEFORE,
  keyIdOverride?: string,
) {
  const harness = yield* TestDatabase;
  const id = randomUUID();
  const secret = `whsec_${randomUUID().replaceAll('-', '')}`;
  const sealed = cipher.sealWebhookSecret(
    { teamId: TEAM, subscriptionId: id },
    secret,
  );
  yield* harness.onOwner(
    harness.owner
      .sql`insert into webhook_subscriptions (id, team_id, url, event_types,
                                              secret_ciphertext, secret_key_id,
                                              created_by_user_id)
           values (${id}, ${TEAM}, 'https://hooks.example.org/studio',
                   ${['interview.completed']}, ${sealed.ciphertext},
                   ${keyIdOverride ?? sealed.keyId}, ${USER})`,
  );
  return { id, secret };
});

/**
 * One `account` row. `tokens` is what to store in each column BEFORE sealing:
 * a value given as `{ plaintext: … }` is written as-is, which is the write
 * that bypassed the auth adapter.
 */
const newAccount = Effect.fnUntraced(function* (
  cipher = BEFORE,
  tokens: Partial<
    Record<
      'accessToken' | 'refreshToken' | 'idToken',
      string | { plaintext: string }
    >
  > = {
    accessToken: 'ya29.access',
    refreshToken: '1//refresh',
    idToken: 'eyJ.id',
  },
) {
  const harness = yield* TestDatabase;
  const id = randomUUID();
  const accountId = `sub-${randomUUID()}`;
  const stored = (column: 'accessToken' | 'refreshToken' | 'idToken') => {
    const value = tokens[column];
    if (value === undefined) return null;
    if (typeof value !== 'string') return value.plaintext;
    return cipher.sealOAuthToken(
      { providerId: 'google', accountId, column },
      value,
    );
  };
  yield* harness.onOwner(
    harness.owner
      .sql`insert into account (id, "accountId", "providerId", "userId",
                                "accessToken", "refreshToken", "idToken", "updatedAt")
           values (${id}, ${accountId}, 'google', ${USER},
                   ${stored('accessToken')}, ${stored('refreshToken')},
                   ${stored('idToken')}, now())`,
  );
  return { id, accountId, tokens };
});

/** One sealed API key for `PROTOCOL`. */
const newAssetKey = Effect.fnUntraced(function* (
  cipher = BEFORE,
  keyIdOverride?: string,
) {
  const harness = yield* TestDatabase;
  const assetId = `asset-${randomUUID()}`;
  const value = `pk.${randomUUID().replaceAll('-', '')}`;
  const sealed = cipher.sealAssetKey(
    { teamId: TEAM, protocolId: PROTOCOL, assetId },
    value,
  );
  yield* harness.onOwner(
    harness.owner
      .sql`insert into protocol_asset_keys (team_id, protocol_id, asset_id,
                                            ciphertext, key_id)
           values (${TEAM}, ${PROTOCOL}, ${assetId}, ${sealed.ciphertext},
                   ${keyIdOverride ?? sealed.keyId})`,
  );
  return { assetId, value };
});

describe.skipIf(!testDb)('the secret stores', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'on a scratch schema, as the maintenance role',
    (it) => {
      // The shared-fragment case. `notUnderCurrentKeySql` is written once and
      // embedded by `remaining` and by `rotateBatch`, and the two must answer
      // about the same rows. Three boundary rows at once: one already current
      // (neither may take it), one under an older key (both must), and one
      // whose only token is PLAINTEXT — which carries no prefix at all, used
      // to match nothing, and was walked past while rotation reported success.
      it.effect(
        'makes the account count and the account batch agree on a boundary row',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* newAccount(AFTER, { accessToken: 'ya29.current' });
            yield* newAccount(BEFORE, { accessToken: 'ya29.behind' });
            const plaintext = yield* newAccount(BEFORE, {
              refreshToken: { plaintext: '1//written-around-the-adapter' },
            });

            // The count says two rows are behind: the older key and the
            // plaintext one.
            const behind = yield* MaintenanceScope.open(
              accountStore.remaining(AFTER.currentKeyId),
            );
            expect(behind).toBe(2);
            expect(typeof behind).toBe('number');

            // And the batch takes exactly those two — proved by which row it
            // chokes on: the plaintext token reaches `reseal`, which refuses
            // it rather than sealing it on the way past.
            //
            // A DEFECT rather than a failure, deliberately: a stored value
            // that will not open under the key it names is not an outcome a
            // caller can do anything with (src/secrets/cipher.ts), so it
            // escapes `Effect.result` and has to be caught as an exit.
            const exit = yield* Effect.exit(
              MaintenanceScope.open(accountStore.rotateBatch(AFTER, 10)),
            );
            expect(Exit.isFailure(exit)).toBe(true);
            expect(
              Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : '',
            ).toContain(
              `account ${plaintext.id} refreshToken could not be re-sealed`,
            );
          }).pipe(Effect.orDie),
      );

      // Why every span in `stores.ts` carries `sqlErrorsOnly`. The drizzle
      // builder catches a statement's failure and re-raises it with the query
      // text and the bind parameters in its OWN message — and the bind
      // parameters here are sealed ciphertext. The positive control is the
      // point: the unwrapped failure IS asked to carry the bytes, so a day
      // when it stops would fail this case rather than quietly make the second
      // assertion vacuous.
      it.effect('keeps a bound ciphertext out of the published failure', () =>
        Effect.gen(function* () {
          yield* reset();
          // 600 bytes: over `webhook_subscriptions_lengths_check`'s 512-byte
          // ceiling, so the row is refused with the bytes already bound. The
          // payload is printable because the wrapper prints a bound `bytea`
          // as the bytes themselves rather than as hex — which is precisely
          // how a real ciphertext would come out.
          const marker = 'THE-SEALED-BYTES';
          const ciphertext = Buffer.from(`${marker}-`.repeat(40), 'utf8');
          const insert = Effect.flatMap(Transaction, ({ tx }) =>
            tx.insert(webhookSubscriptions).values({
              id: randomUUID(),
              teamId: TEAM,
              url: 'https://hooks.example.org/studio',
              eventTypes: ['interview.completed'],
              secretCiphertext: ciphertext,
              secretKeyId: 'test-1',
              createdByUserId: USER,
            }),
          );
          const messageOf = (exit: Exit.Exit<unknown, unknown>) =>
            Exit.isFailure(exit)
              ? String(Cause.squash(exit.cause))
              : 'no failure';

          const bare = messageOf(
            yield* Effect.exit(MaintenanceScope.open(insert)),
          );
          const published = messageOf(
            yield* Effect.exit(
              MaintenanceScope.open(insert.pipe(sqlErrorsOnly)),
            ),
          );

          // Both are the same refusal…
          expect(bare).not.toBe('no failure');
          expect(published).not.toBe('no failure');
          // …and only one of them prints what was bound.
          expect(bare).toContain(marker);
          expect(published).not.toContain(marker);
        }).pipe(Effect.orDie),
      );

      // The fragment itself, run against the same rows: what `remaining`
      // reports is what the predicate selects, rather than a number that
      // happens to agree with it today.
      it.effect('counts exactly the rows its own predicate selects', () =>
        Effect.gen(function* () {
          yield* reset();
          yield* newAccount(AFTER, { accessToken: 'ya29.current' });
          yield* newAccount(BEFORE, { accessToken: 'ya29.behind' });
          yield* newAccount(BEFORE, {
            refreshToken: { plaintext: '1//written-around-the-adapter' },
          });

          const answers = yield* MaintenanceScope.open(
            Effect.gen(function* () {
              const { tx } = yield* Transaction;
              const rows = yield* tx
                .select({ id: account.id })
                .from(account)
                .where(notUnderCurrentKeySql(AFTER.currentKeyId));
              const counted = yield* accountStore.remaining(AFTER.currentKeyId);
              return { selected: rows.length, counted };
            }),
          );
          expect(answers).toEqual({ selected: 2, counted: 2 });
        }).pipe(Effect.orDie),
      );

      it.effect('leaves a row already under the current key alone', () =>
        Effect.gen(function* () {
          yield* reset();
          yield* newAccount(AFTER, { accessToken: 'ya29.current' });
          expect(
            yield* MaintenanceScope.open(
              accountStore.remaining(AFTER.currentKeyId),
            ),
          ).toBe(0);
          expect(
            yield* MaintenanceScope.open(accountStore.rotateBatch(AFTER, 10)),
          ).toBe(0);
        }).pipe(Effect.orDie),
      );

      it.effect('re-seals a webhook secret and leaves updated_at alone', () =>
        Effect.gen(function* () {
          yield* reset();
          const subscription = yield* newSubscription();
          const harness = yield* TestDatabase;
          const before = yield* harness.onOwner(
            harness.owner.sql<{
              updated_at: number;
            }>`select updated_at from webhook_subscriptions where id = ${subscription.id}`,
          );

          expect(
            yield* MaintenanceScope.open(webhookStore.rotateBatch(AFTER, 10)),
          ).toBe(1);
          // The store's own postcondition, counted rather than inferred from
          // the batch returning a number.
          expect(
            yield* MaintenanceScope.open(
              webhookStore.remaining(AFTER.currentKeyId),
            ),
          ).toBe(0);

          const after = yield* harness.onOwner(
            harness.owner.sql<{
              secret_key_id: string;
              updated_at: number;
            }>`select secret_key_id, updated_at from webhook_subscriptions
               where id = ${subscription.id}`,
          );
          expect(after[0]?.secret_key_id).toBe('test-1');
          // Rotation changes how a row is stored, not when anyone last changed
          // it. `updated_at` comes back from a RAW statement, so it is epoch
          // milliseconds rather than a Date on rc.115 — pinned here, because
          // the comparison below only means "unchanged" while it is a
          // primitive (two equal Dates are two objects and would never be
          // `toBe`-equal, so a change of shape would read as a failure).
          expect(typeof after[0]?.updated_at).toBe('number');
          expect(after[0]?.updated_at).toBe(before[0]?.updated_at);

          // The plaintext survived the re-seal: the row now opens under the
          // new keyring and says the same thing.
          const opener = yield* MaintenanceScope.open(
            webhookStore.probe('test-1'),
          );
          expect(opener).not.toBeNull();
          expect(opener?.(AFTER)).toBe(subscription.secret);
        }).pipe(Effect.orDie),
      );

      // `FOR UPDATE SKIP LOCKED` is what keeps a second runner — or a request
      // writing the same row — from waiting on this one. The lock is taken on
      // the connecting login's own connection, which is a different client
      // from the maintenance one, so the batch below really is another session.
      it.effect('steps over a row another session holds', () =>
        Effect.gen(function* () {
          yield* reset();
          const held = yield* newSubscription();
          yield* newSubscription();
          const harness = yield* TestDatabase;

          const taken = yield* harness.onOwner(
            Effect.gen(function* () {
              yield* harness.owner.sql`select id from webhook_subscriptions
                                       where id = ${held.id} for update`;
              return yield* MaintenanceScope.open(
                webhookStore.rotateBatch(AFTER, 10),
              );
            }),
          );
          // One of the two, not both and not a wait.
          expect(taken).toBe(1);
          // And the held row is still behind, which is why a batch returning
          // zero is not proof that a store is finished.
          expect(
            yield* MaintenanceScope.open(
              webhookStore.remaining(AFTER.currentKeyId),
            ),
          ).toBe(1);
        }).pipe(Effect.orDie),
      );

      it.effect('reports every stored key id, malformed ones included', () =>
        Effect.gen(function* () {
          yield* reset();
          yield* newSubscription();
          yield* newSubscription(BEFORE, 'not-a-keyring-id');
          // Two rows under one bad id are one id in use, not two.
          yield* newAssetKey(BEFORE, 'asset-gone');
          yield* newAssetKey(BEFORE, 'asset-gone');
          const harness = yield* TestDatabase;
          // `split_part` answers '' for a value with nothing between the two
          // colons — an id no keyring could hold, which is exactly what the
          // boot check has to count rather than drop.
          yield* harness.onOwner(
            harness.owner
              .sql`insert into account (id, "accountId", "providerId", "userId",
                                        "accessToken", "updatedAt")
                   values (${randomUUID()}, ${`sub-${randomUUID()}`}, 'google',
                           ${USER}, 'studio-secret::whatever', now())`,
          );

          const ids = yield* MaintenanceScope.open(
            Effect.all({
              webhook: webhookStore.keyIdsInUse,
              account: accountStore.keyIdsInUse,
              assetKeys: assetKeyStore.keyIdsInUse,
            }),
          );
          expect(ids.webhook.toSorted()).toEqual([
            'not-a-keyring-id',
            'test-2',
          ]);
          expect(ids.assetKeys).toEqual(['asset-gone']);
          expect(ids.account).toEqual(['']);
        }).pipe(Effect.orDie),
      );

      it.effect('opens a probed row, and only in the row it belongs to', () =>
        Effect.gen(function* () {
          yield* reset();
          const key = yield* newAssetKey();
          const opener = yield* MaintenanceScope.open(
            assetKeyStore.probe('test-2'),
          );
          expect(opener).not.toBeNull();
          expect(opener?.(BEFORE)).toBe(key.value);

          // The identity is bound into the ciphertext, so the same bytes under
          // another asset id do not open: this is what makes "no plaintext at
          // rest" survive a row being copied.
          const harness = yield* TestDatabase;
          yield* harness.onOwner(
            harness.owner
              .sql`update protocol_asset_keys set asset_id = ${`${key.assetId}-moved`}
                   where team_id = ${TEAM} and protocol_id = ${PROTOCOL}
                     and asset_id = ${key.assetId}`,
          );
          const moved = yield* MaintenanceScope.open(
            assetKeyStore.probe('test-2'),
          );
          expect(moved).not.toBeNull();
          expect(() => moved?.(BEFORE)).toThrow();
        }).pipe(Effect.orDie),
      );

      // The boot gate's only read of `account`, and the reason the probe is a
      // union over all three token columns rather than over `accessToken`: a
      // deployment whose only sealed token happens to be an id token must
      // still be checked against the keyring.
      it.effect('probes a token in whichever column holds it', () =>
        Effect.gen(function* () {
          for (const column of [
            'accessToken',
            'refreshToken',
            'idToken',
          ] as const) {
            yield* reset();
            const row = yield* newAccount(BEFORE, {
              [column]: `only.${column}`,
            });
            const opener = yield* MaintenanceScope.open(
              accountStore.probe('test-2'),
            );
            expect(opener, column).not.toBeNull();
            expect(opener?.(BEFORE), column).toBe(`only.${column}`);
            // And the identity really is per column: the same stored value
            // read as another column does not open.
            expect(() =>
              BEFORE.openOAuthToken(
                {
                  providerId: 'google',
                  accountId: row.accountId,
                  column: column === 'idToken' ? 'accessToken' : 'idToken',
                },
                opener === null ? '' : `only.${column}`,
              ),
            ).toThrow();
          }
        }).pipe(Effect.orDie),
      );

      it.effect('has nothing to probe when no row names the key', () =>
        Effect.gen(function* () {
          yield* reset();
          const answers = yield* MaintenanceScope.open(
            Effect.all({
              webhook: webhookStore.probe('test-1'),
              account: accountStore.probe('test-1'),
              assetKeys: assetKeyStore.probe('test-1'),
            }),
          );
          expect(answers).toEqual({
            webhook: null,
            account: null,
            assetKeys: null,
          });
        }).pipe(Effect.orDie),
      );

      it.effect('re-seals an asset key and leaves updated_at alone', () =>
        Effect.gen(function* () {
          yield* reset();
          const key = yield* newAssetKey();
          const harness = yield* TestDatabase;
          const readRow = harness.onOwner(
            harness.owner.sql<{
              asset_id: string;
              key_id: string;
              updated_at: number;
            }>`select asset_id, key_id, updated_at from protocol_asset_keys
               order by asset_id`,
          );
          const before = yield* readRow;

          expect(
            yield* MaintenanceScope.open(assetKeyStore.rotateBatch(AFTER, 10)),
          ).toBe(1);
          expect(
            yield* MaintenanceScope.open(
              assetKeyStore.remaining(AFTER.currentKeyId),
            ),
          ).toBe(0);

          const after = yield* readRow;
          // The identity is the whole primary key here, so the row that moved
          // key is the row that was named — and it is still the same asset.
          expect(after[0]?.asset_id).toBe(key.assetId);
          expect(after[0]?.key_id).toBe('test-1');
          // `updated_at` comes back from a RAW statement: epoch milliseconds
          // rather than a Date on rc.115, pinned for the same reason as in the
          // webhook case.
          expect(typeof after[0]?.updated_at).toBe('number');
          expect(after[0]?.updated_at).toBe(before[0]?.updated_at);

          const opener = yield* MaintenanceScope.open(
            assetKeyStore.probe('test-1'),
          );
          expect(opener?.(AFTER)).toBe(key.value);
        }).pipe(Effect.orDie),
      );

      it.effect('takes no more than the batch size, and resumes', () =>
        Effect.gen(function* () {
          yield* reset();
          for (let index = 0; index < 3; index += 1) yield* newSubscription();

          expect(
            yield* MaintenanceScope.open(webhookStore.rotateBatch(AFTER, 1)),
          ).toBe(1);
          expect(
            yield* MaintenanceScope.open(
              webhookStore.remaining(AFTER.currentKeyId),
            ),
          ).toBe(2);
          expect(
            yield* MaintenanceScope.open(webhookStore.rotateBatch(AFTER, 10)),
          ).toBe(2);
          expect(
            yield* MaintenanceScope.open(
              webhookStore.remaining(AFTER.currentKeyId),
            ),
          ).toBe(0);
        }).pipe(Effect.orDie),
      );

      it.effect(
        're-seals every token a row has and leaves the others null',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const row = yield* newAccount(BEFORE, { accessToken: 'ya29.only' });
            expect(
              yield* MaintenanceScope.open(accountStore.rotateBatch(AFTER, 10)),
            ).toBe(1);

            const harness = yield* TestDatabase;
            const stored = yield* harness.onOwner(
              harness.owner.sql<{
                accessToken: string | null;
                refreshToken: string | null;
                idToken: string | null;
              }>`select "accessToken", "refreshToken", "idToken" from account
               where id = ${row.id}`,
            );
            expect(stored[0]?.refreshToken).toBeNull();
            expect(stored[0]?.idToken).toBeNull();
            expect(
              stored[0]?.accessToken?.startsWith('studio-secret:test-1:'),
            ).toBe(true);
            expect(
              AFTER.openOAuthToken(
                {
                  providerId: 'google',
                  accountId: row.accountId,
                  column: 'accessToken',
                },
                stored[0]?.accessToken ?? '',
              ),
            ).toBe('ya29.only');
          }).pipe(Effect.orDie),
      );
    },
  );
});
