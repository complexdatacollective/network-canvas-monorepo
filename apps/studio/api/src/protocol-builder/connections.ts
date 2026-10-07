// Who is connected to a protocol, on any replica, kept in `protocol_connections`
// so that every replica can renew, grace-check and list presence from the
// database rather than from its own memory.
//
// Lock order, the deadlock rule, is total: the draft head, then
// `protocol_connections` rows in `connection_id` order, then `leases` rows in
// `section_id` order. A writer holding even one row of one kind while it waits
// on another kind can close a cycle, so single-row writers keep the order too.
// Every transaction here that goes on to lock leases takes the head first;
// `setSocketMode` and `expireConnection` lock connection rows and then wait on
// nothing, so they can sit at the end of a wait but never inside a cycle, and
// skip the head.
import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, gt, inArray, max, sql } from 'drizzle-orm';
import { Context, Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import type { Presence } from '@codaco/protocol-builder-core/contract/schemas';
import { SYNC_TABLES } from '@codaco/studio-sync/schema';
import {
  parseSectionId,
  sectionId as makeSectionId,
} from '@codaco/studio-sync/taxonomy';

import { noAuditTransaction } from '../audit/no-audit.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { TenantScope, type TeamAccess, Transaction } from '../db/tenant.ts';
import { createProtocolSyncServer } from '../protocol/sync.ts';
import {
  appendProtocolEvents,
  readRelayBatch,
  type LoggedProtocolEvent,
  type ProtocolEventRecord,
} from './events.ts';
import {
  sessionOwner,
  sessionPresence,
  type ProtocolBuilderSession,
} from './host.ts';
import { PROTOCOL_BUILDER_TABLES } from './schema.ts';

const { drafts, leases } = SYNC_TABLES;
const { protocolConnections: connections, protocolEvents } =
  PROTOCOL_BUILDER_TABLES;

const sync = createProtocolSyncServer();

/**
 * Names the rows this replica wrote, which only it extends: one per process in
 * production, and one per client in a suite that runs several in one process.
 */
export const ReplicaId = Context.Reference<string>('@studio/ReplicaId', {
  defaultValue: () => randomUUID(),
});

/** A connection this replica keeps alive, and the key of its row. */
export type LocalRegistration = {
  readonly session: ProtocolBuilderSession;
  readonly key: string;
  readonly kind: 'socket' | 'contact';
};

/**
 * `released: false` means a socket of the owner is still live, here under
 * another key or on another replica; whoever holds it runs the grace when it
 * closes. `released: true` means nothing of the owner's is held any more, and
 * decides whether its staging goes too.
 */
type OwnerRelease =
  | {
      readonly released: true;
      readonly events: ReadonlyArray<LoggedProtocolEvent>;
    }
  | { readonly released: false };

type Liveness =
  | { readonly gone: true }
  | {
      readonly gone: false;
      readonly missing: ReadonlyArray<LocalRegistration>;
    };

const GONE: Liveness = { gone: true };
const NONE_MISSING: Liveness = { gone: false, missing: [] };
const NOTHING_HELD: OwnerRelease = { released: true, events: [] };
const STILL_CONNECTED: OwnerRelease = { released: false };

const now = () => sql`clock_timestamp()`;

const expiryFromNow = () =>
  sql`clock_timestamp() + make_interval(secs => ${sync.ttlMs}::float / 1000)`;

const live = () => gt(connections.expiresAt, now());

/** The contact key holds no draft: the row's draft is the other half of its key. */
export const contactKey = (
  session: ProtocolBuilderSession,
  replicaId: string,
): string => `unary:${sessionOwner(session)}:${replicaId}`;

/** Whether the draft is still there. */
const lockHead = Effect.fn('protocolBuilder.lockDraft')(function* (
  teamId: string,
  draftId: string,
  strength: 'update' | 'share',
) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ id: drafts.id })
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)))
    .for(strength);
  return rows.length > 0;
}, sqlErrorsOnly);

/**
 * One statement for every owner, so the rows are locked in `section_id` order
 * across owners as well as within one.
 */
const lockOwnerLeases = Effect.fn('protocolBuilder.lockOwnerLeases')(function* (
  teamId: string,
  draftId: string,
  owners: ReadonlyArray<string>,
) {
  if (owners.length === 0) return [];
  const { tx } = yield* Transaction;
  return yield* tx
    .select({
      sectionId: leases.sectionId,
      owner: leases.owner,
      epoch: leases.epoch,
    })
    .from(leases)
    .where(
      and(
        eq(leases.teamId, teamId),
        eq(leases.draftId, draftId),
        inArray(leases.owner, [...owners]),
        gt(leases.expiresAt, now()),
      ),
    )
    .orderBy(asc(leases.sectionId))
    .for('update');
}, sqlErrorsOnly);

const renewOwnerLeases = Effect.fn('protocolBuilder.renewOwnerLeases')(
  function* (teamId: string, draftId: string, owners: ReadonlyArray<string>) {
    const held = yield* lockOwnerLeases(teamId, draftId, owners);
    if (held.length > 0) {
      yield* sqlErrorsOnly(
        sync.renewHeld(draftId, [...new Set(held.map((lease) => lease.owner))]),
      );
    }
    return held;
  },
);

/**
 * Records a watch and renews the leases its tab already holds, showing it
 * editing the first of them in `section_id` order, the order `releaseLock`
 * picks the section a tab still holds by. False when the draft is gone.
 */
export const connectSocket: (
  session: ProtocolBuilderSession,
  key: string,
) => Effect.Effect<boolean, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.connect',
)(function* (session: ProtocolBuilderSession, key: string) {
  const teamId = session.access.teamId;
  const owner = sessionOwner(session);
  const replicaId = yield* ReplicaId;
  return yield* noAuditTransaction(
    'protocolBuilder.connect',
    session.access,
    Effect.gen(function* () {
      // Shared, so connects run side by side but never across a grace's
      // release, which takes the head exclusively.
      if (!(yield* lockHead(teamId, session.draftId, 'share'))) return false;
      const viewing = sessionPresence(session, 'viewing');
      const { tx } = yield* Transaction;
      yield* tx
        .insert(connections)
        .values({
          teamId,
          draftId: session.draftId,
          connectionId: key,
          socketId: session.connectionId,
          kind: 'socket',
          owner,
          userId: viewing.userId,
          displayName: viewing.displayName,
          mode: viewing.mode,
          replicaId,
          expiresAt: expiryFromNow(),
        })
        .onConflictDoUpdate({
          target: [connections.draftId, connections.connectionId],
          set: {
            displayName: viewing.displayName,
            replicaId,
            expiresAt: expiryFromNow(),
          },
        });
      const held = yield* renewOwnerLeases(teamId, session.draftId, [owner]);
      const editing = held[0]?.sectionId;
      yield* tx
        .update(connections)
        .set({
          mode: editing === undefined ? 'viewing' : 'editing',
          sectionId: editing ?? null,
        })
        .where(
          and(
            eq(connections.teamId, teamId),
            eq(connections.draftId, session.draftId),
            eq(connections.connectionId, key),
          ),
        )
        .returning({ connectionId: connections.connectionId });
      return true;
    }).pipe(sqlErrorsOnly),
  );
});

/** How long one draft's liveness pass waits for a lock before giving up. */
export const LIVENESS_LOCK_TIMEOUT_MS = 2_000;

/**
 * Extends every row of `local` on one draft that this replica wrote and that
 * is still live, and renews the leases of the owners behind them. A row that
 * is no longer live is not brought back here: it comes back `missing`, for the
 * caller to re-connect through the path that re-checks the leases.
 */
export const renewConnections: (
  access: TeamAccess,
  draftId: string,
  local: ReadonlyArray<LocalRegistration>,
) => Effect.Effect<Liveness, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.liveness',
)(function* (
  access: TeamAccess,
  draftId: string,
  local: ReadonlyArray<LocalRegistration>,
) {
  if (local.length === 0) return NONE_MISSING;
  const replicaId = yield* ReplicaId;
  return yield* noAuditTransaction(
    'protocolBuilder.liveness',
    access,
    Effect.gen(function* () {
      const transaction = yield* Transaction;
      // A draft whose head or rows another transaction holds fails this pass
      // rather than holding up the keeper; the next tick asks again.
      yield* transaction.sql.unsafe(
        `SET LOCAL lock_timeout = '${LIVENESS_LOCK_TIMEOUT_MS}ms'`,
      );
      if (!(yield* lockHead(access.teamId, draftId, 'share'))) return GONE;
      const { tx } = transaction;
      const locked = yield* tx
        .select({
          connectionId: connections.connectionId,
          owner: connections.owner,
        })
        .from(connections)
        .where(
          and(
            eq(connections.teamId, access.teamId),
            eq(connections.draftId, draftId),
            inArray(
              connections.connectionId,
              local.map((registration) => registration.key),
            ),
            eq(connections.replicaId, replicaId),
            live(),
          ),
        )
        .orderBy(asc(connections.connectionId))
        .for('update');
      const extended = locked.map((row) => row.connectionId);
      if (extended.length > 0) {
        yield* tx
          .update(connections)
          .set({
            expiresAt: sql`CASE WHEN ${connections.kind} = 'socket'
              THEN ${expiryFromNow()}
              ELSE greatest(${connections.expiresAt}, ${expiryFromNow()})
            END`,
          })
          .where(
            and(
              eq(connections.teamId, access.teamId),
              eq(connections.draftId, draftId),
              inArray(connections.connectionId, extended),
            ),
          )
          .returning({ connectionId: connections.connectionId });
      }
      yield* renewOwnerLeases(access.teamId, draftId, [
        ...new Set(locked.map((row) => row.owner)),
      ]);
      const renewed = new Set(extended);
      const pass: Liveness = {
        gone: false,
        missing: local.filter((registration) => !renewed.has(registration.key)),
      };
      return pass;
    }).pipe(sqlErrorsOnly),
  );
});

/**
 * Records that the owner is still calling through this replica, and renews
 * what it holds now rather than at the next tick. False when the draft is gone.
 */
export const upsertContact: (
  session: ProtocolBuilderSession,
) => Effect.Effect<boolean, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.contact',
)(function* (session: ProtocolBuilderSession) {
  const teamId = session.access.teamId;
  const owner = sessionOwner(session);
  const presence = sessionPresence(session, 'viewing');
  const replicaId = yield* ReplicaId;
  return yield* noAuditTransaction(
    'protocolBuilder.contact',
    session.access,
    Effect.gen(function* () {
      if (!(yield* lockHead(teamId, session.draftId, 'share'))) return false;
      const { tx } = yield* Transaction;
      yield* tx
        .insert(connections)
        .values({
          teamId,
          draftId: session.draftId,
          connectionId: contactKey(session, replicaId),
          kind: 'contact',
          owner,
          userId: presence.userId,
          displayName: presence.displayName,
          mode: presence.mode,
          replicaId,
          expiresAt: expiryFromNow(),
        })
        .onConflictDoUpdate({
          target: [connections.draftId, connections.connectionId],
          set: {
            expiresAt: sql`greatest(${connections.expiresAt}, ${expiryFromNow()})`,
          },
        });
      yield* renewOwnerLeases(teamId, session.draftId, [owner]);
      return true;
    }).pipe(sqlErrorsOnly),
  );
});

export const expireConnection: (
  registration: LocalRegistration,
) => Effect.Effect<void, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.expireConnection',
)(function* (registration: LocalRegistration) {
  const { session } = registration;
  yield* noAuditTransaction(
    'protocolBuilder.expireConnection',
    session.access,
    Effect.gen(function* () {
      const { tx } = yield* Transaction;
      yield* tx
        .update(connections)
        .set({ expiresAt: now() })
        .where(
          and(
            eq(connections.teamId, session.access.teamId),
            eq(connections.draftId, session.draftId),
            eq(connections.connectionId, registration.key),
            live(),
          ),
        )
        .returning({ connectionId: connections.connectionId });
    }).pipe(sqlErrorsOnly),
  );
});

const hasLiveSocket = Effect.fn('protocolBuilder.hasLiveSocket')(function* (
  teamId: string,
  draftId: string,
  owner: string,
) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ connectionId: connections.connectionId })
    .from(connections)
    .where(
      and(
        eq(connections.teamId, teamId),
        eq(connections.draftId, draftId),
        eq(connections.owner, owner),
        eq(connections.kind, 'socket'),
        live(),
      ),
    )
    .limit(1);
  return rows.length > 0;
}, sqlErrorsOnly);

/**
 * Gives back every live lease the owner holds on the draft, unless one of its
 * sockets is still live on some replica. Asked under the head held
 * exclusively, so no connect, contact or liveness pass runs alongside it.
 */
export const releaseOwner: (
  session: ProtocolBuilderSession,
) => Effect.Effect<OwnerRelease, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.releaseOwner',
)(function* (session: ProtocolBuilderSession) {
  const teamId = session.access.teamId;
  const owner = sessionOwner(session);
  return yield* noAuditTransaction(
    'protocolBuilder.releaseOwner',
    session.access,
    Effect.gen(function* () {
      // A deleted draft took its leases with it.
      if (!(yield* lockHead(teamId, session.draftId, 'update'))) {
        return NOTHING_HELD;
      }
      if (yield* hasLiveSocket(teamId, session.draftId, owner)) {
        return STILL_CONNECTED;
      }
      const held = yield* lockOwnerLeases(teamId, session.draftId, [owner]);
      for (const lease of held) {
        yield* sqlErrorsOnly(
          sync.release(session.draftId, lease.sectionId, owner, lease.epoch),
        );
      }
      const events = yield* appendProtocolEvents(
        teamId,
        session.draftId,
        held.map((lease): ProtocolEventRecord => ({
          kind: 'lock',
          sectionId: makeSectionId(parseSectionId(lease.sectionId)),
        })),
      );
      const release: OwnerRelease = { released: true, events };
      return release;
    }).pipe(sqlErrorsOnly),
  );
});

type PresenceRow = {
  readonly draftId: string;
  readonly socketId: string | null;
  readonly userId: string;
  readonly displayName: string;
  readonly mode: string;
  readonly sectionId: string | null;
};

const presenceRows = Effect.fn('protocolBuilder.presenceRows')(function* (
  teamId: string,
  draftIds: ReadonlyArray<string>,
) {
  if (draftIds.length === 0) return [];
  const { tx } = yield* Transaction;
  const rows: ReadonlyArray<PresenceRow> = yield* tx
    .select({
      draftId: connections.draftId,
      socketId: connections.socketId,
      userId: connections.userId,
      displayName: connections.displayName,
      mode: connections.mode,
      sectionId: connections.sectionId,
    })
    .from(connections)
    .where(
      and(
        eq(connections.teamId, teamId),
        inArray(connections.draftId, [...draftIds]),
        eq(connections.kind, 'socket'),
        // The transaction's start rather than the clock: only a stable
        // bound lets the socket index range over `expires_at`.
        gt(connections.expiresAt, sql`now()`),
      ),
    )
    .orderBy(asc(connections.createdAt), asc(connections.connectionId));
  return rows;
}, sqlErrorsOnly);

const groupPresence = (
  rows: ReadonlyArray<PresenceRow>,
): ReadonlyMap<string, ReadonlyArray<Presence>> => {
  const present = new Map<string, Map<string, Presence>>();
  for (const row of rows) {
    if (row.socketId === null) continue;
    const inDraft = present.get(row.draftId) ?? new Map<string, Presence>();
    present.set(row.draftId, inDraft);
    const shown = inDraft.get(row.socketId);
    if (shown?.mode === 'editing') continue;
    const mode = row.mode === 'editing' ? 'editing' : 'viewing';
    inDraft.set(row.socketId, {
      sessionId: row.socketId,
      userId: row.userId,
      displayName: row.displayName,
      mode,
      ...(row.sectionId === null
        ? {}
        : { sectionId: makeSectionId(parseSectionId(row.sectionId)) }),
    });
  }
  return new Map(
    [...present].map(([draftId, inDraft]) => [draftId, [...inDraft.values()]]),
  );
};

/**
 * One entry per socket, across every replica: a socket carrying several
 * watches shows once, editing if any of them is. Listed in the order the
 * sockets first connected.
 */
export const livePresence: (
  access: TeamAccess,
  draftIds: ReadonlyArray<string>,
) => Effect.Effect<
  ReadonlyMap<string, ReadonlyArray<Presence>>,
  SqlError.SqlError,
  Database
> = Effect.fn('protocolBuilder.livePresence')(function* (
  access: TeamAccess,
  draftIds: ReadonlyArray<string>,
) {
  if (draftIds.length === 0) {
    return new Map<string, ReadonlyArray<Presence>>();
  }
  const rows = yield* TenantScope.open(
    access,
    presenceRows(access.teamId, draftIds),
  );
  return groupPresence(rows);
});

/**
 * Shows the caller's own watches on its socket, never another tab's sharing
 * that socket, editing the first section its tab holds a live lease on, in
 * `section_id` order as `connectSocket` does, else viewing. Read after the
 * rows are locked, so an update that is retried or lands late writes what the
 * tab holds then. Only for a caller on a socket: a unary caller's connection
 * id is its login's session id, which every HTTP watch of that login carries
 * as its socket id too.
 */
export const setSocketMode: (
  session: ProtocolBuilderSession,
) => Effect.Effect<void, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.setMode',
)(function* (session: ProtocolBuilderSession) {
  const teamId = session.access.teamId;
  const owner = sessionOwner(session);
  yield* noAuditTransaction(
    'protocolBuilder.setMode',
    session.access,
    Effect.gen(function* () {
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .select({ connectionId: connections.connectionId })
        .from(connections)
        .where(
          and(
            eq(connections.teamId, teamId),
            eq(connections.draftId, session.draftId),
            eq(connections.socketId, session.connectionId),
            eq(connections.owner, owner),
            eq(connections.kind, 'socket'),
            live(),
          ),
        )
        .orderBy(asc(connections.connectionId))
        .for('update');
      if (rows.length === 0) return;
      const [held] = yield* tx
        .select({ sectionId: leases.sectionId })
        .from(leases)
        .where(
          and(
            eq(leases.teamId, teamId),
            eq(leases.draftId, session.draftId),
            eq(leases.owner, owner),
            gt(leases.expiresAt, now()),
          ),
        )
        .orderBy(asc(leases.sectionId))
        .limit(1);
      yield* tx
        .update(connections)
        .set({
          mode: held === undefined ? 'viewing' : 'editing',
          sectionId: held?.sectionId ?? null,
        })
        .where(
          and(
            eq(connections.teamId, teamId),
            eq(connections.draftId, session.draftId),
            inArray(
              connections.connectionId,
              rows.map((row) => row.connectionId),
            ),
          ),
        )
        .returning({ connectionId: connections.connectionId });
    }).pipe(sqlErrorsOnly),
  );
});

/** Where a relay starts: the next cursor it delivers, and the sections held. */
type RelaySeed = {
  readonly next: bigint;
  /** The sections whose latest lock event names a holder. */
  readonly locks: ReadonlySet<string>;
};

type RelayRead = {
  readonly events: ReadonlyMap<string, ReadonlyArray<LoggedProtocolEvent>>;
  readonly presence: ReadonlyMap<string, ReadonlyArray<Presence>>;
};

type RelayPoll = RelayRead & {
  /** `relaySection` keys of the live leases on the polled drafts. */
  readonly live: ReadonlySet<string>;
};

export const relaySection = (draftId: string, sectionId: string): string =>
  `${draftId}\u0000${sectionId}`;

/**
 * One statement, so the cursor and the locks come from one snapshot; a lock
 * event from `next` on reaches the relay through its reads.
 */
export const seedRelay: (
  access: TeamAccess,
  draftId: string,
) => Effect.Effect<RelaySeed, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.seedRelay',
)(function* (access: TeamAccess, draftId: string) {
  return yield* noAuditTransaction(
    'protocolBuilder.relayRead',
    access,
    Effect.gen(function* () {
      const { tx } = yield* Transaction;
      const ofDraft = and(
        eq(protocolEvents.teamId, access.teamId),
        eq(protocolEvents.draftId, draftId),
      );
      const head = tx
        .select({ last: max(protocolEvents.cursor).as('last') })
        .from(protocolEvents)
        .where(ofDraft)
        .as('head');
      const latest = tx
        .selectDistinctOn([protocolEvents.sectionId], {
          sectionId: protocolEvents.sectionId,
          owner: protocolEvents.owner,
        })
        .from(protocolEvents)
        .where(and(ofDraft, eq(protocolEvents.kind, 'lock')))
        .orderBy(asc(protocolEvents.sectionId), desc(protocolEvents.cursor))
        .as('latest');
      const rows = yield* tx
        .select({
          last: head.last,
          sectionId: latest.sectionId,
          owner: latest.owner,
        })
        .from(head)
        .leftJoin(latest, sql`true`);
      const seed: RelaySeed = {
        next: (rows[0]?.last ?? 0n) + 1n,
        locks: new Set(
          rows.flatMap((row) =>
            row.sectionId !== null && row.owner !== null ? [row.sectionId] : [],
          ),
        ),
      };
      return seed;
    }).pipe(sqlErrorsOnly),
  );
});

/** A woken relay's read: its log from `next`, when given, and who is present. */
export const readRelay: (
  access: TeamAccess,
  draftId: string,
  want: { readonly next: bigint | undefined; readonly presence: boolean },
) => Effect.Effect<RelayRead, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.relayRead',
)(function* (
  access: TeamAccess,
  draftId: string,
  want: { readonly next: bigint | undefined; readonly presence: boolean },
) {
  return yield* noAuditTransaction(
    'protocolBuilder.relayRead',
    access,
    Effect.gen(function* () {
      const events = yield* readRelayBatch(
        access.teamId,
        want.next === undefined ? [] : [{ draftId, next: want.next }],
      );
      const rows = yield* presenceRows(
        access.teamId,
        want.presence ? [draftId] : [],
      );
      const read: RelayRead = { events, presence: groupPresence(rows) };
      return read;
    }).pipe(sqlErrorsOnly),
  );
});

const liveSections = Effect.fn('protocolBuilder.liveSections')(function* (
  teamId: string,
  draftIds: ReadonlyArray<string>,
) {
  if (draftIds.length === 0) return new Set<string>();
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({ draftId: leases.draftId, sectionId: leases.sectionId })
    .from(leases)
    .where(
      and(
        eq(leases.teamId, teamId),
        inArray(leases.draftId, [...draftIds]),
        gt(leases.expiresAt, now()),
      ),
    );
  return new Set(rows.map((row) => relaySection(row.draftId, row.sectionId)));
}, sqlErrorsOnly);

/**
 * The safety poll's read for one team's relays: their logs, who is present,
 * and the leases still live, which tells the reaper where to look.
 */
export const pollRelays: (
  access: TeamAccess,
  wants: ReadonlyArray<{ readonly draftId: string; readonly next: bigint }>,
) => Effect.Effect<RelayPoll, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.relayPoll',
)(function* (
  access: TeamAccess,
  wants: ReadonlyArray<{ readonly draftId: string; readonly next: bigint }>,
) {
  return yield* noAuditTransaction(
    'protocolBuilder.relayRead',
    access,
    Effect.gen(function* () {
      const draftIds = wants.map((want) => want.draftId);
      const events = yield* readRelayBatch(access.teamId, wants);
      const rows = yield* presenceRows(access.teamId, draftIds);
      const leased = yield* liveSections(access.teamId, draftIds);
      const poll: RelayPoll = {
        events,
        presence: groupPresence(rows),
        live: leased,
      };
      return poll;
    }).pipe(sqlErrorsOnly),
  );
});

/**
 * Logs the release of each candidate section whose latest lock event still
 * names a holder but whose lease has lapsed, as when the replica that held it
 * stopped without giving it back. Asked again under the head held
 * exclusively, so replicas reaping at once log one release between them.
 */
export const reapExpired: (
  access: TeamAccess,
  draftId: string,
  candidates: ReadonlyArray<string>,
) => Effect.Effect<
  ReadonlyArray<LoggedProtocolEvent>,
  SqlError.SqlError,
  Database
> = Effect.fn('protocolBuilder.reap')(function* (
  access: TeamAccess,
  draftId: string,
  candidates: ReadonlyArray<string>,
) {
  if (candidates.length === 0) return [];
  const teamId = access.teamId;
  return yield* noAuditTransaction(
    'protocolBuilder.reap',
    access,
    Effect.gen(function* () {
      if (!(yield* lockHead(teamId, draftId, 'update'))) return [];
      const { tx } = yield* Transaction;
      const latest = yield* tx
        .selectDistinctOn([protocolEvents.sectionId], {
          sectionId: protocolEvents.sectionId,
          owner: protocolEvents.owner,
        })
        .from(protocolEvents)
        .where(
          and(
            eq(protocolEvents.teamId, teamId),
            eq(protocolEvents.draftId, draftId),
            eq(protocolEvents.kind, 'lock'),
            inArray(protocolEvents.sectionId, [...candidates]),
          ),
        )
        .orderBy(asc(protocolEvents.sectionId), desc(protocolEvents.cursor));
      const leased = yield* tx
        .select({ sectionId: leases.sectionId })
        .from(leases)
        .where(
          and(
            eq(leases.teamId, teamId),
            eq(leases.draftId, draftId),
            inArray(leases.sectionId, [...candidates]),
            gt(leases.expiresAt, now()),
          ),
        );
      const held = new Set(leased.map((row) => row.sectionId));
      return yield* appendProtocolEvents(
        teamId,
        draftId,
        latest
          .filter((row) => row.owner !== null && !held.has(row.sectionId))
          .map((row): ProtocolEventRecord => ({
            kind: 'lock',
            sectionId: makeSectionId(parseSectionId(row.sectionId)),
          })),
      );
    }).pipe(sqlErrorsOnly),
  );
});
