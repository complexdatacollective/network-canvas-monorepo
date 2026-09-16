import { Context, Effect, Layer } from 'effect';
import type pg from 'pg';

import type { DbEnv } from '../env.ts';
import { createMaintenancePool, createPool } from './pool.ts';

// The node-postgres pool as a scoped Effect service. The pools themselves are
// unchanged (src/db/pool.ts still decides the identity, the timeout and the
// idle-client listener); what this adds is a lifetime — a pool acquired when
// the layer is built and ended when the scope closes, rather than one created
// at module load and left to the process exiting.
//
// One service with an `identity` field rather than two tags: the web process
// and the worker each hold exactly one pool, and a consumer that cared which
// role it is talking as (garbage collection, the schema gate's diagnostics)
// can read it rather than take a different service.

type PoolIdentity = 'application' | 'maintenance';

const acquire = (identity: PoolIdentity, open: () => pg.Pool) =>
  Effect.acquireRelease(
    Effect.sync(() => DatabasePool.of({ identity, pool: open() })),
    // `end()` waits for checked-out clients to be returned, which is what
    // makes a scope close the point after which no statement of ours is in
    // flight.
    (service) => Effect.promise(() => service.pool.end()),
  );

export class DatabasePool extends Context.Service<
  DatabasePool,
  {
    readonly identity: PoolIdentity;
    readonly pool: pg.Pool;
  }
>()('@studio/DatabasePool') {
  /** Today's `createPool(db)` (application role), ended when the scope closes. */
  static readonly layerApplication = (db: DbEnv): Layer.Layer<DatabasePool> =>
    Layer.effect(
      DatabasePool,
      acquire('application', () => createPool(db)),
    );

  /** Today's `createMaintenancePool(db)` (maintenance role), ended when the scope closes. */
  static readonly layerMaintenance = (db: DbEnv): Layer.Layer<DatabasePool> =>
    Layer.effect(
      DatabasePool,
      acquire('maintenance', () => createMaintenancePool(db)),
    );
}
