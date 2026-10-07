import type { AuditPolicy } from './policy.ts';

type BetterAuthOrganizationRoutePolicy = {
  method: 'GET' | 'POST';
  path: `/api/auth/organization/${string}`;
  disposition: 'allowed' | 'blocked';
  audit: AuditPolicy;
  reason: string;
};

// This is an exact inventory of the HTTP routes exposed by the configured
// Better Auth organization plugin. A test compares these method/path pairs to
// the plugin's runtime endpoint metadata so an upgrade cannot add a team write
// without an explicit audit decision. Endpoints with no runtime path (such as
// Better Auth's server-only addMember helper) are deliberately not HTTP routes.
export const BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES = {
  'POST /api/auth/organization/create': {
    method: 'POST',
    path: '/api/auth/organization/create',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason:
      'Team creation remains blocked until Studio owns its audited command.',
  },
  'POST /api/auth/organization/update': {
    method: 'POST',
    path: '/api/auth/organization/update',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason:
      'Team updates remain blocked until Studio owns their audited command.',
  },
  'POST /api/auth/organization/delete': {
    method: 'POST',
    path: '/api/auth/organization/delete',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason:
      'Team deletion remains blocked until Studio owns an audited purge command.',
  },
  'POST /api/auth/organization/set-active': {
    method: 'POST',
    path: '/api/auth/organization/set-active',
    disposition: 'allowed',
    audit: {
      kind: 'none',
      reason: 'Active-team selection is explicitly excluded from team audit.',
    },
    reason: 'This mutates only the caller session selection.',
  },
  'GET /api/auth/organization/get-organization': {
    method: 'GET',
    path: '/api/auth/organization/get-organization',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only organization lookup.' },
    reason: 'Read-only route.',
  },
  'GET /api/auth/organization/get-full-organization': {
    method: 'GET',
    path: '/api/auth/organization/get-full-organization',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only organization lookup.' },
    reason: 'Read-only route.',
  },
  'GET /api/auth/organization/list': {
    method: 'GET',
    path: '/api/auth/organization/list',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only organization lookup.' },
    reason: 'Read-only route.',
  },
  'POST /api/auth/organization/invite-member': {
    method: 'POST',
    path: '/api/auth/organization/invite-member',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason: 'Studio owns invitation creation through team.createInvitation.',
  },
  'POST /api/auth/organization/cancel-invitation': {
    method: 'POST',
    path: '/api/auth/organization/cancel-invitation',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason:
      'Studio owns invitation cancellation through team.cancelInvitation.',
  },
  'POST /api/auth/organization/accept-invitation': {
    method: 'POST',
    path: '/api/auth/organization/accept-invitation',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason: 'Studio owns invitation acceptance through team.acceptInvitation.',
  },
  'GET /api/auth/organization/get-invitation': {
    method: 'GET',
    path: '/api/auth/organization/get-invitation',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only invitation lookup.' },
    reason: 'Read-only route.',
  },
  'POST /api/auth/organization/reject-invitation': {
    method: 'POST',
    path: '/api/auth/organization/reject-invitation',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason:
      'Invitation rejection remains blocked until Studio owns its audited command.',
  },
  'GET /api/auth/organization/list-invitations': {
    method: 'GET',
    path: '/api/auth/organization/list-invitations',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only invitation lookup.' },
    reason: 'Read-only route.',
  },
  'GET /api/auth/organization/get-active-member': {
    method: 'GET',
    path: '/api/auth/organization/get-active-member',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only membership lookup.' },
    reason: 'Read-only route.',
  },
  'POST /api/auth/organization/check-slug': {
    method: 'POST',
    path: '/api/auth/organization/check-slug',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only slug availability check.' },
    reason: 'POST-shaped read with no domain mutation.',
  },
  'POST /api/auth/organization/remove-member': {
    method: 'POST',
    path: '/api/auth/organization/remove-member',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason:
      'Member removal remains blocked until Studio owns its audited command.',
  },
  'POST /api/auth/organization/update-member-role': {
    method: 'POST',
    path: '/api/auth/organization/update-member-role',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason: 'Studio owns role changes through team.updateMemberRole.',
  },
  'POST /api/auth/organization/leave': {
    method: 'POST',
    path: '/api/auth/organization/leave',
    disposition: 'blocked',
    audit: { kind: 'required' },
    reason:
      'Leaving a team remains blocked until Studio owns its audited command.',
  },
  'GET /api/auth/organization/list-user-invitations': {
    method: 'GET',
    path: '/api/auth/organization/list-user-invitations',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only invitation lookup.' },
    reason: 'Read-only route.',
  },
  'GET /api/auth/organization/list-members': {
    method: 'GET',
    path: '/api/auth/organization/list-members',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only membership lookup.' },
    reason: 'Read-only route.',
  },
  'GET /api/auth/organization/get-active-member-role': {
    method: 'GET',
    path: '/api/auth/organization/get-active-member-role',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only membership lookup.' },
    reason: 'Read-only route.',
  },
  'POST /api/auth/organization/has-permission': {
    method: 'POST',
    path: '/api/auth/organization/has-permission',
    disposition: 'allowed',
    audit: { kind: 'none', reason: 'Read-only permission check.' },
    reason: 'POST-shaped read with no domain mutation.',
  },
} as const satisfies Record<string, BetterAuthOrganizationRoutePolicy>;

export const BLOCKED_BETTER_AUTH_TEAM_MUTATION_PATHS = Object.values(
  BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES,
)
  .filter(({ disposition }) => disposition === 'blocked')
  .map(({ path }) => path);
