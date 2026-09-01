/**
 * Better Auth stores a member's roles as one comma-separated string, so every
 * question about what a member may do starts by splitting it. Shared because
 * the team sidebar and the team workspace now ask the same question: the
 * sidebar decides whether to offer the Activity destination, and the workspace
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
