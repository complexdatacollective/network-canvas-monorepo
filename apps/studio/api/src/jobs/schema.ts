import { TENANT_ROLES } from '@codaco/studio-sync/rls';

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

/** `CREATE SCHEMA` truncates a longer name silently, while `pg_notify` and `LISTEN` refuse it. */
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

export const JOB_STATES = [
  'created',
  'active',
  'completed',
  'failed',
  'dead',
] as const;

export type JobState = (typeof JOB_STATES)[number];

export function jobNotifyChannel(schema: string): string {
  return assertSchemaName(schema);
}

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

ALTER TABLE ${s}.jobs ADD COLUMN IF NOT EXISTS correlation jsonb;

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

/** The application may only create a job and read back its id (`INSERT … RETURNING id`). */
export function jobSchemaGrantsSql(schema: string): string {
  const s = assertSchemaName(schema);
  const { app, maintenance } = TENANT_ROLES;
  return [
    `GRANT USAGE ON SCHEMA ${s} TO ${app}, ${maintenance};`,
    `GRANT INSERT ON ${s}.jobs TO ${app};`,
    `GRANT SELECT (id) ON ${s}.jobs TO ${app};`,
    `GRANT ALL ON ${s}.jobs, ${s}.job_schedules TO ${maintenance};`,
    // A trigger function runs as the role that fired it. Granted explicitly so
    // revoking PUBLIC's default EXECUTE does not break every enqueue.
    `GRANT EXECUTE ON FUNCTION ${s}.notify_job() TO ${app}, ${maintenance};`,
  ].join('\n');
}

export function dropJobSchemaSql(schema: string): string {
  return `DROP SCHEMA IF EXISTS ${assertSchemaName(schema)} CASCADE;`;
}
