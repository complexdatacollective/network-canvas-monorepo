import { Cause, DateTime, Effect, Ref } from 'effect';
import type { SqlError } from 'effect/sql';

import type { NotFound } from '@codaco/studio-contract/schema/errors';

import {
  CLAIMED_SUFFIX,
  DENIAL_KEY_PREFIX,
  type DeniedAuditSummary,
  type DeniedAuditWindow,
  parseDenialWindowKey,
} from '../../audit/denial-rate-limit.ts';
import {
  appendDeniedAuditSummary,
  type DeniedAuditActor,
} from '../../audit/denial-summary.ts';
import {
  DENIED_AUDIT_OPERATIONS,
  type DeniedAuditOperation,
} from '../../audit/events.ts';
import { type MaintenanceDatabase } from '../../db/client.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';
import { causeError, deepestMessage } from '../errors.ts';
import { maintenanceTeamAccess } from '../team-access.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';
import {
  DeniedAttemptsStore,
  type DeniedAttemptsStoreFailed,
  type WindowFields,
} from './denied-attempts/store.ts';

const QUEUE = 'denied-attempts-summary';

const DEFAULT_WINDOW_MS = 60_000;

/** Margin for an API process whose clock runs slightly behind and is still writing the minute that just ended. */
const CLOSE_MARGIN_MS = 1_000;

const CLAIM_TTL_MS = 3_600_000;

const CLAIM_STALE_MS = 300_000;

export type DeniedAttemptsSummaryOptions = {
  readonly keyPrefix?: string | undefined;
  readonly windowMs?: number | undefined;
};

type ActorRow = {
  readonly name: string;
  readonly email: string;
};

function readSummary(fields: WindowFields): DeniedAuditSummary | null {
  const suppressedCount = Number(fields.get('suppressed') ?? '0');
  const firstSuppressedAt = Number(fields.get('first'));
  const lastSuppressedAt = Number(fields.get('last'));
  if (!Number.isSafeInteger(suppressedCount) || suppressedCount <= 0) {
    return null;
  }
  if (
    !Number.isSafeInteger(firstSuppressedAt) ||
    !Number.isSafeInteger(lastSuppressedAt)
  ) {
    return null;
  }
  return { suppressedCount, firstSuppressedAt, lastSuppressedAt };
}

function isDeniedAuditOperation(
  operation: string,
): operation is DeniedAuditOperation {
  return (DENIED_AUDIT_OPERATIONS as readonly string[]).includes(operation);
}

const loadActor = Effect.fnUntraced(function* (actorId: string) {
  const rows = yield* MaintenanceScope.open(
    Effect.flatMap(
      Transaction,
      ({ sql }) => sql<ActorRow>`
        SELECT name, email FROM "user" WHERE id = ${actorId}`,
    ),
  );
  const row = rows[0];
  if (!row) return null;
  const actor: DeniedAuditActor = {
    userId: actorId,
    email: row.email,
    name: row.name,
  };
  return actor;
});

const summaryAlreadyWritten = Effect.fnUntraced(function* (
  window: DeniedAuditWindow,
  operation: DeniedAuditOperation,
  firstSuppressedAt: number,
) {
  // Inside a tenant transaction: `audit_events`'s policy has no maintenance escape,
  // so a read without the team stamped sees nothing.
  const rows = yield* MaintenanceScope.openTenant(
    maintenanceTeamAccess(window.teamId),
    Effect.flatMap(
      Transaction,
      ({ sql }) => sql<{ present: boolean }>`
        SELECT true AS present FROM audit_events
         WHERE team_id = ${window.teamId}
           AND actor_id = ${window.actorId}
           AND event_type = 'security.denied_attempts.rate_limited'
           AND details->>'operation' = ${operation}
           AND details->>'firstSuppressedAt' = ${new Date(firstSuppressedAt).toISOString()}
         LIMIT 1`,
    ),
  );
  return rows.length === 1;
});

export const deniedAttemptsSummary = (
  options: DeniedAttemptsSummaryOptions = {},
) => {
  const prefix = options.keyPrefix ?? DENIAL_KEY_PREFIX;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  /** The count is a caller-owned `Ref` so the increment survives a failure of the discard that follows it. */
  const writeWindow = Effect.fnUntraced(function* (
    window: DeniedAuditWindow,
    operation: DeniedAuditOperation,
    claimKey: string,
    summary: DeniedAuditSummary,
    written: Ref.Ref<number>,
  ): Effect.fn.Return<
    void,
    SqlError.SqlError | NotFound | DeniedAttemptsStoreFailed,
    MaintenanceDatabase | DeniedAttemptsStore
  > {
    const store = yield* DeniedAttemptsStore;
    const actor = yield* loadActor(window.actorId);
    if (!actor) {
      yield* Effect.logError(
        `${QUEUE}: discarding a summary for a user that no longer exists (team ${window.teamId}).`,
      );
      yield* store.discardClaim(claimKey);
      return;
    }

    const already = yield* summaryAlreadyWritten(
      window,
      operation,
      summary.firstSuppressedAt,
    );
    if (!already) {
      yield* appendDeniedAuditSummary({
        teamId: window.teamId,
        operation,
        actor,
        summary,
      });
      yield* Ref.update(written, (count) => count + 1);
    }
    yield* store.discardClaim(claimKey);
  });

  const summariseWindows = Effect.fnUntraced(function* (): Effect.fn.Return<
    number,
    DeniedAttemptsStoreFailed,
    MaintenanceDatabase | DeniedAttemptsStore
  > {
    const store = yield* DeniedAttemptsStore;
    const closedBefore =
      DateTime.toEpochMillis(yield* DateTime.now) - CLOSE_MARGIN_MS;
    const written = yield* Ref.make(0);
    for (const key of yield* store.scanWindowKeys(prefix)) {
      const window = parseDenialWindowKey(key, prefix);
      if (!window) continue;
      if (window.windowStart + windowMs > closedBefore) continue;

      const baseKey = key.endsWith(CLAIMED_SUFFIX)
        ? key.slice(0, -CLAIMED_SUFFIX.length)
        : key;
      const claimKey = `${baseKey}${CLAIMED_SUFFIX}`;
      const fields = yield* store.claimWindow({
        key: baseKey,
        claimKey,
        nowMs: DateTime.toEpochMillis(yield* DateTime.now),
        ttlMs: CLAIM_TTL_MS,
        staleMs: CLAIM_STALE_MS,
      });
      if (fields.size === 0) continue;
      const summary = readSummary(fields);
      if (!summary) continue;

      if (!isDeniedAuditOperation(window.operation)) {
        yield* Effect.logError(
          `${QUEUE}: discarding a summary for unknown operation ${JSON.stringify(window.operation)}.`,
        );
        yield* store.discardClaim(claimKey);
        continue;
      }

      yield* writeWindow(
        window,
        window.operation,
        claimKey,
        summary,
        written,
      ).pipe(
        // The whole cause, so a defect cannot abandon every window still to come. An
        // interruption is re-raised, or a stopped run would be reported completed.
        Effect.catchCause((cause) =>
          Cause.hasInterrupts(cause)
            ? Effect.interrupt
            : Effect.logWarning(
                `${QUEUE}: a summary could not be appended to the audit log; it stays claimed for a later run.`,
              ).pipe(
                Effect.annotateLogs({
                  teamId: window.teamId,
                  operation: window.operation,
                  suppressedCount: summary.suppressedCount,
                  cause:
                    deepestMessage(causeError(cause)) ?? Cause.pretty(cause),
                  defect: Cause.hasDies(cause),
                }),
              ),
        ),
      );
    }
    return yield* Ref.get(written);
  });

  const summariseScopes = Effect.fnUntraced(function* () {
    const store = yield* DeniedAttemptsStore;
    const fields = yield* store.drainScopeCounts;
    for (const [scope, count] of fields) {
      yield* Effect.logWarning(
        `Rate limit refused ${count} call(s) in scope ${scope}.`,
      );
    }
    return fields.size;
  });

  return Effect.fn('job.denied-attempts-summary')(function* (
    job: HandledJob<'denied-attempts-summary'>,
  ): Effect.fn.Return<
    JobOutcome,
    DeniedAttemptsStoreFailed,
    MaintenanceDatabase | DeniedAttemptsStore
  > {
    const store = yield* DeniedAttemptsStore;
    const label = `${QUEUE} ${job.id} attempt ${job.attempt}`;
    if (!store.configured) {
      yield* Effect.logInfo(`${label}: no rate limit store is configured`);
      return 'completed';
    }
    const events = yield* summariseWindows();
    const scopes = yield* summariseScopes();
    yield* Effect.logInfo(
      `${label}: summary events ${events}, limiter scopes ${scopes}`,
    );
    return 'completed';
  });
};
