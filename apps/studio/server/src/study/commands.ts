import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  StudyNameSchema,
  type StudyParticipationMode,
} from '@codaco/studio-rpc';

import {
  auditActorEventContext,
  type AuditedCommandContext,
  type LockedAuditedCommandContext,
  runAuditedCommand,
} from '../audit/command.ts';
import {
  type DeniedAuditReservation,
  reserveDeniedAuditAttempt,
} from '../audit/denial-rate-limit.ts';
import { createDeniedAuditSummaryWriter } from '../audit/denial-summary.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { emptyProtocol } from '../protocol/sectionize.ts';
import { ProtocolStore } from '../protocol/store.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { TeamStore, type LockedMember } from '../team/store.ts';

export type StudyCommandErrorCode = 'FORBIDDEN' | 'CONFLICT' | 'OVERLOADED';

export class StudyCommandError extends Error {
  readonly code: StudyCommandErrorCode;

  constructor(code: StudyCommandErrorCode) {
    super(code);
    this.name = 'StudyCommandError';
    this.code = code;
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

const teamStore = new TeamStore();

/**
 * The single permission predicate #1257's decision names: creating a study is
 * a team Admin or Owner action, not something any member may do. It is read
 * from the LOCKED membership row inside the command's own transaction, so a
 * role revoked while the request was in flight refuses the creation rather
 * than committing under a stale middleware answer.
 */
function canCreateStudies(member: LockedMember): boolean {
  return roleGrantsTeamAdministration(member.role);
}

function studyEventContext(auditContext: LockedAuditedCommandContext) {
  return {
    ...auditActorEventContext(auditContext),
    eventVersion: 1,
    category: 'study',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
  } as const;
}

/**
 * Inserts the study row. `ON CONFLICT DO NOTHING` plus the identity check is
 * `ProtocolStore.createProtocol`'s contract, for the same reason: a caller who
 * lost the response retries the same request, and that retry must return the
 * existing study rather than fail or create a second one. A different name or
 * a different team behind the same id is not a retry — it is an id collision,
 * and it is refused.
 */
async function insertStudy(
  client: pg.PoolClient,
  input: {
    studyId: string;
    teamId: string;
    name: string;
    protocolId: string;
  },
): Promise<InsertedStudy> {
  // A new study takes the schema's own defaults — Draft, managed, one window
  // of wave progression — and the mode is read back rather than assumed, so
  // the audit event states what was actually written.
  const inserted = await client.query<{
    participation_mode: StudyParticipationMode;
  }>(
    `INSERT INTO studies (id, team_id, name, protocol_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING
     RETURNING participation_mode`,
    [input.studyId, input.teamId, input.name, input.protocolId],
  );
  const insertedRow = inserted.rows[0];
  if (insertedRow) {
    return {
      created: true,
      participationMode: insertedRow.participation_mode,
    };
  }

  const existing = await client.query<{ name: string; protocol_id: string }>(
    `SELECT name, protocol_id FROM studies WHERE id = $1 AND team_id = $2`,
    [input.studyId, input.teamId],
  );
  const row = existing.rows[0];
  if (row?.name === input.name && row.protocol_id === input.protocolId) {
    return { created: false };
  }
  throw new StudyCommandError('CONFLICT');
}

/**
 * The creator's Manager grant, which #1257's decision makes part of creating
 * a study: without it a team Member who is later demoted, or an Admin whose
 * team narrows their visibility, loses the study they made. `pii_access` is
 * granted with it — the flag is orthogonal to the role, and the researcher
 * who created a study runs it — which is the same pairing the seed writes for
 * every study it creates.
 */
async function insertCreatorGrant(
  client: pg.PoolClient,
  input: { studyId: string; teamId: string; userId: string },
): Promise<void> {
  await client.query(
    `INSERT INTO study_role_grants
       (id, team_id, study_id, user_id, role, pii_access, granted_by_user_id)
     VALUES ($1, $2, $3, $4, 'manager', true, $4)
     ON CONFLICT (study_id, user_id) DO NOTHING`,
    [randomUUID(), input.teamId, input.studyId, input.userId],
  );
}

type AdmittedDeniedAuditReservation = Extract<
  DeniedAuditReservation,
  { admitted: true }
>;

async function reserveDeniedStudyCreation(
  context: AuditedCommandContext,
): Promise<AdmittedDeniedAuditReservation> {
  const reservation = await reserveDeniedAuditAttempt(
    {
      actorId: context.principal.userId,
      teamId: context.tenantDb.teamId,
      operation: 'studies.create',
    },
    createDeniedAuditSummaryWriter(context, 'studies.create'),
  );
  if (!reservation.admitted) {
    throw new StudyCommandError(
      reservation.reason === 'overloaded' ? 'OVERLOADED' : 'FORBIDDEN',
    );
  }
  return reservation;
}

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
export async function createAuditedStudy(
  context: AuditedCommandContext,
  input: {
    name: string;
    studyId: string;
    protocolId: string;
    draftId: string;
  },
): Promise<CreatedStudy> {
  const studyName = StudyNameSchema.parse(input.name).trim();
  const reservation = await reserveDeniedStudyCreation(context);

  try {
    const result = await runAuditedCommand<CreatedStudy>(
      context,
      async (client, auditContext) => {
        const teamId = context.tenantDb.teamId;
        const actor = await teamStore.lockActor(
          client,
          teamId,
          context.principal.userId,
        );
        if (!actor || !canCreateStudies(actor)) {
          const denial = {
            ...studyEventContext(auditContext),
            eventType: 'study.creation_denied',
            outcome: 'denied',
            resourceType: null,
            resourceId: null,
            resourceLabel: null,
            details: { reason: 'insufficient_permission' },
          } satisfies AuditEventInput;
          return {
            status: 'denied' as const,
            error: new StudyCommandError('FORBIDDEN'),
            events: [denial] as const,
          };
        }

        // The protocol line first: `studies.protocol_id` references it.
        const protocol = await new ProtocolStore(
          context.tenantDb,
        ).createProtocol(
          {
            protocol: emptyProtocol(studyName),
            protocolId: input.protocolId,
            draftId: input.draftId,
          },
          client,
        );
        const study = await insertStudy(client, {
          studyId: input.studyId,
          teamId,
          name: studyName,
          protocolId: protocol.protocolId,
        });
        // Only the creation grants: a replay changes nothing, and this is the
        // one write of the command that would otherwise still happen on one —
        // for whoever replays it, which the identities alone do not prove is
        // the creator. A grant written that way would also commit unaudited,
        // because the replay returns before the creation event.
        if (study.created) {
          await insertCreatorGrant(client, {
            studyId: input.studyId,
            teamId,
            userId: context.principal.userId,
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
        if (!study.created) return { status: 'unchanged', result: response };

        const created = {
          ...studyEventContext(auditContext),
          eventType: 'study.created',
          outcome: 'succeeded',
          resourceType: 'study',
          resourceId: input.studyId,
          resourceLabel: studyName,
          details: {
            protocolId: protocol.protocolId,
            draftId: protocol.draftId,
            participationMode: study.participationMode,
            creatorRole: 'manager',
          },
        } satisfies AuditEventInput;
        const protocolCreated = {
          ...auditActorEventContext(auditContext),
          eventVersion: 1,
          eventType: 'protocol.created',
          category: 'protocol',
          outcome: 'succeeded',
          subjectType: null,
          subjectId: null,
          subjectLabel: null,
          resourceType: 'protocol',
          resourceId: protocol.protocolId,
          resourceLabel: studyName,
          details: { draftId: protocol.draftId },
        } satisfies AuditEventInput;
        // The protocol event only where a protocol was really written. An
        // immutable log is the wrong place to record a creation that turned
        // out to be a replay of one already recorded.
        const events: [AuditEventInput, ...AuditEventInput[]] = [created];
        if (protocol.created) events.push(protocolCreated);
        return { status: 'succeeded' as const, result: response, events };
      },
    );
    reservation.complete('other');
    return result;
  } catch (error) {
    reservation.complete(
      error instanceof StudyCommandError && error.code === 'FORBIDDEN'
        ? 'denied'
        : 'other',
    );
    throw error;
  }
}
