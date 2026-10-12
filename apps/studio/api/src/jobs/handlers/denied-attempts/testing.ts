import { Context, Effect, Layer } from 'effect';

import { DENIED_SCOPE_COUNTS_KEY } from '../../../rate-limit/limiter.ts';
import {
  DeniedAttemptsStore,
  DeniedAttemptsStoreFailed,
  type WindowFields,
} from './store.ts';

export type MemoryStoreOperation = 'scan' | 'claim' | 'del' | 'drain';

export class DeniedAttemptsMemory extends Context.Service<
  DeniedAttemptsMemory,
  {
    readonly seed: (
      key: string,
      fields: Record<string, string>,
    ) => Effect.Effect<void>;
    readonly read: (key: string) => Effect.Effect<WindowFields | null>;
    readonly exists: (key: string) => Effect.Effect<boolean>;
    readonly failOn: (
      operation: MemoryStoreOperation | null,
    ) => Effect.Effect<void>;
  }
>()('@studio/jobs/handlers/test/DeniedAttemptsMemory') {}

export const layerMemoryStore: Layer.Layer<
  DeniedAttemptsStore | DeniedAttemptsMemory
> = Layer.effectContext(
  Effect.sync(() => {
    const keys = new Map<string, Map<string, string>>();
    let failing: MemoryStoreOperation | null = null;

    // Suspended so `failOn` is read per call. The yield lets a second fiber run
    // between this store's operations, the way a round trip to Valkey would.
    const guard = (operation: MemoryStoreOperation) =>
      Effect.flatMap(Effect.yieldNow, () =>
        failing === operation
          ? Effect.fail(
              new DeniedAttemptsStoreFailed({
                operation,
                message: 'the memory store was told to fail',
              }),
            )
          : Effect.void,
      );

    const store = DeniedAttemptsStore.of({
      configured: true,
      scanWindowKeys: (prefix) =>
        Effect.flatMap(guard('scan'), () =>
          Effect.sync(() =>
            [...keys.keys()].filter((key) => key.startsWith(`${prefix}:`)),
          ),
        ),
      claimWindow: (claim) =>
        Effect.flatMap(guard('claim'), () =>
          Effect.sync((): WindowFields => {
            const live = keys.get(claim.key);
            if (live) {
              keys.delete(claim.key);
              live.set('claimedAt', String(claim.nowMs));
              keys.set(claim.claimKey, live);
              return new Map(live);
            }
            const claimed = keys.get(claim.claimKey);
            if (!claimed) return new Map();
            const claimedAt = Number(claimed.get('claimedAt') ?? '0');
            if (claim.nowMs - claimedAt < claim.staleMs) return new Map();
            claimed.set('claimedAt', String(claim.nowMs));
            return new Map(claimed);
          }),
        ),
      discardClaim: (claimKey) =>
        Effect.flatMap(guard('del'), () =>
          Effect.sync(() => {
            keys.delete(claimKey);
          }),
        ),
      drainScopeCounts: Effect.flatMap(guard('drain'), () =>
        Effect.sync((): WindowFields => {
          const counts = keys.get(DENIED_SCOPE_COUNTS_KEY);
          if (!counts) return new Map();
          keys.delete(DENIED_SCOPE_COUNTS_KEY);
          return new Map(counts);
        }),
      ),
    });

    return Context.make(DeniedAttemptsStore, store).pipe(
      Context.add(
        DeniedAttemptsMemory,
        DeniedAttemptsMemory.of({
          seed: (key, fields) =>
            Effect.sync(() => {
              keys.set(key, new Map(Object.entries(fields)));
            }),
          read: (key) =>
            Effect.sync(() => {
              const fields = keys.get(key);
              return fields ? new Map(fields) : null;
            }),
          exists: (key) => Effect.sync(() => keys.has(key)),
          failOn: (operation) =>
            Effect.sync(() => {
              failing = operation;
            }),
        }),
      ),
    );
  }),
);
