export type AuditPolicy =
  | { kind: 'required' }
  | { kind: 'denied-only'; reason: string }
  | { kind: 'none'; reason: string };

// The team commands are required now. Existing protocol producers are
// explicitly recorded as the reviewed #1521 transition rather than silently
// bypassing the policy; leases are permanently excluded by the audit design.
export const RPC_MUTATION_AUDIT_POLICIES = {
  'team.updateMemberRole': { kind: 'required' },
  'team.createInvitation': { kind: 'required' },
  'team.cancelInvitation': { kind: 'required' },
  'protocols.create': {
    kind: 'none',
    reason: 'Protocol producer coverage is delivered by #1521.',
  },
  'protocols.commitSection': {
    kind: 'none',
    reason: 'Meaningful protocol commit events are delivered by #1521.',
  },
  'protocols.addInformationStage': {
    kind: 'none',
    reason: 'Meaningful protocol commit events are delivered by #1521.',
  },
  'protocols.moveStage': {
    kind: 'none',
    reason: 'Meaningful protocol commit events are delivered by #1521.',
  },
  'protocols.acquireSection': {
    kind: 'none',
    reason: 'Lease acquisition is explicitly excluded from the team audit log.',
  },
  'protocols.renewSection': {
    kind: 'none',
    reason: 'Lease renewal is explicitly excluded from the team audit log.',
  },
  'protocols.releaseSection': {
    kind: 'none',
    reason: 'Lease release is explicitly excluded from the team audit log.',
  },
} as const satisfies Record<string, AuditPolicy>;

export const NON_RPC_MUTATION_AUDIT_POLICIES = {
  'better-auth.identity-and-session': {
    kind: 'none',
    reason:
      'Identity and session writes have no authoritative team scope; organization routes have an exact method/path policy inventory.',
  },
  'storage.assets': {
    kind: 'none',
    reason: 'Asset producer coverage is tracked by #1521.',
  },
} as const satisfies Record<string, AuditPolicy>;
