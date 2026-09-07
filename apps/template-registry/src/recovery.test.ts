import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Client, escapeIdentifier } from 'pg';
import { expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';
import { revokeLargeObjectPrivilegesSql } from '@codaco/studio-sync/role-bootstrap';
import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

import { createRegistryFixture } from './__tests__/fixtures.ts';
import { createRegistryInstallation } from './__tests__/installation.ts';
import { REGISTRY_TEST_DATABASE_URL } from './__tests__/test-env.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './db/fingerprint.generated.ts';
import { registryMigrator } from './db/migrate.ts';
import { REGISTRY_BACKUP_ROLE } from './db/schema.ts';
import type { RegistryRecoveryReconciliation } from './recovery-reconciliation.ts';
import { reconcileRegistryRecovery } from './recovery.ts';

type Installation = Awaited<ReturnType<typeof createRegistryInstallation>>;

async function quarantine(installation: Installation) {
  await installation.closeRuntimePools();
  await installation.withAdministrator(async (administrator) => {
    await administrator.query(
      `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
       ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
    );
  });
}

it('reconciles an isolated restored registry only after schema, backup, and artifact proofs', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  const migrations = await readMigrations(
    fileURLToPath(new URL('../migrations', import.meta.url)),
    'Template Registry',
  );
  try {
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const account = await fixture.account('restored@example.test', true);
    await fixture.published(account.token, 'Recovered template');
    await fixture.owner.query(
      `INSERT INTO registry_auth_verification(id, identifier, value, expires_at)
       VALUES ('restored-one-time', 'restored@example.test', 'one-time', statement_timestamp() + interval '5 minutes')`,
    );
    await quarantine(installation);

    await reconcileRegistryRecovery({
      pool: fixture.owner,
      backupPool: installation.backupPool,
      blobs: fixture.blobs,
      admission: { allowedLogins: installation.allowedLogins },
      reconciliation: {
        format: 'template-registry-recovery-reconciliation',
        version: 1,
        users: [
          {
            id: account.session.userId,
            publisher: 'active',
            operator: false,
          },
        ],
      },
    });

    expect(
      (
        await fixture.owner.query(`SELECT
          (SELECT count(*)::integer FROM registry_auth_session) AS sessions,
          (SELECT count(*)::integer FROM registry_auth_verification) AS verifications,
          (SELECT count(*)::integer FROM registry_credentials WHERE revoked_at IS NULL) AS credentials,
          (SELECT count(*)::integer FROM registry_operators WHERE enabled) AS operators,
          (SELECT count(*)::integer FROM registry_publishers WHERE suspended_at IS NULL) AS publishers`)
      ).rows,
    ).toEqual([
      {
        sessions: 0,
        verifications: 0,
        credentials: 0,
        operators: 0,
        publishers: 1,
      },
    ]);
  } finally {
    await fixture.dispose();
  }
});

it.each(['missing', 'corrupt'] as const)(
  'rolls back every reconciliation write when restored artifact bytes are %s',
  async (failure) => {
    const installation = await createRegistryInstallation();
    const fixture = await createRegistryFixture({}, installation);
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    try {
      await registryMigrator.migrate(
        fixture.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        installation.allowedLogins,
      );
      const account = await fixture.account('tampered@example.test', true);
      const published = await fixture.published(
        account.token,
        'Tampered template',
      );
      const rawHash = templateBytesHash(published.bytes);
      if (failure === 'missing') fixture.objects.delete(rawHash);
      else fixture.objects.set(rawHash, new Uint8Array([1]));
      await fixture.owner.query(
        `INSERT INTO registry_auth_verification(id, identifier, value, expires_at)
       VALUES ('rollback-one-time', 'tampered@example.test', 'one-time', statement_timestamp() + interval '5 minutes')`,
      );
      await quarantine(installation);

      await expect(
        reconcileRegistryRecovery({
          pool: fixture.owner,
          backupPool: installation.backupPool,
          blobs: fixture.blobs,
          admission: { allowedLogins: installation.allowedLogins },
          reconciliation: {
            format: 'template-registry-recovery-reconciliation',
            version: 1,
            users: [
              {
                id: account.session.userId,
                publisher: 'suspended',
                operator: false,
              },
            ],
          },
        }),
      ).rejects.toThrow('REGISTRY_RECOVERY_ARTIFACT_INVALID');
      expect(
        (
          await fixture.owner.query(`SELECT
          (SELECT count(*)::integer FROM registry_auth_session) AS sessions,
          (SELECT count(*)::integer FROM registry_auth_verification) AS verifications,
          (SELECT count(*)::integer FROM registry_credentials WHERE revoked_at IS NULL) AS credentials,
          (SELECT count(*)::integer FROM registry_publishers WHERE suspended_at IS NULL) AS active_publishers,
          (SELECT count(*)::integer FROM registry_operators WHERE enabled) AS enabled_operators`)
        ).rows,
      ).toEqual([
        {
          sessions: 1,
          verifications: 1,
          credentials: 1,
          active_publishers: 1,
          enabled_operators: 1,
        },
      ]);
    } finally {
      await fixture.dispose();
    }
  },
);

it('requires closed, drained runtime identities before touching restored state', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  const writerUrl = new URL(installation.runtimeDatabaseUrl);
  writerUrl.searchParams.set('options', `-c role=${installation.role}`);
  const survivingWriter = new Client({
    connectionString: writerUrl.toString(),
  });
  let writerConnected = false;
  const migrations = await readMigrations(
    fileURLToPath(new URL('../migrations', import.meta.url)),
    'Template Registry',
  );
  try {
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: installation,
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 1,
          users: [],
        },
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
    await survivingWriter.connect();
    writerConnected = true;
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );
    expect(
      (
        await fixture.owner.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_stat_activity
           WHERE datname = current_database() AND usename = $1`,
          [installation.logins.app],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: installation,
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 1,
          users: [],
        },
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
    await survivingWriter.end();
    writerConnected = false;
    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: installation,
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 1,
          users: [],
        },
      }),
    ).resolves.toBeUndefined();
  } finally {
    if (writerConnected) await survivingWriter.end();
    await fixture.dispose();
  }
});

it('authenticates bytes returned by an injected blob store', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  const migrations = await readMigrations(
    fileURLToPath(new URL('../migrations', import.meta.url)),
    'Template Registry',
  );
  try {
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const account = await fixture.account('hash@example.test');
    const published = await fixture.published(account.token, 'Hash mismatch');
    const wrongHash = '0'.repeat(64);
    await fixture.owner.query(
      'UPDATE registry_artifacts SET raw_hash = $1 WHERE root = $2',
      [wrongHash, published.artifact.manifest.merkle_root],
    );
    await quarantine(installation);
    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: { ...fixture.blobs, get: async () => published.bytes },
        admission: installation,
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 1,
          users: [
            {
              id: account.session.userId,
              publisher: 'active',
              operator: false,
            },
          ],
        },
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_ARTIFACT_INVALID');
  } finally {
    await fixture.dispose();
  }
});

it('snapshots current reconciliation evidence before asynchronous verification', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  const migrations = await readMigrations(
    fileURLToPath(new URL('../migrations', import.meta.url)),
    'Template Registry',
  );
  try {
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const account = await fixture.account('snapshot@example.test');
    await fixture.published(account.token, 'Snapshot evidence');
    const reconciliation: RegistryRecoveryReconciliation = {
      format: 'template-registry-recovery-reconciliation',
      version: 1,
      users: [
        {
          id: account.session.userId,
          publisher: 'active',
          operator: false,
        },
      ],
    };
    await quarantine(installation);
    const recovery = reconcileRegistryRecovery({
      pool: fixture.owner,
      backupPool: installation.backupPool,
      blobs: fixture.blobs,
      admission: installation,
      reconciliation,
    });
    reconciliation.users[0]!.publisher = 'suspended';
    await recovery;
    expect(
      (
        await fixture.owner.query(
          'SELECT suspended_at FROM registry_publishers WHERE user_id = $1',
          [account.session.userId],
        )
      ).rows,
    ).toEqual([{ suspended_at: null }]);
  } finally {
    await fixture.dispose();
  }
});

it('refuses owner and backup transactions on distinct live restored databases even with matching stamps', async () => {
  const installation = await createRegistryInstallation();
  const migrations = await readMigrations(
    fileURLToPath(new URL('../migrations', import.meta.url)),
    'Template Registry',
  );
  const peerName = `registry_recovery_peer_${randomUUID().replaceAll('-', '')}`;
  const peerOwnerUrl = new URL(installation.databaseUrl);
  peerOwnerUrl.pathname = `/${peerName}`;
  const peerBackupUrl = new URL(installation.backupDatabaseUrl);
  peerBackupUrl.pathname = `/${peerName}`;
  const peerAdministratorUrl = new URL(REGISTRY_TEST_DATABASE_URL);
  peerAdministratorUrl.pathname = `/${peerName}`;
  const peerOwner = createPostgresPool({
    connectionString: peerOwnerUrl.toString(),
    max: 1,
    onIdleError: () => {
      throw new Error('REGISTRY_TEST_DATABASE_IDLE_ERROR');
    },
  });
  const peerBackup = createPostgresPool({
    connectionString: peerBackupUrl.toString(),
    role: REGISTRY_BACKUP_ROLE,
    max: 1,
    onIdleError: () => {
      throw new Error('REGISTRY_TEST_DATABASE_IDLE_ERROR');
    },
  });
  const peerAdministrator = createPostgresPool({
    connectionString: peerAdministratorUrl.toString(),
    max: 1,
    onIdleError: () => {
      throw new Error('REGISTRY_TEST_DATABASE_IDLE_ERROR');
    },
  });
  try {
    await installation.withAdministrator(async (administrator) => {
      await administrator.query(
        `CREATE DATABASE ${escapeIdentifier(peerName)} OWNER ${escapeIdentifier(installation.logins.owner)}`,
      );
      await administrator.query(`REVOKE ALL ON DATABASE ${escapeIdentifier(peerName)} FROM PUBLIC;
        REVOKE TEMPORARY ON DATABASE ${escapeIdentifier(peerName)} FROM ${installation.allowedLogins.map(escapeIdentifier).join(', ')};
        GRANT CONNECT ON DATABASE ${escapeIdentifier(peerName)} TO ${installation.allowedLogins.map(escapeIdentifier).join(', ')}`);
    });
    await peerOwner.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await peerAdministrator.query(
      revokeLargeObjectPrivilegesSql([
        ...Object.values(installation.roles),
        REGISTRY_BACKUP_ROLE,
        ...installation.allowedLogins,
      ]),
    );
    await registryMigrator.migrate(
      installation.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    await registryMigrator.migrate(
      peerOwner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const identity = (
      await installation.owner.query<{ instance_id: string }>(
        'SELECT instance_id FROM registry_schema_fingerprint',
      )
    ).rows[0]?.instance_id;
    await peerOwner.query(
      'UPDATE registry_schema_fingerprint SET instance_id = $1',
      [identity],
    );
    await quarantine(installation);
    await expect(
      reconcileRegistryRecovery({
        pool: installation.owner,
        backupPool: peerBackup,
        blobs: {
          put: async () => undefined,
          get: async () => null,
          delete: async () => undefined,
          scan: async () => ({ objects: [] }),
          ready: async () => undefined,
          close: () => undefined,
        },
        admission: installation,
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 1,
          users: [],
        },
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_DATABASE_MISMATCH');
  } finally {
    await Promise.all([
      peerOwner.end(),
      peerBackup.end(),
      peerAdministrator.end(),
    ]);
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `DROP DATABASE IF EXISTS ${escapeIdentifier(peerName)}`,
      ),
    );
    await installation.dispose();
  }
});
