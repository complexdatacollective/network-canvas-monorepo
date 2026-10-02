import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { asc, eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import {
  MaintenanceScope,
  TenantScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';
import { STUDY_TABLES } from '../../study/schema.ts';
import {
  refreshProjectionsForSessions,
  refreshSessionProjections,
} from '../projections.ts';
import { NETWORK_TABLES } from '../schema.ts';

const { edges, nodes, sessionDegreeHist, sessionStats } = NETWORK_TABLES;
const { interviewSessions, participants, studies, studyWaves } = STUDY_TABLES;

const TEAM = 'team-a';
const ACCESS = unsafeMakeTeamAccess(TEAM, 'owner');

const OTHER_TEAM = 'team-b';

const PROTOCOL_ID = '2f9d4c11-6b0e-4a3f-8c17-9d5b4e2a1c08';
const VERSION_ID = 'c7b1e5a4-33d2-4f68-9a0c-1e8b7d6f5a42';
const OTHER_PROTOCOL_ID = '6a0f8e37-5c92-41bd-b4e3-7f2a90c5d183';
const OTHER_VERSION_ID = 'd41b6f09-8a72-4c35-91e6-0b3f8d7c2a56';

const lineFor = (team: string) =>
  team === TEAM
    ? { protocolId: PROTOCOL_ID, versionId: VERSION_ID }
    : { protocolId: OTHER_PROTOCOL_ID, versionId: OTHER_VERSION_ID };

const ownerScope = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  Effect.flatMap(TestDatabase, ({ owner, schema }) =>
    owner.db.transaction((tx) =>
      Effect.gen(function* () {
        yield* owner.sql.unsafe(`set local search_path to ${schema}`);
        return yield* body;
      }).pipe(
        Effect.provideService(
          Transaction,
          Transaction.of({ tx, sql: owner.sql, teamId: null }),
        ),
      ),
    ),
  );

const seed = Effect.fnUntraced(function* (team: string = TEAM) {
  const { protocolId, versionId } = lineFor(team);
  const harness = yield* TestDatabase;
  yield* harness.onOwner(
    Effect.gen(function* () {
      yield* harness.owner.sql`insert into teams (id, name, slug)
                               values (${team}, ${team}, ${team})
                               on conflict (id) do nothing`;
      yield* harness.owner.sql`insert into protocols (id, team_id, name)
                               values (${protocolId}, ${team}, 'protocol')
                               on conflict (id) do nothing`;
      // `manifest` is jsonb and this is a RAW statement, so the value is a
      // JSON string.
      yield* harness.owner.sql`insert into protocol_versions
                                 (id, protocol_id, team_id, version_number,
                                  version_hash, manifest, schema_version,
                                  source_manifest_hash)
                               values (${versionId}, ${protocolId}, ${team}, 1,
                                       'hash', ${JSON.stringify({ name: 'protocol' })},
                                       8, 'source')
                               on conflict (id) do nothing`;
    }),
  );
});

const newSession = Effect.fnUntraced(function* (team: string = TEAM) {
  const { protocolId, versionId } = lineFor(team);
  const studyId = randomUUID();
  const waveId = randomUUID();
  const participantId = randomUUID();
  const sessionId = randomUUID();
  yield* ownerScope(
    Effect.gen(function* () {
      const { tx } = yield* Transaction;
      yield* tx.insert(studies).values({
        id: studyId,
        teamId: team,
        name: 'A study',
        protocolId,
      });
      yield* tx.insert(studyWaves).values({
        id: waveId,
        studyId,
        teamId: team,
        waveNumber: 1,
        protocolVersionId: versionId,
      });
      yield* tx.insert(participants).values({
        id: participantId,
        studyId,
        teamId: team,
        participantCode: `P-${participantId.slice(0, 8)}`,
      });
      yield* tx.insert(interviewSessions).values({
        id: sessionId,
        studyId,
        teamId: team,
        waveId,
        participantId,
        protocolVersionId: versionId,
        egoUid: `ego_${sessionId.slice(0, 8)}`,
      });
    }),
  );
  return sessionId;
});

const addNode = (sessionId: string, nodeId: string, team: string = TEAM) =>
  ownerScope(
    Effect.flatMap(Transaction, ({ tx }) =>
      tx
        .insert(nodes)
        .values({ teamId: team, sessionId, nodeId, type: 'person' }),
    ),
  );

const addEdge = (
  sessionId: string,
  from: string,
  to: string,
  team: string = TEAM,
) =>
  ownerScope(
    Effect.flatMap(Transaction, ({ tx }) =>
      tx.insert(edges).values({
        teamId: team,
        sessionId,
        edgeId: `${from}-${to}`,
        type: 'friend',
        fromNode: from,
        toNode: to,
      }),
    ),
  );

const refresh = (sessionId: string) =>
  TenantScope.open(
    ACCESS,
    refreshSessionProjections({ teamId: TEAM, sessionId }),
  );

const readStats = (sessionId: string) =>
  ownerScope(
    Effect.flatMap(Transaction, ({ tx }) =>
      Effect.map(
        tx
          .select({
            nodeCount: sessionStats.nodeCount,
            edgeCount: sessionStats.edgeCount,
            studyId: sessionStats.studyId,
            waveId: sessionStats.waveId,
            waveNumber: sessionStats.waveNumber,
            participantId: sessionStats.participantId,
            computedAt: sessionStats.computedAt,
          })
          .from(sessionStats)
          .where(eq(sessionStats.sessionId, sessionId)),
        (rows) => rows[0],
      ),
    ),
  );

const readDegrees = (sessionId: string) =>
  ownerScope(
    Effect.flatMap(Transaction, ({ tx }) =>
      Effect.map(
        tx
          .select({
            degree: sessionDegreeHist.degree,
            nodeCount: sessionDegreeHist.nodeCount,
          })
          .from(sessionDegreeHist)
          .where(eq(sessionDegreeHist.sessionId, sessionId))
          .orderBy(asc(sessionDegreeHist.degree)),
        (rows) =>
          Object.fromEntries(rows.map((row) => [row.degree, row.nodeCount])),
      ),
    ),
  ).pipe(Effect.orDie);

/** `::int` on both: `count(*)` is a bigint. */
const readActualCounts = (sessionId: string) =>
  ownerScope(
    Effect.flatMap(Transaction, ({ tx }) =>
      Effect.map(
        tx
          .select({
            nodes: sql<number>`(SELECT count(*)::int FROM ${nodes}
                                 WHERE ${nodes.sessionId} = ${sessionId})`,
            edges: sql<number>`(SELECT count(*)::int FROM ${edges}
                                 WHERE ${edges.sessionId} = ${sessionId})`,
          })
          .from(sql`(SELECT 1) AS one`),
        (rows) => {
          const row = rows[0];
          if (!row)
            throw new Error('unreachable: scalar subqueries always return');
          return { nodes: row.nodes, edges: row.edges };
        },
      ),
    ),
  );

describe.skipIf(!testDb)('session projections', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'on a scratch schema',
    (it) => {
      it.effect(
        'agrees with the rows it summarizes, and only after the call',
        () =>
          Effect.gen(function* () {
            yield* seed();
            const sessionId = yield* newSession();
            for (const node of ['a', 'b', 'c', 'd']) {
              yield* addNode(sessionId, node);
            }
            yield* addEdge(sessionId, 'a', 'b');
            yield* addEdge(sessionId, 'b', 'c');

            expect(yield* readStats(sessionId)).toBeUndefined();
            expect(yield* readDegrees(sessionId)).toEqual({});

            yield* refresh(sessionId);

            const actual = yield* readActualCounts(sessionId);
            expect(actual).toEqual({ nodes: 4, edges: 2 });
            expect(yield* readStats(sessionId)).toMatchObject({
              nodeCount: actual.nodes,
              edgeCount: actual.edges,
              waveNumber: 1,
            });

            const degrees = yield* readDegrees(sessionId);
            expect(degrees).toEqual({ 0: 1, 1: 2, 2: 1 });
            expect(Object.values(degrees).reduce((a, b) => a + b, 0)).toBe(
              actual.nodes,
            );
          }).pipe(Effect.orDie),
      );

      it.effect(
        'leaves the rollups stale until the next call, then updates them',
        () =>
          Effect.gen(function* () {
            yield* seed();
            const sessionId = yield* newSession();
            for (const node of ['a', 'b', 'c', 'd']) {
              yield* addNode(sessionId, node);
            }
            yield* addEdge(sessionId, 'a', 'b');
            yield* addEdge(sessionId, 'b', 'c');
            yield* refresh(sessionId);
            expect(yield* readDegrees(sessionId)).toEqual({ 0: 1, 1: 2, 2: 1 });

            yield* addEdge(sessionId, 'c', 'd');

            expect(yield* readStats(sessionId)).toMatchObject({
              nodeCount: 4,
              edgeCount: 2,
            });
            expect(yield* readDegrees(sessionId)).toEqual({ 0: 1, 1: 2, 2: 1 });

            yield* refresh(sessionId);

            const actual = yield* readActualCounts(sessionId);
            expect(actual).toEqual({ nodes: 4, edges: 3 });
            expect(yield* readStats(sessionId)).toMatchObject({
              nodeCount: 4,
              edgeCount: 3,
            });
            expect(yield* readDegrees(sessionId)).toEqual({ 1: 2, 2: 2 });
          }).pipe(Effect.orDie),
      );

      it.effect('moves computed_at forward on every refresh', () =>
        Effect.gen(function* () {
          yield* seed();
          const sessionId = yield* newSession();
          yield* addNode(sessionId, 'a');
          yield* refresh(sessionId);
          const first = (yield* readStats(sessionId))?.computedAt;

          yield* addNode(sessionId, 'b');
          yield* refresh(sessionId);
          const second = (yield* readStats(sessionId))?.computedAt;

          expect(first).toBeInstanceOf(Date);
          expect(second).toBeInstanceOf(Date);
          expect(second?.getTime()).toBeGreaterThan(first?.getTime() ?? 0);
          expect(yield* readStats(sessionId)).toMatchObject({ nodeCount: 2 });
        }).pipe(Effect.orDie),
      );

      it.effect(
        'summarizes an empty session as zero rather than as nothing',
        () =>
          Effect.gen(function* () {
            yield* seed();
            const sessionId = yield* newSession();
            yield* refresh(sessionId);

            expect(yield* readStats(sessionId)).toMatchObject({
              nodeCount: 0,
              edgeCount: 0,
            });
            expect(yield* readDegrees(sessionId)).toEqual({});
          }).pipe(Effect.orDie),
      );

      it.effect('refreshes a whole set of sessions in one pass', () =>
        Effect.gen(function* () {
          yield* seed();
          const first = yield* newSession();
          const second = yield* newSession();
          const untouched = yield* newSession();
          yield* addNode(first, 'a');
          yield* addNode(second, 'a');
          yield* addNode(second, 'b');
          yield* addEdge(second, 'a', 'b');
          yield* addNode(untouched, 'a');

          yield* TenantScope.open(
            ACCESS,
            refreshProjectionsForSessions({
              teamId: TEAM,
              sessionIds: [first, second],
            }),
          );

          expect(yield* readDegrees(first)).toEqual({ 0: 1 });
          expect(yield* readDegrees(second)).toEqual({ 1: 2 });
          expect(yield* readStats(untouched)).toBeUndefined();
        }).pipe(Effect.orDie),
      );

      it.effect(
        'leaves another team\u2019s rollups alone when RLS is not in the way',
        () =>
          Effect.gen(function* () {
            yield* seed();
            yield* seed(OTHER_TEAM);
            const mine = yield* newSession();
            const theirs = yield* newSession(OTHER_TEAM);
            yield* addNode(mine, 'a');
            yield* addNode(theirs, 'a', OTHER_TEAM);
            yield* addNode(theirs, 'b', OTHER_TEAM);
            yield* addEdge(theirs, 'a', 'b', OTHER_TEAM);

            yield* refresh(mine);
            yield* TenantScope.open(
              unsafeMakeTeamAccess(OTHER_TEAM, 'owner'),
              refreshSessionProjections({
                teamId: OTHER_TEAM,
                sessionId: theirs,
              }),
            );
            expect(yield* readDegrees(theirs)).toEqual({ 1: 2 });

            yield* MaintenanceScope.open(
              refreshSessionProjections({ teamId: TEAM, sessionId: mine }),
            );
            expect(yield* readDegrees(mine)).toEqual({ 0: 1 });
            expect(yield* readDegrees(theirs)).toEqual({ 1: 2 });
          }).pipe(Effect.orDie),
      );

      it.effect('keeps one session out of the next session rollup', () =>
        Effect.gen(function* () {
          yield* seed();
          const first = yield* newSession();
          const second = yield* newSession();
          for (const node of ['a', 'b']) yield* addNode(first, node);
          yield* addEdge(first, 'a', 'b');
          yield* addNode(second, 'a');

          yield* refresh(first);
          yield* refresh(second);

          expect(yield* readStats(first)).toMatchObject({
            nodeCount: 2,
            edgeCount: 1,
          });
          expect(yield* readStats(second)).toMatchObject({
            nodeCount: 1,
            edgeCount: 0,
          });
          expect(yield* readDegrees(second)).toEqual({ 0: 1 });
        }).pipe(Effect.orDie),
      );
    },
  );
});
