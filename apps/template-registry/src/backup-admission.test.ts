import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { escapeIdentifier } from 'pg';
import { expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';

import { createRegistryInstallation } from './__tests__/installation.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './db/fingerprint.generated.ts';
import { registryMigrator } from './db/migrate.ts';
import { readRegistrySchemaIdentity } from './db/schema-state.ts';

type Installation = Awaited<ReturnType<typeof createRegistryInstallation>>;

function verifyInProcess(database: Installation) {
  return new Promise<{ exit: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL('./backup.ts', import.meta.url))],
        {
          env: {
            REGISTRY_BACKUP_DATABASE_URL: database.backupDatabaseUrl,
            REGISTRY_DATABASE_ALLOWED_LOGINS: JSON.stringify(
              database.allowedLogins,
            ),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 15_000,
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (exit) => resolve({ exit, stdout, stderr }));
    },
  );
}

it('verifies the populated backup through its actual CLI without reopening quarantined identities or accepting unsafe grants', async () => {
  const database = await createRegistryInstallation();
  const outsider = await createRegistryInstallation();
  const migrations = await readMigrations(
    fileURLToPath(new URL('../migrations', import.meta.url)),
    'Template Registry',
  );
  const closed = [
    database.logins.owner,
    database.logins.app,
    database.logins.operator,
  ];
  const assertVerdict = async (
    expected: 'REGISTRY_BACKUP_VERIFIED' | 'REGISTRY_BACKUP_FAILED',
  ) => {
    const result = await verifyInProcess(database);
    expect(result.exit, result.stderr).toBe(
      expected === 'REGISTRY_BACKUP_VERIFIED' ? 0 : 1,
    );
    expect(result.stdout + result.stderr).toContain(expected);
    expect(result.stdout + result.stderr).not.toContain('backup-email-canary');
    expect(result.stdout + result.stderr).not.toContain(
      database.backupDatabaseUrl,
    );
  };
  try {
    await registryMigrator.migrate(
      database.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      database.allowedLogins,
    );
    await database.owner.query(
      "INSERT INTO registry_auth_user(id, name, email, email_verified) VALUES ('capture-canary','Backup canary','backup-email-canary@example.test',false)",
    );
    await assertVerdict('REGISTRY_BACKUP_VERIFIED');
    await database.withAdministrator(async (administrator) => {
      for (const login of closed)
        await administrator.query(
          `ALTER ROLE ${escapeIdentifier(login)} NOLOGIN`,
        );
    });
    await expect(
      readRegistrySchemaIdentity(database.backupPool, database),
    ).rejects.toThrow('REGISTRY_SCHEMA_NOT_CURRENT');
    await assertVerdict('REGISTRY_BACKUP_VERIFIED');
    await database.withAdministrator(async (administrator) => {
      await administrator.query(`GRANT USAGE ON SCHEMA public TO ${escapeIdentifier(database.logins.operator)};
        GRANT UPDATE(email_verified) ON registry_auth_user TO ${escapeIdentifier(database.logins.operator)};
        SET ROLE ${escapeIdentifier(database.logins.operator)};
        UPDATE registry_auth_user SET email_verified = true;
        RESET ROLE`);
      expect(
        (
          await administrator.query(
            "SELECT email_verified FROM registry_auth_user WHERE id = 'capture-canary'",
          )
        ).rows,
      ).toEqual([{ email_verified: true }]);
    });
    await assertVerdict('REGISTRY_BACKUP_FAILED');
    await database.withAdministrator((administrator) =>
      administrator.query(`REVOKE ALL ON registry_auth_user FROM ${escapeIdentifier(database.logins.operator)};
      REVOKE ALL ON SCHEMA public FROM ${escapeIdentifier(database.logins.operator)}`),
    );
    await assertVerdict('REGISTRY_BACKUP_VERIFIED');
    await database.withAdministrator(async (administrator) => {
      await administrator.query(`GRANT UPDATE(fingerprint) ON registry_schema_fingerprint TO ${database.roles.app};
        SET ROLE ${database.roles.app};
        UPDATE registry_schema_fingerprint SET fingerprint = '${REGISTRY_SCHEMA_FINGERPRINT}';
        RESET ROLE`);
    });
    await assertVerdict('REGISTRY_BACKUP_FAILED');
    await database.withAdministrator((administrator) =>
      administrator.query(`REVOKE UPDATE(fingerprint) ON registry_schema_fingerprint FROM ${database.roles.app};
      GRANT CONNECT ON DATABASE ${escapeIdentifier(database.databaseName)} TO ${escapeIdentifier(outsider.logins.app)}`),
    );
    await assertVerdict('REGISTRY_BACKUP_FAILED');
    await database.withAdministrator(async (administrator) => {
      await administrator.query(
        `REVOKE CONNECT ON DATABASE ${escapeIdentifier(database.databaseName)} FROM ${escapeIdentifier(outsider.logins.app)}`,
      );
      expect(
        (
          await administrator.query(
            'SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])',
            [closed],
          )
        ).rows,
      ).toEqual([
        { rolcanlogin: false },
        { rolcanlogin: false },
        { rolcanlogin: false },
      ]);
    });
    await assertVerdict('REGISTRY_BACKUP_VERIFIED');
  } finally {
    await database.withAdministrator(async (administrator) => {
      await administrator.query(
        `REVOKE CONNECT ON DATABASE ${escapeIdentifier(database.databaseName)} FROM ${escapeIdentifier(outsider.logins.app)}`,
      );
      for (const login of closed)
        await administrator.query(
          `ALTER ROLE ${escapeIdentifier(login)} LOGIN`,
        );
    });
    await database.dispose();
    await outsider.dispose();
  }
});
