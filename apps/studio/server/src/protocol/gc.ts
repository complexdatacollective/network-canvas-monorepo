import type pg from 'pg';

import { createTenantDb } from '@codaco/studio-sync/tenant';

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
// result names.
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

  const referenced = `EXISTS (
      SELECT 1 FROM version_sections vs
      WHERE vs.team_id = s.team_id AND vs.section_hash = s.hash
    )
    OR EXISTS (
      SELECT 1 FROM manifests m
      CROSS JOIN LATERAL jsonb_each_text(m.section_hashes) kv
      WHERE m.team_id = s.team_id AND kv.value = s.hash
    )`;

  // The one deliberately cross-team read: maintenance visits every tenant.
  // Enumerated from the swept tables rather than from `teams`, because
  // team_id carries no foreign key into it (studio-sync/src/schema.ts): a
  // tenant whose team row never existed or has since been deleted still owns
  // collectable rows, and driving the loop from `teams` would strand them
  // forever. Not a membership lookup, so the AuthService seam stays intact; a
  // BYPASSRLS maintenance role replaces this direct scan when row-level
  // security lands (#1249).
  const tenants = await db.query(
    `SELECT team_id FROM drafts
     UNION
     SELECT team_id FROM sections
     ORDER BY team_id`,
  );
  for (const { team_id: teamId } of tenants.rows as { team_id: string }[]) {
    const tenant = createTenantDb(db, teamId);

    const drafts = await tenant.query(
      `SELECT id FROM drafts WHERE team_id = $1 ORDER BY id`,
      [teamId],
    );
    for (const { id: draftId } of drafts.rows as { id: string }[]) {
      await tenant.transaction(async (client) => {
        const head = await client.query(
          `SELECT head_seq FROM drafts WHERE id = $1 AND team_id = $2 FOR UPDATE`,
          [draftId, teamId],
        );
        const headRow = head.rows[0] as { head_seq: string } | undefined;
        if (headRow === undefined) return;
        const oldest = String(
          BigInt(headRow.head_seq) - BigInt(retainManifestsPerDraft),
        );

        const commandLog = await client.query(
          `DELETE FROM command_log cl
           WHERE cl.draft_id = $1
             AND cl.team_id = $4
             AND cl.manifest_seq < $2::bigint
             AND cl.created_at < now() - make_interval(secs => $3::float / 1000)
             AND NOT EXISTS (
               SELECT 1 FROM leases l
               WHERE l.draft_id = cl.draft_id
                 AND l.team_id = cl.team_id
                 AND l.section_id = cl.section_id
                 AND l.owner = cl.owner
                 AND l.epoch = cl.epoch
                 AND l.expires_at > clock_timestamp()
             )`,
          [draftId, oldest, commandRetryHorizonMs, teamId],
        );
        const manifests = await client.query(
          `DELETE FROM manifests m
           WHERE m.draft_id = $1
             AND m.team_id = $3
             AND m.seq < $2::bigint
             AND NOT EXISTS (
               SELECT 1 FROM command_log cl
               WHERE cl.draft_id = m.draft_id
                 AND cl.team_id = m.team_id
                 AND cl.manifest_seq = m.seq
             )`,
          [draftId, oldest, teamId],
        );
        result.commandLogDeleted += commandLog.rowCount ?? 0;
        result.manifestsDeleted += manifests.rowCount ?? 0;
      });
    }

    await tenant.query(
      `UPDATE sections s SET unreferenced_at = NULL
       WHERE s.team_id = $1 AND s.unreferenced_at IS NOT NULL
         AND (${referenced})`,
      [teamId],
    );
    await tenant.query(
      `UPDATE sections s SET unreferenced_at = clock_timestamp()
       WHERE s.team_id = $1 AND s.unreferenced_at IS NULL
         AND NOT (${referenced})`,
      [teamId],
    );
    const sections = await tenant.query(
      `DELETE FROM sections s
       WHERE s.team_id = $2
         AND s.unreferenced_at < now() - make_interval(secs => $1::float / 1000)
         AND NOT (${referenced})`,
      [sectionGraceMs, teamId],
    );
    result.sectionsDeleted += sections.rowCount ?? 0;
  }

  return result;
}
