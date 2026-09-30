import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import {
  StudyParticipationMode,
  StudyState,
} from '@codaco/studio-contract/schema/study';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { PROTOCOL_TABLES } from '../protocol/schema.ts';
import { STUDY_ROLE_TABLES } from './roles-schema.ts';
import { STUDY_TABLES } from './schema.ts';

/**
 * Reads over the study tier (#1262). Writes live in `commands.ts`, because
 * every one of them is audited and role-gated.
 *
 * Every statement here is a single tenant-stamped SELECT: the `studies`
 * policy already refuses another team's rows, and the explicit `team_id`
 * predicate leads the team-first index the schema declares for exactly these
 * lookups. The team comes from the open transaction rather than from an
 * argument, so it cannot disagree with the GUC the policies read.
 */

const { participants, studies, studyWaves } = STUDY_TABLES;
const { studyRoleGrants } = STUDY_ROLE_TABLES;
const { protocolDrafts } = PROTOCOL_TABLES;

export type StudyRow = {
  id: string;
  name: string;
  state: StudyState;
  participationMode: StudyParticipationMode;
  protocolId: string | null;
  createdAt: Date;
  waveCount: number;
  participantCount: number;
};

export type StudyDetailRow = StudyRow & {
  protocolDraftId: string | null;
};

/**
 * Which studies of the team the caller may see, per #1257's starter matrix:
 * a team Admin or Owner sees all of them, and a team Member sees only the
 * studies they hold a grant on. The grant probe is the query
 * `study_role_grants_team_id_user_id_idx` exists for.
 */
export type StudyVisibility = {
  actorUserId: string;
  /** True for a team Admin or Owner. */
  seesEveryStudy: boolean;
};

/**
 * #1257's visibility rule as one predicate, so every read that must obey it is
 * written from this source rather than from a copy: the study tier's own reads
 * below, and the protocol tier's, which reaches a protocol line only through a
 * study the caller can see (`protocol/store.ts`).
 *
 * A function returning `SQL` rather than a string of `$n` placeholders. The
 * string form was positional by convention — every embedding query had to bind
 * the same three values in the same order, and a query that bound them in a
 * different order still compiled — where the fragment now carries its own
 * bindings and names the `studies` columns it reads, so it can only be
 * embedded in a statement that selects from `studies`.
 *
 * A Member's visibility is the EXISTS, which is also what keeps a study nobody
 * granted them out of `studies.get`.
 */
function studyVisibleToCallerSql(visibility: StudyVisibility): SQL {
  return sql`(${visibility.seesEveryStudy}::boolean OR EXISTS (
           SELECT 1 FROM ${studyRoleGrants}
           WHERE ${studyRoleGrants.teamId} = ${studies.teamId}
             AND ${studyRoleGrants.studyId} = ${studies.id}
             AND ${studyRoleGrants.userId} = ${visibility.actorUserId}))`;
}

// Counted per study rather than joined-and-grouped: a study with no waves and
// no participants must still list, and both counts are served by the
// team-and-study indexes their tables already carry.
//
// `::int` on both: `count(*)` is a `bigint`, which the driver's codec decodes
// as a JavaScript `bigint` rather than as the number `waveCount` is typed.
const STUDY_COLUMNS = {
  id: studies.id,
  name: studies.name,
  state: studies.state,
  participationMode: studies.participationMode,
  protocolId: studies.protocolId,
  createdAt: studies.createdAt,
  waveCount: sql<number>`(SELECT count(*)::int FROM ${studyWaves}
                           WHERE ${studyWaves.teamId} = ${studies.teamId}
                             AND ${studyWaves.studyId} = ${studies.id})`,
  participantCount: sql<number>`(SELECT count(*)::int FROM ${participants}
                                  WHERE ${participants.teamId} = ${studies.teamId}
                                    AND ${participants.studyId} = ${studies.id})`,
};

/**
 * The draft the editor opens for a study's protocol line: the newest draft of
 * that line, or nothing when the study has no line or the line has no draft.
 *
 * Lateral rather than a scalar subquery so the shape survives the day it
 * carries more than one column of the draft row.
 */
const newestDraft = new QueryBuilder()
  .select({ draftId: protocolDrafts.draftId })
  .from(protocolDrafts)
  .where(
    and(
      eq(protocolDrafts.protocolId, studies.protocolId),
      eq(protocolDrafts.teamId, studies.teamId),
    ),
  )
  .orderBy(desc(protocolDrafts.createdAt), protocolDrafts.draftId)
  .limit(1)
  .as('d');

// `state` and `participation_mode` are `text` columns, so the builder hands
// them back as strings: whatever the row holds, nothing has checked it. The
// table's `studies_state_check` and `studies_participation_mode_check` are
// what make these decodes total, and a row that failed them could not have
// been committed — so a value that does not decode is a defect, not a failure
// a caller could act on.
const decodeState = Schema.decodeUnknownSync(StudyState);
const decodeParticipationMode = Schema.decodeUnknownSync(
  StudyParticipationMode,
);

type SelectedStudy = {
  id: string;
  name: string;
  state: string;
  participationMode: string;
  protocolId: string | null;
  createdAt: Date;
  waveCount: number;
  participantCount: number;
};

function toStudyRow(row: SelectedStudy): StudyRow {
  return {
    id: row.id,
    name: row.name,
    state: decodeState(row.state),
    participationMode: decodeParticipationMode(row.participationMode),
    protocolId: row.protocolId,
    createdAt: row.createdAt,
    waveCount: row.waveCount,
    participantCount: row.participantCount,
  };
}

/**
 * The team this transaction was stamped with. A study read outside a tenant
 * scope is a programming error rather than a condition a caller can recover
 * from: `MaintenanceScope.open` stamps no team precisely so a sweep can cross
 * them, and #1257's visibility rule has no meaning without one.
 */
const tenantTeam: Effect.Effect<string, never, Transaction> = Effect.flatMap(
  Transaction,
  ({ teamId }) =>
    teamId === null
      ? Effect.die(
          new Error(
            'the study store requires a tenant scope; this transaction stamps no team',
          ),
        )
      : Effect.succeed(teamId),
);

/** Newest first, the order the composite index is declared in. */
export const listStudies: (
  visibility: StudyVisibility,
) => Effect.Effect<StudyRow[], SqlError.SqlError, Transaction> = Effect.fn(
  'study.store.listStudies',
)(function* (visibility: StudyVisibility) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeam;
  const rows = yield* tx
    .select(STUDY_COLUMNS)
    .from(studies)
    .where(and(eq(studies.teamId, teamId), studyVisibleToCallerSql(visibility)))
    .orderBy(desc(studies.createdAt), desc(studies.id));
  return rows.map(toStudyRow);
}, sqlErrorsOnly);

/**
 * One study and the draft the editor opens for it. Null when the caller may
 * not see it, which callers turn into the same refusal as a study that does
 * not exist — the two are indistinguishable by construction (§6.3).
 */
export const getStudy: (
  studyId: string,
  visibility: StudyVisibility,
) => Effect.Effect<StudyDetailRow | null, SqlError.SqlError, Transaction> =
  Effect.fn('study.store.getStudy')(function* (
    studyId: string,
    visibility: StudyVisibility,
  ) {
    const { tx } = yield* Transaction;
    const teamId = yield* tenantTeam;
    const rows = yield* tx
      .select({ ...STUDY_COLUMNS, protocolDraftId: newestDraft.draftId })
      .from(studies)
      .leftJoinLateral(newestDraft, sql`true`)
      .where(
        and(
          eq(studies.teamId, teamId),
          eq(studies.id, studyId),
          studyVisibleToCallerSql(visibility),
        ),
      );
    const row = rows[0];
    if (row === undefined) return null;
    return { ...toStudyRow(row), protocolDraftId: row.protocolDraftId };
  }, sqlErrorsOnly);
