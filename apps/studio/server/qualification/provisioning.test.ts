import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { configureDeployment } from '../src/deployment/configure.ts';
import { localDeployment } from './compose.ts';

const templateRoot = fileURLToPath(new URL('../..', import.meta.url));

it('provisions and restores administrator-only large-object restrictions with the shipped PostgreSQL image', async () => {
  const deployment = await localDeployment('admin-privileges');
  try {
    await configureDeployment(
      {
        domain: 'studio.example.test',
        email: 'operator@example.test',
        image: `local.invalid/studio@sha256:${'1'.repeat(64)}`,
        minioImage: `local.invalid/minio@sha256:${'2'.repeat(64)}`,
        output: deployment.directory,
      },
      templateRoot,
    );
    await deployment.overlay();
    await deployment.compose(['up', '-d', '--wait', 'postgres']);
    const configuration = await deployment.configuration();
    const roles = [
      'studio_app',
      'studio_maintenance',
      'studio_backup',
      'studio_migrator',
      'studio_runtime',
      'studio_backup_login',
    ];
    async function admin(sql: string) {
      return deployment.compose(
        [
          'exec',
          '-T',
          'postgres',
          'psql',
          '-X',
          '-At',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'postgres',
          '-d',
          'studio',
        ],
        { input: Buffer.from(sql) },
      );
    }
    const capabilities = `SELECT role.rolname, routine.signature,
      has_function_privilege(role.oid, routine.signature, 'EXECUTE')
      FROM pg_roles role CROSS JOIN (VALUES
        ('pg_catalog.lo_create(oid)'), ('pg_catalog.lo_creat(integer)'),
        ('pg_catalog.lo_from_bytea(oid,bytea)'), ('pg_catalog.lo_import(text)'),
        ('pg_catalog.lo_import(text,oid)'), ('pg_catalog.lo_export(oid,text)')
      ) routine(signature) WHERE role.rolname IN (${roles.map((role) => `'${role}'`).join(',')})
      ORDER BY role.rolname, routine.signature;`;
    async function assertRestricted() {
      const result = await admin(capabilities);
      const rows = result.stdout.toString().trim().split('\n');
      expect(rows).toHaveLength(36);
      expect(rows.every((row) => row.endsWith('|f'))).toBe(true);
      const rejected = await deployment.compose(
        [
          'exec',
          '-T',
          '-e',
          `PGPASSWORD=${configuration.STUDIO_DATABASE_PASSWORD}`,
          '-e',
          'PGOPTIONS=-c role=studio_app',
          'postgres',
          'psql',
          '-X',
          '-At',
          '-h',
          '127.0.0.1',
          '-U',
          'studio_runtime',
          '-d',
          'studio',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          'SELECT lo_create(0);',
        ],
        { failure: true },
      );
      expect(rejected.code).not.toBe(0);
      expect(rejected.stderr.toString()).toContain(
        'permission denied for function lo_create',
      );
    }
    await assertRestricted();
    // A restored ACL can carry PUBLIC and role-specific grants. Revoking only
    // PUBLIC is insufficient, and the ordinary database owner cannot repair it.
    await admin(`GRANT EXECUTE ON FUNCTION pg_catalog.lo_create(oid) TO PUBLIC;
      GRANT EXECUTE ON FUNCTION pg_catalog.lo_creat(integer) TO ${roles.join(',')};`);
    const recovery = await readFile(
      join(deployment.directory, 'deployment/postgres-privileges.sql'),
    );
    const ownerRefusal = await deployment.compose(
      [
        'exec',
        '-T',
        '-e',
        `PGPASSWORD=${configuration.STUDIO_MIGRATION_PASSWORD}`,
        'postgres',
        'psql',
        '-X',
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
        '-h',
        '127.0.0.1',
        '-U',
        'studio_migrator',
        '-d',
        'studio',
      ],
      { input: recovery, failure: true },
    );
    expect(ownerRefusal.code).not.toBe(0);
    expect(ownerRefusal.stderr.toString()).toContain('permission denied');
    expect((await admin(capabilities)).stdout.toString()).toContain('|t');
    await admin(recovery.toString());
    await assertRestricted();
    expect(
      (
        await admin(`SELECT rolname FROM pg_roles WHERE rolname IN (${roles.map((role) => `'${role}'`).join(',')})
      AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication);`)
      ).stdout
        .toString()
        .trim(),
    ).toBe('');
  } finally {
    await deployment.dispose();
  }
});
