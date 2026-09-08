import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type {
  AuditAlertPreferencesInput,
  AuditAlertPreferencesOutput,
} from '@codaco/studio-rpc';

export class AuditAlertPreferencesError extends Error {
  constructor(message = 'invalid audit alert preferences') {
    super(message);
    this.name = 'AuditAlertPreferencesError';
  }
}

export async function loadAuditAlertPreferences(
  client: pg.PoolClient,
  teamId: string,
): Promise<AuditAlertPreferencesOutput> {
  const result = await client.query<
    AuditAlertPreferencesOutput['recipients'][number] & { configured: boolean }
  >(
    `SELECT member.user_id AS "userId", account.name, account.email,
            member.role, account."emailVerified" AS "emailVerified",
            account.recovery_disabled AS "recoveryDisabled",
            COALESCE(preference.email_enabled, true) AS "emailEnabled",
            COALESCE(preference.in_app_enabled, true) AS "inAppEnabled",
            EXISTS (SELECT 1 FROM audit_alert_preferences configured
                    WHERE configured.team_id = $1) AS configured
     FROM team_members member
     JOIN "user" account ON account.id = member.user_id
     LEFT JOIN audit_alert_preferences preference
       ON preference.team_id = member.team_id
      AND preference.recipient_user_id = member.user_id
     WHERE member.team_id = $1 AND member.role IN ('owner', 'admin')
     ORDER BY account.name, account.email, member.user_id`,
    [teamId],
  );
  return {
    configured: result.rows[0]?.configured ?? false,
    recipients: result.rows.map(
      ({ configured: _configured, ...recipient }) => recipient,
    ),
  };
}

export async function saveAuditAlertPreferences(
  client: pg.PoolClient,
  input: AuditAlertPreferencesInput,
  actorUserId: string,
): Promise<AuditAlertPreferencesOutput> {
  const uniqueIds = new Set(input.recipients.map(({ userId }) => userId));
  if (uniqueIds.size !== input.recipients.length)
    throw new AuditAlertPreferencesError('duplicate recipient');
  const actor = await client.query(
    `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2
       AND role IN ('owner', 'admin') FOR UPDATE`,
    [input.teamId, actorUserId],
  );
  if (actor.rowCount !== 1) throw new AuditAlertPreferencesError('forbidden');
  const allowed = await client.query<{ user_id: string }>(
    `SELECT member.user_id FROM team_members member JOIN "user" account
       ON account.id = member.user_id WHERE member.team_id = $1
       AND member.role IN ('owner', 'admin') AND account."emailVerified"
       AND NOT account.recovery_disabled`,
    [input.teamId],
  );
  const allowedIds = new Set(allowed.rows.map(({ user_id }) => user_id));
  if (input.recipients.some(({ userId }) => !allowedIds.has(userId)))
    throw new AuditAlertPreferencesError('recipient is not deliverable');
  await client.query('DELETE FROM audit_alert_preferences WHERE team_id = $1', [
    input.teamId,
  ]);
  for (const recipient of input.recipients)
    await client.query(
      `INSERT INTO audit_alert_preferences
       (id, team_id, recipient_user_id, email_enabled, in_app_enabled,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, statement_timestamp(), statement_timestamp())`,
      [
        randomUUID(),
        input.teamId,
        recipient.userId,
        recipient.emailEnabled,
        recipient.inAppEnabled,
      ],
    );
  return loadAuditAlertPreferences(client, input.teamId);
}
