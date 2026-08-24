import type pg from 'pg';

import {
  type SectionDoc,
  contentHash,
  manifestHash,
} from '@codaco/studio-sync/apply';

export async function insertDraftRows(
  client: pg.PoolClient,
  teamId: string,
  draftId: string,
  sections: Record<string, SectionDoc>,
): Promise<void> {
  const sectionHashes: Record<string, string> = {};
  for (const [id, doc] of Object.entries(sections)) {
    const hash = contentHash(doc);
    sectionHashes[id] = hash;
    await client.query(
      `INSERT INTO sections (team_id, hash, doc) VALUES ($1, $2, $3)
       ON CONFLICT (team_id, hash) DO UPDATE
       SET created_at = clock_timestamp(), unreferenced_at = NULL`,
      [teamId, hash, doc],
    );
  }
  const mHash = manifestHash(sectionHashes, null);
  await client.query(
    `INSERT INTO drafts (id, team_id, head_seq, head_manifest_hash)
     VALUES ($1, $2, 0, $3)`,
    [draftId, teamId, mHash],
  );
  await client.query(
    `INSERT INTO manifests (draft_id, team_id, seq, hash, parent_hash, section_hashes)
     VALUES ($1, $2, 0, $3, NULL, $4)`,
    [draftId, teamId, mHash, sectionHashes],
  );
}
