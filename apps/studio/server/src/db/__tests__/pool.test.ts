import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';
import { createTenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { operationalLogger } from '../../observability/logger.ts';
import { createMaintenancePool, createOwnerPool, createPool } from '../pool.ts';

const db = await reachableDb();
const identities = [
  [TENANT_ROLES.app, createPool],
  [TENANT_ROLES.maintenance, createMaintenancePool],
] as const;

describe.skipIf(!db)('database pool role boundary', () => {
  describe.each(identities)('%s', (role, create) => {
    it.each([
      undefined,
      '-c application_name=pool_probe',
      '-c role=studio_maintenance',
      '-c role=studio_app -c role=studio_maintenance',
      String.raw`-c application_name=pool\ probe`,
    ])(
      'pins startup and RESET ROLE with caller options %s',
      async (options) => {
        if (!db) throw new Error('unreachable');
        const url = new URL(db.url);
        if (options !== undefined) url.searchParams.set('options', options);
        const pool = create({ url: url.toString() });
        try {
          const client = await pool.connect();
          try {
            expect(
              (await client.query('SELECT current_user AS role')).rows,
            ).toEqual([{ role }]);
            await client.query('SET ROLE NONE');
            await client.query('RESET ROLE');
            expect(
              (await client.query('SELECT current_user AS role')).rows,
            ).toEqual([{ role }]);
            if (options?.includes('application_name')) {
              const expected = options.includes('\\')
                ? 'pool probe'
                : 'pool_probe';
              expect(
                (
                  await client.query(
                    "SELECT current_setting('application_name') AS name",
                  )
                ).rows,
              ).toEqual([{ name: expected }]);
            }
          } finally {
            client.release();
          }
        } finally {
          await pool.end();
        }
      },
    );

    it('retains URL host, port, startup settings and duplicate-parameter semantics', async () => {
      if (!db) throw new Error('unreachable');
      const url = new URL(db.url);
      const port = url.port;
      url.hostname = 'unreachable.invalid';
      url.port = '1';
      url.searchParams.set('host', '127.0.0.1');
      url.searchParams.set('port', port);
      url.searchParams.set('sslmode', 'disable');
      url.searchParams.set('statement_timeout', '1234');
      url.searchParams.set('options', '-c role=studio_maintenance');
      url.searchParams.append(
        'options',
        '-c application_name=last_value -c search_path=pg_catalog',
      );
      const pool = create({ url: url.toString() });
      try {
        const result = await pool.query(`SELECT current_user AS role,
          current_setting('application_name') AS name,
          current_setting('search_path') AS path,
          (SELECT setting FROM pg_settings WHERE name = 'statement_timeout') AS timeout`);
        expect(result.rows).toEqual([
          { role, name: 'last_value', path: 'pg_catalog', timeout: '1234' },
        ]);
      } finally {
        await pool.end();
      }
    });

    it('does not parse a nested connectionString query parameter a second time', async () => {
      if (!db) throw new Error('unreachable');
      const outer = new URL(db.url);
      const nested = new URL(db.url);
      nested.searchParams.set('options', '-c role=studio_maintenance');
      outer.searchParams.set('connectionString', nested.toString());
      outer.searchParams.set('options', '-c application_name=outer_value');
      const pool = create({ url: outer.toString() });
      try {
        expect(
          (
            await pool.query(
              "SELECT current_user AS role, current_setting('application_name') AS name",
            )
          ).rows,
        ).toEqual([{ role, name: 'outer_value' }]);
      } finally {
        await pool.end();
      }
    });

    it('refuses a mismatched physical client before checkout and can reconnect safely', async () => {
      if (!db) throw new Error('unreachable');
      const pool = create(db);
      pool.options.options = '-c role=none';
      try {
        await expect(pool.query('SELECT 1')).rejects.toThrow(
          'STUDIO_DATABASE_ROLE_MISMATCH',
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

    it.each(['--', '-c', '-c application_name=pool_probe\\'])(
      'refuses malformed startup options without handing out an owner client: %s',
      async (options) => {
        if (!db) throw new Error('unreachable');
        const url = new URL(db.url);
        url.searchParams.set('options', options);
        const pool = create({ url: url.toString() });
        try {
          const checkout = pool.connect().then((client) => {
            client.release();
            return 'unexpected checkout';
          });
          await expect(checkout).rejects.toThrow();
          expect(pool.totalCount).toBe(0);
        } finally {
          await pool.end();
        }
      },
    );
  });

  it('enforces tenant RLS through the real application factory with hostile URL options', async () => {
    if (!db) throw new Error('unreachable');
    const scratch = await createScratchSchema(db);
    let application: ReturnType<typeof createPool> | undefined;
    try {
      await provisionScratchSchema(scratch.pool);
      for (const team of ['pool-team-a', 'pool-team-b']) {
        await seedTeam(scratch.pool, team);
        await scratch.pool.query(
          'INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $2)',
          [randomUUID(), team],
        );
      }
      const path = await scratch.pool.query<{ path: string }>(
        "SELECT current_setting('search_path') AS path",
      );
      const url = new URL(db.url);
      url.searchParams.set(
        'options',
        `-c search_path=${path.rows[0]!.path} -c role=studio_maintenance`,
      );
      application = createPool({ url: url.toString() });
      expect(
        (await application.query('SELECT team_id FROM protocols')).rows,
      ).toEqual([]);
      const tenant = createTenantDb(application, 'pool-team-a');
      const rows = await tenant.transaction(
        async (client) =>
          (await client.query('SELECT team_id FROM protocols')).rows,
      );
      expect(rows).toEqual([{ team_id: 'pool-team-a' }]);
      expect(
        (await application.query('SELECT team_id FROM protocols')).rows,
      ).toEqual([]);
    } finally {
      await application?.end();
      await scratch.dispose();
    }
  });

  it('keeps the owner pool on its login identity and preserves its URL settings', async () => {
    if (!db) throw new Error('unreachable');
    const url = new URL(db.url);
    url.searchParams.set('options', '-c application_name=owner_probe');
    const pool = createOwnerPool({ url: url.toString() });
    try {
      expect(
        (
          await pool.query(
            "SELECT current_user = session_user AS owner, current_setting('application_name') AS name",
          )
        ).rows,
      ).toEqual([{ owner: true, name: 'owner_probe' }]);
    } finally {
      await pool.end();
    }
  });

  it('omits error and client connection contents from idle pool diagnostics', async () => {
    if (!db) throw new Error('unreachable');
    const log = vi
      .spyOn(operationalLogger, 'diagnostic')
      .mockImplementation(() => undefined);
    const pool = createPool(db);
    try {
      pool.emit('error', new Error('secret-client-canary'), {
        password: 'secret-client-canary',
      });
      expect(log).toHaveBeenCalledExactlyOnceWith(
        'STUDIO_DATABASE_IDLE_ERROR',
        undefined,
      );
    } finally {
      await pool.end();
      log.mockRestore();
    }
  });
});
