import { randomUUID } from 'node:crypto';

import type { PgClient } from '@effect/sql-pg';
import { layer } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import type { SqlError } from 'effect/sql';
import { describe, expect } from 'vitest';

import { TEAM_GUC } from '@codaco/studio-sync/rls';

import {
  NOT_REFUSED,
  databaseNow,
  ownerRows,
  refusalOf,
  TestDatabase,
  TestDatabaseLive,
  testDb,
  maintenanceRows,
  tenantRows,
} from '../../__tests__/support/database.ts';
import {
  savepoint,
  TenantScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';
import { ERASURE_GUC } from '../../study/schema.ts';
import { refreshSessionProjections } from '../projections.ts';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

type Team = typeof TEAM_A | typeof TEAM_B;

const access = (teamId: Team) => unsafeMakeTeamAccess(teamId, 'owner');

/**
 * `RETURNING` rather than a row count: `@effect/sql-pg` surfaces the rows a
 * statement returned and not its command tag.
 */
const FINALIZE_SQL = `UPDATE interview_sessions
   SET status = 'completed', completed_at = now(),
       finish_stage_id = 'finish', finish_outcome = 'completed'
   WHERE id = $1
   RETURNING id`;

type Row = Record<string, unknown>;

type Fixture = {
  studyId: string;
  waveId: string;
  participantId: string;
  sessionId: string;
};

const protocolOf: Record<Team, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};
const versionOf: Record<Team, string> = {
  [TEAM_A]: randomUUID(),
  [TEAM_B]: randomUUID(),
};

const stateOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(refusalOf(effect), (refusal) => refusal.state);

const constraintOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(refusalOf(effect), (refusal) => refusal.constraint);

const failureOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(refusalOf(effect), (refusal) => refusal.message);

const columnList = (row: Row) =>
  Object.keys(row)
    .map((name) => `"${name}"`)
    .join(', ');

const placeholders = (row: Row) =>
  Object.keys(row)
    .map((_, index) => `$${index + 1}`)
    .join(', ');

const insert = (table: string, row: Row) =>
  ownerRows(
    `INSERT INTO ${table} (${columnList(row)})
     VALUES (${placeholders(row)})
     RETURNING 1 AS written`,
    Object.values(row),
  );

const seedTeams = Effect.gen(function* () {
  const harness = yield* TestDatabase;
  yield* harness.onOwner(
    Effect.gen(function* () {
      const { sql } = harness.owner;
      for (const teamId of [TEAM_A, TEAM_B] as const) {
        yield* sql`insert into teams (id, name, slug)
                   values (${teamId}, ${teamId}, ${teamId})
                   on conflict (id) do nothing`;
        yield* sql`insert into protocols (id, team_id, name)
                   values (${protocolOf[teamId]}, ${teamId}, ${`${teamId} protocol`})`;
        // `manifest` is jsonb and this is a raw statement, so the value goes
        // over as a JSON string.
        yield* sql`insert into protocol_versions
                     (id, protocol_id, team_id, version_number, version_hash,
                      manifest, schema_version, source_manifest_hash)
                   values (${versionOf[teamId]}, ${protocolOf[teamId]}, ${teamId},
                           1, ${`hash-${teamId}`},
                           ${JSON.stringify({ name: teamId })}, 8,
                           ${`source-${teamId}`})`;
      }
    }),
  );
});

const SeededLive = Layer.effectDiscard(seedTeams).pipe(
  Layer.provideMerge(TestDatabaseLive),
);

const newFixture = Effect.fnUntraced(function* (teamId: Team = TEAM_A) {
  const studyId = randomUUID();
  const waveId = randomUUID();
  const participantId = randomUUID();
  const sessionId = randomUUID();
  yield* insert('studies', {
    id: studyId,
    team_id: teamId,
    name: 'A study',
    protocol_id: protocolOf[teamId],
  });
  yield* insert('study_waves', {
    id: waveId,
    study_id: studyId,
    team_id: teamId,
    wave_number: 1,
    protocol_version_id: versionOf[teamId],
  });
  yield* insert('participants', {
    id: participantId,
    study_id: studyId,
    team_id: teamId,
    participant_code: `P-${participantId.slice(0, 8)}`,
  });
  yield* insert('interview_sessions', {
    id: sessionId,
    study_id: studyId,
    team_id: teamId,
    wave_id: waveId,
    participant_id: participantId,
    protocol_version_id: versionOf[teamId],
    ego_uid: `ego_${sessionId.slice(0, 8)}`,
  });
  return { studyId, waveId, participantId, sessionId } satisfies Fixture;
});

const nodeRow = (sessionId: string, overrides: Row = {}): Row => ({
  team_id: TEAM_A,
  session_id: sessionId,
  node_id: `node_${randomUUID().slice(0, 8)}`,
  type: 'person',
  ...overrides,
});

const edgeRow = (
  sessionId: string,
  fromNode: string,
  toNode: string,
  overrides: Row = {},
): Row => ({
  team_id: TEAM_A,
  session_id: sessionId,
  edge_id: `edge_${randomUUID().slice(0, 8)}`,
  type: 'friend',
  from_node: fromNode,
  to_node: toNode,
  ...overrides,
});

const snapshotRow = (fixture: Fixture, overrides: Row = {}): Row => ({
  session_id: fixture.sessionId,
  team_id: TEAM_A,
  study_id: fixture.studyId,
  protocol_version_id: versionOf[TEAM_A],
  schema_version: 8,
  payload: JSON.stringify({ nodes: [], edges: [], ego: {} }),
  payload_hash: 'sha256:deadbeef',
  ...overrides,
});

const statsRow = (fixture: Fixture, overrides: Row = {}): Row => ({
  team_id: TEAM_A,
  session_id: fixture.sessionId,
  study_id: fixture.studyId,
  wave_id: fixture.waveId,
  wave_number: 1,
  participant_id: fixture.participantId,
  node_count: 0,
  edge_count: 0,
  ...overrides,
});

const histRow = (fixture: Fixture, overrides: Row = {}): Row => ({
  team_id: TEAM_A,
  session_id: fixture.sessionId,
  degree: 0,
  node_count: 1,
  ...overrides,
});

const newNode = Effect.fnUntraced(function* (
  sessionId: string,
  overrides: Row = {},
) {
  const row = nodeRow(sessionId, overrides);
  yield* insert('nodes', row);
  return row.node_id as string;
});

const closeStudy = (studyId: string) =>
  ownerRows(
    `UPDATE studies SET state = 'closed', closed_at = now(),
         went_live_at = COALESCE(went_live_at, now()) WHERE id = $1`,
    [studyId],
  );

const SNAPSHOT_SQL = `INSERT INTO session_snapshots
     (session_id, team_id, study_id, protocol_version_id,
      schema_version, payload, payload_hash)
   SELECT s.id, s.team_id, s.study_id, s.protocol_version_id,
          v.schema_version, '{}'::jsonb, 'sha256:finalized'
   FROM interview_sessions s
   JOIN protocol_versions v
     ON v.id = s.protocol_version_id AND v.team_id = s.team_id
   WHERE s.id = $1
   RETURNING session_id`;

const SNAPSHOT_INSERT_SQL = `INSERT INTO session_snapshots
     (session_id, team_id, study_id, protocol_version_id,
      schema_version, payload, payload_hash)
   VALUES ($1, $2, $3, $4, 8, '{}'::jsonb, 'sha256:cafe')
   RETURNING session_id`;

const finalizing = <A, E, R>(
  sessionId: string,
  work: (sql: PgClient.PgClient) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | SqlError.SqlError, R | TestDatabase> =>
  Effect.flatMap(TestDatabase, (harness) =>
    harness.onOwner(
      Effect.flatMap(harness.owner.sql.unsafe(FINALIZE_SQL, [sessionId]), () =>
        work(harness.owner.sql),
      ),
    ),
  );

const finalize = (sessionId: string) =>
  finalizing(sessionId, (sql) => sql.unsafe(SNAPSHOT_SQL, [sessionId]));

const erasing = (
  participantId: string,
  statement: string,
  params: ReadonlyArray<unknown>,
) =>
  TenantScope.open(
    access(TEAM_A),
    Effect.gen(function* () {
      const { sql } = yield* Transaction;
      yield* sql`select set_config(${ERASURE_GUC}, ${participantId}, true)`;
      return yield* sql.unsafe(statement, params);
    }),
  );

const decodeInstant = Schema.decodeUnknownSync(Schema.Date);
const instantOf = (value: unknown): number => decodeInstant(value).getTime();

type RejectionCase = readonly [
  label: string,
  overrides: Row,
  constraint: string,
];

const NODE_REJECTIONS: ReadonlyArray<RejectionCase> = [
  ['a blank node id', { node_id: '' }, 'nodes_identifier_lengths_check'],
  [
    'a node id past 128 characters',
    { node_id: 'n'.repeat(129) },
    'nodes_identifier_lengths_check',
  ],
  ['a blank type', { type: '' }, 'nodes_identifier_lengths_check'],
  [
    'a type past 128 characters',
    { type: 't'.repeat(129) },
    'nodes_identifier_lengths_check',
  ],
  [
    'a stage id past 128 characters',
    { stage_id: 's'.repeat(129) },
    'nodes_identifier_lengths_check',
  ],
  [
    'scalar attributes',
    { attributes: JSON.stringify(3) },
    'nodes_attributes_object_check',
  ],
  [
    'array attributes',
    { attributes: JSON.stringify([1, 2]) },
    'nodes_attributes_object_check',
  ],
  [
    'scalar secure attributes',
    { secure_attributes: JSON.stringify('x') },
    'nodes_attributes_object_check',
  ],
];

const EDGE_REJECTIONS: ReadonlyArray<RejectionCase> = [
  ['a blank edge id', { edge_id: '' }, 'edges_identifier_lengths_check'],
  [
    'an edge id past 128 characters',
    { edge_id: 'e'.repeat(129) },
    'edges_identifier_lengths_check',
  ],
  ['a blank type', { type: '' }, 'edges_identifier_lengths_check'],
  [
    'a type past 128 characters',
    { type: 't'.repeat(129) },
    'edges_identifier_lengths_check',
  ],
  [
    'scalar attributes',
    { attributes: JSON.stringify(false) },
    'edges_attributes_object_check',
  ],
  [
    'scalar secure attributes',
    { secure_attributes: JSON.stringify(1) },
    'edges_attributes_object_check',
  ],
];

const SNAPSHOT_REJECTIONS: ReadonlyArray<readonly [label: string, Row]> = [
  ['a scalar payload', { payload: JSON.stringify(3) }],
  ['an array payload', { payload: JSON.stringify([]) }],
  ['a schema version of zero', { schema_version: 0 }],
  ['a negative schema version', { schema_version: -1 }],
  ['a blank payload hash', { payload_hash: '' }],
  ['a payload hash past 128 characters', { payload_hash: 'h'.repeat(129) }],
];

const STATS_REJECTIONS: ReadonlyArray<RejectionCase> = [
  ['a negative node count', { node_count: -1 }, 'session_stats_counts_check'],
  ['a negative edge count', { edge_count: -1 }, 'session_stats_counts_check'],
  ['a wave number of zero', { wave_number: 0 }, 'session_stats_counts_check'],
];

const HIST_REJECTIONS: ReadonlyArray<RejectionCase> = [
  ['a negative degree', { degree: -1 }, 'session_degree_hist_counts_check'],
  ['an empty bucket', { node_count: 0 }, 'session_degree_hist_counts_check'],
];

const ENDPOINT_CASES: ReadonlyArray<
  readonly [label: string, absentFrom: boolean]
> = [
  ['from_node', true],
  ['to_node', false],
];

const READ_ONLY =
  'network data for a finalized session or a closed study is read-only';
const SNAPSHOT_WINDOW =
  'a session snapshot may only be written in the transaction that finalizes its session';
const SNAPSHOT_COMPULSORY =
  'a completed interview session must carry its as-collected snapshot';

describe.skipIf(!testDb)('network schema', () => {
  layer(SeededLive, { excludeTestServices: true })(
    'over a scratch schema',
    (it) => {
      describe('nodes', () => {
        it.effect('applies the documented defaults', () =>
          Effect.gen(function* () {
            const { sessionId } = yield* newFixture();
            const nodeId = yield* newNode(sessionId);

            const rows = yield* ownerRows(
              `SELECT attributes, secure_attributes, stage_id, prompt_ids
               FROM nodes WHERE session_id = $1 AND node_id = $2`,
              [sessionId, nodeId],
            );
            expect(rows[0]).toEqual({
              attributes: {},
              secure_attributes: null,
              stage_id: null,
              prompt_ids: null,
            });
          }),
        );

        it.effect.each(NODE_REJECTIONS)(
          'rejects %s',
          ([, overrides, constraint]) =>
            Effect.gen(function* () {
              const { sessionId } = yield* newFixture();
              expect(
                yield* constraintOf(
                  insert('nodes', nodeRow(sessionId, overrides)),
                ),
              ).toBe(constraint);
            }),
        );

        it.effect('accepts a roster-format node id', () =>
          Effect.gen(function* () {
            const { sessionId } = yield* newFixture();
            const rosterId = `person_3f2a9c${randomUUID().replaceAll('-', '')}`;
            expect(
              yield* insert('nodes', nodeRow(sessionId, { node_id: rosterId })),
            ).toHaveLength(1);

            const stored = yield* ownerRows<{ node_id: string }>(
              `SELECT node_id FROM nodes WHERE session_id = $1`,
              [sessionId],
            );
            expect([...stored]).toEqual([{ node_id: rosterId }]);
          }),
        );

        it.effect(
          'round-trips secure attributes and prompt ids unchanged',
          () =>
            Effect.gen(function* () {
              const { sessionId } = yield* newFixture();
              const secureAttributes = {
                'b8b2b0e0-0000-4000-8000-000000000001': {
                  iv: [12, 0, 255, 7, 128],
                  salt: [1, 2, 3, 4, 5, 6, 7, 8],
                },
              };
              const promptIds = ['prompt-2', 'prompt-1', 'prompt-2'];
              const nodeId = yield* newNode(sessionId, {
                secure_attributes: JSON.stringify(secureAttributes),
                prompt_ids: promptIds,
                stage_id: 'stage-3',
              });

              const stored = yield* ownerRows<{
                secure_attributes: unknown;
                prompt_ids: ReadonlyArray<string>;
                stage_id: string;
              }>(
                `SELECT secure_attributes, prompt_ids, stage_id
               FROM nodes WHERE session_id = $1 AND node_id = $2`,
                [sessionId, nodeId],
              );
              expect(stored[0]?.secure_attributes).toEqual(secureAttributes);
              expect(stored[0]?.prompt_ids).toEqual(promptIds);
              expect(stored[0]?.stage_id).toBe('stage-3');
            }),
        );

        it.effect('refuses a node whose team disagrees with its session', () =>
          Effect.gen(function* () {
            const { sessionId } = yield* newFixture();
            const refusal = yield* refusalOf(
              insert('nodes', nodeRow(sessionId, { team_id: TEAM_B })),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "interview_sessions"',
            );
          }),
        );

        it.effect('refuses a second node with the same id in one session', () =>
          Effect.gen(function* () {
            const { sessionId } = yield* newFixture();
            const nodeId = yield* newNode(sessionId);
            expect(
              yield* constraintOf(
                insert('nodes', nodeRow(sessionId, { node_id: nodeId })),
              ),
            ).toBe('nodes_pkey');

            const other = yield* newFixture();
            expect(
              yield* insert(
                'nodes',
                nodeRow(other.sessionId, { node_id: nodeId }),
              ),
            ).toHaveLength(1);
          }),
        );
      });

      describe('edges', () => {
        it.effect('applies the documented defaults', () =>
          Effect.gen(function* () {
            const { sessionId } = yield* newFixture();
            const from = yield* newNode(sessionId);
            const to = yield* newNode(sessionId);
            const row = edgeRow(sessionId, from, to);
            yield* insert('edges', row);

            const stored = yield* ownerRows(
              `SELECT attributes, secure_attributes FROM edges WHERE edge_id = $1`,
              [row.edge_id],
            );
            expect(stored[0]).toEqual({
              attributes: {},
              secure_attributes: null,
            });
          }),
        );

        it.effect.each(EDGE_REJECTIONS)(
          'rejects %s',
          ([, overrides, constraint]) =>
            Effect.gen(function* () {
              const { sessionId } = yield* newFixture();
              const from = yield* newNode(sessionId);
              const to = yield* newNode(sessionId);
              expect(
                yield* constraintOf(
                  insert('edges', edgeRow(sessionId, from, to, overrides)),
                ),
              ).toBe(constraint);
            }),
        );

        it.effect('rejects an endpoint id past 128 characters', () =>
          Effect.gen(function* () {
            const { sessionId } = yield* newFixture();
            const to = yield* newNode(sessionId);
            expect(
              yield* constraintOf(
                insert('edges', edgeRow(sessionId, 'f'.repeat(129), to)),
              ),
            ).toBe('edges_identifier_lengths_check');
            expect(
              yield* constraintOf(
                insert('edges', edgeRow(sessionId, to, 't'.repeat(129))),
              ),
            ).toBe('edges_identifier_lengths_check');
          }),
        );

        it.effect.each(ENDPOINT_CASES)(
          'refuses an edge whose %s is not a node',
          ([, absentFrom]) =>
            Effect.gen(function* () {
              const { sessionId } = yield* newFixture();
              const present = yield* newNode(sessionId);
              const absent = `node_${randomUUID().slice(0, 8)}`;
              const refusal = yield* refusalOf(
                insert(
                  'edges',
                  absentFrom
                    ? edgeRow(sessionId, absent, present)
                    : edgeRow(sessionId, present, absent),
                ),
              );
              expect(refusal.state).toBe('23503');
              expect(refusal.detail).toContain(
                'is not present in table "nodes"',
              );
            }),
        );

        it.effect('refuses an endpoint that belongs to another session', () =>
          Effect.gen(function* () {
            const mine = yield* newFixture();
            const theirs = yield* newFixture();
            const local = yield* newNode(mine.sessionId);
            const foreign = yield* newNode(theirs.sessionId);

            const refusal = yield* refusalOf(
              insert('edges', edgeRow(mine.sessionId, local, foreign)),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain('is not present in table "nodes"');

            expect(
              yield* insert('edges', edgeRow(mine.sessionId, local, local)),
            ).toHaveLength(1);
          }),
        );

        it.effect('refuses an edge whose team disagrees with its session', () =>
          Effect.gen(function* () {
            const { sessionId } = yield* newFixture();
            const from = yield* newNode(sessionId);
            const to = yield* newNode(sessionId);
            const refusal = yield* refusalOf(
              insert(
                'edges',
                edgeRow(sessionId, from, to, { team_id: TEAM_B }),
              ),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "interview_sessions"',
            );
          }),
        );
      });

      describe('session_snapshots', () => {
        it.effect(
          'refuses a snapshot written outside the finalizing transaction',
          () =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();

              expect(
                yield* failureOf(
                  insert('session_snapshots', snapshotRow(fixture)),
                ),
              ).toContain(SNAPSHOT_WINDOW);

              yield* finalize(fixture.sessionId);
              yield* erasing(
                fixture.participantId,
                `DELETE FROM session_snapshots WHERE session_id = $1`,
                [fixture.sessionId],
              );
              expect(
                yield* failureOf(
                  insert('session_snapshots', snapshotRow(fixture)),
                ),
              ).toContain(SNAPSHOT_WINDOW);
            }),
        );

        it.effect(
          'refuses at commit a session finalized with no snapshot',
          () =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              const harness = yield* TestDatabase;

              expect(
                yield* failureOf(
                  harness.onOwner(
                    Effect.gen(function* () {
                      const flipped = yield* harness.owner.sql.unsafe(
                        FINALIZE_SQL,
                        [fixture.sessionId],
                      );
                      expect(flipped).toHaveLength(1);
                    }),
                  ),
                ),
              ).toContain(SNAPSHOT_COMPULSORY);

              const after = yield* ownerRows<{ status: string }>(
                `SELECT status FROM interview_sessions WHERE id = $1`,
                [fixture.sessionId],
              );
              expect(after[0]?.status).toBe('in_progress');

              expect(yield* finalize(fixture.sessionId)).toHaveLength(1);
            }),
        );

        it.effect(
          'requires the snapshot of a session inserted already completed',
          () =>
            Effect.gen(function* () {
              const { studyId, waveId } = yield* newFixture();
              const harness = yield* TestDatabase;
              const session = (id: string) => [
                id,
                studyId,
                TEAM_A,
                waveId,
                versionOf[TEAM_A],
                `ego_${id.slice(0, 8)}`,
              ];
              const insertCompleted = `INSERT INTO interview_sessions
                   (id, study_id, team_id, wave_id,
                    protocol_version_id, ego_uid, status, completed_at,
                    finish_stage_id, finish_outcome)
                 VALUES ($1, $2, $3, $4, $5, $6, 'completed', now(),
                         'finish', 'completed')`;

              const orphan = randomUUID();
              expect(
                yield* failureOf(
                  harness.onOwner(
                    harness.owner.sql.unsafe(insertCompleted, session(orphan)),
                  ),
                ),
              ).toContain(SNAPSHOT_COMPULSORY);

              const withSnapshot = randomUUID();
              yield* harness.onOwner(
                Effect.gen(function* () {
                  yield* harness.owner.sql.unsafe(
                    insertCompleted,
                    session(withSnapshot),
                  );
                  yield* harness.owner.sql.unsafe(SNAPSHOT_SQL, [withSnapshot]);
                }),
              );

              // `$1` is bound as `text[]`, so the comparison against a `uuid`
              // column names the cast.
              const stored = yield* ownerRows<{ id: string }>(
                `SELECT id FROM interview_sessions WHERE id = ANY($1::uuid[])`,
                [[orphan, withSnapshot]],
              );
              expect([...stored]).toEqual([{ id: withSnapshot }]);
            }),
        );

        it.effect('accepts a snapshot inside the finalizing transaction', () =>
          Effect.gen(function* () {
            const fixture = yield* newFixture();
            const payload = { nodes: [{ _uid: 'person_1' }], ego: { age: 41 } };
            const before = yield* databaseNow;

            expect(
              yield* finalizing(fixture.sessionId, (sql) =>
                sql.unsafe(
                  `INSERT INTO session_snapshots
                     (session_id, team_id, study_id, protocol_version_id,
                      schema_version, payload, payload_hash)
                   VALUES ($1, $2, $3, $4, 8, $5, 'sha256:cafe')
                   RETURNING session_id`,
                  [
                    fixture.sessionId,
                    TEAM_A,
                    fixture.studyId,
                    versionOf[TEAM_A],
                    JSON.stringify(payload),
                  ],
                ),
              ),
            ).toHaveLength(1);

            const stored = yield* ownerRows<{
              payload: unknown;
              created_at: unknown;
            }>(
              `SELECT payload, created_at FROM session_snapshots WHERE session_id = $1`,
              [fixture.sessionId],
            );
            expect(stored[0]?.payload).toEqual(payload);
            expect(instantOf(stored[0]?.created_at)).toBeGreaterThanOrEqual(
              before,
            );
          }),
        );

        it.effect.each(SNAPSHOT_REJECTIONS)('rejects %s', ([, overrides]) =>
          Effect.gen(function* () {
            const fixture = yield* newFixture();
            const row = snapshotRow(fixture, overrides);
            expect(
              yield* constraintOf(
                finalizing(fixture.sessionId, (sql) =>
                  sql.unsafe(
                    `INSERT INTO session_snapshots (${columnList(row)})
                     VALUES (${placeholders(row)})`,
                    Object.values(row),
                  ),
                ),
              ),
            ).toBe('session_snapshots_payload_check');
          }),
        );

        it.effect('refuses a version pin from another team', () =>
          Effect.gen(function* () {
            const fixture = yield* newFixture();
            const refusal = yield* refusalOf(
              finalizing(fixture.sessionId, (sql) =>
                sql.unsafe(SNAPSHOT_INSERT_SQL, [
                  fixture.sessionId,
                  TEAM_A,
                  fixture.studyId,
                  versionOf[TEAM_B],
                ]),
              ),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "protocol_versions"',
            );
          }),
        );

        it.effect(
          'refuses a version pin or schema version that is not the session’s',
          () =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              const otherVersionId = randomUUID();
              yield* insert('protocol_versions', {
                id: otherVersionId,
                protocol_id: protocolOf[TEAM_A],
                team_id: TEAM_A,
                version_number: 2,
                version_hash: `hash-${otherVersionId}`,
                manifest: JSON.stringify({ name: 'v2' }),
                schema_version: 9,
                source_manifest_hash: `source-${otherVersionId}`,
              });
              const snapshot = (overrides: Row) => {
                const row = snapshotRow(fixture, overrides);
                return finalizing(fixture.sessionId, (sql) =>
                  sql.unsafe(
                    `INSERT INTO session_snapshots (${columnList(row)})
                     VALUES (${placeholders(row)})
                     RETURNING session_id`,
                    Object.values(row),
                  ),
                );
              };

              expect(
                yield* failureOf(
                  snapshot({
                    protocol_version_id: otherVersionId,
                    schema_version: 9,
                  }),
                ),
              ).toContain(
                "a session snapshot must carry its session's own protocol version pin",
              );
              expect(
                yield* failureOf(snapshot({ schema_version: 9 })),
              ).toContain(
                "a session snapshot's schema version must be its protocol version's (8)",
              );
              expect(yield* snapshot({})).toHaveLength(1);
            }),
        );

        it.effect(
          'checks the snapshot under the tenant that wrote it, not the transaction’s last',
          () =>
            Effect.gen(function* () {
              const completedSession = Effect.gen(function* () {
                const { sql } = yield* Transaction;
                const studyId = randomUUID();
                const waveId = randomUUID();
                const sessionId = randomUUID();
                yield* sql.unsafe(
                  `INSERT INTO studies (id, team_id, name, protocol_id)
                   VALUES ($1, $2, 'A study', $3)`,
                  [studyId, TEAM_A, protocolOf[TEAM_A]],
                );
                yield* sql.unsafe(
                  `INSERT INTO study_waves (id, study_id, team_id, wave_number, protocol_version_id)
                   VALUES ($1, $2, $3, 1, $4)`,
                  [waveId, studyId, TEAM_A, versionOf[TEAM_A]],
                );
                yield* sql.unsafe(
                  `INSERT INTO interview_sessions
                     (id, study_id, team_id, wave_id, protocol_version_id, ego_uid,
                      status, completed_at, finish_stage_id, finish_outcome)
                   VALUES ($1, $2, $3, $4, $5, 'ego_1', 'completed', now(),
                           'finish', 'completed')`,
                  [sessionId, studyId, TEAM_A, waveId, versionOf[TEAM_A]],
                );
                yield* sql.unsafe(SNAPSHOT_SQL, [sessionId]);
              });
              const switchTeam = Effect.flatMap(
                Transaction,
                ({ sql }) =>
                  sql`select set_config(${TEAM_GUC}, ${TEAM_B}, true)`,
              );

              expect(
                yield* failureOf(
                  TenantScope.open(
                    access(TEAM_A),
                    Effect.flatMap(completedSession, () => switchTeam),
                  ),
                ),
              ).toContain(SNAPSHOT_COMPULSORY);

              expect(
                yield* stateOf(
                  TenantScope.open(
                    access(TEAM_A),
                    Effect.gen(function* () {
                      const { sql } = yield* Transaction;
                      yield* completedSession;
                      // Two statements, not one string: `@effect/sql-pg` has no
                      // simple-query path.
                      yield* sql.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
                      yield* sql.unsafe('SET CONSTRAINTS ALL DEFERRED');
                      yield* switchTeam;
                    }),
                  ),
                ),
              ).toBe(NOT_REFUSED);
            }),
        );

        it.effect(
          'always raises on UPDATE, and deletes only under the marker',
          () =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              yield* finalizing(fixture.sessionId, (sql) =>
                sql.unsafe(SNAPSHOT_INSERT_SQL, [
                  fixture.sessionId,
                  TEAM_A,
                  fixture.studyId,
                  versionOf[TEAM_A],
                ]),
              );

              expect(
                yield* failureOf(
                  ownerRows(
                    `UPDATE session_snapshots SET payload_hash = 'x' WHERE session_id = $1`,
                    [fixture.sessionId],
                  ),
                ),
              ).toContain('session snapshots are immutable');
              expect(
                yield* failureOf(
                  ownerRows(
                    `UPDATE session_snapshots SET schema_version = schema_version WHERE session_id = $1`,
                    [fixture.sessionId],
                  ),
                ),
              ).toContain('session snapshots are immutable');

              expect(
                yield* failureOf(
                  tenantRows(
                    TEAM_A,
                    `DELETE FROM session_snapshots WHERE session_id = $1`,
                    [fixture.sessionId],
                  ),
                ),
              ).toContain(
                'session snapshots are deleted only by an audited erasure or the maintenance purge',
              );
              expect(
                yield* erasing(
                  fixture.participantId,
                  `DELETE FROM session_snapshots WHERE session_id = $1
                 RETURNING session_id`,
                  [fixture.sessionId],
                ),
              ).toHaveLength(1);
            }),
        );
      });

      describe('the rollup tables', () => {
        it.effect.each(STATS_REJECTIONS)(
          'rejects session_stats with %s',
          ([, overrides, constraint]) =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              expect(
                yield* constraintOf(
                  insert('session_stats', statsRow(fixture, overrides)),
                ),
              ).toBe(constraint);
            }),
        );

        it.effect.each(HIST_REJECTIONS)(
          'rejects session_degree_hist with %s',
          ([, overrides, constraint]) =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              expect(
                yield* constraintOf(
                  insert('session_degree_hist', histRow(fixture, overrides)),
                ),
              ).toBe(constraint);
            }),
        );

        it.effect('applies the documented session_stats default', () =>
          Effect.gen(function* () {
            const fixture = yield* newFixture();
            const before = yield* databaseNow;
            yield* insert('session_stats', statsRow(fixture));
            const stored = yield* ownerRows<{ computed_at: unknown }>(
              `SELECT computed_at FROM session_stats WHERE session_id = $1`,
              [fixture.sessionId],
            );
            expect(instantOf(stored[0]?.computed_at)).toBeGreaterThanOrEqual(
              before,
            );
          }),
        );

        it.effect('refuses a wave that belongs to another study', () =>
          Effect.gen(function* () {
            const mine = yield* newFixture();
            const theirs = yield* newFixture();
            const refusal = yield* refusalOf(
              insert(
                'session_stats',
                statsRow(mine, { wave_id: theirs.waveId }),
              ),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "study_waves"',
            );
          }),
        );

        it.effect('refuses a participant that belongs to another study', () =>
          Effect.gen(function* () {
            const mine = yield* newFixture();
            const theirs = yield* newFixture();
            const refusal = yield* refusalOf(
              insert(
                'session_stats',
                statsRow(mine, { participant_id: theirs.participantId }),
              ),
            );
            expect(refusal.state).toBe('23503');
            expect(refusal.detail).toContain(
              'is not present in table "participants"',
            );
          }),
        );
      });

      describe('the statement-level parent guard', () => {
        it.effect(
          'refuses a rollup that copies another wave, wave number or participant',
          () =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              const otherWaveId = randomUUID();
              yield* insert('study_waves', {
                id: otherWaveId,
                study_id: fixture.studyId,
                team_id: TEAM_A,
                wave_number: 2,
              });
              const otherParticipantId = randomUUID();
              yield* insert('participants', {
                id: otherParticipantId,
                study_id: fixture.studyId,
                team_id: TEAM_A,
                participant_code: 'P-other',
              });
              const refused =
                "a session rollup must copy its own session's study, wave and participant";

              expect(
                yield* failureOf(
                  insert(
                    'session_stats',
                    statsRow(fixture, { wave_id: otherWaveId }),
                  ),
                ),
              ).toContain(refused);
              expect(
                yield* failureOf(
                  insert(
                    'session_stats',
                    statsRow(fixture, { wave_number: 2 }),
                  ),
                ),
              ).toContain(refused);
              expect(
                yield* failureOf(
                  insert(
                    'session_stats',
                    statsRow(fixture, { participant_id: otherParticipantId }),
                  ),
                ),
              ).toContain(refused);
              expect(
                yield* failureOf(
                  insert(
                    'session_stats',
                    statsRow(fixture, { participant_id: null }),
                  ),
                ),
              ).toContain(refused);
              expect(
                yield* insert('session_stats', statsRow(fixture)),
              ).toHaveLength(1);
            }),
        );

        it.effect('refuses node and edge writes under a closed study', () =>
          Effect.gen(function* () {
            const { studyId, sessionId } = yield* newFixture();
            const from = yield* newNode(sessionId);
            const to = yield* newNode(sessionId);
            yield* closeStudy(studyId);

            expect(
              yield* failureOf(insert('nodes', nodeRow(sessionId))),
            ).toContain(READ_ONLY);
            expect(
              yield* failureOf(insert('edges', edgeRow(sessionId, from, to))),
            ).toContain(READ_ONLY);
            expect(
              yield* failureOf(
                ownerRows(
                  `UPDATE nodes SET type = 'place' WHERE session_id = $1`,
                  [sessionId],
                ),
              ),
            ).toContain(READ_ONLY);
          }),
        );

        it.effect(
          'refuses node and edge writes under a finalized session',
          () =>
            Effect.gen(function* () {
              const { sessionId } = yield* newFixture();
              const from = yield* newNode(sessionId);
              const to = yield* newNode(sessionId);
              yield* insert('edges', edgeRow(sessionId, from, to));
              yield* finalize(sessionId);

              expect(
                yield* failureOf(insert('nodes', nodeRow(sessionId))),
              ).toContain(READ_ONLY);
              expect(
                yield* failureOf(insert('edges', edgeRow(sessionId, from, to))),
              ).toContain(READ_ONLY);

              expect(
                yield* failureOf(insert('nodes', nodeRow(sessionId))),
              ).toContain(sessionId);
            }),
        );

        it.effect(
          'lets the finalizing transaction write its own rollups and snapshot',
          () =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              const from = yield* newNode(fixture.sessionId);
              const to = yield* newNode(fixture.sessionId);
              yield* insert('edges', edgeRow(fixture.sessionId, from, to));

              expect(
                yield* TenantScope.open(
                  access(TEAM_A),
                  Effect.gen(function* () {
                    const { sql } = yield* Transaction;
                    yield* sql.unsafe(FINALIZE_SQL, [fixture.sessionId]);
                    yield* refreshSessionProjections({
                      teamId: TEAM_A,
                      sessionId: fixture.sessionId,
                    });
                    yield* sql.unsafe(SNAPSHOT_INSERT_SQL, [
                      fixture.sessionId,
                      TEAM_A,
                      fixture.studyId,
                      versionOf[TEAM_A],
                    ]);
                    return 'finalized';
                  }),
                ),
              ).toBe('finalized');

              const stats = yield* ownerRows<{ node_count: number }>(
                `SELECT node_count FROM session_stats WHERE session_id = $1`,
                [fixture.sessionId],
              );
              expect(stats[0]?.node_count).toBe(2);

              expect(
                yield* failureOf(
                  TenantScope.open(
                    access(TEAM_A),
                    refreshSessionProjections({
                      teamId: TEAM_A,
                      sessionId: fixture.sessionId,
                    }),
                  ),
                ),
              ).toContain(READ_ONLY);
            }),
        );

        it.effect(
          'freezes the as-collected rows once the finalizing transaction has taken its snapshot',
          () =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              yield* newNode(fixture.sessionId);
              const insertNode = Effect.flatMap(Transaction, ({ sql }) => {
                const row = nodeRow(fixture.sessionId);
                return sql.unsafe(
                  `INSERT INTO nodes (${columnList(row)})
                   VALUES (${placeholders(row)})`,
                  Object.values(row),
                );
              });

              expect(
                yield* TenantScope.open(
                  access(TEAM_A),
                  Effect.gen(function* () {
                    const { sql } = yield* Transaction;
                    yield* sql.unsafe(FINALIZE_SQL, [fixture.sessionId]);
                    yield* insertNode;
                    yield* sql.unsafe(SNAPSHOT_INSERT_SQL, [
                      fixture.sessionId,
                      TEAM_A,
                      fixture.studyId,
                      versionOf[TEAM_A],
                    ]);
                    yield* refreshSessionProjections({
                      teamId: TEAM_A,
                      sessionId: fixture.sessionId,
                    });
                    expect(yield* failureOf(savepoint(insertNode))).toContain(
                      READ_ONLY,
                    );
                    return 'finalized';
                  }),
                ),
              ).toBe('finalized');

              const stats = yield* ownerRows<{ node_count: number }>(
                `SELECT node_count FROM session_stats WHERE session_id = $1`,
                [fixture.sessionId],
              );
              expect(stats[0]?.node_count).toBe(2);
            }),
        );

        it.effect('holds a network row on its session and team', () =>
          Effect.gen(function* () {
            const mine = yield* newFixture();
            const theirs = yield* newFixture();
            const nodeId = yield* newNode(mine.sessionId);

            expect(
              yield* failureOf(
                ownerRows(
                  `UPDATE nodes SET session_id = $2 WHERE node_id = $1`,
                  [nodeId, theirs.sessionId],
                ),
              ),
            ).toContain('a network row cannot change session or team');
            expect(
              yield* failureOf(
                ownerRows(`UPDATE nodes SET team_id = $2 WHERE node_id = $1`, [
                  nodeId,
                  TEAM_B,
                ]),
              ),
            ).toContain('a network row cannot change session or team');

            expect(
              yield* ownerRows(
                `UPDATE nodes SET type = 'place' WHERE node_id = $1
                 RETURNING node_id`,
                [nodeId],
              ),
            ).toHaveLength(1);
          }),
        );
      });

      describe('deleting network rows', () => {
        it.effect(
          'treats an unmarked delete on a live session as an ordinary edit',
          () =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              const from = yield* newNode(fixture.sessionId);
              const to = yield* newNode(fixture.sessionId);
              yield* insert('edges', edgeRow(fixture.sessionId, from, to));

              expect(
                yield* tenantRows(
                  TEAM_A,
                  `DELETE FROM edges WHERE session_id = $1 RETURNING edge_id`,
                  [fixture.sessionId],
                ),
              ).toHaveLength(1);
              expect(
                yield* tenantRows(
                  TEAM_A,
                  `DELETE FROM nodes WHERE session_id = $1 RETURNING node_id`,
                  [fixture.sessionId],
                ),
              ).toHaveLength(2);
            }),
        );

        it.effect(
          'refuses an unmarked delete under a finalized session and admits the marked one',
          () =>
            Effect.gen(function* () {
              const fixture = yield* newFixture();
              yield* newNode(fixture.sessionId);
              yield* finalize(fixture.sessionId);

              expect(
                yield* failureOf(
                  tenantRows(
                    TEAM_A,
                    `DELETE FROM nodes WHERE session_id = $1`,
                    [fixture.sessionId],
                  ),
                ),
              ).toContain(READ_ONLY);
              expect(
                yield* erasing(
                  fixture.participantId,
                  `DELETE FROM nodes WHERE session_id = $1 RETURNING node_id`,
                  [fixture.sessionId],
                ),
              ).toHaveLength(1);
            }),
        );

        it.effect('proves the marker against the session it deletes', () =>
          Effect.gen(function* () {
            const target = yield* newFixture();
            const bystander = yield* newFixture();
            yield* newNode(target.sessionId);
            yield* newNode(bystander.sessionId);

            const bothSessions = [target.sessionId, bystander.sessionId];
            const markerRefused =
              "participant erasure may only delete the marked participant's network data";

            expect(
              yield* failureOf(
                erasing(
                  bystander.participantId,
                  `DELETE FROM nodes WHERE session_id = $1`,
                  [target.sessionId],
                ),
              ),
            ).toContain(markerRefused);
            expect(
              yield* failureOf(
                erasing(
                  target.participantId,
                  `DELETE FROM nodes WHERE session_id = ANY($1::uuid[])`,
                  [bothSessions],
                ),
              ),
            ).toContain(markerRefused);
            expect(
              yield* erasing(
                target.participantId,
                `DELETE FROM nodes WHERE session_id = $1 RETURNING node_id`,
                [target.sessionId],
              ),
            ).toHaveLength(1);

            const survivors = yield* ownerRows<{ session_id: string }>(
              `SELECT session_id FROM nodes WHERE session_id = ANY($1::uuid[])`,
              [bothSessions],
            );
            expect([...survivors]).toEqual([
              { session_id: bystander.sessionId },
            ]);
          }),
        );

        it.effect('admits the maintenance purge without a marker', () =>
          Effect.gen(function* () {
            const fixture = yield* newFixture();
            yield* newNode(fixture.sessionId);
            expect(
              yield* maintenanceRows(
                `DELETE FROM nodes WHERE session_id = $1 RETURNING node_id`,
                [fixture.sessionId],
              ),
            ).toHaveLength(1);
          }),
        );

        it.effect('lets the projection refresh rewrite its own histogram', () =>
          Effect.gen(function* () {
            const fixture = yield* newFixture();
            yield* newNode(fixture.sessionId);
            const refresh = TenantScope.open(
              access(TEAM_A),
              refreshSessionProjections({
                teamId: TEAM_A,
                sessionId: fixture.sessionId,
              }),
            );
            yield* refresh;

            expect(
              yield* tenantRows(
                TEAM_A,
                `DELETE FROM session_degree_hist WHERE session_id = $1
                 RETURNING degree`,
                [fixture.sessionId],
              ),
            ).toHaveLength(1);

            yield* refresh;
            yield* finalize(fixture.sessionId);
            expect(
              yield* failureOf(
                tenantRows(
                  TEAM_A,
                  `DELETE FROM session_degree_hist WHERE session_id = $1`,
                  [fixture.sessionId],
                ),
              ),
            ).toContain(READ_ONLY);
          }),
        );
      });

      describe('row-level security', () => {
        it.effect(
          'rejects a mismatched team before the statement guard can run',
          () =>
            Effect.gen(function* () {
              const { sessionId } = yield* newFixture(TEAM_B);

              const rejection = yield* refusalOf(
                tenantRows(
                  TEAM_A,
                  `INSERT INTO nodes (team_id, session_id, node_id, type)
                   VALUES ($1, $2, 'n1', 'person')`,
                  [TEAM_B, sessionId],
                ),
              );

              expect(rejection.state).toBe('42501');
              expect(rejection.message).toContain('row-level security policy');
              expect(rejection.message).not.toContain('read-only');

              const written = yield* ownerRows(
                `SELECT node_id FROM nodes WHERE session_id = $1`,
                [sessionId],
              );
              expect([...written]).toEqual([]);
            }),
        );
      });
    },
  );
});
