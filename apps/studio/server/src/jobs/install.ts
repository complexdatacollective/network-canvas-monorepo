import type pg from 'pg';
import { PgBoss } from 'pg-boss';

import { jobDatabaseFor } from './database.ts';
import { jobQueueDefinitions } from './queues.ts';
import {
  installDecision,
  installedProbe,
  installScripts,
  queuedCountQuery,
  reconcileQueue,
  replacementWarning,
  UNKNOWN_JOB_COUNT,
  versionQuery,
} from './statements.ts';

// Installing pg-boss's half of the schema, and reconciling the declared
// queues. Two callers apply the schema and both have to do this identically:
// `scripts/apply-schema` from a repository checkout (through scripts/apply.ts,
// which pushes the public schema with drizzle-kit) and `studio-api migrate`
// inside the image (through src/db/migrate.ts, which executes the DDL the
// build rendered). It lives in src/ because migrate is bundled and drizzle-kit
// must never reach the bundle — nothing here imports it.
//
// What to send is decided in src/jobs/statements.ts, which knows no driver;
// this is the node-postgres half of that seam. Each script goes out as its own
// `script` in one `db.query` call, exactly as it always has — the split
// `statements` beside it are for stage 3's `@effect/sql-pg` path, which cannot
// take a multi-command string. That the bytes are unchanged is not asserted
// here but in src/jobs/__tests__/install-statements.test.ts, which records what
// a real client was asked to run.

/**
 * Installs pg-boss's own schema, or replaces it when the installed version is
 * not the one this build ships.
 *
 * **Call inside a transaction.** The construction plan's own is removed
 * (src/jobs/statements.ts), so a caller that is not in one applies it statement
 * by statement and a failure part-way leaves half a schema.
 */
export async function installJobSchema(
  db: pg.PoolClient,
  schema: string,
): Promise<void> {
  const installed = await db.query<{ present: boolean }>(
    installedProbe(schema),
  );
  const present = installed.rows[0]?.present === true;
  const version = present
    ? ((await db.query<{ version: number }>(versionQuery(schema))).rows[0]
        ?.version ?? null)
    : null;

  const decision = installDecision({ present, version });
  if (decision === 'replace') {
    const queued = await db
      .query<{ count: string }>(queuedCountQuery(schema))
      .then((result) => result.rows[0]?.count ?? UNKNOWN_JOB_COUNT)
      // A shape this build cannot read is exactly the case the drop exists
      // for; not being able to count it is not a reason to refuse.
      .catch(() => UNKNOWN_JOB_COUNT);
    console.warn(replacementWarning(schema, version, queued));
  }

  for (const { script } of installScripts(schema, decision)) {
    await db.query(script);
  }
}

/**
 * Brings every declared queue into being, or up to date, through pg-boss's own
 * create and update calls — a queue is a row it owns, so what to write is
 * decided by `reconcileQueue` and pg-boss still does the writing.
 *
 * A `PoolClient` and not a `Pool`, so every statement pg-boss runs here lands
 * on the caller's session — and inside its transaction where it has one.
 * `migrate` wraps the whole application in one (src/db/migrate.ts), and a
 * reconciliation that had taken a connection of its own would commit queue
 * rows that a later failure could not take back, leaving a database with
 * queues and no tables that the next run would refuse as stale.
 */
export async function syncJobQueues(
  client: pg.PoolClient,
  schema: string,
): Promise<void> {
  const boss = new PgBoss({
    db: jobDatabaseFor(client),
    schema,
    migrate: false,
    supervise: false,
    schedule: false,
  });
  boss.on('error', (error) => {
    console.error('pg-boss error while reconciling queues:', error);
  });
  await boss.start();
  try {
    for (const { name, options } of jobQueueDefinitions()) {
      const reconciliation = reconcileQueue(
        name,
        options,
        await boss.getQueue(name),
      );
      if (reconciliation.kind === 'refuse') {
        throw new Error(reconciliation.message);
      }
      if (reconciliation.kind === 'create') {
        await boss.createQueue(name, reconciliation.options);
        continue;
      }
      await boss.updateQueue(name, reconciliation.options);
    }
  } finally {
    await boss.stop({ graceful: false });
  }
}
