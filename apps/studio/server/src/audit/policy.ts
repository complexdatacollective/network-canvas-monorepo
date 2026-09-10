export type AuditPolicy =
  | { kind: 'required' }
  | { kind: 'denied-only'; reason: string }
  | { kind: 'none'; reason: string };

// Every currently exposed meaningful domain mutation is required. Lease-only
// coordination remains excluded by the audit design.
export const RPC_MUTATION_AUDIT_POLICIES = {
  'audit.alerts.updateSettings': { kind: 'required' },
  'audit.alerts.acknowledge': { kind: 'required' },
  'audit.alerts.markRead': {
    kind: 'none',
    reason:
      'Personal alert read state is operational and creates no audit event or send.',
  },
  'setup.complete': { kind: 'required' },
  'account.updateLocale': {
    kind: 'none',
    reason:
      'A personal presentation preference has no tenant and no research-data significance; the audit log is study/team-scoped by design (2026-09-04 localization design §5.2, decision 7).',
  },
  'team.acceptInvitation': { kind: 'required' },
  'team.updateMemberRole': { kind: 'required' },
  'team.createInvitation': { kind: 'required' },
  'team.cancelInvitation': { kind: 'required' },
  'studies.create': { kind: 'required' },
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
  // The protocol-builder host (#1483). Its writes are the same domain
  // mutation `protocols.commitSection` is, so they carry the same required
  // event; its locks are the same lease coordination `acquireSection` is, so
  // they carry none. Staging and discarding an import commit nothing at all —
  // a staged file lives in the editing process until the submit that names it
  // promotes it, and that submit is the audited write.
  'protocolBuilder.submit': { kind: 'required' },
  'protocolBuilder.create': { kind: 'required' },
  'protocolBuilder.delete': { kind: 'required' },
  'protocolBuilder.refactor.deleteVariable': { kind: 'required' },
  'protocolBuilder.refactor.deleteEntityType': { kind: 'required' },
  'protocolBuilder.acquireLock': {
    kind: 'none',
    reason: 'Lease acquisition is explicitly excluded from the team audit log.',
  },
  'protocolBuilder.releaseLock': {
    kind: 'none',
    reason: 'Lease release is explicitly excluded from the team audit log.',
  },
  'protocolBuilder.resources.stage': {
    kind: 'none',
    reason:
      'A staged import is held in the editing process and written by nothing; only the submit that promotes it reaches storage, and that is audited.',
  },
  'protocolBuilder.resources.discard': {
    kind: 'none',
    reason:
      'Discarding a staged import drops process-local state; no stored bytes, manifest entry or revision existed to remove.',
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
