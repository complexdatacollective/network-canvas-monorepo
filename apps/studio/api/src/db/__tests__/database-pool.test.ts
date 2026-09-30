import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Layer } from 'effect';
import type pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { DatabasePool } from '../database-pool.ts';

// The identity is the point: one DATABASE_URL, three roles, and a pool that
// ran as the wrong one would bypass the row-level security the whole model
// rests on. So the oracle is the database's own answer — `current_user` — and
// not which constructor was called.

const db = await reachableDb();

type CurrentUser = { user: string };

/**
 * Builds the layer, runs `use` against the pool it provides, closes the scope,
 * and hands back the pool so a caller can ask what happened to it afterwards.
 */
const withPool = Effect.fnUntraced(function* <A>(
  layer: Layer.Layer<DatabasePool>,
  use: (service: DatabasePool['Service']) => Effect.Effect<A>,
) {
  let pool: pg.Pool | undefined;
  const value = yield* Effect.scoped(
    Effect.gen(function* () {
      const service = Context.get(yield* Layer.build(layer), DatabasePool);
      pool = service.pool;
      return yield* use(service);
    }),
  );
  return { value, pool };
});

const currentUser = (service: DatabasePool['Service']) =>
  Effect.promise(() =>
    service.pool.query<CurrentUser>('select current_user as "user"'),
  ).pipe(Effect.map((result) => result.rows[0]?.user));

describe.skipIf(!db)('DatabasePool', () => {
  // Mutation: build `layerMaintenance` on `createPool` → the session runs as
  // the application role and garbage collection loses its cross-team reach.
  it.live('runs the maintenance pool as the maintenance role', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const { value } = yield* withPool(
        DatabasePool.layerMaintenance(db),
        (service) =>
          Effect.map(currentUser(service), (user) => ({
            identity: service.identity,
            user,
          })),
      );
      expect(value).toEqual({
        identity: 'maintenance',
        user: TENANT_ROLES.maintenance,
      });
    }),
  );

  // Mutation: build `layerApplication` on `createMaintenancePool` → the server
  // would run as a role row-level security does not confine.
  it.live('runs the application pool as the application role', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const { value } = yield* withPool(
        DatabasePool.layerApplication(db),
        (service) =>
          Effect.map(currentUser(service), (user) => ({
            identity: service.identity,
            user,
          })),
      );
      expect(value).toEqual({
        identity: 'application',
        user: TENANT_ROLES.app,
      });
    }),
  );

  // Mutation: drop the `pool.end()` release → the query below succeeds and the
  // process would hold its connections past the scope that owned them.
  it.live('ends the pool when the scope closes', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const { pool } = yield* withPool(
        DatabasePool.layerMaintenance(db),
        (service) => currentUser(service),
      );
      if (!pool) throw new Error('unreachable: the layer provided a pool');

      const afterClose = yield* Effect.result(
        Effect.tryPromise({
          try: () => pool.query('select 1'),
          catch: (error) => error,
        }),
      );
      expect(afterClose._tag).toBe('Failure');
    }),
  );
});
