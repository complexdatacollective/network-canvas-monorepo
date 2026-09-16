import { Cause, DateTime, Effect, Ref } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import {
  CLAIMED_SUFFIX,
  DENIAL_KEY_PREFIX,
  type DeniedAuditSummary,
  type DeniedAuditWindow,
  parseDenialWindowKey,
} from '../../audit/denial-rate-limit.ts';
import {
  DENIED_AUDIT_OPERATIONS,
  type DeniedAuditOperation,
} from '../../audit/events.ts';
import type { SessionPrincipal } from '../../auth/service.ts';
import {
  type Database,
  Transaction,
  withTenantTransaction,
  withTransaction,
} from '../database.ts';
import { causeError, deepestMessage } from '../errors.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';
import {
  DeniedAuditSummaryWriter,
  type DeniedAuditSummaryWriteFailed,
} from './denied-attempts/audit-writer.ts';
import {
  DeniedAttemptsStore,
  type DeniedAttemptsStoreFailed,
  type WindowFields,
} from './denied-attempts/store.ts';

// Turning suppressed denied attempts into the record of them (#1909), as an
// Effect: the same job src/jobs/handlers/denied-attempts-summary.ts runs
// today, with pg-boss's job metadata replaced by `HandledJob`, its two
// non-Effect dependencies behind the tags in `denied-attempts/`, and its
// node-postgres reads replaced by the queue's own `Database`.
//
// Two things accumulate in Valkey between runs and this is what drains both.
//
// The first is the audit denial window: one hash per (actor, team, operation,
// minute), holding how many attempts past the cap there were and when the
// first and last of them happened (src/audit/denial-rate-limit.ts). Each such
// window whose minute has passed becomes exactly one
// `security.denied_attempts.rate_limited` event in that team's audit log,
// written as the maintenance role — the only role that may visit a team it was
// not pinned to. This is the work that used to happen at web-process shutdown,
// where a container killed rather than stopped lost it.
//
// The second is the rate limiter's own denial counts, which are per scope and
// carry no subject at all: an address, an email or a participation link is
// what the limiter refused, and none of the three belongs in a log or in an
// audit event. Those scopes also mostly have no team to write into — a
// refused sign-in is refused before anyone knows who it was. So they are
// summarised as one log line per scope per run, which says how many were
// refused and nothing about whom.
//
// What the port changed, and why:
//
//  - The clock is `Clock`, through `DateTime.now`, rather than an injected
//    `now()`. The suites drove that injection to reach the recovery path — a
//    claim whose write failed, retaken once it is stale — and `TestClock`
//    reaches it without a seam in production code.
//  - A window whose audit write fails is logged with `Effect.logWarning`
//    rather than `process.emitWarning`. Nothing consumed the warning's type or
//    code, and the worker's log is where the rest of the job's story is.
//  - The outcome is a value, not the absence of a throw: `completed` with the
//    counts in the line, as #1927 §11 has it. The `singleton` policy that
//    keeps two runs from overlapping is the queue's, as before; the claim
//    inside is what makes a double write impossible either way.

const QUEUE = 'denied-attempts-summary';

/** How long a finished window waits before this job will take it. */
const DEFAULT_WINDOW_MS = 60_000;

/**
 * A window is taken a second after it closes rather than the moment it does.
 * The bucket is chosen from each API process's own clock, so a process running
 * slightly behind can still be writing into the minute that has just ended
 * here; a second of margin means its record is in the hash before the hash is
 * read, rather than becoming a second summary on the next run.
 */
const CLOSE_MARGIN_MS = 1_000;

/** Long enough that a worker outage cannot drop a claim between runs. */
const CLAIM_TTL_MS = 3_600_000;

/**
 * How long a claim is another run's before this one may take it back. The job
 * runs every minute and a run takes far less than that, so five minutes is
 * well past "the run that claimed this is still going" and well inside the
 * claim's own expiry.
 */
const CLAIM_STALE_MS = 300_000;

export type DeniedAttemptsSummaryOptions = {
  /** The suites give each file its own prefix and a shorter window. */
  readonly keyPrefix?: string | undefined;
  readonly windowMs?: number | undefined;
};

type ActorRow = {
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
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

/**
 * The actor the suppressed attempts belonged to. The audit event carries the
 * actor's label, and the label is derived from the user row rather than stored
 * in Valkey: a name and an email address are exactly what the limiter's own
 * keys are hashed to keep out of that store, and the same rule holds here.
 */
const loadActor = Effect.fnUntraced(function* (actorId: string) {
  const rows = yield* withTransaction(
    Effect.flatMap(
      Transaction,
      ({ sql }) => sql<ActorRow>`
        SELECT name, email, "emailVerified" FROM "user" WHERE id = ${actorId}`,
    ),
  );
  const row = rows[0];
  if (!row) return null;
  const principal: SessionPrincipal = {
    kind: 'user',
    userId: actorId,
    email: row.email,
    emailVerified: row.emailVerified,
    name: row.name,
    locale: null,
    // Nothing on the write path reads it, and there is no session to name:
    // the attempts this summarises were made in sessions that ended before
    // the window did.
    sessionId: '',
  };
  return principal;
});

/**
 * Whether this window's event is already in the log. The claim survives a
 * failed write, so a later run re-reads the same record — and an audit event
 * is immutable, which makes a second copy permanent. There is no unique
 * index to lean on, so the window is identified the way it identifies
 * itself: its team, its actor, its operation, and the instant of its first
 * suppressed attempt, which is fixed once the window has closed.
 */
const summaryAlreadyWritten = Effect.fnUntraced(function* (
  window: DeniedAuditWindow,
  operation: DeniedAuditOperation,
  firstSuppressedAt: number,
) {
  // Inside a tenant transaction, not on a bare connection: `audit_events`
  // carries a stricter policy than the other tenant tables (src/audit/schema.ts)
  // with no maintenance escape at all, so a read without the team stamped on
  // the transaction sees nothing and would report every summary as missing.
  const rows = yield* withTenantTransaction(
    window.teamId,
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

/**
 * The denied-attempts summary handler. Takes the decoded payload the worker
 * handed it — this queue's is empty — and answers `completed` with what it
 * drained.
 */
export const deniedAttemptsSummary = (
  options: DeniedAttemptsSummaryOptions = {},
) => {
  const prefix = options.keyPrefix ?? DENIAL_KEY_PREFIX;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

  /**
   * One claimed window: its actor, its idempotency check, its event, and then
   * — only then — the claim given up. Until the event is in the log, the claim
   * is the only copy of what was suppressed.
   *
   * The count is a `Ref` the caller owns rather than this function's answer,
   * because the increment has to survive a failure of the discard that follows
   * it: the event is in the log by then, and a run that reported zero for a
   * summary it wrote would say the opposite of what happened. This is the
   * order the original had, where `written += 1` sat above the `del` inside
   * one `try`.
   */
  const writeWindow = Effect.fnUntraced(function* (
    window: DeniedAuditWindow,
    operation: DeniedAuditOperation,
    claimKey: string,
    summary: DeniedAuditSummary,
    written: Ref.Ref<number>,
  ): Effect.fn.Return<
    void,
    | SqlError.SqlError
    | DeniedAttemptsStoreFailed
    | DeniedAuditSummaryWriteFailed,
    Database | DeniedAttemptsStore | DeniedAuditSummaryWriter
  > {
    const store = yield* DeniedAttemptsStore;
    const writer = yield* DeniedAuditSummaryWriter;
    const actor = yield* loadActor(window.actorId);
    if (!actor) {
      // The account was deleted between the attempts and this run. The event
      // requires the actor's label and there is nowhere left to read it, so
      // this one is dropped rather than retried forever.
      yield* Effect.logError(
        `${QUEUE}: discarding a summary for a user that no longer exists (team ${window.teamId}).`,
      );
      yield* store.discardClaim(claimKey);
      return;
    }

    // At-least-once delivery of the claim, exactly-once in the log.
    const already = yield* summaryAlreadyWritten(
      window,
      operation,
      summary.firstSuppressedAt,
    );
    if (!already) {
      yield* writer.write({
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
    Database | DeniedAttemptsStore | DeniedAuditSummaryWriter
  > {
    const store = yield* DeniedAttemptsStore;
    const closedBefore =
      DateTime.toEpochMillis(yield* DateTime.now) - CLOSE_MARGIN_MS;
    const written = yield* Ref.make(0);
    for (const key of yield* store.scanWindowKeys(prefix)) {
      const window = parseDenialWindowKey(key, prefix);
      if (!window) continue;
      if (window.windowStart + windowMs > closedBefore) continue;

      // The scan returns live windows and windows a previous run claimed and
      // could not write. Both name the same window; only the live one has to
      // be renamed, and appending the suffix twice would make a key nothing
      // ever reads again.
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
      // A window that reached its cap but suppressed nothing is a window whose
      // denials were all recorded as events already; there is nothing to say.
      if (!summary) continue;

      if (!isDeniedAuditOperation(window.operation)) {
        // A key this build does not know the operation of — an older release's
        // name, or a hand-written key. Dropped rather than written, because the
        // event schema enumerates the operation.
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
        // The whole cause, not the typed failure alone: the original's
        // `try`/`catch` skipped one window whatever went wrong inside it, and
        // a `catch` over the error channel would let a defect — an invalid
        // search path, a bug in the writer — abandon every window still to
        // come. An interruption is not a window's problem and is re-raised:
        // the worker interrupts a handler that outstays the stop window, and
        // swallowing that would turn a stopped run into a completed one.
        //
        // The claim is still there, so a later run takes this window again.
        // The signal is the one the shutdown flush this replaces emitted.
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
                  // A defect is a bug in this process rather than the audit
                  // log being briefly unavailable, and the two want different
                  // attention from whoever reads the line.
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
    Database | DeniedAttemptsStore | DeniedAuditSummaryWriter
  > {
    const store = yield* DeniedAttemptsStore;
    // The attempt rides on both lines the way the original's `logJobOutcome`
    // carried it. The worker names it too, but only on its `logDebug` success
    // line, so at an ordinary log level this is the only place a completed run
    // says which attempt it was.
    const label = `${QUEUE} ${job.id} attempt ${job.attempt}`;
    if (!store.configured) {
      yield* Effect.logInfo(`${label}: no rate limit store is configured`);
      return 'completed';
    }
    // Nothing retries a failure here: the queue declares no retries at all,
    // and it does not need them — the keys outlive their window by minutes
    // and the next minute's run takes whatever this one left.
    const events = yield* summariseWindows();
    const scopes = yield* summariseScopes();
    yield* Effect.logInfo(
      `${label}: summary events ${events}, limiter scopes ${scopes}`,
    );
    return 'completed';
  });
};
