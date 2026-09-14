import { assertSectionValid } from '@codaco/studio-sync/section-validation';
import {
  SyncServer,
  type SyncTransactionExecutor,
  type SyncTransactionOperation,
} from '@codaco/studio-sync/server';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import type { NoAuditTransactionOperation } from '../audit/transaction-policy.ts';
import { runNoAuditTenantTransaction } from '../audit/transaction.ts';

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

export function createProtocolSyncServer(
  db: TenantDb,
  ttlMs?: number,
): SyncServer {
  return new SyncServer(
    db,
    createProtocolSyncTransactionExecutor(db),
    ttlMs,
    assertSectionValid,
  );
}
