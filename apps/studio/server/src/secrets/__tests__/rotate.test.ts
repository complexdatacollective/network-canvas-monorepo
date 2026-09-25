// Rotation against real rows, because every property it has to hold is a
// property of the transactions: that it re-seals what is behind and leaves
// what is current alone, that a second run finds nothing, that an interrupted
// run keeps what it committed, and that it refuses outright rather than
// half-rotating a database whose keyring is incomplete.
//
// Every transaction the rotation opens is a MAINTENANCE one, which stamps no
// team: the tenant tables force row-level security, so any other role would
// rotate one team's rows and leave the rest pinned to a key about to be
// removed. The fixtures and the oracles go through the connecting login
// instead (`harness.onOwner`), which is a different session and therefore a
// real second one — which is what makes the held-row case mean anything.
import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Cause, Effect, Exit, Layer } from 'effect';
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
import {
  assertSecretKeysProducible,
  SecretKeyCheckError,
  SecretKeyIdMalformedError,
  SecretKeyMaterialError,
  SecretKeyMissingError,
  secretKeyIdsInUse,
} from '../boot.ts';
import { createSecretsCipher } from '../cipher.ts';
import { type KeyringApi, parseKeyring } from '../keyring.ts';
import { RotationIncomplete, rotateSecrets } from '../rotate.ts';
import { Keyring, type SecretsCipher, SecretsCipherLive } from '../services.ts';

const TEAM = 'team-rotation';
const USER = 'user-rotation';
/** The protocol line every asset key below belongs to. */
const PROTOCOL = '3f1c9b4e-0a2d-4c5e-9b8a-6d7e5f4c3b2a';
/** A key id no keyring in this file carries: a half-removed rotation entry. */
const MISSING = 'gone';

/** `test-2` current, `test-1` readable: what the database was written under. */
const BEFORE = testKeyring(['test-2', 'test-1']);
/** `test-1` current, `test-2` readable: the keyring a rotation deploys. */
const AFTER = testKeyring(['test-1', 'test-2']);

/**
 * `test-1` by name, another key by material: the shape a restore from the
 * wrong backup, or a regenerated keyring, leaves behind.
 */
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

/**
 * The rotation reads its keyring and its cipher from the services, so no call
 * site can hand it a cipher over some other key material. A case that rotates
 * under a given keyring provides both from that one keyring, which is what
 * `SecretsCipherLive` over it is.
 */
const underKeyring = <A, E, R>(
  keyring: KeyringApi,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, Keyring | SecretsCipher>> =>
  Effect.provide(
    body,
    SecretsCipherLive.pipe(Layer.provideMerge(Layer.succeed(Keyring, keyring))),
  );

/**
 * The boot check under one keyring, with the cipher derived from that same
 * keyring rather than passed beside it — the pairing the check's own signature
 * asks for, in one place so no case can get it wrong.
 */
const bootCheck = (keyring: KeyringApi) =>
  MaintenanceScope.open(
    assertSecretKeysProducible(keyring, createSecretsCipher(keyring)),
  );

/**
 * What a refused run answered with. A typed failure (`RotationIncomplete`, the
 * boot check's three) and a DEFECT (a re-seal that refused a plaintext token, a
 * batch size that could never finish) are read the same way: `Effect.result`
 * would catch only the first kind, so everything is read off the `Exit`.
 */
const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isFailure(exit)
    ? Cause.squash(exit.cause)
    : new Error('the run succeeded, so there is no refusal to read');

const messageOf = (failure: unknown): string =>
  failure instanceof Error ? failure.message : String(failure);

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
                 values (${USER}, 'Rotation', 'rotation@example.test', true)
                 on conflict (id) do nothing`;
      // `protocol_asset_keys` rows are pinned to a protocol by a composite
      // foreign key, so the line has to exist before any key is stored on it.
      yield* sql`insert into protocols (id, team_id, name)
                 values (${PROTOCOL}, ${TEAM}, 'Rotation protocol')
                 on conflict (id) do nothing`;
    }),
  );
});

/** A subscription sealed by `cipher`, returning its id and its plaintext. */
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

/**
 * One `account` row. `tokens` is what each column holds: a plain string is
 * sealed by `cipher`, and a value given as `{ plaintext: … }` is written
 * as-is, which is the write that bypassed the auth adapter.
 */
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

/** One sealed API key for `PROTOCOL`, returning its asset id and plaintext. */
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

// The oracles, read as the connecting login. `updated_at`/`updatedAt` come
// back from RAW statements, which decode `timestamptz` as epoch milliseconds
// rather than as a `Date` on rc.115 — so every case that asserts a timestamp
// was NOT touched also pins that it is a primitive, because the comparison
// only means "unchanged" while it is one.
const subscriptionRows = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  return yield* harness.onOwner(
    harness.owner.sql<{
      id: string;
      secret_ciphertext: Uint8Array;
      secret_key_id: string;
      updated_at: number;
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
      updatedAt: number;
    }>`select id, "accountId", "accessToken", "refreshToken", "idToken", "updatedAt"
       from account order by id`,
  );
});

const assetKeyRows = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  return yield* harness.onOwner(
    harness.owner.sql<{
      asset_id: string;
      ciphertext: Uint8Array;
      key_id: string;
      updated_at: number;
    }>`select asset_id, ciphertext, key_id, updated_at
       from protocol_asset_keys order by asset_id`,
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

            // Rotation changes how a row is stored, not when anyone last
            // changed it: a bumped timestamp would make every audit and every
            // "recently changed" view lie the day a deployment re-keys.
            expect(typeof rotatedAccount?.updatedAt).toBe('number');
            expect(rotatedAccount?.updatedAt).toBe(storedAt);
            expect(typeof rotatedAssetKey?.updated_at).toBe('number');
            expect(rotatedAssetKey?.updated_at).toBe(assetStoredAt);
          }).pipe(Effect.orDie),
      );

      it.effect(
        'leaves an asset key that is already current byte for byte alone',
        () =>
          Effect.gen(function* () {
            // Sealed under the keyring the rotation deploys, so there is
            // nothing to do: a re-seal under the same key would draw a new
            // nonce and still pass a count-only assertion.
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
            // Including the row it could have rotated: the check runs before
            // any write, so an incomplete keyring rotates nothing rather than
            // some.
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

            // Idempotent in the strong sense: not merely "reports zero", but
            // leaves the stored bytes identical. A re-seal under the same key
            // would produce a new nonce and pass a count-only assertion.
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
            const failure = failureOf(
              yield* Effect.exit(
                underKeyring(
                  AFTER,
                  rotateSecrets({
                    batchSize: 1,
                    log: () => {
                      batches += 1;
                      // Stands in for the process being killed between batches,
                      // which is the failure resumability is for: the run ends
                      // after a commit, and a death is a defect rather than
                      // something the rotation publishes.
                      return Effect.die(new Error('interrupted'));
                    },
                  }),
                ),
              ),
            );
            expect(messageOf(failure)).toMatch(/interrupted/);
            expect(batches).toBe(1);

            const partial = yield* subscriptionRows();
            expect(
              partial.filter((row) => row.secret_key_id === 'test-1'),
            ).toHaveLength(1);

            // The rerun is the whole point: it finishes the rest and does not
            // redo the batch that already committed.
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

            // The lock is taken on the connecting login's own connection,
            // which is a different client from the maintenance one, so the
            // rotation below really is another session.
            const exit = yield* harness.onOwner(
              Effect.gen(function* () {
                yield* harness.owner.sql`select id from webhook_subscriptions
                                         where id = ${held.id} for update`;
                // FOR UPDATE SKIP LOCKED means a held row makes a batch return
                // zero, which is also how a finished store reports itself.
                // Believing it let the command print "every stored secret is
                // now under key id …" with a row still sealed under the entry
                // the operator is about to remove.
                return yield* Effect.exit(underKeyring(AFTER, rotateSecrets()));
              }),
            );
            const failure = failureOf(exit);
            expect(failure).toBeInstanceOf(RotationIncomplete);
            expect(messageOf(failure)).toMatch(
              /webhook_subscriptions: 1 row still under another key \(held by another session, or written under an older key while this ran\); run rotate-secrets again/,
            );

            // The batch that did commit is still committed: the postcondition
            // reports, it does not roll anything back.
            expect(
              (yield* subscriptionRows()).filter(
                (row) => row.secret_key_id === 'test-1',
              ),
            ).toHaveLength(1);

            // And the rerun the message asks for finishes the job.
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
          // What the boot check compares against the keyring: one set, from
          // every store, however many tables the registry grows to.
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
            // A row whose key id is not one a keyring could hold cannot be opened
            // by any keyring, so dropping it from the comparison made the boot
            // check pass on a database it had just proved unreadable. It is
            // counted instead, and the count says which table without ever
            // printing what the column holds: these ids are read back out of
            // stored text, and a boot refusal must not be a way to get arbitrary
            // stored bytes into a log.
            yield* reset();
            yield* newSubscription(beforeCipher, 'not a key id');
            yield* newSubscription(beforeCipher, 'nor is this');
            yield* newAssetKey(beforeCipher, 'not a key id either');
            yield* newAccount(beforeCipher, {
              accessToken: { plaintext: 'studio-secret::whatever' },
            });

            const failure = failureOf(yield* Effect.exit(bootCheck(AFTER)));
            expect(failure).toBeInstanceOf(SecretKeyIdMalformedError);
            // Every refusal from the boot check is one type to catch: that is
            // what `verifySecretKeysOrExit` prints as a sentence rather than a
            // stack.
            expect(failure).toBeInstanceOf(SecretKeyCheckError);
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
            // Never the text itself.
            expect(message).not.toContain('not a key id');
            expect(message).not.toContain('whatever');
          }).pipe(Effect.orDie),
      );

      it.effect(
        'refuses at boot when the keyring holds an id under different material',
        () =>
          Effect.gen(function* () {
            // A restored database and a keyring that both name `test-1` but
            // disagree about what it is: every id is present, so the
            // produce-check passed and the deployment came up to fail one
            // webhook signature at a time.
            yield* reset();
            yield* newSubscription(afterCipher);
            yield* newAccount(afterCipher);
            yield* newAssetKey(afterCipher);

            const failure = failureOf(yield* Effect.exit(bootCheck(IMPOSTOR)));
            expect(failure).toBeInstanceOf(SecretKeyMaterialError);
            expect(messageOf(failure)).toMatch(
              /Key id "test-1" in the keyring does not open the stored secrets sealed under it/,
            );
            // The keyring that does match still passes, so the probe is not
            // simply refusing everything.
            expect(yield* Effect.exit(bootCheck(AFTER))).toStrictEqual(
              Exit.succeed(undefined),
            );
          }).pipe(Effect.orDie),
      );

      it.effect('refuses a row whose only token is plaintext', () =>
        Effect.gen(function* () {
          // Selected on "is not under the current key" rather than on carrying
          // a sealed prefix: a row whose only token is plaintext matched
          // neither, so rotation walked past it and reported success with
          // plaintext at rest.
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
            expect(failure).toBeInstanceOf(SecretKeyMissingError);
            expect(messageOf(failure)).toMatch(
              new RegExp(`cannot produce: ${MISSING}`),
            );
            // Not one row: a partial rotation under an incomplete keyring is
            // the state this command exists to get a deployment out of, not
            // into.
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

            // Sealing it here would hide the write that bypassed the auth
            // adapter, and the row would look rotated ever after.
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
          // A DEFECT rather than a failure: the number came from the call site
          // rather than from the database, and there is nothing an operator
          // could do with it that is not "fix the caller".
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
