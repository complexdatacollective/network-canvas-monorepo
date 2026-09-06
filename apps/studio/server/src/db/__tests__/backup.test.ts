import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { getTableName } from 'drizzle-orm';
import pg from 'pg';
import { expect, it } from 'vitest';

import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';
import { runtimeRolesSql } from '@codaco/studio-sync/role-bootstrap';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { configuration, rootOne } from '../../pii/__tests__/fixtures.ts';
import { initializeEncryption } from '../../pii/initialize.ts';
import {
  createDataProtection,
  ProtectedDataError,
} from '../../pii/protection.ts';
import { BACKUP_ACCESS_SIDECAR_SQL } from '../backup-access.ts';
import { assertBackupAccess } from '../backup.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import { readMigrations } from '../migrations/artifact.ts';
import { migrateDatabase } from '../migrations/migrate.ts';
import {
  createBackupPool,
  createMaintenancePool,
  createPool,
} from '../pool.ts';
import { SCHEMA } from '../schema.ts';

const database = await reachableDb();
const migrations = await readMigrations(
  fileURLToPath(new URL('../../../migrations', import.meta.url)),
);
const canary = 'BACKUP_PRIVATE_PARTICIPANT_CANARY';

function requireDatabase() {
  if (!database)
    throw new Error('Local PostgreSQL is required for backup qualification.');
  return database;
}

async function backupFixture(
  work: (fixture: {
    source: Awaited<ReturnType<typeof createScratchDatabase>>;
    backup: pg.Pool;
    runtime: pg.Pool;
    backupLogin: string;
    backupPassword: string;
    teams: string[];
  }) => Promise<void>,
) {
  const db = requireDatabase();
  const source = await createScratchDatabase(db);
  const suffix = randomUUID().replaceAll('-', '');
  const backupLogin = `backup_reader_${suffix}`;
  const runtimeLogin = `backup_runtime_${suffix}`;
  const backupPassword = randomBytes(24).toString('hex');
  const runtimePassword = randomBytes(24).toString('hex');
  const loginOptions =
    'LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION';
  let backup: pg.Pool | undefined;
  let runtime: pg.Pool | undefined;
  const maintenance = createMaintenancePool(source.db);
  try {
    // Precreate the operator-only role before enrollment; a restricted
    // migrator must be able to validate it without CREATEROLE privileges.
    await source.pool.query(runtimeRolesSql([BACKUP_ROLE]));
    await source.pool
      .query(`CREATE ROLE ${pg.escapeIdentifier(backupLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(backupPassword)};
      CREATE ROLE ${pg.escapeIdentifier(runtimeLogin)} ${loginOptions} PASSWORD ${pg.escapeLiteral(runtimePassword)}`);
    await source.pool
      .query(`GRANT ${BACKUP_ROLE} TO ${pg.escapeIdentifier(backupLogin)} WITH INHERIT FALSE, SET TRUE;
      GRANT ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance} TO ${pg.escapeIdentifier(runtimeLogin)} WITH INHERIT FALSE, SET TRUE`);
    const allowedLogins = await enrollMigrationTestDatabase(source.pool, db, [
      backupLogin,
      runtimeLogin,
    ]);
    await migrateDatabase(
      source.pool,
      migrations,
      SCHEMA_FINGERPRINT,
      allowedLogins,
    );
    const loginUrl = (username: string, password: string) => {
      const url = new URL(source.db.url);
      url.username = username;
      url.password = password;
      return { url: url.toString() };
    };
    backup = createBackupPool(loginUrl(backupLogin, backupPassword));
    runtime = createPool(loginUrl(runtimeLogin, runtimePassword));
    const keys = await initializeEncryption({
      maintenancePool: maintenance,
      configuration: configuration(),
      loadRootKey: async () => rootOne,
    });
    const protection = createDataProtection(keys, {
      participant: async () => {
        throw new ProtectedDataError();
      },
      integration: async () => {
        throw new ProtectedDataError();
      },
    });
    const teams = [randomUUID(), randomUUID()];
    for (const teamId of teams) {
      const protocolId = randomUUID();
      const studyId = randomUUID();
      const participantId = randomUUID();
      await seedTeam(source.pool, teamId);
      await source.pool.query(
        'INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $3)',
        [protocolId, teamId, 'Backup fixture'],
      );
      await source.pool.query(
        'INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, $4)',
        [studyId, teamId, protocolId, 'Backup fixture'],
      );
      const sealed = protection.encryptParticipant(
        { teamId, studyId, participantId, column: 'name_ciphertext' },
        Buffer.from(canary),
        keys.currentId('pii-enc'),
      );
      await source.pool.query(
        "INSERT INTO participants (id, team_id, study_id, participant_code, name_ciphertext, pii_key_id, pii_algorithm) VALUES ($1, $2, $3, 'P-backup', $4, $5, $6)",
        [
          participantId,
          teamId,
          studyId,
          sealed.envelope,
          sealed.keyId,
          sealed.algorithm,
        ],
      );
      await source.pool.query(
        "UPDATE studies SET state = 'closed', went_live_at = now(), closed_at = now() WHERE id = $1",
        [studyId],
      );
      await source.pool.query(
        "INSERT INTO audit_events (id, team_id, team_label, sequence, event_type, event_version, category, outcome, actor_kind, actor_label, request_id, details) VALUES ($1, $2, 'Backup fixture', 1, 'team.created', 1, 'team_access', 'succeeded', 'system', 'Backup fixture', $3, '{}')",
        [randomUUID(), teamId, randomUUID()],
      );
    }
    await source.pool.query(
      "INSERT INTO credential_audit_events (id, user_id, account_id, action, outcome, request_id) VALUES ($1, $2, $3, 'read', 'succeeded', $4)",
      [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
    );
    // The current application uses UUIDs. A real sequence keeps the backup
    // permission and restored-state assertions meaningful for future tables.
    await source.pool.query(
      "CREATE SEQUENCE public.backup_sequence START 11; SELECT nextval('public.backup_sequence')",
    );
    await source.pool.query(BACKUP_ACCESS_SIDECAR_SQL);
    await work({ source, backup, runtime, backupLogin, backupPassword, teams });
  } finally {
    await Promise.all([backup?.end(), runtime?.end(), maintenance.end()]);
    await source.dispose();
    const cleanup = new pg.Pool({ connectionString: db.url });
    try {
      await cleanup.query(
        `DROP ROLE IF EXISTS ${pg.escapeIdentifier(backupLogin)}, ${pg.escapeIdentifier(runtimeLogin)}`,
      );
    } finally {
      await cleanup.end();
    }
  }
}

async function inventory(
  pool: pg.Pool,
): Promise<Record<string, { count: number; digest: string }>> {
  const tables = [
    ...Object.values(SCHEMA).map(
      (table) => `public.${pg.escapeIdentifier(getTableName(table))}`,
    ),
    'studio_migrations.history',
  ];
  const counts: Record<string, { count: number; digest: string }> = {};
  for (const table of tables) {
    const result = await pool.query<{ count: number; digest: string }>(
      `SELECT count(*)::integer AS count, md5(coalesce(jsonb_agg(to_jsonb(entry) ORDER BY to_jsonb(entry)::text)::text, '[]')) AS digest FROM ${table} entry`,
    );
    counts[table] = result.rows[0]!;
  }
  counts['public.backup_sequence'] = (
    await pool.query<{ count: number; digest: string }>(
      'SELECT 1 AS count, md5(ROW(last_value, is_called)::text) AS digest FROM public.backup_sequence',
    )
  ).rows[0]!;
  return counts;
}

it('backs up every tenant and immutable evidence through a separate non-superuser login', async () => {
  await backupFixture(
    async ({ source, backup, runtime, backupLogin, teams }) => {
      expect(
        (
          await backup.query(
            'SELECT current_user, session_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = session_user',
          )
        ).rows,
      ).toEqual([
        {
          current_user: BACKUP_ROLE,
          session_user: backupLogin,
          rolsuper: false,
          rolbypassrls: false,
        },
      ]);
      const expected = await inventory(source.pool);
      expect(expected['public."participants"']?.count).toBe(2);
      expect(expected['public."audit_events"']?.count).toBe(2);
      expect(expected['public."credential_audit_events"']?.count).toBe(1);
      expect(
        expected['public."encryption_key_verifications"']?.count,
      ).toBeGreaterThan(0);
      expect(expected['studio_migrations.history']?.count).toBe(
        migrations.length,
      );
      await expect(assertBackupAccess(backup)).resolves.toBeUndefined();
      await expect(assertBackupAccess(runtime)).rejects.toThrow(
        'STUDIO_BACKUP_ACCESS_UNSAFE',
      );
      expect(await inventory(backup)).toEqual(expected);
      expect(
        (
          await backup.query(
            'SELECT last_value::int, is_called FROM public.backup_sequence',
          )
        ).rows,
      ).toEqual([{ last_value: 11, is_called: true }]);
      expect(
        (
          await backup.query(
            "SELECT count(*)::int AS count FROM studies WHERE state = 'closed'",
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
      expect((await runtime.query('SELECT id FROM participants')).rows).toEqual(
        [],
      );
      expect(
        (
          await createTenantDb(runtime, teams[0]!).query(
            'SELECT team_id FROM participants',
          )
        ).rows,
      ).toEqual([{ team_id: teams[0] }]);
      for (const query of [
        `SET ROLE ${BACKUP_ROLE}`,
        'SELECT * FROM credential_audit_events',
        'SELECT * FROM encryption_key_verifications',
        'SELECT * FROM studio_migrations.history',
      ])
        await expect(runtime.query(query)).rejects.toMatchObject({
          code: '42501',
        });
      for (const query of [
        'UPDATE participants SET name_ciphertext = null',
        'DELETE FROM teams',
        'TRUNCATE credential_audit_events',
        'CREATE TABLE public.backup_escape (id integer)',
        'UPDATE "schemaFingerprint" SET fingerprint = \'forged\'',
        'DELETE FROM studio_migrations.history',
        "SELECT nextval('public.backup_sequence')",
        "SELECT setval('public.backup_sequence', 42)",
        `SET ROLE ${TENANT_ROLES.app}`,
        `SET ROLE ${TENANT_ROLES.maintenance}`,
      ])
        await expect(backup.query(query)).rejects.toMatchObject({
          code: '42501',
        });
      expect(await inventory(backup)).toEqual(expected);
    },
  );
});

it('refuses drift that can omit rows or let the backup credentials write', async () => {
  await backupFixture(async ({ source, backup, backupLogin }) => {
    const role = pg.escapeIdentifier(backupLogin);
    await expect(assertBackupAccess(backup)).resolves.toBeUndefined();
    const mutations = [
      [
        `ALTER POLICY backup_read ON audit_events USING (false)`,
        `ALTER POLICY backup_read ON audit_events USING (current_user = '${BACKUP_ROLE}')`,
      ],
      [
        'CREATE POLICY backup_restrict ON audit_events AS RESTRICTIVE FOR SELECT USING (false)',
        'DROP POLICY backup_restrict ON audit_events',
      ],
      [
        `GRANT UPDATE (name_ciphertext) ON participants TO ${BACKUP_ROLE}`,
        `REVOKE ALL ON participants FROM ${BACKUP_ROLE}; GRANT SELECT ON participants TO ${BACKUP_ROLE}`,
      ],
      [
        `GRANT UPDATE (name_ciphertext) ON participants TO ${role}`,
        `REVOKE ALL ON participants FROM ${role}`,
      ],
      [
        `GRANT USAGE ON SEQUENCE public.backup_sequence TO ${BACKUP_ROLE}`,
        `REVOKE USAGE ON SEQUENCE public.backup_sequence FROM ${BACKUP_ROLE}`,
      ],
      [
        `GRANT USAGE ON SEQUENCE public.backup_sequence TO ${role}`,
        `REVOKE USAGE ON SEQUENCE public.backup_sequence FROM ${role}`,
      ],
      [
        `CREATE TABLE public.backup_owned (id int); ALTER TABLE public.backup_owned OWNER TO ${role}`,
        'DROP TABLE public.backup_owned',
      ],
      [
        `CREATE SCHEMA backup_owned AUTHORIZATION ${role}`,
        'DROP SCHEMA backup_owned',
      ],
      ...[BACKUP_ROLE, role].flatMap((target) => [
        [
          `CREATE SCHEMA backup_extra; GRANT CREATE ON SCHEMA backup_extra TO ${target}`,
          'DROP SCHEMA backup_extra',
        ],
        [
          `CREATE TYPE public.backup_owned_type AS ENUM ('safe'); ALTER TYPE public.backup_owned_type OWNER TO ${target}`,
          'DROP TYPE public.backup_owned_type',
        ],
        [
          `CREATE FOREIGN DATA WRAPPER backup_owned_wrapper; CREATE SERVER backup_owned_server FOREIGN DATA WRAPPER backup_owned_wrapper; ALTER SERVER backup_owned_server OWNER TO ${target}`,
          'DROP FOREIGN DATA WRAPPER backup_owned_wrapper CASCADE',
        ],
      ]),
    ];
    for (const [corrupt, restore] of mutations) {
      await source.pool.query(corrupt!);
      await expect(assertBackupAccess(backup)).rejects.toThrow(
        'STUDIO_BACKUP_ACCESS_UNSAFE',
      );
      await source.pool.query(restore!);
      await expect(assertBackupAccess(backup)).resolves.toBeUndefined();
    }
  });
});

it('verifies the operator command without runtime credentials or secret output', async () => {
  await backupFixture(async ({ source, backupLogin, backupPassword }) => {
    const url = new URL(source.db.url);
    url.username = backupLogin;
    url.password = backupPassword;
    const run = (databaseUrl: string, args: string[] = []) =>
      spawnSync(process.execPath, ['src/backup.ts', ...args], {
        // oxlint-disable-next-line node/no-process-env -- isolated child gets the synthetic backup identity only
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: 'utf8',
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
    const good = run(url.toString());
    expect(good.error).toBeUndefined();
    expect(good.status).toBe(0);
    expect(good.stdout).toBe('Studio backup access verified.\n');
    for (const rejected of [
      run(source.db.url),
      run(url.toString(), ['SECRET_ARGUMENT_CANARY']),
    ]) {
      expect(rejected.error).toBeUndefined();
      expect(rejected.status).toBe(1);
      const output = rejected.stdout + rejected.stderr;
      expect(output).toContain('STUDIO_BACKUP_ACCESS_UNSAFE');
      for (const secret of [
        backupPassword,
        'SECRET_ARGUMENT_CANARY',
        source.db.url,
        url.toString(),
      ])
        expect(output).not.toContain(secret);
    }
  });
});

it('refuses owner-backed writes through views or callable definer routines', async () => {
  await backupFixture(
    async ({ source, backup, backupLogin, backupPassword, teams }) => {
      await source.pool.query(
        `CREATE VIEW public.backup_write_view AS SELECT id, name FROM public.teams;
         GRANT SELECT ON public.backup_write_view TO studio_backup;
         CREATE SCHEMA backup_extra;
         GRANT USAGE ON SCHEMA backup_extra TO studio_backup, ${pg.escapeIdentifier(backupLogin)};
         CREATE VIEW backup_extra.backup_write_view AS SELECT id, name FROM public.teams`,
      );
      await expect(assertBackupAccess(backup)).resolves.toBeUndefined();
      const url = new URL(source.db.url);
      url.username = backupLogin;
      url.password = backupPassword;
      const login = new pg.Pool({ connectionString: url.toString() });
      try {
        for (const [target, writer] of [
          [BACKUP_ROLE, backup],
          [backupLogin, login],
        ] as const) {
          for (const [view, privilege] of [
            ['public.backup_write_view', 'UPDATE'],
            ['public.backup_write_view', 'UPDATE (name)'],
            ['backup_extra.backup_write_view', 'UPDATE'],
            ['backup_extra.backup_write_view', 'UPDATE (name)'],
          ]) {
            await source.pool.query(
              `GRANT SELECT, ${privilege} ON ${view} TO ${pg.escapeIdentifier(target)}`,
            );
            expect(
              (
                await writer.query(
                  "SELECT has_table_privilege(current_user, 'public.teams', 'UPDATE') AS writable",
                )
              ).rows,
            ).toEqual([{ writable: false }]);
            // Prove the granted view actually bypasses the base-table boundary.
            await source.pool.query(
              "UPDATE teams SET name='BEFORE_VIEW' WHERE id=$1",
              [teams[0]],
            );
            await writer.query(
              `UPDATE ${view} SET name='VIA_VIEW' WHERE id=$1`,
              [teams[0]],
            );
            expect(
              (
                await source.pool.query('SELECT name FROM teams WHERE id=$1', [
                  teams[0],
                ])
              ).rows,
            ).toEqual([{ name: 'VIA_VIEW' }]);
            await expect(assertBackupAccess(backup)).rejects.toThrow(
              'STUDIO_BACKUP_ACCESS_UNSAFE',
            );
            await source.pool.query(
              `REVOKE ALL ON ${view} FROM ${pg.escapeIdentifier(target)}; GRANT SELECT ON public.backup_write_view TO studio_backup`,
            );
            await expect(assertBackupAccess(backup)).resolves.toBeUndefined();
          }
        }
        await source.pool.query(
          "CREATE FUNCTION public.backup_definer_write() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.teams SET name='VIA_DEFINER' $$; REVOKE ALL ON FUNCTION public.backup_definer_write() FROM PUBLIC",
        );
        await expect(assertBackupAccess(backup)).resolves.toBeUndefined();
        for (const [target, writer] of [
          [BACKUP_ROLE, backup],
          [backupLogin, login],
        ] as const) {
          await source.pool.query(
            `GRANT EXECUTE ON FUNCTION public.backup_definer_write() TO ${pg.escapeIdentifier(target)}`,
          );
          await source.pool.query(
            "UPDATE teams SET name='BEFORE_DEFINER' WHERE id=$1",
            [teams[0]],
          );
          await writer.query('SELECT public.backup_definer_write()');
          expect(
            (
              await source.pool.query('SELECT name FROM teams WHERE id=$1', [
                teams[0],
              ])
            ).rows,
          ).toEqual([{ name: 'VIA_DEFINER' }]);
          await expect(assertBackupAccess(backup)).rejects.toThrow(
            'STUDIO_BACKUP_ACCESS_UNSAFE',
          );
          await source.pool.query(
            `REVOKE ALL ON FUNCTION public.backup_definer_write() FROM ${pg.escapeIdentifier(target)}`,
          );
          await expect(assertBackupAccess(backup)).resolves.toBeUndefined();
        }
      } finally {
        await login.end();
      }
    },
  );
});

it('restores a complete pg_dump made with the restricted backup identity', async () => {
  await backupFixture(
    async ({ source, backup, backupLogin, backupPassword }) => {
      const url = new URL(source.db.url);
      const port = url.searchParams.get('port') ?? url.port;
      const listed = spawnSync(
        'docker',
        [
          'ps',
          '--filter',
          `publish=${port}`,
          '--filter',
          'ancestor=postgres:18',
          '--format',
          '{{.Names}}',
        ],
        { encoding: 'utf8', timeout: 10_000 },
      );
      const container = listed.stdout?.trim();
      if (
        listed.status !== 0 ||
        !container ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(container)
      )
        throw new Error('A unique local PostgreSQL18 container is required.');
      const command = (args: string[], input?: string) => {
        const result = spawnSync(
          'docker',
          ['exec', '-i', '--env', 'PGPASSWORD', container, ...args],
          {
            // Synthetic disposable credentials go through the environment, never command text.
            // oxlint-disable-next-line node/no-process-env -- child process receives synthetic test credentials only
            env: { ...process.env, PGPASSWORD: backupPassword },
            input,
            encoding: 'utf8',
            timeout: 20_000,
            maxBuffer: 8 * 1024 * 1024,
          },
        );
        if (result.status !== 0 || result.error)
          throw new Error('The restricted backup/restore command failed.');
        return result.stdout;
      };
      await assertBackupAccess(backup);
      const dump = command([
        'pg_dump',
        '--host',
        '127.0.0.1',
        '--username',
        backupLogin,
        '--role',
        BACKUP_ROLE,
        '--no-owner',
        '--enable-row-security',
        '--dbname',
        decodeURIComponent(url.pathname.slice(1)),
      ]);
      for (const table of [
        'participants',
        'credential_audit_events',
        'encryption_key_verifications',
        'studio_migrations.history',
      ])
        expect(dump).toContain(table);
      expect(dump).not.toContain(canary);
      expect(dump).not.toContain(Buffer.from(canary).toString('hex'));
      expect(dump).not.toContain(rootOne.toString('hex'));
      const restored = await createScratchDatabase(requireDatabase());
      try {
        const destination = new URL(restored.db.url);
        command(
          [
            'psql',
            '--no-psqlrc',
            '--quiet',
            '--set',
            'ON_ERROR_STOP=1',
            '--single-transaction',
            '--username',
            decodeURIComponent(destination.username),
            '--dbname',
            decodeURIComponent(destination.pathname.slice(1)),
          ],
          dump,
        );
        expect(await inventory(restored.pool)).toEqual(await inventory(backup));
      } finally {
        await restored.dispose();
      }
    },
  );
});
