// Who is connected to a protocol, on any replica, kept in `protocol_connections`
// so that every replica can renew, grace-check and list presence from the
// database rather than from its own memory.
//
// Lock order, the deadlock rule: every multi-row writer of one owner's lease
// rows first locks them in `section_id` order (`lockOwnerLeases`), and a
// transaction spanning several owners takes them in ascending
// `(draft_id, owner)` order. `connectSocket` and `releaseOwner` take the draft
// head first; liveness and contact take no head lock.
import { randomUUID } from 'node:crypto';

import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import type { Presence } from '@codaco/protocol-builder-core/contract/schemas';
import { SYNC_TABLES } from '@codaco/studio-sync/schema';
import {
  parseSectionId,
  sectionId as makeSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { noAuditTransaction } from '../audit/no-audit.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { TenantScope, type TeamAccess, Transaction } from '../db/tenant.ts';
import { createProtocolSyncServer } from '../protocol/sync.ts';
import {
  appendProtocolEvents,
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
const { protocolConnections: connections } = PROTOCOL_BUILDER_TABLES;

const sync = createProtocolSyncServer();

/** Names this process's contact rows, which only it extends or expires. */
const REPLICA_ID = randomUUID();

export type AdoptedLease = {
  readonly sectionId: ProtocolSectionId;
  readonly epoch: bigint;
};

/** A connection this replica keeps alive, and the key of its row. */
export type LocalRegistration = {
  readonly session: ProtocolBuilderSession;
  readonly key: string;
  readonly kind: 'socket' | 'contact';
};

/**
 * `released` means the owner has no live socket row anywhere, not that a lease
 * was given back: it is what decides whether the owner's staging goes too.
 */
type OwnerRelease =
  | {
      readonly released: true;
      readonly events: ReadonlyArray<LoggedProtocolEvent>;
    }
  | { readonly released: false; readonly retryInMs: number };

const now = () => sql`clock_timestamp()`;

const expiryFromNow = () =>
  sql`clock_timestamp() + make_interval(secs => ${sync.ttlMs}::float / 1000)`;

const live = () => gt(connections.expiresAt, now());

/** The contact key holds no draft: the row's draft is the other half of its key. */
export const contactKey = (session: ProtocolBuilderSession): string =>
  `unary:${sessionOwner(session)}:${REPLICA_ID}`;

const lockDraft = Effect.fn('protocolBuilder.lockDraft')(function* (
  teamId: string,
  draftId: string,
  strength: 'update' | 'share',
) {
  const { tx } = yield* Transaction;
  yield* tx
    .select({ id: drafts.id })
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.teamId, teamId)))
    .for(strength);
}, sqlErrorsOnly);

const lockOwnerLeases = Effect.fn('protocolBuilder.lockOwnerLeases')(function* (
  teamId: string,
  draftId: string,
  owner: string,
) {
  const { tx } = yield* Transaction;
  return yield* tx
    .select({ sectionId: leases.sectionId, epoch: leases.epoch })
    .from(leases)
    .where(
      and(
        eq(leases.teamId, teamId),
        eq(leases.draftId, draftId),
        eq(leases.owner, owner),
        gt(leases.expiresAt, now()),
      ),
    )
    .orderBy(asc(leases.sectionId))
    .for('update');
}, sqlErrorsOnly);

const renewOwnerLeases = Effect.fn('protocolBuilder.renewOwnerLeases')(
  function* (teamId: string, draftId: string, owner: string) {
    yield* lockOwnerLeases(teamId, draftId, owner);
    const renewed = yield* sqlErrorsOnly(sync.renewHeld(draftId, owner));
    return renewed
      .map((lease): AdoptedLease => ({
        sectionId: makeSectionId(parseSectionId(lease.sectionId)),
        epoch: lease.epoch,
      }))
      .sort((a, b) => a.sectionId.localeCompare(b.sectionId));
  },
);

export const connectSocket: (
  session: ProtocolBuilderSession,
  key: string,
) => Effect.Effect<ReadonlyArray<AdoptedLease>, SqlError.SqlError, Database> =
  Effect.fn('protocolBuilder.connect')(function* (
    session: ProtocolBuilderSession,
    key: string,
  ) {
    const teamId = session.access.teamId;
    const owner = sessionOwner(session);
    return yield* noAuditTransaction(
      'protocolBuilder.connect',
      session.access,
      Effect.gen(function* () {
        // Shared, so connects run side by side but never across a grace's
        // release, which takes the head exclusively.
        yield* lockDraft(teamId, session.draftId, 'share');
        const adopted = yield* renewOwnerLeases(teamId, session.draftId, owner);
        const editing = adopted[0]?.sectionId;
        const presence = sessionPresence(
          session,
          editing === undefined ? 'viewing' : 'editing',
          editing,
        );
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
            userId: presence.userId,
            displayName: presence.displayName,
            mode: presence.mode,
            sectionId: presence.sectionId ?? null,
            replicaId: REPLICA_ID,
            expiresAt: expiryFromNow(),
          })
          .onConflictDoUpdate({
            target: [connections.draftId, connections.connectionId],
            set: {
              mode: presence.mode,
              sectionId: presence.sectionId ?? null,
              displayName: presence.displayName,
              replicaId: REPLICA_ID,
              expiresAt: expiryFromNow(),
            },
          });
        return adopted;
      }).pipe(sqlErrorsOnly),
    );
  });

/**
 * Extends every row in `local` that is still live, and renews the leases of
 * the owners behind them. A row that is no longer live is not brought back
 * here: it comes back `missing`, for the caller to re-connect through the path
 * that re-checks the leases.
 */
export const renewConnections: (
  access: TeamAccess,
  local: ReadonlyArray<LocalRegistration>,
) => Effect.Effect<
  { readonly missing: ReadonlyArray<LocalRegistration> },
  SqlError.SqlError,
  Database
> = Effect.fn('protocolBuilder.liveness')(function* (
  access: TeamAccess,
  local: ReadonlyArray<LocalRegistration>,
) {
  if (local.length === 0) return { missing: [] };
  return yield* noAuditTransaction(
    'protocolBuilder.liveness',
    access,
    Effect.gen(function* () {
      const { tx } = yield* Transaction;
      const keys = sql.join(
        local.map(
          (registration) =>
            sql`(${registration.session.draftId}::uuid, ${registration.key}::text)`,
        ),
        sql`, `,
      );
      const renewed = yield* tx
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
            sql`(${connections.draftId}, ${connections.connectionId}) IN (${keys})`,
            live(),
          ),
        )
        .returning({
          draftId: connections.draftId,
          connectionId: connections.connectionId,
          owner: connections.owner,
        });
      const owners = new Map<string, { draftId: string; owner: string }>();
      for (const row of renewed) {
        owners.set(`${row.draftId}\u0000${row.owner}`, row);
      }
      for (const key of [...owners.keys()].sort()) {
        const pair = owners.get(key);
        if (pair === undefined) continue;
        yield* renewOwnerLeases(access.teamId, pair.draftId, pair.owner);
      }
      const extended = new Set(
        renewed.map((row) => `${row.draftId}\u0000${row.connectionId}`),
      );
      return {
        missing: local.filter(
          (registration) =>
            !extended.has(
              `${registration.session.draftId}\u0000${registration.key}`,
            ),
        ),
      };
    }).pipe(sqlErrorsOnly),
  );
});

/**
 * Records that the owner is still calling through this replica, and renews
 * what it holds now rather than at the next tick.
 */
export const upsertContact: (
  session: ProtocolBuilderSession,
) => Effect.Effect<void, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.contact',
)(function* (session: ProtocolBuilderSession) {
  const teamId = session.access.teamId;
  const owner = sessionOwner(session);
  const presence = sessionPresence(session, 'viewing');
  yield* noAuditTransaction(
    'protocolBuilder.contact',
    session.access,
    Effect.gen(function* () {
      yield* renewOwnerLeases(teamId, session.draftId, owner);
      const { tx } = yield* Transaction;
      yield* tx
        .insert(connections)
        .values({
          teamId,
          draftId: session.draftId,
          connectionId: contactKey(session),
          kind: 'contact',
          owner,
          userId: presence.userId,
          displayName: presence.displayName,
          mode: presence.mode,
          replicaId: REPLICA_ID,
          expiresAt: expiryFromNow(),
        })
        .onConflictDoUpdate({
          target: [connections.draftId, connections.connectionId],
          set: {
            expiresAt: sql`greatest(${connections.expiresAt}, ${expiryFromNow()})`,
          },
        });
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

const liveSocketWait = Effect.fn('protocolBuilder.liveSocketWait')(function* (
  teamId: string,
  draftId: string,
  owner: string,
) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select({
      retryInMs: sql<
        number | null
      >`ceil(extract(epoch from max(${connections.expiresAt}) - clock_timestamp()) * 1000)::int`,
    })
    .from(connections)
    .where(
      and(
        eq(connections.teamId, teamId),
        eq(connections.draftId, draftId),
        eq(connections.owner, owner),
        eq(connections.kind, 'socket'),
        live(),
      ),
    );
  const wait = rows[0]?.retryInMs ?? null;
  return wait === null ? undefined : Math.max(wait, 1);
}, sqlErrorsOnly);

/**
 * Gives back every live lease the owner holds on the draft, unless one of its
 * sockets is still live on some replica.
 *
 * Asked once without the head lock, so a grace waiting out another replica's
 * socket does not take the draft exclusively on every retry, and again under
 * it, which is the answer that counts: a connect holds the head shared.
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
      const early = yield* liveSocketWait(teamId, session.draftId, owner);
      if (early !== undefined) {
        return { released: false, retryInMs: early } satisfies OwnerRelease;
      }
      yield* lockDraft(teamId, session.draftId, 'update');
      const wait = yield* liveSocketWait(teamId, session.draftId, owner);
      if (wait !== undefined) {
        return { released: false, retryInMs: wait } satisfies OwnerRelease;
      }
      const held = yield* lockOwnerLeases(teamId, session.draftId, owner);
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
      return { released: true, events } satisfies OwnerRelease;
    }).pipe(sqlErrorsOnly),
  );
});

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
    Effect.gen(function* () {
      const { tx } = yield* Transaction;
      return yield* tx
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
            eq(connections.teamId, access.teamId),
            inArray(connections.draftId, [...draftIds]),
            eq(connections.kind, 'socket'),
            live(),
          ),
        )
        .orderBy(asc(connections.createdAt), asc(connections.connectionId));
    }).pipe(sqlErrorsOnly),
  );
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
});

/** A no-op on the unary plane, whose connection id names no socket row. */
export const setSocketMode: (
  session: ProtocolBuilderSession,
  mode: Presence['mode'],
  sectionId?: ProtocolSectionId,
) => Effect.Effect<void, SqlError.SqlError, Database> = Effect.fn(
  'protocolBuilder.setMode',
)(function* (
  session: ProtocolBuilderSession,
  mode: Presence['mode'],
  sectionId?: ProtocolSectionId,
) {
  yield* noAuditTransaction(
    'protocolBuilder.setMode',
    session.access,
    Effect.gen(function* () {
      const { tx } = yield* Transaction;
      yield* tx
        .update(connections)
        .set({ mode, sectionId: sectionId ?? null })
        .where(
          and(
            eq(connections.teamId, session.access.teamId),
            eq(connections.draftId, session.draftId),
            eq(connections.socketId, session.connectionId),
            live(),
          ),
        )
        .returning({ connectionId: connections.connectionId });
    }).pipe(sqlErrorsOnly),
  );
});
