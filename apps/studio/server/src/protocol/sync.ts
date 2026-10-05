import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  assertSectionValid,
  SectionValidationFailedError,
} from '@codaco/studio-sync/section-validation';
import {
  SyncServer,
  type SectionValidator,
  type SyncTransactionExecutor,
  type SyncTransactionOperation,
} from '@codaco/studio-sync/server';
import { parseSectionId } from '@codaco/studio-sync/taxonomy';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import type { NoAuditTransactionOperation } from '../audit/transaction-policy.ts';
import { runNoAuditTenantTransaction } from '../audit/transaction.ts';
import {
  assetsSectionHoldsNoKeys,
  withPlaceholderAssetKeyEntries,
} from './asset-keys.ts';

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

export function createProtocolSyncTransactionExecutor(
  db: TenantDb,
): SyncTransactionExecutor {
  return (operation, work, opts) =>
    runNoAuditTenantTransaction(
      db,
      SYNC_TRANSACTION_POLICIES[operation],
      work,
      opts,
    );
}

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

export function createProtocolSyncServer(
  db: TenantDb,
  ttlMs?: number,
): SyncServer {
  return new SyncServer(
    db,
    createProtocolSyncTransactionExecutor(db),
    ttlMs,
    assertProtocolSectionValid,
  );
}
