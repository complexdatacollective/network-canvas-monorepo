import { eq, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { Database, MaintenanceDatabase } from './client.ts';
import { sqlErrorsOnly } from './errors.ts';
import { MaintenanceScope, Transaction, UntenantedScope } from './tenant.ts';

const deploymentState = pgTable(
  'deployment_state',
  {
    id: integer('id').primaryKey().default(1),
    maintenance: boolean('maintenance').notNull().default(false),
    reason: text('reason'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('deployment_state_singleton_check', sql`${table.id} = 1`),
    check(
      'deployment_state_reason_check',
      sql`(${table.maintenance} = false AND ${table.reason} IS NULL)
          OR (${table.maintenance} = true
              AND (${table.reason} IS NULL
                   OR (char_length(${table.reason}) BETWEEN 1 AND 280
                       AND ${table.reason} ~ '[^[:space:]]')))`,
    ),
  ],
);

export const DEPLOYMENT_STATE_TABLES = { deploymentState };

// Hashed into the schema fingerprint — whitespace counts.
export const DEPLOYMENT_STATE_SIDECAR_SQL = `
INSERT INTO deployment_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
REVOKE INSERT, DELETE, TRUNCATE ON deployment_state
  FROM ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
REVOKE UPDATE ON deployment_state FROM ${TENANT_ROLES.app};
`;

export type DeploymentState = {
  readonly maintenance: boolean;
  readonly reason: string | null;
  readonly updatedAt: Date;
};

export type MaintenanceWindow =
  | { readonly maintenance: true; readonly reason: string | null }
  | { readonly maintenance: false };

const STATE_COLUMNS = {
  maintenance: deploymentState.maintenance,
  reason: deploymentState.reason,
  updatedAt: deploymentState.updatedAt,
};

const theRow = (rows: ReadonlyArray<DeploymentState>) =>
  rows[0] === undefined
    ? Effect.die(new Error('deployment_state has no row'))
    : Effect.succeed(rows[0]);

/**
 * Bounded on the server: a caller that gives up interrupts its fiber, not the
 * statement queued behind a migration's lock.
 */
const READ_STATEMENT_TIMEOUT = '1s';

const readRow = Effect.fn('db.deploymentState.read')(function* () {
  const { tx, sql: client } = yield* Transaction;
  yield* client`select set_config('statement_timeout', ${READ_STATEMENT_TIMEOUT}, true)`;
  const rows = yield* tx
    .select(STATE_COLUMNS)
    .from(deploymentState)
    .where(eq(deploymentState.id, 1));
  return yield* theRow(rows);
}, sqlErrorsOnly);

export const readDeploymentState = (): Effect.Effect<
  DeploymentState,
  SqlError.SqlError,
  Database
> => UntenantedScope.open(readRow());

export const readDeploymentStateAsMaintenance = (): Effect.Effect<
  DeploymentState,
  SqlError.SqlError,
  MaintenanceDatabase
> => MaintenanceScope.open(readRow());

export const setMaintenance: (
  window: MaintenanceWindow,
) => Effect.Effect<DeploymentState, SqlError.SqlError, Transaction> = Effect.fn(
  'db.deploymentState.setMaintenance',
)(function* (window: MaintenanceWindow) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .update(deploymentState)
    .set({
      maintenance: window.maintenance,
      reason: window.maintenance ? window.reason : null,
      updatedAt: sql`now()`,
    })
    .where(eq(deploymentState.id, 1))
    .returning(STATE_COLUMNS);
  return yield* theRow(rows);
}, sqlErrorsOnly);

/** The newest release the daily update check has recorded (#1901). */
export type LatestRelease = {
  readonly version: string;
  readonly releasedAt: Date;
  readonly notesUrl: string;
  readonly schemaChange: boolean;
};

/**
 * What the worker's update check last recorded, or null when it has recorded
 * nothing yet (a fresh instance, or one whose manifest has never been
 * reachable). Read by the application role. STUB: the body lands with the
 * columns it reads.
 */
export const readLatestRelease: () => Effect.Effect<
  LatestRelease | null,
  SqlError.SqlError,
  Database
> = () => Effect.succeed(null);
