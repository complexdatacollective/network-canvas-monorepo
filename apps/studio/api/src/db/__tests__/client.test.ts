import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PgClient } from '@effect/sql-pg';
import { assert, layer } from '@effect/vitest';
import { Context, Effect, Layer, Redacted, Result } from 'effect';
import { Reactivity } from 'effect/reactivity';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { readEnv } from '../../env.ts';
import { type DatabaseConfig, OwnerDatabase } from '../client.ts';
import { isMissingRole, sqlState } from '../errors.ts';
import {
  MaintenanceScope,
  TenantScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../tenant.ts';

const TEAM = unsafeMakeTeamAccess('team-identity', 'owner');

type Identity = { readonly current: string; readonly session: string };

const identityQuery = Effect.flatMap(Transaction, ({ sql }) =>
  Effect.map(
    sql<Identity>`select current_user as current, session_user as session`,
    (rows) => rows[0],
  ),
);

describe.skipIf(!testDb)('the three database clients', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'over a scratch schema',
    (it) => {
      it.effect('run a tenant scope as the application role', () =>
        Effect.gen(function* () {
          const identity = yield* TenantScope.open(TEAM, identityQuery);
          assert.strictEqual(identity?.current, TENANT_ROLES.app);
          assert.notStrictEqual(identity?.current, identity?.session);
        }),
      );

      it.effect('run a maintenance scope as the maintenance role', () =>
        Effect.gen(function* () {
          const identity = yield* MaintenanceScope.open(identityQuery);
          assert.strictEqual(identity?.current, TENANT_ROLES.maintenance);
          assert.notStrictEqual(identity?.current, identity?.session);
        }),
      );

      it.effect('leave the owner as the connecting login', () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const identity = yield* harness.onOwner(
            Effect.map(
              harness.owner
                .sql<Identity>`select current_user as current, session_user as session`,
              (rows) => rows[0],
            ),
          );
          assert.strictEqual(identity?.current, identity?.session);
          assert.notStrictEqual(identity?.current, TENANT_ROLES.app);
          assert.notStrictEqual(identity?.current, TENANT_ROLES.maintenance);
        }),
      );

      it.effect('refuse a connection whose role the database lacks', () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const absent = `${TENANT_ROLES.app}_absent_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
          const connectingAs = <A, E>(
            role: string,
            body: (sql: PgClient.PgClient) => Effect.Effect<A, E>,
          ) =>
            Effect.scoped(
              Effect.flatMap(
                PgClient.make({
                  url: Redacted.make(testDb!.url),
                  maxConnections: 1,
                  startupParameters: { role, search_path: harness.schema },
                }),
                body,
              ),
            ).pipe(Effect.provide(Reactivity.layer));

          const refused = yield* Effect.result(
            connectingAs(
              absent,
              (sql) => sql`insert into teams (id, name, slug)
                           values ('never', 'never', 'never')`,
            ),
          );

          assert.isTrue(Result.isFailure(refused));
          if (Result.isFailure(refused)) {
            assert.strictEqual(sqlState(refused.failure), '22023');
            assert.isTrue(isMissingRole(refused.failure));
          }

          const rows = yield* harness.onOwner(
            harness.owner.sql<{
              id: string;
            }>`select id from teams where id = 'never'`,
          );
          assert.deepStrictEqual(rows, []);

          const pinned = yield* connectingAs(TENANT_ROLES.app, (sql) =>
            Effect.map(
              sql<{ current: string }>`select current_user as current`,
              (pinnedRows) => pinnedRows[0]?.current,
            ),
          );
          assert.strictEqual(pinned, TENANT_ROLES.app);
        }),
      );

      it.effect('rereads its password file for every new connection', () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const login = `pw_rotate_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
          const file = join(
            mkdtempSync(join(tmpdir(), 'studio-password-')),
            'password',
          );
          writeFileSync(file, 'one\n');
          yield* harness.onOwner(
            harness.owner.sql.unsafe(
              `create role ${login} login password 'one'`,
            ),
          );
          const url = new URL(testDb!.url);
          url.username = login;
          url.password = 'one';

          const currentUser = (client: OwnerDatabase['Service']) =>
            Effect.map(
              client.sql<{ who: string }>`select current_user as who`,
              (rows) => rows[0]?.who,
            );
          const terminate = harness.onOwner(
            harness.owner
              .sql`select pg_terminate_backend(pid) from pg_stat_activity where usename = ${login}`,
          );

          yield* Effect.gen(function* () {
            const build = (config: DatabaseConfig) =>
              Effect.map(
                Layer.build(
                  OwnerDatabase.layer({ ...config, maxConnections: 1 }),
                ),
                (context) => Context.get(context, OwnerDatabase),
              );
            const rereads = yield* build({ url: url.href, passwordFile: file });
            const bootRead = yield* build({ url: url.href });
            assert.strictEqual(yield* currentUser(rereads), login);
            assert.strictEqual(yield* currentUser(bootRead), login);

            yield* harness.onOwner(
              harness.owner.sql.unsafe(`alter role ${login} password 'two'`),
            );
            writeFileSync(file, 'two\n');
            yield* terminate;

            const reconnected = (client: OwnerDatabase['Service']) =>
              Effect.result(
                currentUser(client).pipe(Effect.retry({ times: 3 })),
              );
            const rotated = yield* reconnected(rereads);
            assert.isTrue(Result.isSuccess(rotated));
            if (Result.isSuccess(rotated)) {
              assert.strictEqual(rotated.success, login);
            }
            const stale = yield* reconnected(bootRead);
            assert.isTrue(Result.isFailure(stale));
            if (Result.isFailure(stale)) {
              assert.strictEqual(sqlState(stale.failure), '28P01');
            }
          }).pipe(
            Effect.scoped,
            Effect.ensuring(
              Effect.orDie(
                Effect.andThen(
                  terminate,
                  harness.onOwner(
                    harness.owner.sql.unsafe(`drop role if exists ${login}`),
                  ),
                ),
              ),
            ),
          );
        }),
      );
    },
  );
});

describe('a DATABASE_URL that carries pg options', () => {
  const BASE = 'postgres://postgres:spike@127.0.0.1:54318/studio_dev';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('is refused even when it only sets a search path', () => {
    vi.stubEnv(
      'DATABASE_URL',
      `${BASE}?options=-c%20search_path%3Dstudio_test_scratch`,
    );
    expect(() => readEnv()).toThrow(
      /DATABASE_URL must not carry an `options` parameter/,
    );
  });

  test('is accepted without it', () => {
    vi.stubEnv('DATABASE_URL', BASE);
    expect(readEnv().db?.url).toStrictEqual(BASE);
  });
});
