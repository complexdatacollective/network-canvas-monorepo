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
import type { SqlError } from 'effect/unstable/sql';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { Database } from './client.ts';
import { sqlErrorsOnly } from './errors.ts';
import { Transaction, UntenantedScope } from './tenant.ts';

// What this deployment is currently doing, as opposed to what its schema is
// (`schemaFingerprint`) or who owns it (`installation`). One row, no team, and
// therefore no row-level security policy — what keeps it honest is the
// singleton check and the grants.
//
// It exists because two processes need to agree on a fact neither of them owns:
// whether the deployment is in a maintenance window. The web process reads it
// to decide whether to refuse writes; the worker writes it. The store is the
// two functions at the bottom of this file (#1927 §9); stage 4 builds
// `MaintenanceGate` over the read and gives the write its caller.

const deploymentState = pgTable(
  'deployment_state',
  {
    // One row, forever — the same shape and the same reasoning as
    // `installation`: this row is addressed by every statement that touches it,
    // and `where id = 1` reads as what it is.
    id: integer('id').primaryKey().default(1),
    // The switch itself. Not nullable: "nobody has said" and "not in
    // maintenance" are the same answer, and a null would make every reader
    // decide which.
    maintenance: boolean('maintenance').notNull().default(false),
    /**
     * Why, for the notice a researcher sees. Null when `maintenance` is false;
     * the check below holds the two together so a stale reason cannot outlive
     * the window it explained.
     */
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
//
// The row is created by the schema step, which runs as the connecting login,
// so neither application role may INSERT or DELETE it: a deployment cannot be
// made to forget its own state by anything the server does. Both roles SELECT,
// because the web process is the one that has to refuse a write during a
// window. Only maintenance UPDATEs: entering and leaving a window is the
// worker's decision, and a web process that could write this could take itself
// out of service.
export const DEPLOYMENT_STATE_SIDECAR_SQL = `
INSERT INTO deployment_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
REVOKE INSERT, DELETE, TRUNCATE ON deployment_state
  FROM ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
REVOKE UPDATE ON deployment_state FROM ${TENANT_ROLES.app};
`;

/** The row as the store hands it out; `id` is always 1 and says nothing. */
export type DeploymentState = {
  readonly maintenance: boolean;
  readonly reason: string | null;
  readonly updatedAt: Date;
};

/**
 * What `setMaintenance` may be asked for. A reason only exists inside a
 * window, so leaving one takes none — the shape the reason check enforces,
 * stated where a caller can see it rather than learned from a refusal.
 */
export type MaintenanceWindow =
  | { readonly maintenance: true; readonly reason: string | null }
  | { readonly maintenance: false };

const STATE_COLUMNS = {
  maintenance: deploymentState.maintenance,
  reason: deploymentState.reason,
  updatedAt: deploymentState.updatedAt,
};

/**
 * The schema step creates the row and neither application role may delete
 * it, so a missing one is a database this build did not provision — which the
 * schema gate refuses at boot. Reaching here without it is a defect.
 */
const theRow = (rows: ReadonlyArray<DeploymentState>) =>
  rows[0] === undefined
    ? Effect.die(new Error('deployment_state has no row'))
    : Effect.succeed(rows[0]);

const readRow = Effect.fn('db.deploymentState.read')(function* () {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .select(STATE_COLUMNS)
    .from(deploymentState)
    .where(eq(deploymentState.id, 1));
  return yield* theRow(rows);
}, sqlErrorsOnly);

/**
 * The deployment's state, read as the application role — the web process is
 * the reader that has to refuse a write during a window, so the read runs with
 * the grants that process has.
 *
 * It asks for no `Transaction` because a reader has none to offer: the gate
 * reads before a request's transaction exists. It still opens one of its own:
 * on rc.115 the role and the search path are pinned only by the first
 * statements of a transaction (fallback A, `tenant.ts`), and a bare read would
 * run as the connecting login against whatever schema that login resolves.
 * When rc.116's startup parameters land this can become the bare read the
 * design describes, and its signature does not change.
 */
export const readDeploymentState = (): Effect.Effect<
  DeploymentState,
  SqlError.SqlError,
  Database
> => UntenantedScope.open(readRow());

/**
 * Enters or leaves a maintenance window, on the caller's transaction — so the
 * switch commits with whatever the caller did to justify it. Only the
 * maintenance role holds `UPDATE` (the sidecar above), so this succeeds inside
 * `MaintenanceScope.open` and is refused with `42501` inside any application
 * scope. `.returning()` is what makes the answer the row as written rather
 * than the driver's result object.
 */
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
