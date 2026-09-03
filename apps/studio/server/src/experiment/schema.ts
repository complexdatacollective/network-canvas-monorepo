import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';

// The minimum that makes the grant's usability experiments analysable,
// explicitly scoped to the team's own evaluation activities rather than a
// general experimentation product.
const experiments = pgTable(
  'experiments',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    surface: text('surface').notNull(),
    state: text('state').notNull().default('draft'),
    // [{ key, weight }], weights positive integers summing to anything.
    variants: jsonb('variants').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    unique().on(table.teamId, table.key),
    check(
      'experiments_surface_check',
      sql`${table.surface} IN ('researcher', 'participant')`,
    ),
    check(
      'experiments_state_check',
      sql`${table.state} IN ('draft', 'running', 'stopped')
          AND (${table.state} = 'draft') = (${table.startedAt} IS NULL)
          AND (${table.state} = 'stopped') = (${table.stoppedAt} IS NOT NULL)`,
    ),
    check(
      'experiments_variants_check',
      sql`jsonb_typeof(${table.variants}) = 'array'
          AND jsonb_array_length(${table.variants}) BETWEEN 2 AND 10`,
    ),
    check(
      'experiments_key_check',
      sql`${table.key} ~ '^[a-z][a-z0-9_.-]{1,63}$'
          AND char_length(${table.name}) BETWEEN 1 AND 200`,
    ),
    teamIsolationPolicy(),
  ],
);

const experimentAssignments = pgTable(
  'experiment_assignments',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    experimentId: uuid('experiment_id').notNull(),
    subjectKind: text('subject_kind').notNull(),
    subjectId: text('subject_id').notNull(),
    variantKey: text('variant_key').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    // Assignment is sticky: one subject, one variant, forever.
    unique().on(table.experimentId, table.subjectKind, table.subjectId),
    foreignKey({
      name: 'experiment_assignments_experiment_fk',
      columns: [table.experimentId, table.teamId],
      foreignColumns: [experiments.id, experiments.teamId],
    }),
    check(
      'experiment_assignments_subject_kind_check',
      sql`${table.subjectKind} IN ('user', 'participant', 'session')`,
    ),
    check(
      'experiment_assignments_lengths_check',
      sql`char_length(${table.subjectId}) BETWEEN 1 AND 255
          AND ${table.variantKey} ~ '^[a-z][a-z0-9_.-]{0,63}$'`,
    ),
    teamIsolationPolicy(),
  ],
);

// The highest-churn table in this design, and deliberately not range
// partitioned: partitioning on speculation costs more than it buys until the
// exposure volume is measured.
const experimentExposures = pgTable(
  'experiment_exposures',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    experimentId: uuid('experiment_id').notNull(),
    assignmentId: uuid('assignment_id').notNull(),
    // Denormalized: makes an exposure query a single-table scan and keeps the
    // row meaningful if the assignment is erased.
    variantKey: text('variant_key').notNull(),
    surfaceKey: text('surface_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    details: jsonb('details')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    foreignKey({
      name: 'experiment_exposures_assignment_fk',
      columns: [table.assignmentId, table.teamId],
      foreignColumns: [experimentAssignments.id, experimentAssignments.teamId],
    }),
    index('experiment_exposures_team_id_experiment_id_occurred_at_idx').on(
      table.teamId,
      table.experimentId,
      table.occurredAt.desc(),
    ),
    check(
      'experiment_exposures_details_check',
      sql`jsonb_typeof(${table.details}) = 'object'
          AND pg_column_size(${table.details}) <= 2048`,
    ),
    check(
      'experiment_exposures_lengths_check',
      sql`char_length(${table.surfaceKey}) BETWEEN 1 AND 128
          AND ${table.variantKey} ~ '^[a-z][a-z0-9_.-]{0,63}$'`,
    ),
    teamIsolationPolicy(),
  ],
);

export const EXPERIMENT_TABLES = {
  experiments,
  experimentAssignments,
  experimentExposures,
};

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
export const EXPERIMENT_SIDECAR_SQL = `
-- An assignment is the basis of every analysis that cites it. Re-rolling a
-- subject's variant mid-experiment invalidates the result silently.
CREATE OR REPLACE FUNCTION experiment_assignments_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'experiment assignments are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_assignments_immutable
  BEFORE UPDATE ON experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION experiment_assignments_are_immutable();

CREATE OR REPLACE TRIGGER experiment_exposures_immutable
  BEFORE UPDATE ON experiment_exposures
  FOR EACH ROW EXECUTE FUNCTION experiment_assignments_are_immutable();

${tenantTablesSql(['experiments', 'experiment_assignments', 'experiment_exposures'])}
`;
