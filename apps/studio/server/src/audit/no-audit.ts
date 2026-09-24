import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { type Database, type MaintenanceDatabase } from '../db/client.ts';
import {
  MaintenanceScope,
  type ScopeOptions,
  type TeamAccess,
  TenantScope,
  type Transaction,
} from '../db/tenant.ts';
import type { AuditPolicy } from './policy.ts';
import {
  NO_AUDIT_TRANSACTION_POLICIES,
  type NoAuditTransactionOperation,
} from './transaction-policy.ts';

/**
 * The registry-checked way to open a tenant transaction that intentionally
 * emits no audit event. The reads that open a scope directly are pinned
 * instead, by `audit/__tests__/scope-openers.test.ts`. A new caller must first add an exact,
 * statically reasoned operation to `NO_AUDIT_TRANSACTION_POLICIES`.
 *
 * The registry check is kept as a runtime guard and **dies** rather than
 * failing: an operation whose policy is not `{ kind: 'none' }` with a reason is
 * a programming error caught at the first call, not a condition a caller could
 * handle.
 */
const guard = (operation: NoAuditTransactionOperation): Effect.Effect<void> =>
  Effect.suspend(() => {
    const policy: AuditPolicy | undefined =
      NO_AUDIT_TRANSACTION_POLICIES[operation];
    if (
      policy === undefined ||
      policy.kind !== 'none' ||
      policy.reason.length === 0
    ) {
      return Effect.die(
        new Error(`invalid no-audit transaction policy: ${operation}`),
      );
    }
    return Effect.void;
  });

export const noAuditTransaction = <A, E, R>(
  operation: NoAuditTransactionOperation,
  access: TeamAccess,
  body: Effect.Effect<A, E, R>,
  options?: ScopeOptions,
): Effect.Effect<
  A,
  E | SqlError.SqlError,
  Database | Exclude<R, Transaction>
> =>
  Effect.flatMap(guard(operation), () =>
    TenantScope.open(access, body, options),
  );

/**
 * The worker's form of the same escape hatch, on the maintenance client. The
 * protocol store's sweep runs four of these: a sweep is nobody's action, so it
 * produces no audit event, but it is still a tenant transaction and still has
 * to say in the registry why it emits nothing.
 */
export const noAuditMaintenanceTransaction = <A, E, R>(
  operation: NoAuditTransactionOperation,
  access: TeamAccess,
  body: Effect.Effect<A, E, R>,
  options?: ScopeOptions,
): Effect.Effect<
  A,
  E | SqlError.SqlError,
  MaintenanceDatabase | Exclude<R, Transaction>
> =>
  Effect.flatMap(guard(operation), () =>
    MaintenanceScope.openTenant(access, body, options),
  );
