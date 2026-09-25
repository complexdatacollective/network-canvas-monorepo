import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Cause, Duration, Effect, Exit } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import {
  forceExpire,
  makeSyncServer,
  type SyncServer,
} from '@codaco/studio-sync/server';

import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  ownerRows,
  type Refusal,
  refusalOf,
  type TestDatabaseRuntime,
  testDb,
} from '../../__tests__/support/database.ts';
import { Database } from '../../db/client.ts';
import {
  type ScopeOptions,
  TenantScope,
  type Transaction,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';

export const storeDb = testDb;

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
export const ageQuarantine = (teamId?: string) =>
  ownerAffected(
    `UPDATE sections SET unreferenced_at = unreferenced_at - interval '1 hour'
     ${teamId === undefined ? '' : 'WHERE team_id = $1'}`,
    teamId === undefined ? [] : [teamId],
  );

type InTeam = <A, E>(
  teamId: string,
  body: Effect.Effect<A, E, Transaction>,
  options?: ScopeOptions,
) => Promise<A>;

export type StoreSchema = {
  /** The scratch schema, which every client here is pinned to. */
  schema: string;
  /** Runs one effect against the scratch schema and its clients. */
  run: TestDatabaseRuntime['run'];
  /** One statement as the connecting login: fixtures and cross-team oracles. */
  rows: <A extends object = Record<string, unknown>>(
    statement: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<ReadonlyArray<A>>;
  /** The same, counting the rows it affected. */
  affected: (
    statement: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<number>;
  /** The same, reporting what Postgres said when it refused the statement. */
  refusal: (
    statement: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<Refusal>;
  /**
   * One team-stamped transaction on the application client, which is how the
   * store is called: every function requires `Transaction`, and only a scope
   * provides it.
   *
   * A failure comes back as a rejection carrying the failure value itself —
   * `ProtocolStoreError`, `DraftStructureError`, a `SqlError` — so a case
   * still reads `await expect(...).rejects.toThrow(...)` and is asserting on
   * the store's own error rather than on a wrapper.
   */
  inTeam: InTeam;
  /**
   * The same on the harness's second application client. The first holds one
   * connection, so two transactions that must be open at once — to contend
   * for a lock in the database rather than queue for the connection — put
   * one here.
   */
  inTeamOnSecondApp: InTeam;
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
 * `rows`/`affected`/`refusal` are the connecting login, for fixtures and
 * cross-team oracles. The sync server the store is tested beside takes the
 * same `Transaction`, so both run in one scope.
 */
export async function makeStoreSchema(): Promise<StoreSchema> {
  const database = await openTestDatabase();
  try {
    await database.run(insertTeam(TEST_TEAM_ID));
  } catch (error) {
    await database.dispose();
    throw error;
  }

  // The membership these stand in for is proved by the commands in
  // production; a store suite has no command to prove it.
  const access = (teamId: string) => unsafeMakeTeamAccess(teamId, 'owner');

  const exitInTeam = <A, E>(
    teamId: string,
    body: Effect.Effect<A, E, Transaction>,
    options?: ScopeOptions,
  ) =>
    database.run(Effect.exit(TenantScope.open(access(teamId), body, options)));

  // The failure value, not a wrapper: `Cause.squash` yields the error the
  // store failed with, which is what the cases assert on.
  const settle = <A, E>(exit: Exit.Exit<A, E>): A => {
    if (Exit.isSuccess(exit)) return exit.value;
    throw Cause.squash(exit.cause);
  };

  return {
    schema: database.harness.schema,
    run: database.run,
    rows: (statement, params) => database.run(ownerRows(statement, params)),
    affected: (statement, params) =>
      database.run(ownerAffected(statement, params)),
    refusal: (statement, params) =>
      database.run(refusalOf(ownerRows(statement, params))),
    inTeam: async (teamId, body, options) =>
      settle(await exitInTeam(teamId, body, options)),
    inTeamOnSecondApp: async (teamId, body, options) =>
      settle(
        await database.run(
          Effect.exit(
            Effect.provideService(
              TenantScope.open(access(teamId), body, options),
              Database,
              database.harness.secondApp,
            ),
          ),
        ),
      ),
    exitInTeam,
    dispose: database.dispose,
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

/** Polls, as the connecting login, until some backend is blocked on a lock. */
export const waitForLockWait = Effect.fnUntraced(function* () {
  for (let attempt = 0; attempt < 200; attempt++) {
    const [row] = yield* ownerRows<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((row?.waiting ?? 0) > 0) return;
    yield* Effect.sleep(Duration.millis(25));
  }
  yield* Effect.die(new Error('no backend ever blocked on a lock'));
});
