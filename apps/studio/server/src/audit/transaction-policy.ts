import type { AuditPolicy } from './policy.ts';

// Every tenant-scoped transaction that is not yet an audited command must be
// named here. The executor checks this registry at runtime, while the source
// policy test prevents production code from reaching TenantDb.transaction by
// any other path. Protocol audit producers are delivered by #1521; lease
// lifecycle writes are permanently excluded from the audit-log design.
export const NO_AUDIT_TRANSACTION_POLICIES = {
  'protocol.create': {
    kind: 'none',
    reason: 'Protocol producer coverage is delivered by #1521.',
  },
  'protocol.createDraftFromVersion': {
    kind: 'none',
    reason: 'Protocol producer coverage is delivered by #1521.',
  },
  'protocol.publishDraft': {
    kind: 'none',
    reason: 'Protocol producer coverage is delivered by #1521.',
  },
  'protocol.discardDraft': {
    kind: 'none',
    reason: 'Protocol producer coverage is delivered by #1521.',
  },
  'protocol.addStage': {
    kind: 'none',
    reason: 'Meaningful protocol commit events are delivered by #1521.',
  },
  'protocol.removeStage': {
    kind: 'none',
    reason: 'Meaningful protocol commit events are delivered by #1521.',
  },
  'protocol.moveStage': {
    kind: 'none',
    reason: 'Meaningful protocol commit events are delivered by #1521.',
  },
  'protocol.addCodebookEntity': {
    kind: 'none',
    reason: 'Meaningful protocol commit events are delivered by #1521.',
  },
  'protocol.removeCodebookEntity': {
    kind: 'none',
    reason: 'Meaningful protocol commit events are delivered by #1521.',
  },
  'protocol.migrateStoredVersionToDraft': {
    kind: 'none',
    reason: 'Protocol migration producer coverage is delivered by #1521.',
  },
  'protocol.gcDraftHistory': {
    kind: 'none',
    reason: 'Protocol maintenance producer coverage is delivered by #1521.',
  },
  'protocol.gcReconcileReferencedSections': {
    kind: 'none',
    reason: 'Protocol maintenance producer coverage is delivered by #1521.',
  },
  'protocol.gcMarkUnreferencedSections': {
    kind: 'none',
    reason: 'Protocol maintenance producer coverage is delivered by #1521.',
  },
  'protocol.gcDeleteUnreferencedSections': {
    kind: 'none',
    reason: 'Protocol maintenance producer coverage is delivered by #1521.',
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
    reason: 'Meaningful protocol commit events are delivered by #1521.',
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
