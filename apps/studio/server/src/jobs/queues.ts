import { getConstructionPlans, type Queue } from 'pg-boss';

import {
  JOB_QUEUES,
  JOB_SCHEMA,
  jobGrantsSql,
  type JobQueueName,
  type JobQueueOptions,
} from '@codaco/studio-sync/jobs';

// The pg-boss-facing view of the queue declarations. studio-sync holds them as
// plain data so it never imports pg-boss; the two types are reconciled here,
// and this module is also where the schema's installable SQL is rendered.
//
// It sits in src/ rather than beside scripts/apply.ts because the test
// support's DDL cache has to hash these statements without pulling drizzle-kit
// into its module graph, which importing apply.ts would do.

/**
 * An option name studio-sync declares that pg-boss's `Queue` does not have.
 * `never` is the only correct value and the type test asserts it, so a pg-boss
 * upgrade that renames an option fails the typecheck rather than failing
 * `createQueue` in a deployment. An option whose *type* moved is caught by
 * `jobQueueDefinitions` below, whose return type is pg-boss's own.
 */
export type JobQueueOptionDrift = Exclude<
  keyof JobQueueOptions,
  keyof Omit<Queue, 'name'>
>;

/** The declarations in the order they must be created (dead letters first). */
export function jobQueueDefinitions(): {
  name: JobQueueName;
  options: Omit<Queue, 'name'>;
}[] {
  return JOB_QUEUES.map(({ name, options }) => ({ name, options }));
}

// pg-boss records its schema version in the last statement of its own
// construction plan, which is the artifact we install, so it is read from
// there rather than from a constant that could describe a different version of
// the SQL beside it.
const VERSION_STAMP = /INSERT INTO \w+\.version\(version\) VALUES \('(\d+)'\)/;

function schemaVersionOf(plan: string): number {
  const stamped = VERSION_STAMP.exec(plan)?.[1];
  if (stamped === undefined) {
    throw new Error(
      "pg-boss's construction plan no longer stamps a schema version; scripts/apply.ts cannot tell a current installation from an outdated one",
    );
  }
  return Number(stamped);
}

/**
 * Everything the `pgboss` schema is made of, hashed into the schema
 * fingerprint beside the public statements: the tables and functions, the
 * grants, and the queue definitions. A pg-boss upgrade changes the first, a
 * grant change the second, and a queue change the third, so any of the three
 * is a stale database that every process refuses at boot.
 *
 * The queue line is a comment rather than SQL because queues are reconciled
 * through pg-boss's own create/update calls, which need a connection; what
 * matters for the fingerprint is that their declared shape is covered.
 */
export function renderJobStatements(): string[] {
  return [
    getConstructionPlans(JOB_SCHEMA),
    jobGrantsSql(JOB_SCHEMA),
    `-- queues ${JSON.stringify(JOB_QUEUES)}`,
  ];
}

export const JOB_SCHEMA_VERSION = schemaVersionOf(
  getConstructionPlans(JOB_SCHEMA),
);
