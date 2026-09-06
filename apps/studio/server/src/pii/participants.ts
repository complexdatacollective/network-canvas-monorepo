import type pg from 'pg';
import { z } from 'zod';

import {
  auditActorEventContext,
  type AuditedCommandContext,
  type LockedAuditedCommandContext,
  runAuditedCommand,
} from '../audit/command.ts';
import { reserveDeniedAuditAttempt } from '../audit/denial-rate-limit.ts';
import { createDeniedAuditSummaryWriter } from '../audit/denial-summary.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { runNoAuditTenantTransaction } from '../audit/transaction.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { TeamStore } from '../team/store.ts';
import { createContactBlindIndex, normalizeContact } from './contacts.ts';
import type { EncryptionKeys } from './keys.ts';
import {
  createDataProtection,
  type ParticipantField,
  ProtectedDataError,
} from './protection.ts';

export class ParticipantPiiError extends Error {
  readonly code: 'FORBIDDEN' | 'CONFLICT' | 'INVALID' | 'OVERLOADED';

  constructor(code: 'FORBIDDEN' | 'CONFLICT' | 'INVALID' | 'OVERLOADED') {
    super(code);
    this.name = 'ParticipantPiiError';
    this.code = code;
  }
}

export type ParticipantTarget = { studyId: string; participantId: string };
export const PARTICIPANT_PII_COLUMNS = [
  'email_ciphertext',
  'phone_ciphertext',
  'name_ciphertext',
  'attributes_ciphertext',
] as const;
const inputSchema = z.strictObject({
  email: z.string().max(320).nullable(),
  phone: z.string().max(128).nullable(),
  name: z.string().min(1).max(320).nullable(),
  attributes: z.record(z.string(), z.json()).nullable(),
});
export type ParticipantPiiInput = z.infer<typeof inputSchema>;

export type ParticipantCiphertextRow = {
  id: string;
  study_id: string;
  team_id: string;
  participant_code: string;
  pii_key_id: string | null;
  pii_algorithm: string | null;
  email_ciphertext: Buffer | null;
  phone_ciphertext: Buffer | null;
  name_ciphertext: Buffer | null;
  attributes_ciphertext: Buffer | null;
};

const teamStore = new TeamStore();

async function authorize(
  client: pg.PoolClient,
  context: AuditedCommandContext,
  studyId: string,
  write: boolean,
): Promise<boolean> {
  const actor = await teamStore.lockActor(
    client,
    context.tenantDb.teamId,
    context.principal.userId,
  );
  if (!actor) return false;
  const grants = await client.query<{ role: string; pii_access: boolean }>(
    `SELECT role, pii_access FROM study_role_grants WHERE team_id = $1 AND study_id = $2 AND user_id = $3 FOR UPDATE`,
    [context.tenantDb.teamId, studyId, context.principal.userId],
  );
  const grant = grants.rows[0];
  // Team administration never substitutes for the orthogonal explicit flag.
  return Boolean(
    grant?.pii_access &&
    (!write ||
      grant.role === 'manager' ||
      grant.role === 'coordinator' ||
      roleGrantsTeamAdministration(actor.role)),
  );
}

function denied(
  context: LockedAuditedCommandContext,
  operation: 'read' | 'write',
) {
  return {
    status: 'denied',
    error: new ParticipantPiiError('FORBIDDEN'),
    events: [
      {
        ...auditActorEventContext(context),
        eventType: 'participant.pii.denied',
        eventVersion: 1,
        category: 'participant_data',
        outcome: 'denied',
        subjectType: null,
        subjectId: null,
        subjectLabel: null,
        resourceType: null,
        resourceId: null,
        resourceLabel: null,
        details: { operation, reason: 'insufficient_permission' },
      } satisfies AuditEventInput,
    ],
  } as const;
}

function event(
  context: LockedAuditedCommandContext,
  row: ParticipantCiphertextRow,
  eventType: 'participant.pii.read' | 'participant.pii.updated',
  columns: ParticipantField['column'][],
): AuditEventInput {
  return {
    ...auditActorEventContext(context),
    eventType,
    eventVersion: 1,
    category: 'participant_data',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'participant',
    resourceId: row.id,
    resourceLabel: row.participant_code,
    details: { studyId: row.study_id, columns },
  };
}

async function withDenialLimit<T>(
  context: AuditedCommandContext,
  operation: 'read' | 'write',
  work: () => Promise<T>,
): Promise<T> {
  const auditOperation =
    operation === 'read' ? 'participants.pii.read' : 'participants.pii.write';
  const reservation = await reserveDeniedAuditAttempt(
    {
      actorId: context.principal.userId,
      teamId: context.tenantDb.teamId,
      operation: auditOperation,
    },
    createDeniedAuditSummaryWriter(context, auditOperation),
  );
  if (!reservation.admitted)
    throw new ParticipantPiiError(
      reservation.reason === 'overloaded' ? 'OVERLOADED' : 'FORBIDDEN',
    );
  try {
    const result = await work();
    reservation.complete('other');
    return result;
  } catch (error) {
    reservation.complete(
      error instanceof ParticipantPiiError && error.code === 'FORBIDDEN'
        ? 'denied'
        : 'other',
    );
    throw error;
  }
}

export async function selectParticipantCiphertext(
  client: pg.PoolClient,
  teamId: string,
  target: ParticipantTarget,
  lock = false,
): Promise<ParticipantCiphertextRow | undefined> {
  const selected = await client.query<ParticipantCiphertextRow>(
    `SELECT id, study_id, team_id, participant_code, pii_key_id, pii_algorithm,
      email_ciphertext, phone_ciphertext, name_ciphertext, attributes_ciphertext
     FROM participants WHERE team_id = $1 AND study_id = $2 AND id = $3 ${lock ? 'FOR UPDATE' : ''}`,
    [teamId, target.studyId, target.participantId],
  );
  return selected.rows[0];
}

/**
 * A single audited PII field. Ciphertext may be selected under RLS before the
 * authorization transaction; the exact row/ciphertext is re-locked and checked
 * inside it. Revocation and concurrent replacement therefore cannot redirect
 * or authorize a stale read. Only this service exposes participant plaintext.
 */
export async function readParticipantPiiField(
  keys: EncryptionKeys,
  context: AuditedCommandContext,
  targetInput: ParticipantTarget & { column: ParticipantField['column'] },
): Promise<Buffer | null> {
  const target = Object.freeze({ ...targetInput });
  return withDenialLimit(context, 'read', async () => {
    const row = await runNoAuditTenantTransaction(
      context.tenantDb,
      'pii.readCiphertext',
      (client) =>
        selectParticipantCiphertext(client, context.tenantDb.teamId, target),
    );
    const ciphertext = row?.[target.column];
    // Even an absent field must authorize before revealing its absence.
    if (!row || !ciphertext || !row.pii_key_id || !row.pii_algorithm) {
      return runAuditedCommand(context, async (client, audit) => {
        if (!(await authorize(client, context, target.studyId, false)))
          return denied(audit, 'read');
        if (!row) throw new ParticipantPiiError('FORBIDDEN');
        return { status: 'unchanged', result: null };
      });
    }
    const api = createDataProtection(keys, {
      participant: async (_field, read) => {
        await runAuditedCommand(context, async (client, audit) => {
          if (!(await authorize(client, context, target.studyId, false)))
            return denied(audit, 'read');
          const current = await selectParticipantCiphertext(
            client,
            context.tenantDb.teamId,
            target,
            true,
          );
          if (
            !current ||
            current.pii_key_id !== row.pii_key_id ||
            current.pii_algorithm !== row.pii_algorithm ||
            !current[target.column]?.equals(ciphertext)
          )
            throw new ParticipantPiiError('CONFLICT');
          read();
          return {
            status: 'succeeded',
            result: undefined,
            events: [
              event(audit, current, 'participant.pii.read', [target.column]),
            ],
          };
        });
      },
      integration: async () => {
        throw new ProtectedDataError();
      },
    });
    return api.readParticipant(
      { ...target, teamId: context.tenantDb.teamId },
      {
        keyId: row.pii_key_id,
        algorithm: row.pii_algorithm,
        envelope: ciphertext,
      },
    );
  });
}

/** Whole-record replacement keeps one encryption/index ID true for all fields. */
export async function updateParticipantPii(
  keys: EncryptionKeys,
  context: AuditedCommandContext,
  targetInput: ParticipantTarget,
  input: ParticipantPiiInput,
): Promise<{ participantCode: string }> {
  const target = Object.freeze({ ...targetInput });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new ParticipantPiiError('INVALID');
  const data = parsed.data;
  const attributes =
    data.attributes === null ? null : JSON.stringify(data.attributes);
  if (attributes !== null && Buffer.byteLength(attributes) > 65_536)
    throw new ParticipantPiiError('INVALID');
  const normalized = {
    email:
      data.email === null
        ? null
        : normalizeContact({ kind: 'email', value: data.email }),
    phone:
      data.phone === null
        ? null
        : normalizeContact({ kind: 'phone', value: data.phone }),
  };
  return withDenialLimit(context, 'write', () =>
    runAuditedCommand(context, async (client, audit) => {
      if (!(await authorize(client, context, target.studyId, true)))
        return denied(audit, 'write');
      const row = await selectParticipantCiphertext(
        client,
        context.tenantDb.teamId,
        target,
        true,
      );
      if (!row) throw new ParticipantPiiError('FORBIDDEN');
      const api = createDataProtection(keys, {
        participant: async () => {
          throw new ProtectedDataError();
        },
        integration: async () => {
          throw new ProtectedDataError();
        },
      });
      const rowKeyId = keys.currentId('pii-enc');
      const seal = (
        column: ParticipantField['column'],
        value: string | null,
      ) =>
        value === null
          ? null
          : api.encryptParticipant(
              { ...target, teamId: context.tenantDb.teamId, column },
              Buffer.from(value),
              rowKeyId,
            ).envelope;
      const email =
        normalized.email === null
          ? null
          : createContactBlindIndex(keys, {
              kind: 'email',
              value: normalized.email,
            });
      const phone =
        normalized.phone === null
          ? null
          : createContactBlindIndex(keys, {
              kind: 'phone',
              value: normalized.phone,
            });
      const ciphertexts = [
        seal('email_ciphertext', normalized.email),
        seal('phone_ciphertext', normalized.phone),
        seal('name_ciphertext', data.name),
        seal('attributes_ciphertext', attributes),
      ];
      const hasPii = ciphertexts.some((value) => value !== null);
      await client.query(
        `UPDATE participants SET email_ciphertext = $4, phone_ciphertext = $5, name_ciphertext = $6, attributes_ciphertext = $7,
      email_index = $8, phone_index = $9, blind_index_key_id = $10, pii_key_id = $11, pii_algorithm = $12, updated_at = now()
      WHERE team_id = $1 AND study_id = $2 AND id = $3`,
        [
          context.tenantDb.teamId,
          target.studyId,
          target.participantId,
          ...ciphertexts,
          email?.value ?? null,
          phone?.value ?? null,
          email?.keyId ?? phone?.keyId ?? null,
          hasPii ? rowKeyId : null,
          hasPii ? 'aes-256-gcm.v1' : null,
        ],
      );
      return {
        status: 'succeeded',
        result: { participantCode: row.participant_code },
        events: [
          event(audit, row, 'participant.pii.updated', [
            ...PARTICIPANT_PII_COLUMNS,
          ]),
        ],
      };
    }),
  );
}

/** Exact normalized lookup returns only the stable non-PII handle. */
export async function findParticipantByContact(
  keys: EncryptionKeys,
  context: AuditedCommandContext,
  studyId: string,
  contact: { kind: 'email' | 'phone'; value: string },
): Promise<{ participantId: string; participantCode: string }[]> {
  const indexes = keys
    .ids('pii-index')
    .map((id) => createContactBlindIndex(keys, contact, id));
  const kind = contact.kind;
  return withDenialLimit(context, 'read', () =>
    runAuditedCommand(context, async (client, audit) => {
      if (!(await authorize(client, context, studyId, false)))
        return denied(audit, 'read');
      const rows = await client.query<{
        participantId: string;
        participantCode: string;
      }>(
        `SELECT id AS "participantId", participant_code AS "participantCode" FROM participants
       WHERE team_id = $1 AND study_id = $2 AND (blind_index_key_id, ${kind === 'email' ? 'email_index' : 'phone_index'}) IN (SELECT * FROM unnest($3::text[], $4::bytea[])) ORDER BY id LIMIT 100`,
        [
          context.tenantDb.teamId,
          studyId,
          indexes.map((index) => index.keyId),
          indexes.map((index) => index.value),
        ],
      );
      return {
        status: 'succeeded',
        result: rows.rows,
        events: [
          {
            ...auditActorEventContext(audit),
            eventVersion: 1,
            eventType: 'participant.pii.lookup',
            category: 'participant_data',
            outcome: 'succeeded',
            subjectType: null,
            subjectId: null,
            subjectLabel: null,
            resourceType: 'study',
            resourceId: studyId,
            resourceLabel: null,
            details: { kind, resultCount: rows.rows.length },
          },
        ],
      };
    }),
  );
}
