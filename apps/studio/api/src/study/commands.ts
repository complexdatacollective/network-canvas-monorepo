import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Effect, Redacted, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import type { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import type { NotFound } from '@codaco/studio-contract/schema/errors';
import {
  StudyName,
  type StudyParticipationMode,
} from '@codaco/studio-contract/schema/study';
import type { SectionValidationFailedError } from '@codaco/studio-sync/section-validation';

import {
  audited,
  auditable,
  type AuditEvents,
  changed,
  unchanged,
} from '../audit/audited.ts';
import {
  type DeniedAttempts,
  reservedDenial,
} from '../audit/denial-rate-limit.ts';
import type { AuditSignal } from '../audit/signal.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnly, sqlErrorsOnlyBeside } from '../db/errors.ts';
import { type TeamAccess, Transaction } from '../db/tenant.ts';
import type { RequestId } from '../http/middleware/request-id.ts';
import type { Jobs } from '../jobs/jobs.ts';
import type { Analytics } from '../platform/analytics.ts';
import { emptyProtocol } from '../protocol/sectionize.ts';
import { createProtocol, type ProtocolStoreError } from '../protocol/store.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { type LockedMember, lockActor } from '../team/store.ts';
import { STUDY_ROLE_TABLES } from './roles-schema.ts';
import { STUDY_TABLES } from './schema.ts';
import { participantAnalyticsEnabled, studySettings } from './settings.ts';

const { studies } = STUDY_TABLES;
const { studyRoleGrants } = STUDY_ROLE_TABLES;

export class StudyCommandError extends Schema.TaggedError<StudyCommandError>()(
  'StudyCommandError',
  { code: Schema.Literals(['FORBIDDEN', 'CONFLICT']) },
) {
  override get message(): string {
    return this.code;
  }
}

export type CreatedStudy = {
  studyId: string;
  protocolId: string;
  draftId: string;
};

type InsertedStudy =
  | { created: false }
  | { created: true; participationMode: StudyParticipationMode };

const canCreateStudies = (member: LockedMember): boolean =>
  roleGrantsTeamAdministration(member.role);

const STUDY_EVENT = {
  eventVersion: 1,
  category: 'study',
  subjectType: null,
  subjectId: null,
  subjectLabel: null,
} as const;

const insertStudy: (input: {
  studyId: string;
  teamId: string;
  name: Redacted.Redacted;
  protocolId: string;
  participantAnalytics: boolean;
}) => Effect.Effect<
  InsertedStudy,
  StudyCommandError | SqlError.SqlError,
  Transaction
> = Effect.fn('study.store.insertStudy')(function* (input: {
  studyId: string;
  teamId: string;
  name: Redacted.Redacted;
  protocolId: string;
  participantAnalytics: boolean;
}) {
  const { tx } = yield* Transaction;
  // `.returning()` is what makes the idempotence branch real: without it the
  // builder answers with the driver's result object, typed as a row array.
  const inserted = yield* tx
    .insert(studies)
    .values({
      id: input.studyId,
      teamId: input.teamId,
      name: Redacted.value(input.name),
      protocolId: input.protocolId,
      settings: studySettings(input),
    })
    .onConflictDoNothing({ target: studies.id })
    .returning({ participationMode: studies.participationMode });
  const insertedRow = inserted[0];
  if (insertedRow !== undefined) {
    return {
      created: true,
      participationMode:
        insertedRow.participationMode as StudyParticipationMode,
    } satisfies InsertedStudy as InsertedStudy;
  }

  const existing = yield* tx
    .select({
      name: studies.name,
      protocolId: studies.protocolId,
      settings: studies.settings,
    })
    .from(studies)
    .where(
      and(eq(studies.id, input.studyId), eq(studies.teamId, input.teamId)),
    );
  const row = existing[0];
  if (
    row?.name === Redacted.value(input.name) &&
    row.protocolId === input.protocolId &&
    participantAnalyticsEnabled(row.settings) === input.participantAnalytics
  ) {
    return { created: false } satisfies InsertedStudy as InsertedStudy;
  }
  return yield* new StudyCommandError({ code: 'CONFLICT' });
}, sqlErrorsOnlyBeside);

const insertCreatorGrant: (input: {
  studyId: string;
  teamId: string;
  userId: string;
}) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'study.store.insertCreatorGrant',
)(function* (input: { studyId: string; teamId: string; userId: string }) {
  const { tx } = yield* Transaction;
  yield* tx
    .insert(studyRoleGrants)
    .values({
      id: randomUUID(),
      teamId: input.teamId,
      studyId: input.studyId,
      userId: input.userId,
      role: 'manager',
      piiAccess: true,
      grantedByUserId: input.userId,
    })
    .onConflictDoNothing({
      target: [studyRoleGrants.studyId, studyRoleGrants.userId],
    })
    .returning({ id: studyRoleGrants.id });
}, sqlErrorsOnly);

export const createAuditedStudy: (
  access: TeamAccess,
  input: {
    name: Redacted.Redacted;
    studyId: string;
    protocolId: string;
    draftId: string;
    participantAnalytics?: boolean;
  },
) => Effect.Effect<
  CreatedStudy,
  | StudyCommandError
  | ProtocolStoreError
  | SectionValidationFailedError
  | NotFound
  | SqlError.SqlError,
  | Database
  | Principal
  | AuditActor
  | RequestId
  | AuditSignal
  | Analytics
  | Jobs
  | SecretsCipher
  | DeniedAttempts
> = Effect.fn('study.create')(function* (
  access: TeamAccess,
  input: {
    name: Redacted.Redacted;
    studyId: string;
    protocolId: string;
    draftId: string;
    participantAnalytics?: boolean;
  },
) {
  const studyName = yield* Effect.sync(() =>
    Redacted.make(
      Redacted.value(
        Schema.decodeUnknownSync(StudyName)(Redacted.value(input.name)),
      ).trim(),
    ),
  );
  const cipher = yield* SecretsCipher;

  const principal = yield* Principal;

  return yield* reservedDenial(
    {
      operation: 'studies.create',
      teamId: access.teamId,
      refusal: () => new StudyCommandError({ code: 'FORBIDDEN' }),
      isDenial: (error) =>
        error instanceof StudyCommandError && error.code === 'FORBIDDEN',
    },
    audited(
      'study.create.audited',
      access,
      Effect.gen(function* () {
        const actor = yield* lockActor(access.teamId, principal.userId);
        if (actor === null || !canCreateStudies(actor)) {
          return yield* Effect.fail(
            auditable(new StudyCommandError({ code: 'FORBIDDEN' }), {
              outcome: 'denied',
              events: [
                {
                  ...STUDY_EVENT,
                  eventType: 'study.creation_denied',
                  resourceType: null,
                  resourceId: null,
                  resourceLabel: null,
                  details: { reason: 'insufficient_permission' },
                },
              ],
            }),
          );
        }

        // The protocol line first: `studies.protocol_id` references it.
        const protocol = yield* createProtocol(access.teamId, cipher, {
          protocol: emptyProtocol(Redacted.value(studyName)),
          protocolId: input.protocolId,
          draftId: input.draftId,
        });
        const study = yield* insertStudy({
          studyId: input.studyId,
          teamId: access.teamId,
          name: studyName,
          protocolId: protocol.protocolId,
          participantAnalytics: input.participantAnalytics ?? true,
        });
        // Only on creation: a grant written on a replay would go to whoever replays
        // it, and commit unaudited.
        if (study.created) {
          yield* insertCreatorGrant({
            studyId: input.studyId,
            teamId: access.teamId,
            userId: principal.userId,
          });
        }

        const response = {
          studyId: input.studyId,
          protocolId: protocol.protocolId,
          draftId: protocol.draftId,
        };
        if (!study.created) return unchanged(response);

        const events: AuditEvents = protocol.created
          ? [
              studyCreated(input.studyId, studyName, study, protocol),
              protocolCreated(protocol, studyName),
            ]
          : [studyCreated(input.studyId, studyName, study, protocol)];
        return changed(response, events);
      }),
    ),
  );
});

const studyCreated = (
  studyId: string,
  studyName: Redacted.Redacted,
  study: Extract<InsertedStudy, { created: true }>,
  protocol: { protocolId: string; draftId: string },
) =>
  ({
    ...STUDY_EVENT,
    eventType: 'study.created',
    resourceType: 'study',
    resourceId: studyId,
    resourceLabel: studyName,
    details: {
      protocolId: protocol.protocolId,
      draftId: protocol.draftId,
      participationMode: study.participationMode,
      creatorRole: 'manager',
    },
  }) as const;

const protocolCreated = (
  protocol: { protocolId: string; draftId: string },
  studyName: Redacted.Redacted,
) =>
  ({
    eventVersion: 1,
    eventType: 'protocol.created',
    category: 'protocol',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'protocol',
    resourceId: protocol.protocolId,
    resourceLabel: studyName,
    details: { draftId: protocol.draftId },
  }) as const;
