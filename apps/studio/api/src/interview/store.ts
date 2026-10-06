import { randomUUID } from 'node:crypto';

import { and, eq, isNotNull, lt, ne, or, isNull, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import { ParticipantSessionStatus } from '@codaco/studio-contract/schema/participant';
import {
  StudyParticipationMode,
  StudyState,
} from '@codaco/studio-contract/schema/study';

import { sqlErrorsOnly } from '../db/errors.ts';
import { tenantTeamId, Transaction } from '../db/tenant.ts';
import { STUDY_TABLES } from '../study/schema.ts';

const { interviewLinks, interviewSessions, participants, studies, studyWaves } =
  STUDY_TABLES;

const decodeStatus = Schema.decodeUnknownSync(ParticipantSessionStatus);
const decodeStudyState = Schema.decodeUnknownSync(StudyState);
const decodeParticipationMode = Schema.decodeUnknownSync(
  StudyParticipationMode,
);

export type RedeemableLink = {
  readonly linkId: string;
  readonly studyId: string;
  readonly waveId: string;
  readonly participantId: string | null;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly studyState: StudyState;
  readonly studyPausedAt: Date | null;
  readonly pauseGraceMinutes: number;
  readonly participationMode: StudyParticipationMode;
  readonly protocolVersionId: string | null;
};

export const findLinkByTokenHash: (
  secretHash: Buffer,
) => Effect.Effect<RedeemableLink | null, SqlError.SqlError, Transaction> =
  Effect.fn('interview.store.findLinkByTokenHash')(function* (
    secretHash: Buffer,
  ) {
    const { tx } = yield* Transaction;
    const teamId = yield* tenantTeamId;
    const rows = yield* tx
      .select({
        linkId: interviewLinks.id,
        studyId: interviewLinks.studyId,
        waveId: interviewLinks.waveId,
        participantId: interviewLinks.participantId,
        expiresAt: interviewLinks.expiresAt,
        revokedAt: interviewLinks.revokedAt,
        studyState: studies.state,
        studyPausedAt: studies.pausedAt,
        pauseGraceMinutes: studies.pauseGraceMinutes,
        participationMode: studies.participationMode,
        protocolVersionId: studyWaves.protocolVersionId,
      })
      .from(interviewLinks)
      .innerJoin(
        studies,
        and(
          eq(studies.id, interviewLinks.studyId),
          eq(studies.teamId, interviewLinks.teamId),
        ),
      )
      .innerJoin(
        studyWaves,
        and(
          eq(studyWaves.id, interviewLinks.waveId),
          eq(studyWaves.teamId, interviewLinks.teamId),
        ),
      )
      .where(
        and(
          eq(interviewLinks.teamId, teamId),
          eq(interviewLinks.tokenHash, secretHash),
        ),
      )
      .for('update', { of: interviewLinks });
    const row = rows[0];
    if (row === undefined) return null;
    return {
      ...row,
      studyState: decodeStudyState(row.studyState),
      participationMode: decodeParticipationMode(row.participationMode),
    };
  }, sqlErrorsOnly);

export const recordRedemption: (
  linkId: string,
) => Effect.Effect<number, SqlError.SqlError, Transaction> = Effect.fn(
  'interview.store.recordRedemption',
)(function* (linkId: string) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeamId;
  const rows = yield* tx
    .update(interviewLinks)
    .set({
      redemptionCount: sql`${interviewLinks.redemptionCount} + 1`,
      lastRedeemedAt: sql`now()`,
    })
    .where(
      and(eq(interviewLinks.teamId, teamId), eq(interviewLinks.id, linkId)),
    )
    .returning({ redemptionCount: interviewLinks.redemptionCount });
  const row = rows[0];
  if (row === undefined) {
    return yield* Effect.die(
      new Error(`link ${linkId} vanished mid-redemption`),
    );
  }
  return row.redemptionCount;
}, sqlErrorsOnly);

export type SessionToOpen = {
  readonly linkId: string;
  readonly studyId: string;
  readonly waveId: string;
  readonly participantId: string | null;
  readonly protocolVersionId: string;
};

export type OpenedSession = {
  readonly sessionId: string;
  readonly status: ParticipantSessionStatus;
  readonly created: boolean;
};

export const findOrCreateSession: (
  input: SessionToOpen,
) => Effect.Effect<OpenedSession, SqlError.SqlError, Transaction> = Effect.fn(
  'interview.store.findOrCreateSession',
)(function* (input: SessionToOpen) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeamId;
  const inserted = yield* tx
    .insert(interviewSessions)
    .values({
      id: randomUUID(),
      studyId: input.studyId,
      teamId,
      waveId: input.waveId,
      participantId: input.participantId,
      protocolVersionId: input.protocolVersionId,
      linkId: input.linkId,
      egoUid: randomUUID(),
    })
    .onConflictDoNothing({
      target: [interviewSessions.waveId, interviewSessions.participantId],
      where: isNotNull(interviewSessions.participantId),
    })
    .returning({ id: interviewSessions.id, status: interviewSessions.status });
  const created = inserted[0];
  if (created !== undefined) {
    return {
      sessionId: created.id,
      status: decodeStatus(created.status),
      created: true,
    };
  }

  const participantId = input.participantId;
  if (participantId === null) {
    return yield* Effect.die(
      new Error('an anonymous session insert reported a conflict'),
    );
  }
  const existing = yield* tx
    .select({ id: interviewSessions.id, status: interviewSessions.status })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.teamId, teamId),
        eq(interviewSessions.waveId, input.waveId),
        eq(interviewSessions.participantId, participantId),
      ),
    )
    .for('update');
  const row = existing[0];
  if (row === undefined) {
    return yield* Effect.die(
      new Error('a session insert conflicted with no visible session'),
    );
  }
  return {
    sessionId: row.id,
    status: decodeStatus(row.status),
    created: false,
  };
}, sqlErrorsOnly);

export const issueSessionToken: (
  sessionId: string,
  secretHash: Buffer,
) => Effect.Effect<boolean, SqlError.SqlError, Transaction> = Effect.fn(
  'interview.store.issueSessionToken',
)(function* (sessionId: string, secretHash: Buffer) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeamId;
  const rows = yield* tx
    .update(interviewSessions)
    .set({ sessionTokenHash: secretHash })
    .where(
      and(
        eq(interviewSessions.teamId, teamId),
        eq(interviewSessions.id, sessionId),
        eq(interviewSessions.status, 'in_progress'),
      ),
    )
    .returning({ id: interviewSessions.id });
  return rows.length === 1;
}, sqlErrorsOnly);

export type PresentedSession = {
  readonly sessionId: string;
  readonly studyId: string;
  readonly holderEpoch: number;
  readonly status: ParticipantSessionStatus;
  readonly participantCode: string | null;
};

export const findSessionByTokenHash: (
  secretHash: Buffer,
) => Effect.Effect<PresentedSession | null, SqlError.SqlError, Transaction> =
  Effect.fn('interview.store.findSessionByTokenHash')(function* (
    secretHash: Buffer,
  ) {
    const { tx } = yield* Transaction;
    const teamId = yield* tenantTeamId;
    const rows = yield* tx
      .select({
        sessionId: interviewSessions.id,
        studyId: interviewSessions.studyId,
        holderEpoch: interviewSessions.holderEpoch,
        status: interviewSessions.status,
        participantCode: participants.participantCode,
      })
      .from(interviewSessions)
      .leftJoin(
        participants,
        and(
          eq(participants.id, interviewSessions.participantId),
          eq(participants.teamId, interviewSessions.teamId),
        ),
      )
      .where(
        and(
          eq(interviewSessions.teamId, teamId),
          eq(interviewSessions.sessionTokenHash, secretHash),
        ),
      );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      ...row,
      holderEpoch: Number(row.holderEpoch),
      status: decodeStatus(row.status),
    };
  }, sqlErrorsOnly);

export const claimHolder: (
  sessionId: string,
  holderId: string,
) => Effect.Effect<
  { readonly holderEpoch: number; readonly claimed: boolean } | null,
  SqlError.SqlError,
  Transaction
> = Effect.fn('interview.store.claimHolder')(function* (
  sessionId: string,
  holderId: string,
) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeamId;
  const claimed = yield* tx
    .update(interviewSessions)
    .set({
      holderId,
      holderEpoch: sql`${interviewSessions.holderEpoch} + 1`,
    })
    .where(
      and(
        eq(interviewSessions.teamId, teamId),
        eq(interviewSessions.id, sessionId),
        eq(interviewSessions.status, 'in_progress'),
        or(
          isNull(interviewSessions.holderId),
          ne(interviewSessions.holderId, holderId),
        ),
      ),
    )
    .returning({ holderEpoch: interviewSessions.holderEpoch });
  const bumped = claimed[0];
  if (bumped !== undefined) {
    return { holderEpoch: Number(bumped.holderEpoch), claimed: true };
  }
  const current = yield* tx
    .select({ holderEpoch: interviewSessions.holderEpoch })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.teamId, teamId),
        eq(interviewSessions.id, sessionId),
      ),
    );
  const row = current[0];
  if (row === undefined) return null;
  return { holderEpoch: Number(row.holderEpoch), claimed: false };
}, sqlErrorsOnly);

export type RevisionOutcome =
  | { readonly _tag: 'Applied'; readonly revision: bigint }
  | { readonly _tag: 'Replayed'; readonly revision: bigint }
  | { readonly _tag: 'TakenOver'; readonly holderEpoch: number }
  | { readonly _tag: 'Ended'; readonly status: ParticipantSessionStatus }
  | { readonly _tag: 'Missing' };

export const advanceRevision: (
  sessionId: string,
  presented: { readonly holderEpoch: number; readonly revision: bigint },
) => Effect.Effect<RevisionOutcome, SqlError.SqlError, Transaction> = Effect.fn(
  'interview.store.advanceRevision',
)(function* (
  sessionId: string,
  presented: { readonly holderEpoch: number; readonly revision: bigint },
) {
  const { tx } = yield* Transaction;
  const teamId = yield* tenantTeamId;
  const applied = yield* tx
    .update(interviewSessions)
    .set({
      clientRevision: presented.revision,
      lastActivityAt: sql`now()`,
    })
    .where(
      and(
        eq(interviewSessions.teamId, teamId),
        eq(interviewSessions.id, sessionId),
        eq(interviewSessions.status, 'in_progress'),
        eq(interviewSessions.holderEpoch, BigInt(presented.holderEpoch)),
        lt(interviewSessions.clientRevision, presented.revision),
      ),
    )
    .returning({ revision: interviewSessions.clientRevision });
  const row = applied[0];
  if (row !== undefined)
    return {
      _tag: 'Applied',
      revision: row.revision,
    } satisfies RevisionOutcome;

  const current = yield* tx
    .select({
      status: interviewSessions.status,
      holderEpoch: interviewSessions.holderEpoch,
      revision: interviewSessions.clientRevision,
    })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.teamId, teamId),
        eq(interviewSessions.id, sessionId),
      ),
    );
  const found = current[0];
  if (found === undefined) return { _tag: 'Missing' } satisfies RevisionOutcome;
  const status = decodeStatus(found.status);
  if (status !== 'in_progress')
    return { _tag: 'Ended', status } satisfies RevisionOutcome;
  if (found.holderEpoch !== BigInt(presented.holderEpoch)) {
    return {
      _tag: 'TakenOver',
      holderEpoch: Number(found.holderEpoch),
    } satisfies RevisionOutcome;
  }
  return {
    _tag: 'Replayed',
    revision: found.revision,
  } satisfies RevisionOutcome;
}, sqlErrorsOnly);
