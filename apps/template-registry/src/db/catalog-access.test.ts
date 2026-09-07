import { fileURLToPath } from 'node:url';

import { escapeIdentifier, type PoolClient } from 'pg';
import { expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';

import { createRegistryInstallation } from '../__tests__/installation.ts';
import { assertRegistryBackupAccess } from './backup.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import { registryMigrator } from './migrate.ts';
import { REGISTRY_BACKUP_ROLE, REGISTRY_ROLES } from './schema.ts';

const migrations = await readMigrations(
  fileURLToPath(new URL('../../migrations', import.meta.url)),
  'Template Registry',
);
const backupFailure = 'REGISTRY_BACKUP_ACCESS_UNSAFE';
const catalogFailure =
  'Template Registry runtime and backup identities have unsafe PostgreSQL catalog privileges.';
type Installation = Awaited<ReturnType<typeof createRegistryInstallation>>;
type Capability = 'file' | 'table' | 'system-column' | 'temporary';
type Principal =
  | 'app-role'
  | 'operator-role'
  | 'backup-role'
  | 'app-login'
  | 'operator-login'
  | 'backup-login'
  | 'PUBLIC';

function identity(f: Installation, principal: Principal): string {
  return {
    'app-role': REGISTRY_ROLES.app,
    'operator-role': REGISTRY_ROLES.operator,
    'backup-role': REGISTRY_BACKUP_ROLE,
    'app-login': f.logins.app,
    'operator-login': f.logins.operator,
    'backup-login': f.logins.backup,
    'PUBLIC': REGISTRY_ROLES.app,
  }[principal];
}

async function grant(
  client: PoolClient,
  f: Installation,
  capability: Capability,
  principal: Principal,
) {
  const target =
    principal === 'PUBLIC'
      ? 'PUBLIC'
      : escapeIdentifier(identity(f, principal));
  await client.query(
    capability === 'file'
      ? `GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text,bigint,bigint) TO ${target}`
      : capability === 'table'
        ? `GRANT SELECT ON pg_catalog.pg_authid TO ${target}`
        : capability === 'system-column'
          ? `GRANT SELECT(ctid) ON pg_catalog.pg_authid TO ${target}`
          : `GRANT TEMPORARY ON DATABASE ${escapeIdentifier(f.databaseName)} TO ${target}`,
  );
}

async function demonstrate(
  client: PoolClient,
  f: Installation,
  capability: Capability,
  principal: Principal,
) {
  await client.query('SAVEPOINT actual_capability');
  try {
    await client.query(
      `SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(identity(f, principal))}`,
    );
    if (capability === 'temporary') {
      await client.query(
        'CREATE TEMP TABLE forbidden_temp(value integer); INSERT INTO forbidden_temp VALUES(1)',
      );
      expect(
        (await client.query('SELECT value FROM forbidden_temp')).rows,
      ).toEqual([{ value: 1 }]);
    } else {
      expect(
        (
          await client.query(
            capability === 'file'
              ? "SELECT length(pg_catalog.pg_read_file('PG_VERSION', 0, 64)) > 0 AS reached"
              : capability === 'table'
                ? 'SELECT rolpassword IS NOT NULL AS reached FROM pg_catalog.pg_authid WHERE rolname=$1'
                : 'SELECT ctid IS NOT NULL AS reached FROM pg_catalog.pg_authid LIMIT 1',
            capability === 'table' ? [f.logins.app] : [],
          )
        ).rows,
      ).toEqual([{ reached: true }]);
    }
  } finally {
    await client.query(
      'ROLLBACK TO SAVEPOINT actual_capability; RELEASE SAVEPOINT actual_capability',
    );
  }
}

async function installed() {
  const f = await createRegistryInstallation();
  try {
    expect(
      await registryMigrator.migrate(
        f.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        f.allowedLogins,
      ),
    ).toEqual(migrations.map(({ manifest }) => manifest.id));
    return f;
  } catch (error) {
    await f.dispose();
    throw error;
  }
}

it('accepts pristine versioned Registry migration and its real restricted backup connection', async () => {
  const f = await installed();
  try {
    expect(
      (
        await f.owner.query(
          "SELECT rolname, has_database_privilege(oid, current_database(), 'TEMPORARY') AS temporary FROM pg_roles WHERE rolname = ANY($1::text[])",
          [
            [
              ...Object.values(REGISTRY_ROLES),
              REGISTRY_BACKUP_ROLE,
              f.logins.app,
              f.logins.operator,
              f.logins.backup,
            ],
          ],
        )
      ).rows,
    ).toHaveLength(6);
    expect(
      (
        await f.owner.query(
          "SELECT count(*)::integer AS unsafe FROM pg_roles WHERE rolname = ANY($1::text[]) AND has_database_privilege(oid, current_database(), 'TEMPORARY')",
          [
            [
              ...Object.values(REGISTRY_ROLES),
              REGISTRY_BACKUP_ROLE,
              f.logins.app,
              f.logins.operator,
              f.logins.backup,
            ],
          ],
        )
      ).rows,
    ).toEqual([{ unsafe: 0 }]);
    await expect(
      assertRegistryBackupAccess(f.backupPool),
    ).resolves.toBeUndefined();
    expect(
      (
        await f.backupPool.query(
          'SELECT current_user AS role, session_user AS login',
        )
      ).rows,
    ).toEqual([{ role: REGISTRY_BACKUP_ROLE, login: f.logins.backup }]);
    expect(
      (
        await f.backupPool.query(
          'SELECT count(*)::integer AS count FROM registry_migrations.history',
        )
      ).rows,
    ).toEqual([{ count: migrations.length }]);
    expect(
      await registryMigrator.migrate(
        f.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        f.allowedLogins,
      ),
    ).toEqual([]);
  } finally {
    await f.dispose();
  }
});

it.each(
  (['file', 'table', 'system-column', 'temporary'] as const).flatMap(
    (capability) =>
      (
        [
          'app-role',
          'operator-role',
          'backup-role',
          'app-login',
          'operator-login',
          'backup-login',
          'PUBLIC',
        ] as const
      ).map((principal) => ({ capability, principal })),
  ),
)(
  'migration preflight refuses actual $principal $capability access before stored evidence exists',
  async ({ capability, principal }) => {
    const f = await createRegistryInstallation();
    try {
      await f.withAdministrator(async (administrator) => {
        const client = await administrator.connect();
        try {
          await client.query('BEGIN');
          await grant(client, f, capability, principal);
          expect(
            (
              await client.query(
                "SELECT to_regclass('registry_migrations.history') AS history, pg_my_temp_schema() AS temporary",
              )
            ).rows,
          ).toEqual([{ history: null, temporary: 0 }]);
          await client.query(
            `SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(f.logins.owner)}`,
          );
          const decision = await registryMigrator
            .enforceSecurity(client, f.allowedLogins)
            .then(
              () => null,
              (error: unknown) => error,
            );
          await client.query('RESET SESSION AUTHORIZATION');
          await demonstrate(client, f, capability, principal);
          if (capability === 'temporary')
            expect(decision).toEqual(
              new Error(
                'Runtime and backup identities must own no database objects and hold no access outside their reviewed Template Registry roles: remove direct or PUBLIC login data grants, CREATE, TEMPORARY, CONNECT grant options, executable SECURITY DEFINER routines, view, materialized view, foreign table, or large object access beyond read-only backup grants, backup table writes, or sequence UPDATE privileges.',
              ),
            );
          else expect(decision).toEqual(new Error(catalogFailure));
          expect(
            (
              await client.query(
                "SELECT to_regclass('registry_migrations.history') AS history",
              )
            ).rows,
          ).toEqual([{ history: null }]);
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      });
    } finally {
      await f.dispose();
    }
  },
);

it.each(
  (['file', 'table', 'system-column', 'temporary'] as const).flatMap(
    (capability) =>
      (['backup-role', 'backup-login', 'PUBLIC'] as const).map((principal) => ({
        capability,
        principal,
      })),
  ),
)(
  'backup verifier refuses actual $principal $capability access with fixed diagnostics',
  async ({ capability, principal }) => {
    const f = await installed();
    try {
      await f.withAdministrator(async (administrator) => {
        const client = await administrator.connect();
        try {
          await client.query('BEGIN');
          await grant(client, f, capability, principal);
          expect(
            (await client.query('SELECT pg_my_temp_schema() AS temporary'))
              .rows,
          ).toEqual([{ temporary: 0 }]);
          await client.query(
            `SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(f.logins.backup)}; SET LOCAL ROLE ${REGISTRY_BACKUP_ROLE}`,
          );
          const decision = await assertRegistryBackupAccess(client).then(
            () => null,
            (error: unknown) => error,
          );
          await client.query('RESET ROLE; RESET SESSION AUTHORIZATION');
          await demonstrate(
            client,
            f,
            capability,
            principal === 'PUBLIC' ? 'backup-role' : principal,
          );
          expect(decision).toEqual(new Error(backupFailure));
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      });
      await expect(
        assertRegistryBackupAccess(f.backupPool),
      ).resolves.toBeUndefined();
    } finally {
      await f.dispose();
    }
  },
);
