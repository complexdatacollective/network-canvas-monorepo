import { Cause, Effect, Exit, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import type { AuditActor } from '@codaco/studio-contract/middleware/audit-actor';
import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { AuditReadDenied } from '@codaco/studio-contract/schema/audit';
import type { NotFound } from '@codaco/studio-contract/schema/errors';

import { audited, auditable } from '../audit/audited.ts';
import {
  type DeniedAttempts,
  reservedDenial,
} from '../audit/denial-rate-limit.ts';
import {
  authorizeAuditRead,
  grantsAuditRead,
} from '../audit/read-authorization.ts';
import { AuditSignal } from '../audit/signal.ts';
import type { Database } from '../db/client.ts';
import { failureCodes } from '../db/errors.ts';
import type { TeamAccess, Transaction } from '../db/tenant.ts';
import { RequestId } from '../http/middleware/request-id.ts';

export type AuditReadProcedure =
  | 'audit.list'
  | 'audit.get'
  | 'audit.filterOptions';

class AuditReadRefused extends Schema.TaggedError<AuditReadRefused>()(
  'AuditReadRefused',
  {},
) {}

class AuditReadDenialSuppressed extends Schema.TaggedError<AuditReadDenialSuppressed>()(
  'AuditReadDenialSuppressed',
  {},
) {}

class AuditReadDenialRecorded extends Schema.TaggedError<AuditReadDenialRecorded>()(
  'AuditReadDenialRecorded',
  {},
) {}

const appendDenial = (access: TeamAccess, procedure: AuditReadProcedure) =>
  audited(
    'audit.read.denied',
    access,
    Effect.fail(
      auditable(new AuditReadRefused(), {
        outcome: 'denied',
        events: [
          {
            eventVersion: 1,
            eventType: 'audit.read_denied',
            category: 'audit',
            subjectType: null,
            subjectId: null,
            subjectLabel: null,
            resourceType: null,
            resourceId: null,
            resourceLabel: null,
            details: { procedure, reason: 'insufficient_permission' },
          },
        ],
      }),
    ),
  );

/**
 * Signalled around the whole append path, so an insert failure is reported
 * twice: the intended cost of never losing a required audit event silently.
 */
const denyAuditRead = Effect.fnUntraced(function* (
  access: TeamAccess,
  procedure: AuditReadProcedure,
  alreadyReserved: boolean,
) {
  const signal = yield* AuditSignal;
  const principal = yield* Principal;
  const requestId = yield* RequestId;
  const append = appendDenial(access, procedure);
  const exit = yield* Effect.exit(
    alreadyReserved
      ? append
      : reservedDenial(
          {
            operation: 'audit.read',
            teamId: access.teamId,
            refusal: () => new AuditReadDenialSuppressed(),
            isDenial: (error) => error instanceof AuditReadRefused,
          },
          append,
        ),
  );
  if (Exit.isFailure(exit)) {
    const error: unknown = Cause.squash(exit.cause);
    // `AuditReadRefused` IS the success of this path: the event committed and
    // the combinator re-raised.
    if (error instanceof AuditReadRefused) {
      return yield* new AuditReadDenialRecorded();
    }
    if (error instanceof AuditReadDenialSuppressed) {
      return yield* new AuditReadDenied({});
    }
    yield* signal.warn('STUDIO_AUDIT_DENIAL_EVENT_LOST', {
      eventType: 'audit.read_denied',
      procedure,
      teamId: access.teamId,
      actorId: principal.userId,
      requestId,
      ...failureCodes(error),
    });
  }
  return yield* new AuditReadDenied({});
});

export const assertAuditReadAuthorized: (
  access: TeamAccess,
) => Effect.Effect<
  void,
  AuditReadRefused | AuditReadDenied | SqlError.SqlError,
  Transaction | Principal
> = Effect.fnUntraced(function* (access: TeamAccess) {
  const principal = yield* Principal;
  const authorization = yield* authorizeAuditRead({
    teamId: access.teamId,
    actorUserId: principal.userId,
  });
  if (authorization === 'permitted') return;
  // A vanished membership is not a member being refused: there is nobody to
  // write a denial event about.
  if (authorization === 'not_a_member') return yield* new AuditReadDenied({});
  return yield* new AuditReadRefused();
});

/**
 * The access's role is stale in both directions, so every decision comes from
 * the locked membership re-read inside the read's own transaction; the stale
 * role decides only whether a rate-limit slot is taken first.
 */
export const guardAuditRead = <A, R>(
  access: TeamAccess,
  procedure: AuditReadProcedure,
  read: Effect.Effect<
    A,
    AuditReadRefused | AuditReadDenied | SqlError.SqlError,
    R
  >,
): Effect.Effect<
  A,
  AuditReadDenied | NotFound | SqlError.SqlError,
  | R
  | Database
  | Principal
  | AuditActor
  | RequestId
  | AuditSignal
  | DeniedAttempts
> => {
  const predictsDenial = !grantsAuditRead(access.role);
  const decided = Effect.catchTag(read, 'AuditReadRefused', () =>
    denyAuditRead(access, procedure, predictsDenial),
  );
  return (
    predictsDenial
      ? reservedDenial(
          {
            operation: 'audit.read',
            teamId: access.teamId,
            refusal: () => new AuditReadDenied({}),
            isDenial: (error) => error instanceof AuditReadDenialRecorded,
          },
          decided,
        )
      : decided
  ).pipe(
    Effect.catchTag('AuditReadDenialRecorded', () =>
      Effect.fail(new AuditReadDenied({})),
    ),
  );
};
