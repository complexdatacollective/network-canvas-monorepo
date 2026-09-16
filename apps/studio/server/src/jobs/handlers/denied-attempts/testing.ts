import { Context, Effect, Layer } from 'effect';

import { DENIED_SCOPE_COUNTS_KEY } from '../../../rate-limit.ts';
import {
  DeniedAuditSummaryWriteFailed,
  DeniedAuditSummaryWriter,
  type DeniedAuditSummaryWrite,
} from './audit-writer.ts';
import {
  DeniedAttemptsStore,
  DeniedAttemptsStoreFailed,
  type WindowFields,
} from './store.ts';

// Test implementations of this handler's two seams, beside the seams rather
// than in the suite: the in-memory store is the only place the claim's
// semantics are written down twice, and a reader comparing it with the Lua in
// store.ts should not have to go looking for it.
//
// Two things the memory store deliberately does not model, so that a case
// whose subject is either of them belongs against a real Valkey instead:
//
//  - `ttlMs` is accepted and ignored. Nothing here expires, so a claim the
//    real store would have dropped an hour on is still readable.
//  - `scanWindowKeys` answers with a perfect snapshot of the keyspace, where a
//    real cursor `SCAN` may repeat a key across pages and may miss one that
//    was created while the cursor was moving.

/** Which store call a case has told the memory store to fail. */
export type MemoryStoreOperation = 'scan' | 'claim' | 'del' | 'drain';

/** The keyspace behind `layerMemoryStore`, for fixtures and oracles. */
export class DeniedAttemptsMemory extends Context.Service<
  DeniedAttemptsMemory,
  {
    /** Puts a hash at a key, the way the limiter's script would have. */
    readonly seed: (
      key: string,
      fields: Record<string, string>,
    ) => Effect.Effect<void>;
    /** A key's fields, or null when there is no such key. */
    readonly read: (key: string) => Effect.Effect<WindowFields | null>;
    readonly exists: (key: string) => Effect.Effect<boolean>;
    /** Makes one operation fail; `null` makes them all work again. */
    readonly failOn: (
      operation: MemoryStoreOperation | null,
    ) => Effect.Effect<void>;
  }
>()('@studio/jobs/handlers/test/DeniedAttemptsMemory') {}

/**
 * A `Map` that honours the claim's semantics: a live window is renamed onto
 * its claim key and handed over, a claim younger than `staleMs` belongs to
 * the run that took it, and an older one may be taken again.
 *
 * Every operation is one `Effect.sync` behind one `Effect.yieldNow`, so two
 * handler fibers racing the same window interleave exactly where two processes
 * racing the Lua would — between operations, never inside one. Without the
 * yield the whole of a synchronous run finishes before the second fiber is
 * scheduled at all, and a "two workers at once" case proves nothing about the
 * claim being atomic because the two never overlap.
 */
export const layerMemoryStore: Layer.Layer<
  DeniedAttemptsStore | DeniedAttemptsMemory
> = Layer.effectContext(
  Effect.sync(() => {
    const keys = new Map<string, Map<string, string>>();
    let failing: MemoryStoreOperation | null = null;

    // Suspended, not decided here: `drainScopeCounts` is a value rather than a
    // function, so a guard built eagerly would answer with whatever `failOn`
    // had been told at the moment the layer was built — which is never.
    //
    // The yield is what gives a second fiber a chance to run between this
    // store's operations, the way a round trip to Valkey would.
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

/** What a recording writer was asked to write. */
export class RecordedSummaries extends Context.Service<
  RecordedSummaries,
  {
    readonly written: DeniedAuditSummaryWrite[];
    /**
     * How the next writes answer. Settable so a case can fail one write and
     * let the next succeed, which is what the recovery path needs.
     */
    readonly setBehaviour: (
      behaviour: (
        write: DeniedAuditSummaryWrite,
        call: number,
      ) => Effect.Effect<void, DeniedAuditSummaryWriteFailed>,
    ) => Effect.Effect<void>;
  }
>()('@studio/jobs/handlers/test/RecordedSummaries') {}

/** A writer that records instead of writing, and fails when told to. */
export const layerRecordingWriter: Layer.Layer<
  DeniedAuditSummaryWriter | RecordedSummaries
> = Layer.effectContext(
  Effect.sync(() => {
    const written: DeniedAuditSummaryWrite[] = [];
    let behaviour: (
      write: DeniedAuditSummaryWrite,
      call: number,
    ) => Effect.Effect<void, DeniedAuditSummaryWriteFailed> = () => Effect.void;
    return Context.make(
      DeniedAuditSummaryWriter,
      DeniedAuditSummaryWriter.of({
        write: (write) =>
          Effect.suspend(() => {
            written.push(write);
            return behaviour(write, written.length);
          }),
      }),
    ).pipe(
      Context.add(
        RecordedSummaries,
        RecordedSummaries.of({
          written,
          setBehaviour: (next) =>
            Effect.sync(() => {
              behaviour = next;
            }),
        }),
      ),
    );
  }),
);

/** A writer every call of which fails; the "the audit log is gone" case. */
export const layerRefusingWriter: Layer.Layer<DeniedAuditSummaryWriter> =
  Layer.succeed(DeniedAuditSummaryWriter)(
    DeniedAuditSummaryWriter.of({
      write: () =>
        Effect.fail(
          new DeniedAuditSummaryWriteFailed({ message: 'database is gone' }),
        ),
    }),
  );
