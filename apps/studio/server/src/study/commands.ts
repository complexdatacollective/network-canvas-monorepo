import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import type { NotFound } from '@codaco/studio-contract/schema/errors';
import {
  StudyNameSchema,
  type StudyParticipationMode,
} from '@codaco/studio-rpc';
import type { SectionValidationFailedError } from '@codaco/studio-sync/section-validation';

import {
  audited,
  auditable,
  type AuditEvents,
  changed,
  unchanged,
} from '../audit/audited.ts';
import { reservedDenial } from '../audit/denial-rate-limit.ts';
import type { AuditSignal } from '../audit/signal.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnly, sqlErrorsOnlyBeside } from '../db/errors.ts';
import { type TeamAccess, Transaction } from '../db/tenant.ts';
import type { RequestId } from '../http/middleware/request-id.ts';
import { emptyProtocol } from '../protocol/sectionize.ts';
import { createProtocol, type ProtocolStoreError } from '../protocol/store.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { type LockedMember, lockActor } from '../team/store.ts';
import { STUDY_ROLE_TABLES } from './roles-schema.ts';
import { STUDY_TABLES } from './schema.ts';

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

/**
 * The single permission predicate #1257's decision names: creating a study is
 * a team Admin or Owner action, not something any member may do. It is read
 * from the LOCKED membership row inside the command's own transaction, so a
 * role revoked while the request was in flight refuses the creation rather
 * than committing under a stale middleware answer.
 */
const canCreateStudies = (member: LockedMember): boolean =>
  roleGrantsTeamAdministration(member.role);

/** The fields every study event carries, minus the ones `audited` owns. */
const STUDY_EVENT = {
  eventVersion: 1,
  category: 'study',
  subjectType: null,
  subjectId: null,
  subjectLabel: null,
} as const;

/**
 * Inserts the study row. `ON CONFLICT DO NOTHING` plus the identity check is
 * `createProtocol`'s contract, for the same reason: a caller who lost the
 * response retries the same request, and that retry must return the existing
 * study rather than fail or create a second one. A different name or a
 * different team behind the same id is not a retry — it is an id collision,
 * and it is refused.
 */
const insertStudy: (input: {
  studyId: string;
  teamId: string;
  name: string;
  protocolId: string;
}) => Effect.Effect<
  InsertedStudy,
  StudyCommandError | SqlError.SqlError,
  Transaction
> = Effect.fn('study.store.insertStudy')(function* (input: {
  studyId: string;
  teamId: string;
  name: string;
  protocolId: string;
}) {
  const { tx } = yield* Transaction;
  // A new study takes the schema's own defaults — Draft, managed, one window
  // of wave progression — and the mode is read back rather than assumed, so
  // the audit event states what was actually written. `.returning()` is also
  // what makes the idempotence branch real: without it the builder answers
  // with the driver's result object, typed as a row array and not one, so the
  // conflict would read as a successful insert.
  const inserted = yield* tx
    .insert(studies)
    .values({
      id: input.studyId,
      teamId: input.teamId,
      name: input.name,
      protocolId: input.protocolId,
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
    .select({ name: studies.name, protocolId: studies.protocolId })
    .from(studies)
    .where(
      and(eq(studies.id, input.studyId), eq(studies.teamId, input.teamId)),
    );
  const row = existing[0];
  if (row?.name === input.name && row.protocolId === input.protocolId) {
    return { created: false } satisfies InsertedStudy as InsertedStudy;
  }
  return yield* new StudyCommandError({ code: 'CONFLICT' });
}, sqlErrorsOnlyBeside);

/**
 * The creator's Manager grant, which #1257's decision makes part of creating a
 * study: without it a team Member who is later demoted, or an Admin whose team
 * narrows their visibility, loses the study they made. `pii_access` is granted
 * with it — the flag is orthogonal to the role, and the researcher who created
 * a study runs it — which is the same pairing the seed writes for every study
 * it creates.
 */
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

/**
 * Creates a study and its protocol line together (#1262).
 *
 * **One transaction, both objects.** A study whose protocol line failed to
 * appear has nothing to edit and no way to reach one, and the editor resolves
 * its address through `studies.protocol_id` — so the two are written under the
 * same audited transaction, and a failure in either leaves neither.
 *
 * Two events, because two things happened: `study.created` for the study tier
 * and `protocol.created` for the protocol tier, which keeps the protocol
 * lane's history complete however a protocol came to exist.
 */
export const createAuditedStudy: (
  access: TeamAccess,
  input: {
    name: string;
    studyId: string;
    protocolId: string;
    draftId: string;
  },
) => Effect.Effect<
  CreatedStudy,
  | StudyCommandError
  | ProtocolStoreError
  | SectionValidationFailedError
  | NotFound
  | SqlError.SqlError,
  Database | Principal | RequestId | AuditSignal | SecretsCipher
> = Effect.fn('study.create')(function* (
  access: TeamAccess,
  input: {
    name: string;
    studyId: string;
    protocolId: string;
    draftId: string;
  },
) {
  const studyName = yield* Effect.sync(() =>
    StudyNameSchema.parse(input.name).trim(),
  );
  // The protocol store seals API-key assets, so it always takes a cipher
  // (#1900) — read from the environment rather than passed in, so there is one
  // cipher for the process and no call site can seal under a key the rest of
  // the program cannot open.
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
          protocol: emptyProtocol(studyName),
          protocolId: input.protocolId,
          draftId: input.draftId,
        });
        const study = yield* insertStudy({
          studyId: input.studyId,
          teamId: access.teamId,
          name: studyName,
          protocolId: protocol.protocolId,
        });
        // Only the creation grants: a replay changes nothing, and this is the
        // one write of the command that would otherwise still happen on one —
        // for whoever replays it, which the identities alone do not prove is
        // the creator. A grant written that way would also commit unaudited,
        // because the replay returns before the creation event.
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
        // A replay of a creation that already committed: the identities are
        // the same, nothing changed, and inventing a second creation event
        // would put a study in the activity log twice.
        if (!study.created) return unchanged(response);

        // The protocol event only where a protocol was really written. An
        // immutable log is the wrong place to record a creation that turned
        // out to be a replay of one already recorded.
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
  studyName: string,
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
  studyName: string,
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
