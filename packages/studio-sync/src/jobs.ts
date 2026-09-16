// Studio's background-job declarations (#1895): which queues exist, how each
// retries and expires, when the recurring ones run, and what a job on each may
// carry.
//
// Declarations only, as plain data. The queue that reads them is the server's
// own (`apps/studio/server/src/jobs/effect/queues.ts`), which resolves each one
// against its defaults and freezes the result onto a job row at enqueue, so a
// job already in flight keeps the retry and expiry it was created under. They
// live here rather than in the server because this package is compiled into
// contexts that never run a job and still need the payload shapes and the
// policy table below.
import { z } from 'zod';

/**
 * What a queue may declare. Anything left out takes the default the server's
 * `resolvedQueue` applies, and every field here is one that resolution reads —
 * an option nothing reads would be a setting a deployment could believe in.
 */
export type JobQueueOptions = {
  /**
   * `singleton` means at most one *active* job on the queue at a time; further
   * jobs wait as `created`. The two are the whole set the queue implements.
   */
  policy?: 'standard' | 'singleton';
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  /** Only meaningful with `retryBackoff`: the cap on the backoff ladder. */
  retryDelayMax?: number;
  expireInSeconds?: number;
  retentionSeconds?: number;
  /** `0` keeps completed jobs forever. */
  deleteAfterSeconds?: number;
  deadLetter?: string;
  warningQueueSize?: number;
};

export type JobQueueDeclaration = {
  name: string;
  options: JobQueueOptions;
};

/**
 * Every queue Studio declares. A `deadLetter` must name another queue in this
 * list — the server refuses the whole list at module load otherwise, so a typo
 * stops a process at start rather than at the first dead-lettered job.
 * Consumers that land later (#1521, #1291, #1305, #1520, #1268) add theirs
 * here rather than naming a queue of their own at run time.
 *
 * A queue is not a row or a table anywhere: it exists because it is declared
 * here, and every job carries its queue's name and its resolved retry and
 * expiry on the job row itself.
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
    },
  },
  {
    // A sign-in link is useless once it expires, so a failed send is worth two
    // quick retries and nothing more: no dead letter, and both the job and its
    // record are gone within minutes — which holds only because the worker
    // sweeps retention every minute. Deletion happens on that sweep alone, so
    // at a day-scale retention this row, whose payload is the magic link
    // itself, would outlive the link by most of a day.
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
    },
  },
  {
    // Summarising suppressed denied attempts is idempotent and cheap, and a
    // second run alongside the first would race the first for the same
    // suppression keys and could write the same summary event twice —
    // `singleton` lets at most one be active across every worker replica, and
    // a missed minute is picked up by the next run because the keys outlive
    // their window by several minutes (#1909).
    name: 'denied-attempts-summary',
    options: {
      policy: 'singleton',
      retryLimit: 0,
      expireInSeconds: 60,
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
 * Recurring work, upserted into the queue's own `job_schedules` table by every
 * worker at boot; one replica ticks per pass, so a firing reaches exactly one
 * of them. Hourly is well inside every retention bound the sweep enforces.
 */
export const JOB_SCHEDULES = [
  { queue: 'protocol-store-gc', cron: '0 * * * *', tz: 'UTC' },
  // Every minute, because the thing it summarises is a one-minute window: a
  // longer cadence would leave a burst unrecorded for as long as the cadence,
  // and the job does nothing at all when no window was suppressed.
  { queue: 'denied-attempts-summary', cron: '* * * * *', tz: 'UTC' },
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

/** The run scans every suppressed window there is; nothing addresses it. */
export const DeniedAttemptsSummaryJobSchema = z.strictObject({});
export type DeniedAttemptsSummaryJob = z.infer<
  typeof DeniedAttemptsSummaryJobSchema
>;

export const JOB_PAYLOAD_SCHEMAS = {
  'invitation-delivery': InvitationDeliveryJobSchema,
  // A dead-lettered job is a copy of the one that failed, so the shape is the
  // same one; nothing enqueues here directly.
  'invitation-delivery-dead-letter': InvitationDeliveryJobSchema,
  'sign-in-email': SignInEmailJobSchema,
  'protocol-store-gc': ProtocolStoreGcJobSchema,
  'denied-attempts-summary': DeniedAttemptsSummaryJobSchema,
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
  'denied-attempts-summary': { kind: 'identifiers' },
} as const satisfies Record<JobQueueName, JobPayloadPolicy>;
