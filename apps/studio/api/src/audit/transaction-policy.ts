import type { AuditPolicy } from './policy.ts';

export const NO_AUDIT_TRANSACTION_POLICIES = {
  'audit.list': {
    kind: 'none',
    reason:
      'Viewing the activity log is a permission-checked bounded read; the audit taxonomy records exports and denied access, not views.',
  },
  'audit.get': {
    kind: 'none',
    reason:
      'Viewing one activity event is a permission-checked bounded read; the audit taxonomy records exports and denied access, not views.',
  },
  'audit.filterOptions': {
    kind: 'none',
    reason:
      'Reading the values the activity filters can take is a permission-checked bounded read over the same rows as audit.list; the audit taxonomy records exports and denied access, not views.',
  },
  'protocol.gcDraftHistory': {
    kind: 'none',
    reason:
      'Collecting manifests and command-log rows below a draft head is scheduled maintenance, not an action any actor took.',
  },
  'protocol.gcReconcileReferencedSections': {
    kind: 'none',
    reason:
      'Clearing the unreferenced mark from a section a version, template or manifest still names corrects the sweep bookkeeping; no state a team can see changes.',
  },
  'protocol.gcMarkUnreferencedSections': {
    kind: 'none',
    reason:
      'Marking a section unreferenced starts its grace period; it deletes nothing and is scheduled maintenance rather than an action.',
  },
  'protocol.gcDeleteUnreferencedSections': {
    kind: 'none',
    reason:
      'Deleting a section no version, template or manifest has named for the whole grace period is scheduled maintenance; the protocols that referenced it were audited when they stopped.',
  },
  'protocolBuilder.acquireLock': {
    kind: 'none',
    reason:
      'Taking a section for editing is lease coordination, which the audit-log design excludes; the write it admits is audited on its own.',
  },
  'protocolBuilder.releaseLock': {
    kind: 'none',
    reason: 'Lease release is explicitly excluded from the team audit log.',
  },
  'protocolBuilder.connect': {
    kind: 'none',
    reason:
      'Recording an open watch and renewing the leases its tab already holds is connection bookkeeping and lease renewal, which the audit-log design excludes.',
  },
  'protocolBuilder.liveness': {
    kind: 'none',
    reason:
      'Extending the expiry of open connections and the leases their owners hold is a heartbeat, excluded like any lease renewal.',
  },
  'protocolBuilder.contact': {
    kind: 'none',
    reason:
      'Noting that a tab is still calling, so its leases stay renewed between calls, is connection bookkeeping rather than an action on team data.',
  },
  'protocolBuilder.expireConnection': {
    kind: 'none',
    reason:
      'Marking a closed watch expired is connection bookkeeping; no state a team can see changes.',
  },
  'protocolBuilder.setMode': {
    kind: 'none',
    reason:
      'Switching what a connection shows its colleagues between viewing and editing is presence, which the audit-log design excludes.',
  },
  'protocolBuilder.releaseOwner': {
    kind: 'none',
    reason:
      'A tab that stayed away past the reconnect grace giving its leases back is release, excluded from the team audit log like any other.',
  },
  'sync.createDraft': {
    kind: 'none',
    reason: 'Protocol synchronization producer coverage is delivered by #1521.',
  },
  'sync.acquire': {
    kind: 'none',
    reason: 'Lease acquisition is explicitly excluded from the team audit log.',
  },
  'sync.takeover': {
    kind: 'none',
    reason: 'Lease takeover is explicitly excluded from the team audit log.',
  },
  'sync.renew': {
    kind: 'none',
    reason: 'Lease renewal is explicitly excluded from the team audit log.',
  },
  'sync.renewHeld': {
    kind: 'none',
    reason: 'Lease renewal is explicitly excluded from the team audit log.',
  },
  'sync.release': {
    kind: 'none',
    reason: 'Lease release is explicitly excluded from the team audit log.',
  },
  'sync.commit': {
    kind: 'none',
    reason:
      'The generic sync package owns standalone commit transactions; the Studio RPC supplies an audited command client.',
  },
  'sync.resume': {
    kind: 'none',
    reason:
      'A consistent resume snapshot is read-only and emits no audit event.',
  },
  'sync.forceExpireForTest': {
    kind: 'none',
    reason: 'Test-only lease expiry setup is excluded from the team audit log.',
  },
} as const satisfies Record<string, AuditPolicy>;

export type NoAuditTransactionOperation =
  keyof typeof NO_AUDIT_TRANSACTION_POLICIES;
