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

/** `retryDelayMax` has no default: null means no cap, and `0` a real cap of zero. */
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

export const isDeclaredQueueName = (name: string): name is JobQueueName =>
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
  if (!queue) {
    throw new Error(`no job queue is declared as ${JSON.stringify(name)}`);
  }
  return queue;
}

/** A decoder per queue: indexing this mapped type with a generic key resolves, where a plain object of schemas would need a cast. */
export type QueuePayloadCodec<Queue extends JobQueueName> = {
  readonly decode: (
    raw: unknown,
  ) => Effect.Effect<JobPayload<Queue>, Schema.SchemaError>;
};

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

/** Not `public`: drizzle-kit's push would drop a jobs table there as unmanaged. */
export const JOB_SCHEMA = 'studio_jobs';

export function renderJobStatements(): string[] {
  return [jobSchemaSql(JOB_SCHEMA), jobSchemaGrantsSql(JOB_SCHEMA)];
}
