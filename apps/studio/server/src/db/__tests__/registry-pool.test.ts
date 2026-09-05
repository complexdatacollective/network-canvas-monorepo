import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';

const db = await reachableDb();
const registryRoles = ['registry_app', 'registry_operator'] as const;
const onIdleError = () => undefined;

describe.skipIf(!db)('shared pools for a separate registry database', () => {
  let scratch: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable');
    scratch = await createScratchDatabase(db);
    // Roles belong to the cluster, so serialize their idempotent creation
    // while keeping all registry connections in this disposable database.
    await scratch.pool.query(`DO $$ BEGIN
      PERFORM pg_advisory_xact_lock(4021775688147131);
      BEGIN
        CREATE ROLE registry_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN NULL; END;
      BEGIN
        CREATE ROLE registry_operator NOLOGIN NOSUPERUSER NOBYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN NULL; END;
      EXECUTE format('GRANT registry_app, registry_operator TO %I WITH SET TRUE', current_user);
    END $$;`);
  });

  afterAll(async () => {
    await scratch?.dispose();
  });

  describe.each(registryRoles)('%s', (role) => {
    it.each([
      undefined,
      '-c application_name=registry_pool -c role=none',
      '-c role=registry_operator -c role=registry_app',
      String.raw`-c application_name=registry\ pool`,
    ])('pins startup and RESET ROLE with URL options %s', async (options) => {
      const url = new URL(scratch.db.url);
      if (options !== undefined) url.searchParams.set('options', options);
      const pool = createPostgresPool({
        connectionString: url.toString(),
        role,
        max: role === 'registry_app' ? 4 : 2,
        onIdleError,
        roleMismatchCode: 'REGISTRY_DATABASE_ROLE_MISMATCH',
      });
      try {
        const client = await pool.connect();
        try {
          expect(
            (
              await client.query(`SELECT current_user AS role,
                current_database() AS database, current_user <> session_user AS pinned,
                rolcanlogin, rolsuper, rolbypassrls
                FROM pg_roles WHERE rolname = current_user`)
            ).rows,
          ).toEqual([
            {
              role,
              database: url.pathname.slice(1),
              pinned: true,
              rolcanlogin: false,
              rolsuper: false,
              rolbypassrls: false,
            },
          ]);
          expect(url.pathname).not.toBe(new URL(db!.url).pathname);
          await client.query('SET ROLE NONE');
          await client.query('RESET ROLE');
          expect(
            (await client.query('SELECT current_user AS role')).rows,
          ).toEqual([{ role }]);
          if (options?.includes('application_name')) {
            expect(
              (
                await client.query(
                  "SELECT current_setting('application_name') AS name",
                )
              ).rows,
            ).toEqual([
              {
                name: options.includes('\\')
                  ? 'registry pool'
                  : 'registry_pool',
              },
            ]);
          }
        } finally {
          client.release();
        }
      } finally {
        await pool.end();
      }
    });

    it('retains URL host, TLS, duplicate options and ignores a nested URL', async () => {
      const url = new URL(scratch.db.url);
      const port = url.port;
      const nested = new URL(scratch.db.url);
      nested.searchParams.set('options', '-c role=none');
      nested.searchParams.set('sslmode', 'verify-full');
      url.hostname = 'unreachable.invalid';
      url.port = '1';
      url.searchParams.set('host', '127.0.0.1');
      url.searchParams.set('port', port);
      url.searchParams.set('sslmode', 'disable');
      url.searchParams.set('statement_timeout', '1234');
      url.searchParams.set('options', '-c role=none');
      url.searchParams.append('options', '-c application_name=outer_value');
      url.searchParams.set('connectionString', nested.toString());
      const pool = createPostgresPool({
        connectionString: url.toString(),
        role,
        onIdleError,
      });
      try {
        const result = await pool.query<{
          pid: number;
        }>(`SELECT current_user AS role,
          current_database() AS database, current_setting('application_name') AS name,
          (SELECT setting FROM pg_settings WHERE name = 'statement_timeout') AS timeout,
          pg_backend_pid() AS pid`);
        expect(result.rows).toEqual([
          {
            role,
            database: url.pathname.slice(1),
            name: 'outer_value',
            timeout: '1234',
            pid: expect.any(Number),
          },
        ]);
        // pg_stat_ssl hides session details from the pinned NOLOGIN role.
        // The owner observes the exact physical connection checked above.
        expect(
          (
            await scratch.pool.query(
              'SELECT ssl FROM pg_stat_ssl WHERE pid = $1',
              [result.rows[0]!.pid],
            )
          ).rows,
        ).toEqual([{ ssl: false }]);
      } finally {
        await pool.end();
      }
    });

    it('rejects a mismatched client before checkout and recovers with the registry code', async () => {
      const pool = createPostgresPool({
        connectionString: scratch.db.url,
        role,
        onIdleError,
        roleMismatchCode: 'REGISTRY_DATABASE_ROLE_MISMATCH',
      });
      pool.options.options = '-c role=none';
      try {
        await expect(pool.query('SELECT 1')).rejects.toThrow(
          'REGISTRY_DATABASE_ROLE_MISMATCH',
        );
        expect(pool.totalCount).toBe(0);
        expect(pool.idleCount).toBe(0);
        pool.options.options = `-c role=${role}`;
        expect((await pool.query('SELECT current_user AS role')).rows).toEqual([
          { role },
        ]);
      } finally {
        await pool.end();
      }
    });
  });

  it('uses a generic mismatch code when the caller supplies none', async () => {
    const pool = createPostgresPool({
      connectionString: scratch.db.url,
      role: 'registry_app',
      onIdleError,
    });
    pool.options.options = '-c role=none';
    try {
      await expect(pool.query('SELECT 1')).rejects.toThrow(
        'POSTGRES_DATABASE_ROLE_MISMATCH',
      );
      expect(pool.totalCount).toBe(0);
    } finally {
      await pool.end();
    }
  });
});
