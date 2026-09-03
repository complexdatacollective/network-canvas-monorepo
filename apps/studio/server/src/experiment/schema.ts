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

import {
  teamIsolationPolicy,
  tenantTablesSql,
  TENANT_ROLES,
} from '@codaco/studio-sync/rls';

import { ERASURE_GUC } from '../study/schema.ts';

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
          AND (${table.state} = 'stopped') = (${table.stoppedAt} IS NOT NULL)
          AND (${table.stoppedAt} IS NULL OR ${table.stoppedAt} >= ${table.startedAt})`,
    ),
    // The container only. A CHECK cannot call the function that would inspect
    // the elements, because drizzle creates this table — and its constraints —
    // before the sidecar runs, so `experiments_variants_well_formed` proves
    // every element instead.
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

-- Immutability that stopped at UPDATE would not be immutability. The blanket
-- tenant grant includes DELETE, so code running as ${TENANT_ROLES.app} could
-- delete a subject's exposures, delete the assignment they proved, and insert
-- a new one on another arm — re-rolling a sticky assignment through the one
-- verb the triggers above leave open, and invalidating every analysis that
-- cites it. Two delete paths are exempt, and only two: the maintenance purge,
-- and the audited participant erasure, which runs as ${TENANT_ROLES.app} too
-- and so presents the transaction-scoped marker instead. The marker is proven
-- against the row's own subject, so it authorizes deleting exactly one
-- participant's assignments and nothing else.
--
-- A subject of any other kind is never erasable: a researcher's assignment
-- (\`user\`) and an anonymous visitor's (\`session\`) belong to no participant,
-- so no marker can name them.
CREATE OR REPLACE FUNCTION experiment_assignments_are_deletable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('${ERASURE_GUC}', true), '');
BEGIN
  IF current_user = '${TENANT_ROLES.maintenance}' THEN
    RETURN OLD;
  END IF;
  IF marker IS NOT NULL
     AND OLD.subject_kind = 'participant'
     AND OLD.subject_id = marker THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'experiment assignments are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_assignments_deletable
  BEFORE DELETE ON experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION experiment_assignments_are_deletable();

-- The same promise for the exposures, proven through the assignment they
-- were logged against: an exposure carries no subject of its own, and erasure
-- must remove them before the assignment, because the composite key holds the
-- assignment in place while any of its exposures survive.
CREATE OR REPLACE FUNCTION experiment_exposures_are_deletable() RETURNS trigger AS $$
DECLARE
  marker text := NULLIF(current_setting('${ERASURE_GUC}', true), '');
BEGIN
  IF current_user = '${TENANT_ROLES.maintenance}' THEN
    RETURN OLD;
  END IF;
  IF marker IS NOT NULL AND EXISTS (
    SELECT 1 FROM experiment_assignments a
    WHERE a.id = OLD.assignment_id AND a.team_id = OLD.team_id
      AND a.subject_kind = 'participant'
      AND a.subject_id = marker
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'experiment exposures are deleted only by an audited erasure or the maintenance purge';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_exposures_deletable
  BEFORE DELETE ON experiment_exposures
  FOR EACH ROW EXECUTE FUNCTION experiment_exposures_are_deletable();

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
-- An assignment or exposure belongs to the experiment's lifetime: it needs
-- an experiment that has started, and a moment between that start and the
-- stop, if there has been one. Outside that span the row would be immutable
-- evidence an analysis by experiment and arm could not tell from the real
-- observations. AFTER the row, so the composite keys report first.
CREATE OR REPLACE FUNCTION experiment_rows_are_within_lifetime() RETURNS trigger AS $$
DECLARE
  started timestamptz;
  stopped timestamptz;
  moment timestamptz;
BEGIN
  SELECT e.started_at, e.stopped_at INTO started, stopped
  FROM experiments e WHERE e.id = NEW.experiment_id AND e.team_id = NEW.team_id;
  -- The row's own moment, named per table by the trigger's second argument:
  -- a direct NEW.<column> would bind both names against each record.
  moment := (to_jsonb(NEW) ->> TG_ARGV[1])::timestamptz;
  IF started IS NULL THEN
    RAISE EXCEPTION 'an experiment that has not started has no %', TG_ARGV[0];
  END IF;
  IF moment < started OR (stopped IS NOT NULL AND moment > stopped) THEN
    RAISE EXCEPTION 'an experiment''s % lie within its lifetime', TG_ARGV[0];
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiment_assignments_within_lifetime
  AFTER INSERT ON experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION experiment_rows_are_within_lifetime('assignments', 'assigned_at');

CREATE OR REPLACE TRIGGER experiment_exposures_within_lifetime
  AFTER INSERT ON experiment_exposures
  FOR EACH ROW EXECUTE FUNCTION experiment_rows_are_within_lifetime('exposures', 'occurred_at');

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

-- ...which only holds if "started" cannot be undone. The state check ties a
-- draft to a null \`started_at\`, so a row could be walked back to draft with
-- its start cleared and its variants then rewritten under the assignments
-- and exposures that cite the old arms. The first start is therefore final:
-- once recorded it neither clears nor moves, and the state never returns to
-- draft.
CREATE OR REPLACE FUNCTION experiment_start_is_final() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'an experiment that has started cannot return to draft or move its start';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiments_start_final
  BEFORE UPDATE ON experiments
  FOR EACH ROW
  WHEN (
    OLD.started_at IS NOT NULL
    AND (NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.state = 'draft')
  )
  EXECUTE FUNCTION experiment_start_is_final();

-- The stop closes the lifetime the rows above were admitted into, so it
-- cannot land before any of them: the lifetime triggers run only when an
-- assignment or exposure is inserted, and would not notice a stop that
-- moved underneath rows they had already accepted. And like the start, the
-- stop is final — moved or lifted, it would reopen a lifetime whose
-- observations an analysis has already read as complete.
CREATE OR REPLACE FUNCTION experiment_stop_closes_the_lifetime() RETURNS trigger AS $$
BEGIN
  IF OLD.stopped_at IS NOT NULL THEN
    RAISE EXCEPTION 'an experiment that has stopped cannot resume or move its stop';
  END IF;
  IF EXISTS (
    SELECT 1 FROM experiment_assignments a
    WHERE a.experiment_id = NEW.id AND a.team_id = NEW.team_id
      AND a.assigned_at > NEW.stopped_at
  ) OR EXISTS (
    SELECT 1 FROM experiment_exposures x
    WHERE x.experiment_id = NEW.id AND x.team_id = NEW.team_id
      AND x.occurred_at > NEW.stopped_at
  ) THEN
    RAISE EXCEPTION 'an experiment cannot stop before its assignments and exposures';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiments_stop_closes_lifetime
  BEFORE UPDATE ON experiments
  FOR EACH ROW
  WHEN (NEW.stopped_at IS DISTINCT FROM OLD.stopped_at)
  EXECUTE FUNCTION experiment_stop_closes_the_lifetime();

-- Both of the guards above read the variant list as a list of arms, and
-- \`experiments_variants_check\` cannot make it one: bounding the array and its
-- length is all a CHECK can do here, so on its own it admits [null, null], two
-- arms under one key, and weights of zero or less. Each is a silent corruption
-- of the randomiser that reads them — a null arm has no key to assign,
-- duplicate keys make two arms indistinguishable in every analysis, and a
-- non-positive weight either removes an arm the design says exists or makes
-- the weighted draw meaningless. The elements are proven in a trigger rather
-- than the CHECK because drizzle creates the table, and its constraints,
-- before this sidecar defines any function a CHECK could call.
--
-- BEFORE the row, because it decides whether the row may exist at all, and it
-- returns early on a non-array so \`experiments_variants_check\` still reports
-- the container's own shape instead of being masked by an element error.
-- Triggers fire in name order, so on an UPDATE \`experiments_variants_frozen\`
-- has already refused a started experiment before this one reads anything.
CREATE OR REPLACE FUNCTION experiment_variants_are_well_formed() RETURNS trigger AS $$
DECLARE
  variant jsonb;
  variant_key text;
  seen text[] := ARRAY[]::text[];
  weight numeric;
BEGIN
  IF jsonb_typeof(NEW.variants) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR variant IN SELECT jsonb_array_elements(NEW.variants) LOOP
    IF jsonb_typeof(variant) <> 'object' THEN
      RAISE EXCEPTION 'every experiment variant must be an object carrying a key and a weight';
    END IF;

    variant_key := variant->>'key';
    -- The same shape \`experiment_assignments_lengths_check\` demands of the
    -- \`variant_key\` that has to match one of these.
    IF coalesce(variant_key, '') !~ '^[a-z][a-z0-9_.-]{0,63}$' THEN
      RAISE EXCEPTION 'the experiment variant key % is not a well-formed key', coalesce(variant_key, '(missing)');
    END IF;
    IF variant_key = ANY(seen) THEN
      RAISE EXCEPTION 'the experiment variant key % is used twice', variant_key;
    END IF;
    seen := seen || variant_key;

    -- IS DISTINCT FROM, not <>: a missing weight makes jsonb_typeof NULL, and
    -- plpgsql treats a NULL condition as false, so <> would let it through.
    IF jsonb_typeof(variant->'weight') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'the experiment variant % must carry a positive integer weight', variant_key;
    END IF;
    weight := (variant->>'weight')::numeric;
    IF weight <= 0 OR weight <> trunc(weight) THEN
      RAISE EXCEPTION 'the experiment variant % must carry a positive integer weight', variant_key;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER experiments_variants_well_formed
  BEFORE INSERT OR UPDATE ON experiments
  FOR EACH ROW EXECUTE FUNCTION experiment_variants_are_well_formed();

${tenantTablesSql(['experiments', 'experiment_assignments', 'experiment_exposures'])}
`;
