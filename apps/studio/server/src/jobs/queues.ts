import { jobSchemaGrantsSql, jobSchemaSql } from './effect/schema.ts';

// The job schema's name, and the statements a schema application installs it
// from.
//
// It sits in src/ rather than beside scripts/apply.ts because the test
// support's DDL cache has to hash these statements without pulling drizzle-kit
// into its module graph, which importing apply.ts would do.

/**
 * The queue's own schema, rather than `public`: `applySchema` pushes `public`
 * with drizzle-kit, which reconciles everything it introspects there against
 * what Drizzle declares — a jobs table in `public` would be dropped as
 * unmanaged by the next push.
 *
 * Declared here rather than beside the DDL so that neither module has to
 * import the other: `src/jobs/effect/install.ts` reaches `@effect/sql-pg` for
 * its Effect half, and this module is in the web process's graph.
 */
export const NATIVE_JOB_SCHEMA = 'studio_jobs';

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
  return [
    jobSchemaSql(NATIVE_JOB_SCHEMA),
    jobSchemaGrantsSql(NATIVE_JOB_SCHEMA),
  ];
}
