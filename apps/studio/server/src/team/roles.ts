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
