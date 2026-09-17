import { and, eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { StudyCounts } from '@codaco/studio-contract/schema/study';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { PROTOCOL_TABLES } from '../protocol/schema.ts';
import { STUDY_TABLES } from './schema.ts';

// The numbers the study sidebar carries beside its countable destinations
// (app-shell design §5.5): published versions, participants, waves, sessions.

const { interviewSessions, participants, studies, studyWaves } = STUDY_TABLES;
const { protocolVersions } = PROTOCOL_TABLES;

/**
 * All four counts in ONE statement, driven off the study row.
 *
 * One query rather than four because the four numbers are read together and
 * shown together: separate statements would be four round trips, each in its
 * own transaction, so a wave created between the second and the third would
 * produce a sidebar whose rows disagree about which study they are describing.
 * Reading them as correlated subqueries over the single `studies` row also
 * makes the study's existence and the counts one answer — an absent row is an
 * empty result rather than four zeroes indistinguishable from a real empty
 * study.
 *
 * `versions` counts the study's PROTOCOL LINE, through `studies.protocol_id`,
 * because that is what the Versions destination lists. A `protocol_versions`
 * row exists only once a version is published, so the row count is the
 * published count; a Draft study whose `protocol_id` is still null matches
 * nothing and counts zero, which is the true answer rather than a null.
 *
 * Every subquery carries its own `team_id` predicate as well as running under
 * row-level security, following the rest of the data layer: the predicates
 * lead the team-first indexes, and they hold even where RLS is bypassed.
 *
 * The `::int` casts are what make the shape true: `count(*)` is a `bigint`,
 * which the driver's codec decodes as a JavaScript `bigint` unless it is
 * narrowed in SQL first — so without them every number here would be a value
 * the contract's `NonNegativeInt` refuses and arithmetic on it would throw.
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

    // Undefined for a study this team does not have — which, under row-level
    // security, is also every study another team does have.
    return rows[0];
  }, sqlErrorsOnly);
