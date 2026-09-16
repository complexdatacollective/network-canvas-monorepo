import { jobGrantsSql } from '@codaco/studio-sync/jobs';

import { splitStatements } from '../db/statements.ts';
import {
  JOB_SCHEMA_VERSION,
  type jobQueueDefinitions,
  QUEUE_OPTION_DEFAULTS,
  renderJobStatements,
} from './queues.ts';

// What schema application asks the database to do, as data: the statements, in
// order, and the decisions taken between them. No driver, no connection, no
// I/O — src/jobs/install.ts sends these over node-postgres today, and #1927's
// stage 3 sends them as Effects over `@effect/sql-pg`.
//
// The split exists because those two drivers cannot be given the same thing.
// `@effect/sql-pg` has no simple-query path: every statement goes through
// Parse/Bind/Execute, which refuses a multi-command string. scripts/apply.ts
// and scripts/render-schema-ddl.ts are on the image build path and stay on
// node-postgres, which takes one. So each script is offered both ways and the
// driver picks.

/** A command sequence in both of the forms a driver may need. */
export type SqlScript = {
  /** The exact text node-postgres sends in one simple-query call. */
  readonly script: string;
  /** The same commands, one per entry, for a driver that takes one at a time. */
  readonly statements: readonly string[];
};

function sqlScript(script: string): SqlScript {
  return { script, statements: splitStatements(script) };
}

// Two statements rather than one guarded by `to_regclass`: a query naming a
// relation that does not exist is refused when it is parsed, long before the
// guard could decide not to read it.

/** Whether pg-boss's schema is there at all. */
export function installedProbe(schema: string): string {
  return `select to_regclass('${schema}.version') is not null as present`;
}

/** What version it says it is, once `installedProbe` has said it exists. */
export function versionQuery(schema: string): string {
  return `select version from ${schema}.version`;
}

/** How much queued work a replacement is about to discard. */
export function queuedCountQuery(schema: string): string {
  return `select count(*)::text from ${schema}.job`;
}

/** What the count stands in as when the query above could not be answered. */
export const UNKNOWN_JOB_COUNT = 'an unknown number of';

export function dropSchemaStatement(schema: string): string {
  return `drop schema ${schema} cascade`;
}

/**
 * pg-boss's construction plan, with its own transaction control removed.
 *
 * `getConstructionPlans` returns a SELF-CONTAINED script: `BEGIN`, its lock
 * and statement timeouts, the schema, then `COMMIT`. Run as-is on a client
 * that already has a transaction open, the `BEGIN` is a no-op with a warning
 * and the `COMMIT` commits the CALLER's transaction — silently. Everything the
 * caller applied before this point becomes durable and nothing after it can be
 * rolled back, which is precisely the guarantee `migrate` is built on
 * (src/db/migrate.ts).
 *
 * Both callers of `installJobSchema` hold a transaction open, so the wrapper
 * is always removed and nothing else is: `SET LOCAL` and the advisory lock are
 * exactly what one would write inside a transaction anyway, and both end with
 * it. One path rather than a flag a caller could forget to set.
 *
 * The shape is asserted rather than assumed, so a pg-boss release that changes
 * it fails here — loudly, once — instead of committing half an application
 * every time this runs.
 */
export function stripTransactionControl(plan: string): string {
  const trimmed = plan.trim();
  if (!trimmed.startsWith('BEGIN;') || !trimmed.endsWith('COMMIT;')) {
    throw new Error(
      "pg-boss's construction plan is no longer a BEGIN…COMMIT script, so the transaction control this strips cannot be found. Check what it wraps now: run inside a caller's transaction, a COMMIT in it commits that transaction.",
    );
  }
  return trimmed.slice('BEGIN;'.length, -'COMMIT;'.length);
}

export function constructionPlan(): SqlScript {
  return sqlScript(stripTransactionControl(renderJobStatements()[0]!));
}

export function grantScript(schema: string): SqlScript {
  return sqlScript(jobGrantsSql(schema));
}

export type InstallDecision = 'current' | 'install' | 'replace';

/**
 * What the two observations above add up to.
 *
 * A `null` version is the schema being there while saying nothing about its
 * version: an interrupted install, or a migration that emptied the table. It
 * is not the absent case — the tables and the enum are there, and re-running
 * the construction plan over them fails on `CREATE TYPE` (42710) — so it is
 * treated as the mismatch it is and the schema is replaced.
 *
 * Replacement rather than migration is the pre-release posture the schema
 * takes everywhere: drizzle-kit push reconciles the public schema in place and
 * Studio has no migration system yet, so pg-boss's migrations are not run
 * either. Dropping the schema discards whatever was queued, which is why the
 * count is logged — after release this becomes pg-boss's own migration call.
 */
export function installDecision(observed: {
  readonly present: boolean;
  readonly version: number | null;
}): InstallDecision {
  if (!observed.present) return 'install';
  return observed.version === JOB_SCHEMA_VERSION ? 'current' : 'replace';
}

export function replacementWarning(
  schema: string,
  version: number | null,
  queued: string,
): string {
  return `Replacing pg-boss schema ${schema} (version ${version ?? 'unknown'}) with version ${JOB_SCHEMA_VERSION}; ${queued} job(s) are discarded.`;
}

/**
 * The scripts to run once the decision is taken, in order.
 *
 * The grants are last and are there whatever the decision: they are re-run on
 * every apply, not only on install, because a grant change moves the schema
 * fingerprint — and reaching here means the fingerprint matched this build.
 */
export function installScripts(
  schema: string,
  decision: InstallDecision,
): readonly SqlScript[] {
  const grants = grantScript(schema);
  if (decision === 'current') return [grants];
  if (decision === 'install') return [constructionPlan(), grants];
  return [sqlScript(dropSchemaStatement(schema)), constructionPlan(), grants];
}

/** One queue as studio-sync declares it, in pg-boss's own option type. */
export type DeclaredJobQueueOptions = ReturnType<
  typeof jobQueueDefinitions
>[number]['options'];

/** One queue as pg-boss reports it installed. */
export type InstalledJobQueue = {
  readonly name: string;
} & DeclaredJobQueueOptions;

/** Every option `updateQueue` accepts, none of them left out. */
export type ReconciledJobQueueOptions = typeof QUEUE_OPTION_DEFAULTS;

export type QueueReconciliation =
  | { readonly kind: 'create'; readonly options: DeclaredJobQueueOptions }
  | { readonly kind: 'update'; readonly options: ReconciledJobQueueOptions }
  | { readonly kind: 'refuse'; readonly message: string };

/**
 * What to do with one declared queue, given what is installed. A queue's
 * options are data in its row, so this is the queue equivalent of drizzle-kit's
 * push: the installed row is made to equal the declaration rather than to
 * contain it.
 *
 * That equality is what `QUEUE_OPTION_DEFAULTS` is for. pg-boss's update
 * leaves an option it was not given alone, so an option dropped from a
 * declaration would otherwise keep the value the deployment before this one
 * applied — a queue quietly retrying seven times because it used to.
 *
 * pg-boss refuses a policy change outright: the policy decides which unique
 * indexes the queue's jobs are held under, so an existing job could not satisfy
 * the new one. `partition` is refused for the same reason and is declared
 * nowhere, so it is dropped rather than checked.
 */
export function reconcileQueue(
  name: string,
  declared: DeclaredJobQueueOptions,
  existing: InstalledJobQueue | null | undefined,
): QueueReconciliation {
  // pg-boss reports "not installed" as `null` today; a release that reports it
  // as `undefined` must take the create path too, not throw on `.policy`.
  if (existing === null || existing === undefined) {
    return { kind: 'create', options: declared };
  }
  const { policy = 'standard', partition: _partition, ...updatable } = declared;
  if (existing.policy !== policy) {
    return {
      kind: 'refuse',
      message: `queue ${name} is installed with policy ${existing.policy} and is now declared ${policy}; a policy cannot be changed after creation. Recreate the database: pnpm --filter @codaco/studio-server db:reset`,
    };
  }
  return {
    kind: 'update',
    options: { ...QUEUE_OPTION_DEFAULTS, ...updatable },
  };
}
