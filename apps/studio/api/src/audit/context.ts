import { Context } from 'effect';

/**
 * The trusted half of every audit event: who acted, in which team, under which
 * request, and what that team was *called at the moment the command locked it*.
 *
 * Provided only by `audited`, inside the locked transaction, so requiring it is
 * how a command proves it is running under one. This used to be a parameter
 * (`LockedAuditedCommandContext`), which a helper could be called with a
 * context it had invented; as a service it cannot be.
 */
export class AuditContext extends Context.Service<
  AuditContext,
  {
    readonly teamId: string;
    /** The team name read under `FOR UPDATE`, trimmed and sliced to 320. */
    readonly teamLabel: string;
    readonly actorId: string;
    readonly actorLabel: string;
    readonly requestId: string;
  }
>()('@studio/audit/AuditContext') {}
