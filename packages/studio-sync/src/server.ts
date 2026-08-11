// Server half of the walking skeleton: the lease state machine (every
// transition a single atomic conditional statement), the Replicache-style
// idempotent commit path with per-draft serialization, and manifest-hash
// resume — exactly as specified on #1247.
import type pg from 'pg';

import {
  applyCommands,
  type Command,
  contentHash,
  manifestHash,
  type SectionDoc,
} from './apply.ts';

export class LeaseRejectedError extends Error {
  constructor(reason: string) {
    super(`commit rejected: ${reason}`);
  }
}

/** A lease was requested for a draft or section that does not exist. */
export class UnknownSectionError extends Error {
  constructor(draftId: string, sectionId: string) {
    super(`no section ${sectionId} in draft ${draftId}`);
  }
}

// Lease lifetimes are wall-clock, so every expiry comparison below uses
// clock_timestamp() rather than now(): now() is the transaction's start time,
// and a transaction that waits on a row lock past the TTL would otherwise read
// an expired lease as live.

/** A section is real only if the draft's head manifest lists it. */
const SECTION_EXISTS = `SELECT 1 FROM drafts d
   JOIN manifests m ON m.draft_id = d.id AND m.seq = d.head_seq
   WHERE d.id = $1 AND m.section_hashes ->> $2 IS NOT NULL`;

export type Lease = { epoch: bigint; expiresAt: Date };

export type CommitResult = {
  deduped: boolean;
  manifestSeq: bigint;
  manifestHash: string;
  sectionHash: string;
};

export class SyncServer {
  private db: pg.Pool;
  private ttlMs: number;

  constructor(db: pg.Pool, ttlMs = 30_000) {
    this.db = db;
    this.ttlMs = ttlMs;
  }

  async createDraft(draftId: string, sections: Record<string, SectionDoc>) {
    const sectionHashes: Record<string, string> = {};
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      for (const [sectionId, doc] of Object.entries(sections)) {
        const hash = contentHash(doc);
        sectionHashes[sectionId] = hash;
        await client.query(
          `INSERT INTO sections (hash, doc) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
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
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Acquire a free lease or take over an expired one — one CAS. Takeover is
   * only possible on an expired lease and always bumps the epoch. Returns
   * null when ANOTHER owner holds an unexpired lease; re-acquiring one's own
   * active lease is idempotent (same epoch, refreshed TTL), so a lost
   * acquire response can be retried without the section reading as
   * unavailable until expiry. Re-acquiring one's own EXPIRED lease still
   * bumps the epoch — that fences out the owner's pre-sleep in-flight
   * commits.
   *
   * The statement grants a lease only for a section that the draft's head
   * manifest actually contains, so an unknown draft or section throws instead
   * of returning a meaningless epoch (and leaving a lease row behind) that
   * only fails later, when the client looks the absent section up.
   */
  async acquire(
    draftId: string,
    sectionId: string,
    owner: string,
  ): Promise<Lease | null> {
    const res = await this.db.query(
      `INSERT INTO leases (draft_id, section_id, owner, epoch, expires_at)
       SELECT $1, $2, $3, 1,
              clock_timestamp() + make_interval(secs => $4::float / 1000)
       WHERE EXISTS (${SECTION_EXISTS})
       ON CONFLICT (draft_id, section_id) DO UPDATE
         SET owner = excluded.owner,
             epoch = CASE
               WHEN leases.owner = excluded.owner
                 AND leases.expires_at > clock_timestamp()
                 THEN leases.epoch
               ELSE leases.epoch + 1
             END,
             expires_at = excluded.expires_at
         WHERE leases.expires_at < clock_timestamp()
            OR leases.owner = excluded.owner
       RETURNING epoch, expires_at`,
      [draftId, sectionId, owner, this.ttlMs],
    );
    const row = res.rows[0] as { epoch: string; expires_at: Date } | undefined;
    if (row) return { epoch: BigInt(row.epoch), expiresAt: row.expires_at };
    // No row means either "another owner holds it" or "no such section" —
    // only the failure path pays for the distinction.
    await this.assertSectionExists(draftId, sectionId);
    return null;
  }

  private async assertSectionExists(draftId: string, sectionId: string) {
    const known = await this.db.query(SECTION_EXISTS, [draftId, sectionId]);
    if (known.rowCount === 0) {
      throw new UnknownSectionError(draftId, sectionId);
    }
  }

  /**
   * Explicit takeover — the duplicate-tab "take over editing" action. Unlike
   * acquire, it succeeds against an ACTIVE lease; authorization (same user,
   * explicit intent) is the application layer's responsibility. Still one
   * atomic statement, and still always bumps the epoch, so the previous
   * tab's in-flight commits are fenced out.
   */
  async takeover(
    draftId: string,
    sectionId: string,
    owner: string,
  ): Promise<Lease | null> {
    const res = await this.db.query(
      `UPDATE leases
       SET owner = $3, epoch = epoch + 1,
           expires_at = clock_timestamp() + make_interval(secs => $4::float / 1000)
       WHERE draft_id = $1 AND section_id = $2
       RETURNING epoch, expires_at`,
      [draftId, sectionId, owner, this.ttlMs],
    );
    const row = res.rows[0] as { epoch: string; expires_at: Date } | undefined;
    return row ? { epoch: BigInt(row.epoch), expiresAt: row.expires_at } : null;
  }

  /** Heartbeat. A late heartbeat cannot resurrect an expired lease. */
  async renew(
    draftId: string,
    sectionId: string,
    owner: string,
    epoch: bigint,
  ): Promise<Lease | null> {
    const res = await this.db.query(
      `UPDATE leases
       SET expires_at = clock_timestamp() + make_interval(secs => $5::float / 1000)
       WHERE draft_id = $1 AND section_id = $2 AND owner = $3 AND epoch = $4
         AND expires_at > clock_timestamp()
       RETURNING epoch, expires_at`,
      [draftId, sectionId, owner, String(epoch), this.ttlMs],
    );
    const row = res.rows[0] as { epoch: string; expires_at: Date } | undefined;
    return row ? { epoch: BigInt(row.epoch), expiresAt: row.expires_at } : null;
  }

  /**
   * Clean release: expire in place. The row (and its epoch) survives so
   * epochs stay monotonic per section for the lifetime of the draft.
   */
  async release(
    draftId: string,
    sectionId: string,
    owner: string,
    epoch: bigint,
  ): Promise<void> {
    await this.db.query(
      `UPDATE leases SET expires_at = clock_timestamp()
       WHERE draft_id = $1 AND section_id = $2 AND owner = $3 AND epoch = $4
         AND expires_at > clock_timestamp()`,
      [draftId, sectionId, owner, String(epoch)],
    );
  }

  /**
   * The commit path: lease validation (owner + epoch + expiry — the epoch
   * alone is NOT sufficient), client_seq idempotency via the log's unique
   * constraint, per-draft serialization via the draft-head row lock, and the
   * command-log append — all in one transaction.
   */
  async commit(params: {
    draftId: string;
    sectionId: string;
    owner: string;
    epoch: bigint;
    clientSeq: bigint;
    commands: Command[];
  }): Promise<CommitResult> {
    const { draftId, sectionId, owner, epoch, clientSeq, commands } = params;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Per-draft serialization: every commit advances the head under this
      // row lock, so concurrent section commits cannot fork the chain. Taken
      // FIRST — the dedup and lease checks below are only meaningful at the
      // serialization point. (Lock order is head-then-lease in every
      // transaction, so the two locks cannot deadlock.)
      const head = await client.query(
        `SELECT head_seq, head_manifest_hash FROM drafts WHERE id = $1 FOR UPDATE`,
        [draftId],
      );
      const headRow = head.rows[0] as {
        head_seq: string;
        head_manifest_hash: string;
      };

      // Idempotency BEFORE lease validation: a retransmitted client_seq
      // returns its original recorded result even when the lease has since
      // expired or been taken over — a commit that succeeded but lost its
      // acknowledgement must never read as rejected, or the client rolls
      // back state the server already persisted.
      const dup = await client.query(
        `SELECT manifest_seq FROM command_log
         WHERE draft_id = $1 AND section_id = $2 AND owner = $3 AND epoch = $4
           AND client_seq = $5`,
        [draftId, sectionId, owner, String(epoch), String(clientSeq)],
      );
      if (dup.rowCount && dup.rowCount > 0) {
        const seq = BigInt(
          (dup.rows[0] as { manifest_seq: string }).manifest_seq,
        );
        const m = await client.query(
          `SELECT hash, section_hashes FROM manifests WHERE draft_id = $1 AND seq = $2`,
          [draftId, String(seq)],
        );
        await client.query('COMMIT');
        const row = m.rows[0] as {
          hash: string;
          section_hashes: Record<string, string>;
        };
        return {
          deduped: true,
          manifestSeq: seq,
          manifestHash: row.hash,
          sectionHash: row.section_hashes[sectionId] ?? '',
        };
      }

      // Commit-time lease validation at the serialization point, including
      // the expiry check that closes the slept-laptop window. FOR UPDATE
      // locks the lease row through the rest of the transaction: a takeover
      // or expiry-acquire (both single-row UPDATEs) blocks behind this lock
      // and its epoch bump linearizes AFTER this commit — without the lock, a
      // takeover could bump the epoch between this check and the apply,
      // and the stale owner would still write.
      //
      // The expiry compares against clock_timestamp(), not now(): this
      // transaction may have waited on the draft-head lock for longer than
      // the TTL, and now() would still report the moment it started, so a
      // lease that expired while queueing would validate.
      const lease = await client.query(
        `SELECT 1 FROM leases
         WHERE draft_id = $1 AND section_id = $2 AND owner = $3 AND epoch = $4
           AND expires_at > clock_timestamp()
         FOR UPDATE`,
        [draftId, sectionId, owner, String(epoch)],
      );
      if (lease.rowCount === 0) {
        throw new LeaseRejectedError('lease not held (owner/epoch/expiry)');
      }

      const manifest = await client.query(
        `SELECT section_hashes FROM manifests WHERE draft_id = $1 AND seq = $2`,
        [draftId, headRow.head_seq],
      );
      const sectionHashes = {
        ...(manifest.rows[0] as { section_hashes: Record<string, string> })
          .section_hashes,
      };
      const currentHash = sectionHashes[sectionId];
      if (currentHash === undefined) {
        throw new LeaseRejectedError(`unknown section ${sectionId}`);
      }
      const currentDoc = await client.query(
        `SELECT doc FROM sections WHERE hash = $1`,
        [currentHash],
      );

      // The server runs the same shared apply engine as the client.
      const newDoc = applyCommands(
        (currentDoc.rows[0] as { doc: SectionDoc }).doc,
        commands,
      );
      const newSectionHash = contentHash(newDoc);
      await client.query(
        `INSERT INTO sections (hash, doc) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [newSectionHash, newDoc],
      );

      sectionHashes[sectionId] = newSectionHash;
      const newSeq = BigInt(headRow.head_seq) + 1n;
      const newManifestHash = manifestHash(
        sectionHashes,
        headRow.head_manifest_hash,
      );
      await client.query(
        `INSERT INTO manifests (draft_id, seq, hash, parent_hash, section_hashes)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          draftId,
          String(newSeq),
          newManifestHash,
          headRow.head_manifest_hash,
          sectionHashes,
        ],
      );
      await client.query(
        `UPDATE drafts SET head_seq = $2, head_manifest_hash = $3 WHERE id = $1`,
        [draftId, String(newSeq), newManifestHash],
      );
      await client.query(
        `INSERT INTO command_log (draft_id, section_id, owner, epoch, client_seq, commands, manifest_seq)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          draftId,
          sectionId,
          owner,
          String(epoch),
          String(clientSeq),
          JSON.stringify(commands),
          String(newSeq),
        ],
      );

      await client.query('COMMIT');
      return {
        deduped: false,
        manifestSeq: newSeq,
        manifestHash: newManifestHash,
        sectionHash: newSectionHash,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Reconnect/resume: the client presents its manifest head; the server
   * returns the current head, per-section hashes (client fetches only what
   * differs), and the last applied client_seq per (owner, section, epoch) so
   * the client knows exactly what to retransmit.
   */
  async resume(draftId: string, owner: string) {
    // Both reads come from ONE MVCC snapshot: read separately, an in-flight
    // commit landing between them would pair pre-commit sectionHashes with a
    // post-commit lastApplied — the client would drop the acknowledged batch
    // yet load the older document, leaving its base behind the server.
    const client = await this.db.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      const head = await client.query(
        `SELECT d.head_seq, d.head_manifest_hash, m.section_hashes
         FROM drafts d
         JOIN manifests m ON m.draft_id = d.id AND m.seq = d.head_seq
         WHERE d.id = $1`,
        [draftId],
      );
      const acked = await client.query(
        `SELECT section_id, epoch, max(client_seq) AS last_seq
         FROM command_log WHERE draft_id = $1 AND owner = $2
         GROUP BY section_id, epoch`,
        [draftId, owner],
      );
      await client.query('COMMIT');

      const row = head.rows[0] as {
        head_seq: string;
        head_manifest_hash: string;
        section_hashes: Record<string, string>;
      };
      const lastApplied: Record<string, { epoch: bigint; clientSeq: bigint }> =
        {};
      for (const r of acked.rows as {
        section_id: string;
        epoch: string;
        last_seq: string;
      }[]) {
        const existing = lastApplied[r.section_id];
        if (!existing || BigInt(r.epoch) > existing.epoch) {
          lastApplied[r.section_id] = {
            epoch: BigInt(r.epoch),
            clientSeq: BigInt(r.last_seq),
          };
        }
      }
      return {
        head: { seq: BigInt(row.head_seq), hash: row.head_manifest_hash },
        sectionHashes: row.section_hashes,
        lastApplied,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async getSection(hash: string): Promise<SectionDoc> {
    const res = await this.db.query(
      `SELECT doc FROM sections WHERE hash = $1`,
      [hash],
    );
    return (res.rows[0] as { doc: SectionDoc }).doc;
  }

  /** The full manifest chain, oldest first — for linearity assertions. */
  async manifestChain(draftId: string) {
    const res = await this.db.query(
      `SELECT seq, hash, parent_hash FROM manifests WHERE draft_id = $1 ORDER BY seq`,
      [draftId],
    );
    return res.rows as {
      seq: string;
      hash: string;
      parent_hash: string | null;
    }[];
  }
}

/** Test helper: simulate the passage of time (a slept laptop) by expiring a
 * lease in place. Touches only expires_at — the machinery stays untouched. */
export async function forceExpire(
  db: pg.Pool,
  draftId: string,
  sectionId: string,
) {
  await db.query(
    `UPDATE leases SET expires_at = now() - interval '1 millisecond'
     WHERE draft_id = $1 AND section_id = $2`,
    [draftId, sectionId],
  );
}
