import { randomUUID } from 'node:crypto';

import { Clock, Effect, Option, Predicate, Result, Stream } from 'effect';
import type * as Layer from 'effect/Layer';
import type * as Rpc from 'effect/rpc/Rpc';

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
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId as makeSectionId,
  parseSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { provideCaller } from '../audit/actor.ts';
import { type AuthService } from '../auth/service.ts';
import { TenantScope } from '../db/tenant.ts';
import { openAssetKey } from '../protocol/asset-keys.ts';
import { type RateLimiter } from '../rate-limit/limiter.ts';
import type { StudioServices } from '../rpc/deps.ts';
import { requireProtocol } from '../rpc/team-scope.ts';
import { ObjectStore } from '../storage/object-store.ts';
import { readProtocolEvents, type LoggedProtocolEvent } from './events.ts';
import {
  acquireLock,
  authorizeCaller,
  create,
  deleteEntityType,
  deleteStage,
  deleteVariable,
  headSection,
  listSectionIds,
  readSection,
  releaseLock,
  sessionOwner,
  submit,
  type ProtocolBuilderSession,
  type RefactorOutcome,
} from './host.ts';
import { Leases, RENEW_INTERVAL_MS, retryBriefly } from './leases.ts';
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

export const REAUTHORIZE_MS = RENEW_INTERVAL_MS;

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

// Keyed by edit, not connection or owner: an edit outlives a dropped socket.
const stagingKey = (session: ProtocolBuilderSession, editId: string) =>
  `${ownerPrefix(session)}${editId}`;

const writeKey = (
  session: ProtocolBuilderSession,
  operation: WriteOperation,
  requestId: string,
) => ({ draftId: session.draftId, operation, requestId });

const submitted = (receipt: WriteReceipt) => ({
  revision: receipt.revision,
  ...(receipt.promoted === undefined ? {} : { promoted: receipt.promoted }),
});

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

const onTheWire = (entry: LoggedProtocolEvent): ProtocolEvent =>
  entry.cursor === undefined || entry.event.type === 'presence'
    ? entry.event
    : { ...entry.event, cursor: entry.cursor };

/**
 * A write is uninterruptible from its command on: once the command has
 * committed, the lease and promotion bookkeeping must follow.
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

    // Presence is a courtesy to colleagues: failing to show it must not fail
    // the call that changed it, whose own write has already committed.
    const publishPresence = (session: ProtocolBuilderSession) =>
      Effect.flatMap(presence.list(session), (present) =>
        events.publish(session.draftId, [
          { event: { type: 'presence', present } },
        ]),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning(
            'Publishing protocol-builder presence failed',
            cause,
          ),
        ),
      );

    // A unary caller shows no mode: its connection id is its login's, which
    // every HTTP watch of that login carries too.
    const showMode = (
      session: ProtocolBuilderSession,
      sectionId: ProtocolSectionId | undefined,
    ) =>
      Effect.gen(function* () {
        if (Option.isNone(yield* Effect.serviceOption(WsConnection))) return;
        yield* retryBriefly(
          presence.setMode(
            session,
            sectionId === undefined ? 'viewing' : 'editing',
            sectionId,
          ),
        );
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning(
            'Recording protocol-builder presence failed',
            cause,
          ),
        ),
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
     * Runs only once the tab is known to have no live socket on any replica:
     * its staging goes with its leases, and colleagues see both.
     */
    const onReleased =
      (session: ProtocolBuilderSession) =>
      (entries: ReadonlyArray<LoggedProtocolEvent>) =>
        Effect.gen(function* () {
          yield* staged.releaseMatching(ownerPrefix(session));
          yield* publish(session, entries);
          yield* publishPresence(session);
        });

    const inspectWithCommittedKey = (
      session: ProtocolBuilderSession,
      resourceId: string,
      inspect: (assets: SectionDoc) => ResourceOutcome<Inspection>,
    ) =>
      command(
        session.protocolId,
        TenantScope.open(
          session.access,
          Effect.gen(function* () {
            yield* requireProtocol(session.access, session.protocolId);
            const assets = yield* headSection(
              session,
              makeSectionId({ kind: 'assets' }),
            );
            const outcome = inspect(assets?.document ?? {});
            if (outcome.status !== 'ok') return outcome;
            if (outcome.data.descriptor.kind !== 'apikey') return outcome;
            if (outcome.data.value !== undefined) return outcome;
            const value = yield* openAssetKey(session.cipher, {
              teamId: session.access.teamId,
              protocolId: session.protocolId,
              assetId: resourceId,
            });
            if (value === undefined) return outcome;
            return {
              status: 'ok' as const,
              data: { ...outcome.data, value },
            };
          }).pipe(provideCaller(session.principal)),
        ),
      );

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
            const held = result.outcome.lock === 'held';
            if (held) yield* showMode(session, sectionId);
            yield* publish(session, result.events);
            if (held) yield* publishPresence(session);
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
            yield* showMode(session, result.stillHeld);
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
            // between the two is queued rather than lost.
            const live = yield* events.subscribe(session.draftId);
            const from = since === undefined ? undefined : BigInt(since);
            const backlog = yield* command(
              protocolId,
              TenantScope.open(
                session.access,
                Effect.andThen(
                  requireProtocol(session.access, session.protocolId),
                  readProtocolEvents(
                    session.access.teamId,
                    session.draftId,
                    from,
                  ),
                ).pipe(provideCaller(session.principal)),
              ),
            );
            // Registered before the connection, so it runs after the
            // connection's row has been expired and no longer lists it.
            yield* Effect.addFinalizer(() => publishPresence(session));
            // The tab's leases may have been granted by another replica, or
            // by this one before a restart; from here on this replica renews
            // them. A failure ends the watch, and the client's retry asks
            // again.
            yield* Effect.orDie(leases.connect(session, onReleased(session)));
            yield* publishPresence(session);
            const lastBacklog = backlog.at(-1)?.cursor;
            let last = lastBacklog === undefined ? from : BigInt(lastBacklog);
            let authorizedAt = yield* Clock.currentTimeMillis;
            const delivered = live.pipe(
              Stream.catchTag('SubscriberOverflow', (overflow) =>
                Stream.die(overflow),
              ),
              Stream.filterMapEffect((entry) =>
                Effect.gen(function* () {
                  const at = yield* Clock.currentTimeMillis;
                  if (at - authorizedAt >= REAUTHORIZE_MS) {
                    yield* stillSignedIn(headers);
                    yield* command(
                      protocolId,
                      authorizeCaller(yield* openSession(protocolId)),
                    );
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
        // Asked before planning: the first attempt already took the staged
        // resources a new plan would need.
        const already = yield* command(
          protocolId,
          TenantScope.open(
            session.access,
            Effect.andThen(
              requireProtocol(session.access, session.protocolId),
              readWriteReceipt(
                session.access.teamId,
                writeKey(session, 'submit', requestId),
              ),
            ).pipe(provideCaller(session.principal)),
          ),
        );
        if (already !== undefined) return submitted(already);
        const store =
          promote === undefined
            ? undefined
            : yield* stagingFor(session, promote.editId);
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
        const already = yield* command(
          protocolId,
          TenantScope.open(
            session.access,
            Effect.andThen(
              requireProtocol(session.access, session.protocolId),
              readWriteReceipt(
                session.access.teamId,
                writeKey(session, 'create', requestId),
              ),
            ).pipe(provideCaller(session.principal)),
          ),
        );
        if (already !== undefined) return yield* created(already);
        const store =
          promote === undefined
            ? undefined
            : yield* stagingFor(session, promote.editId);
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
        yield* command(protocolId, authorizeCaller(session));
        const store = yield* stagingFor(session, editId);
        return store.stage(requestId, request);
      }),

      ResourcesDiscard: Effect.fn('protocolBuilder.ResourcesDiscard')(
        function* ({ protocolId, editId, resourceId }) {
          const session = yield* openSession(protocolId);
          yield* command(protocolId, authorizeCaller(session));
          const store = yield* stagingFor(session, editId);
          return store.discard(resourceId);
        },
      ),

      ResourcesInspect: Effect.fn('protocolBuilder.ResourcesInspect')(
        function* ({ protocolId, editId, resourceId }) {
          const session = yield* openSession(protocolId);
          const store =
            editId === undefined
              ? undefined
              : yield* staged.opened(stagingKey(session, editId));
          return yield* inspectWithCommittedKey(
            session,
            resourceId,
            (assets) =>
              store === undefined
                ? committedInspection(assets, resourceId)
                : store.inspect(assets, resourceId),
          );
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
