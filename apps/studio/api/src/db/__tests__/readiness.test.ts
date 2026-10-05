import { assert, layer } from '@effect/vitest';
import { Cause, Context, Effect, Layer } from 'effect';
import type { SqlClient } from 'effect/sql';
import type pg from 'pg';
import { describe } from 'vitest';

import { testDb } from '../../__tests__/support/database.ts';
import { createScratchDatabase } from '../../__tests__/support/postgres.ts';
import type { DbEnv } from '../../env.ts';
import { OwnerDatabase } from '../client.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import {
  databaseAlive,
  migrationLockHeld,
  schemaVerdict,
} from '../readiness.ts';
import { SCHEMA_LOCK_KEY, stampFingerprint } from '../schema.ts';

class Scratch extends Context.Service<
  Scratch,
  {
    readonly pool: pg.Pool;
    readonly sql: SqlClient.SqlClient;
  }
>()('@studio/db/test/ReadinessScratch') {}

const scratchDatabase = (db: DbEnv) =>
  Effect.acquireRelease(
    Effect.promise(() => createScratchDatabase(db)),
    (scratch) => Effect.promise(() => scratch.dispose()),
  );

const ScratchLive = (db: DbEnv) =>
  Layer.effect(
    Scratch,
    Effect.gen(function* () {
      const scratch = yield* scratchDatabase(db);
      const clients = yield* Layer.build(
        Layer.orDie(
          OwnerDatabase.layer({
            url: scratch.db.url,
            maxConnections: 1,
            applicationName: 'studio-test-readiness',
          }),
        ),
      );
      return Scratch.of({
        pool: scratch.pool,
        sql: Context.get(clients, OwnerDatabase).sql,
      });
    }),
  );

const holding = (pool: pg.Pool, key: number) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const session = await pool.connect();
      await session.query('select pg_advisory_lock($1)', [key]);
      return session;
    }),
    (session) =>
      Effect.promise(async () => {
        await session.query('select pg_advisory_unlock($1)', [key]);
        session.release();
      }),
  );

const timedOut = <A, E, R>(probe: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(probe), (error) => Cause.isTimeoutError(error));

describe.skipIf(!testDb)('the database readiness probes', () => {
  layer(ScratchLive(testDb!), { excludeTestServices: true })(
    'on a scratch database',
    (it) => {
      it.effect('answer liveness with a statement', () =>
        Effect.gen(function* () {
          const { sql } = yield* Scratch;
          yield* databaseAlive(sql);
        }),
      );

      it.effect('give up on liveness after a second on an exhausted pool', () =>
        Effect.scoped(
          Effect.gen(function* () {
            const { sql } = yield* Scratch;
            yield* sql.reserve;
            assert.isTrue(yield* timedOut(databaseAlive(sql)));
          }),
        ),
      );

      it.effect('see the migration lock only while a session holds it', () =>
        Effect.gen(function* () {
          const { pool, sql } = yield* Scratch;
          assert.isFalse(yield* migrationLockHeld(sql));
          yield* Effect.scoped(
            Effect.andThen(holding(pool, SCHEMA_LOCK_KEY), () =>
              Effect.map(migrationLockHeld(sql), (held) => assert.isTrue(held)),
            ),
          );
          assert.isFalse(yield* migrationLockHeld(sql));
        }),
      );

      it.effect('ignore advisory locks on other keys', () =>
        Effect.scoped(
          Effect.gen(function* () {
            const { pool, sql } = yield* Scratch;
            yield* holding(pool, SCHEMA_LOCK_KEY + 1);
            yield* holding(pool, SCHEMA_LOCK_KEY % 2 ** 32);
            assert.isFalse(yield* migrationLockHeld(sql));
          }),
        ),
      );

      it.effect('ignore the migration lock held in another database', () =>
        Effect.scoped(
          Effect.gen(function* () {
            const { sql } = yield* Scratch;
            const other = yield* scratchDatabase(testDb!);
            yield* holding(other.pool, SCHEMA_LOCK_KEY);
            assert.isFalse(yield* migrationLockHeld(sql));
          }),
        ),
      );

      // Last: the timed-out read is still waiting on the server until the
      // holder lets go, and the client has one connection.
      it.effect('report the fingerprint verdict, bounded to a second', () =>
        Effect.gen(function* () {
          const { pool, sql } = yield* Scratch;
          assert.deepStrictEqual(yield* schemaVerdict(sql), {
            kind: 'absent',
          });

          yield* Effect.promise(async () => {
            await pool.query(
              `create table "schemaFingerprint" (
                 id boolean primary key default true,
                 fingerprint text not null,
                 "appliedAt" timestamptz not null default now())`,
            );
            await stampFingerprint(pool, SCHEMA_FINGERPRINT);
          });
          assert.deepStrictEqual(yield* schemaVerdict(sql), {
            kind: 'current',
          });

          const locker = yield* Effect.promise(() => pool.connect());
          yield* Effect.promise(() =>
            locker.query(
              'begin; lock table "schemaFingerprint" in access exclusive mode',
            ),
          );
          const verdict = yield* timedOut(schemaVerdict(sql)).pipe(
            Effect.ensuring(
              Effect.promise(async () => {
                await locker.query('rollback');
                locker.release();
              }),
            ),
          );
          assert.isTrue(verdict);
        }),
      );
    },
  );
});
