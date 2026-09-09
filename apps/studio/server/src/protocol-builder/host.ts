// Studio serving the `@codaco/protocol-builder` host contract over its own
// storage: the sectioned draft, the lease table `protocols.acquireSection`
// already uses, and the protocol event log.
//
// The contract's lock is take-and-hold, with no renewal and no epoch, because
// one editor owns a section while it holds it. Studio's lease is a wall-clock
// expiry with a fencing epoch. The two are reconciled here and nowhere else:
// acquire takes the lease and hands the section back, the keeper renews it
// while the caller is alive (runtime.ts), and every write re-reads the lease
// row inside its own transaction — that read, not the epoch a client presents,
// is what decides whether a write is admitted.
import type pg from 'pg';

import type {
  Presence,
  Revision,
} from '@codaco/protocol-builder/contract/schemas';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  type SectionIssue,
  validateSection,
  validateStageSectionIdentity,
} from '@codaco/studio-sync/section-validation';
import {
  parseSectionId,
  sectionId as makeSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import {
  runAuditedCommand,
  type AuditedCommandContext,
  type LockedAuditedCommandContext,
} from '../audit/command.ts';
import type { AuditEventInput } from '../audit/events.ts';
import { runNoAuditTenantTransaction } from '../audit/transaction.ts';
import type { Principal } from '../auth/service.ts';
import {
  lockProtocolActorMembership,
  lockProtocolDraft,
  protocolEventContext,
} from '../protocol/commands.ts';
import {
  advanceDraftManifest,
  fenceDraftLeases,
  lockDraftHead,
  type HeadState,
} from '../protocol/draft-structure.ts';
import { createProtocolSyncServer } from '../protocol/sync.ts';
import {
  appendProtocolEvents,
  type LoggedProtocolEvent,
  type ProtocolEventRecord,
} from './events.ts';

/** One caller on one protocol: the tenant, the draft, and the lock owner. */
export type ProtocolBuilderSession = {
  protocolId: string;
  draftId: string;
  tenantDb: TenantDb;
  principal: Principal;
  requestId: string;
  /**
   * The connection, not the person: two tabs of one researcher are two owners,
   * so the second opens read-only behind the first. A WebSocket gives one per
   * socket; the unary plane, which has no connection to name, falls back to
   * the cookie session.
   */
  connectionId: string;
};

export type SectionAtRevision = { document: SectionDoc; revision: Revision };

export type AcquireOutcome =
  | ({ lock: 'held' } & SectionAtRevision)
  | ({ lock: 'readOnly'; holder: Presence } & SectionAtRevision);

export type SubmitOutcome =
  | { status: 'written'; revision: Revision }
  | { status: 'notLockHolder'; holder?: Presence }
  | { status: 'invalidShape'; issues: SectionIssue[] };

export type CreatableSectionKind = 'stage' | 'codebookNode' | 'codebookEdge';

export type CreateOutcome =
  | { status: 'created'; sectionId: ProtocolSectionId; revision: Revision }
  | {
      status: 'invalidShape';
      sectionId: ProtocolSectionId;
      issues: SectionIssue[];
    };

export type SectionHolder = { sectionId: ProtocolSectionId; holder?: Presence };

export type RefactorOutcome =
  | {
      status: 'applied';
      revision: Revision;
      changedSections: ProtocolSectionId[];
    }
  | { status: 'blocked'; blocked: SectionHolder[] };

export type CodebookSubject =
  | { entity: 'node'; type: string }
  | { entity: 'edge'; type: string }
  | { entity: 'ego' };

/** A write's outcome and the events it logged, for the caller to publish. */
export type Published<T> = { outcome: T; events: LoggedProtocolEvent[] };

export type AcquireResult = Published<AcquireOutcome | undefined> & {
  /** Present when this call took the lease, so the keeper can renew it. */
  lease?: { epoch: bigint };
};

export function sessionOwner(session: ProtocolBuilderSession): string {
  return `${session.principal.userId}:${session.connectionId}`;
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

function shapeIssues(
  id: ProtocolSectionId,
  document: SectionDoc,
): SectionIssue[] {
  const result = validateSection(id, document);
  const issues = result.success ? [] : [...result.issues];
  const ref = parseSectionId(id);
  if (ref.kind === 'stage') {
    const identity = validateStageSectionIdentity(ref.stageId, document);
    if (!identity.success) issues.push(...identity.issues);
  }
  return issues;
}

function codebookSectionId(subject: CodebookSubject): ProtocolSectionId {
  if (subject.entity === 'ego') return makeSectionId({ kind: 'codebookEgo' });
  if (subject.entity === 'node') {
    return makeSectionId({ kind: 'codebookNode', typeId: subject.type });
  }
  return makeSectionId({ kind: 'codebookEdge', typeId: subject.type });
}

/**
 * Drops every prompt naming the variable, or nothing when none does.
 *
 * "Every prompt" is the whole of what a reference is here: the editors reach
 * variables from prompts, and a host that also rewrote sort orders or filter
 * rules would be guessing at semantics `@codaco/protocol-validation` owns.
 */
function stripPrompts(
  document: SectionDoc,
  variableId: string,
): SectionDoc | undefined {
  const prompts = document.prompts;
  if (!Array.isArray(prompts)) return undefined;
  const kept = prompts.filter(
    (prompt) => !(isRecord(prompt) && prompt.variable === variableId),
  );
  return kept.length === prompts.length
    ? undefined
    : { ...document, prompts: kept };
}

const SECTION_AT_HEAD = `
  SELECT m.section_hashes ->> $2 AS hash,
         d.head_seq,
         s.doc,
         (SELECT e.manifest_seq FROM protocol_events e
           WHERE e.draft_id = d.id AND e.team_id = d.team_id
             AND e.kind = 'revision' AND e.section_id = $2
             AND e.content_hash = m.section_hashes ->> $2
           ORDER BY e.cursor DESC LIMIT 1) AS section_seq
  FROM drafts d
  JOIN manifests m
    ON m.draft_id = d.id AND m.team_id = d.team_id AND m.seq = d.head_seq
  LEFT JOIN sections s
    ON s.team_id = d.team_id AND s.hash = m.section_hashes ->> $2
  WHERE d.id = $1 AND d.team_id = $3`;

type SectionRow = {
  hash: string | null;
  head_seq: string;
  doc: SectionDoc | null;
  section_seq: string | null;
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
      sequence: BigInt(row.section_seq ?? row.head_seq),
      contentHash: row.hash,
    },
  };
}

export async function readSection(
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
): Promise<SectionAtRevision | undefined> {
  const result = await session.tenantDb.query(SECTION_AT_HEAD, [
    session.draftId,
    sectionId,
    session.tenantDb.teamId,
  ]);
  const row = result.rows[0] as SectionRow | undefined;
  return row === undefined ? undefined : toSectionAtRevision(row);
}

export async function listSectionIds(
  session: ProtocolBuilderSession,
): Promise<ProtocolSectionId[]> {
  const result = await session.tenantDb.query(
    `SELECT jsonb_object_keys(m.section_hashes) AS section_id
     FROM drafts d
     JOIN manifests m
       ON m.draft_id = d.id AND m.team_id = d.team_id AND m.seq = d.head_seq
     WHERE d.id = $1 AND d.team_id = $2`,
    [session.draftId, session.tenantDb.teamId],
  );
  return (result.rows as { section_id: string }[]).map((row) =>
    makeSectionId(parseSectionId(row.section_id)),
  );
}

type LeaseRow = { owner: string; epoch: string; live: boolean };

/** The lease row, locked for the rest of the transaction. */
async function lockLease(
  client: pg.PoolClient,
  teamId: string,
  draftId: string,
  sectionId: string,
): Promise<LeaseRow | undefined> {
  const result = await client.query(
    `SELECT owner, epoch, expires_at > clock_timestamp() AS live
     FROM leases
     WHERE draft_id = $1 AND section_id = $2 AND team_id = $3
     FOR UPDATE`,
    [draftId, sectionId, teamId],
  );
  return result.rows[0] as LeaseRow | undefined;
}

/**
 * The presence recorded for whoever holds the lease now.
 *
 * Read from the log rather than from this process's memory, so a server that
 * did not serve the acquisition still names the holder.
 */
async function lockedHolder(
  client: pg.PoolClient,
  teamId: string,
  draftId: string,
  lease: LeaseRow | undefined,
): Promise<Presence | undefined> {
  if (lease === undefined || !lease.live) return undefined;
  const result = await client.query(
    `SELECT holder FROM protocol_events
     WHERE draft_id = $1 AND team_id = $2 AND kind = 'lock' AND owner = $3
     ORDER BY cursor DESC LIMIT 1`,
    [draftId, teamId, lease.owner],
  );
  const row = result.rows[0] as { holder: Presence | null } | undefined;
  return row?.holder ?? undefined;
}

async function headSection(
  client: pg.PoolClient,
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
): Promise<SectionAtRevision | undefined> {
  const result = await client.query(SECTION_AT_HEAD, [
    session.draftId,
    sectionId,
    session.tenantDb.teamId,
  ]);
  const row = result.rows[0] as SectionRow | undefined;
  return row === undefined ? undefined : toSectionAtRevision(row);
}

/**
 * Takes the section, or reports who has it. `undefined` is "no such section".
 *
 * One transaction: the lease CAS runs under the same draft-head lock that
 * allocates the lock event's cursor, so no watcher can see two acquisitions in
 * the opposite order to the leases they took.
 */
export async function acquireLock(
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
): Promise<AcquireResult> {
  const owner = sessionOwner(session);
  const teamId = session.tenantDb.teamId;
  const sync = createProtocolSyncServer(session.tenantDb);
  return runNoAuditTenantTransaction(
    session.tenantDb,
    'protocolBuilder.acquireLock',
    async (client): Promise<AcquireResult> => {
      await lockDraftHead(client, teamId, session.draftId);
      const state = await headSection(client, session, sectionId);
      if (state === undefined) return { outcome: undefined, events: [] };

      const lease = await sync.acquire(
        session.draftId,
        sectionId,
        owner,
        client,
      );
      if (lease === null) {
        const held = await lockLease(
          client,
          teamId,
          session.draftId,
          sectionId,
        );
        const holder = await lockedHolder(
          client,
          teamId,
          session.draftId,
          held,
        );
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
          },
          events: [],
        };
      }
      const events = await appendProtocolEvents(
        client,
        teamId,
        session.draftId,
        [
          {
            kind: 'lock',
            sectionId,
            owner,
            holder: sessionPresence(session, 'editing', sectionId),
          },
        ],
      );
      return {
        outcome: { lock: 'held', ...state },
        events,
        lease: { epoch: lease.epoch },
      };
    },
  );
}

/**
 * Gives the section back, if this caller has it. Releasing something the
 * caller does not hold changes nothing and logs nothing.
 */
export async function releaseLock(
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
): Promise<Published<undefined>> {
  const owner = sessionOwner(session);
  const teamId = session.tenantDb.teamId;
  const sync = createProtocolSyncServer(session.tenantDb);
  return runNoAuditTenantTransaction(
    session.tenantDb,
    'protocolBuilder.releaseLock',
    async (client): Promise<Published<undefined>> => {
      await lockDraftHead(client, teamId, session.draftId);
      const lease = await lockLease(client, teamId, session.draftId, sectionId);
      if (lease === undefined || !lease.live || lease.owner !== owner) {
        return { outcome: undefined, events: [] };
      }
      await sync.release(
        session.draftId,
        sectionId,
        owner,
        BigInt(lease.epoch),
        client,
      );
      const events = await appendProtocolEvents(
        client,
        teamId,
        session.draftId,
        [{ kind: 'lock', sectionId }],
      );
      return { outcome: undefined, events };
    },
  );
}

/**
 * Releases everything one connection still holds. A dropped socket must not
 * leave colleagues waiting out a lease they can see nobody using.
 */
export async function releaseConnection(
  session: ProtocolBuilderSession,
  sectionIds: readonly ProtocolSectionId[],
): Promise<Published<undefined>> {
  const owner = sessionOwner(session);
  const teamId = session.tenantDb.teamId;
  const sync = createProtocolSyncServer(session.tenantDb);
  if (sectionIds.length === 0) return { outcome: undefined, events: [] };
  return runNoAuditTenantTransaction(
    session.tenantDb,
    'protocolBuilder.releaseConnection',
    async (client): Promise<Published<undefined>> => {
      await lockDraftHead(client, teamId, session.draftId);
      const records: ProtocolEventRecord[] = [];
      for (const sectionId of sectionIds) {
        const lease = await lockLease(
          client,
          teamId,
          session.draftId,
          sectionId,
        );
        if (lease === undefined || !lease.live || lease.owner !== owner) {
          continue;
        }
        await sync.release(
          session.draftId,
          sectionId,
          owner,
          BigInt(lease.epoch),
          client,
        );
        records.push({ kind: 'lock', sectionId });
      }
      const events = await appendProtocolEvents(
        client,
        teamId,
        session.draftId,
        records,
      );
      return { outcome: undefined, events };
    },
  );
}

type WrittenSections = {
  head: HeadState;
  writes: Map<ProtocolSectionId, SectionDoc | undefined>;
};

/**
 * Lands every write as one manifest revision and logs one event per section,
 * all carrying that revision's sequence.
 */
async function writeSections(
  client: pg.PoolClient,
  session: ProtocolBuilderSession,
  { head, writes }: WrittenSections,
): Promise<{ revision: Revision; events: LoggedProtocolEvent[] }> {
  const teamId = session.tenantDb.teamId;
  const added: Record<string, SectionDoc> = {};
  const removed: string[] = [];
  for (const [sectionId, document] of writes) {
    if (document === undefined) removed.push(sectionId);
    else added[sectionId] = document;
  }
  if (removed.length > 0) {
    await fenceDraftLeases(client, teamId, session.draftId, removed);
  }
  const result = await advanceDraftManifest(
    client,
    teamId,
    session.draftId,
    head,
    added,
    removed,
  );
  const manifest = await client.query(
    `SELECT section_hashes FROM manifests
     WHERE draft_id = $1 AND seq = $2 AND team_id = $3`,
    [session.draftId, String(result.manifestSeq), teamId],
  );
  const sectionHashes = (
    manifest.rows[0] as { section_hashes: Record<string, string> }
  ).section_hashes;

  const records: ProtocolEventRecord[] = [];
  for (const [sectionId, document] of writes) {
    const hash = sectionHashes[sectionId] ?? head.sectionHashes[sectionId];
    if (hash === undefined) {
      throw new Error(`no content hash for written section ${sectionId}`);
    }
    records.push({
      kind: 'revision',
      sectionId,
      manifestSeq: result.manifestSeq,
      contentHash: hash,
      ...(document === undefined ? {} : { document }),
    });
  }
  const events = await appendProtocolEvents(
    client,
    teamId,
    session.draftId,
    records,
  );
  // Every section written by one operation carries that operation's sequence;
  // the hash on the returned revision is the manifest's, which is what a
  // caller comparing "did anything change" needs.
  return {
    revision: {
      sequence: result.manifestSeq,
      contentHash: result.manifestHash,
    },
    events,
  };
}

function auditedContext(
  session: ProtocolBuilderSession,
): AuditedCommandContext {
  return {
    tenantDb: session.tenantDb,
    principal: session.principal,
    requestId: session.requestId,
  };
}

/** The audit taxonomy's operation vocabulary, as far as this host writes. */
type ProtocolOperation = 'set' | 'unset' | 'addStage';

type CommitDetails = {
  affectedSectionIds: string[];
  operationTypes: ProtocolOperation[];
};

function committedEvent(
  auditContext: LockedAuditedCommandContext,
  protocol: { protocolId: string; protocolLabel: string },
  input: { draftId: string; revision: bigint } & CommitDetails,
): AuditEventInput {
  return {
    ...protocolEventContext(auditContext, protocol),
    eventType: 'protocol.draft.committed',
    details: {
      draftId: input.draftId,
      revision: String(input.revision),
      affectedSectionIds: input.affectedSectionIds,
      operationTypes: [...new Set(input.operationTypes)],
      operationCount: input.affectedSectionIds.length,
    },
  } satisfies AuditEventInput;
}

/**
 * Writes the whole section as one revision.
 *
 * Exactly two refusals, both returned rather than thrown so no audit event is
 * written for a change that did not happen: the caller does not hold the lock,
 * and the document is not shaped like this section. A draft that is invalid
 * across sections is written, because drafts tolerate transient invalidity and
 * validity is enforced at publication.
 */
export async function submit(
  session: ProtocolBuilderSession,
  sectionId: ProtocolSectionId,
  document: SectionDoc,
): Promise<Published<SubmitOutcome | undefined>> {
  const owner = sessionOwner(session);
  const teamId = session.tenantDb.teamId;
  const events: LoggedProtocolEvent[] = [];
  const outcome = await runAuditedCommand<SubmitOutcome | undefined>(
    auditedContext(session),
    async (client, auditContext) => {
      await lockProtocolActorMembership(client, auditedContext(session));
      const protocol = await lockProtocolDraft(client, {
        teamId,
        protocolId: session.protocolId,
        draftId: session.draftId,
      });
      const head = await lockDraftHead(client, teamId, session.draftId);
      if (head.sectionHashes[sectionId] === undefined) {
        return { status: 'unchanged', result: undefined };
      }
      const lease = await lockLease(client, teamId, session.draftId, sectionId);
      if (lease === undefined || !lease.live || lease.owner !== owner) {
        const holder = await lockedHolder(
          client,
          teamId,
          session.draftId,
          lease,
        );
        return {
          status: 'unchanged',
          result: {
            status: 'notLockHolder',
            ...(holder === undefined ? {} : { holder }),
          },
        };
      }
      const issues = shapeIssues(sectionId, document);
      if (issues.length > 0) {
        return {
          status: 'unchanged',
          result: { status: 'invalidShape', issues },
        };
      }
      const written = await writeSections(client, session, {
        head,
        writes: new Map([[sectionId, document]]),
      });
      events.push(...written.events);
      return {
        status: 'succeeded',
        result: { status: 'written', revision: written.revision },
        events: [
          committedEvent(auditContext, protocol, {
            draftId: session.draftId,
            revision: written.revision.sequence,
            affectedSectionIds: [sectionId],
            operationTypes: ['set'],
          }),
        ],
      };
    },
  );
  return { outcome, events };
}

/**
 * Creates a section and registers its pointer — a stage's place in the stage
 * order — in the same revision. The host mints the id and serialises the call
 * under the draft-head lock, so it needs no lock of its own.
 */
export async function create(
  session: ProtocolBuilderSession,
  input: {
    kind: CreatableSectionKind;
    document: SectionDoc;
    position?: number;
    mintId: () => string;
  },
): Promise<Published<CreateOutcome>> {
  const teamId = session.tenantDb.teamId;
  const events: LoggedProtocolEvent[] = [];
  const outcome = await runAuditedCommand<CreateOutcome>(
    auditedContext(session),
    async (client, auditContext) => {
      await lockProtocolActorMembership(client, auditedContext(session));
      const protocol = await lockProtocolDraft(client, {
        teamId,
        protocolId: session.protocolId,
        draftId: session.draftId,
      });
      const head = await lockDraftHead(client, teamId, session.draftId);
      const id = input.mintId();
      const target =
        input.kind === 'stage'
          ? makeSectionId({ kind: 'stage', stageId: id })
          : makeSectionId({ kind: input.kind, typeId: id });
      // A stage document carries its own id, and the section it lands in is
      // keyed by that id: the host mints both together so they cannot differ.
      const created: SectionDoc =
        input.kind === 'stage' ? { ...input.document, id } : input.document;
      const issues = shapeIssues(target, created);
      if (issues.length > 0) {
        return {
          status: 'unchanged',
          result: { status: 'invalidShape', sectionId: target, issues },
        };
      }
      const writes = new Map<ProtocolSectionId, SectionDoc | undefined>([
        [target, created],
      ]);
      if (input.kind === 'stage') {
        const orderId = makeSectionId({ kind: 'stageOrder' });
        const order = await headSection(client, session, orderId);
        if (order === undefined) {
          throw new Error(`draft ${session.draftId} has no stageOrder section`);
        }
        const stages = Array.isArray(order.document.stages)
          ? order.document.stages.filter(
              (entry): entry is string => typeof entry === 'string',
            )
          : [];
        const at =
          input.position === undefined
            ? stages.length
            : Math.min(input.position, stages.length);
        stages.splice(at, 0, id);
        writes.set(orderId, { ...order.document, stages });
      }
      const written = await writeSections(client, session, { head, writes });
      events.push(...written.events);
      return {
        status: 'succeeded',
        result: {
          status: 'created',
          sectionId: target,
          revision: written.revision,
        },
        events: [
          committedEvent(auditContext, protocol, {
            draftId: session.draftId,
            revision: written.revision.sequence,
            affectedSectionIds: [...writes.keys()],
            operationTypes: input.kind === 'stage' ? ['addStage'] : ['set'],
          }),
        ],
      };
    },
  );
  return { outcome, events };
}

/**
 * Merges manifest entries into the `assets` section as one revision.
 *
 * Host-serialised like `create`, and for the same reason: promoted bytes and
 * the manifest entries naming them have to land together, and no client can
 * hold a lock spanning both.
 */
export async function mergeAssets(
  session: ProtocolBuilderSession,
  entries: Readonly<Record<string, unknown>>,
): Promise<Published<Revision | undefined>> {
  const teamId = session.tenantDb.teamId;
  const events: LoggedProtocolEvent[] = [];
  const outcome = await runAuditedCommand<Revision | undefined>(
    auditedContext(session),
    async (client, auditContext) => {
      await lockProtocolActorMembership(client, auditedContext(session));
      const protocol = await lockProtocolDraft(client, {
        teamId,
        protocolId: session.protocolId,
        draftId: session.draftId,
      });
      const head = await lockDraftHead(client, teamId, session.draftId);
      const assetsId = makeSectionId({ kind: 'assets' });
      const assets = await headSection(client, session, assetsId);
      if (assets === undefined)
        return { status: 'unchanged', result: undefined };
      const written = await writeSections(client, session, {
        head,
        writes: new Map([[assetsId, { ...assets.document, ...entries }]]),
      });
      events.push(...written.events);
      return {
        status: 'succeeded',
        result: written.revision,
        events: [
          committedEvent(auditContext, protocol, {
            draftId: session.draftId,
            revision: written.revision.sequence,
            affectedSectionIds: [assetsId],
            operationTypes: ['set'],
          }),
        ],
      };
    },
  );
  return { outcome, events };
}

/**
 * A change that cannot be contained in one section, so it cannot be made under
 * one lock: it takes every section it writes, or fails naming who holds what.
 */
async function refactor(
  session: ProtocolBuilderSession,
  plan: (
    client: pg.PoolClient,
    head: HeadState,
  ) => Promise<Map<ProtocolSectionId, SectionDoc | undefined> | undefined>,
  operationTypes: CommitDetails['operationTypes'],
): Promise<Published<RefactorOutcome | undefined>> {
  const owner = sessionOwner(session);
  const teamId = session.tenantDb.teamId;
  const events: LoggedProtocolEvent[] = [];
  const outcome = await runAuditedCommand<RefactorOutcome | undefined>(
    auditedContext(session),
    async (client, auditContext) => {
      await lockProtocolActorMembership(client, auditedContext(session));
      const protocol = await lockProtocolDraft(client, {
        teamId,
        protocolId: session.protocolId,
        draftId: session.draftId,
      });
      const head = await lockDraftHead(client, teamId, session.draftId);
      const writes = await plan(client, head);
      if (writes === undefined)
        return { status: 'unchanged', result: undefined };

      const blocked: SectionHolder[] = [];
      for (const sectionId of writes.keys()) {
        const lease = await lockLease(
          client,
          teamId,
          session.draftId,
          sectionId,
        );
        if (lease === undefined || !lease.live || lease.owner === owner) {
          continue;
        }
        const holder = await lockedHolder(
          client,
          teamId,
          session.draftId,
          lease,
        );
        blocked.push({
          sectionId,
          ...(holder === undefined ? {} : { holder }),
        });
      }
      if (blocked.length > 0) {
        return { status: 'unchanged', result: { status: 'blocked', blocked } };
      }

      const written = await writeSections(client, session, { head, writes });
      events.push(...written.events);
      const changedSections = [...writes.keys()];
      return {
        status: 'succeeded',
        result: {
          status: 'applied',
          revision: written.revision,
          changedSections,
        },
        events: [
          committedEvent(auditContext, protocol, {
            draftId: session.draftId,
            revision: written.revision.sequence,
            affectedSectionIds: changedSections,
            operationTypes,
          }),
        ],
      };
    },
  );
  return { outcome, events };
}

export function deleteVariable(
  session: ProtocolBuilderSession,
  input: { subject: CodebookSubject; variableId: string },
): Promise<Published<RefactorOutcome | undefined>> {
  return refactor(
    session,
    async (client, head) => {
      const ownerSection = codebookSectionId(input.subject);
      const state = await headSection(client, session, ownerSection);
      if (state === undefined) return undefined;
      const variables = isRecord(state.document.variables)
        ? { ...state.document.variables }
        : {};
      delete variables[input.variableId];
      const writes = new Map<ProtocolSectionId, SectionDoc | undefined>([
        [ownerSection, { ...state.document, variables }],
      ]);
      const stages = await headStageDocuments(client, session, head);
      stripEveryReference(stages, [input.variableId], writes);
      return writes;
    },
    ['unset', 'set'],
  );
}

export function deleteEntityType(
  session: ProtocolBuilderSession,
  input: { entity: 'node' | 'edge'; typeId: string },
): Promise<Published<RefactorOutcome | undefined>> {
  return refactor(
    session,
    async (client, head) => {
      const ownerSection = codebookSectionId(
        input.entity === 'node'
          ? { entity: 'node', type: input.typeId }
          : { entity: 'edge', type: input.typeId },
      );
      const state = await headSection(client, session, ownerSection);
      if (state === undefined) return undefined;
      const writes = new Map<ProtocolSectionId, SectionDoc | undefined>([
        [ownerSection, undefined],
      ]);
      const variableIds = isRecord(state.document.variables)
        ? Object.keys(state.document.variables)
        : [];
      const stages = await headStageDocuments(client, session, head);
      stripEveryReference(stages, variableIds, writes);
      return writes;
    },
    ['unset', 'set'],
  );
}

/** Every stage document at the draft's head, in one read. */
async function headStageDocuments(
  client: pg.PoolClient,
  session: ProtocolBuilderSession,
  head: HeadState,
): Promise<Map<ProtocolSectionId, SectionDoc>> {
  const stageHashes: Record<string, string> = {};
  for (const [id, hash] of Object.entries(head.sectionHashes)) {
    if (parseSectionId(id).kind === 'stage') stageHashes[id] = hash;
  }
  const documents = new Map<ProtocolSectionId, SectionDoc>();
  if (Object.keys(stageHashes).length === 0) return documents;
  const result = await client.query(
    `SELECT entry.key AS section_id, s.doc
     FROM jsonb_each_text($1::jsonb) AS entry
     JOIN sections s ON s.team_id = $2 AND s.hash = entry.value`,
    [JSON.stringify(stageHashes), session.tenantDb.teamId],
  );
  for (const row of result.rows as { section_id: string; doc: SectionDoc }[]) {
    documents.set(makeSectionId(parseSectionId(row.section_id)), row.doc);
  }
  return documents;
}

/**
 * Strips every prompt naming any of the variables, accumulating into `writes`
 * so a stage touched by two of them is rewritten from the previous rewrite
 * rather than from what storage still holds.
 */
function stripEveryReference(
  stages: ReadonlyMap<ProtocolSectionId, SectionDoc>,
  variableIds: readonly string[],
  writes: Map<ProtocolSectionId, SectionDoc | undefined>,
): void {
  for (const [sectionId, stored] of stages) {
    let document = writes.get(sectionId) ?? stored;
    let changed = false;
    for (const variableId of variableIds) {
      const stripped = stripPrompts(document, variableId);
      if (stripped === undefined) continue;
      document = stripped;
      changed = true;
    }
    if (changed) writes.set(sectionId, document);
  }
}
