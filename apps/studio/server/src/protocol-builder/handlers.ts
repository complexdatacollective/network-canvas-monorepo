// The protocol-builder host contract, implemented against Studio.
//
// Every procedure starts by resolving the protocol to a tenant and a draft
// (`session.ts`): the contract names neither, and a caller who cannot reach the
// line gets the same `ProtocolNotFound` as one asking for a line that does not
// exist, so this is no more an existence oracle than `studies.get` is. What
// follows is the host command (`host.ts`), the events it logged published to
// the watchers, and its outcome answered as the contract spells it — nothing
// else is decided here.
import { randomUUID } from 'node:crypto';

import { Clock, Effect, Option, Predicate, Result, Stream } from 'effect';
import type * as Layer from 'effect/Layer';
import type * as Rpc from 'effect/unstable/rpc/Rpc';

import {
  ProtocolBuilderGroup,
  type ProtocolBuilderRpcs,
} from '@codaco/protocol-builder-core/contract';
import {
  InvalidShape,
  NotLockHolder,
  PromotionFailed,
  ProtocolNotFound,
  ReferencesRemain,
  SectionExists,
  SectionNotFound,
  SectionsLocked,
} from '@codaco/protocol-builder-core/contract/errors';
import type { ProtocolEvent } from '@codaco/protocol-builder-core/contract/schemas';
import {
  sectionId as makeSectionId,
  parseSectionId,
} from '@codaco/studio-sync/taxonomy';

import { type AuthService } from '../auth/service.ts';
import { Database } from '../db/client.ts';
import { TenantScope } from '../db/tenant.ts';
import { openAssetKey } from '../protocol/asset-keys.ts';
import { type RateLimiter } from '../rate-limit/limiter.ts';
import type { StudioServices } from '../rpc/deps.ts';
import { ObjectStore } from '../storage/object-store.ts';
import { readProtocolEvents, type LoggedProtocolEvent } from './events.ts';
import {
  acquireLock,
  create,
  deleteEntityType,
  deleteStage,
  deleteVariable,
  listSectionIds,
  readSection,
  releaseConnection,
  releaseLock,
  renewLease,
  sessionOwner,
  sessionPresence,
  submit,
  type ProtocolBuilderSession,
  type RefactorOutcome,
} from './host.ts';
import { Leases, RENEW_INTERVAL_MS } from './leases.ts';
import { Presence } from './presence.ts';
import { ProtocolEvents } from './publisher.ts';
import {
  committedDescriptors,
  committedInspection,
  committedPreview,
  StagedImports,
  type Inspection,
  type ResourceOutcome,
} from './resources.ts';
import { openSession, ownerPrefix, WsConnection } from './session.ts';
import type { WriteOperation, WriteReceipt } from './writeReceipts.ts';
import { readWriteReceipt } from './writeReceipts.ts';

/**
 * How long a watcher's authorisation is trusted for.
 *
 * `WatchProtocol` resolves membership once and then runs for as long as the
 * researcher keeps the protocol open, so a grant revoked in between would
 * otherwise go on delivering research protocol changes to someone who no
 * longer has any. Re-resolved no less often than the leases are renewed, so a
 * revocation costs at most one renewal interval of access nobody has.
 */
export const REAUTHORIZE_MS = RENEW_INTERVAL_MS;

/**
 * What a command's own failures mean to a caller.
 *
 * A caller whose role or grant was taken away since `openSession` read it is
 * refused inside the command's transaction (`host.ts`), and answered what a
 * caller who never had the protocol is answered. Every other failure — the
 * database, a draft structure the code was not written against — is a fault
 * the contract has no word for, and is a defect, as it was an internal error
 * before.
 */
const command = <A, E, R>(
  protocolId: string,
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, ProtocolNotFound, R> =>
  self.pipe(
    Effect.catch((error) =>
      Predicate.isTagged(error, 'Forbidden') ||
      Predicate.isTagged(error, 'ProtocolCommandAuthorizationError')
        ? Effect.fail(new ProtocolNotFound({ protocolId }))
        : Effect.die(error),
    ),
  );

/**
 * Where one edit's staged imports live: the draft, the owner and the edit.
 *
 * Not the connection: an edit outlives a dropped socket, and one owner can
 * have two edits open at once — a codebook dialog over a stage editor, or two
 * tabs — whose cancels must not reach each other. Not the owner alone either,
 * for the same reason.
 */
const stagingKey = (session: ProtocolBuilderSession, editId: string) =>
  `${ownerPrefix(session)}${editId}`;

/**
 * A write's identity, for the receipt that answers its retry: the draft it
 * was made in, which of the two keyed procedures it was, and the id the
 * client promised to repeat.
 */
const writeKey = (
  session: ProtocolBuilderSession,
  operation: WriteOperation,
  requestId: string,
) => ({ draftId: session.draftId, operation, requestId });

/** A recorded submit, answered as the contract answers a fresh one. */
const submitted = (receipt: WriteReceipt) => ({
  revision: receipt.revision,
  ...(receipt.promoted === undefined ? {} : { promoted: receipt.promoted }),
});

/** A recorded create, which always names the section that attempt made. */
const created = (receipt: WriteReceipt) =>
  receipt.createdSection === undefined
    ? Effect.die(new Error('a create receipt names no section'))
    : Effect.succeed({
        sectionId: receipt.createdSection,
        revision: receipt.revision,
        ...(receipt.promoted === undefined
          ? {}
          : { promoted: receipt.promoted }),
      });

/**
 * A refactor either took every section it writes and left nothing naming what
 * it removed, or it made no change and says which of the two stopped it. A
 * subject that does not exist is a failure the contract's own errors do not
 * cover — they name a protocol or a section, and this is neither — so it is a
 * defect, where it was oRPC's `NOT_FOUND`.
 */
const applied = (outcome: RefactorOutcome | undefined) => {
  if (outcome === undefined) {
    return Effect.die(new Error('no such codebook subject'));
  }
  if (outcome.status === 'blocked') {
    return Effect.fail(new SectionsLocked({ blocked: outcome.blocked }));
  }
  if (outcome.status === 'referenced') {
    return Effect.fail(new ReferencesRemain({ remaining: outcome.remaining }));
  }
  return Effect.succeed({
    revision: outcome.revision,
    changedSections: outcome.changedSections,
  });
};

/**
 * An event as the contract carries it: a replayable one with its cursor, so a
 * client resumes from the last one it saw; presence without, because it is
 * not replayable and must never move that position.
 */
const onTheWire = (entry: LoggedProtocolEvent): ProtocolEvent =>
  entry.cursor === undefined || entry.event.type === 'presence'
    ? entry.event
    : { ...entry.event, cursor: entry.cursor };

/**
 * Every procedure of the group, over the services one server holds: the
 * lease keeper, presence, the live fan-out and the staged imports are
 * per-process state, shared by both mounts (`rpc.ts`), so a lock taken over
 * `/rpc/protocol-builder` is renewed and released by the same keeper as one
 * taken over `/ws`.
 */
export const ProtocolBuilderHandlers: Layer.Layer<
  Rpc.ToHandler<ProtocolBuilderRpcs>,
  never,
  | StudioServices
  | AuthService
  | RateLimiter
  | ObjectStore
  | Leases
  | Presence
  | ProtocolEvents
  | StagedImports
> = ProtocolBuilderGroup.toLayer(
  Effect.gen(function* () {
    const database = yield* Database;
    const leases = yield* Leases;
    const presence = yield* Presence;
    const events = yield* ProtocolEvents;
    const staged = yield* StagedImports;
    const objectStore = yield* ObjectStore;

    const publish = (
      session: ProtocolBuilderSession,
      entries: ReadonlyArray<LoggedProtocolEvent>,
    ) =>
      entries.length > 0
        ? events.publish(session.draftId, entries)
        : Effect.void;

    const publishPresence = (session: ProtocolBuilderSession) =>
      Effect.flatMap(presence.list(session.draftId), (present) =>
        events.publish(session.draftId, [
          { event: { type: 'presence', present } },
        ]),
      );

    /** This edit's staging area, opened now if it has none yet. */
    const stagingFor = (session: ProtocolBuilderSession, editId: string) =>
      staged.for(stagingKey(session, editId), sessionOwner(session));

    const assetsDocument = (session: ProtocolBuilderSession) =>
      Effect.map(
        command(
          session.protocolId,
          readSection(session, makeSectionId({ kind: 'assets' })),
        ),
        (assets) => assets?.document ?? {},
      );

    /**
     * Everything an owner whose reconnection never came owes its colleagues:
     * its locks back, with the lock events that say so, and its staged imports
     * dropped. The lease keeper runs this once the reconnect grace is up, not
     * when a socket ends: the tab behind that socket is one blip away from
     * asking for its section again, and the section is still its own. It runs
     * in the keeper's scope, long after the call that opened the channel, so
     * it carries the database it needs.
     */
    const endOwner = (session: ProtocolBuilderSession): Effect.Effect<void> =>
      Effect.gen(function* () {
        const owner = sessionOwner(session);
        const held = yield* leases.heldSections(session.draftId, owner);
        // Renewal stops here rather than after the release, because it must
        // stop whatever the release does: this runs from a timer, and a
        // process left renewing the leases of a tab that has gone would be a
        // lock nobody could ever take. Dropped first, an unreachable database
        // costs the section one lease expiry instead.
        for (const sectionId of held) {
          yield* leases.drop(session.draftId, sectionId, owner);
        }
        yield* staged.releaseMatching(ownerPrefix(session));
        const released = yield* Effect.orDie(releaseConnection(session, held));
        yield* publish(session, released.events);
      }).pipe(Effect.provideService(Database, database));

    /**
     * Fills a committed API key's value in from `protocol_asset_keys` (#1900).
     *
     * The stored manifest carries a key asset's name and type and never its
     * value, so a committed inspection would otherwise answer with no value at
     * all — and a value is exactly what `inspect` is for here: the editor's map
     * preview builds the same Mapbox request the interview will. This is the
     * researcher preview the issue admits decryption for, and the only read
     * path that makes one.
     *
     * A staged key has not been sealed yet and is answered out of this
     * process's memory by `StagedResources.inspect`, so an inspection that
     * already carries a value is passed through untouched.
     */
    const withCommittedAssetKey = Effect.fnUntraced(function* (
      session: ProtocolBuilderSession,
      resourceId: string,
      outcome: ResourceOutcome<Inspection>,
    ) {
      if (outcome.status !== 'ok') return outcome;
      if (outcome.data.descriptor.kind !== 'apikey') return outcome;
      if (outcome.data.value !== undefined) return outcome;
      const value = yield* Effect.orDie(
        TenantScope.open(
          session.access,
          openAssetKey(session.cipher, {
            teamId: session.access.teamId,
            protocolId: session.protocolId,
            assetId: resourceId,
          }),
        ),
      );
      // A manifest entry with no sealed row is a protocol written before this
      // existed, or one whose key was never promoted: the descriptor is still
      // the truth about the asset, so it is answered without a value rather
      // than as a missing resource.
      if (value === undefined) return outcome;
      return {
        status: 'ok' as const,
        data: { ...outcome.data, value },
      };
    });

    return ProtocolBuilderGroup.of({
      AcquireLock: Effect.fn('protocolBuilder.AcquireLock')(function* ({
        protocolId,
        sectionId,
      }) {
        const session = yield* openSession(protocolId);
        const result = yield* command(
          protocolId,
          acquireLock(session, sectionId),
        );
        if (result.outcome === undefined) {
          return yield* new SectionNotFound({ sectionId });
        }
        if (result.lease !== undefined) {
          const epoch = result.lease.epoch;
          yield* leases.hold({
            // The keeper has no transaction to give, so the host is what turns
            // each renewal into one — the same division `endOwner` has, and
            // the one `SyncClient` gets from `SyncTransport`.
            renew: Effect.provideService(
              renewLease(session, sectionId, epoch),
              Database,
              database,
            ),
            draftId: session.draftId,
            sectionId,
            owner: sessionOwner(session),
          });
          // Presence is a connection's, and a unary call has none: the cookie
          // session it falls back to for ownership is shared by every tab of a
          // browser and never ends, so a participant joined for it is one
          // nothing could ever remove. The lock event this publishes is what
          // tells a colleague who has the section.
          if (Option.isSome(yield* Effect.serviceOption(WsConnection))) {
            yield* presence.put(
              session.draftId,
              sessionPresence(session, 'editing', sectionId),
            );
          }
        }
        yield* publish(session, result.events);
        if (result.lease !== undefined) yield* publishPresence(session);
        return result.outcome;
      }),

      ReleaseLock: Effect.fn('protocolBuilder.ReleaseLock')(function* ({
        protocolId,
        sectionId,
      }) {
        const session = yield* openSession(protocolId);
        const result = yield* command(
          protocolId,
          releaseLock(session, sectionId),
        );
        const owner = sessionOwner(session);
        yield* leases.drop(session.draftId, sectionId, owner);
        // A tab can hold two sections at once — a codebook dialog over a stage
        // editor — so giving one back does not stop it editing. Presence
        // follows what is left rather than being set to viewing, or a
        // colleague would be told this tab is editing nothing while its
        // remaining lease is still renewed.
        const [stillHeld] = yield* leases.heldSections(session.draftId, owner);
        yield* presence.setMode(
          session.draftId,
          session.connectionId,
          stillHeld === undefined ? 'viewing' : 'editing',
          stillHeld,
        );
        yield* publish(session, result.events);
        if (result.events.length > 0) yield* publishPresence(session);
      }),

      GetSection: Effect.fn('protocolBuilder.GetSection')(function* ({
        protocolId,
        sectionId,
      }) {
        const session = yield* openSession(protocolId);
        const state = yield* command(
          protocolId,
          readSection(session, sectionId),
        );
        if (state === undefined) {
          return yield* new SectionNotFound({ sectionId });
        }
        return state;
      }),

      ListSections: Effect.fn('protocolBuilder.ListSections')(function* ({
        protocolId,
      }) {
        const session = yield* openSession(protocolId);
        return {
          sectionIds: yield* command(protocolId, listSectionIds(session)),
        };
      }),

      WatchProtocol: ({ protocolId, since }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const session = yield* openSession(protocolId);
            // Subscribed before the backlog is read, so an event committed
            // between the two is queued rather than lost; the cursor check
            // below drops the overlap.
            const live = yield* events.subscribe(session.draftId);
            // The channel is the connection: while it runs, every lease its
            // owner holds is renewed however long they go without calling
            // anything. Its ending starts the reconnect grace rather than the
            // release, and `endOwner` is what runs if nothing of this owner's
            // comes back.
            yield* leases.connect(
              sessionOwner(session),
              session.draftId,
              endOwner(session),
            );
            // Presence is the connection's, so it goes with the connection
            // even though the locks stay: a colleague's cursor cannot outlive
            // the socket it was drawn from. Registered before the join, so it
            // runs after the join's own release has taken this watcher out.
            yield* Effect.addFinalizer(() => publishPresence(session));
            yield* presence.join(
              session.draftId,
              sessionPresence(session, 'viewing'),
            );
            yield* publishPresence(session);
            const from = since === undefined ? undefined : BigInt(since);
            const backlog = yield* Effect.orDie(
              TenantScope.open(
                session.access,
                readProtocolEvents(
                  session.access.teamId,
                  session.draftId,
                  from,
                ),
              ),
            );
            const lastBacklog = backlog.at(-1)?.cursor;
            let last = lastBacklog === undefined ? from : BigInt(lastBacklog);
            // The join above published this watcher's own arrival, which the
            // subscription delivers: the first live event a new watcher sees
            // is who is here.
            let authorizedAt = yield* Clock.currentTimeMillis;
            const delivered = live.pipe(
              // A watcher too far behind is dropped to the replay path: its
              // stream fails, and the client's reconnect resumes from the last
              // cursor it saw. Not a refusal the contract names, so a defect.
              Stream.catchTag('SubscriberOverflow', (overflow) =>
                Stream.die(overflow),
              ),
              Stream.filterMapEffect((entry) =>
                Effect.gen(function* () {
                  // Nothing this channel carries may reach someone whose
                  // membership has been taken away since it opened. Asked
                  // before the event is handed over rather than on a timer of
                  // its own, so a socket nobody is publishing to costs
                  // nothing; ending the stream here also ends the connection
                  // that was keeping this owner's leases renewed.
                  const at = yield* Clock.currentTimeMillis;
                  if (at - authorizedAt >= REAUTHORIZE_MS) {
                    yield* openSession(protocolId);
                    authorizedAt = at;
                  }
                  // Presence carries no cursor: it is not replayable, so it
                  // must never move the position a dropped client resumes
                  // from.
                  if (entry.cursor === undefined) {
                    return Result.succeed(onTheWire(entry));
                  }
                  const cursor = BigInt(entry.cursor);
                  if (last !== undefined && cursor <= last) {
                    return Result.fail(entry);
                  }
                  last = cursor;
                  return Result.succeed(onTheWire(entry));
                }),
              ),
            );
            return Stream.concat(
              Stream.fromIterable(backlog.map(onTheWire)),
              delivered,
            );
          }),
        ),

      Submit: Effect.fn('protocolBuilder.Submit')(function* ({
        protocolId,
        requestId,
        sectionId,
        document,
        promote,
      }) {
        const session = yield* openSession(protocolId);
        // This request id's attempt is already committed, so this call is the
        // retry of an answer that was lost: it is told what that attempt
        // wrote. Asked before the promotion is planned, because a retry's
        // staged resources are gone — the first attempt took them — and
        // planning again would refuse the retry rather than answer it.
        const already = yield* Effect.orDie(
          TenantScope.open(
            session.access,
            readWriteReceipt(
              session.access.teamId,
              writeKey(session, 'submit', requestId),
            ),
          ),
        );
        if (already !== undefined) return submitted(already);
        const store =
          promote === undefined
            ? undefined
            : yield* stagingFor(session, promote.editId);
        // The promotion is planned before anything is written: its bytes go
        // to the object store, where nothing names them, and only the section
        // write below puts them in the manifest. A refused submit therefore
        // leaves the protocol as it was and the resources still staged.
        const planned =
          promote === undefined || store === undefined
            ? undefined
            : yield* store.plan(objectStore, promote.resourceIds);
        if (planned?.status === 'failed') {
          return yield* new PromotionFailed({
            sectionId,
            failure: planned.failure,
          });
        }
        const result = yield* command(
          protocolId,
          submit(session, sectionId, document, {
            requestId,
            ...(planned === undefined
              ? {}
              : {
                  assetEntries: planned.data.entries,
                  promoted: planned.data.promoted,
                }),
          }),
        );
        yield* publish(session, result.events);
        const outcome = result.outcome;
        if (outcome === undefined) {
          return yield* new SectionNotFound({ sectionId });
        }
        // Another call carrying this request id got there first — the two
        // serialise behind the draft-head lock — so this one is its retry.
        if (outcome.status === 'replayed') return submitted(outcome.receipt);
        if (outcome.status === 'notLockHolder') {
          return yield* new NotLockHolder({
            sectionId,
            ...(outcome.holder === undefined ? {} : { holder: outcome.holder }),
          });
        }
        if (outcome.status === 'blocked') {
          return yield* new SectionsLocked({ blocked: outcome.blocked });
        }
        if (outcome.status === 'invalidShape') {
          return yield* new InvalidShape({ sectionId, issues: outcome.issues });
        }
        if (promote !== undefined && store !== undefined) {
          store.completePromotion(promote.resourceIds);
        }
        const promoted = planned?.data.promoted;
        return {
          revision: outcome.revision,
          ...(promoted === undefined ? {} : { promoted }),
        };
      }),

      Create: Effect.fn('protocolBuilder.Create')(function* ({
        protocolId,
        requestId,
        kind,
        document,
        position,
        promote,
      }) {
        const session = yield* openSession(protocolId);
        // This request id's attempt is already committed, so this call is the
        // retry of an answer that was lost. The section is named from the
        // record rather than minted again, because a second create would put a
        // second copy of the stage in the protocol and the retry would never
        // learn of the first.
        const already = yield* Effect.orDie(
          TenantScope.open(
            session.access,
            readWriteReceipt(
              session.access.teamId,
              writeKey(session, 'create', requestId),
            ),
          ),
        );
        if (already !== undefined) return yield* created(already);
        const store =
          promote === undefined
            ? undefined
            : yield* stagingFor(session, promote.editId);
        // Planned before anything is written, so a promotion that cannot be
        // committed leaves the protocol without the section and the staged
        // resources staged. The refusal names no section: the host mints an
        // id only for one it is going to write.
        const planned =
          promote === undefined || store === undefined
            ? undefined
            : yield* store.plan(objectStore, promote.resourceIds);
        if (planned?.status === 'failed') {
          return yield* new PromotionFailed({ failure: planned.failure });
        }
        const result = yield* command(
          protocolId,
          create(session, {
            requestId,
            kind,
            document,
            ...(position === undefined ? {} : { position }),
            ...(planned === undefined
              ? {}
              : {
                  assetEntries: planned.data.entries,
                  promoted: planned.data.promoted,
                }),
            mintId: randomUUID,
          }),
        );
        yield* publish(session, result.events);
        const outcome = result.outcome;
        // Another call carrying this request id got there first, so this one
        // is its retry: the stage it made, not a second one.
        if (outcome.status === 'replayed') {
          return yield* created(outcome.receipt);
        }
        if (outcome.status === 'exists') {
          return yield* new SectionExists({ sectionId: outcome.sectionId });
        }
        if (outcome.status === 'blocked') {
          return yield* new SectionsLocked({ blocked: outcome.blocked });
        }
        if (outcome.status === 'invalidShape') {
          return yield* new InvalidShape({
            sectionId: outcome.sectionId,
            issues: outcome.issues,
          });
        }
        if (promote !== undefined && store !== undefined) {
          store.completePromotion(promote.resourceIds);
        }
        return {
          sectionId: outcome.sectionId,
          revision: outcome.revision,
          ...(planned === undefined ? {} : { promoted: planned.data.promoted }),
        };
      }),

      Delete: Effect.fn('protocolBuilder.Delete')(function* ({
        protocolId,
        sectionId,
      }) {
        const session = yield* openSession(protocolId);
        const ref = parseSectionId(sectionId);
        if (ref.kind !== 'stage') {
          return yield* new SectionNotFound({ sectionId });
        }
        const result = yield* command(
          protocolId,
          deleteStage(session, ref.stageId),
        );
        yield* publish(session, result.events);
        const outcome = result.outcome;
        if (outcome === undefined) {
          return yield* new SectionNotFound({ sectionId });
        }
        if (outcome.status === 'blocked') {
          return yield* new SectionsLocked({ blocked: outcome.blocked });
        }
        if (outcome.status === 'referenced') {
          return yield* new ReferencesRemain({ remaining: outcome.remaining });
        }
        return {
          revision: outcome.revision,
          changedSections: outcome.changedSections,
        };
      }),

      RefactorDeleteVariable: Effect.fn(
        'protocolBuilder.RefactorDeleteVariable',
      )(function* ({ protocolId, subject, variableId }) {
        const session = yield* openSession(protocolId);
        const result = yield* command(
          protocolId,
          deleteVariable(session, { subject, variableId }),
        );
        yield* publish(session, result.events);
        return yield* applied(result.outcome);
      }),

      RefactorDeleteEntityType: Effect.fn(
        'protocolBuilder.RefactorDeleteEntityType',
      )(function* ({ protocolId, entity, typeId }) {
        const session = yield* openSession(protocolId);
        const result = yield* command(
          protocolId,
          deleteEntityType(session, { entity, typeId }),
        );
        yield* publish(session, result.events);
        return yield* applied(result.outcome);
      }),

      ResourcesList: Effect.fn('protocolBuilder.ResourcesList')(function* ({
        protocolId,
        editId,
        kinds,
        status,
      }) {
        const session = yield* openSession(protocolId);
        // Committed resources are the protocol's; staged ones are the named
        // edit's, and another edit's imports are no more part of this
        // protocol than the draft that will name them.
        const store =
          editId === undefined
            ? undefined
            : yield* staged.opened(stagingKey(session, editId));
        const resources = [
          ...committedDescriptors(yield* assetsDocument(session)),
          ...(store?.descriptors() ?? []),
        ].filter(
          (descriptor) =>
            (kinds === undefined || kinds.includes(descriptor.kind)) &&
            (status === undefined || descriptor.status === status),
        );
        return { status: 'ok' as const, data: { resources } };
      }),

      ResourcesStage: Effect.fn('protocolBuilder.ResourcesStage')(function* ({
        protocolId,
        editId,
        requestId,
        request,
      }) {
        const session = yield* openSession(protocolId);
        const store = yield* stagingFor(session, editId);
        return store.stage(requestId, request);
      }),

      ResourcesDiscard: Effect.fn('protocolBuilder.ResourcesDiscard')(
        function* ({ protocolId, editId, resourceId }) {
          const session = yield* openSession(protocolId);
          // Only what this edit staged: a stage editor's cancel must not take
          // away the file the codebook dialog over it is about to submit.
          const store = yield* stagingFor(session, editId);
          return store.discard(resourceId);
        },
      ),

      ResourcesInspect: Effect.fn('protocolBuilder.ResourcesInspect')(
        function* ({ protocolId, editId, resourceId }) {
          const session = yield* openSession(protocolId);
          const assets = yield* assetsDocument(session);
          const store =
            editId === undefined
              ? undefined
              : yield* staged.opened(stagingKey(session, editId));
          const inspection =
            store === undefined
              ? committedInspection(assets, resourceId)
              : store.inspect(assets, resourceId);
          return yield* withCommittedAssetKey(session, resourceId, inspection);
        },
      ),

      ResourcesPreview: Effect.fn('protocolBuilder.ResourcesPreview')(
        function* ({ protocolId, editId, resourceId }) {
          const session = yield* openSession(protocolId);
          const assets = yield* assetsDocument(session);
          const store =
            editId === undefined
              ? undefined
              : yield* staged.opened(stagingKey(session, editId));
          return store === undefined
            ? committedPreview(assets, resourceId)
            : store.preview(assets, resourceId);
        },
      ),
    });
  }),
);
