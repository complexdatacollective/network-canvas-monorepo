// Internal (not exported from the package): the three inserts that establish
// a draft — the same statements as SyncServer.createDraft, but composable
// into a caller's transaction so protocol rows and draft rows land
// atomically.
import type pg from 'pg';

import {
  type SectionDoc,
  contentHash,
  manifestHash,
} from '@codaco/studio-sync/apply';

export async function insertDraftRows(
  client: pg.PoolClient,
  draftId: string,
  sections: Record<string, SectionDoc>,
): Promise<void> {
  const sectionHashes: Record<string, string> = {};
  for (const [id, doc] of Object.entries(sections)) {
    const hash = contentHash(doc);
    sectionHashes[id] = hash;
    await client.query(
      `INSERT INTO sections (hash, doc) VALUES ($1, $2)
       ON CONFLICT (hash) DO UPDATE SET created_at = now()`,
      [hash, doc],
    );
  }
  const mHash = manifestHash(sectionHashes, null);
  await client.query(
    `INSERT INTO drafts (id, head_seq, head_manifest_hash) VALUES ($1, 0, $2)`,
    [draftId, mHash],
  );
  await client.query(
    `INSERT INTO manifests (draft_id, seq, hash, parent_hash, section_hashes)
     VALUES ($1, 0, $2, NULL, $3)`,
    [draftId, mHash, sectionHashes],
  );
}
