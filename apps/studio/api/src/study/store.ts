import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import {
  StudyParticipationMode,
  StudyState,
} from '@codaco/studio-contract/schema/study';

import { sqlErrorsOnly } from '../db/errors.ts';
import { tenantTeamId, Transaction } from '../db/tenant.ts';
import { PROTOCOL_TABLES } from '../protocol/schema.ts';
import { STUDY_ROLE_TABLES } from './roles-schema.ts';
import { STUDY_TABLES } from './schema.ts';

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

export type StudyVisibility = {
  actorUserId: string;
  seesEveryStudy: boolean;
};

function studyVisibleToCallerSql(visibility: StudyVisibility): SQL {
  return sql`(${visibility.seesEveryStudy}::boolean OR EXISTS (
           SELECT 1 FROM ${studyRoleGrants}
           WHERE ${studyRoleGrants.teamId} = ${studies.teamId}
             AND ${studyRoleGrants.studyId} = ${studies.id}
             AND ${studyRoleGrants.userId} = ${visibility.actorUserId}))`;
}

// `::int`: `count(*)` is a `bigint`, which the driver decodes as a JavaScript
// `bigint`.
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

export const listStudies: (
  visibility: StudyVisibility,
) => Effect.Effect<StudyRow[], SqlError.SqlError, Transaction> = Effect.fn(
  'study.store.listStudies',
)(function* (visibility: StudyVisibility) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeamId;
  const rows = yield* tx
    .select(STUDY_COLUMNS)
    .from(studies)
    .where(and(eq(studies.teamId, teamId), studyVisibleToCallerSql(visibility)))
    .orderBy(desc(studies.createdAt), desc(studies.id));
  return rows.map(toStudyRow);
}, sqlErrorsOnly);

export const getStudy: (
  studyId: string,
  visibility: StudyVisibility,
) => Effect.Effect<StudyDetailRow | null, SqlError.SqlError, Transaction> =
  Effect.fn('study.store.getStudy')(function* (
    studyId: string,
    visibility: StudyVisibility,
  ) {
    const { tx } = yield* Transaction;
    const teamId = yield* tenantTeamId;
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
