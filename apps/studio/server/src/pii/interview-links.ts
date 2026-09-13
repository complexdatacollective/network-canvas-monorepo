import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import { runAuditedSystemMutation } from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import type { EncryptionKeys } from './keys.ts';
import { createDataProtection, ProtectedDataError } from './protection.ts';

export type InterviewLinkCiphertext = {
  id: string;
  team_id: string;
  study_id: string;
  wave_id: string;
  participant_id: string;
  token_hash: Buffer;
  token_ciphertext: Buffer;
  token_key_id: string;
  token_algorithm: string;
};

async function selectLink(
  client: Pick<pg.PoolClient, 'query'>,
  teamId: string,
  linkId: string,
  lock = false,
  allowInactive = false,
) {
  const selected = await client.query<InterviewLinkCiphertext>(
    `SELECT id,team_id,study_id,wave_id,participant_id,token_hash,
            token_ciphertext,token_key_id,token_algorithm
     FROM interview_links WHERE id=$1 AND team_id=$2 AND kind='participant'
       ${allowInactive ? '' : 'AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>statement_timestamp())'}
       AND token_ciphertext IS NOT NULL AND token_key_id IS NOT NULL AND token_algorithm IS NOT NULL
     ${lock ? 'FOR UPDATE' : ''}`,
    [linkId, teamId],
  );
  return selected.rows[0];
}

function sameLink(
  current: InterviewLinkCiphertext | undefined,
  expected: InterviewLinkCiphertext,
) {
  return Boolean(
    current &&
    current.study_id === expected.study_id &&
    current.wave_id === expected.wave_id &&
    current.participant_id === expected.participant_id &&
    current.token_key_id === expected.token_key_id &&
    current.token_algorithm === expected.token_algorithm &&
    current.token_hash.equals(expected.token_hash) &&
    current.token_ciphertext.equals(expected.token_ciphertext),
  );
}

/** Reads a live link capability only after the exact envelope and authority are audited under lock. */
export async function readInterviewLinkCapability(
  keys: EncryptionKeys,
  pool: pg.Pool,
  teamId: string,
  linkId: string,
  options: {
    allowInactive?: boolean;
    authority?: 'message-delivery' | 'rotation';
  } = {},
): Promise<{ secret: Buffer; snapshot: InterviewLinkCiphertext }> {
  const snapshot = await selectLink(
    pool,
    teamId,
    linkId,
    false,
    options.allowInactive,
  );
  if (!snapshot) throw new ProtectedDataError();
  const rotation = options.authority === 'rotation';
  const protection = createDataProtection(keys, {
    participant: async () => {
      throw new ProtectedDataError();
    },
    integration: async (_target, read) => {
      await runAuditedSystemMutation(
        {
          tenantDb: createTenantDb(pool, teamId),
          actorLabel: rotation ? 'Encryption maintenance' : 'Message delivery',
          requestId: randomUUID(),
        },
        async (client, context) => {
          const current = await selectLink(
            client,
            teamId,
            linkId,
            true,
            options.allowInactive,
          );
          if (!sameLink(current, snapshot)) throw new ProtectedDataError();
          read();
          const event: AuditEventInput = rotation
            ? {
                ...context,
                actorLabel: 'Encryption maintenance',
                eventType: 'interview.link.rotation_read',
                eventVersion: 1,
                category: 'participant_data',
                outcome: 'succeeded',
                subjectType: null,
                subjectId: null,
                subjectLabel: null,
                resourceType: 'interview_link',
                resourceId: linkId,
                resourceLabel: null,
                details: { purpose: 'rotation' },
              }
            : {
                ...context,
                actorLabel: 'Message delivery',
                eventType: 'message.link.read',
                eventVersion: 1,
                category: 'participant_data',
                outcome: 'succeeded',
                subjectType: null,
                subjectId: null,
                subjectLabel: null,
                resourceType: 'interview_link',
                resourceId: linkId,
                resourceLabel: null,
                details: { channel: null },
              };
          return {
            result: undefined,
            events: [event],
          };
        },
      );
    },
  });
  return {
    secret: await protection.readIntegration(
      {
        kind: 'interview-link',
        teamId,
        linkId,
        column: 'token_ciphertext',
      },
      {
        envelope: snapshot.token_ciphertext,
        keyId: snapshot.token_key_id,
        algorithm: snapshot.token_algorithm,
      },
    ),
    snapshot,
  };
}

export function linkSnapshotMatches(
  current: InterviewLinkCiphertext | undefined,
  expected: InterviewLinkCiphertext,
) {
  return sameLink(current, expected);
}
