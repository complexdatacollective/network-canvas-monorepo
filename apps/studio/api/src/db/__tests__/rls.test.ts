// Row-level security across the whole Studio schema: which tables carry the
// policy, that the application role cannot see past it, and that the
// tables better-auth manages stay reachable without team context. The sync
// package proves the same mechanics on its own tables.
import { randomUUID } from 'node:crypto';

import { layer } from '@effect/vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import { TEAM_GUC, TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  affectedRows,
  insertTeam,
  ownerRows,
  refusalOf,
  TestDatabaseLive,
  testDb,
  tenantRows,
} from '../../__tests__/support/database.ts';
import { AUTH_TABLES } from '../auth-schema.ts';
import { SCHEMA } from '../schema.ts';
import {
  MaintenanceScope,
  TenantScope,
  Transaction,
  UntenantedScope,
  unsafeMakeTeamAccess,
} from '../tenant.ts';

type Row = Record<string, unknown>;

/** Both teams, with one protocol each written by the worker, once for the file. */
const Fixtures = Layer.effectDiscard(
  Effect.forEach(['team-a', 'team-b'], (teamId) =>
    Effect.andThen(
      insertTeam(teamId),
      MaintenanceScope.open(
        Effect.flatMap(Transaction, ({ sql }) =>
          sql.unsafe(
            `INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $2)`,
            [randomUUID(), teamId],
          ),
        ),
      ),
    ),
  ),
).pipe(Layer.provideMerge(TestDatabaseLive));

/** One statement on the application client with no team stamped. */
const untenanted = <A extends object = Row>(statement: string) =>
  UntenantedScope.open(
    Effect.flatMap(Transaction, ({ sql }) => sql.unsafe<A>(statement)),
  );

describe.skipIf(!testDb)('row-level security', () => {
  layer(Fixtures)('over a provisioned schema', (it) => {
    it.effect(
      'runs the application as a role that cannot bypass policies',
      () =>
        Effect.gen(function* () {
          const who = yield* untenanted(
            `SELECT current_user AS role, rolsuper, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
          );
          expect(who).toEqual([
            { role: TENANT_ROLES.app, rolsuper: false, rolbypassrls: false },
          ]);
        }),
    );

    it.effect('forces the team policy on every tenant table and no other', () =>
      Effect.gen(function* () {
        const authTables = new Set(
          Object.values(AUTH_TABLES).map(getTableName),
        );
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
          'asset_references',
          'assets',
          'audit_alert_outbox',
          'audit_events',
          'audit_export_jobs',
          'command_log',
          'consent_documents',
          'consent_items',
          'drafts',
          'edges',
          'experiment_assignments',
          'experiment_exposures',
          'experiments',
          'feedback_reports',
          'interview_links',
          'interview_sessions',
          'leases',
          'manifests',
          'message_deliveries',
          'message_delivery_events',
          'message_templates',
          'nodes',
          'participant_consent_item_responses',
          'participant_consents',
          'participant_contact_optouts',
          'participants',
          'protocol_asset_keys',
          'protocol_drafts',
          'protocol_events',
          'protocol_versions',
          'protocol_write_receipts',
          'protocols',
          'schedule_occurrences',
          'sections',
          'session_degree_hist',
          'session_snapshots',
          'session_stats',
          'studies',
          'study_role_grants',
          'study_schedules',
          'study_stage_rollups',
          'study_wave_rollups',
          'study_waves',
          'team_invitation_deliveries',
          'template_version_sections',
          'template_versions',
          'templates',
          'version_sections',
          'webhook_deliveries',
          'webhook_subscriptions',
        ]);

        const rows = yield* ownerRows<{
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
        const protectedTables = rows.filter((row) =>
          expected.includes(row.table),
        );
        expect(protectedTables).toEqual(
          expected.map((table) => ({
            table,
            enabled: true,
            forced: true,
            policies: [
              table === 'audit_events'
                ? 'audit_team_isolation'
                : 'team_isolation',
            ],
          })),
        );
        const others = rows.filter((row) => !expected.includes(row.table));
        // The platform-level tables, which belong to the instance rather than to
        // any team: the schema stamp, the installation row first-run setup writes
        // (#1909), and the maintenance switch every process reads
        // (`deployment_state`). None carries a policy, and all are held by grants —
        // the list is spelled out so a new tenant table cannot join it silently.
        expect(others.map((row) => row.table).toSorted()).toEqual(
          [
            ...authTables,
            'schemaFingerprint',
            'installation',
            'deployment_state',
          ].toSorted(),
        );
        for (const row of others) {
          expect(row).toMatchObject({
            enabled: false,
            forced: false,
            policies: null,
          });
        }
      }),
    );

    it.effect(
      'shows a team only its own rows, even to an unfiltered statement',
      () =>
        Effect.gen(function* () {
          const first = yield* tenantRows(
            'team-a',
            `SELECT team_id FROM protocols`,
          );
          expect(first).toEqual([{ team_id: 'team-a' }]);

          // The team is stamped per transaction, so the next one on the same
          // pooled connection is stamped again rather than left to inherit.
          const second = yield* tenantRows(
            'team-a',
            `SELECT team_id FROM protocols`,
          );
          expect(second).toEqual([{ team_id: 'team-a' }]);

          // The connecting login is the development superuser, which no policy
          // binds — which is why the server never runs as it.
          const login = yield* ownerRows(
            `SELECT team_id FROM protocols ORDER BY team_id`,
          );
          expect(login).toEqual([{ team_id: 'team-a' }, { team_id: 'team-b' }]);
        }),
    );

    // The application client holds one connection, so every scope below runs on
    // the same backend session, one transaction after another.
    it.effect(
      'shows nothing without team context, before and after a transaction',
      () =>
        Effect.gen(function* () {
          const count = untenanted<{ n: number }>(
            `SELECT count(*)::int AS n FROM protocols`,
          ).pipe(Effect.map((rows) => rows[0]?.n));
          expect(yield* count).toBe(0);

          const stamped = yield* UntenantedScope.open(
            Effect.gen(function* () {
              const { sql } = yield* Transaction;
              yield* sql.unsafe(`SET LOCAL ${TEAM_GUC} = 'team-a'`);
              const rows = yield* sql.unsafe<{ n: number }>(
                `SELECT count(*)::int AS n FROM protocols`,
              );
              return rows[0]?.n;
            }),
          );
          expect(stamped).toBe(1);

          // The expired setting reads as '' on this session from now on; the
          // policy's NULLIF keeps that from matching anything.
          const setting = yield* untenanted(
            `SELECT current_setting('${TEAM_GUC}', true) AS value`,
          );
          expect(setting).toEqual([{ value: '' }]);
          expect(yield* count).toBe(0);
        }),
    );

    it.effect('refuses writes that would land in another team', () =>
      Effect.gen(function* () {
        const inserted = yield* refusalOf(
          tenantRows(
            'team-a',
            `INSERT INTO protocols (id, team_id, name) VALUES ($1, 'team-b', 'x')`,
            [randomUUID()],
          ),
        );
        expect(inserted.state).toBe('42501');
        const updated = yield* refusalOf(
          tenantRows('team-a', `UPDATE protocols SET team_id = 'team-b'`),
        );
        expect(updated.state).toBe('42501');

        const deleted = yield* TenantScope.open(
          unsafeMakeTeamAccess('team-a', 'owner'),
          Effect.flatMap(Transaction, ({ sql }) =>
            affectedRows(sql.unsafe(`DELETE FROM protocols`)),
          ),
        );
        expect(deleted).toBe(1);
        const survivors = yield* ownerRows(`SELECT team_id FROM protocols`);
        expect(survivors).toEqual([{ team_id: 'team-b' }]);
      }),
    );

    it.effect(
      'leaves the better-auth tables readable without team context',
      () =>
        Effect.gen(function* () {
          const teams = yield* untenanted(`SELECT id FROM teams ORDER BY id`);
          expect(teams).toEqual([{ id: 'team-a' }, { id: 'team-b' }]);
        }),
    );

    // "Refuses to garbage-collect as any role but maintenance" lived here while
    // the sweep was node-postgres over a pool this suite already had. The sweep
    // is an Effect over a `Database` now, so the claim moved to the suite that
    // builds one: `src/jobs/handlers/__tests__/protocol-store-gc.test.ts`
    // refuses the application identity, and refuses a login that may not assume
    // the role at all — which this case never covered.
  });
});
