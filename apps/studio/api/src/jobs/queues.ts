import { type Effect, Schema } from 'effect';

import {
  JOB_PAYLOAD_PARSE_OPTIONS,
  JOB_PAYLOAD_SCHEMAS,
  JOB_QUEUES,
  type JobPayload,
  type JobQueueName,
  type JobQueueOptions,
} from '@codaco/studio-sync/jobs';

import { jobSchemaGrantsSql, jobSchemaSql } from './schema.ts';

// What a queue means to the native worker, read off the declarations in
// `@codaco/studio-sync/jobs` rather than restated: `JOB_QUEUES` stays the one
// place a queue exists, and `JOB_PAYLOAD_SCHEMAS` the one place its payload is
// declared. This module only resolves a queue's options against the defaults
// and turns its payload schema into the decoder both directions of the queue
// run.

/**
 * pg-boss's own defaults (`QUEUE_DEFAULTS`, pg-boss 12.31.1
 * `dist/plans.js:83`), so an option a queue leaves out means here what it
 * means there. `retryDelayMax` has no default: pg-boss treats null as "no
 * cap", and `0` as a real cap of zero.
 */
const QUEUE_DEFAULTS = {
  policy: 'standard',
  retryLimit: 2,
  retryDelay: 0,
  retryBackoff: false,
  expireInSeconds: 15 * 60,
  retentionSeconds: 14 * 24 * 60 * 60,
  deleteAfterSeconds: 7 * 24 * 60 * 60,
} as const;

export type ResolvedQueue = {
  readonly name: JobQueueName;
  readonly policy: NonNullable<JobQueueOptions['policy']>;
  readonly retryLimit: number;
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
  readonly retryDelayMax: number | null;
  readonly expireInSeconds: number;
  readonly retentionSeconds: number;
  readonly deleteAfterSeconds: number;
  readonly deadLetter: JobQueueName | null;
  readonly warningQueueSize: number | null;
};

const isDeclaredQueueName = (name: string): name is JobQueueName =>
  JOB_QUEUES.some((declaration) => declaration.name === name);

function declaredQueueName(name: string): JobQueueName {
  if (!isDeclaredQueueName(name)) {
    throw new Error(`no job queue is declared as ${JSON.stringify(name)}`);
  }
  return name;
}

const resolve = (declaration: (typeof JOB_QUEUES)[number]): ResolvedQueue => {
  const options: JobQueueOptions = declaration.options;
  return {
    name: declaration.name,
    policy: options.policy ?? QUEUE_DEFAULTS.policy,
    retryLimit: options.retryLimit ?? QUEUE_DEFAULTS.retryLimit,
    retryDelay: options.retryDelay ?? QUEUE_DEFAULTS.retryDelay,
    retryBackoff: options.retryBackoff ?? QUEUE_DEFAULTS.retryBackoff,
    retryDelayMax: options.retryDelayMax ?? null,
    expireInSeconds: options.expireInSeconds ?? QUEUE_DEFAULTS.expireInSeconds,
    retentionSeconds:
      options.retentionSeconds ?? QUEUE_DEFAULTS.retentionSeconds,
    deleteAfterSeconds:
      options.deleteAfterSeconds ?? QUEUE_DEFAULTS.deleteAfterSeconds,
    // Every declared dead letter must name another declared queue. Checked
    // here, at module load, so a typo in a declaration fails the process at
    // start rather than the first dead-lettered job.
    deadLetter:
      options.deadLetter === undefined
        ? null
        : declaredQueueName(options.deadLetter),
    warningQueueSize: options.warningQueueSize ?? null,
  };
};

const RESOLVED = new Map<JobQueueName, ResolvedQueue>(
  JOB_QUEUES.map((declaration) => [declaration.name, resolve(declaration)]),
);

export const resolvedQueues: readonly ResolvedQueue[] = [...RESOLVED.values()];

export function resolvedQueue(name: JobQueueName): ResolvedQueue {
  const queue = RESOLVED.get(name);
  // Reachable only by bypassing the types; refusing here keeps an undeclared
  // queue from touching the caller's transaction at all, as `enqueueJob` does.
  if (!queue) {
    throw new Error(`no job queue is declared as ${JSON.stringify(name)}`);
  }
  return queue;
}

/**
 * A decoder per queue, rather than the schema itself. Indexing a mapped type
 * with a generic key resolves — `JOB_PAYLOAD_CODECS[queue]` for
 * `queue: Queue` is `QueuePayloadCodec<Queue>` — where indexing a plain
 * object of schemas would only give the union of all five, and every generic
 * call site would then need a cast to get its own payload type back.
 *
 * Both directions of the queue — the enqueue validating a caller's value and
 * the worker validating a row — run this decode, so `JobPayload` is what it
 * returns and there is one shape per queue rather than a pair.
 */
export type QueuePayloadCodec<Queue extends JobQueueName> = {
  readonly decode: (
    raw: unknown,
  ) => Effect.Effect<JobPayload<Queue>, Schema.SchemaError>;
};

/**
 * The one place `JOB_PAYLOAD_PARSE_OPTIONS` is applied: every call site
 * decodes through `payloadCodec`, so none can reach a payload schema without
 * it.
 */
const codec = <Queue extends JobQueueName>(
  schema: Schema.Codec<JobPayload<Queue>, unknown>,
): QueuePayloadCodec<Queue> => ({
  decode: Schema.decodeUnknownEffect(schema, JOB_PAYLOAD_PARSE_OPTIONS),
});

const JOB_PAYLOAD_CODECS: {
  [Queue in JobQueueName]: QueuePayloadCodec<Queue>;
} = {
  'invitation-delivery': codec(JOB_PAYLOAD_SCHEMAS['invitation-delivery']),
  'invitation-delivery-dead-letter': codec(
    JOB_PAYLOAD_SCHEMAS['invitation-delivery-dead-letter'],
  ),
  'sign-in-email': codec(JOB_PAYLOAD_SCHEMAS['sign-in-email']),
  'protocol-store-gc': codec(JOB_PAYLOAD_SCHEMAS['protocol-store-gc']),
  'denied-attempts-summary': codec(
    JOB_PAYLOAD_SCHEMAS['denied-attempts-summary'],
  ),
};

export function payloadCodec<Queue extends JobQueueName>(
  queue: Queue,
): QueuePayloadCodec<Queue> {
  return JOB_PAYLOAD_CODECS[queue];
}

/**
 * The queue's own schema, rather than `public`: `applySchema` pushes `public`
 * with drizzle-kit, which reconciles everything it introspects there against
 * what Drizzle declares — a jobs table in `public` would be dropped as
 * unmanaged by the next push.
 *
 * Declared here rather than in install.ts so that the web process's graph —
 * which reaches this module through the enqueue — never reaches
 * `@effect/sql-pg` for it.
 */
export const JOB_SCHEMA = 'studio_jobs';

/**
 * Everything outside the public schema that a schema application installs,
 * hashed into the schema fingerprint beside the public statements: the queue's
 * tables, indexes and notify trigger, then its grants.
 *
 * They are in the fingerprint because a column added to `studio_jobs.jobs` is a
 * database this build's worker could not run against, and that has to be
 * refused at boot rather than discovered at the first claim.
 */
export function renderJobStatements(): string[] {
  return [jobSchemaSql(JOB_SCHEMA), jobSchemaGrantsSql(JOB_SCHEMA)];
}
