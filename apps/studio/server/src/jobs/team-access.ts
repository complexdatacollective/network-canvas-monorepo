import { type TeamAccess, unsafeMakeTeamAccess } from '../db/tenant.ts';

/**
 * A `TeamAccess` for the maintenance role, minted without a membership check —
 * the one mint either process holds that looks nothing up (the other is the
 * hand-run `scripts/protocol-demo.ts`). The rest each follow a membership
 * lookup, except `team.acceptInvitation`'s, whose proof is the locked
 * invitation re-read inside the transaction it opens;
 * `db/__tests__/team-access-policy.test.ts` lists every one.
 *
 * Kept out of the web process: `MaintenanceScope.openTenant` takes a
 * `TeamAccess` because opening a tenant transaction is supposed to imply that
 * somebody proved they may act in that team (`db/tenant.ts`). The callers of
 * this one — the protocol-store sweep and, through `audit/denial-summary.ts`,
 * the denied-attempts summary — act as the deployment rather than as a
 * member: the sweep visits every tenant it finds in the swept tables, and the
 * summary appends an audit event for a team nobody is signed in to. There is
 * no member to check, so there is nothing to look up, and naming that here is
 * the point: it keeps the hole in one module a reader can find rather than
 * spread across the handlers. `__tests__/process-separation.test.ts` asserts
 * the web process's graph does not reach this module.
 *
 * The role it carries is the maintenance role itself, which is what those
 * transactions run as.
 */
export const maintenanceTeamAccess = (teamId: string): TeamAccess =>
  unsafeMakeTeamAccess(teamId, 'maintenance');
