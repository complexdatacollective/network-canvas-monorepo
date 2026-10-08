import { randomUUID } from 'node:crypto';

import {
  Clock,
  Effect,
  Option,
  Predicate,
  Redacted,
  Result,
  Schedule,
  Semaphore,
  Stream,
} from 'effect';
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
import {
  sectionId as makeSectionId,
  parseSectionId,
} from '@codaco/studio-sync/taxonomy';

import { provideCaller } from '../audit/actor.ts';
import { type AuthService } from '../auth/service.ts';
import { TenantScope } from '../db/tenant.ts';
import { openAssetKey } from '../protocol/asset-keys.ts';
import { type RateLimiter } from '../rate-limit/limiter.ts';
import type { StudioServices } from '../rpc/deps.ts';
import { requireProtocol } from '../rpc/team-scope.ts';
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
  submit,
  type ProtocolBuilderSession,
  type RefactorOutcome,
} from './host.ts';
import { Leases, retryBriefly } from './leases.ts';
import { Presence } from './presence.ts';
import { ProtocolEvents } from './publisher.ts';
import {
  committedDescriptors,
  committedInspection,
  committedPreview,
  StagedImports,
  stagingGone,
  type Inspection,
  type ResourceOutcome,
} from './resources.ts';
import {
  openSession,
  resolveSession,
  stillSignedIn,
  WatchCutoff,
} from './session.ts';
import type { WriteOperation, WriteReceipt } from './writeReceipts.ts';
import { readWriteReceipt } from './writeReceipts.ts';

/**
 * How long an open watch goes on delivering to a caller removed from the team
 * or no longer granted the protocol. A write is refused at once, in its own
 * transaction; a watch only reads.
 */
export const REAUTHORIZE_MS = 30_000;

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
    const scope = yield* Effect.scope;

    /**
     * Records the mode of the tab's watches from what it holds, then, when
     * `announce`, tells watchers. Forked once the call's events are published,
     * so a retry holds back neither them nor the reply; each attempt reads the
     * tab's leases afresh, so a late one still writes its current mode.
     */
    const showMode = (session: ProtocolBuilderSession, announce: boolean) =>
      Effect.forkIn(
        Effect.gen(function* () {
          yield* retryBriefly(presence.setMode(session)).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning(
                'Recording protocol-builder presence failed',
                cause,
              ),
            ),
          );
          if (announce) yield* events.presenceChanged(session);
        }),
        scope,
      ).pipe(Effect.asVoid);

    const assetsDocument = (session: ProtocolBuilderSession) =>
      Effect.map(
        command(
          session.protocolId,
          readSection(session, makeSectionId({ kind: 'assets' })),
        ),
        (assets) =>
          assets === undefined ? {} : Redacted.value(assets.document),
      );

    /**
     * Runs only once the tab is known to have no live socket on any replica:
     * colleagues see its locks go at once, and its staging follows on its own
     * fiber, outside the release's uninterruptible region, so a slow object
     * store holds back neither.
     */
    const onReleased =
      (session: ProtocolBuilderSession) =>
      (entries: ReadonlyArray<LoggedProtocolEvent>) =>
        Effect.gen(function* () {
          yield* events.publish(session, entries);
          yield* events.presenceChanged(session);
          yield* Effect.forkIn(staged.releaseOwner(session), scope);
        });

    const inspectWithCommittedKey = (
      session: ProtocolBuilderSession,
      resourceId: string,
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
            const outcome = committedInspection(
              assets === undefined ? {} : Redacted.value(assets.document),
              resourceId,
            );
            if (outcome.status !== 'ok') return outcome;
            if (outcome.data.descriptor.kind !== 'apikey') return outcome;
            if (outcome.data.value !== undefined) return outcome;
            const value = yield* openAssetKey(session.cipher, {
              teamId: session.access.teamId,
              protocolId: session.protocolId,
              assetId: resourceId,
            });
            if (value === undefined) return outcome;
            const inspected: ResourceOutcome<Inspection> = {
              status: 'ok',
              data: { ...outcome.data, value },
            };
            return inspected;
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
            yield* events.publish(session, result.events);
            if (result.outcome.lock === 'held') yield* showMode(session, true);
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
            if (result.events.length === 0) return;
            yield* events.publish(session, result.events);
            yield* showMode(session, true);
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
            // between the two is delivered rather than lost.
            const live = yield* Effect.orDie(events.subscribe(session));
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
            yield* Effect.addFinalizer(() => events.presenceChanged(session));
            // The tab's leases may have been granted by another replica, or
            // by this one before a restart; from here on this replica renews
            // them. A failure ends the watch, and the client's retry asks
            // again.
            yield* Effect.orDie(leases.connect(session, onReleased(session)));
            yield* events.presenceChanged(session);
            const lastBacklog = backlog.at(-1)?.cursor;
            let last = lastBacklog === undefined ? from : BigInt(lastBacklog);
            let authorizedAt = yield* Clock.currentTimeMillis;
            const reauthorizing = Semaphore.makeUnsafe(1);
            // By the memberships, role and grants as they stand, but with no
            // rate limit charged and no contact made, as `openSession` would
            // for every open watch on every timer. One at a time, so a
            // delivery and the timer that fall due together ask once.
            const reauthorizeWhenDue = reauthorizing.withPermit(
              Effect.gen(function* () {
                const at = yield* Clock.currentTimeMillis;
                if (at - authorizedAt < REAUTHORIZE_MS) return;
                yield* stillSignedIn(headers);
                yield* command(
                  protocolId,
                  authorizeCaller(yield* resolveSession(protocolId)),
                );
                authorizedAt = at;
              }),
            );
            const delivered = live.pipe(
              // Either ends the watch with a defect, which the client
              // resubscribes after, replaying from its cursor.
              Stream.catchTag(
                ['SubscriberOverflow', 'RelayFailed'],
                (failure) => Stream.die(failure),
              ),
              Stream.filterMapEffect((entry) =>
                Effect.gen(function* () {
                  yield* reauthorizeWhenDue;
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
            // A quiet draft delivers nothing to re-authorize on, so a
            // removed member's idle watch is asked on a timer as well;
            // jittered so that watches reconnected together spread out.
            const watched = Stream.concat(
              Stream.fromIterable(backlog.map(onTheWire)),
              delivered,
            ).pipe(
              Stream.interruptWhen(
                reauthorizeWhenDue.pipe(
                  Effect.schedule(
                    Schedule.spaced(REAUTHORIZE_MS).pipe(Schedule.jittered),
                  ),
                ),
              ),
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
        const planned =
          promote === undefined
            ? undefined
            : yield* command(
                protocolId,
                staged.plan(
                  { session, editId: promote.editId },
                  promote.resourceIds,
                ),
              );
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
              submit(session, sectionId, Redacted.value(document), {
                requestId,
                ...(planned === undefined || promote === undefined
                  ? {}
                  : {
                      assetEntries: planned.data.entries,
                      promoted: planned.data.promoted,
                      staged: promote,
                    }),
              }),
            );
            yield* events.publish(session, result.events);
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
            if (outcome.status === 'stagingGone') {
              return yield* new PromotionFailed({
                sectionId,
                failure: stagingGone(outcome.resourceId),
              });
            }
            yield* Effect.forkIn(
              staged.removePromoted(outcome.stagedObjects),
              scope,
            );
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
        const planned =
          promote === undefined
            ? undefined
            : yield* command(
                protocolId,
                staged.plan(
                  { session, editId: promote.editId },
                  promote.resourceIds,
                ),
              );
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
                document: Redacted.value(document),
                ...(position === undefined ? {} : { position }),
                ...(planned === undefined || promote === undefined
                  ? {}
                  : {
                      assetEntries: planned.data.entries,
                      promoted: planned.data.promoted,
                      staged: promote,
                    }),
                mintId: randomUUID,
              }),
            );
            yield* events.publish(session, result.events);
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
            if (outcome.status === 'stagingGone') {
              return yield* new PromotionFailed({
                failure: stagingGone(outcome.resourceId),
              });
            }
            yield* Effect.forkIn(
              staged.removePromoted(outcome.stagedObjects),
              scope,
            );
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
            yield* events.publish(session, result.events);
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
            (committed) => events.publish(session, committed.events),
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
            (committed) => events.publish(session, committed.events),
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
        const stagedHere =
          editId === undefined
            ? []
            : yield* command(
                protocolId,
                staged.descriptors({ session, editId }),
              );
        const resources = [
          ...committedDescriptors(yield* assetsDocument(session)),
          ...stagedHere,
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
        return yield* command(
          protocolId,
          staged.stage({ session, editId }, requestId, request),
        );
      }),

      ResourcesDiscard: Effect.fn('protocolBuilder.ResourcesDiscard')(
        function* ({ protocolId, editId, resourceId }) {
          const session = yield* openSession(protocolId);
          return yield* command(
            protocolId,
            staged.discard({ session, editId }, resourceId),
          );
        },
      ),

      ResourcesInspect: Effect.fn('protocolBuilder.ResourcesInspect')(
        function* ({ protocolId, editId, resourceId }) {
          const session = yield* openSession(protocolId);
          const stagedOne =
            editId === undefined
              ? undefined
              : yield* command(
                  protocolId,
                  staged.inspect({ session, editId }, resourceId),
                );
          return (
            stagedOne ?? (yield* inspectWithCommittedKey(session, resourceId))
          );
        },
      ),

      ResourcesPreview: Effect.fn('protocolBuilder.ResourcesPreview')(
        function* ({ protocolId, editId, resourceId }) {
          const session = yield* openSession(protocolId);
          const stagedOne =
            editId === undefined
              ? undefined
              : yield* command(
                  protocolId,
                  staged.preview({ session, editId }, resourceId),
                );
          return (
            stagedOne ??
            committedPreview(yield* assetsDocument(session), resourceId)
          );
        },
      ),
    });
  }),
);
