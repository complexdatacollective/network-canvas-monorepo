import { fileURLToPath } from 'node:url';

import { escapeIdentifier, escapeLiteral } from 'pg';
import type { PoolClient } from 'pg';
import { expect, it, vi } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

import { createRegistryFixture } from './__tests__/fixtures.ts';
import { createRegistryInstallation } from './__tests__/installation.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './db/fingerprint.generated.ts';
import { registryMigrator } from './db/migrate.ts';
import { reconcileRegistryRecovery } from './recovery.ts';

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
    await fixture.owner.query(
      `INSERT INTO registry_auth_user(id, name, email, email_verified, updated_at)
       VALUES ('inactive-unverified', 'Inactive', 'inactive@EXAMPLE.TEST', false, statement_timestamp())`,
    );
    await installation.closeRuntimePools();
    await installation.withAdministrator(async (administrator) => {
      await administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      );
    });
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
            email: 'restored@example.test',
            emailVerified: true,
            publisher: 'active',
            operator: false,
          },
          {
            id: 'inactive-unverified',
            email: 'inactive@example.test',
            emailVerified: false,
            publisher: 'none',
            operator: false,
          },
        ],
      },
    });

    expect(fixture.blobs.ready).toHaveBeenCalledOnce();
    expect(
      (
        await fixture.owner.query(
          "SELECT email, email_verified FROM registry_auth_user WHERE id = 'inactive-unverified'",
        )
      ).rows,
    ).toEqual([{ email: 'inactive@EXAMPLE.TEST', email_verified: false }]);

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

it('requires object-store readiness even when the restored registry has no artifacts', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );
    vi.mocked(fixture.blobs.ready).mockRejectedValueOnce(
      new Error('object store unavailable'),
    );

    await expect(
      reconcileRegistryRecovery({
        pool: fixture.owner,
        backupPool: installation.backupPool,
        blobs: fixture.blobs,
        admission: { allowedLogins: installation.allowedLogins },
        reconciliation: {
          format: 'template-registry-recovery-reconciliation',
          version: 1,
          users: [],
        },
      }),
    ).rejects.toThrow('object store unavailable');
    expect(fixture.blobs.get).not.toHaveBeenCalled();
  } finally {
    await fixture.dispose();
  }
});

it.each(['email', 'verification'] as const)(
  'refuses restored user %s drift before restoring publisher authority',
  async (kind) => {
    const installation = await createRegistryInstallation();
    const fixture = await createRegistryFixture({}, installation);
    try {
      const migrations = await readMigrations(
        fileURLToPath(new URL('../migrations', import.meta.url)),
        'Template Registry',
      );
      await registryMigrator.migrate(
        fixture.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        installation.allowedLogins,
      );
      const account = await fixture.account('approved@example.test');
      await fixture.published(account.token, 'Authority binding');
      await fixture.owner.query(
        kind === 'email'
          ? 'UPDATE registry_auth_user SET email = $2 WHERE id = $1'
          : 'UPDATE registry_auth_user SET email_verified = false WHERE id = $1',
        kind === 'email'
          ? [account.session.userId, 'restored-attacker@example.test']
          : [account.session.userId],
      );
      await installation.closeRuntimePools();
      await installation.withAdministrator((administrator) =>
        administrator.query(
          `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
           ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
        ),
      );

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
                email: 'approved@EXAMPLE.TEST',
                emailVerified: true,
                publisher: 'active',
                operator: false,
              },
            ],
          },
        }),
      ).rejects.toThrow('REGISTRY_RECOVERY_RECONCILIATION_MISMATCH');
      expect(
        (
          await fixture.owner.query(
            'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await fixture.dispose();
    }
  },
);

it.each([
  'surviving-session',
  'prepared-transaction',
  'reopened-during-validation',
])('refuses %s and preserves the original credentials', async (kind) => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  let held: PoolClient | undefined;
  const preparedName = `registry_recovery_${installation.databaseName}`;
  let prepared = false;
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const account = await fixture.account('quarantine@example.test', true);
    await fixture.published(account.token, 'Quarantined template');
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN; ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );
    if (kind === 'surviving-session') held = await fixture.owner.connect();
    if (kind === 'prepared-transaction') {
      await fixture.owner.query(
        `BEGIN; SELECT 1; PREPARE TRANSACTION ${escapeLiteral(preparedName)}`,
      );
      prepared = true;
    }
    if (kind === 'reopened-during-validation') {
      const get = fixture.blobs.get.bind(fixture.blobs);
      vi.spyOn(fixture.blobs, 'get').mockImplementationOnce(async (hash) => {
        await installation.withAdministrator((administrator) =>
          administrator.query(
            `ALTER ROLE ${escapeIdentifier(installation.logins.app)} LOGIN`,
          ),
        );
        return get(hash);
      });
    }
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
              email: 'quarantine@example.test',
              emailVerified: true,
              publisher: 'active',
              operator: false,
            },
          ],
        },
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  } finally {
    held?.release();
    if (prepared)
      await fixture.owner.query(
        `ROLLBACK PREPARED ${escapeLiteral(preparedName)}`,
      );
    await fixture.dispose();
  }
});

it('rolls back credential invalidation when restored artifact bytes fail verification', async () => {
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
    const account = await fixture.account('tampered@example.test');
    const published = await fixture.published(
      account.token,
      'Tampered template',
    );
    fixture.objects.set(
      templateBytesHash(published.bytes),
      new Uint8Array([1]),
    );
    await installation.closeRuntimePools();
    await installation.withAdministrator((administrator) =>
      administrator.query(
        `ALTER ROLE ${escapeIdentifier(installation.logins.app)} NOLOGIN;
         ALTER ROLE ${escapeIdentifier(installation.logins.operator)} NOLOGIN`,
      ),
    );

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
              email: 'tampered@example.test',
              emailVerified: true,
              publisher: 'active',
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
          (SELECT count(*)::integer FROM registry_credentials WHERE revoked_at IS NULL) AS credentials`)
      ).rows,
    ).toEqual([{ sessions: 1, credentials: 1 }]);
  } finally {
    await fixture.dispose();
  }
});

it('refuses recovery while an enrolled runtime can still reconnect', async () => {
  const installation = await createRegistryInstallation();
  const fixture = await createRegistryFixture({}, installation);
  try {
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    await registryMigrator.migrate(
      fixture.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    const account = await fixture.account('still-serving@example.test', true);
    await installation.closeRuntimePools();
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
              email: 'still-serving@example.test',
              emailVerified: true,
              publisher: 'active',
              operator: false,
            },
          ],
        },
      }),
    ).rejects.toThrow('REGISTRY_RECOVERY_QUARANTINE_REQUIRED');
    expect(
      (
        await fixture.owner.query(
          'SELECT count(*)::int AS count FROM registry_credentials WHERE revoked_at IS NULL',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  } finally {
    await fixture.dispose();
  }
});
