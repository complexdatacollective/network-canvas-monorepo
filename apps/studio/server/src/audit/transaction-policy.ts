import type { AuditPolicy } from './policy.ts';

// Every tenant-scoped transaction that is not an audited command must be named
// here. `audit/no-audit.ts` checks this registry at runtime, and the source
// policy test holds the registry and its callers to each other in both
// directions: an operation opened without an entry fails at the first call,
// and an entry nothing opens fails the suite.
//
// Ten `protocol.*` entries left with #1927 stage 3. They named transactions
// the protocol store opened *for itself* — `protocol.create`,
// `protocol.addStage`, `protocol.publishDraft` and the rest — and the store
// owns none now: every one of its spans requires the caller's `Transaction`,
// so the transaction, and the policy it runs under, belong to whoever opened
// it. What is left is the four the sweep opens, the three the editor's lease
// lifecycle opens, the three audit reads, and the sync server's eight.
//
// Lease lifecycle writes are permanently excluded from the audit-log design.
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
  // The protocol store's hourly sweep (`jobs/handlers/protocol-store-gc.ts`).
  // Four tenant transactions on the maintenance client, and a sweep is
  // nobody's action — but they are still tenant transactions, so the registry
  // is where each one says why it emits nothing.
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
  'protocolBuilder.releaseConnection': {
    kind: 'none',
    reason:
      'A closed connection giving its leases back is release, recorded for the same reason and excluded for the same one.',
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
