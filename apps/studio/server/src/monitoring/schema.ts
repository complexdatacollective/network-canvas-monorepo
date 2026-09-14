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

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';

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
          AND ${table.deliveryFailedCount} >= 0`,
    ),
    teamIsolationPolicy(),
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
          AND char_length(${table.stageId}) BETWEEN 1 AND 128`,
    ),
    teamIsolationPolicy(),
  ],
);

export const MONITORING_TABLES = { studyWaveRollups, studyStageRollups };

// Hashed into the schema fingerprint — whitespace counts. No triggers: every
// row here is derived, so there is no history to protect.
export const MONITORING_SIDECAR_SQL = `
${tenantTablesSql(['study_wave_rollups', 'study_stage_rollups'])}
`;
