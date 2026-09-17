import { Cause, Effect, Exit, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { AuditReadDenied } from '@codaco/studio-contract/schema/audit';
import type { NotFound } from '@codaco/studio-contract/schema/errors';

import { audited, auditable } from '../audit/audited.ts';
import { reservedDenial } from '../audit/denial-rate-limit.ts';
import {
  authorizeAuditRead,
  grantsAuditRead,
} from '../audit/read-authorization.ts';
import { AuditSignal } from '../audit/signal.ts';
import type { Database } from '../db/client.ts';
import { deepestMessage } from '../db/errors.ts';
import type { TeamAccess, Transaction } from '../db/tenant.ts';
import { RequestId } from '../http/middleware/request-id.ts';

// The audit read path (#1930, moved onto `Transaction` by #1927 stage 3).
//
// Two things that look like details and are the design:
//
//   * The read's authorization runs INSIDE the read's own transaction, on the
//     locked membership row. The access `openTeam` minted is already stale by
//     the time the transaction opens, in both directions.
//   * A denial is a required, committed audit event, and it is written in a
//     transaction of its own — the read's has rolled back by then, taking its
//     locks with it. `audited` with a body that only fails is exactly that: no
//     domain write, one denial event, commit, then fail.
//
// Every refusal is the contract's `AuditReadDenied`, which every `audit.*`
// handler maps to the shared `Forbidden` — deliberately the same answer as the
// plain denial, so the audit log's own suppression stays unobservable.

export type AuditReadProcedure =
  | 'audit.list'
  | 'audit.get'
  | 'audit.filterOptions';

/**
 * Raised from inside the read transaction when the caller's locked membership
 * no longer grants audit.read, so that transaction rolls back before a single
 * row is returned — and before the denial event is appended in its own.
 *
 * Distinct from `AuditReadDenied`, which is what the caller is told: this one
 * never leaves the module.
 */
class AuditReadRefused extends Schema.TaggedError<AuditReadRefused>()(
  'AuditReadRefused',
  {},
) {}

/**
 * The denial event: server-owned, coupled to no domain write, and required.
 *
 * `audited` is given a body that does nothing but fail with the auditable
 * marker, which is how a bare observation is written — the savepoint has
 * nothing to roll back, the event is appended in the outer transaction, that
 * transaction commits, and only then does the effect fail. A failure to append
 * fails the whole thing, which is the point: the read stays denied either way,
 * but the operator is told the record was lost.
 */
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
 * The denial event is required, so every way the append can fail has to leave
 * an operational signal: acquiring a connection, beginning the transaction,
 * locking the team and reading the team row all sit before the insert, and
 * only the insert emits a signal of its own
 * (`STUDIO_AUDIT_APPEND_FAILED`, in `audit/audited.ts`). Signalling around the
 * whole path means the insert case is reported twice — a duplicate signal is
 * the intended cost of never losing a required audit event silently.
 */
const denyAuditRead = Effect.fnUntraced(function* (
  access: TeamAccess,
  procedure: AuditReadProcedure,
  /** True when the caller already holds a slot for this attempt. */
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
            // Still a denial, not a rate-limit refusal: the caller is refused
            // the read either way, and telling them which refusals were
            // recorded would make the suppression observable.
            refusal: () => new AuditReadDenied({}),
            isDenial: (error) => error instanceof AuditReadRefused,
          },
          append,
        ),
  );
  if (Exit.isFailure(exit)) {
    const error: unknown = Cause.squash(exit.cause);
    // `AuditReadRefused` IS the success of this path: the event committed and
    // the combinator re-raised. Anything else means it did not.
    if (!(error instanceof AuditReadRefused)) {
      yield* signal.warn('STUDIO_AUDIT_DENIAL_EVENT_LOST', {
        eventType: 'audit.read_denied',
        procedure,
        teamId: access.teamId,
        actorId: principal.userId,
        requestId,
        causeName: error instanceof Error ? error.name : typeof error,
        // The most specific message in the chain: a `SqlError`'s own is always
        // `PgConnection: Query failed`, and the operator needs the Postgres
        // one underneath it.
        causeMessage: deepestMessage(error) ?? String(error),
      });
    }
  }
  return yield* new AuditReadDenied({});
});

/** Raised by the read transaction when the locked membership refuses it. */
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
  // A membership that vanished is the rpc plane's own answer arriving late,
  // not a member being refused: there is nobody to write a denial event about.
  if (authorization === 'not_a_member') return yield* new AuditReadDenied({});
  return yield* new AuditReadRefused();
});

/**
 * Wraps an audit read whose transaction re-authorizes the caller against the
 * committed role. The transaction is opened by the caller so its no-audit
 * operation stays a static literal.
 *
 * The access's role is stale in both directions. A demotion committing in that
 * window must not be answered with audit data; a promotion committing in it
 * must not be answered with a refusal and an `audit.read_denied` event that
 * the committed roles do not support — an immutable log is the wrong place to
 * record a refusal that did not happen. So the role decides nothing here.
 * Every decision comes from the locked membership re-read inside the read's
 * own transaction.
 *
 * What the stale role still decides is ORDERING. When it predicts a denial the
 * rate-limit slot is taken first, before any transaction opens, so a burst of
 * denied reads cannot open one each: past the window's allowance a predicted
 * denial is refused without touching the database, which is what the old
 * pre-check was for. When it predicts permission no slot is taken at all, so
 * an ordinary read never spends one — and the rarer case where the committed
 * role turns out to deny takes its slot inside `denyAuditRead`.
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
  R | Database | Principal | RequestId | AuditSignal
> => {
  const predictsDenial = !grantsAuditRead(access.role);
  const decided = Effect.catchTag(read, 'AuditReadRefused', () =>
    denyAuditRead(access, procedure, predictsDenial),
  );
  return predictsDenial
    ? reservedDenial(
        {
          operation: 'audit.read',
          teamId: access.teamId,
          refusal: () => new AuditReadDenied({}),
          isDenial: (error) => error instanceof AuditReadDenied,
        },
        decided,
      )
    : decided;
};
