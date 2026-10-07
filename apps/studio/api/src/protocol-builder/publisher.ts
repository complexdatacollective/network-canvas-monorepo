// A relay per draft this replica has a watcher on delivers the draft's log from
// `protocol_events` in cursor order, so a watcher on any replica sees every
// write once, whichever replica made it. A ring of the doorbell, a local
// write or the safety poll only sets a flag and wakes the relay, which then
// reads from the next cursor it has not delivered: a ring that is lost, late or
// out of order costs latency, never an event.
//
// One bounded queue per watcher rather than one `PubSub` per draft: a bounded
// `PubSub` is a single ring, so the slowest watcher drops the event for every
// watcher or stalls the relay.
import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Queue,
  Ref,
  Schedule,
  Schema,
  type Scope,
  Semaphore,
  Stream,
} from 'effect';
import type { SqlError } from 'effect/sql';

import type { Presence } from '@codaco/protocol-builder-core/contract/schemas';

import { Database } from '../db/client.ts';
import type { TeamAccess } from '../db/tenant.ts';
import { MaintenanceTriggers } from '../http/middleware/maintenance.ts';
import {
  pollRelays,
  readRelay,
  reapExpired,
  relaySection,
  seedRelay,
} from './connections.ts';
import { Doorbell } from './doorbell.ts';
import { type LoggedProtocolEvent, RELAY_BATCH } from './events.ts';
import type { ProtocolBuilderSession } from './host.ts';
import { socketClosure } from './socket-closure.ts';

const QUEUE_LIMIT = 1024;

const SAFETY_POLL_MS = 5_000;

const MAX_CONSECUTIVE_FAILURES = 5;

export class SubscriberOverflow extends Schema.TaggedError<SubscriberOverflow>()(
  'SubscriberOverflow',
  { draftId: Schema.String },
) {}

class RelayFailed extends Schema.TaggedError<RelayFailed>()('RelayFailed', {
  draftId: Schema.String,
}) {}

type Watcher = {
  readonly queue: Queue.Queue<
    LoggedProtocolEvent,
    SubscriberOverflow | RelayFailed | Cause.Done
  >;
  /** Whether it has been sent who is present since it subscribed. */
  presented: boolean;
};

type Dirty = { readonly events: boolean; readonly presence: boolean };

const CLEAN: Dirty = { events: false, presence: false };
const EVENTS: Dirty = { events: true, presence: false };
const PRESENCE: Dirty = { events: false, presence: true };
const BOTH: Dirty = { events: true, presence: true };

const merge = (a: Dirty, b: Dirty): Dirty => ({
  events: a.events || b.events,
  presence: a.presence || b.presence,
});

/** Mutated only between yields, and read and delivered under `lock`. */
type Relay = {
  readonly draftId: string;
  readonly access: TeamAccess;
  /** The next cursor to deliver: every event before it has been offered. */
  next: bigint;
  /** The sections whose latest delivered lock event names a holder. */
  readonly locks: Set<string>;
  /** The presence last sent, to tell whether a read changed it. */
  shown: string | undefined;
  readonly watchers: Set<Watcher>;
  readonly dirty: Ref.Ref<Dirty>;
  /** Carries nothing, so a wake coalesced into a pending one loses nothing. */
  readonly wake: Queue.Queue<void>;
  readonly lock: Semaphore.Semaphore;
  failures: number;
  stopped: boolean;
};

type RelayOptions = {
  readonly safetyPollMs?: number;
  readonly maxConsecutiveFailures?: number;
};

export class ProtocolEvents extends Context.Service<
  ProtocolEvents,
  {
    /** Tells the draft's watchers on every replica that its log moved. */
    readonly publish: (
      session: ProtocolBuilderSession,
      entries: ReadonlyArray<LoggedProtocolEvent>,
    ) => Effect.Effect<void>;
    /** Tells the draft's watchers on every replica to read presence again. */
    readonly presenceChanged: (
      session: ProtocolBuilderSession,
    ) => Effect.Effect<void>;
    /**
     * Every event from the draft's next cursor once this returns, so an event
     * committed before it is in a backlog read after it.
     */
    readonly subscribe: (
      session: ProtocolBuilderSession,
    ) => Effect.Effect<
      Stream.Stream<LoggedProtocolEvent, SubscriberOverflow | RelayFailed>,
      SqlError.SqlError,
      Scope.Scope
    >;
    readonly subscribers: (draftId: string) => Effect.Effect<number>;
  }
>()('@studio/ProtocolEvents') {
  static readonly layerWith = (
    options: RelayOptions = {},
  ): Layer.Layer<
    ProtocolEvents,
    never,
    Database | Doorbell | MaintenanceTriggers
  > =>
    Layer.effect(
      ProtocolEvents,
      Effect.gen(function* () {
        const safetyPollMs = options.safetyPollMs ?? SAFETY_POLL_MS;
        const maxFailures =
          options.maxConsecutiveFailures ?? MAX_CONSECUTIVE_FAILURES;
        const database = yield* Database;
        const doorbell = yield* Doorbell;
        const triggers = yield* MaintenanceTriggers;
        const scope = yield* Effect.scope;
        const relays = new Map<string, Relay>();

        const withDatabase = Effect.provideService(Database, database);

        const closed = Effect.map(socketClosure(triggers), Option.isSome);

        const offer = (
          relay: Relay,
          watcher: Watcher,
          entry: LoggedProtocolEvent,
        ) => {
          if (Queue.offerUnsafe(watcher.queue, entry)) return;
          Queue.failCauseUnsafe(
            watcher.queue,
            Cause.fail(new SubscriberOverflow({ draftId: relay.draftId })),
          );
          relay.watchers.delete(watcher);
        };

        /**
         * Offers the run that continues from `next`; a gap waits for a later
         * read. True when the read was full, so more may follow it.
         */
        const deliver = (
          relay: Relay,
          entries: ReadonlyArray<LoggedProtocolEvent>,
        ) => {
          const more = entries.length >= RELAY_BATCH;
          for (const entry of entries) {
            if (entry.cursor === undefined) continue;
            const cursor = BigInt(entry.cursor);
            if (cursor < relay.next) continue;
            if (cursor > relay.next) return more;
            for (const watcher of relay.watchers) offer(relay, watcher, entry);
            relay.next = cursor + 1n;
            if (entry.event.type !== 'lock') continue;
            if (entry.event.holder === undefined) {
              relay.locks.delete(entry.event.sectionId);
            } else {
              relay.locks.add(entry.event.sectionId);
            }
          }
          return more;
        };

        /** Sent when it changed, and to a watcher not yet told. */
        const show = (relay: Relay, present: ReadonlyArray<Presence>) => {
          const shown = JSON.stringify(present);
          const changed = shown !== relay.shown;
          relay.shown = shown;
          const entry: LoggedProtocolEvent = {
            event: { type: 'presence', present: [...present] },
          };
          for (const watcher of relay.watchers) {
            if (!changed && watcher.presented) continue;
            watcher.presented = true;
            offer(relay, watcher, entry);
          }
        };

        const stop = (relay: Relay) => {
          if (relays.get(relay.draftId) === relay) relays.delete(relay.draftId);
          relay.stopped = true;
          // Ends the relay's fiber at its next wait rather than interrupting
          // it, which from inside that fiber would wait on itself.
          Queue.shutdownUnsafe(relay.wake);
        };

        const failed = (relay: Relay, cause: Cause.Cause<unknown>) =>
          Effect.gen(function* () {
            relay.failures += 1;
            yield* Effect.logWarning(
              `Reading protocol-builder events failed (${relay.failures} of ${maxFailures})`,
              cause,
            );
            if (relay.failures < maxFailures) return;
            for (const watcher of relay.watchers) {
              Queue.failCauseUnsafe(
                watcher.queue,
                Cause.fail(new RelayFailed({ draftId: relay.draftId })),
              );
            }
            relay.watchers.clear();
            stop(relay);
          });

        const markDirty = (relay: Relay | undefined, flags: Dirty) =>
          relay === undefined
            ? Effect.void
            : Effect.andThen(
                Ref.update(relay.dirty, (dirty) => merge(dirty, flags)),
                Effect.sync(() => {
                  Queue.offerUnsafe(relay.wake, undefined);
                }),
              );

        const ring = (message: Parameters<Doorbell['Service']['ring']>[0]) =>
          Effect.asVoid(Effect.forkIn(doorbell.ring(message), scope));

        /** A wake's read; on failure its flags are set again for the next one. */
        const wakeRead = (relay: Relay) =>
          Effect.gen(function* () {
            if (yield* closed) return;
            const dirty = yield* Ref.getAndSet(relay.dirty, CLEAN);
            if (!dirty.events && !dirty.presence) return;
            const read = yield* Effect.exit(
              relay.lock.withPermit(
                Effect.gen(function* () {
                  if (relay.stopped) return false;
                  const result = yield* withDatabase(
                    readRelay(relay.access, relay.draftId, {
                      next: dirty.events ? relay.next : undefined,
                      presence: dirty.presence,
                    }),
                  );
                  const more = deliver(
                    relay,
                    result.events.get(relay.draftId) ?? [],
                  );
                  if (dirty.presence) {
                    show(relay, result.presence.get(relay.draftId) ?? []);
                  }
                  relay.failures = 0;
                  return more;
                }),
              ),
            );
            if (Exit.isSuccess(read)) {
              if (read.value) yield* markDirty(relay, EVENTS);
              return;
            }
            yield* Ref.update(relay.dirty, (now) => merge(now, dirty));
            yield* failed(relay, read.cause);
          });

        const run = (relay: Relay) =>
          Effect.gen(function* () {
            while (!relay.stopped) {
              yield* Queue.take(relay.wake);
              yield* wakeRead(relay);
            }
          });

        /** Holds every relay's lock, in draft order, while `effect` runs. */
        const holding = <A, E, R>(
          team: ReadonlyArray<Relay>,
          effect: Effect.Effect<A, E, R>,
        ): Effect.Effect<A, E, R> =>
          team.reduceRight<Effect.Effect<A, E, R>>(
            (inner, relay) => relay.lock.withPermit(inner),
            effect,
          );

        const reap = (relay: Relay, candidates: ReadonlyArray<string>) =>
          Effect.gen(function* () {
            if (yield* closed) return;
            const reaped = yield* Effect.exit(
              withDatabase(
                reapExpired(relay.access, relay.draftId, candidates),
              ),
            );
            if (Exit.isFailure(reaped)) {
              yield* Effect.logWarning(
                'Releasing lapsed protocol-builder leases failed',
                reaped.cause,
              );
              return;
            }
            const last = reaped.value.at(-1)?.cursor;
            if (last === undefined) return;
            yield* markDirty(relays.get(relay.draftId), EVENTS);
            yield* ring({
              _tag: 'Advanced',
              draftId: relay.draftId,
              cursor: last,
            });
          });

        const pollTeam = (team: ReadonlyArray<Relay>) =>
          Effect.gen(function* () {
            const [first] = team;
            if (first === undefined) return;
            const polled = yield* Effect.exit(
              holding(
                team,
                Effect.gen(function* () {
                  const open = team.filter((relay) => !relay.stopped);
                  if (open.length === 0) return [];
                  const result = yield* withDatabase(
                    pollRelays(
                      first.access,
                      open.map((relay) => ({
                        draftId: relay.draftId,
                        next: relay.next,
                      })),
                    ),
                  );
                  return open.map((relay) => {
                    const more = deliver(
                      relay,
                      result.events.get(relay.draftId) ?? [],
                    );
                    show(relay, result.presence.get(relay.draftId) ?? []);
                    relay.failures = 0;
                    const lapsed = [...relay.locks].filter(
                      (sectionId) =>
                        !result.live.has(
                          relaySection(relay.draftId, sectionId),
                        ),
                    );
                    return { relay, more, lapsed };
                  });
                }),
              ),
            );
            if (Exit.isFailure(polled)) {
              for (const relay of team) yield* failed(relay, polled.cause);
              return;
            }
            for (const { relay, more, lapsed } of polled.value) {
              if (more) yield* markDirty(relay, EVENTS);
              if (lapsed.length > 0) yield* reap(relay, lapsed);
            }
          });

        const poll = Effect.gen(function* () {
          if (yield* closed) return;
          const teams = new Map<string, Relay[]>();
          for (const relay of [...relays.values()].sort((a, b) =>
            a.draftId < b.draftId ? -1 : 1,
          )) {
            const team = teams.get(relay.access.teamId) ?? [];
            team.push(relay);
            teams.set(relay.access.teamId, team);
          }
          for (const team of teams.values()) yield* pollTeam(team);
        });

        yield* poll.pipe(
          Effect.schedule(Schedule.spaced(safetyPollMs)),
          Effect.forkScoped,
        );

        const signals = yield* doorbell.signals;
        yield* Stream.runForEach(signals, (signal) => {
          if (signal._tag === 'Resync') {
            return Effect.forEach(
              [...relays.values()],
              (relay) => markDirty(relay, BOTH),
              { discard: true },
            );
          }
          const relay = relays.get(signal.draftId);
          if (signal._tag === 'Presence') return markDirty(relay, PRESENCE);
          // This replica's own ring comes back too, after its read.
          if (relay !== undefined && BigInt(signal.cursor) < relay.next) {
            return Effect.void;
          }
          return markDirty(relay, EVENTS);
        }).pipe(Effect.forkScoped);

        /** No yield between the lookup and the insert, so a draft gets one relay. */
        const join = (
          session: ProtocolBuilderSession,
          watcher: Watcher,
          seed: { readonly next: bigint; readonly locks: ReadonlySet<string> },
        ) =>
          Effect.gen(function* () {
            const wake = yield* Queue.dropping<void>(1);
            const existing = relays.get(session.draftId);
            if (existing !== undefined) {
              existing.watchers.add(watcher);
              return existing;
            }
            const relay: Relay = {
              draftId: session.draftId,
              access: session.access,
              next: seed.next,
              locks: new Set(seed.locks),
              shown: undefined,
              watchers: new Set([watcher]),
              dirty: Ref.makeUnsafe(CLEAN),
              wake,
              lock: Semaphore.makeUnsafe(1),
              failures: 0,
              stopped: false,
            };
            relays.set(session.draftId, relay);
            yield* Effect.forkIn(run(relay), scope);
            return relay;
          });

        const subscribe = (session: ProtocolBuilderSession) =>
          Effect.acquireRelease(
            Effect.gen(function* () {
              const queue = yield* Queue.bounded<
                LoggedProtocolEvent,
                SubscriberOverflow | RelayFailed | Cause.Done
              >(QUEUE_LIMIT);
              const watcher: Watcher = { queue, presented: false };
              const existing = relays.get(session.draftId);
              if (existing !== undefined) {
                existing.watchers.add(watcher);
                return { relay: existing, watcher };
              }
              // Fixed before this returns, so the caller's backlog read covers
              // every event before it.
              const seed = yield* withDatabase(
                seedRelay(session.access, session.draftId),
              );
              return { relay: yield* join(session, watcher, seed), watcher };
            }),
            ({ relay, watcher }) =>
              Effect.gen(function* () {
                relay.watchers.delete(watcher);
                yield* Queue.shutdown(watcher.queue);
                if (relay.watchers.size === 0 && !relay.stopped) stop(relay);
              }),
          ).pipe(Effect.map(({ watcher }) => Stream.fromQueue(watcher.queue)));

        const publish = (
          session: ProtocolBuilderSession,
          entries: ReadonlyArray<LoggedProtocolEvent>,
        ) =>
          Effect.gen(function* () {
            const last = entries.findLast(
              (entry) => entry.cursor !== undefined,
            )?.cursor;
            if (last === undefined) return;
            yield* markDirty(relays.get(session.draftId), EVENTS);
            yield* ring({
              _tag: 'Advanced',
              draftId: session.draftId,
              cursor: last,
            });
          });

        const presenceChanged = (session: ProtocolBuilderSession) =>
          Effect.gen(function* () {
            yield* markDirty(relays.get(session.draftId), PRESENCE);
            yield* ring({ _tag: 'Presence', draftId: session.draftId });
          });

        const subscribers = (draftId: string) =>
          Effect.sync(() => relays.get(draftId)?.watchers.size ?? 0);

        return ProtocolEvents.of({
          publish,
          presenceChanged,
          subscribe,
          subscribers,
        });
      }),
    );

  static readonly layer: Layer.Layer<
    ProtocolEvents,
    never,
    Database | Doorbell | MaintenanceTriggers
  > = ProtocolEvents.layerWith();
}
