import { randomUUID } from 'node:crypto';

import {
  type Cause,
  Clock,
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Schedule,
  type Scope,
  Semaphore,
} from 'effect';
import type { SqlError } from 'effect/sql';

import { Database } from '../db/client.ts';
import { isLockUnavailable } from '../db/errors.ts';
import { MaintenanceTriggers } from '../http/middleware/maintenance.ts';
import {
  connectSocket,
  contactKey,
  expireConnection,
  releaseOwner,
  renewConnections,
  ReplicaId,
  upsertContact,
  type LocalRegistration,
} from './connections.ts';
import type { LoggedProtocolEvent } from './events.ts';
import { sessionOwner, type ProtocolBuilderSession } from './host.ts';
import { IDLE_MS } from './schema.ts';
import { socketClosure } from './socket-closure.ts';

/** A third of the lease TTL: two renewals may be lost before one expires. */
export const RENEW_INTERVAL_MS = 10_000;

/** Drafts whose liveness passes one tick runs side by side. */
const RENEW_CONCURRENCY = 4;

const LOCK_WAITS_BEFORE_WARNING = 3;

/**
 * Shorter than the 30s lease TTL, but long enough for a client to come back:
 * its socket's retries (Effect RpcClient's default, 0.5s growing by 1.5x and
 * capped at 5s) make five attempts in about 6.6s, and its watch re-runs
 * after 0.25s to 4s.
 */
export const RECONNECT_GRACE_MS = 20_000;

/** How often one owner's unary calls reach the database, per replica. */
const CONTACT_INTERVAL_MS = 30_000;

/** The wait before the first retry of a failed release or mode change. */
export const RETRY_BASE_MS = 500;

/** Retries after the first attempt, each wait double the last: 15.5s in all. */
export const RETRY_TIMES = 5;

export const retryBriefly = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.retry(effect, {
    schedule: Schedule.exponential(RETRY_BASE_MS),
    times: RETRY_TIMES,
  });

type Contact = {
  readonly registration: LocalRegistration;
  readonly until: number;
  readonly contactedAt: number | undefined;
};

/** Its re-recording and its expiry run one at a time, under `lock`. */
type Socket = {
  readonly registration: LocalRegistration;
  readonly lock: Semaphore.Semaphore;
};

type Grace = { readonly token: symbol; readonly fiber: Fiber.Fiber<void> };

type OnReleased = (
  events: ReadonlyArray<LoggedProtocolEvent>,
) => Effect.Effect<void>;

const ownerKey = (session: ProtocolBuilderSession) =>
  `${session.draftId}\u0000${sessionOwner(session)}`;

const registrationKey = (registration: LocalRegistration) =>
  `${registration.session.draftId}\u0000${registration.key}`;

export class Leases extends Context.Service<
  Leases,
  {
    /**
     * Records this watch as connected, and renews the leases its tab already
     * holds, for as long as the scope is open. When the scope closes the row
     * is expired and, unless the tab still has a socket open on some replica
     * when the reconnect grace runs out, its leases are given back and
     * `onReleased` is told what that logged.
     */
    readonly connect: (
      session: ProtocolBuilderSession,
      onReleased: OnReleased,
    ) => Effect.Effect<void, SqlError.SqlError, Scope.Scope>;
    /** Keeps a calling owner's leases renewed until it has been idle a while. */
    readonly contact: (session: ProtocolBuilderSession) => Effect.Effect<void>;
    /** Whether this replica has a watch open, or a grace pending, for `owner`. */
    readonly connected: (owner: string) => Effect.Effect<boolean>;
  }
>()('@studio/Leases') {
  static readonly layer: Layer.Layer<
    Leases,
    never,
    Database | MaintenanceTriggers
  > = Layer.effect(
    Leases,
    Effect.gen(function* () {
      const database = yield* Database;
      const replicaId = yield* ReplicaId;
      const triggers = yield* MaintenanceTriggers;
      const scope = yield* Effect.scope;
      // Mutated only between yields, so no fiber sees a half-made change.
      const sockets = new Map<string, Socket>();
      const contacts = new Map<string, Contact>();
      const graces = new Map<string, Grace>();
      /** Liveness passes in a row, by draft, that timed out on a lock. */
      const lockWaits = new Map<string, number>();

      const withDatabase = <A, E>(
        effect: Effect.Effect<A, E, Database>,
      ): Effect.Effect<A, E> =>
        effect.pipe(
          Effect.provideService(Database, database),
          Effect.provideService(ReplicaId, replicaId),
        );

      const closed = Effect.map(socketClosure(triggers), Option.isSome);

      const logFailure = (message: string) =>
        Effect.catchCause((cause: Cause.Cause<unknown>) =>
          Effect.logWarning(message, cause),
        );

      const holdsSocket = (owner: string) =>
        [...sockets.values()].some(
          ({ registration }) => ownerKey(registration.session) === owner,
        );

      /**
       * A deleted draft cascaded its rows away: nothing of it is renewed
       * again, and a watch still open on it closes with no grace to run.
       */
      const forget = (draftId: string) =>
        Effect.sync(() => {
          lockWaits.delete(draftId);
          for (const [key, socket] of sockets) {
            if (socket.registration.session.draftId === draftId) {
              sockets.delete(key);
            }
          }
          for (const [owner, contact] of contacts) {
            if (contact.registration.session.draftId === draftId) {
              contacts.delete(owner);
            }
          }
        });

      const tick = Effect.gen(function* () {
        if (yield* closed) return;
        const at = yield* Clock.currentTimeMillis;
        for (const [owner, contact] of contacts) {
          if (contact.until <= at) contacts.delete(owner);
        }
        const byDraft = new Map<string, LocalRegistration[]>();
        for (const registration of [
          ...[...sockets.values()].map((socket) => socket.registration),
          ...[...contacts.values()].map((contact) => contact.registration),
        ]) {
          const draftId = registration.session.draftId;
          const draft = byDraft.get(draftId) ?? [];
          draft.push(registration);
          byDraft.set(draftId, draft);
        }
        for (const draftId of lockWaits.keys()) {
          if (!byDraft.has(draftId)) lockWaits.delete(draftId);
        }
        yield* Effect.forEach(
          byDraft,
          ([draftId, local]) =>
            Effect.gen(function* () {
              const [first] = local;
              if (first === undefined) return;
              const pass = yield* Effect.exit(
                withDatabase(
                  renewConnections(first.session.access, draftId, local),
                ),
              );
              // Registrations stay: an unanswered pass says nothing about
              // whether the connections are still there, and the next tick
              // asks again.
              if (Exit.isFailure(pass)) {
                if (!isLockUnavailable(pass.cause)) {
                  lockWaits.delete(draftId);
                  yield* Effect.logWarning(
                    'Renewing protocol-builder connections failed',
                    pass.cause,
                  );
                  return;
                }
                const waits = (lockWaits.get(draftId) ?? 0) + 1;
                lockWaits.set(draftId, waits);
                // One wait is ordinary contention; several in a row leave the
                // leases a tick or two from lapsing.
                const message = `Renewing protocol-builder connections waited too long for a lock (${waits} in a row); the next tick retries`;
                yield* waits < LOCK_WAITS_BEFORE_WARNING
                  ? Effect.logInfo(message)
                  : Effect.logWarning(message);
                return;
              }
              lockWaits.delete(draftId);
              if (pass.value.gone) {
                yield* forget(draftId);
                return;
              }
              for (const missing of pass.value.missing) {
                yield* reconnect(missing).pipe(
                  withDatabase,
                  logFailure(
                    'Re-recording a protocol-builder connection failed',
                  ),
                );
              }
            }),
          { concurrency: RENEW_CONCURRENCY, discard: true },
        );
      });

      const reconnect = (registration: LocalRegistration) => {
        const draftId = registration.session.draftId;
        if (registration.kind === 'socket') {
          const key = registrationKey(registration);
          const socket = sockets.get(key);
          if (socket === undefined) return Effect.void;
          // Under the lock its close expires the row under, and asked again
          // there: a re-record that committed after that expiry would leave a
          // live row nothing renews or expires.
          return socket.lock.withPermit(
            Effect.gen(function* () {
              if (!sockets.has(key)) return;
              const recorded = yield* connectSocket(
                registration.session,
                registration.key,
              );
              if (!recorded) yield* forget(draftId);
            }),
          );
        }
        const contact = contacts.get(ownerKey(registration.session));
        if (
          contact === undefined ||
          registrationKey(contact.registration) !==
            registrationKey(registration)
        ) {
          return Effect.void;
        }
        return Effect.gen(function* () {
          const recorded = yield* upsertContact(registration.session);
          if (!recorded) yield* forget(draftId);
        });
      };

      yield* tick.pipe(
        Effect.schedule(Schedule.spaced(RENEW_INTERVAL_MS)),
        Effect.forkScoped,
      );

      /**
       * The only grace for this closure: a release that finds the owner's
       * socket live elsewhere ends it, and the replica holding that socket
       * runs a whole grace of its own when the socket closes.
       */
      const graceFor = (
        session: ProtocolBuilderSession,
        onReleased: OnReleased,
      ) =>
        Effect.gen(function* () {
          yield* Effect.sleep(RECONNECT_GRACE_MS);
          // Dropped before the release, which may fail or be skipped while the
          // database is closed: a contact left renewing would keep the leases
          // forever.
          contacts.delete(ownerKey(session));
          if (yield* closed) return;
          yield* Effect.gen(function* () {
            if (yield* closed) return;
            yield* Effect.uninterruptible(
              Effect.gen(function* () {
                const release = yield* withDatabase(releaseOwner(session));
                if (release.released) yield* onReleased(release.events);
              }),
            );
          }).pipe(retryBriefly);
        }).pipe(logFailure('Releasing a stranded lease owner failed'));

      const startGrace = (
        session: ProtocolBuilderSession,
        onReleased: OnReleased,
      ) =>
        Effect.gen(function* () {
          const owner = ownerKey(session);
          if (holdsSocket(owner) || graces.has(owner)) return;
          const token = Symbol(owner);
          let finished = false;
          const fiber = yield* graceFor(session, onReleased).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                finished = true;
                if (graces.get(owner)?.token === token) graces.delete(owner);
              }),
            ),
            Effect.forkIn(scope),
          );
          // A fiber forked into a scope that is already closing ends at once.
          if (!finished) graces.set(owner, { token, fiber });
        });

      const disconnect = (
        registration: LocalRegistration,
        onReleased: OnReleased,
      ) =>
        Effect.gen(function* () {
          const key = registrationKey(registration);
          const socket = sockets.get(key);
          if (socket === undefined) return;
          sockets.delete(key);
          yield* socket.lock
            .withPermit(withDatabase(expireConnection(registration)))
            .pipe(logFailure('Expiring a protocol-builder connection failed'));
          yield* startGrace(registration.session, onReleased);
        });

      const connect = (
        session: ProtocolBuilderSession,
        onReleased: OnReleased,
      ) =>
        Effect.acquireRelease(
          Effect.gen(function* () {
            const registration: LocalRegistration = {
              session,
              key: `${session.connectionId}:${randomUUID()}`,
              kind: 'socket',
            };
            const recorded = yield* withDatabase(
              connectSocket(session, registration.key),
            );
            if (!recorded) return undefined;
            sockets.set(registrationKey(registration), {
              registration,
              lock: Semaphore.makeUnsafe(1),
            });
            // Only once the row is recorded: a reconnect that failed leaves the
            // grace to give the leases back.
            const owner = ownerKey(session);
            const grace = graces.get(owner);
            if (grace !== undefined) {
              graces.delete(owner);
              yield* Fiber.interrupt(grace.fiber);
            }
            return registration;
          }),
          (registration) =>
            registration === undefined
              ? Effect.void
              : disconnect(registration, onReleased),
        ).pipe(Effect.asVoid);

      const contact = (session: ProtocolBuilderSession) =>
        Effect.gen(function* () {
          if (yield* closed) return;
          const at = yield* Clock.currentTimeMillis;
          const owner = ownerKey(session);
          const existing = contacts.get(owner);
          const due =
            existing?.contactedAt === undefined ||
            at - existing.contactedAt >= CONTACT_INTERVAL_MS;
          contacts.set(owner, {
            registration: {
              session,
              key: contactKey(session, replicaId),
              kind: 'contact',
            },
            until: at + IDLE_MS,
            contactedAt: existing?.contactedAt,
          });
          if (!due) return;
          const recorded = yield* withDatabase(upsertContact(session));
          if (!recorded) {
            yield* forget(session.draftId);
            return;
          }
          const current = contacts.get(owner);
          if (current !== undefined) {
            contacts.set(owner, { ...current, contactedAt: at });
          }
        }).pipe(logFailure('Recording protocol-builder contact failed'));

      const connected = (owner: string) =>
        Effect.sync(
          () =>
            [...sockets.values()].some(
              ({ registration }) =>
                sessionOwner(registration.session) === owner,
            ) ||
            [...graces.keys()].some((key) => key.endsWith(`\u0000${owner}`)),
        );

      return Leases.of({ connect, contact, connected });
    }),
  );
}
