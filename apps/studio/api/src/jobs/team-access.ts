import { type TeamAccess, unsafeMakeTeamAccess } from '../db/tenant.ts';

/** Minted without a membership check: the maintenance callers act as the deployment, not as a member. Kept out of the web process. */
export const maintenanceTeamAccess = (teamId: string): TeamAccess =>
  unsafeMakeTeamAccess(teamId, 'maintenance');
