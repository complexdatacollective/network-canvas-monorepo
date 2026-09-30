import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  assertSectionValid,
  SectionValidationFailedError,
} from '@codaco/studio-sync/section-validation';
import {
  makeSyncServer,
  type SectionValidator,
  type SyncServer,
} from '@codaco/studio-sync/server';
import { parseSectionId } from '@codaco/studio-sync/taxonomy';

import type { NoAuditTransactionOperation } from '../audit/transaction-policy.ts';
import {
  assetsSectionHoldsNoKeys,
  withPlaceholderAssetKeyEntries,
} from './asset-keys.ts';

/**
 * A sync-server operation that runs in a transaction of its own.
 *
 * The sync package used to declare this union, because it opened those
 * transactions itself through an executor Studio handed it. It no longer does:
 * every operation requires the caller's `Transaction`, so the transaction — and
 * therefore the no-audit policy it runs under — belongs to the caller. The
 * union moves here with it.
 *
 * Written against `keyof SyncServer` rather than by hand, so an operation that
 * is renamed or removed upstream is a type error here instead of a registry
 * entry that quietly stops being reachable. Three members are excluded because
 * they are not operations a caller opens a transaction *for*: `ttlMs` is a
 * configured value, and `getSection` and `manifestChain` are reads a caller
 * folds into a transaction it already holds. `forceExpireForTest` is added
 * because it is exported beside the server rather than from it.
 */
type SyncTransactionOperation =
  | Exclude<keyof SyncServer, 'ttlMs' | 'getSection' | 'manifestChain'>
  | 'forceExpireForTest';

/**
 * The registry entry each sync transaction runs under.
 *
 * The invariant this expresses is unchanged: every transaction a sync
 * operation needs is a *registered, reasoned* no-audit operation. What changed
 * is which type says "registered and reasoned" — it used to be the sync
 * package's executor signature, and it is now `NoAuditTransactionOperation`
 * directly, which is the registry's own key type.
 */
export const SYNC_TRANSACTION_POLICIES = {
  createDraft: 'sync.createDraft',
  acquire: 'sync.acquire',
  takeover: 'sync.takeover',
  renew: 'sync.renew',
  release: 'sync.release',
  commit: 'sync.commit',
  resume: 'sync.resume',
  forceExpireForTest: 'sync.forceExpireForTest',
} as const satisfies Record<
  SyncTransactionOperation,
  NoAuditTransactionOperation
>;

/**
 * Per-section validation, plus the one thing a client may not commit: an
 * `assets` section carrying an API key's value (#1900).
 *
 * Refused rather than stripped, which is what the two server-side write
 * boundaries do. A commit arrives as a command from a client, and a client has
 * a route for staging a key — `resources.stage`, which promotes it through the
 * host and seals it. A commit carrying one is therefore a client doing
 * something the contract has no route for, and stripping it silently would
 * make the editor's next read show an asset whose value had vanished with no
 * error anywhere.
 */
const assertProtocolSectionValid: SectionValidator = (
  id: string,
  doc: SectionDoc,
  sectionIds?: string[],
): void => {
  const isAssets = parseSectionId(id).kind === 'assets';
  // A stored `apikey` entry carries no `value`, which the shared schema
  // requires, so the merged document is checked with placeholders filled in
  // (#1900). Only the shape is being checked here; the copy is thrown away.
  assertSectionValid(
    id,
    isAssets ? withPlaceholderAssetKeyEntries(doc) : doc,
    sectionIds,
  );
  if (!isAssets) return;
  // Against the document as it arrived, not the filled copy: the placeholder
  // is what a redacted entry is filled WITH, so asking the copy would refuse
  // every commit.
  if (assetsSectionHoldsNoKeys(doc)) return;
  throw new SectionValidationFailedError([
    {
      sectionId: id,
      issues: [
        {
          path: [],
          message:
            'an API key asset cannot be committed with its value; stage it as a resource instead',
        },
      ],
    },
  ]);
};

/**
 * Studio's sync server: the shared state machine plus Studio's own section
 * validation.
 *
 * It takes no database handle and opens no transaction. Every operation
 * requires the `Transaction` service, so the caller's scope is what it runs in
 * — which is how a host lands a lease change and its own rows together.
 */
export function createProtocolSyncServer(ttlMs?: number): SyncServer {
  return makeSyncServer({
    ttlMs,
    validateSection: assertProtocolSectionValid,
  });
}
