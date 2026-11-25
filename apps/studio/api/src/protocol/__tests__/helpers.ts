import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Cause, Duration, Effect, Exit } from 'effect';
import type { SqlError } from 'effect/sql';

import { withInterfaceText } from '@codaco/interview/supplied-wording';
import {
  type CurrentProtocol,
  CurrentProtocolSchema,
  ProtocolObjectIdSchema,
  deterministicEntityTypeId,
  deterministicVariableId,
} from '@codaco/protocol-validation';
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

/**
 * The ids of the objects in `baseProtocol()`. They are fixed so that the
 * golden hashes of that protocol stay the same from run to run.
 */
export const BASE_PROTOCOL_IDS = {
  nameGenerator: ProtocolObjectIdSchema.parse(
    '3c07e726-388f-4af2-99ce-bbe2aa1b31eb',
  ),
  nameField: ProtocolObjectIdSchema.parse(
    '2c52f7c1-5ab2-4d31-a3e4-b4291ee9db9b',
  ),
  namePrompt: ProtocolObjectIdSchema.parse(
    '99ba6512-b20d-4f89-99bb-aa137ddffbfb',
  ),
  secondPrompt: ProtocolObjectIdSchema.parse(
    'e1b0d3a4-5c6f-4e7a-8b9c-0d1e2f3a4b5c',
  ),
  sociogram: ProtocolObjectIdSchema.parse(
    '7f96f8ac-4f56-4f34-9195-dae7858b93f7',
  ),
  sociogramPrompt: ProtocolObjectIdSchema.parse(
    '691beb73-a56e-4f68-a031-fbf18b306997',
  ),
  finish: ProtocolObjectIdSchema.parse('8f480b11-39d0-4912-ade7-1d5040bf1f71'),
};

/** A node or edge type id a test can name: the same UUID for the same label. */
export const testTypeId = deterministicEntityTypeId(
  '4f0d2a6b-1c8e-4d3a-9b7f-6e2c5a1d8f30',
);

/** A variable id a test can name: the same UUID for the same label. */
export const testVariableId = deterministicVariableId(
  'a3c9e1f4-7b2d-4e8a-8c5f-0b6d4e2a9c71',
);

/** The codebook ids in `baseProtocol()`. */
export const BASE_CODEBOOK_IDS = {
  person: testTypeId('person'),
  knows: testTypeId('knows'),
  personName: testVariableId('personName'),
  layoutPosition: testVariableId('layoutPosition'),
};

// A schema parse rather than a cast: the reference fields are branded.
/**
 * A protocol as Studio stores it: holding the interface text for what it
 * shows, as every protocol Studio assembles does.
 */
export function baseProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse(
    withInterfaceText({
      name: 'Test Protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: {
        node: {
          [BASE_CODEBOOK_IDS.person]: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              [BASE_CODEBOOK_IDS.personName]: {
                name: 'Name',
                type: 'text',
                component: 'Text',
              },
              [BASE_CODEBOOK_IDS.layoutPosition]: {
                name: 'Layout_Position',
                type: 'layout',
              },
            },
          },
        },
        edge: {
          [BASE_CODEBOOK_IDS.knows]: {
            name: 'Knows',
            color: 'edge-color-seq-1',
          },
        },
      },
      stages: [
        {
          id: BASE_PROTOCOL_IDS.nameGenerator,
          type: 'NameGenerator',
          label: { en: 'Generate Names' },
          subject: { entity: 'node', type: BASE_CODEBOOK_IDS.person },
          form: {
            title: { en: 'Add person' },
            fields: [
              {
                id: BASE_PROTOCOL_IDS.nameField,
                variable: BASE_CODEBOOK_IDS.personName,
                prompt: { en: 'Enter name' },
              },
            ],
          },
          prompts: [
            {
              id: BASE_PROTOCOL_IDS.namePrompt,
              text: { en: 'Who do you know?' },
            },
          ],
        },
        {
          id: BASE_PROTOCOL_IDS.sociogram,
          type: 'Sociogram',
          label: { en: 'Sociogram' },
          subject: { entity: 'node', type: BASE_CODEBOOK_IDS.person },
          background: { concentricCircles: 4 },
          prompts: [
            {
              id: BASE_PROTOCOL_IDS.sociogramPrompt,
              text: { en: 'Position nodes' },
              layout: { layoutVariable: BASE_CODEBOOK_IDS.layoutPosition },
            },
          ],
        },
        // Every schema 9 interview ends at a finish stage.
        {
          id: BASE_PROTOCOL_IDS.finish,
          type: 'FinishSession',
          mode: 'confirmation',
          label: { en: 'Finish' },
          content: { en: '# Thank you\n\nThe interview is complete.' },
          finishedContent: {
            en: '# Interview Finished\n\nThank you for participating!',
          },
          finishLabel: { en: 'Finish' },
          finishConfirmation: { en: 'Finish this interview?' },
          finishFailed: { en: 'The interview could not be finished.' },
          outcome: 'completed',
        },
      ],
    }),
  );
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
