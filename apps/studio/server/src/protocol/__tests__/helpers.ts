import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Cause, type Effect, Exit, ManagedRuntime } from 'effect';
import type { SqlError } from 'effect/unstable/sql';
import type pg from 'pg';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import {
  forceExpire,
  makeSyncServer,
  type SyncServer,
} from '@codaco/studio-sync/server';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { Database } from '../../db/client.ts';
import {
  type ScopeOptions,
  TenantScope,
  type Transaction,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';

export const storeDb = await reachableDb();

export const TEST_TEAM_ID = 'team-test';

/**
 * The bare sync state machine, with no section validation — what a case uses
 * to write a document Studio's own validator would refuse, so the store can
 * then be asked what it makes of it. `createProtocolSyncServer` is the
 * validating one, and the cases that want a refusal build that instead.
 *
 * It takes no database handle now: every operation requires the caller's
 * `Transaction`, so it runs in the same scope as the store.
 */
export function makeTestSyncServer(ttlMs?: number): SyncServer {
  return makeSyncServer({ ttlMs });
}

/** Simulates a slept laptop by expiring a lease in place. */
export function expireLease(draftId: string, sectionId: string) {
  return forceExpire(draftId, sectionId);
}

export const GC_OPTS = {
  retainManifestsPerDraft: 0,
  sectionGraceMs: 60_000,
  commandRetryHorizonMs: 0,
};

/** Backdates the sweep quarantine so a GC run can collect immediately. */
export async function ageQuarantine(
  db: pg.Pool,
  teamId?: string,
): Promise<void> {
  await db.query(
    `UPDATE sections SET unreferenced_at = unreferenced_at - interval '1 hour'
     ${teamId === undefined ? '' : 'WHERE team_id = $1'}`,
    teamId === undefined ? [] : [teamId],
  );
}

export type StoreSchema = {
  /** The connecting login: fixtures, oracles, and the cross-team reads. */
  db: pg.Pool;
  /** The application role's node-postgres pool, which the sync server uses. */
  app: pg.Pool;
  maintenance: pg.Pool;
  /** The scratch schema, which every client here is pinned to. */
  schema: string;
  /**
   * One team-stamped transaction on the **Effect** application client, which
   * is how the store is called now: every function requires `Transaction`,
   * and only a scope provides it.
   *
   * A failure comes back as a rejection carrying the failure value itself —
   * `ProtocolStoreError`, `DraftStructureError`, a `SqlError` — so a case
   * still reads `await expect(...).rejects.toThrow(...)` and is asserting on
   * the store's own error rather than on a wrapper.
   */
  inTeam: <A, E>(
    teamId: string,
    body: Effect.Effect<A, E, Transaction>,
    options?: ScopeOptions,
  ) => Promise<A>;
  /** The same transaction, as an `Exit`, for a case that inspects rollback. */
  exitInTeam: <A, E>(
    teamId: string,
    body: Effect.Effect<A, E, Transaction>,
    options?: ScopeOptions,
  ) => Promise<Exit.Exit<A, E | SqlError.SqlError>>;
  dispose: () => Promise<void>;
};

/**
 * The store under test runs as the application role, as it does in Studio;
 * `db` is the connecting login, for fixtures and cross-team oracles.
 *
 * Two clients over one scratch schema, deliberately: the protocol store is an
 * Effect over `@effect/sql-pg` now, and the sync server it is tested beside is
 * still node-postgres over a `TenantDb`. The schema is the seam — the Effect
 * client is pinned to it with `searchPath` (fallback A, #1927 §20 Q6), which
 * is the same stand-in `__tests__/support/database.ts` uses, and the pg pools
 * carry it on the connection string.
 */
export async function makeStoreSchema(): Promise<StoreSchema> {
  if (!storeDb) throw new Error('unreachable: probe guaranteed a database');
  const db = storeDb;
  const scratch = await createScratchSchema(db);
  let schema: string;
  try {
    await provisionScratchSchema(scratch.pool);
    await seedTeam(scratch.pool, TEST_TEAM_ID);
    const current = await scratch.pool.query<{ schema: string }>(
      'select current_schema() as schema',
    );
    const name = current.rows[0]?.schema;
    if (name === undefined) throw new Error('no current schema');
    schema = name;
  } catch (error) {
    await scratch.dispose();
    throw error;
  }

  // Two connections: a case that holds a row lock in one transaction and
  // waits for it in another needs both at once.
  const runtime = ManagedRuntime.make(
    Database.layer({
      url: db.url,
      maxConnections: 2,
      applicationName: 'studio-protocol-store-test',
      searchPath: schema,
    }),
  );

  // The membership these stand in for is proved by the commands in
  // production; a store suite has no command to prove it.
  const access = (teamId: string) => unsafeMakeTeamAccess(teamId, 'owner');

  const exitInTeam = <A, E>(
    teamId: string,
    body: Effect.Effect<A, E, Transaction>,
    options?: ScopeOptions,
  ) => runtime.runPromiseExit(TenantScope.open(access(teamId), body, options));

  const inTeam = async <A, E>(
    teamId: string,
    body: Effect.Effect<A, E, Transaction>,
    options?: ScopeOptions,
  ): Promise<A> => {
    const exit = await exitInTeam(teamId, body, options);
    if (Exit.isSuccess(exit)) return exit.value;
    // The failure value, not a wrapper: `Cause.squash` yields the error the
    // store failed with, which is what the cases assert on.
    throw Cause.squash(exit.cause);
  };

  return {
    db: scratch.pool,
    app: scratch.app,
    maintenance: scratch.maintenance,
    schema,
    inTeam,
    exitInTeam,
    dispose: async () => {
      await runtime.dispose();
      await scratch.dispose();
    },
  };
}

// Resolved through the exports map so that changing a fixture invalidates this
// suite's Turbo cache.
export function readFixtureProtocol(specifier: string): CurrentProtocol {
  const resolved = import.meta.resolve(specifier);
  return JSON.parse(
    readFileSync(fileURLToPath(resolved), 'utf8'),
  ) as CurrentProtocol;
}

export const FIXTURES = [
  '@codaco/protocols/e2e/all-interfaces/protocol.json',
  '@codaco/protocols/sample',
  '@codaco/protocols/development',
] as const;

export function baseProtocol(): CurrentProtocol {
  return {
    name: 'Test Protocol',
    schemaVersion: 8,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            personName: {
              name: 'Name',
              type: 'text',
              component: 'Text',
            },
            layoutPosition: {
              name: 'Layout_Position',
              type: 'layout',
            },
          },
        },
      },
      edge: {
        knows: {
          name: 'Knows',
          color: 'edge-color-seq-1',
        },
      },
    },
    stages: [
      {
        id: 'nameGenerator1',
        type: 'NameGenerator',
        label: 'Generate Names',
        subject: { entity: 'node', type: 'person' },
        form: {
          title: 'Add person',
          fields: [{ variable: 'personName', prompt: 'Enter name' }],
        },
        prompts: [{ id: 'prompt1', text: 'Who do you know?' }],
      },
      {
        id: 'sociogram1',
        type: 'Sociogram',
        label: 'Sociogram',
        subject: { entity: 'node', type: 'person' },
        background: { concentricCircles: 4 },
        prompts: [
          {
            id: 'socPrompt1',
            text: 'Position nodes',
            layout: { layoutVariable: 'layoutPosition' },
          },
        ],
      },
    ],
    // Branded reference fields make this literal uncastable directly.
  } as unknown as CurrentProtocol;
}

export async function waitForLockWait(db: pg.Pool): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await db.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((res.rows[0] as { waiting: number }).waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('no backend ever blocked on a lock');
}
