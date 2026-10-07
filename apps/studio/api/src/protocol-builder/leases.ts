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
} from 'effect';
import type { SqlError } from 'effect/sql';

import { Database } from '../db/client.ts';
import { MaintenanceTriggers } from '../http/middleware/maintenance.ts';
import {
  connectSocket,
  contactKey,
  expireConnection,
  releaseOwner,
  renewConnections,
  upsertContact,
  type AdoptedLease,
  type LocalRegistration,
} from './connections.ts';
import type { LoggedProtocolEvent } from './events.ts';
import { sessionOwner, type ProtocolBuilderSession } from './host.ts';
import { socketClosure } from './socket-closure.ts';

/** A third of the lease TTL: two renewals may be lost before one expires. */
export const RENEW_INTERVAL_MS = 10_000;

/**
 * Shorter than the 30s lease TTL, but long enough for a client to come back:
 * its socket's retries (Effect RpcClient's default, 0.5s growing by 1.5x and
 * capped at 5s) make five attempts in about 6.6s, and its watch re-runs
 * after 0.25s to 4s.
 */
export const RECONNECT_GRACE_MS = 20_000;

export const IDLE_MS = 5 * 60_000;

/** How often one owner's unary calls reach the database, per replica. */
const CONTACT_INTERVAL_MS = 30_000;

type Contact = {
  readonly registration: LocalRegistration;
  readonly until: number;
  readonly contactedAt: number | undefined;
};

type Grace = { readonly token: symbol; readonly fiber: Fiber.Fiber<void> };

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
     * is expired and, unless the tab comes back within the reconnect grace on
     * any replica, its leases are given back and `onReleased` is told what
     * that logged.
     */
    readonly connect: (
      session: ProtocolBuilderSession,
      onReleased: (
        events: ReadonlyArray<LoggedProtocolEvent>,
      ) => Effect.Effect<void>,
    ) => Effect.Effect<
      ReadonlyArray<AdoptedLease>,
      SqlError.SqlError,
      Scope.Scope
    >;
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
      const triggers = yield* MaintenanceTriggers;
      const scope = yield* Effect.scope;
      // Mutated only between yields, so no fiber sees a half-made change.
      const sockets = new Map<string, LocalRegistration>();
      const contacts = new Map<string, Contact>();
      const graces = new Map<string, Grace>();

      const withDatabase = Effect.provideService(Database, database);

      const closed = Effect.map(socketClosure(triggers), Option.isSome);

      const logFailure = (message: string) =>
        Effect.catchCause((cause: Cause.Cause<unknown>) =>
          Effect.logWarning(message, cause),
        );

      const holdsSocket = (owner: string) =>
        [...sockets.values()].some(
          (registration) => ownerKey(registration.session) === owner,
        );

      const tick = Effect.gen(function* () {
        if (yield* closed) return;
        const at = yield* Clock.currentTimeMillis;
        for (const [owner, contact] of contacts) {
          if (contact.until <= at) contacts.delete(owner);
        }
        const byTeam = new Map<string, LocalRegistration[]>();
        for (const registration of [
          ...sockets.values(),
          ...[...contacts.values()].map((contact) => contact.registration),
        ]) {
          const teamId = registration.session.access.teamId;
          const team = byTeam.get(teamId) ?? [];
          team.push(registration);
          byTeam.set(teamId, team);
        }
        for (const local of byTeam.values()) {
          const [first] = local;
          if (first === undefined) continue;
          const pass = yield* Effect.exit(
            withDatabase(renewConnections(first.session.access, local)),
          );
          // Registrations stay: an unanswered pass says nothing about whether
          // the connections are still there, and the next tick asks again.
          if (Exit.isFailure(pass)) {
            yield* Effect.logWarning(
              'Renewing protocol-builder connections failed',
              pass.cause,
            );
            continue;
          }
          for (const missing of pass.value.missing) {
            yield* reconnect(missing).pipe(
              withDatabase,
              logFailure('Re-recording a protocol-builder connection failed'),
            );
          }
        }
      });

      const reconnect = (registration: LocalRegistration) => {
        const key = registrationKey(registration);
        if (registration.kind === 'socket') {
          return sockets.has(key)
            ? Effect.asVoid(
                connectSocket(registration.session, registration.key),
              )
            : Effect.void;
        }
        const contact = contacts.get(ownerKey(registration.session));
        return contact !== undefined &&
          registrationKey(contact.registration) === key
          ? upsertContact(registration.session)
          : Effect.void;
      };

      yield* tick.pipe(
        Effect.schedule(Schedule.spaced(RENEW_INTERVAL_MS)),
        Effect.forkScoped,
      );

      const graceFor = (
        session: ProtocolBuilderSession,
        onReleased: (
          events: ReadonlyArray<LoggedProtocolEvent>,
        ) => Effect.Effect<void>,
      ) =>
        Effect.gen(function* () {
          const owner = ownerKey(session);
          let wait = RECONNECT_GRACE_MS;
          while (true) {
            yield* Effect.sleep(wait);
            if (yield* closed) return;
            // Dropped before the release, which may fail: a contact left
            // renewing would keep the leases forever.
            contacts.delete(owner);
            const outcome = yield* Effect.uninterruptible(
              Effect.gen(function* () {
                const release = yield* withDatabase(releaseOwner(session));
                if (release.released) yield* onReleased(release.events);
                return release;
              }),
            );
            if (outcome.released) return;
            wait = outcome.retryInMs;
          }
        }).pipe(logFailure('Releasing a stranded lease owner failed'));

      const startGrace = (
        session: ProtocolBuilderSession,
        onReleased: (
          events: ReadonlyArray<LoggedProtocolEvent>,
        ) => Effect.Effect<void>,
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
        onReleased: (
          events: ReadonlyArray<LoggedProtocolEvent>,
        ) => Effect.Effect<void>,
      ) =>
        Effect.gen(function* () {
          sockets.delete(registrationKey(registration));
          yield* withDatabase(expireConnection(registration)).pipe(
            logFailure('Expiring a protocol-builder connection failed'),
          );
          yield* startGrace(registration.session, onReleased);
        });

      const connect = (
        session: ProtocolBuilderSession,
        onReleased: (
          events: ReadonlyArray<LoggedProtocolEvent>,
        ) => Effect.Effect<void>,
      ) =>
        Effect.acquireRelease(
          Effect.gen(function* () {
            const grace = graces.get(ownerKey(session));
            if (grace !== undefined) {
              graces.delete(ownerKey(session));
              yield* Fiber.interrupt(grace.fiber);
            }
            const registration: LocalRegistration = {
              session,
              key: `${session.connectionId}:${randomUUID()}`,
              kind: 'socket',
            };
            const adopted = yield* withDatabase(
              connectSocket(session, registration.key),
            );
            sockets.set(registrationKey(registration), registration);
            return { registration, adopted };
          }),
          ({ registration }) => disconnect(registration, onReleased),
        ).pipe(Effect.map(({ adopted }) => adopted));

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
              key: contactKey(session),
              kind: 'contact',
            },
            until: at + IDLE_MS,
            contactedAt: existing?.contactedAt,
          });
          if (!due) return;
          yield* withDatabase(upsertContact(session));
          const current = contacts.get(owner);
          if (current !== undefined) {
            contacts.set(owner, { ...current, contactedAt: at });
          }
        }).pipe(logFailure('Recording protocol-builder contact failed'));

      const connected = (owner: string) =>
        Effect.sync(
          () =>
            [...sockets.values()].some(
              (registration) => sessionOwner(registration.session) === owner,
            ) ||
            [...graces.keys()].some((key) => key.endsWith(`\u0000${owner}`)),
        );

      return Leases.of({ connect, contact, connected });
    }),
  );
}
