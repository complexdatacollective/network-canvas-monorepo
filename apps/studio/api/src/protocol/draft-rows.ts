import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import {
  type SectionDoc,
  contentHash,
  manifestHash,
} from '@codaco/studio-sync/apply';
import { SYNC_TABLES } from '@codaco/studio-sync/schema';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';

const { drafts, manifests, sections } = SYNC_TABLES;

/**
 * One statement per document rather than a multi-row upsert: two sections may
 * hold the same document, the same row twice under `ON CONFLICT DO UPDATE`
 * (21000).
 */
export const insertDraftRows: (
  teamId: string,
  draftId: string,
  sections: Record<string, SectionDoc>,
  createdAt?: Date,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'protocol.store.insertDraftRows',
)(function* (
  teamId: string,
  draftId: string,
  sectionDocs: Record<string, SectionDoc>,
  createdAt?: Date,
) {
  const { tx } = yield* Transaction;
  // `clock_timestamp()`: expiry comparisons against these rows are wall-clock,
  // not transaction time.
  const written = createdAt ?? sql`clock_timestamp()`;
  const sectionHashes: Record<string, string> = {};
  for (const [id, doc] of Object.entries(sectionDocs)) {
    const hash = contentHash(doc);
    sectionHashes[id] = hash;
    // `.returning()`: without it the builder answers with the driver's result
    // object, typed as a row array and not one.
    const sectionRows = yield* tx
      .insert(sections)
      .values({ teamId, hash, doc, createdAt: written })
      .onConflictDoUpdate({
        target: [sections.teamId, sections.hash],
        set: { createdAt: written, unreferencedAt: null },
      })
      .returning({ hash: sections.hash });
    if (sectionRows.length === 0) {
      return yield* Effect.die(new Error(`section ${hash} wrote no row`));
    }
  }
  const mHash = manifestHash(sectionHashes, null);
  const draftRows = yield* tx
    .insert(drafts)
    .values({ id: draftId, teamId, headSeq: 0n, headManifestHash: mHash })
    .returning({ id: drafts.id });
  if (draftRows.length === 0) {
    return yield* Effect.die(new Error(`draft ${draftId} wrote no row`));
  }
  const manifestRows = yield* tx
    .insert(manifests)
    .values({
      draftId,
      teamId,
      seq: 0n,
      hash: mHash,
      parentHash: null,
      sectionHashes,
    })
    .returning({ seq: manifests.seq });
  if (manifestRows.length === 0) {
    return yield* Effect.die(
      new Error(`draft ${draftId} wrote no manifest at seq 0`),
    );
  }
}, sqlErrorsOnly);
