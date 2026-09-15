import type pg from 'pg';
import { PgBoss } from 'pg-boss';

import { jobGrantsSql } from '@codaco/studio-sync/jobs';

import { jobDatabaseForPool } from './database.ts';
import {
  JOB_SCHEMA_VERSION,
  jobQueueDefinitions,
  QUEUE_OPTION_DEFAULTS,
  renderJobStatements,
} from './queues.ts';

// Installing pg-boss's half of the schema, and reconciling the declared
// queues. Two callers apply the schema and both have to do this identically:
// `scripts/apply-schema` from a repository checkout (through scripts/apply.ts,
// which pushes the public schema with drizzle-kit) and `studio-api migrate`
// inside the image (through src/db/migrate.ts, which executes the DDL the
// build rendered). It lives in src/ because migrate is bundled and drizzle-kit
// must never reach the bundle — nothing here imports it.

/**
 * Installs pg-boss's own schema, or replaces it when the installed version is
 * not the one this build ships.
 *
 * Replacement rather than migration is the pre-release posture the schema
 * takes everywhere: drizzle-kit push reconciles the public schema in place and
 * Studio has no migration system yet, so pg-boss's migrations are not run
 * either. Dropping the schema discards whatever was queued, which is why the
 * count is logged — after release this becomes pg-boss's own migration call.
 */
export async function installJobSchema(
  db: pg.Pool | pg.PoolClient,
  schema: string,
): Promise<void> {
  // Two statements rather than one guarded by `to_regclass`: a query naming a
  // relation that does not exist is refused when it is parsed, long before the
  // guard could decide not to read it.
  const installed = await db.query<{ present: boolean }>(
    `select to_regclass('${schema}.version') is not null as present`,
  );
  const present = installed.rows[0]?.present === true;
  // `null` where the schema is there but says nothing about its version: an
  // interrupted install, or a migration that emptied the table. It is not the
  // absent case — the tables and the enum are there, and re-running the
  // construction plan over them fails on `CREATE TYPE` (42710) — so it is
  // treated as the mismatch it is and the schema is replaced.
  const version = present
    ? ((
        await db.query<{ version: number }>(
          `select version from ${schema}.version`,
        )
      ).rows[0]?.version ?? null)
    : null;

  if (!present || version !== JOB_SCHEMA_VERSION) {
    if (present) {
      const queued = await db
        .query<{ count: string }>(`select count(*)::text from ${schema}.job`)
        .then((result) => result.rows[0]?.count ?? 'an unknown number of')
        // A shape this build cannot read is exactly the case the drop exists
        // for; not being able to count it is not a reason to refuse.
        .catch(() => 'an unknown number of');
      console.warn(
        `Replacing pg-boss schema ${schema} (version ${version ?? 'unknown'}) with version ${JOB_SCHEMA_VERSION}; ${queued} job(s) are discarded.`,
      );
      await db.query(`drop schema ${schema} cascade`);
    }
    await db.query(renderJobStatements()[0]!);
  }

  // Re-run on every apply, not only on install: a grant change moves the
  // fingerprint, and reaching here means the fingerprint matched this build.
  await db.query(jobGrantsSql(schema));
}

/**
 * Brings every declared queue into being, or up to date. A queue's options are
 * data in its row, so this is the queue equivalent of drizzle-kit's push: the
 * installed row is made to equal the declaration rather than to contain it.
 *
 * That equality is what `QUEUE_OPTION_DEFAULTS` is for. pg-boss's update
 * leaves an option it was not given alone, so an option dropped from a
 * declaration would otherwise keep the value the deployment before this one
 * applied — a queue quietly retrying seven times because it used to.
 */
export async function syncJobQueues(
  pool: pg.Pool,
  schema: string,
): Promise<void> {
  const boss = new PgBoss({
    db: jobDatabaseForPool(pool),
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
      const existing = await boss.getQueue(name);
      if (!existing) {
        await boss.createQueue(name, options);
        continue;
      }
      // pg-boss refuses a policy change outright: the policy decides which
      // unique indexes the queue's jobs are held under, so an existing job
      // could not satisfy the new one. `partition` is refused for the same
      // reason and is declared nowhere, so it is dropped rather than checked.
      const {
        policy = 'standard',
        partition: _partition,
        ...declared
      } = options;
      if (existing.policy !== policy) {
        throw new Error(
          `queue ${name} is installed with policy ${existing.policy} and is now declared ${policy}; a policy cannot be changed after creation. Recreate the database: pnpm --filter @codaco/studio-server db:reset`,
        );
      }
      await boss.updateQueue(name, { ...QUEUE_OPTION_DEFAULTS, ...declared });
    }
  } finally {
    await boss.stop({ graceful: false });
  }
}
