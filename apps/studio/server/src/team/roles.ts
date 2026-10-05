import { TeamRoleSchema, type TeamRole } from '@codaco/studio-rpc';

// Better Auth stores a member's roles as one comma-separated string. Returns
// null when the value is not a clean role list so callers choose their own
// failure mode without this module depending on command error types.
export function tryParseRoles(value: string): TeamRole[] | null {
  const roles = value
    .split(',')
    .map((role) => role.trim())
    .flatMap((role) => {
      const parsed = TeamRoleSchema.safeParse(role);
      return parsed.success ? [parsed.data] : [];
    });
  if (roles.length === 0 || roles.join(',') !== value.replaceAll(' ', '')) {
    return null;
  }
  return [...new Set(roles)];
}

/**
 * The team Admin tier, with Owner as the founding admin: the one role
 * predicate behind team administration, study creation, and #1257's rule that
 * an Admin sees every study their team owns. One function so those cannot
 * drift apart in one place and not the others.
 */
export function isTeamAdministrator(roles: readonly TeamRole[]): boolean {
  return roles.includes('owner') || roles.includes('admin');
}

/**
 * The same predicate over an unparsed better-auth role value. A value this
 * build cannot parse is not an admin: the safe reading of a role list it does
 * not understand is the narrower one.
 */
export function roleGrantsTeamAdministration(value: string): boolean {
  const roles = tryParseRoles(value);
  return roles !== null && isTeamAdministrator(roles);
}
