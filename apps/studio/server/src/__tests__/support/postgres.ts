import { randomUUID } from 'node:crypto';

import { Effect, Layer } from 'effect';
import pg from 'pg';

import type { JobQueueName } from '@codaco/studio-sync/jobs';
import { TENANT_ROLES_SQL } from '@codaco/studio-sync/rls';

import { Database } from '../../db/client.ts';
import { createOwnerPool } from '../../db/pool.ts';
import { UntenantedScope } from '../../db/tenant.ts';
import { type DbEnv, isLocalDatabase, readEnv } from '../../env.ts';
import { Jobs } from '../../jobs/jobs.ts';
import { JOB_SCHEMA, type JobPayload } from '../../jobs/queues.ts';
import { CI } from './env.ts';

const PROBE_TIMEOUT_MS = 3000;

function unavailable(reason: string): null {
  if (CI) throw new Error(`the Studio database suites cannot run: ${reason}`);
  return null;
}

export async function reachableDb(): Promise<DbEnv | null> {
  const { db } = readEnv();
  // Local only, the same refusal scripts/db-reset.ts makes: these suites run
  // garbage collection's unqualified DELETEs.
  if (!db) return unavailable('DATABASE_URL is not set');
  if (!isLocalDatabase(db.url)) {
    return unavailable(`${db.url} is not a local database`);
  }
  const pool = createOwnerPool(db);
  let timer: NodeJS.Timeout | undefined;
  try {
    // The application pools pin roles the schema apply creates; provisioning
    // them here means no suite depends on another having run first.
    const probe = pool.query(TENANT_ROLES_SQL);
    // When the timeout wins the race, this query is still in flight and
    // `pool.end()` below rejects it. Promise.race has already settled by then,
    // so nothing is listening — and an unhandled rejection fails the run.
    probe.catch(() => undefined);
    await Promise.race([
      probe,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('probe timeout')),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    return db;
  } catch (err) {
    return unavailable(`${db.url} is unreachable (${String(err)})`);
  } finally {
    // Otherwise the timer keeps the suite alive for the rest of its window.
    clearTimeout(timer);
    await pool.end();
  }
}

export async function seedTeam(db: pg.Pool, teamId: string): Promise<void> {
  await db.query(
    `INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [teamId],
  );
}

/** Needs CREATEDB; a crashed run's leftovers are swept by db-reset. */
export async function createScratchDatabase(
  db: DbEnv,
): Promise<{ db: DbEnv; pool: pg.Pool; dispose: () => Promise<void> }> {
  const name = `studio_test_db_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  const admin = createOwnerPool(db);
  try {
    await admin.query(`create database ${pg.escapeIdentifier(name)}`);
  } finally {
    await admin.end();
  }

  const url = new URL(db.url);
  url.pathname = `/${name}`;
  const scratchDb = { url: url.toString() };
  const pool = createOwnerPool(scratchDb);

  return {
    db: scratchDb,
    pool,
    dispose: async () => {
      await pool.end();
      const cleanup = createOwnerPool(db);
      try {
        await cleanup.query(
          `drop database if exists ${pg.escapeIdentifier(name)} with (force)`,
        );
      } finally {
        await cleanup.end();
      }
    },
  };
}

/**
 * One job created the way the web process creates one: `Jobs.enqueue` inside a
 * transaction on the **application** client.
 *
 * The role is the point. It proves the queue's grants survived — or were
 * re-applied after — whatever an apply did to the schema, which the owner pool
 * cannot answer for, being a superuser here. A client per call rather than a
 * shared one, because the callers each name a different database and each
 * makes exactly one job.
 */
export async function enqueueAsApplication<Queue extends JobQueueName>(
  db: DbEnv,
  queue: Queue,
  payload: JobPayload<Queue>,
  options: { schema?: string } = {},
): Promise<string> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(Jobs, (jobs) =>
        UntenantedScope.open(jobs.enqueue(queue, payload)),
      ).pipe(
        Effect.orDie,
        Effect.provide(
          Jobs.layer({ schema: options.schema ?? JOB_SCHEMA }).pipe(
            Layer.provideMerge(
              Layer.orDie(
                Database.layer({
                  url: db.url,
                  maxConnections: 2,
                  applicationName: 'studio-test-enqueue',
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
