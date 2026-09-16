import {
  getConstructionPlans,
  type Queue,
  type UpdateQueueOptions,
} from 'pg-boss';

import {
  JOB_QUEUES,
  JOB_SCHEMA,
  jobGrantsSql,
  type JobQueueName,
  type JobQueueOptions,
} from '@codaco/studio-sync/jobs';

import { jobSchemaGrantsSql, jobSchemaSql } from './effect/schema.ts';

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

/**
 * What pg-boss writes for an option a `createQueue` call leaves out, read off
 * `create_queue` in its own construction plan (pg-boss/dist/plans.js), and
 * asserted against a real queue row by the schema suite so that an upgrade
 * which moves one of these fails a test rather than a deployment.
 *
 * Reconciliation sends the whole table with a declaration spread over it,
 * rather than the declaration alone: `updateQueue` leaves an option it was not
 * given exactly as it is, so an option dropped from a declaration would
 * otherwise keep its last applied value until the database was recreated.
 * Which is to say the installed row equals the declaration, never contains it.
 *
 * Typed `Required<…>` so that every updatable option has to appear: a pg-boss
 * release that adds one fails the typecheck here instead of adding an option
 * nothing reconciles. `policy` and `partition` are absent because they are the
 * two `updateQueue` refuses — a queue with either of those changed has to be
 * recreated, and `syncJobQueues` says so rather than sending them.
 */
export const QUEUE_OPTION_DEFAULTS: Required<UpdateQueueOptions> = {
  retryLimit: 2,
  retryDelay: 0,
  retryBackoff: false,
  retryDelayMax: null,
  expireInSeconds: 900,
  retentionSeconds: 1_209_600,
  deleteAfterSeconds: 604_800,
  deadLetter: null,
  heartbeatSeconds: null,
  // 0 rather than null: `create_queue` coalesces an absent warningQueueSize to
  // zero, which is the column's "never warn" value.
  warningQueueSize: 0,
  notify: false,
};

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
 * The schema the Effect-native queue installs beside pg-boss's (#1927).
 *
 * Its own schema rather than `public` for the reason pg-boss has one:
 * `applySchema` pushes `public` with drizzle-kit, which reconciles everything
 * it introspects there against what Drizzle declares — a jobs table in
 * `public` would be dropped as unmanaged by the next push.
 *
 * Declared here rather than beside the DDL so that neither module has to
 * import the other: `src/jobs/effect/install.ts` reaches `@effect/sql-pg` for
 * its Effect half, and this module is in the web process's graph.
 */
export const NATIVE_JOB_SCHEMA = 'studio_jobs';

/**
 * Everything outside the public schema that a schema application installs,
 * hashed into the schema fingerprint beside the public statements.
 *
 * pg-boss's half comes first: the tables and functions its construction plan
 * creates, the grants, and the queue definitions. A pg-boss upgrade changes
 * the first, a grant change the second, and a queue change the third, so any
 * of the three is a stale database that every process refuses at boot.
 *
 * The queue line is a comment rather than SQL because queues are reconciled
 * through pg-boss's own create/update calls, which need a connection; what
 * matters for the fingerprint is that their declared shape is covered.
 *
 * Then the native queue's own schema and grants, which every application
 * installs from now on and nothing in the image reads until stage 3 switches
 * the callers over. They are in the fingerprint for the same reason pg-boss's
 * are: a column added to `studio_jobs.jobs` is a database this build's worker
 * could not run against, and must be refused at boot rather than discovered
 * at the first claim.
 */
export function renderJobStatements(): string[] {
  return [
    getConstructionPlans(JOB_SCHEMA),
    jobGrantsSql(JOB_SCHEMA),
    `-- queues ${JSON.stringify(JOB_QUEUES)}`,
    jobSchemaSql(NATIVE_JOB_SCHEMA),
    jobSchemaGrantsSql(NATIVE_JOB_SCHEMA),
  ];
}

export const JOB_SCHEMA_VERSION = schemaVersionOf(
  getConstructionPlans(JOB_SCHEMA),
);
