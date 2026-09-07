import { deepStrictEqual } from 'node:assert';

import type pg from 'pg';

import { assertSamePostgresDatabase } from '@codaco/studio-sync/postgres-database-identity';
import {
  readTemplateArtifact,
  templateBytesHash,
} from '@codaco/studio-sync/template-exchange';

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

function assertReconciliationUsers(
  actual: readonly string[],
  reconciliation: RegistryRecoveryReconciliation,
) {
  const expected = reconciliation.users.map((user) => user.id).toSorted();
  if (!sameUserIds(actual.toSorted(), expected))
    throw new Error('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
}

async function verifyArtifacts(
  client: pg.PoolClient,
  blobs: RegistryBlobStore,
) {
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
    if (
      !bytes ||
      bytes.byteLength !== row.byte_size ||
      templateBytesHash(bytes) !== row.raw_hash
    )
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
  }
}

async function assertRegistryRecoveryQuarantine(
  client: pg.PoolClient,
  policy: ReturnType<typeof copyRegistryDatabasePolicy>,
  backupPid: number,
) {
  await client.query('SELECT pg_catalog.pg_stat_clear_snapshot()');
  const result = await client.query<{ safe: boolean }>(
    `WITH database AS MATERIALIZED (
       SELECT datdba FROM pg_catalog.pg_database
       WHERE datname = pg_catalog.current_database()
     ), runtime_logins AS MATERIALIZED (
       SELECT login.oid, login.rolcanlogin
       FROM pg_catalog.pg_roles login, database
       WHERE login.rolname = ANY($1::pg_catalog.text[])
         AND login.oid <> database.datdba
         AND NOT login.rolname = ANY($2::pg_catalog.text[])
         AND EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members membership
           JOIN pg_catalog.pg_roles role ON role.oid = membership.roleid
           WHERE membership.member = login.oid
             AND role.rolname = ANY($3::pg_catalog.text[])
         )
     ) SELECT
       (SELECT count(*) FROM runtime_logins) = $4::pg_catalog.int4
       AND NOT EXISTS (SELECT 1 FROM runtime_logins WHERE rolcanlogin)
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_stat_activity activity
         WHERE activity.datname = pg_catalog.current_database()
           AND activity.usesysid IN (SELECT oid FROM runtime_logins)
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_stat_activity activity
         WHERE activity.datname = pg_catalog.current_database()
           AND activity.backend_type = 'client backend'
           AND activity.pid NOT IN (pg_catalog.pg_backend_pid(), $5::pg_catalog.int4)
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_catalog.pg_prepared_xacts prepared
         WHERE prepared.database = pg_catalog.current_database()
       ) AS safe`,
    [
      policy.allowedLogins,
      policy.administrativeLogins,
      Object.values(REGISTRY_ROLES),
      Object.values(REGISTRY_ROLES).length,
      backupPid,
    ],
  );
  if (result.rows[0]?.safe !== true)
    throw new Error('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
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
  const client = await pool.connect();
  let backupClient: pg.PoolClient | undefined;
  let discard = false;
  let backupDiscard = false;
  let committed = false;
  let backupCompleted = false;
  try {
    backupClient = await backupPool.connect();
    await client.query('BEGIN');
    await backupClient.query('BEGIN READ ONLY');
    const backupPid = (
      await backupClient.query<{ pid: number }>(
        'SELECT pg_catalog.pg_backend_pid() AS pid',
      )
    ).rows[0]?.pid;
    if (!backupPid) throw new Error('REGISTRY_RECOVERY_DATABASE_MISMATCH');
    await assertRegistryMigrationOperator(client, policy);
    const ownerIdentity = await readRegistrySchemaIdentity(client, policy, {
      allowClosedEnrolledLogins: true,
    });
    let backupIdentity = '';
    await assertRegistryBackupAccess(backupClient, async (checkedBackup) => {
      backupIdentity = await readRegistrySchemaIdentity(checkedBackup, policy, {
        allowClosedEnrolledLogins: true,
      });
    });
    if (ownerIdentity !== backupIdentity)
      throw new Error('REGISTRY_RECOVERY_DATABASE_MISMATCH');
    try {
      await assertSamePostgresDatabase(client, backupClient);
    } catch {
      throw new Error('REGISTRY_RECOVERY_DATABASE_MISMATCH');
    }
    await assertRegistryRecoveryQuarantine(client, policy, backupPid);
    await client.query(`LOCK TABLE registry_auth_user, registry_auth_session,
      registry_auth_verification, registry_publishers, registry_operators,
      registry_credentials, registry_artifacts, registry_artifact_content
      IN SHARE ROW EXCLUSIVE MODE`);
    const users = await client.query<{ id: string }>(
      'SELECT id FROM registry_auth_user ORDER BY id',
    );
    assertReconciliationUsers(
      users.rows.map((user) => user.id),
      evidence,
    );
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
    await verifyArtifacts(client, blobs);
    await assertRegistryRecoveryQuarantine(client, policy, backupPid);
    await backupClient.query('ROLLBACK');
    backupCompleted = true;
    await client.query('COMMIT');
    committed = true;
  } catch (error) {
    discard = true;
    throw error;
  } finally {
    if (!committed) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
    }
    if (!backupCompleted) {
      try {
        await backupClient?.query('ROLLBACK');
      } catch {
        backupDiscard = true;
      }
    }
    client.release(discard);
    backupClient?.release(backupDiscard);
  }
}
