import { Cause, Effect, Exit, Option, Predicate } from 'effect';

import { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';

import { recordAuditUsage } from '../analytics/audit-usage.ts';
import { failureCodes } from '../db/errors.ts';
import { savepoint, type TeamAccess, TenantScope } from '../db/tenant.ts';
import { RequestId } from '../http/middleware/request-id.ts';
import { AuditContext } from './context.ts';
import { type AuditEventInput, checkAuditEventInput } from './events.ts';
import { AuditSignal } from './signal.ts';
import { append as appendEvent, lockedTeamLabel, lockTeam } from './store.ts';

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

export const unchanged = <A>(value: A): AuditedResult<A> => ({
  _tag: 'Unchanged',
  value,
});

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

export const auditable = <E extends object>(
  error: E,
  marker: AuditableFailureMarker,
): E & AuditableFailure => Object.assign(error, { [AuditableFailure]: marker });

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

export const stamp = (
  context: AuditContext['Service'],
  body: AuditEventBody,
  outcome: 'succeeded' | 'denied' | 'failed',
): AuditEventInput =>
  checkAuditEventInput({
    ...body,
    teamId: context.teamId,
    teamLabel: context.teamLabel,
    actorKind: context.actorKind,
    actorId: context.actorId,
    actorLabel: context.actorLabel,
    requestId: context.requestId,
    outcome,
  });

const appendRequired = Effect.fnUntraced(function* (
  context: AuditContext['Service'],
  event: AuditEventInput,
) {
  const signal = yield* AuditSignal;
  const appended = yield* appendEvent(event).pipe(
    Effect.tapError((error) =>
      signal.warn('STUDIO_AUDIT_APPEND_FAILED', {
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        outcome: event.outcome,
        teamId: context.teamId,
        requestId: context.requestId,
        ...failureCodes(error),
      }),
    ),
  );
  yield* recordAuditUsage(event);
  return appended;
});

export const audited = <A, E, R>(
  name: string,
  access: TeamAccess,
  body: Effect.Effect<AuditedResult<A>, E, R>,
) =>
  Effect.gen(function* () {
    const actor = yield* AuditActor;
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
          actorKind: actor.kind,
          actorId: actor.id,
          actorLabel: actor.label,
          requestId,
        });

        // The Exit is captured rather than propagated, so the appends below run in
        // the outer transaction after the savepoint has rolled back.
        const exit = yield* Effect.exit(
          savepoint(Effect.provideService(body, AuditContext, context)),
        );

        if (Exit.isSuccess(exit)) {
          const result = exit.value;
          if (result._tag === 'Unchanged') {
            return { _tag: 'Success' as const, value: result.value };
          }
          if (result.events.length === 0) {
            // Unreachable through the tuple type; kept for an untyped caller.
            return yield* Effect.die(
              new Error('an audited command must produce at least one event'),
            );
          }
          for (const event of result.events) {
            yield* appendRequired(context, stamp(context, event, 'succeeded'));
          }
          return { _tag: 'Success' as const, value: result.value };
        }

        if (Cause.hasInterruptsOnly(exit.cause)) {
          return yield* Effect.failCause(exit.cause);
        }

        const marker = auditableMarker(
          Option.getOrUndefined(Cause.findErrorOption(exit.cause)),
        );
        if (marker === undefined) {
          return yield* Effect.failCause(exit.cause);
        }

        for (const event of marker.events) {
          yield* appendRequired(context, stamp(context, event, marker.outcome));
        }
        return { _tag: 'Failure' as const, cause: exit.cause };
      }),
    );

    if (outcome._tag === 'Failure') {
      return yield* Effect.failCause(outcome.cause);
    }
    return outcome.value;
  }).pipe(Effect.withSpan(name));

export type AuditedAsResult<A> = {
  readonly actor: AuditActor['Service'];
  readonly result: AuditedResult<A>;
};

export const auditedAs = <A, E, R>(
  name: string,
  access: TeamAccess,
  body: Effect.Effect<AuditedAsResult<A>, E, R>,
) =>
  Effect.gen(function* () {
    const requestId = yield* RequestId;
    return yield* TenantScope.open(
      access,
      Effect.gen(function* () {
        yield* lockTeam(access.teamId);
        const teamLabel = yield* lockedTeamLabel(access.teamId);
        const { actor, result } = yield* body;
        if (result._tag === 'Unchanged') return result.value;

        const context = AuditContext.of({
          teamId: access.teamId,
          teamLabel,
          actorKind: actor.kind,
          actorId: actor.id,
          actorLabel: actor.label,
          requestId,
        });
        for (const event of result.events) {
          yield* appendRequired(context, stamp(context, event, 'succeeded'));
        }
        return result.value;
      }),
    );
  }).pipe(Effect.withSpan(name));
