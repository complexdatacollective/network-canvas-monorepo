import type pg from 'pg';

import {
  type SectionDoc,
  contentHash,
  manifestHash,
} from '@codaco/studio-sync/apply';

export async function insertDraftRows(
  client: pg.PoolClient,
  workspaceId: string,
  draftId: string,
  sections: Record<string, SectionDoc>,
): Promise<void> {
  const sectionHashes: Record<string, string> = {};
  for (const [id, doc] of Object.entries(sections)) {
    const hash = contentHash(doc);
    sectionHashes[id] = hash;
    await client.query(
      `INSERT INTO sections (workspace_id, hash, doc) VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, hash) DO UPDATE
       SET created_at = clock_timestamp(), unreferenced_at = NULL`,
      [workspaceId, hash, doc],
    );
  }
  const mHash = manifestHash(sectionHashes, null);
  await client.query(
    `INSERT INTO drafts (id, workspace_id, head_seq, head_manifest_hash)
     VALUES ($1, $2, 0, $3)`,
    [draftId, workspaceId, mHash],
  );
  await client.query(
    `INSERT INTO manifests (draft_id, workspace_id, seq, hash, parent_hash, section_hashes)
     VALUES ($1, $2, 0, $3, NULL, $4)`,
    [draftId, workspaceId, mHash, sectionHashes],
  );
}
