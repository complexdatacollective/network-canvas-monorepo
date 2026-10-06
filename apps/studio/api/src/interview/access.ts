import { type TeamAccess, unsafeMakeTeamAccess } from '../db/tenant.ts';

/** Minted from the team named in a presented link or session token, with no membership behind it: the token-hash lookup inside the scope it opens is the authorization, and an unknown or foreign token finds no row. */
export const presentedTokenTeamAccess = (teamId: string): TeamAccess =>
  unsafeMakeTeamAccess(teamId, 'participant');
