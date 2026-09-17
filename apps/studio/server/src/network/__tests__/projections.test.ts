// The rollup tables are maintained by application code rather than by a
// database trigger (design S6), so the agreement between `session_stats`,
// `session_degree_hist` and the rows they summarize is a property this suite
// has to prove rather than one the database enforces.
//
// Every case therefore carries its own oracle: the counts are read before the
// refresh as well as after, so a `refreshSessionProjections` that stopped
// writing — or that wrote the wrong distribution — cannot pass as "no error".
//
// The oracle reads go through the drizzle builder on the connecting login's
// own transaction rather than through raw statements, for one reason beyond
// symmetry with the store suites: `@effect/sql-pg` rc.115 hands a `timestamptz`
// back from a raw statement as epoch milliseconds, and `computed_at` is the
// column the third case compares across two refreshes.
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

/** A second tenant, for the one case that asks what a cross-team sweep sees. */
const OTHER_TEAM = 'team-b';

/** The protocol line every fixture wave pins, one per team. */
const PROTOCOL_ID = '2f9d4c11-6b0e-4a3f-8c17-9d5b4e2a1c08';
const VERSION_ID = 'c7b1e5a4-33d2-4f68-9a0c-1e8b7d6f5a42';
const OTHER_PROTOCOL_ID = '6a0f8e37-5c92-41bd-b4e3-7f2a90c5d183';
const OTHER_VERSION_ID = 'd41b6f09-8a72-4c35-91e6-0b3f8d7c2a56';

/** The protocol line and version ids belonging to one team. */
const lineFor = (team: string) =>
  team === TEAM
    ? { protocolId: PROTOCOL_ID, versionId: VERSION_ID }
    : { protocolId: OTHER_PROTOCOL_ID, versionId: OTHER_VERSION_ID };

/**
 * One transaction as the connecting login, carrying the `Transaction` service
 * the builder needs. There is no `OwnerScope` — the owner is not a tenant
 * identity and stamps no team — so the fixtures and the oracles open it here,
 * pinning the same search path `TestDatabase.onOwner` does.
 */
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

/** The team and the protocol line the fixtures hang off. Idempotent. */
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
      // JSON string; through the builder it would be a plain object and
      // stringifying it here would double-encode.
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

/** A study, a wave, a participant and an in-progress session for them. */
const newSession = Effect.fnUntraced(function* (team: string = TEAM) {
  const { protocolId, versionId } = lineFor(team);
  const studyId = randomUUID();
  const waveId = randomUUID();
  const participantId = randomUUID();
  const sessionId = randomUUID();
  yield* ownerScope(
    Effect.gen(function* () {
      const { tx } = yield* Transaction;
      // The study names the protocol line and the wave pins its version:
      // `study_waves_version_own_line` refuses a pin whose study has no line,
      // and `interview_sessions_version_wave_pin` refuses a session under a
      // wave that pins nothing.
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

/** The call under test, in a tenant transaction exactly as production runs it. */
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

/**
 * The truth the projections are supposed to agree with. `::int` on both:
 * `count(*)` is a bigint, which the codec decodes as a JavaScript `bigint`.
 */
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
            // a-b, b-c over four nodes: degrees a=1, b=2, c=1, d=0.
            for (const node of ['a', 'b', 'c', 'd']) {
              yield* addNode(sessionId, node);
            }
            yield* addEdge(sessionId, 'a', 'b');
            yield* addEdge(sessionId, 'b', 'c');

            // The oracle: nothing maintains these tables but the call below,
            // so before it there is no row at all. A trigger doing the work
            // would fail here.
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
            // Every node is counted exactly once, isolates included.
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

            // The stale window is the oracle for the second half: the write
            // alone does not maintain the projection, so a caller that forgets
            // the refresh ships wrong numbers rather than an error.
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
            // a=1, b=2, c=2, d=1: the degree-0 bucket is gone rather than left
            // behind, which is what the delete-then-reinsert exists for.
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
            // No node has a degree, so the histogram is empty — the counts check
            // on `session_degree_hist` forbids a zero-node bucket.
            expect(yield* readDegrees(sessionId)).toEqual({});
          }).pipe(Effect.orDie),
      );

      // The bulk path, which is the reason the three statements take a SET of
      // sessions rather than one: the ids are bound as one array parameter, so
      // the statement text is the same shape whether it names one session or
      // three hundred.
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
          // Named sessions only: a set that widened to every session of the
          // team would have built this one too.
          expect(yield* readStats(untouched)).toBeUndefined();
        }).pipe(Effect.orDie),
      );

      // The DELETE carries an explicit team predicate as well as running under
      // row-level security, and the predicate is the half that matters here:
      // the bulk path (the synthetic-data seed) runs as an identity the
      // policies do not constrain, so a delete keyed on the session alone
      // would reach across the tenant boundary the first time two teams'
      // sessions were refreshed in one run.
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

            // Both rollups built, each in its own tenant scope.
            yield* refresh(mine);
            yield* TenantScope.open(
              unsafeMakeTeamAccess(OTHER_TEAM, 'owner'),
              refreshSessionProjections({
                teamId: OTHER_TEAM,
                sessionId: theirs,
              }),
            );
            expect(yield* readDegrees(theirs)).toEqual({ 1: 2 });

            // Now the sweep: a maintenance scope stamps no team, so the policies
            // step aside and only the statement's own predicate is left.
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
