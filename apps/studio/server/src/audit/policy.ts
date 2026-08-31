export type AuditPolicy =
  | { kind: 'required' }
  | { kind: 'denied-only'; reason: string }
  | { kind: 'none'; reason: string };

// Every currently exposed meaningful domain mutation is required. Lease-only
// coordination remains excluded by the audit design.
export const RPC_MUTATION_AUDIT_POLICIES = {
  'team.acceptInvitation': { kind: 'required' },
  'team.updateMemberRole': { kind: 'required' },
  'team.createInvitation': { kind: 'required' },
  'team.cancelInvitation': { kind: 'required' },
  'protocols.create': { kind: 'required' },
  'protocols.commitSection': { kind: 'required' },
  'protocols.addInformationStage': { kind: 'required' },
  'protocols.moveStage': { kind: 'required' },
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
