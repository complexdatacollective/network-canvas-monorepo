import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { SectionDoc } from '../src/apply.ts';
import { createSyncDatabase } from '../src/schema.ts';
import { SyncServer } from '../src/server.ts';

export const PGPORT = Number(process.env.PGPORT ?? 54318);

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

export async function closePool(db: pg.Pool) {
  await db.end();
}
