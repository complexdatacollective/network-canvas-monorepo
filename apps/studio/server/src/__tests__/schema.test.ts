import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { JOB_QUEUES, JOB_SCHEMA } from '@codaco/studio-sync/jobs';

import {
  applySchema,
  computeSchemaFingerprint,
  renderJobStatements,
  renderSchemaStatements,
} from '../../scripts/apply.ts';
import {
  readSchemaDocsSection,
  STUDIO_ERD_PATH,
  STUDIO_README_PATH,
} from '../../scripts/schema-docs.ts';
import { ACCESS_SIDECAR_SQL } from '../db/access.ts';
import { SCHEMA_FINGERPRINT } from '../db/fingerprint.generated.ts';
import { createPool } from '../db/pool.ts';
import {
  checkSchema,
  SIDECARS,
  SCHEMA_TABLES,
  type StaleSchema,
  schemaProblemMessage,
} from '../db/schema.ts';
import type { DbEnv } from '../env.ts';
import { createJobClient } from '../jobs/client.ts';
import { JOB_SCHEMA_VERSION } from '../jobs/queues.ts';
import {
  declaredQueueRows,
  installedQueueRows,
  queueRowFor,
} from './support/job-queues.ts';
import {
  createScratchDatabase,
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from './support/postgres.ts';

const db = await reachableDb();

function readManifestScripts(): Record<string, string> {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> };
  return manifest.scripts;
}

describe('fingerprint constant', () => {
  it('matches the schema definitions', async () => {
    expect(
      await computeSchemaFingerprint(),
      'stale src/db/fingerprint.generated.ts; run: pnpm --filter @codaco/studio-server sync-fingerprint',
    ).toBe(SCHEMA_FINGERPRINT);
  });

  it('is resynced by a script package.json declares', () => {
    expect(readManifestScripts()).toHaveProperty('sync-fingerprint');
  });

  // A pg-boss upgrade or a queue change is a schema change like any other, so
  // both have to move the fingerprint every process checks at boot.
  it('covers pg-boss and the queues declared on it', async () => {
    const jobStatements = renderJobStatements().join('\n');
    expect(jobStatements).toContain(JSON.stringify(JOB_QUEUES));
    expect(jobStatements).toContain(`VALUES ('${JOB_SCHEMA_VERSION}')`);

    const publicOnly = createHash('sha256')
      .update((await renderSchemaStatements()).join('\n'))
      .digest('hex');
    expect(await computeSchemaFingerprint()).not.toBe(publicOnly);
  });

  it('applies audit immutability after every general privilege grant', () => {
    const sql = SIDECARS.join('\n');
    expect(sql.lastIndexOf('REVOKE UPDATE, DELETE, TRUNCATE')).toBeGreaterThan(
      sql.lastIndexOf('GRANT SELECT, INSERT, UPDATE, DELETE'),
    );
    expect(SIDECARS.at(-1)).toContain('audit_events_are_immutable');
  });

  // The broad ALL TABLES grant re-admits whatever an earlier REVOKE took away,
  // so every sidecar that revokes must run after it. Position is checked here;
  // the effect is checked against a provisioned schema below.
  it('runs the broad access grant before every narrow revocation', () => {
    const access = SIDECARS.indexOf(ACCESS_SIDECAR_SQL);
    expect(access).toBeGreaterThan(0);
    const revoking = SIDECARS.flatMap((sidecar, index) =>
      /\bREVOKE\b/.test(sidecar) ? [index] : [],
    );
    expect(revoking.length).toBeGreaterThan(0);
    expect(revoking.every((index) => index > access)).toBe(true);
  });
});

// The committed ERD and README section are compared against a fresh render by
// `pnpm --filter @codaco/studio-server check:schema-docs`, which CI runs as a
// step of its own. That render is a DBML import plus an SVG layout — seconds
// of CPU with no database in it — and it has no business competing for a
// per-test budget with the suites next door that hold Postgres busy for
// minutes; held to one, it failed the test job for being slow rather than for
// anything being stale. What is left here reads the artifacts as committed,
// which costs nothing and is what a reader of the repository actually sees.
const committedSchemaDocs = {
  readmeSection: readSchemaDocsSection(
    readFileSync(STUDIO_README_PATH, 'utf8'),
  ),
  svg: readFileSync(STUDIO_ERD_PATH, 'utf8'),
};

describe('generated schema documentation', () => {
  // The cheap half of the staleness guard, and the half that catches the
  // ordinary case: a schema or sidecar change resynced nowhere. The section
  // quotes the fingerprint, and the `fingerprint constant` suite above ties
  // that fingerprint to the schema definitions. What this cannot see is a
  // change to the renderer or to spliceSchemaDocs, which leaves the
  // fingerprint untouched — that is what check:schema-docs is for.
  it('quotes the current schema fingerprint', () => {
    expect(
      committedSchemaDocs.readmeSection,
      'stale README schema section; run: pnpm --filter @codaco/studio-server sync-fingerprint',
    ).toContain(`Schema fingerprint: \`${SCHEMA_FINGERPRINT}\`.`);
  });

  it('is checked against a fresh render by a script package.json declares', () => {
    expect(readManifestScripts()).toHaveProperty('check:schema-docs');
  });

  it('documents the sidecar-only security and trigger behavior', () => {
    const { readmeSection, svg } = committedSchemaDocs;

    expect(readmeSection).toContain('FORCE ROW LEVEL SECURITY');
    expect(readmeSection).toContain('studio_maintenance');
    expect(readmeSection).toContain('sections_immutable');
    expect(readmeSection).toContain('version_sections_insert_frozen');
    expect(readmeSection).toContain('assets_metadata_immutable');
    expect(readmeSection).toContain('asset_references_published_immutable');
    expect(readmeSection).toContain('template_versions_immutable');
    expect(readmeSection).toContain('template_version_sections_immutable');
    expect(readmeSection).toContain('template_version_sections_insert_frozen');
    expect(readmeSection).toContain('audit_export_request_immutable');
    expect(readmeSection).toContain('audit_export_handle_single_use');
    expect(readmeSection).toContain('audit_alert_link_immutable');
    expect(readmeSection).toContain('studies_closed_read_only');
    expect(readmeSection).toContain('studies_delete_purge_only');
    expect(readmeSection).toContain('study_waves_identity_immutable');
    expect(readmeSection).toContain('study_waves_parent_open');
    expect(readmeSection).toContain('participants_writable');
    expect(readmeSection).toContain('interview_sessions_writable');
    expect(readmeSection).toContain('interview_sessions_link_own');
    expect(readmeSection).toContain('studies_go_live_final');
    expect(readmeSection).toContain('studies_protocol_line_unpinned');
    expect(readmeSection).toContain('study_waves_version_own_line');
    expect(readmeSection).toContain('interview_sessions_version_wave_pin');
    expect(readmeSection).toContain('interview_sessions_completion_snapshot');
    expect(readmeSection).toContain('interview_links_writable');
    expect(readmeSection).toContain('api_token_authority_immutable');
    expect(readmeSection).toContain('consent_documents_publication_immutable');
    expect(readmeSection).toContain('consent_documents_delete_purge_only');
    expect(readmeSection).toContain('consent_items_frozen');
    expect(readmeSection).toContain('participant_consent_grant_immutable');
    expect(readmeSection).toContain(
      'participant_consent_item_responses_immutable',
    );
    expect(readmeSection).toContain('webhook_delivery_payload_immutable');
    expect(readmeSection).toContain('experiment_assignments_immutable');
    expect(readmeSection).toContain('experiment_assignments_variant_known');
    expect(readmeSection).toContain('experiments_variants_frozen');
    expect(readmeSection).toContain('experiments_start_final');
    expect(readmeSection).toContain('experiment_assignments_within_lifetime');
    expect(readmeSection).toContain('experiment_exposures_within_lifetime');
    expect(readmeSection).toContain('participants_study_managed');
    expect(readmeSection).toContain('studies_mode_switch_unpeopled');
    expect(readmeSection).toContain('experiment_exposures_immutable');
    expect(readmeSection).toContain('experiment_assignments_deletable');
    expect(readmeSection).toContain('experiment_exposures_deletable');
    expect(readmeSection).toContain('experiments_variants_well_formed');
    expect(readmeSection).toContain('asset_references_insert_frozen');
    expect(readmeSection).toContain(
      'webhook_deliveries_subscription_wants_event',
    );
    expect(readmeSection).toContain('participant_consents_session_own');
    expect(readmeSection).toContain('participant_consents_document_published');
    expect(readmeSection).toContain(
      'participant_consents_required_items_affirmed',
    );
    expect(readmeSection).toContain('participant_consents_delete_audited');
    expect(readmeSection).toContain(
      'participant_consent_item_responses_delete_audited',
    );
    expect(readmeSection).toContain('message_deliveries_template_applies');
    expect(readmeSection).toContain('study_schedules_time_zone_known');
    expect(readmeSection).toContain('schedule_occurrences_time_zone_known');
    expect(readmeSection).toContain('message_templates_publication_immutable');
    expect(readmeSection).toContain('message_delivery_payload_immutable');
    expect(readmeSection).toContain('message_delivery_events_immutable');
    expect(readmeSection).toContain('schedule_occurrences_identity_immutable');
    expect(readmeSection).toContain('message_delivery_events_provider_sent_it');
    expect(readmeSection).toContain('message_deliveries_deletable');
    expect(readmeSection).toContain('message_delivery_events_deletable');
    expect(readmeSection).toContain('edges_parent_writable_delete');
    expect(readmeSection).toContain('edges_parent_writable_insert');
    expect(readmeSection).toContain('edges_parent_writable_update');
    expect(readmeSection).toContain('edges_session_immutable');
    expect(readmeSection).toContain('nodes_parent_writable_delete');
    expect(readmeSection).toContain('nodes_parent_writable_insert');
    expect(readmeSection).toContain('nodes_parent_writable_update');
    expect(readmeSection).toContain('nodes_session_immutable');
    expect(readmeSection).toContain(
      'session_degree_hist_parent_writable_delete',
    );
    expect(readmeSection).toContain(
      'session_degree_hist_parent_writable_insert',
    );
    expect(readmeSection).toContain(
      'session_degree_hist_parent_writable_update',
    );
    expect(readmeSection).toContain('session_degree_hist_session_immutable');
    expect(readmeSection).toContain('session_snapshots_immutable');
    expect(readmeSection).toContain('session_snapshots_insert_frozen');
    expect(readmeSection).toContain('session_stats_parent_writable_delete');
    expect(readmeSection).toContain('session_stats_parent_writable_insert');
    expect(readmeSection).toContain('session_stats_parent_writable_update');
    expect(readmeSection).toContain('session_stats_session_immutable');
    expect(readmeSection).toContain('invitation_delivery_payload_immutable');
    expect(readmeSection).toContain('audit_events_immutable');
    expect(readmeSection).toContain('audit_team_isolation');
    expect(readmeSection).toContain(
      'Revokes UPDATE, DELETE, TRUNCATE from studio_app, studio_maintenance',
    );
    // The narrow re-admission after that table's revocation. Without the
    // matcher for it, the README would read stricter than the database is.
    expect(readmeSection).toContain(
      'Grants UPDATE (handle_consumed_at) to studio_app.',
    );
    expect(svg).toContain('RLS policy team_isolation');
    expect(svg).toContain('RLS policy audit_team_isolation');
    expect(svg).toContain('sidecar trigger sections_immutable');
    expect(svg).toContain('sidecar trigger assets_metadata_immutable');
    expect(svg).toContain(
      'sidecar trigger asset_references_published_immutable',
    );
    expect(svg).toContain('sidecar trigger template_versions_immutable');
    expect(svg).toContain(
      'sidecar trigger template_version_sections_immutable',
    );
    expect(svg).toContain(
      'sidecar trigger template_version_sections_insert_frozen',
    );
    expect(svg).toContain('sidecar trigger audit_export_request_immutable');
    expect(svg).toContain('sidecar trigger audit_export_handle_single_use');
    expect(svg).toContain('sidecar trigger audit_alert_link_immutable');
    expect(svg).toContain('sidecar trigger studies_closed_read_only');
    expect(svg).toContain('sidecar trigger studies_delete_purge_only');
    expect(svg).toContain('sidecar trigger study_waves_identity_immutable');
    expect(svg).toContain('sidecar trigger study_waves_parent_open');
    expect(svg).toContain('sidecar trigger participants_writable');
    expect(svg).toContain('sidecar trigger interview_sessions_writable');
    expect(svg).toContain('sidecar trigger interview_sessions_link_own');
    expect(svg).toContain('sidecar trigger studies_go_live_final');
    expect(svg).toContain('sidecar trigger studies_protocol_line_unpinned');
    expect(svg).toContain('sidecar trigger study_waves_version_own_line');
    expect(svg).toContain(
      'sidecar trigger interview_sessions_version_wave_pin',
    );
    expect(svg).toContain(
      'sidecar trigger interview_sessions_completion_snapshot',
    );
    expect(svg).toContain('sidecar trigger interview_links_writable');
    expect(svg).toContain('sidecar trigger api_token_authority_immutable');
    expect(svg).toContain(
      'sidecar trigger consent_documents_publication_immutable',
    );
    expect(svg).toContain(
      'sidecar trigger consent_documents_delete_purge_only',
    );
    expect(svg).toContain('sidecar trigger consent_items_frozen');
    expect(svg).toContain(
      'sidecar trigger participant_consent_grant_immutable',
    );
    expect(svg).toContain(
      'sidecar trigger participant_consent_item_responses_immutable',
    );
    expect(svg).toContain('sidecar trigger webhook_delivery_payload_immutable');
    expect(svg).toContain('sidecar trigger experiment_assignments_immutable');
    expect(svg).toContain(
      'sidecar trigger experiment_assignments_variant_known',
    );
    expect(svg).toContain('sidecar trigger experiments_variants_frozen');
    expect(svg).toContain('sidecar trigger experiments_start_final');
    expect(svg).toContain(
      'sidecar trigger experiment_assignments_within_lifetime',
    );
    expect(svg).toContain(
      'sidecar trigger experiment_exposures_within_lifetime',
    );
    expect(svg).toContain('sidecar trigger participants_study_managed');
    expect(svg).toContain('sidecar trigger studies_mode_switch_unpeopled');
    expect(svg).toContain('sidecar trigger experiment_exposures_immutable');
    expect(svg).toContain('sidecar trigger experiment_assignments_deletable');
    expect(svg).toContain('sidecar trigger experiment_exposures_deletable');
    expect(svg).toContain('sidecar trigger experiments_variants_well_formed');
    expect(svg).toContain('sidecar trigger asset_references_insert_frozen');
    expect(svg).toContain(
      'sidecar trigger webhook_deliveries_subscription_wants_event',
    );
    expect(svg).toContain('sidecar trigger participant_consents_session_own');
    expect(svg).toContain(
      'sidecar trigger participant_consents_document_published',
    );
    expect(svg).toContain(
      'sidecar trigger participant_consents_required_items_affirmed',
    );
    expect(svg).toContain(
      'sidecar trigger participant_consents_delete_audited',
    );
    expect(svg).toContain(
      'sidecar trigger participant_consent_item_responses_delete_audited',
    );
    expect(svg).toContain(
      'sidecar trigger message_deliveries_template_applies',
    );
    expect(svg).toContain('sidecar trigger study_schedules_time_zone_known');
    expect(svg).toContain(
      'sidecar trigger schedule_occurrences_time_zone_known',
    );
    expect(svg).toContain(
      'sidecar trigger message_templates_publication_immutable',
    );
    expect(svg).toContain('sidecar trigger message_delivery_payload_immutable');
    expect(svg).toContain('sidecar trigger message_delivery_events_immutable');
    expect(svg).toContain(
      'sidecar trigger schedule_occurrences_identity_immutable',
    );
    expect(svg).toContain(
      'sidecar trigger message_delivery_events_provider_sent_it',
    );
    expect(svg).toContain('sidecar trigger message_deliveries_deletable');
    expect(svg).toContain('sidecar trigger message_delivery_events_deletable');
    expect(svg).toContain('sidecar trigger edges_parent_writable_delete');
    expect(svg).toContain('sidecar trigger edges_parent_writable_insert');
    expect(svg).toContain('sidecar trigger edges_parent_writable_update');
    expect(svg).toContain('sidecar trigger edges_session_immutable');
    expect(svg).toContain('sidecar trigger nodes_parent_writable_delete');
    expect(svg).toContain('sidecar trigger nodes_parent_writable_insert');
    expect(svg).toContain('sidecar trigger nodes_parent_writable_update');
    expect(svg).toContain('sidecar trigger nodes_session_immutable');
    expect(svg).toContain(
      'sidecar trigger session_degree_hist_parent_writable_delete',
    );
    expect(svg).toContain(
      'sidecar trigger session_degree_hist_parent_writable_insert',
    );
    expect(svg).toContain(
      'sidecar trigger session_degree_hist_parent_writable_update',
    );
    expect(svg).toContain(
      'sidecar trigger session_degree_hist_session_immutable',
    );
    expect(svg).toContain('sidecar trigger session_snapshots_immutable');
    expect(svg).toContain('sidecar trigger session_snapshots_insert_frozen');
    expect(svg).toContain(
      'sidecar trigger session_stats_parent_writable_delete',
    );
    expect(svg).toContain(
      'sidecar trigger session_stats_parent_writable_insert',
    );
    expect(svg).toContain(
      'sidecar trigger session_stats_parent_writable_update',
    );
    expect(svg).toContain('sidecar trigger session_stats_session_immutable');
    expect(svg).toContain(
      'sidecar trigger invitation_delivery_payload_immutable',
    );
    expect(svg).toContain('sidecar trigger audit_events_immutable');
  });

  it('has a standalone regeneration command', () => {
    expect(readManifestScripts()).toHaveProperty('generate:erd');
  });

  it.each(['apply-schema', 'db:reset'])(
    'regenerates before %s touches the database',
    (script) => {
      expect(readManifestScripts()[script]).toMatch(
        /^pnpm run sync-fingerprint && /,
      );
    },
  );
});

async function withScratch<
  Scratch extends { pool: pg.Pool; dispose: () => Promise<void> },
>(
  make: (db: DbEnv) => Promise<Scratch>,
  // The scratch itself is the second argument rather than the first because
  // almost every case here needs only the owner pool; what wants the whole
  // thing is the case that connects as another role, which needs the scratch
  // database's own URL.
  run: (pool: pg.Pool, scratch: Scratch) => Promise<void>,
): Promise<void> {
  if (!db) throw new Error('unreachable: probe guaranteed db');
  const scratch = await make(db);
  try {
    await run(scratch.pool, scratch);
  } finally {
    await scratch.dispose();
  }
}

// Each case runs in its own Postgres schema, because half of them corrupt the
// fingerprint on purpose.
describe.skipIf(!db)('schema verification', () => {
  it('reads current on a provisioned schema carrying every table', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);

      expect(await checkSchema(pool)).toEqual({ kind: 'current' });

      const tables = await pool.query<{ table_name: string }>(
        `select table_name from information_schema.tables
         where table_schema = current_schema()`,
      );
      expect(tables.rows.map((r) => r.table_name).toSorted()).toEqual([
        'account',
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
        'installation',
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
        'protocol_drafts',
        'protocol_events',
        'protocol_versions',
        'protocol_write_receipts',
        'protocols',
        'rateLimit',
        'schedule_occurrences',
        'schemaFingerprint',
        'sections',
        'session',
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
        'team_invitations',
        'team_members',
        'teams',
        'template_version_sections',
        'template_versions',
        'templates',
        'user',
        'verification',
        'version_sections',
        'webhook_deliveries',
        'webhook_subscriptions',
      ]);
      expect([...SCHEMA_TABLES].toSorted()).toEqual(
        tables.rows
          .map((r) => r.table_name)
          .filter((name) => name !== 'schemaFingerprint')
          .toSorted(),
      );

      const recorded = await pool.query('select * from "schemaFingerprint"');
      expect(recorded.rowCount).toBe(1);
    });
  });

  it('leaves every revoked table privilege revoked once provisioned', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);

      // Table-level revocations only; a column-level GRANT that re-admits one
      // column after them does not make the table privilege held again.
      const revocations = [
        ...SIDECARS.join('\n').matchAll(
          /REVOKE\s+([A-Z][A-Z, ]*?)\s+ON\s+(\w+)\s+FROM\s+([^;]+);/g,
        ),
      ];
      expect(revocations.length).toBeGreaterThan(0);
      for (const [, privileges, table, roles] of revocations) {
        for (const privilege of privileges!.split(',').map((p) => p.trim())) {
          for (const role of roles!.split(',').map((r) => r.trim())) {
            const held = await pool.query<{ held: boolean }>(
              `select has_table_privilege($1, $2, $3) as held`,
              [role, table, privilege],
            );
            expect(
              held.rows[0]?.held,
              `${role} still holds ${privilege} on ${table}`,
            ).toBe(false);
          }
        }
      }
    });
  });

  it('reports a never-provisioned database as absent', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      expect(await checkSchema(pool)).toEqual({ kind: 'absent' });
    });
  });

  it('detects a database built from different SQL', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);
      await pool.query('update "schemaFingerprint" set "fingerprint" = $1', [
        'deadbeef'.repeat(8),
      ]);

      const state = await checkSchema(pool);
      expect(state.kind).toBe('stale');
      expect(state).toMatchObject({
        reason: 'mismatch',
        found: 'deadbeef'.repeat(8),
      });
    });
  });

  it('refuses a database carrying the tables with no fingerprint', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);
      await pool.query('drop table "schemaFingerprint"');

      expect(await checkSchema(pool)).toMatchObject({
        kind: 'stale',
        reason: 'unstamped',
        found: null,
      });
    });
  });

  it('treats an empty fingerprint table as unstamped', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);
      await pool.query('delete from "schemaFingerprint"');

      expect(await checkSchema(pool)).toMatchObject({
        kind: 'stale',
        reason: 'unstamped',
      });
    });
  });

  it('refuses an unstamped database that kept only some of the tables', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);
      await pool.query('drop table "schemaFingerprint"');
      // Leaves "verification" and "rateLimit" behind: a database no longer
      // recognisable by the "user" table alone, but still not ours to stamp.
      await pool.query('drop table "user" cascade');

      expect(await checkSchema(pool)).toMatchObject({
        kind: 'stale',
        reason: 'unstamped',
      });
    });
  });
});

// The per-user UI-language preference (2026-09-04 localization design §5.2):
// nullable — NULL means "no preference; negotiate from the browser" — with
// the house 2–35 character bound on non-null tags.
describe.skipIf(!db)('the user locale column', () => {
  it('accepts NULL and plausible tags, refusing out-of-range lengths', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);
      const insert = (id: string, locale: string | null) =>
        pool.query(
          `INSERT INTO "user" (id, name, email, "emailVerified", locale)
           VALUES ($1, $1, $1 || '@example.org', true, $2)`,
          [id, locale],
        );

      await insert('locale-null', null);
      await insert('locale-en', 'en');
      await insert('locale-en-gb', 'en-GB');
      // The widest tag the registry-shaped bound admits.
      await insert('locale-max', 'a'.repeat(35));
      await expect(insert('locale-short', 'e')).rejects.toMatchObject({
        constraint: 'user_locale_length_check',
      });
      await expect(insert('locale-long', 'a'.repeat(36))).rejects.toMatchObject(
        { constraint: 'user_locale_length_check' },
      );

      // The accepted values actually landed, distinguishably.
      const stored = await pool.query<{ id: string; locale: string | null }>(
        `select id, locale from "user"
         where id like 'locale-%' order by id`,
      );
      expect(stored.rows).toEqual([
        { id: 'locale-en', locale: 'en' },
        { id: 'locale-en-gb', locale: 'en-GB' },
        { id: 'locale-max', locale: 'a'.repeat(35) },
        { id: 'locale-null', locale: null },
      ]);
    });
  });
});

// drizzle-kit push introspects `public`, so these run in scratch databases.
describe.skipIf(!db)('schema application', () => {
  it('keys accounts on (issuer, accountId), both required', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ('u1', 'Researcher', 'researcher@example.org', true)`,
      );
      await pool.query(
        `INSERT INTO account (id, "accountId", "providerId", issuer, "userId", "updatedAt")
         VALUES ('google', 'sub-google', 'google', 'https://accounts.google.com', 'u1', now())`,
      );

      // better-auth 1.7 keys every account lookup on (issuer, accountId): an
      // account without an issuer is unmatchable, and two accounts under one
      // key would make the lookup ambiguous.
      await expect(
        pool.query(
          `INSERT INTO account (id, "accountId", "providerId", "userId", "updatedAt")
           VALUES ('no-issuer', 'sub-2', 'google', 'u1', now())`,
        ),
      ).rejects.toMatchObject({ column: 'issuer' });
      await expect(
        pool.query(
          `INSERT INTO account (id, "accountId", "providerId", issuer, "userId", "updatedAt")
           VALUES ('dup', 'sub-google', 'google', 'https://accounts.google.com', 'u1', now())`,
        ),
      ).rejects.toMatchObject({ constraint: 'account_issuer_accountId_idx' });
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
    });
  });

  it('provisions and stamps a fresh database', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      const outcome = await applySchema(pool);
      expect(outcome.statements.length).toBeGreaterThan(0);
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
    });
  });

  it('is a no-op on a current database', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      const again = await applySchema(pool);
      expect(again.statements).toEqual([]);
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
    });
  });

  it('reconciles a drifted database in place', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      await pool.query('alter table "protocols" drop column "name"');

      const outcome = await applySchema(pool);
      expect(outcome.statements.join('\n')).toContain('"name"');

      const columns = await pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'protocols'`,
      );
      expect(columns.rows.map((r) => r.column_name)).toContain('name');
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
    });
  });

  const jobQueueRows = (pool: pg.Pool) => installedQueueRows(pool, JOB_SCHEMA);

  it('installs pg-boss and every declared queue', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);

      const version = await pool.query<{ version: number }>(
        `select version from ${JOB_SCHEMA}.version`,
      );
      expect(version.rows).toEqual([{ version: JOB_SCHEMA_VERSION }]);
      expect(await jobQueueRows(pool)).toEqual(declaredQueueRows());
    });
  });

  it('brings a queue whose options drifted back to the declaration', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      // A queue's options are data in its row, so drift is what a hand-run
      // statement — or a declaration that changed between deployments — leaves
      // behind. Reapplying has to reconcile it the way a push reconciles a
      // column, which is the half of syncJobQueues that creation never reaches.
      await pool.query(
        `update ${JOB_SCHEMA}.queue
         set retry_limit = 99, expire_seconds = 123, notify = not notify
         where name = 'sign-in-email'`,
      );
      // The other half of "equal to the declaration": every option below is
      // one `protocol-store-gc` does not declare, so reconciliation has to
      // send pg-boss the default for it. An update carrying only the
      // declaration would leave all of these exactly as they are — a queue
      // still notifying, still dead-lettering and still retrying because some
      // earlier deployment said so.
      await pool.query(
        `update ${JOB_SCHEMA}.queue
         set retry_delay = 42, retry_backoff = true, retention_seconds = 60,
             deletion_seconds = 60, warning_queued = 5, heartbeat_seconds = 30,
             notify = true, dead_letter = 'invitation-delivery-dead-letter'
         where name = 'protocol-store-gc'`,
      );

      await applySchema(pool);

      expect(await jobQueueRows(pool)).toEqual(declaredQueueRows());
    });
  });

  it('keeps the defaults it reconciles against level with pg-boss', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      // pg-boss's own `create_queue`, given the options `createQueue(name, {})`
      // passes it: the manager defaults `policy` in JavaScript and leaves every
      // other option to the function, so this row is what a queue with nothing
      // declared about it looks like. Called directly rather than through a
      // PgBoss instance because a test constructing one of those is what
      // src/jobs/__tests__/source-policy.test.ts refuses.
      //
      // Reconciliation is only "equal to the declaration" if the values it
      // sends for the undeclared options are these, so an upgrade that moves a
      // default has to be noticed here rather than in a deployment.
      await pool.query(
        `select ${JOB_SCHEMA}.create_queue($1, '{"policy":"standard"}'::jsonb)`,
        ['pg-boss-defaults'],
      );

      expect(
        await installedQueueRows(pool, JOB_SCHEMA, ['pg-boss-defaults']),
      ).toEqual([queueRowFor('pg-boss-defaults')]);
    });
  });

  /**
   * What the application role has to be able to do after an apply: create a
   * job, through the same client the web process uses. It proves the grants
   * survived — or were re-applied after — whatever the apply did to the
   * schema, which the owner pool cannot answer for, being a superuser here.
   */
  async function enqueueAsApplication(scratchDb: DbEnv): Promise<void> {
    const jobs = createJobClient(scratchDb);
    const app = createPool(scratchDb);
    try {
      const connection = await app.connect();
      try {
        await connection.query('BEGIN');
        await jobs.enqueue(connection, 'protocol-store-gc', {});
        await connection.query('COMMIT');
      } finally {
        connection.release();
      }
    } finally {
      await jobs.stop();
      await app.end();
    }
  }

  it('replaces a pg-boss schema installed at another version', async () => {
    await withScratch(createScratchDatabase, async (pool, scratch) => {
      await applySchema(pool);
      const queued = await pool.query<{ id: string }>(
        `insert into ${JOB_SCHEMA}.job_common (name, data)
         values ('protocol-store-gc', '{}'::jsonb) returning id`,
      );
      // What an upgrade to a pg-boss whose schema moved looks like from here:
      // the tables are a version this build cannot use, so they are dropped
      // and rebuilt rather than migrated (the pre-release posture), and the
      // jobs go with them.
      await pool.query(
        `update ${JOB_SCHEMA}.version set version = version - 1`,
      );

      await applySchema(pool);

      const version = await pool.query<{ version: number }>(
        `select version from ${JOB_SCHEMA}.version`,
      );
      expect(version.rows).toEqual([{ version: JOB_SCHEMA_VERSION }]);
      expect(await jobQueueRows(pool)).toEqual(declaredQueueRows());
      const jobs = await pool.query(
        `select id from ${JOB_SCHEMA}.job_common where id = $1`,
        [queued.rows[0]!.id],
      );
      expect(jobs.rowCount).toBe(0);
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });

      // The drop took the grants with it, so the reinstall has to put them
      // back: a database the web process cannot enqueue into is one this
      // apply had no business stamping.
      await enqueueAsApplication(scratch.db);
      const requeued = await pool.query<{ name: string }>(
        `select name from ${JOB_SCHEMA}.job_common`,
      );
      expect(requeued.rows).toEqual([{ name: 'protocol-store-gc' }]);
    });
  });

  it('replaces a pg-boss schema that lost its version row', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      // A version table with nothing in it says nothing about what the tables
      // beside it are. Treating that as "not installed" would re-run the
      // construction plan over them, which fails on CREATE TYPE (42710) and
      // leaves the database unstampable.
      await pool.query(`delete from ${JOB_SCHEMA}.version`);

      await expect(applySchema(pool)).resolves.toBeDefined();

      const version = await pool.query<{ version: number }>(
        `select version from ${JOB_SCHEMA}.version`,
      );
      expect(version.rows).toEqual([{ version: JOB_SCHEMA_VERSION }]);
      expect(await jobQueueRows(pool)).toEqual(declaredQueueRows());
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
    });
  });

  it('lets the application enqueue and nothing else', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);

      const privileges = await pool.query<Record<string, boolean>>(
        `select
           has_schema_privilege('studio_app', '${JOB_SCHEMA}', 'USAGE') as app_schema,
           has_table_privilege('studio_app', '${JOB_SCHEMA}.job_common', 'INSERT') as app_insert,
           has_table_privilege('studio_app', '${JOB_SCHEMA}.queue', 'SELECT') as app_queue,
           has_column_privilege('studio_app', '${JOB_SCHEMA}.job_common', 'id', 'SELECT') as app_id,
           has_column_privilege('studio_app', '${JOB_SCHEMA}.job_common', 'start_after', 'SELECT') as app_start_after,
           has_column_privilege('studio_app', '${JOB_SCHEMA}.job_common', 'name', 'SELECT') as app_name,
           has_column_privilege('studio_app', '${JOB_SCHEMA}.job_common', 'data', 'SELECT') as app_data,
           has_table_privilege('studio_app', '${JOB_SCHEMA}.job_common', 'UPDATE') as app_update,
           has_table_privilege('studio_app', '${JOB_SCHEMA}.job_common', 'DELETE') as app_delete,
           has_table_privilege('studio_maintenance', '${JOB_SCHEMA}.job_common', 'UPDATE') as maintenance_update,
           has_table_privilege('studio_maintenance', '${JOB_SCHEMA}.schedule', 'INSERT') as maintenance_schedule`,
      );
      expect(privileges.rows[0]).toEqual({
        app_schema: true,
        app_insert: true,
        app_queue: true,
        // The two columns the insert reads back, and nothing else: the job's
        // queue name says which team's work is waiting, so the role that
        // serves requests is not given it either.
        app_id: true,
        app_start_after: true,
        app_name: false,
        app_data: false,
        app_update: false,
        app_delete: false,
        maintenance_update: true,
        maintenance_schedule: true,
      });
    });
  });

  it('leaves an installed pg-boss schema and its queues alone', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      const queued = await pool.query<{ id: string }>(
        `insert into ${JOB_SCHEMA}.job_common (name, data)
         values ('protocol-store-gc', '{}'::jsonb) returning id`,
      );
      const created = await pool.query<{ name: string; created_on: Date }>(
        `select name, created_on from ${JOB_SCHEMA}.queue order by name`,
      );

      const again = await applySchema(pool);
      expect(again.statements).toEqual([]);
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
      // A reinstall would have dropped the schema, taking the queued job and
      // the queues' creation times with it.
      expect(
        (
          await pool.query(
            `select id from ${JOB_SCHEMA}.job_common where id = $1`,
            [queued.rows[0]!.id],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await pool.query<{ name: string; created_on: Date }>(
            `select name, created_on from ${JOB_SCHEMA}.queue order by name`,
          )
        ).rows,
      ).toEqual(created.rows);
      expect(await jobQueueRows(pool)).toEqual(declaredQueueRows());
    });
  });

  it('serialises concurrent application', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await Promise.all([applySchema(pool), applySchema(pool)]);

      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
      const recorded = await pool.query('select * from "schemaFingerprint"');
      expect(recorded.rowCount).toBe(1);
    });
  });
});

describe('schema problem message', () => {
  const stale: StaleSchema = {
    kind: 'stale',
    reason: 'mismatch',
    found: 'a'.repeat(64),
    appliedAt: new Date('2026-08-13T00:00:00.000Z'),
  };

  it('names scripts package.json declares', () => {
    const message = schemaProblemMessage(stale);
    expect(message).toContain('pnpm --filter @codaco/studio-server db:reset');
    expect(message).toContain(
      'pnpm --filter @codaco/studio-server apply-schema',
    );

    const scripts = readManifestScripts();
    expect(scripts).toHaveProperty('db:reset');
    expect(scripts).toHaveProperty('apply-schema');
  });

  it('explains an unstamped database differently', () => {
    expect(schemaProblemMessage({ ...stale, reason: 'unstamped' })).toContain(
      'no fingerprint',
    );
  });

  it('explains an absent schema with both remedies', () => {
    const message = schemaProblemMessage({ kind: 'absent' });
    expect(message).toContain('pnpm --filter @codaco/studio-server db:reset');
    expect(message).toContain(
      'pnpm --filter @codaco/studio-server apply-schema',
    );
  });
});
