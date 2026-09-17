import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Effect, Layer } from 'effect';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

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
import { MaintenanceDatabase, OwnerDatabase } from '../db/client.ts';
import { SCHEMA_FINGERPRINT } from '../db/fingerprint.generated.ts';
import {
  checkSchema,
  SIDECARS,
  SCHEMA_TABLES,
  type StaleSchema,
  schemaProblemMessage,
  staleDatabaseMessage,
} from '../db/schema.ts';
import { MaintenanceScope } from '../db/tenant.ts';
import type { DbEnv } from '../env.ts';
import { installJobSchemaEffect } from '../jobs/install.ts';
import { JOB_SCHEMA } from '../jobs/queues.ts';
import { jobSchemaGrantsSql, jobSchemaSql } from '../jobs/schema.ts';
import {
  createScratchDatabase,
  createScratchSchema,
  enqueueAsApplication,
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

  // The fingerprint is the only thing that would notice a column added to the
  // queue's tables or a widened grant, and the boot check is what keeps a
  // worker off a database whose queue is not the shape this build claims.
  it('covers the job schema and its grants', async () => {
    const jobStatements = renderJobStatements();
    expect(jobStatements).toContain(jobSchemaSql(JOB_SCHEMA));
    expect(jobStatements).toContain(jobSchemaGrantsSql(JOB_SCHEMA));

    // And they are inside the hash rather than merely rendered beside it: the
    // same fingerprint computed over the public statements alone differs.
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
    expect(readmeSection).toContain('sections_hold_no_asset_keys');
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
    expect(svg).toContain('sidecar trigger sections_hold_no_asset_keys');
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

/**
 * Everything one schema holds, by kind and name: tables and indexes, the
 * functions, and the triggers that are not a constraint's own. Enough to tell
 * two installations of the same DDL apart, and named rather than counted so a
 * difference reads as which object is missing.
 */
async function nativeSchemaCatalogue(
  pool: pg.Pool,
  schema: string,
): Promise<{ kind: string; name: string }[]> {
  const rows = await pool.query<{ kind: string; name: string }>(
    `select 'relation' as kind, c.relname as name
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind in ('r', 'i')
     union all
     select 'function', p.proname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = $1
     union all
     select 'trigger', t.tgname
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and not t.tgisinternal
      order by 1, 2`,
    [schema],
  );
  return rows.rows;
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
        'deployment_state',
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
        'protocol_asset_keys',
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

  // A scratch schema is what forty or so suites take for a deployed database,
  // so everything a schema application installs outside `public` has to be
  // there too — the queue's schema above all. Read through `jobSchema`
  // rather than by rebuilding the name here, because that field is what a
  // suite builds a client against.
  it('provisions the job schema beside the scratch schema', async () => {
    await withScratch(createScratchSchema, async (pool, scratch) => {
      await provisionScratchSchema(pool);

      const tables = await pool.query<{ table_name: string }>(
        `select table_name from information_schema.tables
          where table_schema = $1 order by 1`,
        [scratch.jobSchema],
      );
      const names = tables.rows.map((row) => row.table_name);
      expect(names).toContain('jobs');
      expect(names).toContain('job_schedules');
    });
  });

  // Two drivers install that schema — node-postgres for the two callers that
  // apply a schema, `@effect/sql-pg` for a caller that already owns a
  // client — and the only thing keeping them the same schema is that they
  // send the same split statements. Proved by installing through the Effect path into a sibling
  // and comparing the catalogue, because a difference here would not surface
  // until a worker claimed a job against a table it had created itself.
  it('installs the same schema through the Effect path', async () => {
    await withScratch(createScratchSchema, async (pool, scratch) => {
      await provisionScratchSchema(pool);
      const throughNodePostgres = await nativeSchemaCatalogue(
        pool,
        scratch.jobSchema,
      );
      // Not merely equal: both non-empty, so a catalogue query that returned
      // nothing would not read as agreement.
      expect(throughNodePostgres.length).toBeGreaterThan(0);

      const sibling = `${scratch.jobSchema}_effect`;
      try {
        await Effect.runPromise(
          MaintenanceScope.open(installJobSchemaEffect(sibling)).pipe(
            // The install needs the connecting login, and the scope reads the
            // maintenance tag: the owner client goes in under it, the way the
            // job suites' `asOwner` does (src/jobs/__tests__/support.ts).
            Effect.provide(
              Layer.effect(MaintenanceDatabase, OwnerDatabase).pipe(
                Layer.provide(
                  OwnerDatabase.layer({ url: db!.url, maxConnections: 2 }),
                ),
              ),
            ),
            Effect.orDie,
          ),
        );
        expect(await nativeSchemaCatalogue(pool, sibling)).toEqual(
          throughNodePostgres,
        );
      } finally {
        await pool.query(`drop schema if exists "${sibling}" cascade`);
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
  it('keys accounts on (providerId, accountId), uniquely', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ('u1', 'Researcher', 'researcher@example.org', true)`,
      );
      await pool.query(
        `INSERT INTO account (id, "accountId", "providerId", "userId", "updatedAt")
         VALUES ('google', 'sub-google', 'google', 'u1', now())`,
      );

      // The same subject under a different provider is a different account.
      await pool.query(
        `INSERT INTO account (id, "accountId", "providerId", "userId", "updatedAt")
         VALUES ('microsoft', 'sub-google', 'microsoft', 'u1', now())`,
      );

      // Two rows under one key would make every better-auth account lookup
      // ambiguous — it throws rather than picking one.
      await expect(
        pool.query(
          `INSERT INTO account (id, "accountId", "providerId", "userId", "updatedAt")
           VALUES ('dup', 'sub-google', 'google', 'u1', now())`,
        ),
      ).rejects.toMatchObject({
        constraint: 'account_providerId_accountId_idx',
      });
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

  /**
   * What the application role has to be able to do after an apply: create a
   * job, through the same client the web process uses. It proves the grants
   * survived — or were re-applied after — whatever the apply did to the
   * schema, which the owner pool cannot answer for, being a superuser here.
   */
  const enqueueSweepAsApplication = (scratchDb: DbEnv): Promise<string> =>
    enqueueAsApplication(scratchDb, 'protocol-store-gc', {});

  it('installs the job schema with its grants', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);

      const tables = await pool.query<{ table_name: string }>(
        `select table_name from information_schema.tables
          where table_schema = $1 order by 1`,
        [JOB_SCHEMA],
      );
      const names = tables.rows.map((row) => row.table_name);
      expect(names).toContain('jobs');
      expect(names).toContain('job_schedules');

      // The division of labour the queue is built on: the application may
      // create a job and read back the id its insert returns, and nothing else
      // — not a payload, not a queue name, and nothing that would let it
      // claim, retry or delete one.
      const privileges = await pool.query<Record<string, boolean>>(
        `select
           has_schema_privilege('studio_app', $1, 'USAGE') as app_schema,
           has_table_privilege('studio_app', $1 || '.jobs', 'INSERT') as app_insert,
           has_column_privilege('studio_app', $1 || '.jobs', 'id', 'SELECT') as app_id,
           has_column_privilege('studio_app', $1 || '.jobs', 'payload', 'SELECT') as app_payload,
           has_column_privilege('studio_app', $1 || '.jobs', 'queue', 'SELECT') as app_queue,
           has_table_privilege('studio_app', $1 || '.jobs', 'UPDATE') as app_update,
           has_table_privilege('studio_app', $1 || '.jobs', 'DELETE') as app_delete,
           has_table_privilege('studio_app', $1 || '.job_schedules', 'SELECT') as app_schedules,
           has_table_privilege('studio_maintenance', $1 || '.jobs', 'SELECT') as maintenance_select,
           has_table_privilege('studio_maintenance', $1 || '.jobs', 'UPDATE') as maintenance_update,
           has_table_privilege('studio_maintenance', $1 || '.jobs', 'DELETE') as maintenance_delete,
           has_table_privilege('studio_maintenance', $1 || '.job_schedules', 'INSERT') as maintenance_schedules`,
        [JOB_SCHEMA],
      );
      expect(privileges.rows[0]).toEqual({
        app_schema: true,
        app_insert: true,
        app_id: true,
        app_payload: false,
        app_queue: false,
        app_update: false,
        app_delete: false,
        app_schedules: false,
        maintenance_select: true,
        maintenance_update: true,
        maintenance_delete: true,
        maintenance_schedules: true,
      });
    });
  });

  it('leaves an installed job schema and the jobs in it alone', async () => {
    await withScratch(createScratchDatabase, async (pool, scratch) => {
      await applySchema(pool);
      // Enqueued as the application role, which is the half the owner pool
      // cannot answer for: a reapply that dropped and rebuilt the schema would
      // take the grants with it, and this row with them.
      const queued = await enqueueSweepAsApplication(scratch.db);

      const again = await applySchema(pool);
      expect(again.statements).toEqual([]);
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });

      // The DDL is idempotent, so a second apply reapplies it over the live
      // tables rather than replacing them — and the queued job is still there.
      const jobs = await pool.query<{ id: string; queue: string }>(
        `select id, queue from ${JOB_SCHEMA}.jobs`,
      );
      expect(jobs.rows).toEqual([{ id: queued, queue: 'protocol-store-gc' }]);

      // And the schema still enqueues afterwards: the grants survived too.
      await enqueueSweepAsApplication(scratch.db);
      const after = await pool.query<{ count: string }>(
        `select count(*)::text from ${JOB_SCHEMA}.jobs`,
      );
      expect(after.rows[0]?.count).toBe('2');
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

  // A message is only as useful as its next step, and the two readers have
  // different ones. A checkout has the pnpm scripts and drizzle-kit; a
  // deployment has neither — it has the image and the `migrate` command in it
  // (#1909). Each lane is therefore checked for the remedies it can run AND
  // against the ones it cannot, because a message naming a command that is not
  // installed is worse than a short one.
  const PNPM_REMEDIES = [
    'pnpm --filter @codaco/studio-server db:reset',
    'pnpm --filter @codaco/studio-server apply-schema',
  ];

  it('names scripts package.json declares, in a checkout', () => {
    const message = schemaProblemMessage(stale, 'development');
    for (const remedy of PNPM_REMEDIES) expect(message).toContain(remedy);

    const scripts = readManifestScripts();
    expect(scripts).toHaveProperty('db:reset');
    expect(scripts).toHaveProperty('apply-schema');
  });

  it('names the image commands, in a deployment', () => {
    // Where this is read — a container log — none of the above exists.
    const message = schemaProblemMessage({ kind: 'absent' }, 'deployed');
    expect(message).toContain('studio-api migrate');
    expect(message).toContain('docker compose run --rm migrate');
    for (const remedy of PNPM_REMEDIES) expect(message).not.toContain(remedy);
  });

  it('refuses a stale database in a deployment with what migrate says', () => {
    // One verdict, one wording: `studio-api migrate` throws this exact text
    // (src/db/migrate.ts), so an operator who reads the boot refusal and then
    // runs migrate is not left working out whether they mean the same thing.
    expect(schemaProblemMessage(stale, 'deployed')).toBe(
      staleDatabaseMessage(stale),
    );
    expect(schemaProblemMessage(stale, 'deployed')).toContain('#1901');
    for (const remedy of PNPM_REMEDIES) {
      expect(schemaProblemMessage(stale, 'deployed')).not.toContain(remedy);
    }
  });

  it('explains an unstamped database differently', () => {
    for (const lane of ['development', 'deployed'] as const) {
      expect(
        schemaProblemMessage({ ...stale, reason: 'unstamped' }, lane),
      ).toContain('no fingerprint');
    }
  });

  it('explains an absent schema with both remedies of its lane', () => {
    const message = schemaProblemMessage({ kind: 'absent' }, 'development');
    for (const remedy of PNPM_REMEDIES) expect(message).toContain(remedy);
  });
});
