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
    // The identity an exposure proves its assignment through, experiment and
    // variant included, so an exposure can never be counted under another
    // experiment or arm than the one its subject was assigned.
    unique().on(table.id, table.experimentId, table.variantKey, table.teamId),
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
    // Copied from the assignment so an exposure query is a single-table scan,
    // and proven equal to it by the composite key below, so the copy cannot
    // drift: an analysis indexed by experiment and arm reads these two columns
    // and nothing else.
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
      columns: [
        table.assignmentId,
        table.experimentId,
        table.variantKey,
        table.teamId,
      ],
      foreignColumns: [
        experimentAssignments.id,
        experimentAssignments.experimentId,
        experimentAssignments.variantKey,
        experimentAssignments.teamId,
      ],
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

-- An assignment's arm must be one the experiment defines: the variants array
-- is shape-checked, and nothing else would tie \`variant_key\` to it. AFTER
-- the row, so the key's own shape check and the experiment key report first
-- and this speaks only to a well-formed row of a real experiment.
CREATE OR REPLACE FUNCTION experiment_assignments_variant_is_known() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM experiments e
    CROSS JOIN LATERAL jsonb_array_elements(e.variants) AS variant
    WHERE e.id = NEW.experiment_id AND e.team_id = NEW.team_id
      AND variant->>'key' = NEW.variant_key
  ) THEN
    RAISE EXCEPTION 'variant % is not one of the experiment''s variants', NEW.variant_key;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_assignments_variant_known
  AFTER INSERT ON experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION experiment_assignments_variant_is_known();

-- ...and the definition holds still once subjects are being assigned against
-- it: an arm renamed or removed under a running experiment would orphan the
-- assignments the check above admitted.
CREATE OR REPLACE FUNCTION experiment_variants_are_frozen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'the variants of an experiment that has started are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiments_variants_frozen
  BEFORE UPDATE ON experiments
  FOR EACH ROW
  WHEN (OLD.state <> 'draft' AND NEW.variants IS DISTINCT FROM OLD.variants)
  EXECUTE FUNCTION experiment_variants_are_frozen();

${tenantTablesSql(['experiments', 'experiment_assignments', 'experiment_exposures'])}
`;
