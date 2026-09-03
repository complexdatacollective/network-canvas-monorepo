/**
 * Better Auth stores a member's roles as one comma-separated string, so every
 * question about what a member may do starts by splitting it. Shared because
 * the team sidebar and the team screen now ask the same question: the
 * sidebar decides whether to offer the Activity destination, and the screen
 * decides whether to offer member administration.
 */
export function teamRoles(role: string | undefined): string[] {
  return (
    role
      ?.split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '') ?? []
  );
}

/**
 * Whether a member administers the team. Owners and admins do; everyone else
 * is offered the destinations they can use, and refused by the procedure
 * behind the rest.
 */
export function canManageTeam(role: string | undefined): boolean {
  return teamRoles(role).some(
    (entry) => entry === 'owner' || entry === 'admin',
  );
}

/**
 * The researcher's role IN a named team, or `undefined` when Better Auth's
 * active membership describes a different one.
 *
 * `useActiveMember()` answers about the ACTIVE team, and the URL is what says
 * which team a screen is about (§2.2). Those two agree only after §6.6's
 * reconciler has finished — they disagree for the whole of every team switch,
 * and permanently when that write fails — so the role must be read against the
 * team it was issued for or it describes the wrong one. An administrator of A
 * who is only a member of B would otherwise be offered B's manage-only
 * destinations and meet the procedure's refusal behind them, and the reverse
 * would hide destinations they do have.
 *
 * `undefined` is the honest answer for a mismatch rather than a guess in
 * either direction: nothing here knows this researcher's role in the team on
 * screen until the membership for it arrives, and every consumer already
 * treats an unknown role as the least it could be. `TeamMembers` makes the
 * same comparison for a stronger purpose — it waits rather than guessing,
 * because it renders that team's membership rather than a courtesy.
 */
export function teamRole(
  activeMember: { organizationId: string; role: string } | null | undefined,
  teamId: string | undefined,
): string | undefined {
  if (teamId === undefined) return undefined;
  return activeMember?.organizationId === teamId
    ? activeMember.role
    : undefined;
}

/**
 * One role, as a researcher reads it.
 *
 * An unknown role is shown verbatim rather than hidden: a membership the
 * client does not recognise is still a membership, and saying nothing about
 * it would be a worse answer than saying its name.
 */
export function roleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'member':
      return 'Member';
    default:
      return role;
  }
}

export function teamRolesLabel(role: string): string {
  const roles = teamRoles(role);
  return roles.length === 0
    ? 'Unassigned'
    : roles.map((entry) => roleLabel(entry)).join(', ');
}
