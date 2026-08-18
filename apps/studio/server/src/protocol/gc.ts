import type pg from 'pg';

import { inTransaction } from './transaction.ts';

export type GcResult = {
  manifestsDeleted: number;
  sectionsDeleted: number;
  commandLogDeleted: number;
};

export type GcOptions = {
  /** Manifests kept per draft below the head. */
  retainManifestsPerDraft: number;
  /** Minimum age before an unreferenced section document is swept. */
  sectionGraceMs: number;
  /** How long a client may still retransmit a lost-acknowledgement commit. */
  commandRetryHorizonMs: number;
};

// A negative or non-finite bound would move a cutoff into the future, widening
// deletion to everything eligible regardless of age.
function assertNonNegativeFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number`);
  }
}

// Version-pinned sections are FK-protected regardless; these predicates only
// decide what is eligible. A command-log row survives while its (owner, epoch)
// lease is live and until the retry horizon passes, because a retransmitted
// client_seq must keep finding its recorded result — as must the manifest that
// result names. The section grace window closes the race with a concurrent
// writer adopting an existing row: every section write refreshes created_at on
// conflict and takes a row lock, so a blocked GC delete re-checks it.
export async function gcProtocolStore(
  db: pg.Pool,
  opts: GcOptions,
): Promise<GcResult> {
  const { retainManifestsPerDraft, sectionGraceMs, commandRetryHorizonMs } =
    opts;
  if (
    !Number.isInteger(retainManifestsPerDraft) ||
    retainManifestsPerDraft < 0
  ) {
    throw new Error('retainManifestsPerDraft must be a non-negative integer');
  }
  assertNonNegativeFinite('sectionGraceMs', sectionGraceMs);
  if (sectionGraceMs === 0) {
    throw new Error('sectionGraceMs must be greater than zero');
  }
  assertNonNegativeFinite('commandRetryHorizonMs', commandRetryHorizonMs);

  const result: GcResult = {
    manifestsDeleted: 0,
    sectionsDeleted: 0,
    commandLogDeleted: 0,
  };

  const drafts = await db.query(`SELECT id FROM drafts ORDER BY id`);
  for (const { id: draftId } of drafts.rows as { id: string }[]) {
    await inTransaction(db, async (client) => {
      const head = await client.query(
        `SELECT head_seq FROM drafts WHERE id = $1 FOR UPDATE`,
        [draftId],
      );
      const headRow = head.rows[0] as { head_seq: string } | undefined;
      if (headRow === undefined) return;
      const oldest = String(
        BigInt(headRow.head_seq) - BigInt(retainManifestsPerDraft),
      );

      const commandLog = await client.query(
        `DELETE FROM command_log cl
         WHERE cl.draft_id = $1
           AND cl.manifest_seq < $2::bigint
           AND cl.created_at < now() - make_interval(secs => $3::float / 1000)
           AND NOT EXISTS (
             SELECT 1 FROM leases l
             WHERE l.draft_id = cl.draft_id
               AND l.section_id = cl.section_id
               AND l.owner = cl.owner
               AND l.epoch = cl.epoch
               AND l.expires_at > clock_timestamp()
           )`,
        [draftId, oldest, commandRetryHorizonMs],
      );
      const manifests = await client.query(
        `DELETE FROM manifests m
         WHERE m.draft_id = $1
           AND m.seq < $2::bigint
           AND NOT EXISTS (
             SELECT 1 FROM command_log cl
             WHERE cl.draft_id = m.draft_id AND cl.manifest_seq = m.seq
           )`,
        [draftId, oldest],
      );
      result.commandLogDeleted += commandLog.rowCount ?? 0;
      result.manifestsDeleted += manifests.rowCount ?? 0;
    });
  }

  const sections = await db.query(
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
  result.sectionsDeleted = sections.rowCount ?? 0;

  return result;
}
