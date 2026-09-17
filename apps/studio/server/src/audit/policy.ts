export type AuditPolicy =
  | { kind: 'required' }
  | { kind: 'denied-only'; reason: string }
  | { kind: 'none'; reason: string };

/**
 * A procedure, named the way the rpc plane names it: an `RpcGroup`'s request
 * tag. The keys below were the oRPC contract's dotted paths and the tags are
 * the same strings, so the data is unchanged by the rekey — but the key space
 * is now the served surface itself rather than a parallel spelling of it.
 */
export type RpcTag = string;

/**
 * The procedures that read and write nothing, so the mutation registry says
 * nothing about them.
 *
 * It lives here rather than in the test that used to hold it because the
 * invariant is about the two together: **every request tag is either in this
 * set or has a policy below, and none is in both.** Kept apart, a tag could be
 * dropped from the walk and added here in the same change without either half
 * noticing; kept together, the set equality the test asserts in both directions
 * is over one declaration.
 *
 * `protocolBuilder.watchProtocol` is a subscription rather than a write: it
 * observes revisions, locks and presence, and changes nothing it observes.
 */
export const AUDIT_READ_TAGS: ReadonlySet<RpcTag> = new Set<RpcTag>([
  'status',
  'me',
  'protocols.draft',
  'protocols.list',
  'studies.counts',
  'studies.get',
  'studies.list',
  'audit.list',
  'audit.get',
  'audit.filterOptions',
  'protocolBuilder.getSection',
  'protocolBuilder.listSections',
  'protocolBuilder.watchProtocol',
  'protocolBuilder.resources.list',
  'protocolBuilder.resources.inspect',
  'protocolBuilder.resources.preview',
]);

// Every currently exposed meaningful domain mutation is required. Lease-only
// coordination remains excluded by the audit design.
export const RPC_MUTATION_AUDIT_POLICIES = {
  'account.updateLocale': {
    kind: 'none',
    reason:
      'A personal presentation preference has no tenant and no research-data significance; the audit log is study/team-scoped by design (2026-09-04 localization design §5.2, decision 7).',
  },
  // First-run bootstrap (#1909). The audit log is team-scoped by design and
  // this procedure runs before any team — or any account — exists, so there is
  // no tenant to write the event under and no actor to attribute it to. What
  // it does is legible from the instance itself: an installation row with an
  // owner, which can only have been written here.
  'setup.complete': {
    kind: 'none',
    reason:
      'First-run setup precedes every team and every account, so it has no tenant to be audited under; the owned installation row is its own record.',
  },
  'team.acceptInvitation': { kind: 'required' },
  'team.updateMemberRole': { kind: 'required' },
  'team.createInvitation': { kind: 'required' },
  'team.cancelInvitation': { kind: 'required' },
  'studies.create': { kind: 'required' },
  'protocols.create': { kind: 'required' },
  'protocols.addInformationStage': { kind: 'required' },
  'protocols.moveStage': { kind: 'required' },
  // The protocol-builder host (#1483), which is now the only way a protocol's
  // sections are locked and written. Its writes are domain mutations, so they
  // carry a required event; a lock is lease coordination, which the audit
  // design excludes. Staging and discarding an import commit nothing at all —
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
} as const satisfies Record<RpcTag, AuditPolicy>;

// Mutations that are not rpc procedures at all, so they are keyed by what they
// are rather than by a tag.
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
