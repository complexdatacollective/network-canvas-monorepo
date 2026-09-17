import type pg from 'pg';

import { AuditReadDenied } from '@codaco/studio-contract/schema/audit';

import {
  appendAuditedEvent,
  auditActorEventContext,
  type AuditedCommandContext,
} from '../audit/command.ts';
import {
  type DeniedAuditReservation,
  reserveDeniedAuditAttempt,
} from '../audit/denial-rate-limit.ts';
import {
  authorizeAuditRead,
  grantsAuditRead,
} from '../audit/read-authorization.ts';
import type { TeamScope } from './team-scope.ts';

// The audit read path, moved out of `src/rpc.ts` unchanged in logic (#1930).
// The only substitution is the refusal: where it threw oRPC's `FORBIDDEN` it
// now throws the contract's `AuditReadDenied`, which every `audit.*` handler
// maps to the shared `Forbidden` — deliberately the same answer as the plain
// denial, so the audit log's own suppression stays unobservable from outside.

export type AuditReadProcedure =
  | 'audit.list'
  | 'audit.get'
  | 'audit.filterOptions';

/**
 * Thrown from inside the read transaction when the caller's locked membership
 * no longer grants audit.read, so the transaction rolls back before the denial
 * event is appended in its own transaction.
 */
class AuditReadDeniedError extends Error {
  constructor() {
    super('audit read actor no longer holds audit.read');
    this.name = 'AuditReadDeniedError';
  }
}

/** A reservation the denial rate limiter has already let through. */
type AdmittedDeniedAuditReservation = Extract<
  DeniedAuditReservation,
  { admitted: true }
>;

function auditedContextFor(context: TeamScope): AuditedCommandContext {
  return {
    tenantDb: context.tenantDb,
    principal: context.principal,
    requestId: context.requestId,
  };
}

/**
 * Takes the denial slot for this caller, team, and operation. The reservation
 * is made before any transaction opens, which is the rate limiter's whole
 * point (audit/denial-rate-limit.ts): once a window's allowance is spent, a
 * further denial is refused without touching the database at all.
 */
async function admitAuditReadDenial(
  context: TeamScope,
): Promise<AdmittedDeniedAuditReservation> {
  const reservation = await reserveDeniedAuditAttempt({
    actorId: context.principal.userId,
    teamId: context.team.id,
    operation: 'audit.read',
  });
  // Still a denial, not a rate-limit refusal: the caller is being refused the
  // read either way, and telling them which refusals were recorded would make
  // the audit log's own suppression observable from outside.
  if (!reservation.admitted) throw new AuditReadDenied({});
  return reservation;
}

/**
 * The denial event is required, so every way the append can fail has to leave
 * an operational signal: acquiring a client, beginning the transaction,
 * locking the team, and reading the team row all sit before the insert, and
 * only the insert emits a signal of its own (STUDIO_AUDIT_APPEND_FAILED, in
 * audit/command.ts). Emitting around the whole path means the insert case is
 * reported twice — a duplicate signal is the intended cost of never losing a
 * required audit event silently.
 */
function warnAuditReadDenialLost(
  context: TeamScope,
  procedure: AuditReadProcedure,
  error: unknown,
): void {
  const cause =
    error instanceof Error
      ? { causeName: error.name, causeMessage: error.message }
      : { causeName: typeof error, causeMessage: String(error) };
  process.emitWarning(
    'Required audit.read_denied event was not recorded; the read stayed denied.',
    {
      type: 'StudioAuditError',
      code: 'STUDIO_AUDIT_DENIAL_EVENT_LOST',
      detail: JSON.stringify({
        eventType: 'audit.read_denied',
        procedure,
        teamId: context.team.id,
        actorId: context.principal.userId,
        requestId: context.requestId,
        ...cause,
      }),
    },
  );
}

/**
 * A caller whose committed roles do not grant audit.read is denied with a
 * committed, rate-limited audit.read_denied event (design §7.3: audit-log
 * access is security-relevant); a failed denial append still denies.
 */
async function denyAuditRead(
  context: TeamScope,
  procedure: AuditReadProcedure,
  reserved: AdmittedDeniedAuditReservation | null,
): Promise<never> {
  const reservation = reserved ?? (await admitAuditReadDenial(context));
  try {
    await appendAuditedEvent(auditedContextFor(context), (auditContext) => ({
      ...auditActorEventContext(auditContext),
      eventVersion: 1,
      eventType: 'audit.read_denied',
      category: 'audit',
      outcome: 'denied',
      subjectType: null,
      subjectId: null,
      subjectLabel: null,
      resourceType: null,
      resourceId: null,
      resourceLabel: null,
      details: { procedure, reason: 'insufficient_permission' },
    }));
    await reservation.complete('denied');
  } catch (error) {
    warnAuditReadDenialLost(context, procedure, error);
    // Not 'denied': no denial event was committed, so this attempt must not
    // consume the window's allowance. The request stays denied either way.
    await reservation.complete('other');
  }
  throw new AuditReadDenied({});
}

/**
 * Wraps an audit read whose transaction re-authorizes the caller against the
 * committed role (see audit/read-authorization.ts). The transaction is opened
 * by the caller so its no-audit operation stays a static literal.
 *
 * `openTeam` resolves the caller's membership before this runs, so the role it
 * carries is stale in both directions. A demotion committing in that window
 * must not be answered with audit data; a promotion committing in it must not
 * be answered with a refusal and an audit.read_denied event that the committed
 * roles do not support — an immutable log is the wrong place to record a
 * refusal that did not happen. So the scope's role decides nothing here. Every
 * decision comes from the locked membership re-read inside the read's own
 * transaction, which for a caller without the permission throws before a single
 * row is selected.
 *
 * What the stale role still decides is ordering. When it predicts a denial the
 * rate-limit slot is taken first, before any transaction opens, so a burst of
 * denied reads cannot open one each: past the window's allowance a predicted
 * denial is refused without touching the database, which is what the old
 * pre-check was for. Nothing reaches this function unauthenticated or outside
 * the team — `openTeam` has already refused both — so no caller can force a
 * transaction that could not already open one on the permitted path.
 */
export async function guardAuditRead<T>(
  context: TeamScope,
  procedure: AuditReadProcedure,
  read: () => Promise<T>,
): Promise<T> {
  const reservation = grantsAuditRead(context.team.role)
    ? null
    : await admitAuditReadDenial(context);
  try {
    const result = await read();
    // Reached with a reservation held only when the committed role turned out
    // to grant the read after all; that is not a denial, so it releases the
    // slot without spending the allowance.
    await reservation?.complete('other');
    return result;
  } catch (error) {
    if (error instanceof AuditReadDeniedError) {
      return denyAuditRead(context, procedure, reservation);
    }
    await reservation?.complete('other');
    throw error;
  }
}

/** Throws so the read transaction rolls back before any row is returned. */
export async function assertAuditReadAuthorized(
  client: pg.PoolClient,
  context: TeamScope,
): Promise<void> {
  const authorization = await authorizeAuditRead(client, {
    teamId: context.team.id,
    actorUserId: context.principal.userId,
  });
  if (authorization === 'permitted') return;
  if (authorization === 'not_a_member') throw new AuditReadDenied({});
  throw new AuditReadDeniedError();
}
