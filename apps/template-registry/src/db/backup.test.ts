import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { escapeIdentifier } from 'pg';
import { expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';

import { createRegistryFixture } from '../__tests__/fixtures.ts';
import { createRegistryInstallation } from '../__tests__/installation.ts';
import { readRegistryBackupEnv } from '../env.ts';
import { assertRegistryBackupAccess } from './backup.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import { registryMigrator } from './migrate.ts';
import { REGISTRY_BACKUP_ROLE } from './schema.ts';

const migrations = await readMigrations(
  fileURLToPath(new URL('../../migrations', import.meta.url)),
  'Template Registry',
);
const execute = promisify(execFile);
async function fixture() {
  const installation = await createRegistryInstallation();
  try {
    await registryMigrator.migrate(
      installation.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      installation.allowedLogins,
    );
    return installation;
  } catch (error) {
    await installation.dispose();
    throw error;
  }
}
const unsafe = 'REGISTRY_BACKUP_ACCESS_UNSAFE';

it('verifies a populated registry using only its distinct backup LOGIN, including the production operator command', async () => {
  const f = await fixture();
  try {
    const application = await createRegistryFixture({}, f);
    const account = await application.account();
    const published = await application.published(account.token);
    await assertRegistryBackupAccess(f.backupPool);
    expect(
      (await f.backupPool.query('SELECT id FROM registry_entries')).rows,
    ).toEqual([{ id: published.entry.id }]);
    expect(
      (
        await f.backupPool.query(
          'SELECT count(*)::int AS count FROM registry_audit',
        )
      ).rows[0]?.count,
    ).toBeGreaterThan(2);
    await expect(
      f.backupPool.query("UPDATE registry_auth_user SET name = 'forbidden'"),
    ).rejects.toMatchObject({ code: '42501' });
    const backupMain = fileURLToPath(new URL('../backup.ts', import.meta.url));
    const env = {
      NODE_ENV: 'production',
      REGISTRY_BACKUP_DATABASE_URL: f.backupDatabaseUrl,
    };
    const result = await execute(process.execPath, [backupMain], {
      env,
      timeout: 15000,
    });
    expect(result.stderr).toContain('REGISTRY_BACKUP_VERIFIED');
    expect(result.stderr).not.toContain(new URL(f.backupDatabaseUrl).password);
    for (const databaseUrl of [f.runtimeDatabaseUrl, f.databaseUrl]) {
      await expect(
        execute(process.execPath, [backupMain], {
          env: { ...env, REGISTRY_BACKUP_DATABASE_URL: databaseUrl },
          timeout: 15000,
        }),
      ).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining('REGISTRY_BACKUP_FAILED'),
      });
    }
    await f.owner.query(
      "UPDATE registry_schema_fingerprint SET fingerprint = repeat('0', 64)",
    );
    await expect(
      execute(process.execPath, [backupMain], { env, timeout: 15000 }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('REGISTRY_BACKUP_FAILED'),
    });
  } finally {
    await f.dispose();
  }
});

it('accepts only the explicit backup environment and never falls back to a runtime or migration URL', () => {
  expect(
    readRegistryBackupEnv({
      REGISTRY_BACKUP_DATABASE_URL:
        'postgres://backup:synthetic@localhost/registry',
    }),
  ).toEqual({ databaseUrl: 'postgres://backup:synthetic@localhost/registry' });
  for (const key of [
    'REGISTRY_DATABASE_URL',
    'REGISTRY_OPERATOR_DATABASE_URL',
    'REGISTRY_MIGRATION_DATABASE_URL',
  ])
    expect(() =>
      readRegistryBackupEnv({
        [key]: 'postgres://private-canary@localhost/registry',
      }),
    ).toThrow(new Error('REGISTRY_BACKUP_CONFIGURATION_INVALID'));
});

it('requires every known table and complete SELECT over future registry relations', async () => {
  const f = await fixture();
  try {
    await assertRegistryBackupAccess(f.backupPool);
    await f.owner.query(
      'CREATE TABLE registry_migrations.future_evidence(id integer); INSERT INTO registry_migrations.future_evidence VALUES(9)',
    );
    await expect(assertRegistryBackupAccess(f.backupPool)).rejects.toThrow(
      unsafe,
    );
    await f.owner.query(
      `GRANT SELECT ON registry_migrations.future_evidence TO ${REGISTRY_BACKUP_ROLE}`,
    );
    await expect(
      assertRegistryBackupAccess(f.backupPool),
    ).resolves.toBeUndefined();
    await f.owner.query('DROP TABLE registry_rate_counters');
    await expect(assertRegistryBackupAccess(f.backupPool)).rejects.toThrow(
      unsafe,
    );
  } finally {
    await f.dispose();
  }
});

it('refuses RLS that silently hides populated registry rows', async () => {
  const f = await fixture();
  try {
    const application = await createRegistryFixture({}, f);
    const publisher = await application.account();
    const entry = await application.published(publisher.token);
    expect(
      (await f.backupPool.query('SELECT id FROM registry_entries')).rows,
    ).toEqual([{ id: entry.entry.id }]);
    await f.owner.query(
      'ALTER TABLE registry_entries ENABLE ROW LEVEL SECURITY',
    );
    expect(
      (await f.backupPool.query('SELECT id FROM registry_entries')).rows,
    ).toEqual([]);
    await expect(assertRegistryBackupAccess(f.backupPool)).rejects.toThrow(
      unsafe,
    );
    await f.owner.query(
      'ALTER TABLE registry_entries DISABLE ROW LEVEL SECURITY',
    );
    await expect(
      assertRegistryBackupAccess(f.backupPool),
    ).resolves.toBeUndefined();
  } finally {
    await f.dispose();
  }
});

it.each(['role', 'login'] as const)(
  'refuses actual owner-backed view writes by the backup %s',
  async (identity) => {
    const f = await fixture();
    try {
      const application = await createRegistryFixture({}, f);
      const account = await application.account();
      const grantee =
        identity === 'role'
          ? REGISTRY_BACKUP_ROLE
          : escapeIdentifier(f.logins.backup);
      await f.owner
        .query(`CREATE VIEW registry_backup_write AS SELECT id, name FROM registry_auth_user;
      GRANT USAGE ON SCHEMA public TO ${grantee}; GRANT SELECT, UPDATE(name) ON registry_backup_write TO ${grantee}`);
      const writer = await f.backupPool.connect();
      try {
        if (identity === 'login') await writer.query('SET ROLE NONE');
        await writer.query(
          "UPDATE registry_backup_write SET name = 'altered' WHERE id = $1",
          [account.session.userId],
        );
      } finally {
        await writer.query('RESET ROLE');
        writer.release();
      }
      expect(
        (
          await f.owner.query(
            'SELECT name FROM registry_auth_user WHERE id = $1',
            [account.session.userId],
          )
        ).rows,
      ).toEqual([{ name: 'altered' }]);
      await expect(assertRegistryBackupAccess(f.backupPool)).rejects.toThrow(
        unsafe,
      );
      await f.owner.query('DROP VIEW registry_backup_write');
      await expect(
        assertRegistryBackupAccess(f.backupPool),
      ).resolves.toBeUndefined();
    } finally {
      await f.dispose();
    }
  },
);

it('requires complete large-object reads and refuses actual role/login/PUBLIC lo_put writes', async () => {
  const f = await fixture();
  try {
    const id = await f.withAdministrator(async (administrator) => {
      const objectId = (
        await administrator.query<{ id: number }>(
          "SELECT lo_from_bytea(0, decode('01020304', 'hex')) AS id",
        )
      ).rows[0]?.id;
      if (!objectId) throw new Error('Expected a real large object');
      await administrator.query(
        `ALTER LARGE OBJECT ${objectId} OWNER TO ${escapeIdentifier(f.logins.owner)}`,
      );
      return objectId;
    });
    await expect(assertRegistryBackupAccess(f.backupPool)).rejects.toThrow(
      unsafe,
    );
    await f.owner.query(
      `GRANT SELECT ON LARGE OBJECT ${id} TO ${REGISTRY_BACKUP_ROLE}`,
    );
    await expect(
      assertRegistryBackupAccess(f.backupPool),
    ).resolves.toBeUndefined();
    for (const grantee of [
      REGISTRY_BACKUP_ROLE,
      escapeIdentifier(f.logins.backup),
      'PUBLIC',
    ]) {
      await f.owner.query(
        `GRANT SELECT, UPDATE ON LARGE OBJECT ${id} TO ${grantee}`,
      );
      const writer = await f.backupPool.connect();
      try {
        if (grantee === escapeIdentifier(f.logins.backup))
          await writer.query('SET ROLE NONE');
        await writer.query("SELECT lo_put($1, 0, decode('05060708', 'hex'))", [
          id,
        ]);
      } finally {
        await writer.query('RESET ROLE');
        writer.release();
      }
      expect(
        (
          await f.backupPool.query(
            "SELECT encode(lo_get($1), 'hex') AS bytes",
            [id],
          )
        ).rows,
      ).toEqual([{ bytes: '05060708' }]);
      if (grantee === escapeIdentifier(f.logins.backup))
        await f.owner.query(
          `REVOKE SELECT ON LARGE OBJECT ${id} FROM ${grantee}`,
        );
      await expect(assertRegistryBackupAccess(f.backupPool)).rejects.toThrow(
        unsafe,
      );
      if (grantee === 'PUBLIC')
        await f.owner.query(`REVOKE SELECT ON LARGE OBJECT ${id} FROM PUBLIC`);
      await f.owner.query(
        `REVOKE UPDATE ON LARGE OBJECT ${id} FROM ${grantee}`,
      );
      await f.owner.query("SELECT lo_put($1, 0, decode('01020304', 'hex'))", [
        id,
      ]);
      await expect(
        assertRegistryBackupAccess(f.backupPool),
      ).resolves.toBeUndefined();
    }
  } finally {
    await f.dispose();
  }
});

it.each(['role', 'login', 'PUBLIC'] as const)(
  'refuses effective parameter SET for %s with empty or populated large-object catalogs',
  async (identity) => {
    const f = await fixture();
    try {
      for (const populated of [false, true]) {
        await f.withAdministrator(async (administrator) => {
          const connection = await administrator.connect();
          try {
            await connection.query('BEGIN');
            let objectId: number | undefined;
            if (populated) {
              objectId = (
                await connection.query<{ id: number }>(
                  "SELECT lo_from_bytea(0, decode('01020304', 'hex')) AS id",
                )
              ).rows[0]?.id;
              if (!objectId) throw new Error('Expected a real large object');
              await connection.query(
                `GRANT SELECT ON LARGE OBJECT ${objectId} TO ${REGISTRY_BACKUP_ROLE}`,
              );
            } else
              expect(
                (
                  await connection.query(
                    'SELECT count(*)::int AS count FROM pg_largeobject_metadata',
                  )
                ).rows,
              ).toEqual([{ count: 0 }]);
            const grantee =
              identity === 'role'
                ? REGISTRY_BACKUP_ROLE
                : identity === 'login'
                  ? escapeIdentifier(f.logins.backup)
                  : 'PUBLIC';
            await connection.query(
              `GRANT SET ON PARAMETER lo_compat_privileges TO ${grantee}; SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(f.logins.backup)}; SET LOCAL ROLE ${REGISTRY_BACKUP_ROLE}`,
            );
            if (objectId) {
              if (identity === 'login')
                await connection.query('SET LOCAL ROLE NONE');
              await connection.query('SET LOCAL lo_compat_privileges = on');
              await connection.query(
                "SELECT lo_put($1, 0, decode('05060708', 'hex'))",
                [objectId],
              );
              await connection.query(
                `SET LOCAL lo_compat_privileges = off; SET LOCAL ROLE ${REGISTRY_BACKUP_ROLE}`,
              );
              expect(
                (
                  await connection.query(
                    "SELECT encode(lo_get($1), 'hex') AS bytes, has_largeobject_privilege(current_user, $1, 'UPDATE') AS can_write",
                    [objectId],
                  )
                ).rows,
              ).toEqual([{ bytes: '05060708', can_write: false }]);
            }
            await expect(
              assertRegistryBackupAccess(connection),
            ).rejects.toThrow(unsafe);
          } finally {
            await connection.query('ROLLBACK');
            connection.release();
          }
        });
        await expect(
          assertRegistryBackupAccess(f.backupPool),
        ).resolves.toBeUndefined();
      }
    } finally {
      await f.dispose();
    }
  },
);

it('refuses sticky permissive large-object behavior after its parameter grant is revoked', async () => {
  const f = await fixture();
  try {
    await f.withAdministrator(async (administrator) => {
      const connection = await administrator.connect();
      try {
        await connection.query(
          `BEGIN; GRANT SET ON PARAMETER lo_compat_privileges TO ${REGISTRY_BACKUP_ROLE}; SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(f.logins.backup)}; SET LOCAL ROLE ${REGISTRY_BACKUP_ROLE}; SET LOCAL lo_compat_privileges = on`,
        );
        await connection.query(
          `RESET ROLE; RESET SESSION AUTHORIZATION; REVOKE SET ON PARAMETER lo_compat_privileges FROM ${REGISTRY_BACKUP_ROLE}; SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(f.logins.backup)}; SET LOCAL ROLE ${REGISTRY_BACKUP_ROLE}`,
        );
        expect(
          (
            await connection.query(
              "SELECT current_setting('lo_compat_privileges') AS mode, has_parameter_privilege(current_user, 'lo_compat_privileges', 'SET') AS can_set",
            )
          ).rows,
        ).toEqual([{ mode: 'on', can_set: false }]);
        await expect(assertRegistryBackupAccess(connection)).rejects.toThrow(
          unsafe,
        );
      } finally {
        await connection.query('ROLLBACK');
        connection.release();
      }
    });
    await expect(
      assertRegistryBackupAccess(f.backupPool),
    ).resolves.toBeUndefined();
  } finally {
    await f.dispose();
  }
});
