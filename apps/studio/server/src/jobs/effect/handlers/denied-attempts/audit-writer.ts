import { randomUUID } from 'node:crypto';

import { Context, Effect, Layer, Schema } from 'effect';
import type pg from 'pg';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import type { DeniedAuditSummary } from '../../../../audit/denial-rate-limit.ts';
import { createDeniedAuditSummaryWriter } from '../../../../audit/denial-summary.ts';
import type { DeniedAuditOperation } from '../../../../audit/events.ts';
import type { SessionPrincipal } from '../../../../auth/service.ts';
import { deepestMessage } from '../../errors.ts';

// The other half of `denied-attempts-summary` that is not Effect yet: writing
// the summary into a team's audit log. `appendAuditedEvent`
// (src/audit/command.ts) is a Promise over a `TenantDb`, which is node-postgres
// over a pool, and the whole audit stack moves to Effect in stage 4 (#1927).
//
// Until then this tag is the seam, and its live layer is where the pool
// crosses the boundary: `layer(pool)` takes the **maintenance** pool, because
// a summary is by construction a write into a team no request pinned and
// cross-team writes are the maintenance role's alone. Stage 3 hands this layer
// the pool it already builds; stage 4 replaces the layer with one over the
// audit store itself and this file goes away.
//
// Reading is deliberately not here. Whether a window's event is already in the
// log is the handler's own idempotency rule (`summaryAlreadyWritten`), it runs
// through the queue's `Database` like every other read the job makes, and
// keeping it there is what makes a failing writer testable without a broken
// database underneath it.

/**
 * The audit write did not happen. The handler keeps the claim when it sees
 * this, so a later run takes the window again — which is the whole reason the
 * claim is a rename rather than a delete.
 */
export class DeniedAuditSummaryWriteFailed extends Schema.TaggedError<DeniedAuditSummaryWriteFailed>()(
  'DeniedAuditSummaryWriteFailed',
  { message: Schema.String },
) {}

export type DeniedAuditSummaryWrite = {
  readonly teamId: string;
  readonly operation: DeniedAuditOperation;
  /**
   * The actor the suppressed attempts belonged to, read from the user row by
   * the handler: the event carries the actor's label, and a name and an email
   * address are exactly what the limiter's keys are hashed to keep out of the
   * rate-limit store.
   */
  readonly actor: SessionPrincipal;
  readonly summary: DeniedAuditSummary;
};

export class DeniedAuditSummaryWriter extends Context.Service<
  DeniedAuditSummaryWriter,
  {
    readonly write: (
      write: DeniedAuditSummaryWrite,
    ) => Effect.Effect<void, DeniedAuditSummaryWriteFailed>;
  }
>()('@studio/jobs/effect/handlers/DeniedAuditSummaryWriter') {
  /**
   * Today's writer over the maintenance pool. The pool is the stage-3/4 seam:
   * stage 3 passes the one it already has, stage 4 replaces this layer with
   * one over an Effect audit store and the pool stops crossing the boundary.
   *
   * The pool this is handed must reach the same database, as the same
   * maintenance role, with the same `search_path`, as the `Database` the
   * worker runs the handler on. The handler's idempotency check
   * (`summaryAlreadyWritten`) reads `audit_events` through that `Database`
   * while the row is written through this pool, so two pools pointed at
   * different schemas would make every already-written summary read as
   * missing — and the second copy of an immutable audit event is permanent.
   */
  static readonly layer = (
    maintenancePool: pg.Pool,
  ): Layer.Layer<DeniedAuditSummaryWriter> =>
    Layer.succeed(DeniedAuditSummaryWriter)(
      DeniedAuditSummaryWriter.of({
        write: Effect.fn('DeniedAuditSummaryWriter.write')(function* (
          write: DeniedAuditSummaryWrite,
        ) {
          yield* Effect.tryPromise({
            try: () =>
              createDeniedAuditSummaryWriter(
                {
                  tenantDb: createTenantDb(maintenancePool, write.teamId),
                  principal: write.actor,
                  requestId: randomUUID(),
                },
                write.operation,
              )(write.summary),
            catch: (cause) =>
              new DeniedAuditSummaryWriteFailed({
                message: deepestMessage(cause) ?? String(cause),
              }),
          });
        }),
      }),
    );
}
