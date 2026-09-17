// Studio serving the `@codaco/protocol-builder-core` host contract over its
// own storage: the sectioned draft, the lease table Studio's protocol sync
// keeps, and the protocol event log.
//
// The contract's lock is take-and-hold, with no renewal and no epoch, because
// one editor owns a section while it holds it. Studio's lease is a wall-clock
// expiry with a fencing epoch. The two are reconciled here and nowhere else:
// acquire takes the lease and hands the section back, the keeper renews it
// while the caller is alive (runtime.ts), and every write re-reads the lease
// row inside its own transaction — that read, not the epoch a client presents,
// is what decides whether a write is admitted.
//
// Every function here opens the transaction it needs, as the Promise-era host
// did, and nothing takes a connection as an argument: the sync server, the
// draft structure and the event log all require the open `Transaction`, so a
// lease change and the rows it admits land together because they run in one
// scope rather than because a caller remembered to pass one client.
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type {
  Presence,
  ResourceDescriptor,
  Revision,
} from '@codaco/protocol-builder-core/contract/schemas';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { SYNC_TABLES } from '@codaco/studio-sync/schema';
import {
  assembledProtocol,
  entityTypeReferences,
  stageReferences,
  sweepReferences,
  variableReferences,
  type CodebookSubject,
  type SectionReference,
} from '@codaco/studio-sync/section-references';
import {
  sectionShapeIssues,
  type SectionIssue,
} from '@codaco/studio-sync/section-validation';
import type { Lease, UnknownSectionError } from '@codaco/studio-sync/server';
import {
  parseSectionId,
  sectionId as makeSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import {
  audited,
  changed,
  unchanged,
  type AuditedResult,
  type AuditEventBody,
} from '../audit/audited.ts';
import { noAuditTransaction } from '../audit/no-audit.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnly, sqlErrorsOnlyBeside } from '../db/errors.ts';
import { TenantScope, type TeamAccess, Transaction } from '../db/tenant.ts';
import { RequestId } from '../http/middleware/request-id.ts';
import {
  sealAssetKeys,
  stripAssetKeyValues,
  withPlaceholderAssetKeyEntries,
} from '../protocol/asset-keys.ts';
import {
  lockProtocolActorMembership,
  lockProtocolDraft,
} from '../protocol/commands.ts';
import {
  advanceDraftManifest,
  fenceDraftLeases,
  lockDraftHead,
  type DraftStructureError,
  type HeadState,
} from '../protocol/draft-structure.ts';
import {
  createProtocolSyncServer,
  SYNC_TRANSACTION_POLICIES,
} from '../protocol/sync.ts';
import type { SecretsCipherApi } from '../secrets/cipher.ts';
import {
  appendProtocolEvents,
  type LoggedProtocolEvent,
  type ProtocolEventRecord,
} from './events.ts';
import { PROTOCOL_BUILDER_TABLES } from './schema.ts';
import {
  readWriteReceipt,
  recordWriteReceipt,
  type WriteReceipt,
} from './writeReceipts.ts';

const { drafts, leases, manifests, sections } = SYNC_TABLES;
const { protocolEvents } = PROTOCOL_BUILDER_TABLES;

/**
 * Studio's sync server. One value for the process: it holds no database handle
 * and opens no transaction, so there is nothing per-session to build.
 */
const sync = createProtocolSyncServer();

/** One caller on one protocol: the tenant, the draft, and the lock owner. */
export type ProtocolBuilderSession = {
  protocolId: string;
  draftId: string;
  /**
   * The key that opens this session's transactions, minted by `openSession`
   * from the membership the protocol was found through (#1927 §10). A team id
   * on its own would open nothing: `TenantScope.open` takes the branded proof,
   * so a session cannot exist without a membership check having happened.
   */
  access: TeamAccess;
  /**
   * Seals an `apikey` asset's value as the manifest naming it is written, and
   * opens it again for a preview (#1900). On the session because the write
   * boundary is `writeSections`, which every write this host makes goes
   * through, and because sealing binds the team and protocol the session
   * already resolved.
   */
  cipher: SecretsCipherApi;
  /**
   * The contract's principal, branded once by `openSession`. It is what
   * `audited` records the actor as, so the value an event names and the value
   * a lock owner is built from are one.
   */
  principal: Principal['Service'];
  requestId: string;
  /**
   * The connection this call arrived on, which is the presence identity. A
   * WebSocket gives one per socket; the unary plane, which has no connection to
   * name, falls back to the cookie session.
   */
  connectionId: string;
  /**
   * The browser tab: not the person, so two tabs of one researcher are two
   * owners and the second opens read-only behind the first, and not the
   * socket, so a tab that reconnects `/ws` is still the same owner. A client
   * that names no tab falls back to its connection.
   */
  clientSessionId: string;
};

export type SectionAtRevision = { document: SectionDoc; revision: Revision };

export type AcquireOutcome =
  | ({ lock: 'held' } & SectionAtRevision)
  | ({ lock: 'readOnly'; holder: Presence } & SectionAtRevision);

export type SubmitOutcome =
  | { status: 'written'; revision: Revision }
  | { status: 'replayed'; receipt: WriteReceipt }
  | { status: 'notLockHolder'; holder?: Presence }
  | { status: 'blocked'; blocked: SectionHolder[] }
  | { status: 'invalidShape'; issues: SectionIssue[] };

export type CreatableSectionKind =
  | 'stage'
  | 'codebookNode'
  | 'codebookEdge'
  | 'codebookEgo';

export type CreateOutcome =
  | { status: 'created'; sectionId: ProtocolSectionId; revision: Revision }
  | { status: 'replayed'; receipt: WriteReceipt }
  | { status: 'exists'; sectionId: ProtocolSectionId }
  | { status: 'blocked'; blocked: SectionHolder[] }
  | {
      status: 'invalidShape';
      sectionId: ProtocolSectionId;
      issues: SectionIssue[];
    };

export type SectionHolder = { sectionId: ProtocolSectionId; holder?: Presence };

/**
 * What a write needs beyond the document: the id its retry repeats, the
 * manifest entries a promotion adds, and the descriptors it answers with.
 *
 * `promoted` is carried through rather than derived, because the receipt has
 * to answer the retry with what the first attempt said — by then the staged
 * resources it describes have been consumed and cannot be described again.
 */
export type WriteIntent = {
  requestId: string;
  assetEntries?: Readonly<Record<string, unknown>>;
  promoted?: ResourceDescriptor[];
};

export type RefactorOutcome =
  | {
      status: 'applied';
      revision: Revision;
      changedSections: ProtocolSectionId[];
    }
  | { status: 'blocked'; blocked: SectionHolder[] }
  | { status: 'referenced'; remaining: SectionReference[] };

/** A write's outcome and the events it logged, for the caller to publish. */
export type Published<T> = { outcome: T; events: LoggedProtocolEvent[] };

export type AcquireResult = Published<AcquireOutcome | undefined> & {
  /** Present when this call took the lease, so the keeper can renew it. */
  lease?: { epoch: bigint };
};

export function sessionOwner(session: ProtocolBuilderSession): string {
  return `${session.principal.userId}:${session.clientSessionId}`;
}

export function sessionPresence(
  session: ProtocolBuilderSession,
  mode: Presence['mode'],
  sectionId?: ProtocolSectionId,
): Presence {
  const displayName =
    session.principal.name.trim() || session.principal.email.trim();
  return {
    sessionId: session.connectionId,
    userId: session.principal.userId,
    displayName: displayName.slice(0, 320),
    mode,
    ...(sectionId === undefined ? {} : { sectionId }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ASSETS = makeSectionId({ kind: 'assets' });
const STAGE_ORDER = makeSectionId({ kind: 'stageOrder' });

/**
 * The shape check every write this host admits goes through. The `assets`
 * section is checked against a copy with each redacted API key's value filled
 * in (#1900): the shared schema requires an `apikey` entry to carry one, and
 * what is stored never does — so without the fill the host refused every edit
 * of a manifest that had ever had a key promoted into it. The filled copy is
 * used for the check alone; `writeSections` writes what the caller submitted,
 * minus any key value it strips and seals.
 */
function shapeIssues(
  id: ProtocolSectionId,
  document: SectionDoc,
): SectionIssue[] {
  return sectionShapeIssues(
    id,
    id === ASSETS ? withPlaceholderAssetKeyEntries(document) : document,
  );
}

function createdSectionId(
  kind: CreatableSectionKind,
  id: string | undefined,
): ProtocolSectionId {
  if (kind === 'codebookEgo') return makeSectionId({ kind: 'codebookEgo' });
  if (id === undefined) throw new Error(`a ${kind} section needs an id`);
  return kind === 'stage'
    ? makeSectionId({ kind: 'stage', stageId: id })
    : makeSectionId({ kind, typeId: id });
}

function codebookSectionId(subject: CodebookSubject): ProtocolSectionId {
  if (subject.entity === 'ego') return makeSectionId({ kind: 'codebookEgo' });
  if (subject.entity === 'node') {
    return makeSectionId({ kind: 'codebookNode', typeId: subject.type });
  }
  return makeSectionId({ kind: 'codebookEdge', typeId: subject.type });
}

/** The head manifest's hash for one section, as a SQL fragment. */
const sectionHashAtHead = (sectionId: string) =>
  sql<string | null>`${manifests.sectionHashes} ->> ${sectionId}`;

/**
 * The manifest sequence this section last reached *through this host*.
 *
 * `::text` rather than the column's own decoding: a correlated subquery in a
 * `sql` fragment carries no column codec, and node-postgres hands an `int8`
 * back as a string. Widened to a bigint beside the draft's head below, which
 * is what a section written by another path — the command surface Studio still
 * serves — falls back to.
 */
const sectionSequenceAtHead = (sectionId: string) =>
  sql<string | null>`(
    SELECT ${protocolEvents.manifestSeq}::text FROM ${protocolEvents}
     WHERE ${protocolEvents.draftId} = ${drafts.id}
       AND ${protocolEvents.teamId} = ${drafts.teamId}
       AND ${protocolEvents.kind} = 'revision'
       AND ${protocolEvents.sectionId} = ${sectionId}
       AND ${protocolEvents.contentHash} = ${manifests.sectionHashes} ->> ${sectionId}
     ORDER BY ${protocolEvents.cursor} DESC LIMIT 1)`;

type SectionRow = {
  hash: string | null;
  headSeq: bigint;
  doc: SectionDoc | null;
  sectionSeq: string | null;
};

/**
 * A section as the contract describes it: the document, and where it sits in
 * the protocol's history.
 *
 * `sequence` is the manifest sequence the section last reached through this
 * host, so two sections written by one atomic operation carry the same one. A
 * section last written by another path — the command surface Studio still
 * serves — has no event of its own and takes the draft's head instead.
 */
function toSectionAtRevision(row: SectionRow): SectionAtRevision | undefined {
  if (row.hash === null || row.doc === null) return undefined;
  return {
    document: row.doc,
    revision: {
      sequence: row.sectionSeq === null ? row.headSeq : BigInt(row.sectionSeq),
      contentHash: row.hash,
    },
  };
}

/**
 * The section at the draft's head, in the caller's own transaction. Every
 * write reads it under the draft-head lock it has already taken; the two
 * read-only procedures open a scope of their own around it.
 */
const headSection: (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
) => Effect.Effect<
  SectionAtRevision | undefined,
  SqlError.SqlError,
  Transaction
> = Effect.fn('protocolBuilder.headSection')(function* (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({
      hash: sectionHashAtHead(sectionId),
      headSeq: drafts.headSeq,
      doc: sections.doc,
      sectionSeq: sectionSequenceAtHead(sectionId),
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
    .leftJoin(
      sections,
      and(
        eq(sections.teamId, drafts.teamId),
        eq(sections.hash, sectionHashAtHead(sectionId)),
      ),
    )
    .where(
      and(
        eq(drafts.id, session.draftId),
        eq(drafts.teamId, session.access.teamId),
      ),
    );
  const row = rows[0];
  return row === undefined ? undefined : toSectionAtRevision(row);
}, sqlErrorsOnly);

export const readSection: (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
) => Effect.Effect<SectionAtRevision | undefined, SqlError.SqlError, Database> =
  Effect.fn('protocolBuilder.readSection')(function* (
    session: ProtocolBuilderSession,
    sectionId: ProtocolSectionId,
  ) {
    return yield* TenantScope.open(
      session.access,
      headSection(session, sectionId),
    );
  });

export const listSectionIds: (
  session: ProtocolBuilderSession,
) => Effect.Effect<ProtocolSectionId[], SqlError.SqlError, Database> =
  Effect.fn('protocolBuilder.listSectionIds')(function* (
    session: ProtocolBuilderSession,
  ) {
    return yield* TenantScope.open(
      session.access,
      Effect.gen(function* () {
        const { tx } = yield* Transaction;
        // The manifest's own map, read whole and keyed in TypeScript. The
        // `jsonb_object_keys` this replaces returned one row per key, which
        // was the same list by a longer route.
        const rows = yield* tx
          .select({ sectionHashes: manifests.sectionHashes })
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
              eq(drafts.id, session.draftId),
              eq(drafts.teamId, session.access.teamId),
            ),
          );
        return Object.keys(rows[0]?.sectionHashes ?? {}).map((id) =>
          makeSectionId(parseSectionId(id)),
        );
      }).pipe(sqlErrorsOnly),
    );
  });

type LeaseRow = { owner: string; epoch: bigint; live: boolean };

/** The lease row, locked for the rest of the transaction. */
const lockLease: (
  teamId: string,
  draftId: string,
  sectionId: string,
) => Effect.Effect<LeaseRow | undefined, SqlError.SqlError, Transaction> =
  Effect.fn('protocolBuilder.lockLease')(function* (
    teamId: string,
    draftId: string,
    sectionId: string,
  ) {
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({
        owner: leases.owner,
        epoch: leases.epoch,
        // Wall clock, not the transaction's start time: a transaction that
        // waited on the draft-head lock past the TTL would otherwise read an
        // expired lease as live.
        live: sql<boolean>`${leases.expiresAt} > clock_timestamp()`,
      })
      .from(leases)
      .where(
        and(
          eq(leases.draftId, draftId),
          eq(leases.sectionId, sectionId),
          eq(leases.teamId, teamId),
        ),
      )
      .for('update');
    return rows[0];
  }, sqlErrorsOnly);

/**
 * The presence recorded for whoever holds the lease now.
 *
 * Read from the log rather than from this process's memory, so a server that
 * did not serve the acquisition still names the holder.
 */
const lockedHolder: (
  teamId: string,
  draftId: string,
  lease: LeaseRow | undefined,
) => Effect.Effect<Presence | undefined, SqlError.SqlError, Transaction> =
  Effect.fn('protocolBuilder.lockedHolder')(function* (
    teamId: string,
    draftId: string,
    lease: LeaseRow | undefined,
  ) {
    if (lease === undefined || !lease.live) return undefined;
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({ holder: protocolEvents.holder })
      .from(protocolEvents)
      .where(
        and(
          eq(protocolEvents.draftId, draftId),
          eq(protocolEvents.teamId, teamId),
          eq(protocolEvents.kind, 'lock'),
          eq(protocolEvents.owner, lease.owner),
        ),
      )
      .orderBy(desc(protocolEvents.cursor))
      .limit(1);
    return rows[0]?.holder ?? undefined;
  }, sqlErrorsOnly);

/**
 * The sections of `ids` an editor holds that this write may not write through,
 * with who holds each.
 *
 * `owned` names the sections the caller is changing under its own lock — the
 * section a submit is for, the codebook section a dialog has open and is
 * deleting from. Every other section the write touches has to be free, this
 * owner's own included: two editors in one tab are one owner, and a draft
 * lives in its form rather than in the draft head, so a write under one of
 * them is undone by that editor's next whole-section submit.
 */
const blockedBy: (
  session: ProtocolBuilderSession,
  ids: Iterable<ProtocolSectionId>,
  owned: ReadonlySet<ProtocolSectionId>,
) => Effect.Effect<SectionHolder[], SqlError.SqlError, Transaction> = Effect.fn(
  'protocolBuilder.blockedBy',
)(function* (
  session: ProtocolBuilderSession,
  ids: Iterable<ProtocolSectionId>,
  owned: ReadonlySet<ProtocolSectionId>,
) {
  const owner = sessionOwner(session);
  const teamId = session.access.teamId;
  const blocked: SectionHolder[] = [];
  // One statement per section on the caller's connection, and no scope of its
  // own: a savepoint per row is exactly what `savepoint` warns against.
  for (const sectionId of ids) {
    const lease = yield* lockLease(teamId, session.draftId, sectionId);
    if (lease === undefined || !lease.live) continue;
    if (lease.owner === owner && owned.has(sectionId)) continue;
    const holder = yield* lockedHolder(teamId, session.draftId, lease);
    blocked.push({ sectionId, ...(holder === undefined ? {} : { holder }) });
  }
  return blocked;
});

/**
 * Takes the section, or reports who has it. `undefined` is "no such section".
 *
 * One transaction: the lease CAS runs under the same draft-head lock that
 * allocates the lock event's cursor, so no watcher can see two acquisitions in
 * the opposite order to the leases they took.
 */
export const acquireLock: (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
) => Effect.Effect<
  AcquireResult,
  UnknownSectionError | DraftStructureError | SqlError.SqlError,
  Database
> = Effect.fn('protocolBuilder.acquireLock')(function* (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
) {
  const owner = sessionOwner(session);
  const teamId = session.access.teamId;
  return yield* noAuditTransaction(
    'protocolBuilder.acquireLock',
    session.access,
    Effect.gen(function* () {
      yield* lockDraftHead(teamId, session.draftId);
      const state = yield* headSection(session, sectionId);
      if (state === undefined) return { outcome: undefined, events: [] };

      // The sync package has no `db/errors.ts` of its own, so its spans
      // publish the drizzle wrapper — whose message interpolates the query and
      // every bind parameter. Unwrapped here, at the one boundary that
      // consumes them, beside the typed refusal `acquire` answers with. The
      // type arguments are written out because `E` cannot be inferred from a
      // union that already contains both database shapes.
      const lease = yield* sqlErrorsOnlyBeside<
        Lease | null,
        UnknownSectionError,
        Transaction
      >(sync.acquire(session.draftId, sectionId, owner));
      if (lease === null) {
        const held = yield* lockLease(teamId, session.draftId, sectionId);
        const holder = yield* lockedHolder(teamId, session.draftId, held);
        return {
          outcome: {
            lock: 'readOnly',
            ...state,
            // A live lease whose acquisition predates the log is still a
            // refusal; naming its owner without a display name is better than
            // reporting the section as free.
            holder: holder ?? {
              sessionId: held?.owner ?? 'unknown',
              userId: held?.owner ?? 'unknown',
              displayName: held?.owner ?? 'another editor',
              mode: 'editing',
              sectionId,
            },
          } satisfies AcquireOutcome,
          events: [],
        };
      }
      const events = yield* appendProtocolEvents(teamId, session.draftId, [
        {
          kind: 'lock',
          sectionId,
          owner,
          holder: sessionPresence(session, 'editing', sectionId),
        },
      ]);
      return {
        outcome: { lock: 'held', ...state } satisfies AcquireOutcome,
        events,
        lease: { epoch: lease.epoch },
      };
    }),
  );
});

/**
 * The heartbeat the lease keeper drives, in a transaction of its own.
 *
 * The keeper runs from a timer and has no transaction to give — one opened
 * there would stamp no team — so this is where a renewal becomes one. It is a
 * lease transition and nothing else, which is why it runs under the registry
 * entry that says lease renewal is excluded from the team audit log.
 *
 * `null` is the update matching no row: a lease that expired or was taken
 * over. A rejection is the storage not answering at all, which the keeper
 * tells apart and retries on the next tick.
 */
export const renewLease: (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
  epoch: bigint,
) => Effect.Effect<Lease | null, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.renewLease',
)(function* (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
  epoch: bigint,
) {
  return yield* noAuditTransaction(
    SYNC_TRANSACTION_POLICIES.renew,
    session.access,
    sqlErrorsOnly(
      sync.renew(session.draftId, sectionId, sessionOwner(session), epoch),
    ),
  );
});

/**
 * Gives the section back, if this caller has it. Releasing something the
 * caller does not hold changes nothing and logs nothing.
 */
export const releaseLock: (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
) => Effect.Effect<
  Published<undefined>,
  DraftStructureError | SqlError.SqlError,
  Database
> = Effect.fn('protocolBuilder.releaseLock')(function* (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
) {
  const owner = sessionOwner(session);
  const teamId = session.access.teamId;
  return yield* noAuditTransaction(
    'protocolBuilder.releaseLock',
    session.access,
    Effect.gen(function* () {
      yield* lockDraftHead(teamId, session.draftId);
      const lease = yield* lockLease(teamId, session.draftId, sectionId);
      if (lease === undefined || !lease.live || lease.owner !== owner) {
        return { outcome: undefined, events: [] };
      }
      yield* sqlErrorsOnly(
        sync.release(session.draftId, sectionId, owner, lease.epoch),
      );
      const events = yield* appendProtocolEvents(teamId, session.draftId, [
        { kind: 'lock', sectionId },
      ]);
      return { outcome: undefined, events };
    }),
  );
});

/**
 * Releases everything one connection still holds. A dropped socket must not
 * leave colleagues waiting out a lease they can see nobody using.
 */
export const releaseConnection: (
  session: ProtocolBuilderSession,
  sectionIds: readonly ProtocolSectionId[],
) => Effect.Effect<
  Published<undefined>,
  DraftStructureError | SqlError.SqlError,
  Database
> = Effect.fn('protocolBuilder.releaseConnection')(function* (
  session: ProtocolBuilderSession,
  sectionIds: readonly ProtocolSectionId[],
) {
  const owner = sessionOwner(session);
  const teamId = session.access.teamId;
  if (sectionIds.length === 0) return { outcome: undefined, events: [] };
  return yield* noAuditTransaction(
    'protocolBuilder.releaseConnection',
    session.access,
    Effect.gen(function* () {
      yield* lockDraftHead(teamId, session.draftId);
      const records: ProtocolEventRecord[] = [];
      for (const sectionId of sectionIds) {
        const lease = yield* lockLease(teamId, session.draftId, sectionId);
        if (lease === undefined || !lease.live || lease.owner !== owner) {
          continue;
        }
        yield* sqlErrorsOnly(
          sync.release(session.draftId, sectionId, owner, lease.epoch),
        );
        records.push({ kind: 'lock', sectionId });
      }
      const events = yield* appendProtocolEvents(
        teamId,
        session.draftId,
        records,
      );
      return { outcome: undefined, events };
    }),
  );
});

type WrittenSections = {
  head: HeadState;
  writes: Map<ProtocolSectionId, SectionDoc | undefined>;
  /**
   * The section the returned revision names — a submit's own, a create's new
   * one. Absent for a change that has no single subject: a refactor answers
   * with `changedSections` instead, and the manifest's hash is then the only
   * thing that identifies what it wrote.
   */
  revisionOf?: ProtocolSectionId;
};

/**
 * Lands every write as one manifest revision and logs one event per section,
 * all carrying that revision's sequence.
 */
const writeSections: (
  session: ProtocolBuilderSession,
  written: WrittenSections,
) => Effect.Effect<
  { revision: Revision; events: LoggedProtocolEvent[] },
  SqlError.SqlError,
  Transaction
> = Effect.fn('protocolBuilder.writeSections')(function* (
  session: ProtocolBuilderSession,
  { head, writes, revisionOf }: WrittenSections,
) {
  const { tx } = yield* Transaction;
  const teamId = session.access.teamId;
  const added: Record<string, SectionDoc> = {};
  const removed: string[] = [];
  for (const [sectionId, document] of writes) {
    if (document === undefined) removed.push(sectionId);
    else added[sectionId] = document;
  }
  // The write boundary for API-key assets (#1900). Here rather than at the two
  // promotion merges because this is the one call every write this host makes
  // goes through — a submit, a create, and a refactor that rewrites the
  // manifest alike — and it is upstream of the hash: `advanceDraftManifest`
  // hashes what it is handed, so stripping the value first means the manifest
  // chain commits to the redacted document and nothing is broken by the edit.
  const assets = added[ASSETS];
  if (assets !== undefined) {
    const stripped = stripAssetKeyValues(assets);
    if (stripped.values.size > 0) {
      // In this transaction, so a refused write seals nothing and a committed
      // one cannot leave a manifest naming a key the store does not hold — for
      // an entry that arrived with a value. An entry written without one (the
      // stored shape, which validation admits) names a key nobody promoted,
      // and the inspect path reports that as "never promoted" rather than
      // failing.
      yield* sealAssetKeys(
        session.cipher,
        { teamId, protocolId: session.protocolId },
        stripped.values,
      );
    }
    added[ASSETS] = stripped.doc;
    // The event log carries the document it wrote, and a watcher replays from
    // it, so the redacted one has to be what the rest of this call sees too.
    writes.set(ASSETS, stripped.doc);
  }
  if (removed.length > 0) {
    yield* fenceDraftLeases(teamId, session.draftId, removed);
  }
  const result = yield* advanceDraftManifest(
    teamId,
    session.draftId,
    head,
    added,
    removed,
  );
  const manifestRows = yield* tx
    .select({ sectionHashes: manifests.sectionHashes })
    .from(manifests)
    .where(
      and(
        eq(manifests.draftId, session.draftId),
        eq(manifests.seq, result.manifestSeq),
        eq(manifests.teamId, teamId),
      ),
    );
  const manifestRow = manifestRows[0];
  if (manifestRow === undefined) {
    // `advanceDraftManifest` has just written it in this transaction, so its
    // absence is a database that is not the one this code was written for.
    return yield* Effect.die(
      new Error(
        `draft ${session.draftId} has no manifest at seq ${String(result.manifestSeq)}`,
      ),
    );
  }
  const sectionHashes = manifestRow.sectionHashes;

  const records: ProtocolEventRecord[] = [];
  for (const [sectionId, document] of writes) {
    const hash = sectionHashes[sectionId] ?? head.sectionHashes[sectionId];
    if (hash === undefined) {
      return yield* Effect.die(
        new Error(`no content hash for written section ${sectionId}`),
      );
    }
    records.push({
      kind: 'revision',
      sectionId,
      manifestSeq: result.manifestSeq,
      contentHash: hash,
      ...(document === undefined ? {} : { document }),
    });
  }
  const events = yield* appendProtocolEvents(teamId, session.draftId, records);
  // Every section written by one operation carries that operation's sequence.
  // The hash identifies the section the caller asked about — the same hash its
  // revision event and its `getSection` answer carry, because the contract's
  // `contentHash` is the one the sectioned store keys documents by. Only a
  // change with no single subject falls back to the manifest's.
  const revisionHash =
    revisionOf === undefined ? undefined : sectionHashes[revisionOf];
  return {
    revision: {
      sequence: result.manifestSeq,
      contentHash: revisionHash ?? result.manifestHash,
    },
    events,
  };
}, sqlErrorsOnly);

/** The audit taxonomy's operation vocabulary, as far as this host writes. */
type ProtocolOperation = 'set' | 'unset' | 'addStage';

type CommitDetails = {
  affectedSectionIds: string[];
  operationTypes: ProtocolOperation[];
};

/**
 * The event a committed revision writes.
 *
 * It names no actor, team or request any more: `audited` owns those fields and
 * `AuditEventBody` removes them, so a command supplying one is a type error
 * rather than the runtime mismatch `assertEventContext` used to refuse.
 */
function committedEvent(
  protocol: { protocolId: string; protocolLabel: string },
  input: { draftId: string; revision: bigint } & CommitDetails,
): AuditEventBody {
  return {
    eventVersion: 1,
    category: 'protocol',
    subjectType: null,
    subjectId: null,
    subjectLabel: null,
    resourceType: 'protocol',
    resourceId: protocol.protocolId,
    resourceLabel: protocol.protocolLabel,
    eventType: 'protocol.draft.committed',
    details: {
      draftId: input.draftId,
      revision: String(input.revision),
      affectedSectionIds: input.affectedSectionIds,
      operationTypes: [...new Set(input.operationTypes)],
      operationCount: input.affectedSectionIds.length,
    },
  };
}

/**
 * `audited`, with the two services this host resolves for itself.
 *
 * The rpc plane gets `Principal` from the `Authenticated` middleware and
 * `RequestId` from the HTTP router. The protocol builder is served over `/ws`
 * by oRPC, which runs neither, so the session — which resolved both when it
 * opened — provides them. One place, so every audited command this host runs
 * records the same actor and request as the session it belongs to.
 */
const auditedCommand = <A, E, R>(
  name: string,
  session: ProtocolBuilderSession,
  body: Effect.Effect<AuditedResult<A>, E, R>,
) =>
  audited(name, session.access, body).pipe(
    Effect.provideService(Principal)(session.principal),
    Effect.provideService(RequestId)(session.requestId),
  );

/**
 * Writes the whole section, and the asset manifest entries handed with it, as
 * one revision.
 *
 * `assetEntries` is the submit's promotion: the bytes behind them are already
 * with the host, and this is where they and the section naming them become a
 * single revision, so a refused submit writes neither. The write's receipt is
 * recorded in that same revision's transaction, so a retry carrying the same
 * `requestId` is answered with what this attempt wrote rather than writing a
 * second time. The three refusals here are returned rather than raised so no
 * audit event is written for a change that did not happen: the caller does not
 * hold the lock, the document is not shaped like this section, and — for a
 * submit that promotes — an editor holds the asset manifest the promotion
 * writes. A draft that is invalid across sections is written, because drafts
 * tolerate transient invalidity and validity is enforced at publication.
 */
export const submit = Effect.fn('protocolBuilder.submit')(function* (
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
  document: SectionDoc,
  write: WriteIntent,
) {
  const owner = sessionOwner(session);
  const teamId = session.access.teamId;
  const key = {
    draftId: session.draftId,
    operation: 'submit' as const,
    requestId: write.requestId,
  };
  return yield* auditedCommand(
    'protocolBuilder.submit',
    session,
    Effect.gen(function* () {
      yield* lockProtocolActorMembership({
        teamId,
        actorUserId: session.principal.userId,
      });
      const protocol = yield* lockProtocolDraft({
        teamId,
        protocolId: session.protocolId,
        draftId: session.draftId,
      });
      const head = yield* lockDraftHead(teamId, session.draftId);
      // Under the head lock, so two calls carrying one request id serialise
      // and the second finds what the first wrote. Asked before the section is
      // looked at: a retry is answered even once the section it wrote has been
      // deleted, and even once its lock has been given back.
      const already = yield* readWriteReceipt(teamId, key);
      if (already !== undefined) {
        return unchanged<Published<SubmitOutcome | undefined>>({
          outcome: { status: 'replayed', receipt: already },
          events: [],
        });
      }
      if (head.sectionHashes[sectionId] === undefined) {
        return unchanged<Published<SubmitOutcome | undefined>>({
          outcome: undefined,
          events: [],
        });
      }
      const lease = yield* lockLease(teamId, session.draftId, sectionId);
      if (lease === undefined || !lease.live || lease.owner !== owner) {
        const holder = yield* lockedHolder(teamId, session.draftId, lease);
        return unchanged<Published<SubmitOutcome | undefined>>({
          outcome: {
            status: 'notLockHolder',
            ...(holder === undefined ? {} : { holder }),
          },
          events: [],
        });
      }
      const issues = shapeIssues(sectionId, document);
      if (issues.length > 0) {
        return unchanged<Published<SubmitOutcome | undefined>>({
          outcome: { status: 'invalidShape', issues },
          events: [],
        });
      }
      const writes = new Map<ProtocolSectionId, SectionDoc | undefined>([
        [sectionId, document],
      ]);
      if (write.assetEntries !== undefined) {
        // The manifest is a section like any other and a promotion writes it,
        // so it is taken on the terms every cross-section write uses. An
        // editor holding it would submit its own whole manifest next, over the
        // entry this promotion added, leaving the saved section naming a
        // resource the protocol no longer has.
        const blocked = yield* blockedBy(
          session,
          [ASSETS],
          new Set([sectionId]),
        );
        if (blocked.length > 0) {
          return unchanged<Published<SubmitOutcome | undefined>>({
            outcome: { status: 'blocked', blocked },
            events: [],
          });
        }
        const assets = yield* headSection(session, ASSETS);
        if (assets === undefined) {
          return yield* Effect.die(
            new Error(`draft ${session.draftId} has no assets section`),
          );
        }
        writes.set(ASSETS, { ...assets.document, ...write.assetEntries });
      }
      const written = yield* writeSections(session, {
        head,
        writes,
        revisionOf: sectionId,
      });
      yield* recordWriteReceipt(teamId, key, {
        revision: written.revision,
        ...(write.promoted === undefined ? {} : { promoted: write.promoted }),
      });
      return changed<Published<SubmitOutcome | undefined>>(
        {
          outcome: { status: 'written', revision: written.revision },
          events: written.events,
        },
        [
          committedEvent(protocol, {
            draftId: session.draftId,
            revision: written.revision.sequence,
            affectedSectionIds: [...writes.keys()],
            operationTypes: ['set'],
          }),
        ],
      );
    }),
  );
});

/**
 * Creates a section, registers its pointer — a stage's place in the stage
 * order — and writes the asset manifest entries handed with it, as one
 * revision. The host mints the id and serialises the call under the draft-head
 * lock, so it needs no lock of its own.
 *
 * `assetEntries` is the create's promotion, there for the reason a submit
 * cannot cover: a stage being ADDED can carry a file the researcher imported
 * while composing it, and there is no earlier revision of that stage to have
 * promoted it with. It and the pointer section are taken on the same terms —
 * this call holds no lock, so an editor holding either blocks it, whoever they
 * are, since their next whole-section submit would take the new pointer or the
 * new manifest entry straight back out.
 *
 * The ego codebook is the one creatable singleton: a protocol whose researcher
 * has given the participant no attributes yet has no such section, and adding
 * the first one is what creates it. A singleton the protocol already has is
 * refused rather than overwritten.
 *
 * The receipt for `requestId` is written in the same transaction as the
 * section, so a retry is told which stage the first attempt made instead of
 * minting a second one.
 */
export const create = Effect.fn('protocolBuilder.create')(function* (
  session: ProtocolBuilderSession,
  input: WriteIntent & {
    kind: CreatableSectionKind;
    document: SectionDoc;
    position?: number;
    mintId: () => string;
  },
) {
  const teamId = session.access.teamId;
  const key = {
    draftId: session.draftId,
    operation: 'create' as const,
    requestId: input.requestId,
  };
  return yield* auditedCommand(
    'protocolBuilder.create',
    session,
    Effect.gen(function* () {
      yield* lockProtocolActorMembership({
        teamId,
        actorUserId: session.principal.userId,
      });
      const protocol = yield* lockProtocolDraft({
        teamId,
        protocolId: session.protocolId,
        draftId: session.draftId,
      });
      const head = yield* lockDraftHead(teamId, session.draftId);
      // Under the head lock, before an id is minted: a create that ran twice
      // would put a second copy of the stage in the protocol and tell the
      // client about only one of them.
      const already = yield* readWriteReceipt(teamId, key);
      if (already !== undefined) {
        return unchanged<Published<CreateOutcome>>({
          outcome: { status: 'replayed', receipt: already },
          events: [],
        });
      }
      const touched = [
        ...(input.kind === 'stage' ? [STAGE_ORDER] : []),
        ...(input.assetEntries === undefined ? [] : [ASSETS]),
      ];
      if (touched.length > 0) {
        const blocked = yield* blockedBy(
          session,
          touched,
          new Set<ProtocolSectionId>(),
        );
        if (blocked.length > 0) {
          return unchanged<Published<CreateOutcome>>({
            outcome: { status: 'blocked', blocked },
            events: [],
          });
        }
      }
      const id = input.kind === 'codebookEgo' ? undefined : input.mintId();
      const target = createdSectionId(input.kind, id);
      if (head.sectionHashes[target] !== undefined) {
        return unchanged<Published<CreateOutcome>>({
          outcome: { status: 'exists', sectionId: target },
          events: [],
        });
      }
      // A stage document carries its own id, and the section it lands in is
      // keyed by that id: the host mints both together so they cannot differ.
      const created: SectionDoc =
        input.kind === 'stage' && id !== undefined
          ? { ...input.document, id }
          : input.document;
      const issues = shapeIssues(target, created);
      if (issues.length > 0) {
        return unchanged<Published<CreateOutcome>>({
          outcome: { status: 'invalidShape', sectionId: target, issues },
          events: [],
        });
      }
      const writes = new Map<ProtocolSectionId, SectionDoc | undefined>([
        [target, created],
      ]);
      if (input.kind === 'stage' && id !== undefined) {
        const order = yield* headSection(session, STAGE_ORDER);
        if (order === undefined) {
          return yield* Effect.die(
            new Error(`draft ${session.draftId} has no stageOrder section`),
          );
        }
        const stages = stageList(order.document);
        const at =
          input.position === undefined
            ? stages.length
            : Math.min(input.position, stages.length);
        stages.splice(at, 0, id);
        writes.set(STAGE_ORDER, { ...order.document, stages });
      }
      if (input.assetEntries !== undefined) {
        const assets = yield* headSection(session, ASSETS);
        if (assets === undefined) {
          return yield* Effect.die(
            new Error(`draft ${session.draftId} has no assets section`),
          );
        }
        writes.set(ASSETS, { ...assets.document, ...input.assetEntries });
      }
      const written = yield* writeSections(session, {
        head,
        writes,
        revisionOf: target,
      });
      yield* recordWriteReceipt(teamId, key, {
        revision: written.revision,
        createdSection: target,
        ...(input.promoted === undefined ? {} : { promoted: input.promoted }),
      });
      return changed<Published<CreateOutcome>>(
        {
          outcome: {
            status: 'created',
            sectionId: target,
            revision: written.revision,
          },
          events: written.events,
        },
        [
          committedEvent(protocol, {
            draftId: session.draftId,
            revision: written.revision.sequence,
            affectedSectionIds: [...writes.keys()],
            operationTypes: input.kind === 'stage' ? ['addStage'] : ['set'],
          }),
        ],
      );
    }),
  );
});

type RefactorPlan = {
  writes: Map<ProtocolSectionId, SectionDoc | undefined>;
  /**
   * The sections the caller is changing under its own lock — the codebook
   * section a dialog has open and is deleting from. Every other section the
   * change writes has to be free, this caller's own included: a stage editor
   * and a codebook dialog in one tab are one connection, and the stage's draft
   * lives in its form, so a sweep under it would be undone by that editor's
   * next whole-section submit.
   */
  owned: ReadonlySet<ProtocolSectionId>;
  /** References the change cannot remove, so it must not be made at all. */
  remaining?: SectionReference[];
};

/**
 * A change that cannot be contained in one section, so it cannot be made under
 * one lock: it takes every section it writes, or fails naming who holds what.
 */
const refactor = Effect.fn('protocolBuilder.refactor')(function* (
  session: ProtocolBuilderSession,
  plan: (
    head: HeadState,
  ) => Effect.Effect<RefactorPlan | undefined, SqlError.SqlError, Transaction>,
  operationTypes: CommitDetails['operationTypes'],
) {
  const teamId = session.access.teamId;
  return yield* auditedCommand(
    'protocolBuilder.refactor',
    session,
    Effect.gen(function* () {
      yield* lockProtocolActorMembership({
        teamId,
        actorUserId: session.principal.userId,
      });
      const protocol = yield* lockProtocolDraft({
        teamId,
        protocolId: session.protocolId,
        draftId: session.draftId,
      });
      const head = yield* lockDraftHead(teamId, session.draftId);
      const planned = yield* plan(head);
      if (planned === undefined) {
        return unchanged<Published<RefactorOutcome | undefined>>({
          outcome: undefined,
          events: [],
        });
      }
      if (planned.remaining !== undefined && planned.remaining.length > 0) {
        return unchanged<Published<RefactorOutcome | undefined>>({
          outcome: { status: 'referenced', remaining: planned.remaining },
          events: [],
        });
      }
      const { writes, owned } = planned;

      const blocked = yield* blockedBy(session, writes.keys(), owned);
      if (blocked.length > 0) {
        return unchanged<Published<RefactorOutcome | undefined>>({
          outcome: { status: 'blocked', blocked },
          events: [],
        });
      }

      const written = yield* writeSections(session, { head, writes });
      const changedSections = [...writes.keys()];
      return changed<Published<RefactorOutcome | undefined>>(
        {
          outcome: {
            status: 'applied',
            revision: written.revision,
            changedSections,
          },
          events: written.events,
        },
        [
          committedEvent(protocol, {
            draftId: session.draftId,
            revision: written.revision.sequence,
            affectedSectionIds: changedSections,
            operationTypes,
          }),
        ],
      );
    }),
  );
});

/**
 * Removes a stage and its place in the stage order in one revision.
 *
 * Both writes or neither: a stage section the order does not name, or an order
 * naming a section that is gone, is a protocol that cannot be assembled. It
 * takes no lock of its own — `owned` is empty — so a stage or an order any
 * editor holds, this connection included, refuses the change.
 *
 * A stage other stages depend on is refused, not swept. The refactors strip
 * the references they remove because a codebook dialog is the researcher
 * deciding a variable is gone; nothing here is a decision about ANOTHER stage,
 * and a sweep would silently rewrite a collaborator's skip logic — or cut a
 * NarrativePedigree from the pedigree it describes — as a side effect of
 * removing something else.
 */
export function deleteStage(session: ProtocolBuilderSession, stageId: string) {
  return refactor(
    session,
    Effect.fnUntraced(function* (head: HeadState) {
      const target = makeSectionId({ kind: 'stage', stageId });
      if (head.sectionHashes[target] === undefined) return undefined;
      const documents = yield* headDocuments(session, head);
      const remaining = stageReferences(assembledProtocol(documents), stageId);
      if (remaining.length > 0) {
        return {
          writes: new Map<ProtocolSectionId, SectionDoc | undefined>(),
          owned: new Set<ProtocolSectionId>(),
          remaining,
        };
      }
      const order = yield* headSection(session, STAGE_ORDER);
      if (order === undefined) {
        return yield* Effect.die(
          new Error(`draft ${session.draftId} has no stageOrder section`),
        );
      }
      const stages = stageList(order.document).filter(
        (entry) => entry !== stageId,
      );
      return {
        writes: new Map<ProtocolSectionId, SectionDoc | undefined>([
          [target, undefined],
          [STAGE_ORDER, { ...order.document, stages }],
        ]),
        owned: new Set<ProtocolSectionId>(),
      };
    }),
    ['unset', 'set'],
  );
}

export function deleteVariable(
  session: ProtocolBuilderSession,
  input: { subject: CodebookSubject; variableId: string },
) {
  return refactor(
    session,
    Effect.fnUntraced(function* (head: HeadState) {
      const ownerSection = codebookSectionId(input.subject);
      const state = yield* headSection(session, ownerSection);
      if (state === undefined) return undefined;
      const variables = isRecord(state.document.variables)
        ? { ...state.document.variables }
        : {};
      delete variables[input.variableId];
      return sweptPlan(
        yield* headDocuments(session, head),
        [[ownerSection, { ...state.document, variables }]],
        (documents) =>
          variableReferences(
            assembledProtocol(documents),
            input.subject,
            input.variableId,
          ),
      );
    }),
    ['unset', 'set'],
  );
}

export function deleteEntityType(
  session: ProtocolBuilderSession,
  input: { entity: 'node' | 'edge'; typeId: string },
) {
  return refactor(
    session,
    Effect.fnUntraced(function* (head: HeadState) {
      const ownerSection = codebookSectionId(
        input.entity === 'node'
          ? { entity: 'node', type: input.typeId }
          : { entity: 'edge', type: input.typeId },
      );
      if (head.sectionHashes[ownerSection] === undefined) return undefined;
      return sweptPlan(
        yield* headDocuments(session, head),
        [[ownerSection, undefined]],
        (documents) =>
          entityTypeReferences(
            assembledProtocol(documents),
            input.entity,
            input.typeId,
          ),
      );
    }),
    ['unset', 'set'],
  );
}

/**
 * The codebook change, plus every section that stops naming what it removes.
 *
 * The references come from the protocol schema rather than from the two or
 * three paths a host happens to know, so a stage naming a variable from a form
 * field or a filter rule is rewritten like one naming it from a prompt. What
 * the sweep cannot remove is reported instead: applying the change anyway
 * would leave the protocol naming something that no longer exists.
 */
function sweptPlan(
  documents: Record<string, SectionDoc>,
  seed: readonly (readonly [ProtocolSectionId, SectionDoc | undefined])[],
  referencesTo: (
    documents: Readonly<Record<string, SectionDoc>>,
  ) => SectionReference[],
): RefactorPlan {
  for (const [id, document] of seed) {
    if (document === undefined) delete documents[id];
    else documents[id] = document;
  }
  const sweep = sweepReferences(documents, referencesTo);
  return {
    writes: new Map([...seed, ...sweep.rewritten]),
    owned: new Set(seed.map(([id]) => id)),
    remaining: sweep.remaining,
  };
}

function stageList(order: SectionDoc): string[] {
  return Array.isArray(order.stages)
    ? order.stages.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * Every section document at the draft's head, in one read.
 *
 * The hashes come from the head the caller already holds, so the statement is
 * `hash = ANY(...)` over that list rather than the `jsonb_each_text` join it
 * replaces — one bind of a string array instead of a jsonb document, and the
 * section-to-hash mapping stays where it was read. Two sections holding the
 * same document share one row, which is why the rows are keyed by hash and the
 * sections are walked separately.
 */
const headDocuments: (
  session: ProtocolBuilderSession,
  head: HeadState,
) => Effect.Effect<Record<string, SectionDoc>, SqlError.SqlError, Transaction> =
  Effect.fn('protocolBuilder.headDocuments')(function* (
    session: ProtocolBuilderSession,
    head: HeadState,
  ) {
    const documents: Record<string, SectionDoc> = {};
    const entries = Object.entries(head.sectionHashes);
    if (entries.length === 0) return documents;
    const { tx } = yield* Transaction;
    const rows = yield* tx
      .select({ hash: sections.hash, doc: sections.doc })
      .from(sections)
      .where(
        and(
          eq(sections.teamId, session.access.teamId),
          inArray(
            sections.hash,
            entries.map(([, hash]) => hash),
          ),
        ),
      );
    const byHash = new Map(rows.map((row) => [row.hash, row.doc]));
    for (const [id, hash] of entries) {
      const doc = byHash.get(hash);
      if (doc !== undefined) {
        documents[makeSectionId(parseSectionId(id))] = doc;
      }
    }
    return documents;
  }, sqlErrorsOnly);
