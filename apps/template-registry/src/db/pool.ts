import type pg from 'pg';

import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { REGISTRY_ROLES } from './schema.ts';

/** Lazy pools: fix runtime budgets before the shared factory opens a socket. */
export function createRegistryPool({
  connectionString,
  purpose,
  onIdleError,
}: {
  connectionString: string;
  purpose: keyof typeof REGISTRY_ROLES;
  onIdleError: () => void;
}) {
  const pool = createPostgresPool({
    connectionString,
    role: REGISTRY_ROLES[purpose],
    max: purpose === 'app' ? 4 : 2,
    onIdleError,
    roleMismatchCode: 'REGISTRY_DATABASE_ROLE_MISMATCH',
  });
  setRegistryPoolBounds(pool);
  return pool;
}

/** Shared by the executable and isolated-role PostgreSQL fixtures, before use. */
export function setRegistryPoolBounds(pool: pg.Pool): void {
  if (
    pool.totalCount !== 0 ||
    pool.waitingCount !== 0 ||
    pool.options.connectionString !== undefined
  )
    throw new Error('REGISTRY_POOL_MUST_BE_PARSED_AND_UNOPENED');
  // Pool options are copied into each new pg client. The shared factory has
  // already removed connectionString re-parsing, so URL values cannot win back.
  pool.options.statement_timeout = 15_000;
  pool.options.query_timeout = 16_000;
  pool.options.idle_in_transaction_session_timeout = 20_000;
  pool.options.options = `${pool.options.options ?? ''} -c search_path=public -c statement_timeout=15000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=20000`;
}
