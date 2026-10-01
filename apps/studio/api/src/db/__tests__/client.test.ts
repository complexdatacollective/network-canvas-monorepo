import { randomUUID } from 'node:crypto';

import { PgClient } from '@effect/sql-pg';
import { assert, layer } from '@effect/vitest';
import { Effect, Redacted, Result } from 'effect';
import { Reactivity } from 'effect/reactivity';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { readEnv } from '../../env.ts';
import { isMissingRole, sqlState } from '../errors.ts';
import {
  MaintenanceScope,
  TenantScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../tenant.ts';

// One `DATABASE_URL`, three identities (#1927 section 9). What the three
// clients differ in is the role their transactions run as, and nothing else
// asserts that: `roleFor` is a pure function, so only a connection can say
// whether the role was pinned on the server.
//
// `session_user` is the oracle rather than a spelled-out login name. It is the
// role the connection authenticated as and the startup role never changes it,
// so `current_user <> session_user` is the pin having happened, on whatever
// machine and under whatever login the suite runs.

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
          // The pin is what moved it off the connecting login; without the
          // startup role both would read the same.
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
          // Named explicitly as well: "unchanged" would also hold if the two
          // had both been moved to a tenant role.
          assert.notStrictEqual(identity?.current, TENANT_ROLES.app);
          assert.notStrictEqual(identity?.current, TENANT_ROLES.maintenance);
        }),
      );

      // The role is a startup parameter (`client.ts`), so a role the database
      // does not have is refused at connect, before the body's first
      // statement.
      //
      // The absent role is named *from* the application role rather than
      // being it: Postgres roles are cluster-wide, so `studio_app` cannot be
      // made to not exist for one connection while every other suite in the
      // run is connecting as it. The derived name reaches the same refusal —
      // a 22023 whose message names a tenant role — which is the whole of
      // what `isMissingRole` reads.
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

          // The row the refused body would have written is not there, which is
          // what "nothing in the body can run" means.
          const rows = yield* harness.onOwner(
            harness.owner.sql<{
              id: string;
            }>`select id from teams where id = 'never'`,
          );
          assert.deepStrictEqual(rows, []);

          // The control: the same connection with the role the database does
          // have succeeds, so the refusal above is the missing role and not
          // the connection itself.
          const pinned = yield* connectingAs(TENANT_ROLES.app, (sql) =>
            Effect.map(
              sql<{ current: string }>`select current_user as current`,
              (pinnedRows) => pinnedRows[0]?.current,
            ),
          );
          assert.strictEqual(pinned, TENANT_ROLES.app);
        }),
      );
    },
  );
});

// The harness sets its `search_path` as a startup parameter through
// `DatabaseConfig`, never through `options` on the connection string:
// `env/resolve.ts` refuses a `DATABASE_URL` that carries one, because the same
// parameter could also set the role every client depends on.
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
