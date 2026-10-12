import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

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
