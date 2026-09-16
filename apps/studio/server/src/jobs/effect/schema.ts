import { TENANT_ROLES } from '@codaco/studio-sync/rls';

// The queue's own schema, in the shape Studio's other sidecars take
// (src/db/access.ts and the per-area schema.ts modules): one SQL string,
// installed once, hashed into the schema fingerprint. What pg-boss installs
// through `getConstructionPlans` is ~40 statements across nine tables, seven
// functions and a version row; this is two tables and four indexes, because
// Studio uses five queues, one policy and no flows, dependencies, priorities,
// groups or heartbeats.
//
// Every statement names its schema so the same DDL can be installed into a
// scratch schema per suite without a `search_path` — rc.115 has no
// `startupParameters`, so a search path could not be pinned per connection
// anyway (see database.ts).

/** Interpolated into DDL, so it is checked rather than trusted. */
const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

export function assertSchemaName(schema: string): string {
  if (!SCHEMA_NAME.test(schema)) {
    throw new Error(`invalid job schema name: ${JSON.stringify(schema)}`);
  }
  return schema;
}

/**
 * The five states a job passes through. `created` and `active` are the live
 * ones the singleton index arbitrates over; `completed`, `failed` and `dead`
 * are terminal and are what retention deletes.
 *
 * `dead` is what a job on a dead-letter queue is *not*: a dead-lettered job is
 * a new `created` row on the dead-letter queue, exactly as pg-boss does it, and
 * the original becomes `failed`. `dead` is reserved for a row whose payload no
 * longer decodes, which no retry can fix and no dead-letter copy should carry.
 */
export const JOB_STATES = [
  'created',
  'active',
  'completed',
  'failed',
  'dead',
] as const;

export type JobState = (typeof JOB_STATES)[number];

/**
 * One string, the way `ACCESS_SIDECAR_SQL` and the area sidecars are one
 * string. Split by `splitStatements` at install time (#1927 §9); the spike's
 * test harness splits on the statement terminator because nothing here
 * contains a dollar-quoted body — deliberately, so the spike does not need
 * stage 2a's splitter to be finished first.
 */
export function jobSchemaSql(schema: string): string {
  const s = assertSchemaName(schema);
  return `
CREATE SCHEMA IF NOT EXISTS ${s};

CREATE TABLE ${s}.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'created'
    CHECK (state IN (${JOB_STATES.map((state) => `'${state}'`).join(', ')})),
  attempts int NOT NULL DEFAULT 0,
  singleton_key text,
  run_at timestamptz NOT NULL,
  -- pg-boss's \`keep_until\`: \`run_at + retentionSeconds\`. A job nothing ever
  -- claimed is deleted at this point rather than retried, which is what a
  -- queue's \`retentionSeconds\` means there (pg-boss \`plans.deletion\`).
  keep_until timestamptz NOT NULL,
  locked_until timestamptz,
  last_error text,
  -- What the handler said happened: completed | suppressed | uncertain.
  outcome text,
  dead_letter_of uuid,
  created_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX jobs_claim_idx ON ${s}.jobs (queue, run_at, created_at)
  WHERE state = 'created';

CREATE INDEX jobs_expiry_idx ON ${s}.jobs (locked_until)
  WHERE state = 'active';

CREATE INDEX jobs_retention_idx ON ${s}.jobs (queue, completed_at)
  WHERE state IN ('completed', 'failed', 'dead');

CREATE INDEX jobs_keep_until_idx ON ${s}.jobs (queue, keep_until)
  WHERE state = 'created';

CREATE UNIQUE INDEX jobs_singleton_idx ON ${s}.jobs (queue, singleton_key)
  WHERE singleton_key IS NOT NULL AND state IN ('created', 'active');

CREATE TABLE ${s}.job_schedules (
  name text PRIMARY KEY,
  cron text NOT NULL,
  queue text NOT NULL,
  payload jsonb NOT NULL,
  next_run_at timestamptz NOT NULL
);
`;
}

/**
 * The same division of labour `jobGrantsSql` makes over pg-boss's schema: the
 * application may create a job and learn its id, and nothing more — it cannot
 * read a payload, claim, retry, cancel or delete one, which keeps every team's
 * queued work invisible to the role that serves requests. The worker runs as
 * maintenance and owns both tables.
 *
 * `SELECT (id)` alone is what the `INSERT … RETURNING id` reads back. Widening
 * it is a schema change.
 */
export function jobSchemaGrantsSql(schema: string): string {
  const s = assertSchemaName(schema);
  const { app, maintenance } = TENANT_ROLES;
  return [
    `GRANT USAGE ON SCHEMA ${s} TO ${app}, ${maintenance};`,
    `GRANT INSERT ON ${s}.jobs TO ${app};`,
    `GRANT SELECT (id) ON ${s}.jobs TO ${app};`,
    `GRANT ALL ON ${s}.jobs, ${s}.job_schedules TO ${maintenance};`,
  ].join('\n');
}

/** Installed and dropped together; the suites drop the schema outright. */
export function dropJobSchemaSql(schema: string): string {
  return `DROP SCHEMA IF EXISTS ${assertSchemaName(schema)} CASCADE;`;
}
