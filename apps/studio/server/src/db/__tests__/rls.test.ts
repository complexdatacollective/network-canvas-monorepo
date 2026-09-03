// Row-level security across the whole Studio schema: which tables carry the
// policy, that the application role cannot see past it, and that the
// tables better-auth manages stay reachable without team context. The sync
// package proves the same mechanics on its own tables.
import { randomUUID } from 'node:crypto';

import { getTableColumns, getTableName } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEAM_GUC, TENANT_ROLES } from '@codaco/studio-sync/rls';
import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { GcRoleError, gcProtocolStore } from '../../protocol/gc.ts';
import { AUTH_TABLES } from '../auth-schema.ts';
import { SCHEMA } from '../schema.ts';

const db = await reachableDb();

const GC_OPTS = {
  retainManifestsPerDraft: 0,
  sectionGraceMs: 60_000,
  commandRetryHorizonMs: 0,
};

describe.skipIf(!db)('row-level security', () => {
  let pool: pg.Pool;
  let app: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    ({ pool, app, maintenance, dispose } = await createScratchSchema(db));
    await provisionScratchSchema(pool);
    for (const teamId of ['team-a', 'team-b']) {
      await seedTeam(pool, teamId);
      await maintenance.query(
        `INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $2)`,
        [randomUUID(), teamId],
      );
    }
    tenantA = createTenantDb(app, 'team-a');
  });
  afterAll(async () => {
    await dispose();
  });

  it('runs the application as a role that cannot bypass policies', async () => {
    const who = await app.query(
      `SELECT current_user AS role, rolsuper, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
    );
    expect(who.rows).toEqual([
      { role: TENANT_ROLES.app, rolsuper: false, rolbypassrls: false },
    ]);
  });

  it('forces the team policy on every tenant table and no other', async () => {
    const authTables = new Set(Object.values(AUTH_TABLES).map(getTableName));
    const expected = Object.values(SCHEMA)
      .filter(
        (table) =>
          !authTables.has(getTableName(table)) &&
          Object.values(getTableColumns(table)).some(
            (column) => column.name === 'team_id',
          ),
      )
      .map(getTableName)
      .toSorted();
    // Spelled out so a new tenant table cannot slip in without a policy.
    expect(expected).toEqual([
      'api_tokens',
      'audit_events',
      'command_log',
      'consent_documents',
      'consent_items',
      'drafts',
      'experiment_assignments',
      'experiment_exposures',
      'experiments',
      'feedback_reports',
      'interview_links',
      'interview_sessions',
      'leases',
      'manifests',
      'participant_consent_item_responses',
      'participant_consents',
      'participants',
      'protocol_drafts',
      'protocol_versions',
      'protocols',
      'sections',
      'studies',
      'study_role_grants',
      'study_waves',
      'team_invitation_deliveries',
      'version_sections',
      'webhook_deliveries',
      'webhook_subscriptions',
    ]);

    const rows = await pool.query<{
      table: string;
      enabled: boolean;
      forced: boolean;
      policies: string[] | null;
    }>(
      `SELECT c.relname AS "table", c.relrowsecurity AS enabled,
              c.relforcerowsecurity AS forced,
              array_agg(p.polname::text ORDER BY p.polname)
                FILTER (WHERE p.polname IS NOT NULL) AS policies
       FROM pg_class c
       LEFT JOIN pg_policy p ON p.polrelid = c.oid
       WHERE c.relkind = 'r' AND c.relnamespace = current_schema()::regnamespace
       GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
       ORDER BY c.relname`,
    );
    const protectedTables = rows.rows.filter((row) =>
      expected.includes(row.table),
    );
    expect(protectedTables).toEqual(
      expected.map((table) => ({
        table,
        enabled: true,
        forced: true,
        policies: [
          table === 'audit_events' ? 'audit_team_isolation' : 'team_isolation',
        ],
      })),
    );
    const others = rows.rows.filter((row) => !expected.includes(row.table));
    expect(others.map((row) => row.table).toSorted()).toEqual(
      [...authTables, 'schemaFingerprint'].toSorted(),
    );
    for (const row of others) {
      expect(row).toMatchObject({
        enabled: false,
        forced: false,
        policies: null,
      });
    }
  });

  it('shows a team only its own rows, even to an unfiltered statement', async () => {
    const inTransaction = await tenantA.transaction((client) =>
      client.query(`SELECT team_id FROM protocols`),
    );
    expect(inTransaction.rows).toEqual([{ team_id: 'team-a' }]);

    const viaQuery = await tenantA.query(`SELECT team_id FROM protocols`);
    expect(viaQuery.rows).toEqual([{ team_id: 'team-a' }]);

    // The connecting login is the development superuser, which no policy
    // binds — which is why the server never runs as it.
    const login = await pool.query(
      `SELECT team_id FROM protocols ORDER BY team_id`,
    );
    expect(login.rows).toEqual([{ team_id: 'team-a' }, { team_id: 'team-b' }]);
  });

  it('shows nothing without team context, before and after a transaction', async () => {
    const client = await app.connect();
    try {
      const count = () =>
        client
          .query<{ n: number }>(`SELECT count(*)::int AS n FROM protocols`)
          .then((res) => res.rows[0]?.n);
      expect(await count()).toBe(0);

      await client.query(`BEGIN; SET LOCAL ${TEAM_GUC} = 'team-a'`);
      expect(await count()).toBe(1);
      await client.query('COMMIT');

      // The expired setting reads as '' on this session from now on; the
      // policy's NULLIF keeps that from matching anything.
      const setting = await client.query(
        `SELECT current_setting('${TEAM_GUC}', true) AS value`,
      );
      expect(setting.rows).toEqual([{ value: '' }]);
      expect(await count()).toBe(0);
    } finally {
      client.release();
    }
  });

  it('refuses writes that would land in another team', async () => {
    await expect(
      tenantA.query(
        `INSERT INTO protocols (id, team_id, name) VALUES ($1, 'team-b', 'x')`,
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      tenantA.query(`UPDATE protocols SET team_id = 'team-b'`),
    ).rejects.toMatchObject({ code: '42501' });

    const deleted = await tenantA.query(`DELETE FROM protocols`);
    expect(deleted.rowCount).toBe(1);
    const survivors = await pool.query(`SELECT team_id FROM protocols`);
    expect(survivors.rows).toEqual([{ team_id: 'team-b' }]);
  });

  it('leaves the better-auth tables readable without team context', async () => {
    const teams = await app.query(`SELECT id FROM teams ORDER BY id`);
    expect(teams.rows).toEqual([{ id: 'team-a' }, { id: 'team-b' }]);
  });

  it('refuses to garbage-collect as any role but maintenance', async () => {
    await expect(gcProtocolStore(app, GC_OPTS)).rejects.toThrow(GcRoleError);
    await expect(gcProtocolStore(pool, GC_OPTS)).rejects.toThrow(GcRoleError);
    await expect(gcProtocolStore(maintenance, GC_OPTS)).resolves.toEqual({
      manifestsDeleted: 0,
      sectionsDeleted: 0,
      commandLogDeleted: 0,
    });
  });
});
