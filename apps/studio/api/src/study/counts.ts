import { and, eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import type { StudyCounts } from '@codaco/studio-contract/schema/study';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { PROTOCOL_TABLES } from '../protocol/schema.ts';
import { STUDY_TABLES } from './schema.ts';

const { interviewSessions, participants, studies, studyWaves } = STUDY_TABLES;
const { protocolVersions } = PROTOCOL_TABLES;

/**
 * The `::int` casts: `count(*)` is a `bigint`, which the driver decodes as a
 * JavaScript `bigint`.
 */
export const readStudyCounts: (
  studyId: string,
) => Effect.Effect<StudyCounts | undefined, SqlError.SqlError, Transaction> =
  Effect.fn('study.counts.readStudyCounts')(function* (studyId: string) {
    const { tx, teamId } = yield* Transaction;
    if (teamId === null) {
      return yield* Effect.die(
        new Error(
          'the study counts require a tenant scope; this transaction stamps no team',
        ),
      );
    }
    const rows = yield* tx
      .select({
        versions: sql<number>`(SELECT count(*)::int FROM ${protocolVersions}
                                WHERE ${protocolVersions.teamId} = ${studies.teamId}
                                  AND ${protocolVersions.protocolId} = ${studies.protocolId})`,
        participants: sql<number>`(SELECT count(*)::int FROM ${participants}
                                    WHERE ${participants.teamId} = ${studies.teamId}
                                      AND ${participants.studyId} = ${studies.id})`,
        waves: sql<number>`(SELECT count(*)::int FROM ${studyWaves}
                             WHERE ${studyWaves.teamId} = ${studies.teamId}
                               AND ${studyWaves.studyId} = ${studies.id})`,
        sessions: sql<number>`(SELECT count(*)::int FROM ${interviewSessions}
                                WHERE ${interviewSessions.teamId} = ${studies.teamId}
                                  AND ${interviewSessions.studyId} = ${studies.id})`,
      })
      .from(studies)
      .where(and(eq(studies.id, studyId), eq(studies.teamId, teamId)));

    return rows[0];
  }, sqlErrorsOnly);
