import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  auditActorEventContext,
  type AuditedCommandContext,
  runAuditedCommand,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import type { EncryptionKeys } from '../pii/keys.ts';
import { authorizeParticipantPiiAccess } from '../pii/participants.ts';
import { createDataProtection } from '../pii/protection.ts';
import { lockParticipantMessageAuthority } from '../schedule/participant-authority.ts';

export class InterviewLinkError extends Error {
  readonly code: 'FORBIDDEN' | 'CONFLICT';

  constructor(code: 'FORBIDDEN' | 'CONFLICT') {
    super(code);
    this.name = 'InterviewLinkError';
    this.code = code;
  }
}

export type IssueParticipantInterviewLinkInput = {
  studyId: string;
  waveId: string;
  participantId: string;
};

export type IssuedParticipantInterviewLink = {
  linkId: string;
  token: string;
};

function linkEvent(
  context: Parameters<typeof auditActorEventContext>[0],
  input: IssueParticipantInterviewLinkInput,
  linkId: string,
  reissued: boolean,
): AuditEventInput {
  return {
    ...auditActorEventContext(context),
    eventVersion: 1,
    eventType: 'interview.link.issued',
    category: 'participant_data',
    outcome: 'succeeded',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'interview_link',
    resourceId: linkId,
    resourceLabel: null,
    details: { ...input, reissued },
  };
}

async function lockIssueTarget(
  client: pg.PoolClient,
  teamId: string,
  input: IssueParticipantInterviewLinkInput,
) {
  const target = await client.query<{ closes_at: Date | null }>(
    `SELECT w.closes_at FROM studies s
     JOIN study_waves w ON w.study_id=s.id AND w.team_id=s.team_id
     JOIN participants p ON p.id=$3 AND p.study_id=s.id AND p.team_id=s.team_id
     WHERE s.id=$1 AND s.team_id=$2 AND w.id=$4
       AND s.participation_mode='managed' AND s.state IN ('live','paused')
       AND p.enrolled_at IS NOT NULL
     FOR UPDATE OF s,w,p`,
    [input.studyId, teamId, input.participantId, input.waveId],
  );
  return target.rows[0];
}

/** Issues the sole live participant capability for a wave and retains it only as authenticated ciphertext. */
export async function issueParticipantInterviewLink(
  keys: EncryptionKeys,
  context: AuditedCommandContext,
  input: IssueParticipantInterviewLinkInput,
): Promise<IssuedParticipantInterviewLink> {
  return runAuditedCommand(context, async (client, auditContext) => {
    if (
      !(await authorizeParticipantPiiAccess(
        client,
        context,
        input.studyId,
        true,
      ))
    ) {
      throw new InterviewLinkError('FORBIDDEN');
    }
    await lockParticipantMessageAuthority(
      client,
      context.tenantDb.teamId,
      input.participantId,
    );
    const target = await lockIssueTarget(
      client,
      context.tenantDb.teamId,
      input,
    );
    if (!target) throw new InterviewLinkError('CONFLICT');

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM interview_links
       WHERE team_id=$1 AND wave_id=$2 AND participant_id=$3
         AND kind='participant' AND revoked_at IS NULL
       FOR UPDATE`,
      [context.tenantDb.teamId, input.waveId, input.participantId],
    );
    const reissued = existing.rowCount === 1;
    if (reissued) {
      await client.query(
        `UPDATE interview_links SET revoked_at=statement_timestamp()
         WHERE id=$1 AND team_id=$2 AND revoked_at IS NULL`,
        [existing.rows[0]!.id, context.tenantDb.teamId],
      );
    }

    const linkId = randomUUID();
    const random = randomBytes(32);
    const encodedSecret = random.toString('base64url');
    random.fill(0);
    const secret = Buffer.from(encodedSecret, 'utf8');
    try {
      const sealed = createDataProtection(keys, {
        participant: async () => {
          throw new InterviewLinkError('FORBIDDEN');
        },
        integration: async () => {
          throw new InterviewLinkError('FORBIDDEN');
        },
      }).encryptIntegration(
        {
          kind: 'interview-link',
          teamId: context.tenantDb.teamId,
          linkId,
          column: 'token_ciphertext',
        },
        secret,
      );
      await client.query(
        `INSERT INTO interview_links
           (id,study_id,team_id,wave_id,participant_id,kind,token_hash,
            token_ciphertext,token_key_id,token_algorithm,expires_at,created_by_user_id)
         VALUES($1,$2,$3,$4,$5,'participant',$6,$7,$8,$9,$10,$11)`,
        [
          linkId,
          input.studyId,
          context.tenantDb.teamId,
          input.waveId,
          input.participantId,
          createHash('sha256').update(encodedSecret).digest(),
          sealed.envelope,
          sealed.keyId,
          sealed.algorithm,
          target.closes_at,
          context.principal.userId,
        ],
      );
      return {
        status: 'succeeded',
        result: {
          linkId,
          token: `${context.tenantDb.teamId}.${encodedSecret}`,
        },
        events: [linkEvent(auditContext, input, linkId, reissued)],
      };
    } finally {
      secret.fill(0);
    }
  });
}
