import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

// What this deployment is currently doing, as opposed to what its schema is
// (`schemaFingerprint`) or who owns it (`installation`). One row, no team, and
// therefore no row-level security policy — what keeps it honest is the
// singleton check and the grants.
//
// It exists because two processes need to agree on a fact neither of them owns:
// whether the deployment is in a maintenance window. The web process reads it
// to decide whether to refuse writes; the worker writes it. Stage 4 turns the
// read into `MaintenanceGate` and adds the store that reads and writes the
// row; here it is the table and its grants, which is what the schema needs.

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
