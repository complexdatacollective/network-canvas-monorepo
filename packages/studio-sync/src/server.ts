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
   * null when another owner holds an unexpired lease.
   */
  async acquire(
    draftId: string,
    sectionId: string,
    owner: string,
  ): Promise<Lease | null> {
    const res = await this.db.query(
      `INSERT INTO leases (draft_id, section_id, owner, epoch, expires_at)
       VALUES ($1, $2, $3, 1, now() + make_interval(secs => $4::float / 1000))
       ON CONFLICT (draft_id, section_id) DO UPDATE
         SET owner = excluded.owner,
             epoch = leases.epoch + 1,
             expires_at = excluded.expires_at
         WHERE leases.expires_at < now()
       RETURNING epoch, expires_at`,
      [draftId, sectionId, owner, this.ttlMs],
    );
    const row = res.rows[0] as { epoch: string; expires_at: Date } | undefined;
    return row ? { epoch: BigInt(row.epoch), expiresAt: row.expires_at } : null;
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
           expires_at = now() + make_interval(secs => $4::float / 1000)
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
       SET expires_at = now() + make_interval(secs => $5::float / 1000)
       WHERE draft_id = $1 AND section_id = $2 AND owner = $3 AND epoch = $4
         AND expires_at > now()
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
      `UPDATE leases SET expires_at = now()
       WHERE draft_id = $1 AND section_id = $2 AND owner = $3 AND epoch = $4
         AND expires_at > now()`,
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

      // Commit-time lease validation, including the expiry check that closes
      // the slept-laptop window.
      const lease = await client.query(
        `SELECT 1 FROM leases
         WHERE draft_id = $1 AND section_id = $2 AND owner = $3 AND epoch = $4
           AND expires_at > now()`,
        [draftId, sectionId, owner, String(epoch)],
      );
      if (lease.rowCount === 0) {
        throw new LeaseRejectedError('lease not held (owner/epoch/expiry)');
      }

      // Per-draft serialization: every commit advances the head under this
      // row lock, so concurrent section commits cannot fork the chain.
      const head = await client.query(
        `SELECT head_seq, head_manifest_hash FROM drafts WHERE id = $1 FOR UPDATE`,
        [draftId],
      );
      const headRow = head.rows[0] as {
        head_seq: string;
        head_manifest_hash: string;
      };

      // Idempotency: a retransmitted client_seq returns the original result
      // without re-applying. (Checked under the draft lock so a concurrent
      // duplicate serializes behind the original.)
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
    const head = await this.db.query(
      `SELECT d.head_seq, d.head_manifest_hash, m.section_hashes
       FROM drafts d
       JOIN manifests m ON m.draft_id = d.id AND m.seq = d.head_seq
       WHERE d.id = $1`,
      [draftId],
    );
    const row = head.rows[0] as {
      head_seq: string;
      head_manifest_hash: string;
      section_hashes: Record<string, string>;
    };
    const acked = await this.db.query(
      `SELECT section_id, epoch, max(client_seq) AS last_seq
       FROM command_log WHERE draft_id = $1 AND owner = $2
       GROUP BY section_id, epoch`,
      [draftId, owner],
    );
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
