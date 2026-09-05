import { randomUUID } from 'node:crypto';

import { escapeIdentifier, Pool } from 'pg';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  runtimeRolesSql,
  validateRoleNames,
} from '@codaco/studio-sync/role-bootstrap';

import {
  createScratchDatabase,
  reachableDb,
} from '../../../__tests__/support/postgres.ts';

const database = await reachableDb();

async function withRoles(
  run: (fixture: {
    administrator: Pool;
    otherDatabase: Pool;
    otherUrl: string;
    roles: [string, string, string];
  }) => Promise<void>,
) {
  if (!database) throw new Error('Database required for role bootstrap tests.');
  const suffix = randomUUID().replaceAll('-', '');
  const roles: [string, string, string] = [
    `app_${suffix}`,
    `parent_${suffix}`,
    `operator_${suffix}`,
  ];
  const administrator = new Pool({ connectionString: database.url });
  const other = await createScratchDatabase(database);
  try {
    await run({
      administrator,
      otherDatabase: other.pool,
      otherUrl: other.db.url,
      roles,
    });
  } finally {
    await other.dispose();
    await administrator.query(
      `DROP ROLE IF EXISTS ${roles.map(escapeIdentifier).join(', ')}`,
    );
    await administrator.end();
  }
}

async function expectSafeRole(pool: pg.Pool, role: string) {
  expect(
    (
      await pool.query(
        `SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication FROM pg_roles WHERE rolname = $1`,
        [role],
      )
    ).rows,
  ).toEqual([
    {
      rolcanlogin: false,
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
    },
  ]);
}

describe.skipIf(!database)('repeatable runtime role bootstrap', () => {
  it.each(['safe', 'BYPASSRLS'])(
    'handles a concurrent %s role winner in a different database',
    async (winner) => {
      await withRoles(
        async ({ administrator, otherDatabase, roles: [role] }) => {
          const first = await administrator.connect();
          const second = await otherDatabase.connect();
          let pending: Promise<pg.QueryResult> | undefined;
          try {
            await first.query('BEGIN');
            await first.query(
              `CREATE ROLE ${escapeIdentifier(role)} NOLOGIN ${winner === 'safe' ? 'NOBYPASSRLS' : winner}`,
            );
            const {
              rows: [identity],
            } = await second.query<{ pid: number }>(
              'SELECT pg_backend_pid() AS pid',
            );
            expect(identity).toBeDefined();
            pending = second.query(runtimeRolesSql([role]));
            pending.catch(() => undefined);
            // The winner's uncommitted cluster role is invisible in the other DB.
            // Observe the loser blocked in CREATE ROLE before releasing the winner.
            await expect
              .poll(
                async () =>
                  (
                    await administrator.query<{ wait: string }>(
                      'SELECT wait_event_type AS wait FROM pg_stat_activity WHERE pid = $1',
                      [identity!.pid],
                    )
                  ).rows[0]?.wait,
                { timeout: 3000, interval: 10 },
              )
              .toBe('Lock');
            await first.query('COMMIT');
            if (winner === 'safe') {
              await pending;
              await expectSafeRole(administrator, role);
            } else {
              await expect(pending).rejects.toMatchObject({ code: '42501' });
              expect(
                (
                  await administrator.query(
                    'SELECT rolbypassrls FROM pg_roles WHERE rolname = $1',
                    [role],
                  )
                ).rows,
              ).toEqual([{ rolbypassrls: true }]);
            }
          } finally {
            await first.query('ROLLBACK');
            await pending?.catch(() => undefined);
            first.release();
            second.release();
          }
        },
      );
    },
  );

  it.each([
    'LOGIN',
    'SUPERUSER',
    'BYPASSRLS',
    'CREATEROLE',
    'CREATEDB',
    'REPLICATION',
  ])('refuses a precreated runtime role with %s', async (attribute) => {
    await withRoles(async ({ administrator, roles: [role] }) => {
      await administrator.query(
        `CREATE ROLE ${escapeIdentifier(role)} ${attribute}`,
      );
      await expect(
        administrator.query(runtimeRolesSql([role])),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it.each([
    'WITH SET TRUE, INHERIT FALSE',
    'WITH SET FALSE, INHERIT TRUE',
    'WITH SET FALSE, INHERIT FALSE',
  ])(
    'refuses parent memberships %s and rechecks already-created roles',
    async (membership) => {
      await withRoles(async ({ administrator, roles: [role, parent] }) => {
        await administrator.query(runtimeRolesSql([role]));
        await expectSafeRole(administrator, role);
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(parent)} NOLOGIN BYPASSRLS`,
        );
        await administrator.query(
          `GRANT ${escapeIdentifier(parent)} TO ${escapeIdentifier(role)} ${membership}`,
        );
        await expect(
          administrator.query(runtimeRolesSql([role])),
        ).rejects.toThrow('parent memberships');
        await administrator.query(
          `REVOKE ${escapeIdentifier(parent)} FROM ${escapeIdentifier(role)}`,
        );
        await administrator.query(runtimeRolesSql([role]));
        await expectSafeRole(administrator, role);
      });
    },
  );

  it('permits an unprivileged operator to validate precreated roles without creating memberships', async () => {
    await withRoles(
      async ({ administrator, otherUrl, roles: [role, absent, operator] }) => {
        await administrator.query(runtimeRolesSql([role]));
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(operator)} LOGIN NOCREATEROLE PASSWORD 'role-bootstrap-test-only'`,
        );
        const connection = new URL(otherUrl);
        connection.username = operator;
        connection.password = 'role-bootstrap-test-only';
        const pool = new Pool({ connectionString: connection.href });
        try {
          await pool.query(runtimeRolesSql([role]));
          expect(
            (
              await pool.query(
                "SELECT pg_has_role(current_user, $1, 'SET') AS allowed",
                [role],
              )
            ).rows,
          ).toEqual([{ allowed: false }]);
          await expect(
            pool.query(runtimeRolesSql([absent])),
          ).rejects.toMatchObject({ code: '42501' });
          expect(
            (
              await administrator.query(
                'SELECT rolname FROM pg_roles WHERE rolname = $1',
                [absent],
              )
            ).rows,
          ).toEqual([]);
        } finally {
          await pool.end();
        }
      },
    );
  });

  it('quotes identifiers and the procedural body for unusual role names', async () => {
    await withRoles(async ({ administrator, roles }) => {
      roles[0] = `role"'$studio_roles$-${randomUUID().slice(0, 8)}`;
      await administrator.query(runtimeRolesSql([roles[0]]));
      await expectSafeRole(administrator, roles[0]);
      await administrator.query(runtimeRolesSql([roles[0]]));
    });
  });
});

it.each(['role\ud800', 'role\udfff'])(
  'refuses a role name with a lone surrogate rather than enrolling a replacement character',
  (role) => {
    expect(() => validateRoleNames([role])).toThrow(
      'valid PostgreSQL role names',
    );
    expect(() => validateRoleNames(['role\ufffd'])).not.toThrow();
  },
);
