import { randomUUID } from 'node:crypto';

import pg from 'pg';

import type { SectionDoc } from '../apply.ts';
import { createSyncDatabase } from '../schema.ts';
import { SyncServer } from '../server.ts';
import { PGPORT } from './test-env.ts';

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
  } catch {
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
