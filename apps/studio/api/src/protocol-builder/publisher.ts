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
  Random,
  Ref,
  Schedule,
  Schema,
  type Scope,
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

/**
 * How full the fullest watcher's queue may be before a relay reads more of the
 * log: room for a whole batch and the presence sent alongside it.
 */
const ROOM = QUEUE_LIMIT / 2;

const SAFETY_POLL_MS = 5_000;

const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * How long a read waits for watchers to drain before it reads anyway, so a
 * watcher that has stopped taking overflows rather than holding back its peers.
 */
const DRAIN_STALL_MS = 2_000;

/** Every replica hears a resync at once; this spreads their reads. */
const RESYNC_JITTER_MS = 1_000;

const POLL_CONCURRENCY = 4;

/** The wait after a failed read, doubled by each failure after it. */
const RETRY_MS = 100;

const REOPEN_CHECK_MS = 250;

/** Reads in a row that find the next cursor missing before a relay gives up. */
const MAX_GAP_READS = 3;

const MAX_REAP_FAILURES = 3;

class SubscriberOverflow extends Schema.TaggedError<SubscriberOverflow>()(
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

const merge = (a: Dirty, b: Dirty): Dirty => ({
  events: a.events || b.events,
  presence: a.presence || b.presence,
});

type RelaySeed = Effect.Success<ReturnType<typeof seedRelay>>;

type RelayPoll = Effect.Success<ReturnType<typeof pollRelays>>;

/**
 * Mutated only between yields, so reads run side by side without a lock and
 * each delivers what it read in one synchronous step.
 */
type Relay = {
  readonly draftId: string;
  readonly access: TeamAccess;
  /** The next cursor to deliver: every event before it has been offered. */
  next: bigint;
  /** The sections whose latest delivered lock event names a holder. */
  readonly locks: Set<string>;
  /** The presence last sent, to tell whether a read changed it. */
  shown: string | undefined;
  /** Numbers each read of presence as it begins. */
  asked: number;
  /** The number of the read last shown, so an earlier read never shows over it. */
  shownAt: number;
  readonly watchers: Set<Watcher>;
  readonly dirty: Ref.Ref<Dirty>;
  /** Carries nothing, so a wake coalesced into a pending one loses nothing. */
  readonly wake: Queue.Queue<void>;
  /** Offered when a watcher takes from its queue or leaves. */
  readonly room: Queue.Queue<void>;
  failures: number;
  gaps: number;
  reapFailures: number;
  stopped: boolean;
};

type RelayOptions = {
  readonly safetyPollMs?: number;
  readonly maxConsecutiveFailures?: number;
  readonly drainStallMs?: number;
};

type Ask = {
  readonly relay: Relay;
  readonly asked: number;
  /** Undefined when a watcher has no room, so the poll reads only presence. */
  readonly next: bigint | undefined;
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
        const drainStallMs = options.drainStallMs ?? DRAIN_STALL_MS;
        const database = yield* Database;
        const doorbell = yield* Doorbell;
        const triggers = yield* MaintenanceTriggers;
        const scope = yield* Effect.scope;
        const relays = new Map<string, Relay>();
        /** Relays whose wake found the database closed to them. */
        const heldBack = new Set<Relay>();

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
          Queue.offerUnsafe(relay.room, undefined);
        };

        const hasRoom = (relay: Relay) => {
          for (const watcher of relay.watchers) {
            if (Queue.sizeUnsafe(watcher.queue) > ROOM) return false;
          }
          return true;
        };

        /**
         * Waits for the fullest watcher to drain to `ROOM`, and no longer than
         * `drainStallMs` after the last watcher took anything.
         */
        const waitForRoom = (relay: Relay) =>
          Effect.gen(function* () {
            while (!relay.stopped && !hasRoom(relay)) {
              const drained = yield* Effect.timeoutOption(
                Queue.take(relay.room),
                drainStallMs,
              );
              if (Option.isNone(drained)) return;
            }
          });

        /**
         * Offers the run that continues from `next`. A gap ends the run, and a
         * full read means more may follow it.
         */
        const deliver = (
          relay: Relay,
          entries: ReadonlyArray<LoggedProtocolEvent>,
        ) => {
          for (const entry of entries) {
            if (entry.cursor === undefined) continue;
            const cursor = BigInt(entry.cursor);
            if (cursor < relay.next) continue;
            if (cursor > relay.next) return { more: false, gap: true };
            for (const watcher of relay.watchers) offer(relay, watcher, entry);
            relay.next = cursor + 1n;
            if (entry.event.type !== 'lock') continue;
            if (entry.event.holder === undefined) {
              relay.locks.delete(entry.event.sectionId);
            } else {
              relay.locks.add(entry.event.sectionId);
            }
          }
          return { more: entries.length >= RELAY_BATCH, gap: false };
        };

        const askPresence = (relay: Relay) => {
          relay.asked += 1;
          return relay.asked;
        };

        /** Sent when it changed, and to a watcher not yet told. */
        const show = (
          relay: Relay,
          asked: number,
          present: ReadonlyArray<Presence>,
        ) => {
          if (asked < relay.shownAt) return;
          relay.shownAt = asked;
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
          heldBack.delete(relay);
          // Ends the relay's fiber at its next wait rather than interrupting
          // it, which from inside that fiber would wait on itself.
          Queue.shutdownUnsafe(relay.wake);
          Queue.shutdownUnsafe(relay.room);
        };

        const end = (relay: Relay) => {
          for (const watcher of relay.watchers) {
            Queue.failCauseUnsafe(
              watcher.queue,
              Cause.fail(new RelayFailed({ draftId: relay.draftId })),
            );
          }
          relay.watchers.clear();
          stop(relay);
        };

        const readFailed = (relay: Relay) => {
          relay.failures += 1;
          if (relay.failures >= maxFailures) end(relay);
        };

        /**
         * Cursors are taken under the head lock, so the log has no gap that a
         * later read could fill: one that persists means the relay can never
         * deliver past it.
         */
        const checkGap = (relay: Relay, gap: boolean) =>
          Effect.gen(function* () {
            if (!gap) {
              relay.gaps = 0;
              return;
            }
            relay.gaps += 1;
            if (relay.gaps < MAX_GAP_READS) return;
            yield* Effect.logError(
              `Protocol-builder event ${relay.next} is missing from draft ${relay.draftId}'s log after ${relay.gaps} reads; ending its watchers`,
            );
            end(relay);
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

        /** A wake's read; on failure its flags are set again for the retry. */
        const wakeRead = (relay: Relay) =>
          Effect.gen(function* () {
            if (yield* closed) return 'closed';
            if ((yield* Ref.get(relay.dirty)).events) {
              yield* waitForRoom(relay);
            }
            const dirty = yield* Ref.getAndSet(relay.dirty, CLEAN);
            if (relay.stopped || (!dirty.events && !dirty.presence)) {
              return 'done';
            }
            const asked = dirty.presence ? askPresence(relay) : 0;
            const read = yield* Effect.exit(
              withDatabase(
                readRelay(relay.access, relay.draftId, {
                  next: dirty.events ? relay.next : undefined,
                  presence: dirty.presence,
                }),
              ),
            );
            if (Exit.isFailure(read)) {
              yield* Ref.update(relay.dirty, (now) => merge(now, dirty));
              readFailed(relay);
              yield* Effect.logWarning(
                `Reading protocol-builder events failed (${relay.failures} of ${maxFailures})`,
                read.cause,
              );
              return 'failed';
            }
            if (relay.stopped) return 'done';
            relay.failures = 0;
            const delivered = dirty.events
              ? deliver(relay, read.value.events.get(relay.draftId) ?? [])
              : undefined;
            if (dirty.presence) {
              show(relay, asked, read.value.presence.get(relay.draftId) ?? []);
            }
            if (delivered === undefined) return 'done';
            yield* checkGap(relay, delivered.gap);
            return delivered.more ? 'more' : 'done';
          });

        const run = (relay: Relay) =>
          Effect.gen(function* () {
            while (!relay.stopped) {
              yield* Queue.take(relay.wake);
              const outcome = yield* wakeRead(relay);
              if (outcome === 'more') yield* markDirty(relay, EVENTS);
              if (outcome === 'closed') heldBack.add(relay);
              if (outcome === 'failed' && !relay.stopped) {
                yield* Effect.sleep(
                  Math.min(RETRY_MS * 2 ** (relay.failures - 1), safetyPollMs),
                );
                Queue.offerUnsafe(relay.wake, undefined);
              }
            }
          });

        const reap = (relay: Relay, candidates: ReadonlyArray<string>) =>
          Effect.gen(function* () {
            if (yield* closed) return;
            const reaped = yield* Effect.exit(
              withDatabase(
                reapExpired(relay.access, relay.draftId, candidates),
              ),
            );
            if (Exit.isFailure(reaped)) {
              relay.reapFailures += 1;
              const message = `Releasing lapsed protocol-builder leases failed (${relay.reapFailures} in a row)`;
              yield* relay.reapFailures < MAX_REAP_FAILURES
                ? Effect.logWarning(message, reaped.cause)
                : Effect.logError(message, reaped.cause);
              return;
            }
            relay.reapFailures = 0;
            const { events, reshown } = reaped.value;
            const last = events.at(-1)?.cursor;
            if (last !== undefined) {
              yield* markDirty(relays.get(relay.draftId), EVENTS);
              yield* ring({
                _tag: 'Advanced',
                draftId: relay.draftId,
                cursor: last,
              });
            }
            if (reshown) {
              yield* markDirty(relays.get(relay.draftId), PRESENCE);
              yield* ring({ _tag: 'Presence', draftId: relay.draftId });
            }
          });

        const ask = (relay: Relay): Ask => ({
          relay,
          asked: askPresence(relay),
          next: hasRoom(relay) ? relay.next : undefined,
        });

        const settle = (asked: Ask, result: RelayPoll) =>
          Effect.gen(function* () {
            const { relay } = asked;
            if (relay.stopped) return;
            relay.failures = 0;
            const delivered =
              asked.next !== undefined && hasRoom(relay)
                ? deliver(relay, result.events.get(relay.draftId) ?? [])
                : undefined;
            show(relay, asked.asked, result.presence.get(relay.draftId) ?? []);
            const lapsed = [...relay.locks].filter(
              (sectionId) =>
                !result.live.has(relaySection(relay.draftId, sectionId)),
            );
            // Left to a wake, which waits for the room this poll did not have.
            if (delivered === undefined || delivered.more) {
              yield* markDirty(relay, EVENTS);
            }
            if (delivered !== undefined) yield* checkGap(relay, delivered.gap);
            if (lapsed.length > 0 && !relay.stopped) {
              yield* reap(relay, lapsed);
            }
          });

        const pollTeam = (team: ReadonlyArray<Relay>) =>
          Effect.gen(function* () {
            const asks = team.filter((relay) => !relay.stopped).map(ask);
            const [first] = asks;
            if (first === undefined) return;
            const access = first.relay.access;
            const wantOf = (asked: Ask) => ({
              draftId: asked.relay.draftId,
              next: asked.next,
            });
            const polled = yield* Effect.exit(
              withDatabase(pollRelays(access, asks.map(wantOf))),
            );
            if (Exit.isSuccess(polled)) {
              for (const asked of asks) yield* settle(asked, polled.value);
              return;
            }
            // Draft by draft, so a draft the read cannot serve fails alone.
            let failing = 0;
            for (const asked of asks) {
              const alone = yield* Effect.exit(
                withDatabase(pollRelays(access, [wantOf(asked)])),
              );
              if (Exit.isSuccess(alone)) {
                yield* settle(asked, alone.value);
                continue;
              }
              failing += 1;
              readFailed(asked.relay);
            }
            yield* Effect.logWarning(
              `Polling protocol-builder events failed for ${failing} of ${asks.length} drafts`,
              polled.cause,
            );
          });

        const poll = Effect.gen(function* () {
          if (yield* closed) return;
          const teams = new Map<string, Relay[]>();
          for (const relay of relays.values()) {
            const team = teams.get(relay.access.teamId) ?? [];
            team.push(relay);
            teams.set(relay.access.teamId, team);
          }
          yield* Effect.forEach(teams.values(), pollTeam, {
            concurrency: POLL_CONCURRENCY,
            discard: true,
          });
        });

        yield* poll.pipe(
          Effect.schedule(Schedule.spaced(safetyPollMs)),
          Effect.forkScoped,
        );

        yield* Effect.gen(function* () {
          if (heldBack.size === 0 || (yield* closed)) return;
          for (const relay of heldBack)
            Queue.offerUnsafe(relay.wake, undefined);
          heldBack.clear();
        }).pipe(
          Effect.schedule(Schedule.spaced(REOPEN_CHECK_MS)),
          Effect.forkScoped,
        );

        let resyncing = false;
        /** One batched poll per team, rather than a read per relay. */
        const resync = Effect.suspend(() => {
          if (resyncing) return Effect.void;
          resyncing = true;
          const jittered = Effect.flatMap(
            Random.nextIntBetween(0, RESYNC_JITTER_MS),
            (millis) => Effect.sleep(millis),
          ).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                resyncing = false;
              }),
            ),
            Effect.andThen(poll),
          );
          return Effect.asVoid(Effect.forkIn(jittered, scope));
        });

        const signals = yield* doorbell.signals;
        yield* Stream.runForEach(signals, (signal) => {
          if (signal._tag === 'Resync') return resync;
          const relay = relays.get(signal.draftId);
          if (signal._tag === 'Presence') return markDirty(relay, PRESENCE);
          // This replica's own ring comes back too, after its read.
          if (relay !== undefined && BigInt(signal.cursor) < relay.next) {
            return Effect.void;
          }
          return markDirty(relay, EVENTS);
        }).pipe(Effect.forkScoped);

        const joinExisting = (draftId: string, watcher: Watcher) =>
          Effect.sync(() => {
            const existing = relays.get(draftId);
            existing?.watchers.add(watcher);
            return existing;
          });

        /** No yield between the lookup and the insert, so a draft gets one relay. */
        const join = (
          session: ProtocolBuilderSession,
          watcher: Watcher,
          seed: RelaySeed,
        ) =>
          Effect.gen(function* () {
            const wake = yield* Queue.dropping<void>(1);
            const room = yield* Queue.dropping<void>(1);
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
              asked: 0,
              shownAt: 0,
              watchers: new Set([watcher]),
              dirty: Ref.makeUnsafe(CLEAN),
              wake,
              room,
              failures: 0,
              gaps: 0,
              reapFailures: 0,
              stopped: false,
            };
            relays.set(session.draftId, relay);
            yield* Effect.forkIn(run(relay), scope);
            return relay;
          });

        const leave = (relay: Relay | undefined, watcher: Watcher) =>
          Effect.gen(function* () {
            if (relay === undefined) return;
            relay.watchers.delete(watcher);
            Queue.offerUnsafe(relay.room, undefined);
            yield* Queue.shutdown(watcher.queue);
            if (relay.watchers.size === 0 && !relay.stopped) stop(relay);
          });

        const streamOf = (relay: Relay, watcher: Watcher) =>
          Stream.fromQueue(watcher.queue).pipe(
            Stream.mapArray((taken) => {
              Queue.offerUnsafe(relay.room, undefined);
              return taken;
            }),
          );

        const subscribe = (session: ProtocolBuilderSession) =>
          Effect.gen(function* () {
            const queue = yield* Queue.bounded<
              LoggedProtocolEvent,
              SubscriberOverflow | RelayFailed | Cause.Done
            >(QUEUE_LIMIT);
            const watcher: Watcher = { queue, presented: false };
            const existing = yield* Effect.acquireRelease(
              joinExisting(session.draftId, watcher),
              (relay) => leave(relay, watcher),
            );
            if (existing !== undefined) return streamOf(existing, watcher);
            // Outside any acquisition, so a caller that gives up mid-read
            // leaves at once; fixed before this returns, so the caller's
            // backlog read covers every event before it.
            const seed = yield* withDatabase(
              seedRelay(session.access, session.draftId),
            );
            const relay = yield* Effect.acquireRelease(
              join(session, watcher, seed),
              (joined) => leave(joined, watcher),
            );
            return streamOf(relay, watcher);
          });

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
