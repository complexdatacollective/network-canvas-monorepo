import { fileURLToPath } from 'node:url';

import { escapeIdentifier } from 'pg';
import { expect, it } from 'vitest';

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
