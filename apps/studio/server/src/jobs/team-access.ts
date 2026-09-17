import { type TeamAccess, unsafeMakeTeamAccess } from '../db/tenant.ts';

/**
 * A `TeamAccess` for the worker, minted without a membership check — the one
 * constructor in Studio that does.
 *
 * Worker-only, and deliberately so. `MaintenanceScope.openTenant` takes a
 * `TeamAccess` because opening a tenant transaction is supposed to imply that
 * somebody proved they may act in that team (`db/tenant.ts`), and every other
 * constructor is a membership lookup. The two jobs that reach for this one —
 * the protocol-store sweep and the denied-attempts summary — act as the
 * deployment rather than as a member: the sweep visits every tenant it finds
 * in the swept tables, and the summary appends an audit event for a team
 * nobody is signed in to. There is no member to check, so there is nothing to
 * look up, and naming that here is the point: it keeps the hole in one module
 * a reader can find rather than spread across the handlers.
 *
 * The role it carries is the maintenance role itself, which is what those
 * transactions run as.
 */
export const maintenanceTeamAccess = (teamId: string): TeamAccess =>
  unsafeMakeTeamAccess(teamId, 'maintenance');
