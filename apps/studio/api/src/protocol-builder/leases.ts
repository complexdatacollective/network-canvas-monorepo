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
 * Shorter than the 30s lease TTL, but long enough for a client to come back:
 * its socket's retries (Effect RpcClient's default, 0.5s growing by 1.5x and
 * capped at 5s) make five attempts in about 6.6s, and its watch re-runs
 * after 0.25s to 4s.
 */
export const RECONNECT_GRACE_MS = 20_000;

export const IDLE_MS = 5 * 60_000;

export type HeldLease = {
  readonly renew: Effect.Effect<Lease | null, unknown>;
  readonly draftId: string;
  readonly sectionId: ProtocolSectionId;
  readonly owner: string;
};

type Entry = HeldLease & {
  readonly generation: number;
  readonly touchedAt: number;
};

type OwnerConnections = {
  readonly open: number;
  readonly grace?: Fiber.Fiber<void>;
  readonly ends: ReadonlyMap<string, Effect.Effect<void>>;
};

const leaseKey = (draftId: string, sectionId: string, owner: string) =>
  `${draftId} ${sectionId} ${owner}`;

export class Leases extends Context.Service<
  Leases,
  {
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
    readonly connected: (owner: string) => Effect.Effect<boolean>;
    readonly heldSections: (
      draftId: string,
      owner: string,
    ) => Effect.Effect<ReadonlyArray<ProtocolSectionId>>;
    readonly touch: (owner: string) => Effect.Effect<void>;
  }
>()('@studio/Leases') {
  static readonly layer: Layer.Layer<Leases> = Layer.effect(
    Leases,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const held = yield* Ref.make<ReadonlyMap<string, Entry>>(new Map());
      const connections = yield* Ref.make<
        ReadonlyMap<string, OwnerConnections>
      >(new Map());
      let generations = 0;

      const forget = (key: string, generation: number) =>
        Ref.update(held, (current) => {
          if (current.get(key)?.generation !== generation) return current;
          const next = new Map(current);
          next.delete(key);
          return next;
        });

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
          // Runs from a timer, so a failing release must not take the keeper
          // down with it.
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
          // An unanswered renewal says nothing about whose lease it is: the
          // entry stays and the next tick asks again.
          if (Exit.isFailure(renewed)) continue;
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
