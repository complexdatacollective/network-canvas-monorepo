// The leases this process is keeping alive for the protocol-builder host.
//
// The contract has no renew: an editor takes a section and holds it until it
// releases. Studio's storage is a lease with a wall-clock expiry, so keeping
// the two agreeing is the server's business — this is where that happens.
import {
  Clock,
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Ref,
  Schedule,
  type Scope,
} from 'effect';

import type { Lease } from '@codaco/studio-sync/server';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

/** A third of the lease TTL: two renewals may be lost before one expires. */
export const RENEW_INTERVAL_MS = 10_000;

/**
 * How long an owner's leases wait for its next connection after the last one
 * ended.
 *
 * A lock belongs to a browser tab, and a tab keeps its identity across the
 * sockets it opens, so a socket that vanishes is a reconnection in progress
 * rather than a departure. Shorter than the 30s lease TTL, per #1247's rule
 * that a dirty drop holds the lease for a window shorter than the TTL: a tab
 * whose socket died must never cost a colleague more than a server that died,
 * which frees its sections within one TTL because nothing is left to renew
 * them. Long enough for five rungs of the reconnect ladder #1247 fixes for the
 * client (500ms doubling to a 30s cap: 0.5s, 1.5s, 3.5s, 7.5s, 15.5s), which
 * is every blip a researcher would call one. A tab that closes cleanly
 * releases its lock and gives the section back at once, so this bounds a crash
 * or a drop rather than a departure.
 */
export const RECONNECT_GRACE_MS = 20_000;

/**
 * How long a lease — and the imports staged beside it — outlives an owner that
 * has never opened a channel.
 *
 * Studio's editor opens one, so this is the unary plane alone: a script, or a
 * client whose network refuses WebSockets. There is no connection to end
 * there, so the only sign of life is a call, and the bound is wide enough that
 * a researcher reading a section does not lose it mid-thought.
 */
export const IDLE_MS = 5 * 60_000;

export type HeldLease = {
  /**
   * Renews this lease, in a transaction the caller opens.
   *
   * An effect rather than the sync server itself, because a sync operation
   * requires the open `Transaction` and this keeper has none to give: it runs
   * from a timer, outside any request, and a transaction opened here would be
   * one no team GUC had been stamped on. The host is what turns the call into
   * a transaction, so the effect arrives with everything it needs provided.
   *
   * `null` is the storage's answer that the lease is gone; a failure is the
   * storage not answering, which `renewDue` tells apart below.
   */
  readonly renew: Effect.Effect<Lease | null, unknown>;
  readonly draftId: string;
  readonly sectionId: ProtocolSectionId;
  readonly owner: string;
};

type Entry = HeldLease & {
  /** Which `hold` this is, so a late answer never acts on its successor. */
  readonly generation: number;
  readonly touchedAt: number;
};

type OwnerConnections = {
  readonly open: number;
  /**
   * The reconnect grace running since the owner's last connection ended,
   * while none has replaced it.
   */
  readonly grace?: Fiber.Fiber<void>;
  /**
   * Everything the owner loses once the grace has run out: the leases it still
   * holds, given back with a lock event, and the imports it had staged.
   *
   * One per draft the owner opened a channel on, because one tab may hold
   * sections in more than one protocol and each release is that draft's own.
   */
  readonly ends: ReadonlyMap<string, Effect.Effect<void>>;
};

const leaseKey = (draftId: string, sectionId: string, owner: string) =>
  `${draftId} ${sectionId} ${owner}`;

export class Leases extends Context.Service<
  Leases,
  {
    /**
     * Counts one live connection for an owner until the calling scope closes.
     * While a connection is open its owner's leases are renewed however long
     * the researcher spends not calling anything: losing a lock under an open
     * editor is not a thing that may happen.
     *
     * The last connection ending starts the reconnect grace rather than the
     * release: the owner is a browser tab, and a tab reconnecting is the same
     * tab. `end` is what runs for this draft if none comes back in time; it
     * runs in this layer's scope, long after the connection's, so it must
     * arrive with everything it needs provided.
     */
    readonly connect: (
      owner: string,
      draftId: string,
      end: Effect.Effect<void>,
    ) => Effect.Effect<void, never, Scope.Scope>;
    readonly hold: (lease: HeldLease) => Effect.Effect<void>;
    readonly drop: (
      draftId: string,
      sectionId: ProtocolSectionId,
      owner: string,
    ) => Effect.Effect<void>;
    /**
     * Whether this owner still has a channel: one open, or one whose reconnect
     * grace has not run out. What keeps its leases out of the idle bound is
     * what keeps the imports it staged, so both ask this.
     */
    readonly connected: (owner: string) => Effect.Effect<boolean>;
    /** Every section this owner still holds here, as far as this process knows. */
    readonly heldSections: (
      draftId: string,
      owner: string,
    ) => Effect.Effect<ReadonlyArray<ProtocolSectionId>>;
    readonly touch: (owner: string) => Effect.Effect<void>;
  }
>()('@studio/Leases') {
  /**
   * Renews every lease this process is holding until it is released, or until
   * its owner has gone the reconnect grace with no connection at all.
   */
  static readonly layer: Layer.Layer<Leases> = Layer.effect(
    Leases,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const held = yield* Ref.make<ReadonlyMap<string, Entry>>(new Map());
      const connections = yield* Ref.make<
        ReadonlyMap<string, OwnerConnections>
      >(new Map());
      let generations = 0;

      /** Removes `key` only while it still names the entry that was read. */
      const forget = (key: string, generation: number) =>
        Ref.update(held, (current) => {
          if (current.get(key)?.generation !== generation) return current;
          const next = new Map(current);
          next.delete(key);
          return next;
        });

      /**
       * Owners whose reconnection never came. Renewal continues throughout the
       * grace, so what ends the lease is this rather than the storage expiry —
       * the section is free the moment the grace is up, and the release
       * publishes the lock event that tells everyone watching.
       */
      const endStranded = Effect.fnUntraced(function* (owner: string) {
        const ends = yield* Ref.modify(connections, (current) => {
          const state = current.get(owner);
          if (state === undefined || state.open > 0)
            return [undefined, current];
          const next = new Map(current);
          next.delete(owner);
          return [state.ends, next];
        });
        if (ends === undefined) return;
        for (const end of ends.values()) {
          // This runs from a timer, so a release that cannot reach the
          // database has nobody to report to and must not take the keeper down
          // with it. The leases it was giving back are already out of this
          // keeper, so they lapse on their own expiry instead.
          yield* end.pipe(
            Effect.catchCause((cause) =>
              Effect.logError('Releasing a stranded lease owner failed', cause),
            ),
          );
        }
      });

      const renewDue = Effect.gen(function* () {
        const at = yield* Clock.currentTimeMillis;
        const open = yield* Ref.get(connections);
        for (const [key, lease] of yield* Ref.get(held)) {
          if (!open.has(lease.owner) && at - lease.touchedAt > IDLE_MS) {
            yield* forget(key, lease.generation);
            continue;
          }
          const renewed = yield* Effect.exit(lease.renew);
          // A renewal that could not be made is not an answer: a database that
          // was briefly unreachable has said nothing about whose lease it is,
          // and forgetting the lease here would let it expire under an editor
          // who is still holding it — whose next submit is then refused as
          // `NotLockHolder`. The entry stays and the next tick asks again; the
          // interval is a third of the TTL so that two may be lost this way.
          if (Exit.isFailure(renewed)) continue;
          // `null` is the update matching no row, which is a lease that
          // expired or was taken over. The acquire that took it publishes its
          // own lock event, so dropping the entry is the whole of the response
          // here.
          if (renewed.value === null) yield* forget(key, lease.generation);
        }
      });

      yield* renewDue.pipe(
        Effect.schedule(Schedule.spaced(RENEW_INTERVAL_MS)),
        Effect.forkScoped,
      );

      const connect = (
        owner: string,
        draftId: string,
        end: Effect.Effect<void>,
      ) =>
        Effect.acquireRelease(
          Effect.gen(function* () {
            const grace = yield* Ref.modify(connections, (current) => {
              const state = current.get(owner);
              const ends = new Map(state?.ends);
              ends.set(draftId, end);
              const next = new Map(current);
              next.set(owner, { open: (state?.open ?? 0) + 1, ends });
              return [state?.grace, next];
            });
            if (grace !== undefined) yield* Fiber.interrupt(grace);
          }),
          () =>
            Effect.gen(function* () {
              const stranded = yield* Ref.modify(connections, (current) => {
                const state = current.get(owner);
                if (state === undefined) return [false, current];
                const open = state.open - 1;
                return [
                  open === 0,
                  new Map(current).set(owner, { ...state, open }),
                ];
              });
              if (!stranded) return;
              const grace = yield* Effect.sleep(RECONNECT_GRACE_MS).pipe(
                Effect.andThen(Effect.uninterruptible(endStranded(owner))),
                Effect.forkIn(scope),
              );
              const kept = yield* Ref.modify(connections, (current) => {
                const state = current.get(owner);
                if (state?.open !== 0 || state.grace !== undefined) {
                  return [false, current];
                }
                return [true, new Map(current).set(owner, { ...state, grace })];
              });
              if (!kept) yield* Fiber.interrupt(grace);
            }),
        ).pipe(Effect.asVoid);

      const hold = (lease: HeldLease) =>
        Effect.gen(function* () {
          const touchedAt = yield* Clock.currentTimeMillis;
          generations += 1;
          const entry: Entry = { ...lease, generation: generations, touchedAt };
          yield* Ref.update(held, (current) =>
            new Map(current).set(
              leaseKey(lease.draftId, lease.sectionId, lease.owner),
              entry,
            ),
          );
        });

      const drop = (
        draftId: string,
        sectionId: ProtocolSectionId,
        owner: string,
      ) =>
        Ref.update(held, (current) => {
          const next = new Map(current);
          next.delete(leaseKey(draftId, sectionId, owner));
          return next;
        });

      const connected = (owner: string) =>
        Ref.get(connections).pipe(Effect.map((current) => current.has(owner)));

      const heldSections = (draftId: string, owner: string) =>
        Ref.get(held).pipe(
          Effect.map((current) =>
            [...current.values()]
              .filter(
                (lease) => lease.draftId === draftId && lease.owner === owner,
              )
              .map((lease) => lease.sectionId),
          ),
        );

      const touch = (owner: string) =>
        Effect.gen(function* () {
          const at = yield* Clock.currentTimeMillis;
          yield* Ref.update(held, (current) => {
            const next = new Map(current);
            for (const [key, lease] of current) {
              if (lease.owner === owner)
                next.set(key, { ...lease, touchedAt: at });
            }
            return next;
          });
        });

      return Leases.of({ connect, hold, drop, connected, heldSections, touch });
    }),
  );
}
