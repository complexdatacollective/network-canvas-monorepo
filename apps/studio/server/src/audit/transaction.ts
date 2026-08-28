import type pg from 'pg';

import type {
  TenantDb,
  TenantTransactionOptions,
} from '@codaco/studio-sync/tenant';

import {
  NO_AUDIT_TRANSACTION_POLICIES,
  type NoAuditTransactionOperation,
} from './transaction-policy.ts';

/**
 * The sole production escape hatch for a reviewed tenant transaction which
 * intentionally emits no audit event. New callers must first add an exact,
 * statically reasoned operation to NO_AUDIT_TRANSACTION_POLICIES.
 */
export function runNoAuditTenantTransaction<T>(
  db: TenantDb,
  operation: NoAuditTransactionOperation,
  work: (client: pg.PoolClient) => Promise<T>,
  opts?: TenantTransactionOptions,
): Promise<T> {
  const policy = NO_AUDIT_TRANSACTION_POLICIES[operation];
  if (policy.kind !== 'none' || policy.reason.length === 0) {
    throw new Error(`invalid no-audit transaction policy: ${operation}`);
  }
  return db.transaction(work, opts);
}
