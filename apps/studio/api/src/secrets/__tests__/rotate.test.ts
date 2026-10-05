import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Cause, Effect, Exit, Fiber, Layer, Logger } from 'effect';
import { describe, expect } from 'vitest';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import {
  testKeyring,
  testKeyringEntry,
} from '../../__tests__/support/secrets.ts';
import { MaintenanceScope } from '../../db/tenant.ts';
import { createSecretsCipher } from '../cipher.ts';
import { type KeyringApi, parseKeyring } from '../keyring.ts';
import { RotationIncomplete, rotateSecrets } from '../rotate.ts';
import { Keyring, SecretsCipher } from '../services.ts';
import {
  SecretKeyIdMalformed,
  SecretKeyMaterial,
  SecretKeyMissing,
  secretKeyIdsInUse,
  verifyStoredKeys,
} from '../verify.ts';

const TEAM = 'team-rotation';
const USER = 'user-rotation';
const PROTOCOL = '3f1c9b4e-0a2d-4c5e-9b8a-6d7e5f4c3b2a';
const OTHER_TEAM = 'team-rotation-other';
const OTHER_PROTOCOL = '8b2d4f6a-1c3e-4a5b-8d7f-9e0a1b2c3d4e';
const MISSING = 'gone';

const BEFORE = testKeyring(['test-2', 'test-1']);
const AFTER = testKeyring(['test-1', 'test-2']);

const IMPOSTOR = parseKeyring(
  `test-1:${testKeyringEntry('test-impostor').split(':')[1]!}`,
);

const beforeCipher = createSecretsCipher(BEFORE);
const afterCipher = createSecretsCipher(AFTER);

type TokenColumn = 'accessToken' | 'refreshToken' | 'idToken';
const TOKEN_COLUMNS = [
  'accessToken',
  'refreshToken',
  'idToken',
] as const satisfies readonly TokenColumn[];

const underKeyring = <A, E, R>(
  keyring: KeyringApi,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, Keyring | SecretsCipher>> =>
  Effect.provide(
    body,
    SecretsCipher.layer.pipe(
      Layer.provideMerge(Layer.succeed(Keyring, keyring)),
    ),
  );

const bootCheck = (keyring: KeyringApi) =>
  underKeyring(keyring, verifyStoredKeys);

const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isFailure(exit)
    ? Cause.squash(exit.cause)
    : new Error('the run succeeded, so there is no refusal to read');

const messageOf = (failure: unknown): string =>
  failure instanceof Error ? failure.message : String(failure);

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
                 values (${USER}, 'Rotation', 'rotation@example.test', true)
                 on conflict (id) do nothing`;
      yield* sql`insert into protocols (id, team_id, name)
                 values (${PROTOCOL}, ${TEAM}, 'Rotation protocol')
                 on conflict (id) do nothing`;
    }),
  );
});

const newSubscription = Effect.fnUntraced(function* (
  cipher = beforeCipher,
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

const newAccount = Effect.fnUntraced(function* (
  cipher = beforeCipher,
  tokens: Partial<Record<TokenColumn, string | { plaintext: string }>> = {
    accessToken: 'ya29.access',
    refreshToken: '1//refresh',
    idToken: 'eyJ.id',
  },
) {
  const harness = yield* TestDatabase;
  const id = randomUUID();
  const accountId = `sub-${randomUUID()}`;
  const stored = (column: TokenColumn) => {
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

const newAssetKey = Effect.fnUntraced(function* (
  cipher = beforeCipher,
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

const subscriptionRows = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  return yield* harness.onOwner(
    harness.owner.sql<{
      id: string;
      secret_ciphertext: Uint8Array;
      secret_key_id: string;
      updated_at: Date;
    }>`select id, secret_ciphertext, secret_key_id, updated_at
       from webhook_subscriptions order by id`,
  );
});

const accountRows = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  return yield* harness.onOwner(
    harness.owner.sql<{
      id: string;
      accountId: string;
      accessToken: string | null;
      refreshToken: string | null;
      idToken: string | null;
      updatedAt: Date;
    }>`select id, "accountId", "accessToken", "refreshToken", "idToken", "updatedAt"
       from account order by id`,
  );
});

const assetKeyRows = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  return yield* harness.onOwner(
    harness.owner.sql<{
      team_id: string;
      protocol_id: string;
      asset_id: string;
      ciphertext: Uint8Array;
      key_id: string;
      updated_at: Date;
    }>`select team_id, protocol_id, asset_id, ciphertext, key_id, updated_at
       from protocol_asset_keys order by asset_id, team_id, protocol_id`,
  );
});

describe.skipIf(!testDb)('rotating stored secrets', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'on a scratch schema, as the maintenance role',
    (it) => {
      it.effect(
        're-seals every store under the current key, plaintext unchanged',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const subscription = yield* newSubscription();
            const account = yield* newAccount();
            const assetKey = yield* newAssetKey();
            const storedAt = (yield* accountRows())[0]!.updatedAt;
            const assetStoredAt = (yield* assetKeyRows())[0]!.updated_at;

            const counts = yield* underKeyring(AFTER, rotateSecrets());
            expect(counts).toEqual({
              webhook_subscriptions: 1,
              account: 1,
              protocol_asset_keys: 1,
            });

            const [rotatedSubscription] = yield* subscriptionRows();
            expect(rotatedSubscription?.secret_key_id).toBe('test-1');
            expect(
              afterCipher.openWebhookSecret(
                { teamId: TEAM, subscriptionId: subscription.id },
                {
                  ciphertext: rotatedSubscription!.secret_ciphertext,
                  keyId: rotatedSubscription!.secret_key_id,
                },
              ),
            ).toBe(subscription.secret);

            const [rotatedAccount] = yield* accountRows();
            for (const column of TOKEN_COLUMNS) {
              const value = rotatedAccount![column];
              expect(value?.startsWith('studio-secret:test-1:')).toBe(true);
              expect(
                afterCipher.openOAuthToken(
                  {
                    providerId: 'google',
                    accountId: account.accountId,
                    column,
                  },
                  value!,
                ),
              ).toBe(account.tokens[column]);
            }

            const [rotatedAssetKey] = yield* assetKeyRows();
            expect(rotatedAssetKey?.key_id).toBe('test-1');
            expect(
              afterCipher.openAssetKey(
                {
                  teamId: TEAM,
                  protocolId: PROTOCOL,
                  assetId: assetKey.assetId,
                },
                {
                  ciphertext: rotatedAssetKey!.ciphertext,
                  keyId: rotatedAssetKey!.key_id,
                },
              ),
            ).toBe(assetKey.value);

            expect(rotatedAccount?.updatedAt).toBeInstanceOf(Date);
            expect(rotatedAccount?.updatedAt.getTime()).toBe(
              storedAt.getTime(),
            );
            expect(rotatedAssetKey?.updated_at).toBeInstanceOf(Date);
            expect(rotatedAssetKey?.updated_at.getTime()).toBe(
              assetStoredAt.getTime(),
            );
          }).pipe(Effect.orDie),
      );

      it.effect(
        're-seals each asset key whose asset id another protocol or team shares under its own identity',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const harness = yield* TestDatabase;
            const { sql } = harness.owner;
            const assetId = `asset-${randomUUID()}`;
            const sealedAt = (teamId: string, protocolId: string) => {
              const identity = { teamId, protocolId, assetId };
              const value = `pk.${randomUUID().replaceAll('-', '')}`;
              return {
                identity,
                value,
                sealed: beforeCipher.sealAssetKey(identity, value),
              };
            };
            const sameTeam = sealedAt(TEAM, PROTOCOL);
            const otherProtocol = sealedAt(TEAM, OTHER_PROTOCOL);
            const otherTeam = sealedAt(OTHER_TEAM, PROTOCOL);
            const seeded = [sameTeam, otherProtocol, otherTeam];
            const insertRow = (row: typeof sameTeam) =>
              sql`insert into protocol_asset_keys (team_id, protocol_id, asset_id,
                                                   ciphertext, key_id)
                  values (${row.identity.teamId}, ${row.identity.protocolId},
                          ${row.identity.assetId}, ${row.sealed.ciphertext},
                          ${row.sealed.keyId})`;

            yield* harness.onOwner(
              Effect.gen(function* () {
                yield* sql`insert into teams (id, name, slug)
                           values (${OTHER_TEAM}, ${OTHER_TEAM}, ${OTHER_TEAM})
                           on conflict (id) do nothing`;
                yield* sql`insert into protocols (id, team_id, name)
                           values (${OTHER_PROTOCOL}, ${TEAM}, 'Second rotation protocol')
                           on conflict (id) do nothing`;
                yield* insertRow(sameTeam);
                yield* insertRow(otherProtocol);
              }),
            );
            // protocols.id is the primary key, so the foreign key ties a
            // protocol id to one team and the team_id predicate is otherwise
            // unobservable. The owner lifts the foreign-key triggers for this
            // one transaction to stage the same protocol id under a second
            // team.
            yield* harness.onOwner(
              Effect.andThen(
                sql`set local session_replication_role = replica`,
                insertRow(otherTeam),
              ),
            );

            const counts = yield* underKeyring(AFTER, rotateSecrets());
            expect(counts.protocol_asset_keys).toBe(seeded.length);

            const rotated = yield* assetKeyRows();
            expect(rotated).toHaveLength(seeded.length);
            for (const { identity, value } of seeded) {
              const row = rotated.find(
                (candidate) =>
                  candidate.team_id === identity.teamId &&
                  candidate.protocol_id === identity.protocolId &&
                  candidate.asset_id === identity.assetId,
              );
              expect(row?.key_id).toBe('test-1');
              expect(
                afterCipher.openAssetKey(identity, {
                  ciphertext: row!.ciphertext,
                  keyId: row!.key_id,
                }),
              ).toBe(value);
            }
          }).pipe(Effect.orDie),
      );

      it.effect(
        'leaves an asset key that is already current byte for byte alone',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* newAssetKey(afterCipher);
            const stored = yield* assetKeyRows();

            const counts = yield* underKeyring(AFTER, rotateSecrets());
            expect(counts.protocol_asset_keys).toBe(0);
            expect(yield* assetKeyRows()).toEqual(stored);
          }).pipe(Effect.orDie),
      );

      it.effect(
        'refuses to rotate an asset key sealed under a missing entry',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const behind = yield* newAssetKey();
            yield* newAssetKey(beforeCipher, MISSING);
            const stored = yield* assetKeyRows();

            const failure = failureOf(
              yield* Effect.exit(underKeyring(AFTER, rotateSecrets())),
            );
            expect(messageOf(failure)).toMatch(
              new RegExp(`cannot produce: ${MISSING}`),
            );
            expect(yield* assetKeyRows()).toEqual(stored);
            expect(
              stored.find((row) => row.asset_id === behind.assetId)?.key_id,
            ).toBe('test-2');
          }).pipe(Effect.orDie),
      );

      it.effect(
        're-seals the tokens a row does have and leaves the others null',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const account = yield* newAccount(beforeCipher, {
              accessToken: 'ya29.only',
            });
            yield* underKeyring(AFTER, rotateSecrets());

            const [row] = yield* accountRows();
            expect(row?.refreshToken).toBeNull();
            expect(row?.idToken).toBeNull();
            expect(
              afterCipher.openOAuthToken(
                {
                  providerId: 'google',
                  accountId: account.accountId,
                  column: 'accessToken',
                },
                row!.accessToken!,
              ),
            ).toBe('ya29.only');
          }).pipe(Effect.orDie),
      );

      it.effect(
        'finds nothing to do on a second run, and rewrites no row',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* newSubscription();
            yield* newAccount();
            yield* newAssetKey();
            yield* underKeyring(AFTER, rotateSecrets());
            const first = yield* subscriptionRows();
            const firstAccounts = yield* accountRows();
            const firstAssetKeys = yield* assetKeyRows();

            expect(yield* underKeyring(AFTER, rotateSecrets())).toEqual({
              webhook_subscriptions: 0,
              account: 0,
              protocol_asset_keys: 0,
            });
            expect(yield* subscriptionRows()).toEqual(first);
            expect(yield* accountRows()).toEqual(firstAccounts);
            expect(yield* assetKeyRows()).toEqual(firstAssetKeys);
          }).pipe(Effect.orDie),
      );

      it.effect(
        'keeps the batches it committed when a run is interrupted',
        () =>
          Effect.gen(function* () {
            yield* reset();
            for (let index = 0; index < 3; index += 1) yield* newSubscription();

            let batches = 0;
            const stopAfterFirstCommit = Logger.make(({ fiber, message }) => {
              if (!String(message).includes('re-sealed')) return;
              batches += 1;
              fiber.interruptUnsafe();
            });
            const run = yield* Effect.forkChild(
              underKeyring(AFTER, rotateSecrets({ batchSize: 1 })).pipe(
                Effect.provide(Logger.layer([stopAfterFirstCommit])),
              ),
            );
            const exit = yield* Fiber.await(run);
            expect(
              Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
            ).toBe(true);
            expect(batches).toBe(1);

            const partial = yield* subscriptionRows();
            expect(
              partial.filter((row) => row.secret_key_id === 'test-1'),
            ).toHaveLength(1);

            expect(yield* underKeyring(AFTER, rotateSecrets())).toEqual({
              webhook_subscriptions: 2,
              account: 0,
              protocol_asset_keys: 0,
            });
            expect(
              (yield* subscriptionRows()).every(
                (row) => row.secret_key_id === 'test-1',
              ),
            ).toBe(true);
          }).pipe(Effect.orDie),
      );

      it.effect(
        'refuses to report success while another transaction holds a row',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const held = yield* newSubscription();
            yield* newSubscription();
            const harness = yield* TestDatabase;

            const exit = yield* harness.onOwner(
              Effect.gen(function* () {
                yield* harness.owner.sql`select id from webhook_subscriptions
                                         where id = ${held.id} for update`;
                return yield* Effect.exit(underKeyring(AFTER, rotateSecrets()));
              }),
            );
            const failure = failureOf(exit);
            expect(failure).toBeInstanceOf(RotationIncomplete);
            expect(messageOf(failure)).toMatch(
              /webhook_subscriptions: 1 row still under another key \(held by another session, or written under an older key while this ran\); run rotate-secrets again/,
            );

            expect(
              (yield* subscriptionRows()).filter(
                (row) => row.secret_key_id === 'test-1',
              ),
            ).toHaveLength(1);

            expect(yield* underKeyring(AFTER, rotateSecrets())).toEqual({
              webhook_subscriptions: 1,
              account: 0,
              protocol_asset_keys: 0,
            });
            expect(
              (yield* subscriptionRows()).every(
                (row) => row.secret_key_id === 'test-1',
              ),
            ).toBe(true);
          }).pipe(Effect.orDie),
      );

      it.effect('reports the key ids in use across every store', () =>
        Effect.gen(function* () {
          yield* reset();
          yield* newSubscription();
          yield* newSubscription(beforeCipher, MISSING);
          yield* newAccount();
          yield* newAssetKey(beforeCipher, 'asset-gone');
          expect(yield* MaintenanceScope.open(secretKeyIdsInUse)).toEqual([
            'asset-gone',
            MISSING,
            'test-2',
          ]);
        }).pipe(Effect.orDie),
      );

      it.effect(
        'refuses at boot when a stored key id is not a keyring id',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* newSubscription(beforeCipher, 'not a key id');
            yield* newSubscription(beforeCipher, 'nor is this');
            yield* newAssetKey(beforeCipher, 'not a key id either');
            yield* newAccount(beforeCipher, {
              accessToken: { plaintext: 'studio-secret::whatever' },
            });

            const failure = yield* Effect.flip(bootCheck(AFTER));
            expect(failure).toBeInstanceOf(SecretKeyIdMalformed);
            const message = messageOf(failure);
            expect(message).toContain(
              '2 stored key ids in webhook_subscriptions are not keyring ids',
            );
            expect(message).toContain(
              '1 stored key id in protocol_asset_keys is not a keyring id',
            );
            expect(message).toContain(
              '1 stored key id in account is not a keyring id',
            );
            expect(message).not.toContain('not a key id');
            expect(message).not.toContain('whatever');
          }).pipe(Effect.orDie),
      );

      it.effect(
        'refuses at boot when the keyring holds an id under different material',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* newSubscription(afterCipher);
            yield* newAccount(afterCipher);
            yield* newAssetKey(afterCipher);

            const failure = failureOf(yield* Effect.exit(bootCheck(IMPOSTOR)));
            expect(failure).toBeInstanceOf(SecretKeyMaterial);
            expect(messageOf(failure)).toMatch(
              /Key id "test-1" in the keyring does not open the stored secrets sealed under it/,
            );
            expect(yield* Effect.exit(bootCheck(AFTER))).toStrictEqual(
              Exit.succeed(undefined),
            );
          }).pipe(Effect.orDie),
      );

      it.effect('refuses a row whose only token is plaintext', () =>
        Effect.gen(function* () {
          yield* reset();
          const account = yield* newAccount(beforeCipher, {
            refreshToken: { plaintext: '1//written-around-the-adapter' },
          });

          const failure = failureOf(
            yield* Effect.exit(underKeyring(AFTER, rotateSecrets())),
          );
          expect(messageOf(failure)).toMatch(
            new RegExp(
              `account ${account.id} refreshToken could not be re-sealed`,
            ),
          );
          const [row] = yield* accountRows();
          expect(row?.refreshToken).toBe('1//written-around-the-adapter');
        }).pipe(Effect.orDie),
      );

      it.effect(
        'refuses a keyring missing a stored key id, and rotates nothing',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* newSubscription();
            yield* newSubscription(beforeCipher, MISSING);
            const stored = yield* subscriptionRows();

            const failure = failureOf(
              yield* Effect.exit(underKeyring(AFTER, rotateSecrets())),
            );
            expect(failure).toBeInstanceOf(SecretKeyMissing);
            expect(messageOf(failure)).toMatch(
              new RegExp(`cannot produce: ${MISSING}`),
            );
            expect(yield* subscriptionRows()).toEqual(stored);
          }).pipe(Effect.orDie),
      );

      it.effect(
        'refuses a plaintext token rather than sealing it on the way past',
        () =>
          Effect.gen(function* () {
            yield* reset();
            const account = yield* newAccount(beforeCipher, {
              accessToken: 'ya29.sealed',
              refreshToken: { plaintext: 'ya29.written-around-the-adapter' },
            });

            const failure = failureOf(
              yield* Effect.exit(underKeyring(AFTER, rotateSecrets())),
            );
            expect(messageOf(failure)).toMatch(
              new RegExp(
                `account ${account.id} refreshToken could not be re-sealed`,
              ),
            );
            const [row] = yield* accountRows();
            expect(row?.refreshToken).toBe('ya29.written-around-the-adapter');
            expect(row?.accessToken?.startsWith('studio-secret:test-2:')).toBe(
              true,
            );
          }).pipe(Effect.orDie),
      );

      it.effect('refuses a batch size that would never finish', () =>
        Effect.gen(function* () {
          yield* reset();
          const failure = failureOf(
            yield* Effect.exit(
              underKeyring(AFTER, rotateSecrets({ batchSize: 0 })),
            ),
          );
          expect(messageOf(failure)).toMatch(/positive integer/);
        }).pipe(Effect.orDie),
      );
    },
  );
});
