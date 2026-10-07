// Server half of the walking skeleton: the lease state machine (every
// transition a single atomic conditional statement), the Replicache-style
// idempotent commit path with per-draft serialization, and manifest-hash
// resume — exactly as specified on #1247.
import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  max,
  type SQL,
  sql,
} from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { Effect, Schema } from 'effect';

import {
  applyCommands,
  type Command,
  contentHash,
  manifestHash,
  type SectionDoc,
} from './apply.ts';
import { SYNC_TABLES } from './schema.ts';
import { Transaction } from './tenant.ts';

const { drafts, sections, manifests, leases, commandLog } = SYNC_TABLES;

export class LeaseRejectedError extends Schema.TaggedError<LeaseRejectedError>()(
  'LeaseRejectedError',
  { reason: Schema.String },
) {
  override get message(): string {
    return `commit rejected: ${this.reason}`;
  }
}

/** A lease was requested for a draft or section that does not exist. */
export class UnknownSectionError extends Schema.TaggedError<UnknownSectionError>()(
  'UnknownSectionError',
  { draftId: Schema.String, sectionId: Schema.String },
) {
  override get message(): string {
    return `no section ${this.sectionId} in draft ${this.draftId}`;
  }
}

export class UnknownDraftError extends Schema.TaggedError<UnknownDraftError>()(
  'UnknownDraftError',
  { draftId: Schema.String },
) {
  override get message(): string {
    return `no draft ${this.draftId}`;
  }
}

export class UnknownSectionDocumentError extends Schema.TaggedError<UnknownSectionDocumentError>()(
  'UnknownSectionDocumentError',
  { hash: Schema.String },
) {
  override get message(): string {
    return `no section document ${this.hash}`;
  }
}

export class SectionRejectedError extends Schema.TaggedError<SectionRejectedError>()(
  'SectionRejectedError',
  { sectionId: Schema.String, cause: Schema.Defect() },
) {
  override get message(): string {
    const { cause } = this;
    if (cause instanceof Error) return cause.message;
    // Guarded: `String` throws for an object with a null prototype or a
    // throwing `Symbol.toPrimitive`.
    let described: string;
    try {
      described = String(cause);
    } catch {
      described = '[unprintable]';
    }
    return `section ${this.sectionId} was refused: ${described}`;
  }
}

// Lease lifetimes are wall-clock, so every expiry comparison below uses
// clock_timestamp() rather than now(): now() is the transaction's start time,
// and a transaction that waits on a row lock past the TTL would otherwise read
// an expired lease as live.
const clockNow = (): SQL => sql`clock_timestamp()`;

const expiryFromNow = (ttlMs: number): SQL =>
  sql`clock_timestamp() + make_interval(secs => ${ttlMs}::float / 1000)`;

export function sectionExists(
  draftId: string,
  sectionId: string,
  teamId: string,
): SQL {
  return new QueryBuilder()
    .select({ present: sql`1` })
    .from(drafts)
    .innerJoin(
      manifests,
      and(
        eq(manifests.draftId, drafts.id),
        eq(manifests.teamId, drafts.teamId),
        eq(manifests.seq, drafts.headSeq),
      ),
    )
    .where(
      and(
        eq(drafts.id, draftId),
        eq(drafts.teamId, teamId),
        isNotNull(sql`${manifests.sectionHashes} ->> ${sectionId}`),
      ),
    )
    .getSQL();
}

export type Lease = { epoch: bigint; expiresAt: Date };

export type SectionValidator = (
  sectionId: string,
  doc: SectionDoc,
  sectionIds: string[],
) => void;

export type CommitResult = {
  deduped: boolean;
  manifestSeq: bigint;
  manifestHash: string;
  sectionHash: string;
};

export type CommitParams = {
  draftId: string;
  sectionId: string;
  owner: string;
  epoch: bigint;
  clientSeq: bigint;
  commands: Command[];
};

export type ResumeResult = {
  head: { seq: bigint; hash: string };
  sectionHashes: Record<string, string>;
  lastApplied: Record<string, { epoch: bigint; clientSeq: bigint }>;
};

export type ManifestChainEntry = {
  seq: bigint;
  hash: string;
  parentHash: string | null;
};

export type SyncServerOptions = {
  readonly ttlMs?: number | undefined;
  readonly validateSection?: SectionValidator | undefined;
};

const DEFAULT_TTL_MS = 30_000;

/**
 * `teamId` is `null` in a maintenance scope; sync rows written there would be
 * invisible to every tenant policy, so it dies rather than guessing a team.
 */
const tenant = Effect.fnUntraced(function* () {
  const open = yield* Transaction;
  if (open.teamId === null) {
    return yield* Effect.die(
      new Error(
        'the sync server may only run in a team-stamped transaction; this scope stamps no team',
      ),
    );
  }
  return { tx: open.tx, sql: open.sql, teamId: open.teamId };
});

/**
 * `resume`'s two reads must come from ONE MVCC snapshot, and the transaction is the
 * caller's, so this checks the isolation level it actually got.
 */
const assertSnapshotIsolation = Effect.fnUntraced(function* () {
  const open = yield* Transaction;
  const rows = yield* open.sql<{
    level: string;
  }>`select current_setting('transaction_isolation') as level`;
  const level = rows[0]?.level;
  if (level !== 'repeatable read' && level !== 'serializable') {
    yield* Effect.die(
      new Error(
        `resume must run in a repeatable read (or serializable) transaction so its two reads share one snapshot; this one is "${level ?? 'unknown'}"`,
      ),
    );
  }
});

export function makeSyncServer(options: SyncServerOptions = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const validateSection = options.validateSection;

  const assertSectionExists = Effect.fnUntraced(function* (
    draftId: string,
    sectionId: string,
  ) {
    const { tx, teamId } = yield* tenant();
    const known = yield* tx.execute(
      sectionExists(draftId, sectionId, teamId),
      'objects',
    );
    if (known.length === 0) {
      yield* new UnknownSectionError({ draftId, sectionId });
    }
  });

  /**
   * Takes the draft-head row lock, as the commit path does, so a grant and a
   * commit cannot interleave.
   */
  const lockHead = Effect.fnUntraced(function* (draftId: string) {
    const { tx, teamId } = yield* tenant();
    yield* tx
      .select({ present: sql`1` })
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)))
      .for('share');
  });

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
   * manifest actually contains, so an unknown draft or section fails instead
   * of returning a meaningless epoch (and leaving a lease row behind) that
   * only fails later, when the client looks the absent section up.
   */
  const acquire = Effect.fn('sync.acquire')(function* (
    draftId: string,
    sectionId: string,
    owner: string,
  ) {
    const { tx, teamId } = yield* tenant();
    yield* lockHead(draftId);
    const rows = yield* tx
      .insert(leases)
      // A SELECT rather than VALUES so the EXISTS can gate it.
      .select(
        sql`select ${draftId}::uuid, ${teamId}::text, ${sectionId}::text, ${owner}::text, 1::bigint, ${expiryFromNow(ttlMs)}
            where exists (${sectionExists(draftId, sectionId, teamId)})`,
      )
      .onConflictDoUpdate({
        target: [leases.draftId, leases.sectionId],
        set: {
          owner: sql`excluded.owner`,
          epoch: sql`case
            when ${leases.owner} = excluded.owner
              and ${leases.expiresAt} > clock_timestamp()
            then ${leases.epoch}
            else ${leases.epoch} + 1
          end`,
          expiresAt: sql`excluded.expires_at`,
        },
        setWhere: sql`${leases.expiresAt} < clock_timestamp() or ${leases.owner} = excluded.owner`,
      })
      .returning({ epoch: leases.epoch, expiresAt: leases.expiresAt });
    const row = rows[0];
    if (row !== undefined)
      return { epoch: row.epoch, expiresAt: row.expiresAt };
    // No row means either "another owner holds it" or "no such section" —
    // only the failure path pays for the distinction.
    yield* assertSectionExists(draftId, sectionId);
    return null;
  });

  /**
   * Explicit takeover — the duplicate-tab "take over editing" action. Unlike
   * acquire, it succeeds against an ACTIVE lease; authorization (same user,
   * explicit intent) is the application layer's responsibility. Still one
   * atomic statement, and still always bumps the epoch, so the previous
   * tab's in-flight commits are fenced out.
   */
  const takeover = Effect.fn('sync.takeover')(function* (
    draftId: string,
    sectionId: string,
    owner: string,
  ) {
    const { tx, teamId } = yield* tenant();
    yield* lockHead(draftId);
    const rows = yield* tx
      .update(leases)
      .set({
        owner,
        epoch: sql`${leases.epoch} + 1`,
        expiresAt: expiryFromNow(ttlMs),
      })
      .where(
        and(
          eq(leases.draftId, draftId),
          eq(leases.sectionId, sectionId),
          eq(leases.teamId, teamId),
          sql`exists (${sectionExists(draftId, sectionId, teamId)})`,
        ),
      )
      .returning({ epoch: leases.epoch, expiresAt: leases.expiresAt });
    const row = rows[0];
    if (row !== undefined)
      return { epoch: row.epoch, expiresAt: row.expiresAt };
    yield* assertSectionExists(draftId, sectionId);
    return null;
  });

  /** Heartbeat. A late heartbeat cannot resurrect an expired lease. */
  const renew = Effect.fn('sync.renew')(function* (
    draftId: string,
    sectionId: string,
    owner: string,
    epoch: bigint,
  ) {
    const { tx, teamId } = yield* tenant();
    const rows = yield* tx
      .update(leases)
      .set({ expiresAt: expiryFromNow(ttlMs) })
      .where(
        and(
          eq(leases.draftId, draftId),
          eq(leases.sectionId, sectionId),
          eq(leases.owner, owner),
          eq(leases.epoch, epoch),
          eq(leases.teamId, teamId),
          gt(leases.expiresAt, clockNow()),
        ),
      )
      .returning({ epoch: leases.epoch, expiresAt: leases.expiresAt });
    const row = rows[0];
    return row === undefined
      ? null
      : { epoch: row.epoch, expiresAt: row.expiresAt };
  });

  /**
   * Heartbeat for every live lease the named owners hold on a draft, whatever
   * its epoch: the owner is the tab, and a lease it re-acquired after an expiry
   * is still its own to keep alive. Like `renew`, it cannot resurrect an
   * expired lease, and it never touches another owner's.
   */
  const renewHeld = Effect.fn('sync.renewHeld')(function* (
    draftId: string,
    owners: ReadonlyArray<string>,
  ) {
    const { tx, teamId } = yield* tenant();
    return yield* tx
      .update(leases)
      .set({ expiresAt: expiryFromNow(ttlMs) })
      .where(
        and(
          eq(leases.draftId, draftId),
          inArray(leases.owner, [...owners]),
          eq(leases.teamId, teamId),
          gt(leases.expiresAt, clockNow()),
        ),
      )
      .returning({
        sectionId: leases.sectionId,
        owner: leases.owner,
        epoch: leases.epoch,
        expiresAt: leases.expiresAt,
      });
  });

  /**
   * Clean release: expire in place. The row (and its epoch) survives so
   * epochs stay monotonic per section for the lifetime of the draft.
   */
  const release = Effect.fn('sync.release')(function* (
    draftId: string,
    sectionId: string,
    owner: string,
    epoch: bigint,
  ) {
    const { tx, teamId } = yield* tenant();
    yield* tx
      .update(leases)
      .set({ expiresAt: clockNow() })
      .where(
        and(
          eq(leases.draftId, draftId),
          eq(leases.sectionId, sectionId),
          eq(leases.owner, owner),
          eq(leases.epoch, epoch),
          eq(leases.teamId, teamId),
          gt(leases.expiresAt, clockNow()),
        ),
      )
      // `returning` so the result is a rows array rather than the driver's
      // result object wearing an array's type.
      .returning({ epoch: leases.epoch });
  });

  const createDraft = Effect.fn('sync.createDraft')(function* (
    draftId: string,
    sectionDocs: Record<string, SectionDoc>,
  ) {
    const { tx, teamId } = yield* tenant();
    const sectionHashes: Record<string, string> = {};
    for (const [sectionId, doc] of Object.entries(sectionDocs)) {
      const hash = contentHash(doc);
      sectionHashes[sectionId] = hash;
      yield* tx
        .insert(sections)
        .values({ teamId, hash, doc })
        .onConflictDoUpdate({
          target: [sections.teamId, sections.hash],
          set: { createdAt: clockNow(), unreferencedAt: sql`null` },
        });
    }
    const mHash = manifestHash(sectionHashes, null);
    yield* tx
      .insert(drafts)
      .values({ id: draftId, teamId, headSeq: 0n, headManifestHash: mHash });
    yield* tx.insert(manifests).values({
      draftId,
      teamId,
      seq: 0n,
      hash: mHash,
      parentHash: null,
      sectionHashes,
    });
    return sectionHashes;
  });

  /**
   * The commit path: lease validation (owner + epoch + expiry — the epoch
   * alone is NOT sufficient), client_seq idempotency via the log's unique
   * constraint, per-draft serialization via the draft-head row lock, and the
   * command-log append — all in the caller's one transaction.
   */
  const commit = Effect.fn('sync.commit')(function* (params: CommitParams) {
    const { draftId, sectionId, owner, epoch, clientSeq, commands } = params;
    const { tx, teamId } = yield* tenant();

    // Taken FIRST: the dedup and lease checks are only meaningful under this
    // lock. Lock order is head-then-lease in every transaction.
    const head = yield* tx
      .select({
        headSeq: drafts.headSeq,
        headManifestHash: drafts.headManifestHash,
      })
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)))
      .for('no key update');
    const headRow = head[0];
    if (headRow === undefined) {
      return yield* new LeaseRejectedError({
        reason: `draft ${draftId} no longer exists`,
      });
    }

    // Idempotency BEFORE lease validation: a commit that succeeded but lost its
    // acknowledgement must never read as rejected.
    const dup = yield* tx
      .select({ manifestSeq: commandLog.manifestSeq })
      .from(commandLog)
      .where(
        and(
          eq(commandLog.draftId, draftId),
          eq(commandLog.sectionId, sectionId),
          eq(commandLog.owner, owner),
          eq(commandLog.epoch, epoch),
          eq(commandLog.clientSeq, clientSeq),
          eq(commandLog.teamId, teamId),
        ),
      );
    const dupRow = dup[0];
    if (dupRow !== undefined) {
      const seq = dupRow.manifestSeq;
      const recorded = yield* tx
        .select({
          hash: manifests.hash,
          sectionHashes: manifests.sectionHashes,
        })
        .from(manifests)
        .where(
          and(
            eq(manifests.draftId, draftId),
            eq(manifests.seq, seq),
            eq(manifests.teamId, teamId),
          ),
        );
      const row = recorded[0];
      if (row === undefined) {
        return yield* Effect.die(
          new Error(
            `command_log row for draft ${draftId} names manifest ${seq}, which does not exist`,
          ),
        );
      }
      return {
        deduped: true,
        manifestSeq: seq,
        manifestHash: row.hash,
        sectionHash: row.sectionHashes[sectionId] ?? '',
      } satisfies CommitResult;
    }

    // FOR UPDATE: a takeover's epoch bump must linearize after this commit.
    // clock_timestamp(), not now(): this transaction may have waited on the
    // draft-head lock for longer than the TTL.
    const lease = yield* tx
      .select({ present: sql`1` })
      .from(leases)
      .where(
        and(
          eq(leases.draftId, draftId),
          eq(leases.sectionId, sectionId),
          eq(leases.owner, owner),
          eq(leases.epoch, epoch),
          eq(leases.teamId, teamId),
          gt(leases.expiresAt, clockNow()),
        ),
      )
      .for('update');
    if (lease.length === 0) {
      return yield* new LeaseRejectedError({
        reason: 'lease not held (owner/epoch/expiry)',
      });
    }

    const manifest = yield* tx
      .select({ sectionHashes: manifests.sectionHashes })
      .from(manifests)
      .where(
        and(
          eq(manifests.draftId, draftId),
          eq(manifests.seq, headRow.headSeq),
          eq(manifests.teamId, teamId),
        ),
      );
    const manifestRow = manifest[0];
    if (manifestRow === undefined) {
      return yield* Effect.die(
        new Error(
          `draft ${draftId} points at manifest ${headRow.headSeq}, which does not exist`,
        ),
      );
    }
    const sectionHashes = { ...manifestRow.sectionHashes };
    const currentHash = sectionHashes[sectionId];
    if (currentHash === undefined) {
      return yield* new LeaseRejectedError({
        reason: `unknown section ${sectionId}`,
      });
    }
    const current = yield* tx
      .select({ doc: sections.doc })
      .from(sections)
      .where(and(eq(sections.teamId, teamId), eq(sections.hash, currentHash)));
    const currentRow = current[0];
    if (currentRow === undefined) {
      return yield* new UnknownSectionDocumentError({ hash: currentHash });
    }

    const newDoc = applyCommands(currentRow.doc, commands);
    if (validateSection !== undefined) {
      yield* Effect.try({
        try: () =>
          validateSection(sectionId, newDoc, Object.keys(sectionHashes)),
        catch: (cause) => new SectionRejectedError({ sectionId, cause }),
      });
    }
    const newSectionHash = contentHash(newDoc);
    yield* tx
      .insert(sections)
      .values({ teamId, hash: newSectionHash, doc: newDoc })
      .onConflictDoUpdate({
        target: [sections.teamId, sections.hash],
        set: { createdAt: clockNow(), unreferencedAt: sql`null` },
      });

    sectionHashes[sectionId] = newSectionHash;
    const newSeq = headRow.headSeq + 1n;
    const newManifestHash = manifestHash(
      sectionHashes,
      headRow.headManifestHash,
    );
    yield* tx.insert(manifests).values({
      draftId,
      teamId,
      seq: newSeq,
      hash: newManifestHash,
      parentHash: headRow.headManifestHash,
      sectionHashes,
    });
    yield* tx
      .update(drafts)
      .set({ headSeq: newSeq, headManifestHash: newManifestHash })
      .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)));
    yield* tx.insert(commandLog).values({
      draftId,
      teamId,
      sectionId,
      owner,
      epoch,
      clientSeq,
      commands,
      manifestSeq: newSeq,
    });

    return {
      deduped: false,
      manifestSeq: newSeq,
      manifestHash: newManifestHash,
      sectionHash: newSectionHash,
    } satisfies CommitResult;
  });

  /**
   * Reconnect/resume: the client presents its manifest head; the server
   * returns the current head, per-section hashes (client fetches only what
   * differs), and the last applied client_seq per (owner, section, epoch) so
   * the client knows exactly what to retransmit.
   */
  const resume = Effect.fn('sync.resume')(function* (
    draftId: string,
    owner: string,
  ) {
    const { tx, teamId } = yield* tenant();
    yield* assertSnapshotIsolation();

    const head = yield* tx
      .select({
        headSeq: drafts.headSeq,
        headManifestHash: drafts.headManifestHash,
        sectionHashes: manifests.sectionHashes,
      })
      .from(drafts)
      .innerJoin(
        manifests,
        and(
          eq(manifests.draftId, drafts.id),
          eq(manifests.teamId, drafts.teamId),
          eq(manifests.seq, drafts.headSeq),
        ),
      )
      .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)));
    const acked = yield* tx
      .select({
        sectionId: commandLog.sectionId,
        epoch: commandLog.epoch,
        lastSeq: max(commandLog.clientSeq),
      })
      .from(commandLog)
      .where(
        and(
          eq(commandLog.draftId, draftId),
          eq(commandLog.owner, owner),
          eq(commandLog.teamId, teamId),
        ),
      )
      .groupBy(commandLog.sectionId, commandLog.epoch);

    const row = head[0];
    if (row === undefined) return yield* new UnknownDraftError({ draftId });
    const lastApplied: Record<string, { epoch: bigint; clientSeq: bigint }> =
      {};
    for (const entry of acked) {
      if (entry.lastSeq === null) continue;
      const existing = lastApplied[entry.sectionId];
      if (existing === undefined || entry.epoch > existing.epoch) {
        lastApplied[entry.sectionId] = {
          epoch: entry.epoch,
          clientSeq: entry.lastSeq,
        };
      }
    }
    return {
      head: { seq: row.headSeq, hash: row.headManifestHash },
      sectionHashes: row.sectionHashes,
      lastApplied,
    } satisfies ResumeResult;
  });

  const getSection = Effect.fn('sync.getSection')(function* (hash: string) {
    const { tx, teamId } = yield* tenant();
    const rows = yield* tx
      .select({ doc: sections.doc })
      .from(sections)
      .where(and(eq(sections.teamId, teamId), eq(sections.hash, hash)));
    const row = rows[0];
    if (row === undefined) {
      return yield* new UnknownSectionDocumentError({ hash });
    }
    return row.doc;
  });

  /** The full manifest chain, oldest first — for linearity assertions. */
  const manifestChain = Effect.fn('sync.manifestChain')(function* (
    draftId: string,
  ) {
    const { tx, teamId } = yield* tenant();
    const rows = yield* tx
      .select({
        seq: manifests.seq,
        hash: manifests.hash,
        parentHash: manifests.parentHash,
      })
      .from(manifests)
      .where(and(eq(manifests.draftId, draftId), eq(manifests.teamId, teamId)))
      .orderBy(manifests.seq);
    return rows satisfies ManifestChainEntry[];
  });

  return {
    ttlMs,
    createDraft,
    acquire,
    takeover,
    renew,
    renewHeld,
    release,
    commit,
    resume,
    getSection,
    manifestChain,
  } as const;
}

export type SyncServer = ReturnType<typeof makeSyncServer>;

/** Test helper: simulate the passage of time (a slept laptop) by expiring a
 * lease in place. Touches only expires_at — the machinery stays untouched. */
export const forceExpire = Effect.fn('sync.forceExpireForTest')(function* (
  draftId: string,
  sectionId: string,
) {
  const { tx, teamId } = yield* tenant();
  yield* tx
    .update(leases)
    .set({ expiresAt: sql`now() - interval '1 millisecond'` })
    .where(
      and(
        eq(leases.draftId, draftId),
        eq(leases.sectionId, sectionId),
        eq(leases.teamId, teamId),
      ),
    );
});
