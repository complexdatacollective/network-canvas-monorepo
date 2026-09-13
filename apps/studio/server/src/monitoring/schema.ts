// Monitoring aggregates (#1268, #1270). Two tables, both derived and
// recomputable. Nothing here is a source of truth; every row can be rebuilt
// from sessions, participants and deliveries. This matters because #1270
// requires aggregates to recompute after erasure.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  teamIsolationPolicies,
  tenantTablesSql,
} from '@codaco/studio-sync/rls';

import { STUDY_TABLES } from '../study/schema.ts';

const { studyWaves } = STUDY_TABLES;

// The per-wave funnel: invited → onboarding started → consented → interview
// started → completed, plus the abandonment and delivery-failure counts the
// wave dashboard reads.
const studyWaveRollups = pgTable(
  'study_wave_rollups',
  {
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    waveId: uuid('wave_id').notNull(),
    invitedCount: integer('invited_count').notNull().default(0),
    onboardingStartedCount: integer('onboarding_started_count')
      .notNull()
      .default(0),
    consentedCount: integer('consented_count').notNull().default(0),
    sessionStartedCount: integer('session_started_count').notNull().default(0),
    sessionCompletedCount: integer('session_completed_count')
      .notNull()
      .default(0),
    sessionAbandonedCount: integer('session_abandoned_count')
      .notNull()
      .default(0),
    deliveryFailedCount: integer('delivery_failed_count').notNull().default(0),
    // Set by participant erasure and by any operation this rollup cannot be
    // incrementally corrected for; cleared by the recompute job.
    staleAt: timestamp('stale_at', { withTimezone: true }),
    // Source writers advance this while holding the row lock. A worker may
    // clear freshness only for the exact generation it claimed.
    dirtyGeneration: bigint('dirty_generation', { mode: 'bigint' })
      .notNull()
      .default(0n),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    lastError: text('last_error'),
    recomputedAt: timestamp('recomputed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.waveId] }),
    foreignKey({
      name: 'study_wave_rollups_wave_fk',
      columns: [table.waveId, table.studyId, table.teamId],
      foreignColumns: [studyWaves.id, studyWaves.studyId, studyWaves.teamId],
    }),
    // The recompute worklist: the one cross-team scan this module needs.
    index('study_wave_rollups_stale_at_idx')
      .on(table.staleAt)
      .where(sql`stale_at is not null`),
    check(
      'study_wave_rollups_counts_check',
      sql`${table.invitedCount} >= 0 AND ${table.onboardingStartedCount} >= 0
          AND ${table.consentedCount} >= 0 AND ${table.sessionStartedCount} >= 0
          AND ${table.sessionCompletedCount} >= 0 AND ${table.sessionAbandonedCount} >= 0
          AND ${table.deliveryFailedCount} >= 0 AND ${table.attemptCount} >= 0
          AND ${table.dirtyGeneration} >= 0`,
    ),
    ...teamIsolationPolicies(),
  ],
);

// Per-stage duration and drop-off (#1268), one row per (wave, stage).
const studyStageRollups = pgTable(
  'study_stage_rollups',
  {
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    waveId: uuid('wave_id').notNull(),
    stageId: text('stage_id').notNull(),
    enteredCount: integer('entered_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    abandonedCount: integer('abandoned_count').notNull().default(0),
    // Sum and count, not a mean: means compose under incremental
    // maintenance and a stored mean does not. Medians are computed live.
    durationMsSum: bigint('duration_ms_sum', { mode: 'bigint' })
      .notNull()
      .default(0n),
    durationMsCount: integer('duration_ms_count').notNull().default(0),
    missingItemCount: integer('missing_item_count').notNull().default(0),
    staleAt: timestamp('stale_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    lastError: text('last_error'),
    recomputedAt: timestamp('recomputed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.waveId, table.stageId] }),
    foreignKey({
      name: 'study_stage_rollups_wave_fk',
      columns: [table.waveId, table.studyId, table.teamId],
      foreignColumns: [studyWaves.id, studyWaves.studyId, studyWaves.teamId],
    }),
    index('study_stage_rollups_stale_at_idx')
      .on(table.staleAt)
      .where(sql`stale_at is not null`),
    check(
      'study_stage_rollups_counts_check',
      sql`${table.enteredCount} >= 0 AND ${table.completedCount} >= 0
          AND ${table.abandonedCount} >= 0 AND ${table.durationMsSum} >= 0
          AND ${table.durationMsCount} >= 0 AND ${table.missingItemCount} >= 0
          AND ${table.attemptCount} >= 0
          AND char_length(${table.stageId}) BETWEEN 1 AND 128`,
    ),
    ...teamIsolationPolicies(),
  ],
);

const monitoringRollupInvalidations = pgTable(
  'monitoring_rollup_invalidations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: text('team_id').notNull(),
    studyId: uuid('study_id').notNull(),
    waveId: uuid('wave_id').notNull(),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'monitoring_rollup_invalidations_wave_fk',
      columns: [table.waveId, table.studyId, table.teamId],
      foreignColumns: [studyWaves.id, studyWaves.studyId, studyWaves.teamId],
    }).onDelete('cascade'),
    index('monitoring_rollup_invalidations_created_at_idx').on(table.createdAt),
    check(
      'monitoring_rollup_invalidations_source_check',
      sql`char_length(${table.source}) between 1 and 64`,
    ),
    ...teamIsolationPolicies(),
  ],
);

export const MONITORING_TABLES = {
  studyWaveRollups,
  studyStageRollups,
  monitoringRollupInvalidations,
};

// Hashed into the schema fingerprint — whitespace counts. Source-table
// triggers append cheap invalidation events; the worker coalesces them into
// the derived rollup worklist outside participant and operator transactions.
export const MONITORING_SIDECAR_SQL = `
${tenantTablesSql([
  'study_wave_rollups',
  'study_stage_rollups',
  'monitoring_rollup_invalidations',
])}

REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON monitoring_rollup_invalidations FROM studio_app;
REVOKE UPDATE, TRUNCATE ON monitoring_rollup_invalidations FROM studio_maintenance;

CREATE OR REPLACE FUNCTION enqueue_session_rollup_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
    VALUES (OLD.team_id, OLD.study_id, OLD.wave_id, TG_TABLE_NAME);
    RETURN OLD;
  END IF;
  INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
  VALUES (NEW.team_id, NEW.study_id, NEW.wave_id, TG_TABLE_NAME);
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER interview_links_rollup_invalidation_delete
BEFORE DELETE ON interview_links
FOR EACH ROW EXECUTE FUNCTION enqueue_session_rollup_invalidation();

CREATE OR REPLACE TRIGGER interview_links_rollup_invalidation_insert
AFTER INSERT ON interview_links
FOR EACH ROW EXECUTE FUNCTION enqueue_session_rollup_invalidation();

CREATE OR REPLACE TRIGGER interview_sessions_rollup_invalidation_delete
BEFORE DELETE ON interview_sessions
FOR EACH ROW EXECUTE FUNCTION enqueue_session_rollup_invalidation();

CREATE OR REPLACE TRIGGER interview_sessions_rollup_invalidation_mutation
AFTER INSERT OR UPDATE OF participant_id, status, current_stage_id, stage_timing ON interview_sessions
FOR EACH ROW EXECUTE FUNCTION enqueue_session_rollup_invalidation();

CREATE OR REPLACE FUNCTION enqueue_node_rollup_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
    SELECT OLD.team_id, s.study_id, s.wave_id, TG_TABLE_NAME
    FROM interview_sessions s
    WHERE s.id = OLD.session_id AND s.team_id = OLD.team_id;
    RETURN OLD;
  END IF;
  INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
  SELECT NEW.team_id, s.study_id, s.wave_id, TG_TABLE_NAME
  FROM interview_sessions s
  WHERE s.id = NEW.session_id AND s.team_id = NEW.team_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER nodes_rollup_invalidation_delete
BEFORE DELETE ON nodes
FOR EACH ROW EXECUTE FUNCTION enqueue_node_rollup_invalidation();

CREATE OR REPLACE TRIGGER nodes_rollup_invalidation_mutation
AFTER INSERT OR UPDATE OF stage_id ON nodes
FOR EACH ROW EXECUTE FUNCTION enqueue_node_rollup_invalidation();

CREATE OR REPLACE FUNCTION enqueue_consent_rollup_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
    SELECT DISTINCT OLD.team_id, s.study_id, s.wave_id, TG_TABLE_NAME
    FROM interview_sessions s
    WHERE s.participant_id = OLD.participant_id AND s.team_id = OLD.team_id;
    RETURN OLD;
  END IF;
  INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
  SELECT DISTINCT NEW.team_id, s.study_id, s.wave_id, TG_TABLE_NAME
  FROM interview_sessions s
  WHERE s.participant_id = NEW.participant_id AND s.team_id = NEW.team_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER participant_consents_rollup_invalidation
AFTER INSERT OR DELETE OR UPDATE OF withdrawn_at ON participant_consents
FOR EACH ROW EXECUTE FUNCTION enqueue_consent_rollup_invalidation();

CREATE OR REPLACE FUNCTION enqueue_delivery_rollup_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.failed_at IS NOT NULL THEN
      INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
      SELECT OLD.team_id, sc.study_id, sc.wave_id, TG_TABLE_NAME
      FROM schedule_occurrences o
      JOIN study_schedules sc ON sc.id = o.schedule_id AND sc.team_id = o.team_id
      WHERE o.id = OLD.occurrence_id AND o.team_id = OLD.team_id
        AND sc.wave_id IS NOT NULL;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.failed_at IS NOT NULL OR
     (TG_OP = 'UPDATE' AND OLD.failed_at IS NOT NULL) THEN
    INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
    SELECT NEW.team_id, sc.study_id, sc.wave_id, TG_TABLE_NAME
    FROM schedule_occurrences o
    JOIN study_schedules sc ON sc.id = o.schedule_id AND sc.team_id = o.team_id
    WHERE o.id = NEW.occurrence_id AND o.team_id = NEW.team_id
      AND sc.wave_id IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER message_deliveries_rollup_invalidation_delete
BEFORE DELETE ON message_deliveries
FOR EACH ROW EXECUTE FUNCTION enqueue_delivery_rollup_invalidation();

CREATE OR REPLACE TRIGGER message_deliveries_rollup_invalidation_mutation
AFTER INSERT OR UPDATE OF failed_at ON message_deliveries
FOR EACH ROW EXECUTE FUNCTION enqueue_delivery_rollup_invalidation();

CREATE OR REPLACE FUNCTION enqueue_schedule_rollup_invalidation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path FROM CURRENT AS $$
BEGIN
  IF OLD.wave_id IS NOT NULL THEN
    INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
    VALUES (OLD.team_id, OLD.study_id, OLD.wave_id, TG_TABLE_NAME);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.wave_id IS NOT NULL AND NEW.wave_id IS DISTINCT FROM OLD.wave_id THEN
    INSERT INTO monitoring_rollup_invalidations (team_id, study_id, wave_id, source)
    VALUES (NEW.team_id, NEW.study_id, NEW.wave_id, TG_TABLE_NAME);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER study_schedules_rollup_invalidation_delete
BEFORE DELETE ON study_schedules
FOR EACH ROW EXECUTE FUNCTION enqueue_schedule_rollup_invalidation();

CREATE OR REPLACE TRIGGER study_schedules_rollup_invalidation_wave
AFTER UPDATE OF wave_id ON study_schedules
FOR EACH ROW EXECUTE FUNCTION enqueue_schedule_rollup_invalidation();
`;
