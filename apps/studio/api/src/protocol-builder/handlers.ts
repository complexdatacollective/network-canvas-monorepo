// The protocol-builder host contract, implemented against Studio: every
// procedure resolves its protocol (`session.ts`), runs the host command
// (`host.ts`), publishes the events it logged and answers its outcome.
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
import {
  openSession,
  ownerPrefix,
  stillSignedIn,
  WatchCutoff,
  WsConnection,
} from './session.ts';
import type { WriteOperation, WriteReceipt } from './writeReceipts.ts';
import { readWriteReceipt } from './writeReceipts.ts';

/** How long a watcher's session and membership are trusted before re-reading. */
export const REAUTHORIZE_MS = RENEW_INTERVAL_MS;

/**
 * A caller whose role or grant was taken away since `openSession` is refused
 * inside the command's transaction, as one who never had the protocol; every
 * other failure is a fault the contract has no word for, so a defect.
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
 * Keyed by edit rather than connection or owner: an edit outlives a dropped
 * socket, and one owner's two open edits must not cancel each other's imports.
 */
const stagingKey = (session: ProtocolBuilderSession, editId: string) =>
  `${ownerPrefix(session)}${editId}`;

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
 * A missing subject is neither a protocol nor a section, which is all the
 * contract's errors name, so it is a defect where it was oRPC's `NOT_FOUND`.
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

/** Presence carries no cursor: it is not replayable. */
const onTheWire = (entry: LoggedProtocolEvent): ProtocolEvent =>
  entry.cursor === undefined || entry.event.type === 'presence'
    ? entry.event
    : { ...entry.event, cursor: entry.cursor };

/**
 * Every procedure of the group, over per-process state both mounts share.
 *
 * A write is uninterruptible from its command on: the rpc server interrupts a
 * departed client's calls, and once the command has committed its events,
 * the keeper's lease and the promotion's bookkeeping must follow regardless.
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
     * What an owner whose reconnection never came gives back, run by the
     * keeper once the grace is up, in the keeper's scope.
     */
    const endOwner = (session: ProtocolBuilderSession): Effect.Effect<void> =>
      Effect.gen(function* () {
        const owner = sessionOwner(session);
        const held = yield* leases.heldSections(session.draftId, owner);
        // Dropped before the release, which may fail: a keeper left renewing
        // a departed tab's leases would hold them forever, where an
        // unreachable database costs one lease expiry.
        for (const sectionId of held) {
          yield* leases.drop(session.draftId, sectionId, owner);
        }
        yield* staged.releaseMatching(ownerPrefix(session));
        const released = yield* Effect.orDie(releaseConnection(session, held));
        yield* publish(session, released.events);
      }).pipe(Effect.provideService(Database, database));

    /**
     * Fills a committed API key's value in from `protocol_asset_keys` (#1900):
     * the manifest never carries it, and the editor's map preview needs it.
     * The only read path that decrypts one; a staged key already has its value.
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
      // No sealed row: a protocol older than #1900, answered without a value.
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
        return yield* Effect.uninterruptible(
          Effect.gen(function* () {
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
                renew: Effect.provideService(
                  renewLease(session, sectionId, epoch),
                  Database,
                  database,
                ),
                draftId: session.draftId,
                sectionId,
                owner: sessionOwner(session),
              });
              // A unary caller's fallback connection is the cookie session,
              // shared by every tab and never ended: a participant joined for
              // it could never be removed.
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
        );
      }),

      ReleaseLock: Effect.fn('protocolBuilder.ReleaseLock')(function* ({
        protocolId,
        sectionId,
      }) {
        const session = yield* openSession(protocolId);
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const result = yield* command(
              protocolId,
              releaseLock(session, sectionId),
            );
            const owner = sessionOwner(session);
            yield* leases.drop(session.draftId, sectionId, owner);
            // A tab may hold a second section (a codebook dialog over a stage
            // editor), so presence follows what it still holds.
            const [stillHeld] = yield* leases.heldSections(
              session.draftId,
              owner,
            );
            yield* presence.setMode(
              session.draftId,
              session.connectionId,
              stillHeld === undefined ? 'viewing' : 'editing',
              stillHeld,
            );
            yield* publish(session, result.events);
            if (result.events.length > 0) yield* publishPresence(session);
          }),
        );
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

      WatchProtocol: ({ protocolId, since }, { headers }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const session = yield* openSession(protocolId);
            // Subscribed before the backlog is read, so an event committed
            // between the two is queued rather than lost; the cursor check
            // below drops the overlap.
            const live = yield* events.subscribe(session.draftId);
            // While the channel runs, its owner's leases are renewed; its end
            // starts the reconnect grace, after which `endOwner` runs.
            yield* leases.connect(
              sessionOwner(session),
              session.draftId,
              endOwner(session),
            );
            // Registered before the join, so it runs after the join's own
            // release has taken this watcher out.
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
            let authorizedAt = yield* Clock.currentTimeMillis;
            const delivered = live.pipe(
              // Dropped to the replay path: not a refusal the contract names.
              Stream.catchTag('SubscriberOverflow', (overflow) =>
                Stream.die(overflow),
              ),
              Stream.filterMapEffect((entry) =>
                Effect.gen(function* () {
                  // Asked before an event is handed over rather than on a
                  // timer, so an idle watch costs nothing.
                  const at = yield* Clock.currentTimeMillis;
                  if (at - authorizedAt >= REAUTHORIZE_MS) {
                    yield* stillSignedIn(headers);
                    yield* openSession(protocolId);
                    authorizedAt = at;
                  }
                  // Presence is not replayable, so it never moves the cursor.
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
            const watched = Stream.concat(
              Stream.fromIterable(backlog.map(onTheWire)),
              delivered,
            );
            const cutoff = yield* Effect.serviceOption(WatchCutoff);
            return Option.isNone(cutoff)
              ? watched
              : Stream.interruptWhen(watched, cutoff.value.reached);
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
        // A retry of a committed attempt, asked before planning: the first
        // attempt already took the staged resources a new plan would need.
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
        // Planned before anything is written: the bytes it stores are named
        // only by the section write, so a refusal leaves everything staged.
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
        return yield* Effect.uninterruptible(
          Effect.gen(function* () {
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
            // Another call with this request id committed first: this is its retry.
            if (outcome.status === 'replayed')
              return submitted(outcome.receipt);
            if (outcome.status === 'notLockHolder') {
              return yield* new NotLockHolder({
                sectionId,
                ...(outcome.holder === undefined
                  ? {}
                  : { holder: outcome.holder }),
              });
            }
            if (outcome.status === 'blocked') {
              return yield* new SectionsLocked({ blocked: outcome.blocked });
            }
            if (outcome.status === 'invalidShape') {
              return yield* new InvalidShape({
                sectionId,
                issues: outcome.issues,
              });
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
        );
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
        // A retry of a committed attempt is answered from its record rather
        // than minting a second copy of the stage.
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
        // Planned before anything is written; the refusal names no section
        // because none has been minted.
        const planned =
          promote === undefined || store === undefined
            ? undefined
            : yield* store.plan(objectStore, promote.resourceIds);
        if (planned?.status === 'failed') {
          return yield* new PromotionFailed({ failure: planned.failure });
        }
        return yield* Effect.uninterruptible(
          Effect.gen(function* () {
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
            // Another call with this request id committed first: this is its retry.
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
              ...(planned === undefined
                ? {}
                : { promoted: planned.data.promoted }),
            };
          }),
        );
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
        return yield* Effect.uninterruptible(
          Effect.gen(function* () {
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
              return yield* new ReferencesRemain({
                remaining: outcome.remaining,
              });
            }
            return {
              revision: outcome.revision,
              changedSections: outcome.changedSections,
            };
          }),
        );
      }),

      RefactorDeleteVariable: Effect.fn(
        'protocolBuilder.RefactorDeleteVariable',
      )(function* ({ protocolId, subject, variableId }) {
        const session = yield* openSession(protocolId);
        const result = yield* Effect.uninterruptible(
          Effect.tap(
            command(
              protocolId,
              deleteVariable(session, { subject, variableId }),
            ),
            (committed) => publish(session, committed.events),
          ),
        );
        return yield* applied(result.outcome);
      }),

      RefactorDeleteEntityType: Effect.fn(
        'protocolBuilder.RefactorDeleteEntityType',
      )(function* ({ protocolId, entity, typeId }) {
        const session = yield* openSession(protocolId);
        const result = yield* Effect.uninterruptible(
          Effect.tap(
            command(protocolId, deleteEntityType(session, { entity, typeId })),
            (committed) => publish(session, committed.events),
          ),
        );
        return yield* applied(result.outcome);
      }),

      ResourcesList: Effect.fn('protocolBuilder.ResourcesList')(function* ({
        protocolId,
        editId,
        kinds,
        status,
      }) {
        const session = yield* openSession(protocolId);
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
