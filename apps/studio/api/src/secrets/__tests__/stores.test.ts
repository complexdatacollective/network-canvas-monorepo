import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Cause, Effect, Exit, Option, Redacted } from 'effect';
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
import { createSecretsCipher, type SecretsCipherApi } from '../cipher.ts';
import { SecretsCipher } from '../services.ts';
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
const DRAFT = '4f0c2a6e-8d31-4b57-9e02-7a1c5d9b3e48';
const OWNER = `${USER}:tab-1`;

const BEFORE = createSecretsCipher(testKeyring(['test-2', 'test-1']));
const AFTER = createSecretsCipher(testKeyring(['test-1', 'test-2']));

const storeNamed = (name: string): SecretStore => {
  const store = SECRET_STORES.find((candidate) => candidate.name === name);
  if (!store) throw new Error(`no secret store named ${name}`);
  return store;
};

const rotateBatchWith = (
  cipher: SecretsCipherApi,
  store: SecretStore,
  batchSize: number,
) => Effect.provideService(store.rotateBatch(batchSize), SecretsCipher, cipher);

const probeOf = (store: SecretStore, keyId: string) =>
  Effect.map(store.probe(keyId), Option.getOrNull);

const webhookStore = storeNamed('webhook_subscriptions');
const accountStore = storeNamed('account');
const assetKeyStore = storeNamed('protocol_asset_keys');
const stagedStore = storeNamed('protocol_staged_resources');

const reset = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  yield* harness.onOwner(
    Effect.gen(function* () {
      const { sql } = harness.owner;
      yield* sql`delete from webhook_subscriptions`;
      yield* sql`delete from account`;
      yield* sql`delete from protocol_asset_keys`;
      yield* sql`delete from protocol_staged_resources`;
      yield* sql`insert into teams (id, name, slug)
                 values (${TEAM}, ${TEAM}, ${TEAM})
                 on conflict (id) do nothing`;
      yield* sql`insert into "user" (id, name, email, "emailVerified")
                 values (${USER}, 'Stores', 'stores@example.test', true)
                 on conflict (id) do nothing`;
      yield* sql`insert into protocols (id, team_id, name)
                 values (${PROTOCOL}, ${TEAM}, 'Stores protocol')
                 on conflict (id) do nothing`;
      yield* sql`insert into drafts (id, team_id, head_manifest_hash)
                 values (${DRAFT}, ${TEAM}, 'h')
                 on conflict (id) do nothing`;
    }),
  );
});

const newSubscription = Effect.fnUntraced(function* (
  cipher = BEFORE,
  keyIdOverride?: string,
) {
  const harness = yield* TestDatabase;
  const id = randomUUID();
  const secret = `whsec_${randomUUID().replaceAll('-', '')}`;
  const sealed = cipher.sealWebhookSecret(
    { teamId: TEAM, subscriptionId: id },
    Redacted.make(secret),
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
      Redacted.make(value),
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

const newAssetKey = Effect.fnUntraced(function* (
  cipher = BEFORE,
  keyIdOverride?: string,
) {
  const harness = yield* TestDatabase;
  const assetId = `asset-${randomUUID()}`;
  const value = `pk.${randomUUID().replaceAll('-', '')}`;
  const sealed = cipher.sealAssetKey(
    { teamId: TEAM, protocolId: PROTOCOL, assetId },
    Redacted.make(value),
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

const newStagedSecret = Effect.fnUntraced(function* (
  cipher = BEFORE,
  keyIdOverride?: string,
) {
  const harness = yield* TestDatabase;
  const resourceId = `resource-${randomUUID()}`;
  const value = `sk.${randomUUID().replaceAll('-', '')}`;
  const sealed = cipher.sealStagedSecret(
    { teamId: TEAM, draftId: DRAFT, owner: OWNER, resourceId },
    Redacted.make(value),
  );
  const descriptor = {
    id: resourceId,
    kind: 'apikey',
    name: 'Key',
    status: 'staged',
  };
  yield* harness.onOwner(
    harness.owner.sql`insert into protocol_staged_resources
             (team_id, draft_id, owner, edit_id, resource_id, request_id, kind,
              descriptor, secret_ciphertext, secret_key_id)
           values (${TEAM}, ${DRAFT}, ${OWNER}, 'edit-1', ${resourceId},
                   ${randomUUID()}, 'secret', ${JSON.stringify(descriptor)}::jsonb,
                   ${sealed.ciphertext}, ${keyIdOverride ?? sealed.keyId})`,
  );
  return { resourceId, value };
});

/** A staged file: a row holding an object key and no secret. */
const newStagedFile = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  const resourceId = `resource-${randomUUID()}`;
  const descriptor = {
    id: resourceId,
    kind: 'image',
    name: 'Photo',
    status: 'staged',
  };
  yield* harness.onOwner(
    harness.owner.sql`insert into protocol_staged_resources
             (team_id, draft_id, owner, edit_id, resource_id, request_id, kind,
              descriptor, object_key, content_hash, byte_length, content_type)
           values (${TEAM}, ${DRAFT}, ${OWNER}, 'edit-1', ${resourceId},
                   ${randomUUID()}, 'content', ${JSON.stringify(descriptor)}::jsonb,
                   ${`staging/${TEAM}/${randomUUID()}`}, 'hash', 4, 'image/png')`,
  );
});

describe.skipIf(!testDb)('the secret stores', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'on a scratch schema, as the maintenance role',
    (it) => {
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

            const behind = yield* MaintenanceScope.open(
              accountStore.remaining(AFTER.currentKeyId),
            );
            expect(behind).toBe(2);
            expect(typeof behind).toBe('number');

            const exit = yield* Effect.exit(
              MaintenanceScope.open(rotateBatchWith(AFTER, accountStore, 10)),
            );
            expect(Exit.isFailure(exit)).toBe(true);
            expect(
              Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : '',
            ).toContain(
              `account ${plaintext.id} refreshToken could not be re-sealed`,
            );
          }).pipe(Effect.orDie),
      );

      it.effect('keeps a bound ciphertext out of the published failure', () =>
        Effect.gen(function* () {
          yield* reset();
          // 600 bytes: over `webhook_subscriptions_lengths_check`'s 512-byte
          // ceiling, so the row is refused with the bytes already bound.
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

          expect(bare).not.toBe('no failure');
          expect(published).not.toBe('no failure');
          expect(bare).toContain(marker);
          expect(published).not.toContain(marker);
        }).pipe(Effect.orDie),
      );

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

      it.effect(
        'reads an underscore in the current key id as itself, not as a wildcard',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const current = createSecretsCipher(
              testKeyring(['key_1', 'keyx1']),
            );
            const neighbour = createSecretsCipher(
              testKeyring(['keyx1', 'key_1']),
            );
            yield* newAccount(current, { accessToken: 'ya29.current' });
            yield* newAccount(neighbour, { accessToken: 'ya29.neighbour' });

            expect(
              yield* MaintenanceScope.open(
                accountStore.remaining(current.currentKeyId),
              ),
            ).toBe(1);
            expect(
              yield* MaintenanceScope.open(
                rotateBatchWith(current, accountStore, 10),
              ),
            ).toBe(1);
            expect(
              yield* MaintenanceScope.open(
                accountStore.remaining(current.currentKeyId),
              ),
            ).toBe(0);
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
            yield* MaintenanceScope.open(
              rotateBatchWith(AFTER, accountStore, 10),
            ),
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
              updated_at: Date;
            }>`select updated_at from webhook_subscriptions where id = ${subscription.id}`,
          );

          expect(
            yield* MaintenanceScope.open(
              rotateBatchWith(AFTER, webhookStore, 10),
            ),
          ).toBe(1);
          expect(
            yield* MaintenanceScope.open(
              webhookStore.remaining(AFTER.currentKeyId),
            ),
          ).toBe(0);

          const after = yield* harness.onOwner(
            harness.owner.sql<{
              secret_key_id: string;
              updated_at: Date;
            }>`select secret_key_id, updated_at from webhook_subscriptions
               where id = ${subscription.id}`,
          );
          expect(after[0]?.secret_key_id).toBe('test-1');
          expect(after[0]?.updated_at).toBeInstanceOf(Date);
          expect(after[0]?.updated_at.getTime()).toBe(
            before[0]?.updated_at.getTime(),
          );

          const opener = yield* MaintenanceScope.open(
            probeOf(webhookStore, 'test-1'),
          );
          expect(opener).not.toBeNull();
          expect(opener === null ? null : Redacted.value(opener(AFTER))).toBe(
            subscription.secret,
          );
        }).pipe(Effect.orDie),
      );

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
                rotateBatchWith(AFTER, webhookStore, 10),
              );
            }),
          );
          expect(taken).toBe(1);
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
          yield* newAssetKey(BEFORE, 'asset-gone');
          yield* newAssetKey(BEFORE, 'asset-gone');
          yield* newStagedSecret(BEFORE, 'staged-gone');
          yield* newStagedFile();
          const harness = yield* TestDatabase;
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
              staged: stagedStore.keyIdsInUse,
            }),
          );
          expect(ids.webhook.toSorted()).toEqual([
            'not-a-keyring-id',
            'test-2',
          ]);
          expect(ids.assetKeys).toEqual(['asset-gone']);
          expect(ids.staged).toEqual(['staged-gone']);
          expect(ids.account).toEqual(['']);
        }).pipe(Effect.orDie),
      );

      it.effect('opens a probed row, and only in the row it belongs to', () =>
        Effect.gen(function* () {
          yield* reset();
          const key = yield* newAssetKey();
          const opener = yield* MaintenanceScope.open(
            probeOf(assetKeyStore, 'test-2'),
          );
          expect(opener).not.toBeNull();
          expect(opener === null ? null : Redacted.value(opener(BEFORE))).toBe(
            key.value,
          );

          const harness = yield* TestDatabase;
          yield* harness.onOwner(
            harness.owner
              .sql`update protocol_asset_keys set asset_id = ${`${key.assetId}-moved`}
                   where team_id = ${TEAM} and protocol_id = ${PROTOCOL}
                     and asset_id = ${key.assetId}`,
          );
          const moved = yield* MaintenanceScope.open(
            probeOf(assetKeyStore, 'test-2'),
          );
          expect(moved).not.toBeNull();
          expect(() => moved?.(BEFORE)).toThrow();
        }).pipe(Effect.orDie),
      );

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
              probeOf(accountStore, 'test-2'),
            );
            expect(opener, column).not.toBeNull();
            expect(
              opener === null ? null : Redacted.value(opener(BEFORE)),
              column,
            ).toBe(`only.${column}`);
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
              webhook: probeOf(webhookStore, 'test-1'),
              account: probeOf(accountStore, 'test-1'),
              assetKeys: probeOf(assetKeyStore, 'test-1'),
              staged: probeOf(stagedStore, 'test-1'),
            }),
          );
          expect(answers).toEqual({
            webhook: null,
            account: null,
            assetKeys: null,
            staged: null,
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
              updated_at: Date;
            }>`select asset_id, key_id, updated_at from protocol_asset_keys
               order by asset_id`,
          );
          const before = yield* readRow;

          expect(
            yield* MaintenanceScope.open(
              rotateBatchWith(AFTER, assetKeyStore, 10),
            ),
          ).toBe(1);
          expect(
            yield* MaintenanceScope.open(
              assetKeyStore.remaining(AFTER.currentKeyId),
            ),
          ).toBe(0);

          const after = yield* readRow;
          expect(after[0]?.asset_id).toBe(key.assetId);
          expect(after[0]?.key_id).toBe('test-1');
          expect(after[0]?.updated_at).toBeInstanceOf(Date);
          expect(after[0]?.updated_at.getTime()).toBe(
            before[0]?.updated_at.getTime(),
          );

          const opener = yield* MaintenanceScope.open(
            probeOf(assetKeyStore, 'test-1'),
          );
          expect(opener === null ? null : Redacted.value(opener(AFTER))).toBe(
            key.value,
          );
        }).pipe(Effect.orDie),
      );

      it.effect(
        'keeps each asset key of a protocol under its own asset when re-sealing',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const first = yield* newAssetKey();
            const second = yield* newAssetKey();

            expect(
              yield* MaintenanceScope.open(
                rotateBatchWith(AFTER, assetKeyStore, 10),
              ),
            ).toBe(2);

            const harness = yield* TestDatabase;
            const rows = yield* harness.onOwner(
              harness.owner.sql<{
                asset_id: string;
                ciphertext: Uint8Array;
                key_id: string;
              }>`select asset_id, ciphertext, key_id from protocol_asset_keys`,
            );
            for (const key of [first, second]) {
              const row = rows.find((r) => r.asset_id === key.assetId);
              expect(
                Redacted.value(
                  AFTER.openAssetKey(
                    {
                      teamId: TEAM,
                      protocolId: PROTOCOL,
                      assetId: key.assetId,
                    },
                    { ciphertext: row!.ciphertext, keyId: row!.key_id },
                  ),
                ),
              ).toBe(key.value);
            }
          }).pipe(Effect.orDie),
      );

      it.effect(
        're-seals a staged secret, steps over a staged file, and opens it only under its own owner',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const secret = yield* newStagedSecret();
            yield* newStagedFile();

            expect(
              yield* MaintenanceScope.open(
                stagedStore.remaining(AFTER.currentKeyId),
              ),
            ).toBe(1);
            expect(
              yield* MaintenanceScope.open(
                rotateBatchWith(AFTER, stagedStore, 10),
              ),
            ).toBe(1);
            expect(
              yield* MaintenanceScope.open(
                stagedStore.remaining(AFTER.currentKeyId),
              ),
            ).toBe(0);

            const opener = yield* MaintenanceScope.open(
              probeOf(stagedStore, 'test-1'),
            );
            expect(opener === null ? null : Redacted.value(opener(AFTER))).toBe(
              secret.value,
            );

            const harness = yield* TestDatabase;
            yield* harness.onOwner(
              harness.owner
                .sql`update protocol_staged_resources set owner = ${`${USER}:tab-2`}
                     where resource_id = ${secret.resourceId}`,
            );
            const moved = yield* MaintenanceScope.open(
              probeOf(stagedStore, 'test-1'),
            );
            expect(moved).not.toBeNull();
            expect(() => moved?.(AFTER)).toThrow();
          }).pipe(Effect.orDie),
      );

      it.effect('takes no more than the batch size, and resumes', () =>
        Effect.gen(function* () {
          yield* reset();
          for (let index = 0; index < 3; index += 1) yield* newSubscription();

          expect(
            yield* MaintenanceScope.open(
              rotateBatchWith(AFTER, webhookStore, 1),
            ),
          ).toBe(1);
          expect(
            yield* MaintenanceScope.open(
              webhookStore.remaining(AFTER.currentKeyId),
            ),
          ).toBe(2);
          expect(
            yield* MaintenanceScope.open(
              rotateBatchWith(AFTER, webhookStore, 10),
            ),
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
              yield* MaintenanceScope.open(
                rotateBatchWith(AFTER, accountStore, 10),
              ),
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
              Redacted.value(
                AFTER.openOAuthToken(
                  {
                    providerId: 'google',
                    accountId: row.accountId,
                    column: 'accessToken',
                  },
                  stored[0]?.accessToken ?? '',
                ),
              ),
            ).toBe('ya29.only');
          }).pipe(Effect.orDie),
      );
    },
  );
});
