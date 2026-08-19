import { randomUUID } from 'node:crypto';

import {
  generateDrizzleJson,
  generateMigration,
} from 'drizzle-kit/api-postgres';
import pg from 'pg';

import type { SectionDoc } from '../apply.ts';
import {
  commandLog,
  drafts,
  leases,
  manifests,
  sections as sectionsTable,
  SYNC_SIDECAR_SQL,
} from '../schema.ts';
import { SyncServer } from '../server.ts';
import { CI, PGPORT } from './test-env.ts';

/**
 * A scratch database carrying the sync schema. Connects as the postgres
 * superuser to a disposable instance — never point it at a real one. It lives
 * here rather than beside the schema because ../schema.ts is on the Studio
 * server's production boot path.
 */
async function createSyncDatabase(port: number, name: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`unsafe scratch database name: ${name}`);
  }
  const admin = new pg.Client({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: 'spike',
    database: 'postgres',
  });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const db = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    password: 'spike',
    database: name,
    max: 20,
  });
  const statements = await generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson({
      drafts,
      sections: sectionsTable,
      manifests,
      leases,
      commandLog,
    }),
  );
  await db.query([...statements, SYNC_SIDECAR_SQL].join('\n'));
  return db;
}

/**
 * Whether a Postgres is reachable for the DB-backed conformance suites. The
 * pure suites (apply-engine properties, golden canonicalization) always run;
 * everything touching real transactions skips without one.
 */
export const dbAvailable = await (async () => {
  const probe = new pg.Client({
    host: '127.0.0.1',
    port: PGPORT,
    user: 'postgres',
    password: 'spike',
    database: 'postgres',
    connectionTimeoutMillis: 1_500,
  });
  try {
    await probe.connect();
    await probe.end();
    return true;
  } catch (err) {
    if (CI) {
      throw new Error(
        `the sync conformance suites cannot run: 127.0.0.1:${PGPORT} is unreachable (${String(err)})`,
        { cause: err },
      );
    }
    console.warn(
      `[studio-sync] Postgres not reachable on 127.0.0.1:${PGPORT} — skipping the DB-backed conformance suites. ` +
        `Start one with: docker run -d -e POSTGRES_PASSWORD=spike -p ${PGPORT}:5432 postgres:18`,
    );
    return false;
  }
})();

export async function makeServer(dbName: string, ttlMs?: number) {
  const db = await createSyncDatabase(PGPORT, dbName);
  const server = new SyncServer(db, ttlMs);
  return { db, server };
}

export const DEFAULT_SECTIONS: Record<string, SectionDoc> = {
  'stage-1': { type: 'NameGenerator', label: 'People', prompts: [] },
  'stage-2': { type: 'Sociogram', label: 'Support', prompts: [] },
  'codebook-person': { name: 'Person', variables: {} },
};

export async function makeDraft(
  server: SyncServer,
  sections: Record<string, SectionDoc> = DEFAULT_SECTIONS,
) {
  const draftId = randomUUID();
  await server.createDraft(draftId, sections);
  return draftId;
}

/**
 * Wait until some backend in this database is blocked on a lock — the signal
 * that a transaction under test has reached its `FOR UPDATE` and is queueing
 * behind another one.
 */
export async function waitForLockWait(db: pg.Pool): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await db.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((res.rows[0] as { waiting: number }).waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('no backend ever blocked on a lock');
}

export async function assertLinearChain(
  server: SyncServer,
  draftId: string,
): Promise<number> {
  const chain = await server.manifestChain(draftId);
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    if (entry === undefined) throw new Error('sparse chain');
    if (Number(entry.seq) !== i) {
      throw new Error(`non-contiguous seq at ${i}: ${entry.seq}`);
    }
    if (i > 0 && entry.parent_hash !== chain[i - 1]?.hash) {
      throw new Error(`fork at seq ${entry.seq}: parent does not match`);
    }
  }
  return chain.length;
}
