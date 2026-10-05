import type { TeamRole } from '@codaco/studio-rpc';

export const AUDIT_PERMISSIONS = ['audit.read', 'audit.export'] as const;
export type AuditPermission = (typeof AUDIT_PERMISSIONS)[number];

// Until #1257 introduces configurable role policy, built-in owner and admin
// hold both audit permissions and member holds neither. Server procedures
// check this explicitly; hiding a route or button is not an authorization
// boundary.
export function rolesGrantAuditPermission(
  roles: readonly TeamRole[],
  _permission: AuditPermission,
): boolean {
  return roles.includes('owner') || roles.includes('admin');
}
