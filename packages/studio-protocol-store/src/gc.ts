// Garbage collection (#1276): "pruning is garbage collection of manifests
// and sections unreferenced by versions or the retained draft window."
// Version-pinned sections are FK-protected regardless — the predicate here
// only decides what is ELIGIBLE; the schema guarantees pins survive.
//
// The grace window closes a race: a concurrent createDraft/commit can
// re-adopt an existing section row via ON CONFLICT DO NOTHING and then
// reference it from a new manifest; sweeping only rows older than the window
// keeps such freshly re-adopted rows out of reach. Scheduling is the
// caller's concern — this is a plain callable.
import type pg from 'pg';

export type GcResult = {
  manifestsDeleted: number;
  sectionsDeleted: number;
  commandLogDeleted: number;
};

export async function gcProtocolStore(
  db: pg.Pool,
  opts: { retainManifestsPerDraft: number; sectionGraceMs: number },
): Promise<GcResult> {
  const { retainManifestsPerDraft, sectionGraceMs } = opts;
  if (retainManifestsPerDraft < 0) {
    throw new Error('retainManifestsPerDraft must be >= 0');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const commandLog = await client.query(
      `DELETE FROM command_log cl
       USING drafts d
       WHERE cl.draft_id = d.id
         AND cl.manifest_seq < d.head_seq - $1`,
      [retainManifestsPerDraft],
    );
    const manifests = await client.query(
      `DELETE FROM manifests m
       USING drafts d
       WHERE m.draft_id = d.id
         AND m.seq < d.head_seq - $1`,
      [retainManifestsPerDraft],
    );
    const sections = await client.query(
      `DELETE FROM sections s
       WHERE s.created_at < now() - make_interval(secs => $1::float / 1000)
         AND NOT EXISTS (
           SELECT 1 FROM version_sections vs WHERE vs.section_hash = s.hash
         )
         AND NOT EXISTS (
           SELECT 1 FROM manifests m
           CROSS JOIN LATERAL jsonb_each_text(m.section_hashes) kv
           WHERE kv.value = s.hash
         )`,
      [sectionGraceMs],
    );

    await client.query('COMMIT');
    return {
      manifestsDeleted: manifests.rowCount ?? 0,
      sectionsDeleted: sections.rowCount ?? 0,
      commandLogDeleted: commandLog.rowCount ?? 0,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
