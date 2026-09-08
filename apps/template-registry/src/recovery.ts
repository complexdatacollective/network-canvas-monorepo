import { deepStrictEqual } from 'node:assert';

import type pg from 'pg';

import { normalizeMailbox } from '@codaco/studio-sync/email-sender';
import { assertPostgresRecoveryQuarantine } from '@codaco/studio-sync/postgres-recovery-quarantine';
import { readTemplateArtifact } from '@codaco/studio-sync/template-exchange';

import type { RegistryBlobStore } from './blob-store.ts';
import {
  assertRegistryMigrationOperator,
  copyRegistryDatabasePolicy,
  type RegistryDatabaseAdmission,
} from './db/admission.ts';
import { assertRegistryBackupAccess } from './db/backup.ts';
import { readRegistrySchemaIdentity } from './db/schema-state.ts';
import { REGISTRY_ROLES } from './db/schema.ts';
import {
  copyRegistryRecoveryReconciliation,
  type RegistryRecoveryReconciliation,
} from './recovery-reconciliation.ts';

type Artifact = {
  root: string;
  raw_hash: string;
  byte_size: number;
  template: unknown;
  metadata: unknown;
  license: unknown;
};

function sameUserIds(actual: readonly string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    actual.every((id, index) => id === expected[index])
  );
}

type RecoveredUser = { id: string; email: string; email_verified: boolean };

function assertReconciliationUsers(
  actual: readonly RecoveredUser[],
  reconciliation: RegistryRecoveryReconciliation,
) {
  const expected = new Map(reconciliation.users.map((user) => [user.id, user]));
  if (
    actual.length !== expected.size ||
    actual.some((user) => {
      const evidence = expected.get(user.id);
      return (
        !evidence ||
        normalizeMailbox(user.email) !== evidence.email ||
        user.email_verified !== evidence.emailVerified
      );
    })
  )
    throw new Error('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
}

async function keepRecoveryTransactionsAlive(
  client: pg.PoolClient,
  backup: pg.PoolClient,
) {
  await Promise.all([client.query('SELECT 1'), backup.query('SELECT 1')]);
}

export async function verifyRegistryRecoveryArtifacts(
  client: pg.PoolClient,
  backup: pg.PoolClient,
  blobs: RegistryBlobStore,
) {
  await blobs.ready();
  const artifacts = await client.query<Artifact>(
    `SELECT artifact.root, artifact.raw_hash, artifact.byte_size,
      content.template, content.metadata, content.license
    FROM registry_artifacts artifact
    LEFT JOIN registry_artifact_content content ON content.root = artifact.root
    WHERE artifact.deleted_at IS NULL ORDER BY artifact.root`,
  );
  for (const row of artifacts.rows) {
    if (row.template === null || row.metadata === null || row.license === null)
      throw new Error('REGISTRY_RECOVERY_ARTIFACT_INVALID');
    const bytes = await blobs.get(row.raw_hash);
    if (!bytes || bytes.byteLength !== row.byte_size)
      throw new Error('REGISTRY_RECOVERY_ARTIFACT_INVALID');
    const artifact = await readTemplateArtifact(bytes).catch(() => {
      throw new Error('REGISTRY_RECOVERY_ARTIFACT_INVALID');
    });
    try {
      if (artifact.manifest.merkle_root !== row.root)
        throw new Error('Registry artifact root does not match.');
      deepStrictEqual(artifact.manifest.template, row.template);
      deepStrictEqual(artifact.metadata, row.metadata);
      deepStrictEqual(artifact.license, row.license);
    } catch {
      throw new Error('REGISTRY_RECOVERY_ARTIFACT_INVALID');
    }
    await keepRecoveryTransactionsAlive(client, backup);
  }
}

/**
 * Reconcile an isolated restored Registry while all serving identities remain
 * quarantined. This is intentionally not a runtime admission action.
 */
export async function reconcileRegistryRecovery({
  pool,
  backupPool,
  blobs,
  admission,
  reconciliation,
}: {
  pool: pg.Pool;
  backupPool: pg.Pool;
  blobs: RegistryBlobStore;
  admission: RegistryDatabaseAdmission;
  reconciliation: RegistryRecoveryReconciliation;
}): Promise<void> {
  const policy = copyRegistryDatabasePolicy(admission);
  const evidence = copyRegistryRecoveryReconciliation(reconciliation);
  let client: pg.PoolClient | undefined;
  let backup: pg.PoolClient | undefined;
  let discard = false;
  let backupDiscard = false;
  let committed = false;
  let backupCompleted = false;
  try {
    client = await pool.connect();
    backup = await backupPool.connect();
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await backup.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
    await client.query(
      "SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '5min'; SET LOCAL idle_in_transaction_session_timeout = '5min'",
    );
    await backup.query(
      "SET LOCAL statement_timeout = '5min'; SET LOCAL idle_in_transaction_session_timeout = '5min'",
    );
    await assertRegistryMigrationOperator(client, policy);
    await readRegistrySchemaIdentity(client, policy, {
      allowClosedEnrolledLogins: true,
    });
    await assertRegistryBackupAccess(backup, async (checked) => {
      await readRegistrySchemaIdentity(checked, policy, {
        allowClosedEnrolledLogins: true,
      });
    });
    const backupPid = (
      await backup.query<{ pid: number }>(
        'SELECT pg_catalog.pg_backend_pid() AS pid',
      )
    ).rows[0]?.pid;
    if (!backupPid) throw new Error('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
    const quarantine = {
      ...policy,
      runtimeRoles: Object.values(REGISTRY_ROLES),
      allowedClientPids: [backupPid],
      transaction: { isolation: 'serializable' as const, readOnly: false },
    };
    await assertPostgresRecoveryQuarantine(client, backup, quarantine).catch(
      () => {
        throw new Error('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
      },
    );
    await client.query(`LOCK TABLE registry_auth_user, registry_auth_session,
      registry_auth_verification, registry_publishers, registry_operators,
      registry_credentials, registry_artifacts, registry_artifact_content
      IN SHARE ROW EXCLUSIVE MODE`);
    const users = await client.query<RecoveredUser>(
      'SELECT id, email, email_verified FROM registry_auth_user ORDER BY id',
    );
    assertReconciliationUsers(users.rows, evidence);
    await verifyRegistryRecoveryArtifacts(client, backup, blobs);
    const publisherIds = evidence.users
      .filter((user) => user.publisher !== 'none')
      .map((user) => user.id);
    const actualPublishers = await client.query<{ user_id: string }>(
      'SELECT user_id FROM registry_publishers ORDER BY user_id',
    );
    if (
      !sameUserIds(
        actualPublishers.rows.map((publisher) => publisher.user_id),
        publisherIds.toSorted(),
      )
    )
      throw new Error('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
    await client.query('DELETE FROM registry_auth_session');
    await client.query('DELETE FROM registry_auth_verification');
    await client.query(
      `UPDATE registry_credentials SET revoked_at = statement_timestamp()
       WHERE revoked_at IS NULL`,
    );
    await client.query(
      `UPDATE registry_publishers AS publisher SET suspended_at = CASE
        WHEN evidence.suspended THEN statement_timestamp() ELSE NULL END
       FROM unnest($1::text[], $2::boolean[]) AS evidence(user_id, suspended)
       WHERE publisher.user_id = evidence.user_id`,
      [
        publisherIds,
        evidence.users
          .filter((user) => user.publisher !== 'none')
          .map((user) => user.publisher === 'suspended'),
      ],
    );
    await client.query('UPDATE registry_operators SET enabled = false');
    const enabledOperators = evidence.users
      .filter((user) => user.operator)
      .map((user) => user.id);
    if (enabledOperators.length)
      await client.query(
        `INSERT INTO registry_operators(user_id, enabled)
         SELECT unnest($1::text[]), true
         ON CONFLICT (user_id) DO UPDATE SET enabled = excluded.enabled`,
        [enabledOperators],
      );
    const remaining = await client.query<{
      sessions: number;
      verifications: number;
      credentials: number;
    }>(`SELECT
      (SELECT count(*)::integer FROM registry_auth_session) AS sessions,
      (SELECT count(*)::integer FROM registry_auth_verification) AS verifications,
      (SELECT count(*)::integer FROM registry_credentials WHERE revoked_at IS NULL) AS credentials`);
    if (
      remaining.rows[0]?.sessions !== 0 ||
      remaining.rows[0]?.verifications !== 0 ||
      remaining.rows[0]?.credentials !== 0
    )
      throw new Error('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
    await assertPostgresRecoveryQuarantine(client, backup, quarantine).catch(
      () => {
        throw new Error('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
      },
    );
    await backup.query('ROLLBACK');
    backupCompleted = true;
    await client.query('COMMIT');
    committed = true;
  } catch (error) {
    discard = true;
    throw error;
  } finally {
    if (client && !committed)
      await client.query('ROLLBACK').catch(() => {
        discard = true;
      });
    if (backup && !backupCompleted)
      await backup.query('ROLLBACK').catch(() => {
        backupDiscard = true;
      });
    client?.release(discard);
    backup?.release(backupDiscard);
  }
}
