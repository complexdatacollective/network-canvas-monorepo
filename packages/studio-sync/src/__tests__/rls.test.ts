// Row-level security is what turns a forgotten team predicate into an empty
// result instead of another team's rows. Every case runs as the application
// role, as the server does; the superuser pool seeds and proves the contrast.
import { randomUUID } from 'node:crypto';

import { getTableName } from 'drizzle-orm';
import { Cause, Effect, Predicate } from 'effect';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEAM_GUC, TENANT_ROLES } from '../rls.ts';
import { SYNC_TABLES } from '../schema.ts';
import { Transaction } from '../tenant.ts';
import {
  TEST_TEAM_ID,
  dbAvailable,
  makeDraft,
  makeServer,
  makeSyncFacade,
  type RunTenant,
  type SyncFacade,
} from './helpers.ts';

const OTHER_TEAM_ID = 'team-other';

/** The SQLSTATE under a rejection, read through drizzle's and Effect's wrapping. */
function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 32; depth += 1) {
    if (!Predicate.isObject(current)) return undefined;
    if (Cause.isCause(current)) {
      current = Cause.squash(current);
      continue;
    }
    if ('code' in current && Predicate.isString(current.code)) {
      return current.code;
    }
    if (!('cause' in current)) return undefined;
    current = current.cause;
  }
  return undefined;
}

const rejectionOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

describe.skipIf(!dbAvailable)('row-level security', () => {
  let db: Pool;
  let app: Pool;
  let maintenance: Pool;
  let dispose: () => Promise<void>;
  let run: RunTenant;

  beforeAll(async () => {
    let server: SyncFacade;
    ({ db, app, maintenance, run, server, dispose } =
      await makeServer('sync_rls'));
    await makeDraft(server);
    await makeDraft(
      makeSyncFacade((body, options) =>
        run(body, { ...options, teamId: OTHER_TEAM_ID }),
      ),
    );
  });
  afterAll(async () => {
    await dispose();
  });

  it('runs as the application role, which cannot bypass policies', async () => {
    const who = await app.query(
      `SELECT current_user AS role, rolsuper, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
    );
    expect(who.rows).toEqual([
      { role: TENANT_ROLES.app, rolsuper: false, rolbypassrls: false },
    ]);
  });

  it('forces the team policy on every sync table', async () => {
    const tables = Object.values(SYNC_TABLES).map(getTableName).toSorted();
    const rows = await db.query(
      `SELECT c.relname AS "table", c.relrowsecurity AS enabled,
              c.relforcerowsecurity AS forced,
              array_agg(p.polname::text ORDER BY p.polname) AS policies
       FROM pg_class c
       LEFT JOIN pg_policy p ON p.polrelid = c.oid
       WHERE c.relname = ANY($1) AND c.relnamespace = current_schema()::regnamespace
       GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
       ORDER BY c.relname`,
      [tables],
    );
    expect(rows.rows).toEqual(
      tables.map((table) => ({
        table,
        enabled: true,
        forced: true,
        policies: ['team_isolation'],
      })),
    );
  });

  it('shows a team only its own rows, even to an unfiltered statement', async () => {
    // Every statement now runs inside a `run` transaction, so the old
    // transaction and single-query readings are one mechanism: a statement
    // sharing a transaction with another, and one alone in its own.
    const inTransaction = await run(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        yield* sql`SELECT 1`;
        return yield* sql`SELECT DISTINCT team_id FROM sections`;
      }),
    );
    expect(inTransaction).toEqual([{ team_id: TEST_TEAM_ID }]);

    const viaQuery = await run(
      Transaction.use(({ sql }) => sql`SELECT DISTINCT team_id FROM drafts`),
    );
    expect(viaQuery).toEqual([{ team_id: TEST_TEAM_ID }]);

    const superuser = await db.query(
      `SELECT DISTINCT team_id FROM sections ORDER BY team_id`,
    );
    expect(superuser.rows).toEqual([
      { team_id: OTHER_TEAM_ID },
      { team_id: TEST_TEAM_ID },
    ]);
  });

  it('shows nothing without team context, before and after a transaction', async () => {
    const client = await app.connect();
    try {
      const before = await client.query(
        `SELECT count(*)::int AS n FROM drafts`,
      );
      expect(before.rows).toEqual([{ n: 0 }]);

      await client.query(`BEGIN; SET LOCAL ${TEAM_GUC} = '${TEST_TEAM_ID}'`);
      const during = await client.query(
        `SELECT count(*)::int AS n FROM drafts`,
      );
      expect(during.rows).toEqual([{ n: 1 }]);
      await client.query('COMMIT');

      // The expired setting reads as '' on this session from now on — the
      // policy's NULLIF is what keeps that from matching anything.
      const setting = await client.query(
        `SELECT current_setting('${TEAM_GUC}', true) AS value`,
      );
      expect(setting.rows).toEqual([{ value: '' }]);
      const after = await client.query(`SELECT count(*)::int AS n FROM drafts`);
      expect(after.rows).toEqual([{ n: 0 }]);
    } finally {
      client.release();
    }
  });

  it('refuses writes that would land in another team', async () => {
    const inserted = await rejectionOf(
      run(
        Transaction.use(
          ({ sql }) =>
            sql`INSERT INTO drafts (id, team_id, head_manifest_hash) VALUES (${randomUUID()}, ${OTHER_TEAM_ID}, 'x')`,
        ),
      ),
    );
    expect(sqlState(inserted)).toBe('42501');

    const updated = await rejectionOf(
      run(
        Transaction.use(
          ({ sql }) => sql`UPDATE drafts SET team_id = ${OTHER_TEAM_ID}`,
        ),
      ),
    );
    expect(sqlState(updated)).toBe('42501');

    // Rows outside the team are invisible to a delete, not deleted.
    const deleted = await run(
      Transaction.use(({ sql }) => sql`DELETE FROM leases`.raw),
    );
    expect(deleted).toMatchObject({ rowCount: 0 });
    const survivors = await db.query(`SELECT count(*)::int AS n FROM drafts`);
    expect(survivors.rows).toEqual([{ n: 2 }]);
  });

  it('lets the maintenance role across every team', async () => {
    const teams = await maintenance.query(
      `SELECT DISTINCT team_id FROM drafts ORDER BY team_id`,
    );
    expect(teams.rows).toEqual([
      { team_id: OTHER_TEAM_ID },
      { team_id: TEST_TEAM_ID },
    ]);
  });
});
