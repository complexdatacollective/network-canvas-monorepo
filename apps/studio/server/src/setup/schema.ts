import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { AUTH_TABLES } from '../db/auth-schema.ts';

// The instance itself: who owns this deployment and what it calls itself.
// Platform-level like `schemaFingerprint` and unlike every domain table —
// there is exactly one row, it belongs to no team, and it therefore carries no
// row-level security policy. What keeps it honest is the singleton check and
// the grants below.
//
// It exists for first-run bootstrap (#1909): the schema step issues a token
// into this row, `/setup` spends it to create the first owner, and an
// installation that has an owner never issues another. `owner_user_id` is the
// whole gate — "setup is required" is exactly "this column is null".
const installation = pgTable(
  'installation',
  {
    // One row, forever. An `integer` pinned to 1 rather than a boolean
    // `default(true)` (the fingerprint table's shape) because this row is
    // addressed by every setup statement, and `where id = 1` reads as what it
    // is where `where id = true` reads as a mistake.
    id: integer('id').primaryKey().default(1),
    // Null until `/setup` stores one. Not a default: the difference between
    // "nobody has named this instance" and "somebody named it Network Canvas
    // Studio" is the difference the status surface reports, and a default
    // would erase it. `getInstanceStatus` supplies the product name for the
    // null case, so no surface renders an empty title.
    name: text('name'),
    // The first owner. Nullable, and null is what makes `/setup` answerable:
    // once it is set, the procedure is NOT_FOUND and the schema step prints
    // nothing. No cascade — deleting the owning user must fail rather than
    // silently return the instance to first-run state.
    ownerUserId: text('owner_user_id'),
    // sha256 hex of the printed token, never the token. A fast hash is right
    // for the same reason it is right for api_tokens: 32 CSPRNG bytes have no
    // dictionary to attack, and the value is verified on a public endpoint.
    bootstrapTokenHash: text('bootstrap_token_hash'),
    bootstrapTokenIssuedAt: timestamp('bootstrap_token_issued_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('installation_singleton_check', sql`${table.id} = 1`),
    foreignKey({
      name: 'installation_owner_fk',
      columns: [table.ownerUserId],
      foreignColumns: [AUTH_TABLES.user.id],
    }),
    check(
      'installation_bootstrap_token_check',
      sql`(${table.bootstrapTokenHash} IS NULL) = (${table.bootstrapTokenIssuedAt} IS NULL)
          AND (${table.bootstrapTokenHash} IS NULL OR ${table.bootstrapTokenHash} ~ '^[0-9a-f]{64}$')`,
    ),
    // An owned installation holds no spendable token: `/setup` clears it as it
    // claims ownership, and the constraint is what stops a later write from
    // re-arming first-run setup on a live instance.
    check(
      'installation_owned_has_no_token_check',
      sql`${table.ownerUserId} IS NULL OR ${table.bootstrapTokenHash} IS NULL`,
    ),
    check(
      'installation_name_check',
      sql`${table.name} IS NULL
          OR (char_length(${table.name}) BETWEEN 1 AND 120 AND ${table.name} ~ '[^[:space:]]')`,
    ),
  ],
);

export const SETUP_TABLES = { installation };

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
//
// The row is created and re-armed by the schema step, which runs as the
// connecting login, so neither application role may INSERT or DELETE it: an
// instance cannot be returned to first-run state by anything the server does.
// The application role keeps UPDATE because `/setup` is served by the web
// process and claiming ownership is an update; maintenance reads only, which
// is all garbage collection and the worker's readiness probe need.
export const SETUP_SIDECAR_SQL = `
REVOKE INSERT, DELETE, TRUNCATE ON installation
  FROM ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
REVOKE UPDATE ON installation FROM ${TENANT_ROLES.maintenance};

-- The application's UPDATE is for claiming an instance, and for nothing else.
-- Table-level UPDATE is column-blind, so without this the web process could
-- write a token hash of its own and set \`owner_user_id\` back to NULL —
-- reopening first-run setup on a live instance, and then completing it. The
-- check is on the effective role rather than on a column grant because
-- claiming ownership writes the same three columns that reopening would.
--
-- \`current_user\` is what the pools pin with the \`role=\` startup parameter
-- (db/pool.ts), and it survives RESET ROLE, so the connecting login — which is
-- what runs the schema step, and the only thing that may arm an instance — is
-- unaffected. A legitimate claim leaves both token columns NULL, which is why
-- the condition can be "NEW is not null" rather than "NEW differs from OLD":
-- an application update must end with no token outstanding, whatever it found.
CREATE OR REPLACE FUNCTION installation_setup_stays_closed() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'first-run setup cannot be reopened by the application';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER installation_setup_stays_closed
  BEFORE UPDATE ON installation
  FOR EACH ROW
  WHEN (
    current_user IN ('${TENANT_ROLES.app}', '${TENANT_ROLES.maintenance}')
    AND (
      (OLD.owner_user_id IS NOT NULL AND NEW.owner_user_id IS NULL)
      OR NEW.bootstrap_token_hash IS NOT NULL
      OR NEW.bootstrap_token_issued_at IS NOT NULL
    )
  )
  EXECUTE FUNCTION installation_setup_stays_closed();
`;
