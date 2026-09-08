import { deepStrictEqual } from 'node:assert';
import { createHash } from 'node:crypto';

import type pg from 'pg';

import { assertSamePostgresDatabase } from '@codaco/studio-sync/postgres-database-identity';
import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { assertBackupAccess } from '../db/backup.ts';
import { checkSchema } from '../db/schema.ts';
import { tryParseRoles } from '../team/roles.ts';
import {
  copyStudioRecoveryAuthorizationReconciliation,
  type StudioRecoveryAuthorizationReconciliation,
} from './authorization-reconciliation.ts';
import { assertStudioRecoveryQuarantine } from './quarantine.ts';

const FAILURE = 'STUDIO_RECOVERY_AUTHORIZATION_FAILED';
const MISMATCH = 'STUDIO_RECOVERY_RECONCILIATION_MISMATCH';
const RECOVERY_ACTOR = 'studio-recovery';

type Policy = {
  allowedLogins: readonly string[];
  administrativeLogins: readonly string[];
};

type AccountRow = {
  id: string;
  user_id: string;
  issuer: string;
  account_id: string;
  provider_id: string;
  password: string | null;
  access_token: Buffer | null;
  access_key_id: string | null;
  access_algorithm: string | null;
  access_expires_at: Date | null;
  refresh_token: Buffer | null;
  refresh_key_id: string | null;
  refresh_algorithm: string | null;
  refresh_expires_at: Date | null;
  id_token: Buffer | null;
  id_key_id: string | null;
  id_algorithm: string | null;
  scope: string | null;
};

type WebhookRow = {
  id: string;
  team_id: string;
  study_id: string | null;
  url: string;
  description: string | null;
  event_types: string[];
  secret_ciphertext: Buffer;
  secret_key_id: string;
  secret_algorithm: string;
};

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Exact non-secret fingerprint of the durable credential material. */
export function studioRecoveryAccountCredentialHash(row: AccountRow): string {
  return digest({
    password: row.password,
    access: row.access_token?.toString('base64') ?? null,
    accessKeyId: row.access_key_id,
    accessAlgorithm: row.access_algorithm,
    accessExpiresAt: row.access_expires_at?.toISOString() ?? null,
    refresh: row.refresh_token?.toString('base64') ?? null,
    refreshKeyId: row.refresh_key_id,
    refreshAlgorithm: row.refresh_algorithm,
    refreshExpiresAt: row.refresh_expires_at?.toISOString() ?? null,
    id: row.id_token?.toString('base64') ?? null,
    idKeyId: row.id_key_id,
    idAlgorithm: row.id_algorithm,
    scope: row.scope,
  });
}

/** Exact non-secret fingerprint of an active outbound integration. */
function studioRecoveryWebhookConfigurationHash(row: WebhookRow): string {
  return digest({
    studyId: row.study_id,
    url: row.url,
    description: row.description,
    eventTypes: row.event_types,
    secret: row.secret_ciphertext.toString('base64'),
    secretKeyId: row.secret_key_id,
    secretAlgorithm: row.secret_algorithm,
  });
}

function assertRows(actual: unknown, expected: unknown): void {
  try {
    deepStrictEqual(actual, expected);
  } catch {
    throw new Error(MISMATCH);
  }
}

async function assertOperator(client: pg.PoolClient, policy: Policy) {
  const result = await client.query<{ safe: boolean }>(
    `SELECT current_user = session_user AND (
       session_user = pg_catalog.pg_get_userbyid(database.datdba)
       OR session_user = ANY($1::pg_catalog.text[])
     ) AS safe
     FROM pg_catalog.pg_database database
     WHERE database.datname = pg_catalog.current_database()`,
    [[...policy.administrativeLogins]],
  );
  if (result.rows[0]?.safe !== true) throw new Error(FAILURE);
}

async function assertCurrentSchema(
  client: pg.PoolClient,
  policy: Policy,
): Promise<void> {
  const state = await checkSchema(
    client,
    {
      allowedLogins: [...policy.allowedLogins],
      administrativeLogins: [...policy.administrativeLogins],
    },
    { allowClosedEnrolledLogins: true },
  );
  if (state.kind !== 'current') throw new Error(FAILURE);
}

async function asMaintenance<T>(
  client: pg.PoolClient,
  operation: () => Promise<T>,
): Promise<T> {
  await client.query(`SET LOCAL ROLE ${TENANT_ROLES.maintenance}`);
  try {
    return await operation();
  } finally {
    await client.query('RESET ROLE');
  }
}

async function reconcileInventories(
  client: pg.PoolClient,
  evidence: StudioRecoveryAuthorizationReconciliation,
) {
  const freshness = await client.query<{ current: boolean }>(
    `SELECT statement_timestamp() >= $1::timestamptz - interval '5 minutes'
       AND statement_timestamp() <= $2::timestamptz AS current`,
    [evidence.issuedAt, evidence.expiresAt],
  );
  if (freshness.rows[0]?.current !== true) throw new Error(MISMATCH);
  const instance = await client.query<{
    name: string;
    initial_owner_user_id: string | null;
    initial_team_id: string | null;
    completed_at: Date;
  }>(`SELECT name, initial_owner_user_id, initial_team_id, completed_at
      FROM studio_instance`);
  assertRows(instance.rows, [
    {
      name: evidence.instance.name,
      initial_owner_user_id: evidence.instance.initialOwnerUserId,
      initial_team_id: evidence.instance.initialTeamId,
      completed_at: new Date(evidence.instance.completedAt),
    },
  ]);

  const users = await client.query<{
    id: string;
    email: string;
    email_verified: boolean;
  }>(`SELECT id, lower(email) AS email, "emailVerified" AS email_verified
      FROM "user" ORDER BY id`);
  const actualUsers = new Map(users.rows.map((row) => [row.id, row]));
  for (const expected of evidence.users) {
    const actual = actualUsers.get(expected.id);
    assertRows(actual, {
      id: expected.id,
      email: expected.email.trim().toLowerCase(),
      email_verified: expected.emailVerified,
    });
  }

  const teams = await client.query<{ id: string; slug: string }>(
    'SELECT id, slug FROM teams ORDER BY id',
  );
  const actualTeams = new Map(teams.rows.map((row) => [row.id, row]));
  for (const expected of evidence.teams)
    assertRows(actualTeams.get(expected.id), expected);

  const accounts =
    await client.query<AccountRow>(`SELECT id, "userId" AS user_id,
    issuer, "accountId" AS account_id, "providerId" AS provider_id, password,
    access_token_ciphertext AS access_token, access_token_key_id AS access_key_id,
    access_token_algorithm AS access_algorithm, "accessTokenExpiresAt" AS access_expires_at,
    refresh_token_ciphertext AS refresh_token, refresh_token_key_id AS refresh_key_id,
    refresh_token_algorithm AS refresh_algorithm, "refreshTokenExpiresAt" AS refresh_expires_at,
    id_token_ciphertext AS id_token, id_token_key_id AS id_key_id,
    id_token_algorithm AS id_algorithm, scope FROM account ORDER BY id`);
  const expectedAccounts = new Map(
    evidence.accounts.map((row) => [row.id, row]),
  );
  for (const expected of evidence.accounts) {
    const actual = accounts.rows.find((row) => row.id === expected.id);
    if (!actual) throw new Error(MISMATCH);
    assertRows(
      {
        id: actual.id,
        userId: actual.user_id,
        issuer: actual.issuer,
        accountId: actual.account_id,
        providerId: actual.provider_id,
        credentialSha256: studioRecoveryAccountCredentialHash(actual),
      },
      expected,
    );
  }
  const staleAccountIds = accounts.rows
    .filter(({ id }) => !expectedAccounts.has(id))
    .map(({ id }) => id);
  if (staleAccountIds.length)
    await client.query('DELETE FROM account WHERE id = ANY($1::text[])', [
      staleAccountIds,
    ]);

  await asMaintenance(client, async () => {
    const memberships = await client.query<{
      id: string;
      team_id: string;
      user_id: string;
      role: string;
    }>('SELECT id, team_id, user_id, role FROM team_members ORDER BY id');
    const expectedMemberships = new Map(
      evidence.memberships.map((row) => [row.id, row]),
    );
    for (const expected of evidence.memberships) {
      const actual = memberships.rows.find(({ id }) => id === expected.id);
      const roles = actual ? tryParseRoles(actual.role) : null;
      if (!actual || !roles) throw new Error(MISMATCH);
      assertRows(
        {
          id: actual.id,
          teamId: actual.team_id,
          userId: actual.user_id,
          roles: [...roles].toSorted(),
        },
        { ...expected, roles: [...expected.roles].toSorted() },
      );
    }
    const staleMembershipIds = memberships.rows
      .filter(({ id }) => !expectedMemberships.has(id))
      .map(({ id }) => id);
    if (staleMembershipIds.length)
      await client.query(
        'DELETE FROM team_members WHERE id = ANY($1::text[])',
        [staleMembershipIds],
      );

    const grants = await client.query<{
      id: string;
      team_id: string;
      study_id: string;
      user_id: string;
      role: string;
      pii_access: boolean;
    }>(`SELECT id, team_id, study_id, user_id, role, pii_access
        FROM study_role_grants ORDER BY id`);
    const expectedGrants = new Map(
      evidence.studyGrants.map((row) => [row.id, row]),
    );
    for (const expected of evidence.studyGrants) {
      const actual = grants.rows.find(({ id }) => id === expected.id);
      assertRows(
        actual && {
          id: actual.id,
          teamId: actual.team_id,
          studyId: actual.study_id,
          userId: actual.user_id,
          role: actual.role,
          piiAccess: actual.pii_access,
        },
        expected,
      );
    }
    const staleGrantIds = grants.rows
      .filter(({ id }) => !expectedGrants.has(id))
      .map(({ id }) => id);
    if (staleGrantIds.length)
      await client.query(
        'DELETE FROM study_role_grants WHERE id = ANY($1::uuid[])',
        [staleGrantIds],
      );

    const webhooks =
      await client.query<WebhookRow>(`SELECT id, team_id, study_id,
    url, description, event_types, secret_ciphertext, secret_key_id, secret_algorithm
    FROM webhook_subscriptions WHERE state = 'active' ORDER BY id`);
    const expectedWebhooks = new Map(
      evidence.activeWebhookSubscriptions.map((row) => [row.id, row]),
    );
    for (const expected of evidence.activeWebhookSubscriptions) {
      const actual = webhooks.rows.find(({ id }) => id === expected.id);
      if (!actual) throw new Error(MISMATCH);
      assertRows(
        {
          id: actual.id,
          teamId: actual.team_id,
          configurationSha256: studioRecoveryWebhookConfigurationHash(actual),
        },
        expected,
      );
    }
    const staleWebhookIds = webhooks.rows
      .filter(({ id }) => !expectedWebhooks.has(id))
      .map(({ id }) => id);
    if (staleWebhookIds.length)
      await client.query(
        `UPDATE webhook_subscriptions
        SET state = 'disabled', disabled_at = statement_timestamp(),
            updated_at = statement_timestamp()
        WHERE id = ANY($1::uuid[])`,
        [staleWebhookIds],
      );

    const activeSchedules = (
      await client.query<{ id: string }>(
        "SELECT id FROM study_schedules WHERE state = 'active' ORDER BY id",
      )
    ).rows.map(({ id }) => id);
    for (const id of evidence.activeScheduleIds)
      if (!activeSchedules.includes(id)) throw new Error(MISMATCH);
    await client.query(
      `UPDATE study_schedules SET state = 'paused', updated_at = statement_timestamp()
       WHERE state = 'active' AND NOT (id = ANY($1::uuid[]))`,
      [evidence.activeScheduleIds],
    );

    const publishedTemplates = (
      await client.query<{ id: string }>(
        "SELECT id FROM message_templates WHERE state = 'published' ORDER BY id",
      )
    ).rows.map(({ id }) => id);
    for (const id of evidence.publishedMessageTemplateIds)
      if (!publishedTemplates.includes(id)) throw new Error(MISMATCH);
    await client.query(
      `UPDATE message_templates SET state = 'retired', updated_at = statement_timestamp()
       WHERE state = 'published' AND NOT (id = ANY($1::uuid[]))`,
      [evidence.publishedMessageTemplateIds],
    );
  });
}

async function invalidateRestoredAdmission(client: pg.PoolClient) {
  await client.query('UPDATE "user" SET recovery_disabled = true');
  await client.query('DELETE FROM session');
  await client.query('DELETE FROM verification');
  await client.query(
    "UPDATE team_invitations SET status = 'canceled' WHERE status = 'pending'",
  );
  await asMaintenance(client, async () => {
    await client.query(
      `UPDATE api_tokens SET revoked_at = statement_timestamp(),
         revoked_by_user_id = $1 WHERE revoked_at IS NULL`,
      [RECOVERY_ACTOR],
    );
    await client.query(
      'UPDATE interview_links SET revoked_at = statement_timestamp() WHERE revoked_at IS NULL',
    );
    await client.query(
      `UPDATE leases SET expires_at = statement_timestamp()
       WHERE expires_at > statement_timestamp()`,
    );
  });
}

async function holdRestoredDeliveries(client: pg.PoolClient) {
  await asMaintenance(client, async () => {
    await client.query(`UPDATE message_deliveries
    SET uncertain_at = statement_timestamp(),
      lease_owner = NULL, lease_expires_at = NULL
    WHERE sent_at IS NULL AND failed_at IS NULL
      AND suppressed_at IS NULL AND uncertain_at IS NULL`);
    await client.query(`UPDATE team_invitation_deliveries
    SET uncertain_at = statement_timestamp(),
      lease_owner = NULL, lease_expires_at = NULL
    WHERE sent_at IS NULL AND failed_at IS NULL
      AND suppressed_at IS NULL AND uncertain_at IS NULL`);
    await client.query(`UPDATE webhook_deliveries
    SET uncertain_at = statement_timestamp(),
      lease_owner = NULL, lease_expires_at = NULL
    WHERE delivered_at IS NULL AND failed_at IS NULL AND uncertain_at IS NULL`);
    await client.query(`UPDATE audit_alert_outbox
    SET uncertain_at = statement_timestamp(),
      lease_owner = NULL, lease_expires_at = NULL
    WHERE delivered_at IS NULL AND failed_at IS NULL
      AND suppressed_at IS NULL AND uncertain_at IS NULL`);
    await client.query(`UPDATE audit_alert_deliveries
    SET uncertain_at = statement_timestamp(),
      lease_owner = NULL, lease_expires_at = NULL
    WHERE delivered_at IS NULL AND failed_at IS NULL
      AND suppressed_at IS NULL AND uncertain_at IS NULL`);
  });
}

export type StudioRecoveryAuthorizationReceipt = {
  format: 'studio-recovery-authorization-receipt';
  version: 1;
  reconciliationSha256: string;
  destination: { database: string; schemaFingerprint: string };
  instance: StudioRecoveryAuthorizationReconciliation['instance'];
};

/** Reconcile one isolated restore while every public and worker identity stays
 * closed. This command deliberately leaves every human login recovery-disabled. */
export async function reconcileStudioRecoveryAuthorization(options: {
  pool: pg.Pool;
  backupPool: pg.Pool;
  policy: Policy;
  reconciliation: StudioRecoveryAuthorizationReconciliation;
  reconciliationSha256: string;
}): Promise<StudioRecoveryAuthorizationReceipt> {
  const evidence = copyStudioRecoveryAuthorizationReconciliation(
    options.reconciliation,
  );
  if (!/^[0-9a-f]{64}$/.test(options.reconciliationSha256))
    throw new Error(FAILURE);
  const policy = {
    allowedLogins: [...options.policy.allowedLogins],
    administrativeLogins: [...options.policy.administrativeLogins],
  };
  let client: pg.PoolClient | undefined;
  let backup: pg.PoolClient | undefined;
  let committed = false;
  let backupCompleted = false;
  let discard = false;
  let backupDiscard = false;
  try {
    client = await options.pool.connect();
    backup = await options.backupPool.connect();
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await backup.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL lock_timeout = '10s';
      SET LOCAL statement_timeout = '5min';
      SET LOCAL idle_in_transaction_session_timeout = '5min'`);
    await backup.query(`SET LOCAL statement_timeout = '5min';
      SET LOCAL idle_in_transaction_session_timeout = '5min'`);
    const backupPid = (
      await backup.query<{ pid: number }>(
        'SELECT pg_catalog.pg_backend_pid() AS pid',
      )
    ).rows[0]?.pid;
    if (!backupPid) throw new Error(FAILURE);
    await assertOperator(client, policy);
    await assertCurrentSchema(client, policy);
    await assertBackupAccess(backup, (checked) =>
      assertCurrentSchema(checked, policy),
    );
    await assertSamePostgresDatabase(client, backup).catch(() => {
      throw new Error(FAILURE);
    });
    await assertStudioRecoveryQuarantine(client, {
      ...policy,
      allowedClientPids: [backupPid],
      transaction: { isolation: 'serializable', readOnly: false },
    });
    await client.query(`LOCK TABLE "user", session, account, verification,
      teams, team_members, team_invitations, team_invitation_deliveries,
      study_role_grants, api_tokens, interview_links, webhook_subscriptions,
      webhook_deliveries, study_schedules, message_templates, message_deliveries,
      audit_alert_outbox, audit_alert_deliveries, leases
      IN SHARE ROW EXCLUSIVE MODE`);
    await reconcileInventories(client, evidence);
    await invalidateRestoredAdmission(client);
    await holdRestoredDeliveries(client);
    const remainingAdmission = await client.query<{
      sessions: number;
      verifications: number;
      users_enabled: number;
      invitations: number;
    }>(`SELECT
      (SELECT count(*)::int FROM session) sessions,
      (SELECT count(*)::int FROM verification) verifications,
      (SELECT count(*)::int FROM "user" WHERE NOT recovery_disabled) users_enabled,
      (SELECT count(*)::int FROM team_invitations WHERE status = 'pending') invitations`);
    assertRows(remainingAdmission.rows[0], {
      sessions: 0,
      verifications: 0,
      users_enabled: 0,
      invitations: 0,
    });
    const ownerClient = client;
    const remainingTenantState = await asMaintenance(ownerClient, async () =>
      ownerClient.query<{
        tokens: number;
        links: number;
        live_leases: number;
        deliveries: number;
      }>(`SELECT
      (SELECT count(*)::int FROM api_tokens WHERE revoked_at IS NULL) tokens,
      (SELECT count(*)::int FROM interview_links WHERE revoked_at IS NULL) links,
      (SELECT count(*)::int FROM leases WHERE expires_at > statement_timestamp()) live_leases,
      ((SELECT count(*) FROM message_deliveries WHERE sent_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL)
       + (SELECT count(*) FROM team_invitation_deliveries WHERE sent_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL)
       + (SELECT count(*) FROM webhook_deliveries WHERE delivered_at IS NULL AND failed_at IS NULL AND uncertain_at IS NULL)
       + (SELECT count(*) FROM audit_alert_outbox WHERE delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL)
       + (SELECT count(*) FROM audit_alert_deliveries WHERE delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL))::int deliveries`),
    );
    assertRows(remainingTenantState.rows[0], {
      tokens: 0,
      links: 0,
      live_leases: 0,
      deliveries: 0,
    });
    await reconcileInventories(client, evidence);
    await assertStudioRecoveryQuarantine(client, {
      ...policy,
      allowedClientPids: [backupPid],
      transaction: { isolation: 'serializable', readOnly: false },
    });
    const destination = (
      await client.query<{ database: string; fingerprint: string }>(
        `SELECT current_database() AS database, fingerprint
         FROM "schemaFingerprint"`,
      )
    ).rows[0];
    if (!destination) throw new Error(FAILURE);
    await backup.query('ROLLBACK');
    backupCompleted = true;
    await client.query('COMMIT');
    committed = true;
    return {
      format: 'studio-recovery-authorization-receipt',
      version: 1,
      reconciliationSha256: options.reconciliationSha256,
      destination: {
        database: destination.database,
        schemaFingerprint: destination.fingerprint,
      },
      instance: evidence.instance,
    };
  } catch {
    discard = true;
    throw new Error(FAILURE);
  } finally {
    if (client && !committed)
      await client.query('ROLLBACK').catch(() => {
        discard = true;
      });
    if (!backupCompleted)
      await backup?.query('ROLLBACK').catch(() => {
        backupDiscard = true;
      });
    client?.release(discard);
    backup?.release(backupDiscard);
  }
}
