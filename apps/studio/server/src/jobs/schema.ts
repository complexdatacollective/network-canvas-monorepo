import { TENANT_ROLES } from '@codaco/studio-sync/rls';

// The queue's own schema, in the shape Studio's other sidecars take
// (src/db/access.ts and the per-area schema.ts modules): one SQL string,
// installed once, hashed into the schema fingerprint. What pg-boss installs
// through `getConstructionPlans` is ~40 statements across nine tables, seven
// functions and a version row; this is two tables, six indexes and one trigger,
// because Studio uses five queues, two policies and no flows, dependencies,
// priorities, groups or heartbeats.
//
// Every statement names its schema so the same DDL can be installed into a
// scratch schema per suite without a `search_path` — rc.115 has no
// `startupParameters`, so a search path could not be pinned per connection
// anyway (see database.ts).

/** Interpolated into DDL, so it is checked rather than trusted. */
const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * Postgres's `NAMEDATALEN - 1`. A longer name is not a style question:
 * `CREATE SCHEMA` truncates it silently, so the install would appear to work,
 * while `pg_notify` on the same name (the trigger below) raises outright and
 * `validateChannelName` in `@effect/sql-pg` refuses the matching `LISTEN` —
 * which `worker.ts` turns into a dead layer. Refusing at the name is what
 * makes that a start-up error instead of a runtime one.
 */
const MAX_IDENTIFIER_BYTES = 63;

export function assertSchemaName(schema: string): string {
  if (!SCHEMA_NAME.test(schema)) {
    throw new Error(`invalid job schema name: ${JSON.stringify(schema)}`);
  }
  if (Buffer.byteLength(schema) > MAX_IDENTIFIER_BYTES) {
    throw new Error(
      `job schema name is longer than Postgres's ${MAX_IDENTIFIER_BYTES}-byte identifier limit: ${JSON.stringify(schema)}`,
    );
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
 * The `NOTIFY` channel a schema's jobs announce themselves on: the schema name
 * itself, so two installations in one database (production's `studio_jobs` and
 * a suite's scratch sibling) never wake each other's workers. The payload is
 * the queue name, which is all a worker needs to know which poll fiber to
 * release.
 *
 * A channel name is an identifier, so the same rule the DDL is checked against
 * covers it, and Postgres's 63-byte identifier limit applies to both.
 */
export function jobNotifyChannel(schema: string): string {
  return assertSchemaName(schema);
}

/**
 * One string, the way `ACCESS_SIDECAR_SQL` and the area sidecars are one
 * string. Split by `splitStatements` at install time (#1927 §9) — stage 2a's
 * dollar-quote-aware splitter, which the trigger function below now requires.
 *
 * Every statement is idempotent (`IF NOT EXISTS` / `OR REPLACE`), because
 * `src/db/migrate.ts` and `scripts/apply.ts` install it into a database that
 * may already carry it.
 */
export function jobSchemaSql(schema: string): string {
  const s = assertSchemaName(schema);
  return `
CREATE SCHEMA IF NOT EXISTS ${s};

CREATE TABLE IF NOT EXISTS ${s}.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'created'
    CHECK (state IN (${JOB_STATES.map((state) => `'${state}'`).join(', ')})),
  -- The queue's policy, stamped on the row at enqueue. A partial index cannot
  -- read a declaration, so the row has to carry the one fact the singleton
  -- index arbitrates over — which is exactly what pg-boss's \`job.policy\`
  -- column exists for (\`plans.js\` \`createIndexJobPolicySingleton\`).
  policy text NOT NULL DEFAULT 'standard',
  attempts int NOT NULL DEFAULT 0,
  singleton_key text,
  -- The retry policy, frozen at enqueue as pg-boss freezes it: \`claim\`,
  -- \`settleFailure\` and the expiry reaper read these columns rather than the
  -- declaration, so a redeploy that changes a queue's options does not change
  -- how a job already in flight retries.
  retry_limit int NOT NULL DEFAULT 0,
  retry_delay int NOT NULL DEFAULT 0,
  retry_backoff boolean NOT NULL DEFAULT false,
  -- Null means "no cap", which is what pg-boss means by an absent
  -- \`retryDelayMax\`; \`0\` is a real cap of zero.
  retry_delay_max int,
  -- The lease one attempt gets. Read off the row by the claim, so a job
  -- claimed today keeps the expiry it was enqueued under.
  expire_in_seconds int NOT NULL DEFAULT 900,
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

CREATE INDEX IF NOT EXISTS jobs_claim_idx ON ${s}.jobs (queue, run_at, created_at)
  WHERE state = 'created';

CREATE INDEX IF NOT EXISTS jobs_expiry_idx ON ${s}.jobs (locked_until)
  WHERE state = 'active';

CREATE INDEX IF NOT EXISTS jobs_retention_idx ON ${s}.jobs (queue, completed_at)
  WHERE state IN ('completed', 'failed', 'dead');

CREATE INDEX IF NOT EXISTS jobs_keep_until_idx ON ${s}.jobs (queue, keep_until)
  WHERE state = 'created';

CREATE UNIQUE INDEX IF NOT EXISTS jobs_singleton_idx ON ${s}.jobs (queue, singleton_key)
  WHERE singleton_key IS NOT NULL AND state IN ('created', 'active');

-- \`singleton\` means one *active* job per queue, not one job in total: further
-- jobs sit \`created\` and wait. pg-boss's \`job_i2\` is the same index over the
-- same predicate, and its fetch tolerates the \`23505\` two workers can race
-- into; the claim here carries the matching \`NOT EXISTS\` so the race is rare
-- and this index is the belt that makes it impossible.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_singleton_active_idx ON ${s}.jobs (queue)
  WHERE state = 'active' AND policy = 'singleton';

CREATE TABLE IF NOT EXISTS ${s}.job_schedules (
  name text PRIMARY KEY,
  cron text NOT NULL,
  queue text NOT NULL,
  payload jsonb NOT NULL,
  next_run_at timestamptz NOT NULL
);

-- Waking the worker is the table's job, not the enqueueing code's: any writer
-- that leaves a row \`created\` — this queue's enqueue, the expiry reaper, a
-- future node-postgres path, a human running an UPDATE — announces it, and a
-- worker listening on the channel drains within milliseconds instead of at the
-- next poll. \`pg_notify\` is transactional, so nothing is announced until the
-- writer's transaction commits.
CREATE OR REPLACE FUNCTION ${s}.notify_job() RETURNS trigger AS $notify_job$
BEGIN
  PERFORM pg_notify('${jobNotifyChannel(s)}', NEW.queue);
  RETURN NULL;
END;
$notify_job$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER jobs_notify_trigger
  AFTER INSERT OR UPDATE OF state ON ${s}.jobs
  FOR EACH ROW WHEN (NEW.state = 'created')
  EXECUTE FUNCTION ${s}.notify_job();
`;
}

/**
 * The same division of labour Studio made over pg-boss's own schema: the
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
    // A trigger function runs as the role that fired it, so the application
    // needs EXECUTE to insert at all. New functions grant EXECUTE to PUBLIC,
    // which would make this redundant — until someone revokes that, which is
    // an ordinary hardening step and would otherwise break every enqueue.
    `GRANT EXECUTE ON FUNCTION ${s}.notify_job() TO ${app}, ${maintenance};`,
  ].join('\n');
}

/** Installed and dropped together; the suites drop the schema outright. */
export function dropJobSchemaSql(schema: string): string {
  return `DROP SCHEMA IF EXISTS ${assertSchemaName(schema)} CASCADE;`;
}
