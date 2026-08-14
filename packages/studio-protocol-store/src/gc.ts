// Garbage collection (#1276): "pruning is garbage collection of manifests
// and sections unreferenced by versions or the retained draft window."
// Version-pinned sections are FK-protected regardless — the predicates here
// only decide what is ELIGIBLE; the schema guarantees pins survive.
//
// Command-log rows are the write path's idempotency records: a retransmitted
// client_seq must keep finding its recorded result for as long as
// retransmission is possible, or a lost acknowledgement turns into a double
// apply (or a spurious rejection the client rolls back from). A row is
// therefore prunable only when it is below the retained manifest window AND
// its (owner, epoch) lease is no longer live AND the client-retry horizon
// has passed. Manifests referenced by surviving command-log rows are kept,
// because the dedup replay path reads them.
//
// The section grace window closes a race with concurrent writers. Every
// section write is an upsert that refreshes created_at on conflict (see the
// sections DDL in @codaco/studio-sync/schema): re-adopting an existing row
// restarts the window AND takes a row lock, so a GC DELETE that blocks
// behind it re-checks the refreshed timestamp and keeps the row — while a
// writer that blocks behind GC's delete simply re-inserts the row after GC
// commits. Scheduling is the caller's concern — this is a plain callable.
import type pg from 'pg';

export type GcResult = {
  manifestsDeleted: number;
  sectionsDeleted: number;
  commandLogDeleted: number;
};

export type GcOptions = {
  /** Manifests kept per draft below the head (the retained draft window). */
  retainManifestsPerDraft: number;
  /** Minimum age before an unreferenced section document is swept. */
  sectionGraceMs: number;
  /** How long a client may still retransmit a lost-acknowledgement commit;
   * command-log rows (and the manifests they reference) survive at least
   * this long. */
  commandRetryHorizonMs: number;
};

function assertNonNegativeFinite(name: string, value: number) {
  // A negative or non-finite bound would move a cutoff into the future and
  // widen deletion to everything eligible regardless of age.
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number`);
  }
}

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
  assertNonNegativeFinite('commandRetryHorizonMs', commandRetryHorizonMs);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const commandLog = await client.query(
      `DELETE FROM command_log cl
       USING drafts d
       WHERE cl.draft_id = d.id
         AND cl.manifest_seq < d.head_seq - $1
         AND cl.created_at < now() - make_interval(secs => $2::float / 1000)
         AND NOT EXISTS (
           SELECT 1 FROM leases l
           WHERE l.draft_id = cl.draft_id
             AND l.section_id = cl.section_id
             AND l.owner = cl.owner
             AND l.epoch = cl.epoch
             AND l.expires_at > clock_timestamp()
         )`,
      [retainManifestsPerDraft, commandRetryHorizonMs],
    );
    const manifests = await client.query(
      `DELETE FROM manifests m
       USING drafts d
       WHERE m.draft_id = d.id
         AND m.seq < d.head_seq - $1
         AND NOT EXISTS (
           SELECT 1 FROM command_log cl
           WHERE cl.draft_id = m.draft_id AND cl.manifest_seq = m.seq
         )`,
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
