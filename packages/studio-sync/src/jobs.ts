// Studio's background-job declarations (#1895): which queues exist, how each
// retries and expires, what a job on it may carry, and what the two database
// roles may do with the job tables.
//
// It lives beside rls.ts for the same reason the roles do — a queue is part of
// the schema, installed once by apply-schema and verified by every process at
// boot through the fingerprint — and it imports no pg-boss. pg-boss is a server
// dependency; this package is also compiled into contexts that never run a job,
// and the declarations are plain data either way. The server checks them
// against pg-boss's own `Queue` type at compile time (src/jobs/queues.ts), so
// the absence of the import costs no safety.
import { z } from 'zod';

import { TENANT_ROLES } from './rls.ts';

/** pg-boss owns this schema outright; nothing of Studio's lives in it. */
export const JOB_SCHEMA = 'pgboss';

/**
 * pg-boss's per-queue options, mirrored rather than imported. Every field is
 * the same name and meaning pg-boss gives it; `src/jobs/queues.ts` in the
 * server fails to compile if that stops being true.
 */
export type JobQueueOptions = {
  policy?:
    | 'standard'
    | 'short'
    | 'singleton'
    | 'stately'
    | 'exclusive'
    | 'key_strict_fifo';
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  /** Only meaningful with `retryBackoff`; pg-boss rejects it otherwise. */
  retryDelayMax?: number;
  expireInSeconds?: number;
  retentionSeconds?: number;
  /** `0` keeps completed jobs forever. */
  deleteAfterSeconds?: number;
  deadLetter?: string;
  notify?: boolean;
  warningQueueSize?: number;
};

export type JobQueueDeclaration = {
  name: string;
  options: JobQueueOptions;
};

/**
 * Every queue Studio declares, in the order they must be created: a queue's
 * `deadLetter` is a foreign key to another queue's name, so a target has to
 * exist before the queue that names it. Consumers that land later (#1521,
 * #1291, #1305, #1520, #1268) add theirs here rather than creating queues of
 * their own at run time.
 *
 * `partition` is deliberately absent everywhere: a dedicated table per queue
 * only pays for itself at a volume none of these reach, and it would make a
 * queue's shape a migration rather than a row.
 */
export const JOB_QUEUES = [
  {
    // Kept until a researcher re-sends by hand (#1307), so nothing deletes it
    // and a month is the outer bound on how long that remedy stays available.
    name: 'invitation-delivery-dead-letter',
    options: {
      policy: 'standard',
      retryLimit: 0,
      deleteAfterSeconds: 0,
      retentionSeconds: 2_592_000,
    },
  },
  {
    // Eight attempts with exponential backoff from 5s to 30 minutes, matching
    // the hand-written dispatcher this replaces. The expiry is the outer bound
    // on one attempt: the SMTP transport's own timeouts (10s connect, 10s
    // greeting, 20s socket) all fit inside it.
    name: 'invitation-delivery',
    options: {
      policy: 'standard',
      retryLimit: 7,
      retryDelay: 5,
      retryBackoff: true,
      retryDelayMax: 1800,
      expireInSeconds: 60,
      deadLetter: 'invitation-delivery-dead-letter',
      notify: true,
    },
  },
  {
    // A sign-in link is useless once it expires, so a failed send is worth two
    // quick retries and nothing more: no dead letter, and both the job and its
    // record are gone within minutes.
    name: 'sign-in-email',
    options: {
      policy: 'standard',
      retryLimit: 2,
      retryDelay: 5,
      retryBackoff: true,
      retryDelayMax: 60,
      expireInSeconds: 30,
      retentionSeconds: 600,
      deleteAfterSeconds: 60,
      notify: true,
    },
  },
  {
    // Sweeping the protocol store is idempotent and unbounded in duration, so
    // a second run alongside the first buys nothing: `singleton` lets at most
    // one be active, and a missed hour is picked up by the next one rather
    // than retried.
    name: 'protocol-store-gc',
    options: {
      policy: 'singleton',
      retryLimit: 0,
      expireInSeconds: 3600,
    },
  },
] as const satisfies readonly JobQueueDeclaration[];

export type JobQueueName = (typeof JOB_QUEUES)[number]['name'];

export type JobSchedule = {
  queue: JobQueueName;
  cron: string;
  tz: string;
};

/**
 * Recurring work, registered by the worker through pg-boss's own cron, which
 * coordinates across worker replicas. Hourly is well inside every retention
 * bound the sweep enforces.
 */
export const JOB_SCHEDULES = [
  { queue: 'protocol-store-gc', cron: '0 * * * *', tz: 'UTC' },
] as const satisfies readonly JobSchedule[];

/** The delivery row's id; the handler loads the address under its own role. */
export const InvitationDeliveryJobSchema = z.strictObject({
  deliveryId: z.uuid(),
});
export type InvitationDeliveryJob = z.infer<typeof InvitationDeliveryJobSchema>;

/** The documented exception to identifiers-only — see JOB_PAYLOAD_POLICY. */
export const SignInEmailJobSchema = z.strictObject({
  email: z.string().min(1),
  url: z.url(),
});
export type SignInEmailJob = z.infer<typeof SignInEmailJobSchema>;

/** The sweep visits every tenant; there is nothing to address it at. */
export const ProtocolStoreGcJobSchema = z.strictObject({});
export type ProtocolStoreGcJob = z.infer<typeof ProtocolStoreGcJobSchema>;

export const JOB_PAYLOAD_SCHEMAS = {
  'invitation-delivery': InvitationDeliveryJobSchema,
  // A dead-lettered job is a copy of the one that failed, so the shape is the
  // same one; nothing enqueues here directly.
  'invitation-delivery-dead-letter': InvitationDeliveryJobSchema,
  'sign-in-email': SignInEmailJobSchema,
  'protocol-store-gc': ProtocolStoreGcJobSchema,
} as const satisfies Record<JobQueueName, z.ZodType>;

export type JobPayload<Queue extends JobQueueName> = z.infer<
  (typeof JOB_PAYLOAD_SCHEMAS)[Queue]
>;

export type JobPayloadPolicy =
  | { kind: 'identifiers' }
  | { kind: 'exception'; reason: string };

/**
 * What a job on each queue is allowed to carry. `identifiers` means row ids
 * and nothing else: the job table is one table for every team, so a payload
 * that named a participant, an address or protocol content would put tenant
 * data somewhere row-level security does not reach, which is the objection
 * that kept Studio off a queue library until #1895.
 *
 * A queue added here declares its class, and the payload test refuses any
 * exception but the one below.
 */
export const JOB_PAYLOAD_POLICY = {
  'invitation-delivery': { kind: 'identifiers' },
  'invitation-delivery-dead-letter': { kind: 'identifiers' },
  'sign-in-email': {
    kind: 'exception',
    reason:
      'A magic link is minted by better-auth during the sign-in request and is never stored, so there is no row for the handler to load it back from. The address is the account being signed in to, which belongs to no team.',
  },
  'protocol-store-gc': { kind: 'identifiers' },
} as const satisfies Record<JobQueueName, JobPayloadPolicy>;

// Interpolated into DDL, so it is checked rather than trusted: the scratch
// schemas the suites provision compose this name themselves.
const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * What the two roles may do inside pg-boss's schema.
 *
 * The application may create a job and learn its id, and nothing more — it
 * cannot read a payload, retry, cancel or delete one, which keeps every team's
 * queued work invisible to the role that serves requests. The worker runs as
 * maintenance, which owns the schema's use outright because pg-boss's fetch,
 * completion and supervision paths write to every table in it.
 *
 * The column list on `job_common` is exactly what the insert hands back:
 * pg-boss returns the new id, and a notify-enabled queue also reads
 * `start_after` to decide whether to fire the NOTIFY. `name` is there because
 * the same statement's ON CONFLICT arbitration and the queue foreign key read
 * it. Hashed into the schema fingerprint, so widening this is a schema change.
 */
export function jobGrantsSql(schema: string): string {
  if (!SCHEMA_NAME.test(schema)) {
    throw new Error(`invalid job schema name: ${JSON.stringify(schema)}`);
  }
  const { app, maintenance } = TENANT_ROLES;
  return [
    `GRANT USAGE ON SCHEMA ${schema} TO ${app}, ${maintenance};`,
    `GRANT SELECT ON ${schema}.queue, ${schema}.version TO ${app};`,
    `GRANT INSERT ON ${schema}.job, ${schema}.job_common TO ${app};`,
    `GRANT SELECT (id, name, start_after) ON ${schema}.job_common TO ${app};`,
    `GRANT ALL ON ALL TABLES IN SCHEMA ${schema} TO ${maintenance};`,
    `GRANT ALL ON ALL SEQUENCES IN SCHEMA ${schema} TO ${maintenance};`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO ${maintenance};`,
  ].join('\n');
}
