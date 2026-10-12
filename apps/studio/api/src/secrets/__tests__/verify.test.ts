import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { Cause, Effect, Exit, Layer, Redacted, Ref } from 'effect';
import { describe, expect } from 'vitest';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { testKeyring } from '../../__tests__/support/secrets.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { Environment, readEnv } from '../../env.ts';
import { createSecretsCipher } from '../cipher.ts';
import type { KeyringApi } from '../keyring.ts';
import { Keyring, KeyringMissing, SecretsCipher } from '../services.ts';
import {
  KeyringVerified,
  SecretKeyMissing,
  verifyKeyringOn,
  verifyStoredKeys,
} from '../verify.ts';

const TEAM = 'team-keyring-gate';
const USER = 'user-keyring-gate';
const MISSING = 'gone';

const secretsFor = (keyring: KeyringApi) =>
  SecretsCipher.layer.pipe(Layer.provideMerge(Layer.succeed(Keyring, keyring)));

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
                 values (${USER}, 'Gate', 'gate@example.test', true)
                 on conflict (id) do nothing`;
    }),
  );
});

const storeSecretUnder = Effect.fnUntraced(function* (keyId: string) {
  const harness = yield* TestDatabase;
  const id = randomUUID();
  const sealed = createSecretsCipher(testKeyring([keyId])).sealWebhookSecret(
    { teamId: TEAM, subscriptionId: id },
    Redacted.make(`whsec_${randomUUID().replaceAll('-', '')}`),
  );
  yield* harness.onOwner(
    harness.owner
      .sql`insert into webhook_subscriptions (id, team_id, url, event_types,
                                              secret_ciphertext, secret_key_id,
                                              created_by_user_id)
           values (${id}, ${TEAM}, 'https://hooks.example.org/studio',
                   ${['interview.completed']}, ${sealed.ciphertext},
                   ${sealed.keyId}, ${USER})`,
  );
});

const connectionsOf = Effect.fnUntraced(function* (applicationName: string) {
  const harness = yield* TestDatabase;
  const rows = yield* harness.owner.sql<{ count: number }>`
    select count(*)::int as count from pg_stat_activity
    where application_name = ${applicationName}`;
  return rows[0]?.count ?? 0;
});

const Beneath = (built: Ref.Ref<number[]>, applicationName: string) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const held = yield* connectionsOf(applicationName);
      yield* Ref.update(built, (seen) => [...seen, held]);
    }),
  );

const gateOn = (applicationName: string) =>
  Effect.gen(function* () {
    const harness = yield* TestDatabase;
    if (testDb === null) return yield* Effect.die(new Error('no database'));
    return Layer.effectDiscard(
      verifyKeyringOn({
        url: testDb.url,
        searchPath: harness.schema,
        maxConnections: 2,
        applicationName,
      }),
    );
  });

const buildBeneath = <E>(
  gated: Layer.Layer<never, E, TestDatabase>,
): Effect.Effect<Exit.Exit<unknown, E>, never, TestDatabase> =>
  Effect.exit(Effect.scoped(Layer.build(gated)));

describe.skipIf(!testDb)('the keyring gate', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'on a scratch schema',
    (it) => {
      it.effect(
        'builds nothing beneath it while a stored key id is missing',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* storeSecretUnder(MISSING);
            const name = `studio-test-gate-${randomUUID().slice(0, 8)}`;
            const built = yield* Ref.make<number[]>([]);
            const gate = yield* gateOn(name);

            const exit = yield* buildBeneath(
              Beneath(built, name).pipe(
                Layer.provide(gate),
                Layer.provide(secretsFor(testKeyring(['test-1']))),
              ),
            );

            expect(Exit.isFailure(exit)).toBe(true);
            const failure = Exit.isFailure(exit)
              ? Cause.squash(exit.cause)
              : undefined;
            expect(failure).toBeInstanceOf(SecretKeyMissing);
            expect(yield* Ref.get(built)).toEqual([]);
          }),
      );

      it.effect(
        'builds what is beneath it once every stored key opens, after its client is gone',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* storeSecretUnder('test-1');
            const name = `studio-test-gate-${randomUUID().slice(0, 8)}`;
            const built = yield* Ref.make<number[]>([]);
            const gate = yield* gateOn(name);

            const exit = yield* buildBeneath(
              Beneath(built, name).pipe(
                Layer.provide(gate),
                Layer.provide(secretsFor(testKeyring(['test-1']))),
              ),
            );

            expect(Exit.isSuccess(exit)).toBe(true);
            expect(yield* Ref.get(built)).toEqual([0]);
          }),
      );

      it.effect(
        'would see a maintenance client the gate kept for the life of the graph',
        () =>
          Effect.gen(function* () {
            yield* reset();
            yield* storeSecretUnder('test-1');
            const harness = yield* TestDatabase;
            if (testDb === null) return yield* Effect.die(new Error('no db'));
            const name = `studio-test-gate-${randomUUID().slice(0, 8)}`;
            const built = yield* Ref.make<number[]>([]);
            const kept = Layer.effectDiscard(verifyStoredKeys).pipe(
              Layer.provide(
                MaintenanceDatabase.layer({
                  url: testDb.url,
                  searchPath: harness.schema,
                  maxConnections: 2,
                  applicationName: name,
                }),
              ),
            );

            const exit = yield* buildBeneath(
              Beneath(built, name).pipe(
                Layer.provide(kept),
                Layer.provide(secretsFor(testKeyring(['test-1']))),
              ),
            );

            expect(Exit.isSuccess(exit)).toBe(true);
            const [held] = yield* Ref.get(built);
            expect(held).toBeGreaterThan(0);
          }),
      );

      it.effect(
        'refuses to build without a keyring, before it reaches the database',
        () =>
          Effect.gen(function* () {
            const env = {
              ...readEnv(),
              db: { url: 'postgres://nobody@127.0.0.1:1/nothing' },
              secrets: undefined,
            };
            const built = yield* Ref.make<number[]>([]);

            const exit = yield* buildBeneath(
              Beneath(built, 'studio-test-gate-unreached').pipe(
                Layer.provide(KeyringVerified),
                Layer.provide(SecretsCipher.layerFromEnvironment),
                Layer.provide(Layer.succeed(Environment)(env)),
              ),
            );

            const failure = Exit.isFailure(exit)
              ? Cause.squash(exit.cause)
              : undefined;
            expect(failure).toBeInstanceOf(KeyringMissing);
            expect(yield* Ref.get(built)).toEqual([]);
          }),
      );
    },
  );
});
