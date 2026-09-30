import { Cause, Effect, Exit, Predicate } from 'effect';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';

import { deepestMessage } from '../db/errors.ts';
import { savepoint, type TeamAccess, TenantScope } from '../db/tenant.ts';
import { RequestId } from '../http/middleware/request-id.ts';
import { AuditContext } from './context.ts';
import { type AuditEventInput, parseAuditEventInput } from './events.ts';
import { AuditSignal } from './signal.ts';
import { append as appendEvent, lockedTeamLabel, lockTeam } from './store.ts';

// `audited` — the one way Studio runs an audited command (#1927 §10).
//
// The shape is **commit-then-fail**, and that is the whole point of the module.
// A command whose *authorization decision* is itself auditable — "you may not
// change this member's role" — has to leave two things behind that pull in
// opposite directions: no domain mutation, and one durable denial event. So:
//
//   outer tenant transaction
//     ├── team advisory lock, team row locked FOR UPDATE   ← outside the savepoint
//     ├── nested transaction (a savepoint) running the body
//     │     └── its Exit is *captured*, not propagated
//     ├── append the events the Exit implies, after the savepoint rolled back
//     └── COMMIT
//   then, outside the transaction, re-fail with the captured error
//
// The first draft of this design used `Effect.tapError`, and #1927 §21 F1
// proved it loses the denial event: `tapError` leaves the error in the channel,
// so the failure propagates out through the tenant transaction, which rolls
// back — taking the event with it. Capturing the `Exit` is what lets the
// transaction commit before the command fails. It is exactly today's
// `AuditedCommandDecision` (`audit/command.ts:226-259`: the decision commits,
// the throw follows).
//
// The locks are taken **outside** the savepoint deliberately: an aborted
// subtransaction releases the locks acquired inside it, so a failure event
// would otherwise be appended with the team lock already gone.

/**
 * An event as a command may write it. Every field the combinator owns — the
 * trusted context and the outcome — is removed, so a command *cannot* supply
 * them and a forged context is a type error rather than a runtime refusal.
 */
export type AuditEventBody = DistributiveOmit<
  AuditEventInput,
  | 'teamId'
  | 'teamLabel'
  | 'actorKind'
  | 'actorId'
  | 'actorLabel'
  | 'requestId'
  | 'outcome'
>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type AuditEvents = readonly [AuditEventBody, ...AuditEventBody[]];

export type AuditedResult<A> =
  | {
      readonly _tag: 'Changed';
      readonly value: A;
      readonly events: AuditEvents;
    }
  | { readonly _tag: 'Unchanged'; readonly value: A };

export const changed = <A>(
  value: A,
  events: AuditEvents,
): AuditedResult<A> => ({ _tag: 'Changed', value, events });

/**
 * An idempotent replay or a domain no-op: it completed without a mutation, so
 * it must neither invent a success event nor weaken the non-empty event
 * contract that a command which really changed state is held to.
 */
export const unchanged = <A>(value: A): AuditedResult<A> => ({
  _tag: 'Unchanged',
  value,
});

/**
 * The marker that makes a failure auditable. Registered by the symbol rather
 * than by a table of error tags: an error class declares for itself that its
 * denial is a fact the team is entitled to see, and nothing has to be kept in
 * step with it.
 */
export const AuditableFailure: unique symbol = Symbol.for(
  '@studio/audit/AuditableFailure',
);

export type AuditableFailureMarker = {
  readonly outcome: 'denied' | 'failed';
  readonly events: AuditEvents;
};

export type AuditableFailure = {
  readonly [AuditableFailure]: AuditableFailureMarker;
};

/** Attaches the marker to an error value, returning it unchanged otherwise. */
export const auditable = <E extends object>(
  error: E,
  marker: AuditableFailureMarker,
): E & AuditableFailure => Object.assign(error, { [AuditableFailure]: marker });

/**
 * A declared runtime check rather than a cast. `auditable` is the only typed
 * way to attach the marker, but an error value crosses an `unknown` boundary
 * on its way out of `Cause.squash`, and an event list that is empty or not a
 * list at all must read as "not auditable" rather than reach `stamp`.
 */
const isAuditableMarker = (value: unknown): value is AuditableFailureMarker => {
  if (!Predicate.isObject(value)) return false;
  if (!('outcome' in value) || !('events' in value)) return false;
  const { outcome, events } = value;
  return (
    (outcome === 'denied' || outcome === 'failed') &&
    Array.isArray(events) &&
    events.length > 0 &&
    events.every(Predicate.isObject)
  );
};

const auditableMarker = (
  error: unknown,
): AuditableFailureMarker | undefined => {
  if (!Predicate.isObject(error)) return undefined;
  const marker: unknown = Reflect.get(error, AuditableFailure);
  return isAuditableMarker(marker) ? marker : undefined;
};

/**
 * Fills in every field the command is not allowed to supply. `AuditStore.append`
 * re-validates the result against the strict per-`(eventType, eventVersion)`
 * schema, so this is not the only check — but because the combinator owns the
 * fields the old `assertEventContext` compared, the mismatch that assertion
 * refused is now unrepresentable.
 *
 * Exported for the suites, which prove that unrepresentability in two halves:
 * a compile assertion that a body carrying one of these fields does not type,
 * and a runtime one that calls this with a forged value anyway and reads the
 * context's own back out. The second exists because the first only holds for a
 * fresh object literal — a value that reached a call through a variable
 * carries an excess field happily.
 */
export const stamp = (
  context: AuditContext['Service'],
  body: AuditEventBody,
  outcome: 'succeeded' | 'denied' | 'failed',
): AuditEventInput =>
  // Parsed, not cast: reconstructing a member of a discriminated union from an
  // `Omit` of it is not something the compiler can check, and the registry
  // schema is the thing that actually knows which fields each event carries.
  parseAuditEventInput({
    ...body,
    teamId: context.teamId,
    teamLabel: context.teamLabel,
    actorKind: 'user',
    actorId: context.actorId,
    actorLabel: context.actorLabel,
    requestId: context.requestId,
    outcome,
  });

/**
 * An event that must be written or the whole transaction is worthless. A
 * failure signals `STUDIO_AUDIT_APPEND_FAILED` and re-raises, which rolls the
 * outer tenant transaction back — so the requested action never commits
 * without its record.
 */
const appendRequired = Effect.fnUntraced(function* (
  context: AuditContext['Service'],
  event: AuditEventInput,
) {
  const signal = yield* AuditSignal;
  return yield* appendEvent(event).pipe(
    Effect.tapError((error) =>
      signal.warn('STUDIO_AUDIT_APPEND_FAILED', {
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        outcome: event.outcome,
        teamId: context.teamId,
        requestId: context.requestId,
        causeName: error.name,
        // The most specific message in the chain, not the outermost:
        // `@effect/sql-pg` wraps every driver error in a `SqlError` whose own
        // message is always `PgConnection: Query failed`, which tells an
        // operator nothing about why the append was refused.
        causeMessage: deepestMessage(error) ?? error.message,
      }),
    ),
  );
});

/**
 * The return type is inferred rather than written out: `Effect.withSpan`
 * removes `ParentSpan` from the requirement set, and spelling that exclusion
 * by hand adds nothing a reader wants. What the signature guarantees is in the
 * parameters — a `TeamAccess` rather than a team id, and a body that returns an
 * `AuditedResult` rather than a bare value, so a command cannot forget to say
 * whether it changed anything.
 */
export const audited = <A, E, R>(
  name: string,
  access: TeamAccess,
  body: Effect.Effect<AuditedResult<A>, E, R>,
) =>
  Effect.gen(function* () {
    const principal = yield* Principal;
    const requestId = yield* RequestId;

    const outcome = yield* TenantScope.open(
      access,
      Effect.gen(function* () {
        // Both locks are taken here, outside the savepoint below, so that a
        // body which fails cannot release them on its way out.
        yield* lockTeam(access.teamId);
        const teamLabel = yield* lockedTeamLabel(access.teamId);

        const context = AuditContext.of({
          teamId: access.teamId,
          teamLabel,
          actorId: principal.userId,
          actorLabel: (principal.name.trim() || principal.email).slice(0, 320),
          requestId,
        });

        // The body runs in a nested transaction — a savepoint on this same
        // connection — and its Exit is captured rather than propagated. That
        // capture is what lets the appends below run in the *outer*
        // transaction, after the savepoint has rolled back.
        const exit = yield* Effect.exit(
          savepoint(Effect.provideService(body, AuditContext, context)),
        );

        if (Exit.isSuccess(exit)) {
          const result = exit.value;
          if (result._tag === 'Unchanged') {
            return { _tag: 'Success' as const, value: result.value };
          }
          if (result.events.length === 0) {
            // Unreachable through the tuple type; kept because an untyped
            // caller could still get here, and an audited command that
            // changed state without saying so is the one thing this module
            // must never let commit.
            return yield* Effect.die(
              new Error('an audited command must produce at least one event'),
            );
          }
          for (const event of result.events) {
            yield* appendRequired(context, stamp(context, event, 'succeeded'));
          }
          return { _tag: 'Success' as const, value: result.value };
        }

        // An interrupt is not a decision: there is nothing to record and
        // nothing to commit.
        if (Cause.hasInterruptsOnly(exit.cause)) {
          return yield* Effect.failCause(exit.cause);
        }

        const error = Cause.squash(exit.cause);
        const marker = auditableMarker(error);
        if (marker === undefined) {
          // Not an auditable decision — an ordinary failure. Re-raise it
          // inside the outer transaction so that transaction rolls back too,
          // which is what today's `classifyFailure` returning null does.
          return yield* Effect.failCause(exit.cause);
        }

        for (const event of marker.events) {
          yield* appendRequired(context, stamp(context, event, marker.outcome));
        }
        // Falls through to the commit: the events are durable, and the caller
        // is told it failed only once they are.
        return { _tag: 'Failure' as const, cause: exit.cause };
      }),
    );

    if (outcome._tag === 'Failure') {
      return yield* Effect.failCause(outcome.cause);
    }
    return outcome.value;
  }).pipe(Effect.withSpan(name));
