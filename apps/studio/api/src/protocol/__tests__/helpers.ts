import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Cause, Duration, Effect, Exit } from 'effect';
import type { SqlError } from 'effect/sql';

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

export function makeTestSyncServer(ttlMs?: number): SyncServer {
  return makeSyncServer({ ttlMs });
}

export function expireLease(draftId: string, sectionId: string) {
  return forceExpire(draftId, sectionId);
}

export const GC_OPTS = {
  retainManifestsPerDraft: 0,
  sectionGraceMs: 60_000,
  commandRetryHorizonMs: 0,
};

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
  schema: string;
  run: TestDatabaseRuntime['run'];
  rows: <A extends object = Record<string, unknown>>(
    statement: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<ReadonlyArray<A>>;
  affected: (
    statement: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<number>;
  refusal: (
    statement: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<Refusal>;
  inTeam: InTeam;
  inTeamOnSecondApp: InTeam;
  exitInTeam: <A, E>(
    teamId: string,
    body: Effect.Effect<A, E, Transaction>,
    options?: ScopeOptions,
  ) => Promise<Exit.Exit<A, E | SqlError.SqlError>>;
  dispose: () => Promise<void>;
};

export async function makeStoreSchema(): Promise<StoreSchema> {
  const database = await openTestDatabase();
  try {
    await database.run(insertTeam(TEST_TEAM_ID));
  } catch (error) {
    await database.dispose();
    throw error;
  }

  const access = (teamId: string) => unsafeMakeTeamAccess(teamId, 'owner');

  const exitInTeam = <A, E>(
    teamId: string,
    body: Effect.Effect<A, E, Transaction>,
    options?: ScopeOptions,
  ) =>
    database.run(Effect.exit(TenantScope.open(access(teamId), body, options)));

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
    schemaVersion: 9,
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
