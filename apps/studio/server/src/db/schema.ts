import { getTableName, sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { Effect } from 'effect';
import type { SqlClient } from 'effect/unstable/sql';
import type pg from 'pg';

import { SYNC_SIDECAR_SQL, SYNC_TABLES } from '@codaco/studio-sync/schema';

import { ASSET_SIDECAR_SQL, ASSET_TABLES } from '../asset/schema.ts';
import { AUDIT_SIDECAR_SQL, AUDIT_TABLES } from '../audit/schema.ts';
import { CONSENT_SIDECAR_SQL, CONSENT_TABLES } from '../consent/schema.ts';
import {
  EXPERIMENT_SIDECAR_SQL,
  EXPERIMENT_TABLES,
} from '../experiment/schema.ts';
import { FEEDBACK_SIDECAR_SQL, FEEDBACK_TABLES } from '../feedback/schema.ts';
import {
  MONITORING_SIDECAR_SQL,
  MONITORING_TABLES,
} from '../monitoring/schema.ts';
import { NETWORK_SIDECAR_SQL, NETWORK_TABLES } from '../network/schema.ts';
import {
  PROTOCOL_BUILDER_SIDECAR_SQL,
  PROTOCOL_BUILDER_TABLES,
} from '../protocol-builder/schema.ts';
import { PROTOCOL_SIDECAR_SQL, PROTOCOL_TABLES } from '../protocol/schema.ts';
import { SCHEDULE_SIDECAR_SQL, SCHEDULE_TABLES } from '../schedule/schema.ts';
import { SETUP_SIDECAR_SQL, SETUP_TABLES } from '../setup/schema.ts';
import {
  STUDY_ROLE_SIDECAR_SQL,
  STUDY_ROLE_TABLES,
} from '../study/roles-schema.ts';
import { STUDY_SIDECAR_SQL, STUDY_TABLES } from '../study/schema.ts';
import {
  INVITATION_DELIVERY_SIDECAR_SQL,
  INVITATION_DELIVERY_TABLES,
} from '../team/invitation-delivery-schema.ts';
import { TEMPLATE_SIDECAR_SQL, TEMPLATE_TABLES } from '../template/schema.ts';
import { TOKEN_SIDECAR_SQL, TOKEN_TABLES } from '../token/schema.ts';
import { WEBHOOK_SIDECAR_SQL, WEBHOOK_TABLES } from '../webhook/schema.ts';
import { ACCESS_SIDECAR_SQL } from './access.ts';
import { AUTH_TABLES } from './auth-schema.ts';
import {
  DEPLOYMENT_STATE_SIDECAR_SQL,
  DEPLOYMENT_STATE_TABLES,
} from './deployment-state.ts';
import { SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';

// Managed like every other table: push diffs the whole public schema, so an
// unmanaged stamp table would read as droppable.
const schemaFingerprint = pgTable(
  'schemaFingerprint',
  {
    id: boolean('id').primaryKey().default(true),
    fingerprint: text('fingerprint').notNull(),
    appliedAt: timestamp('appliedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check('schemaFingerprint_id_check', sql`${table.id}`)],
);

export const SCHEMA = {
  ...AUTH_TABLES,
  ...SYNC_TABLES,
  ...PROTOCOL_TABLES,
  ...PROTOCOL_BUILDER_TABLES,
  ...ASSET_TABLES,
  ...STUDY_TABLES,
  ...NETWORK_TABLES,
  ...STUDY_ROLE_TABLES,
  ...CONSENT_TABLES,
  ...SCHEDULE_TABLES,
  ...TOKEN_TABLES,
  ...TEMPLATE_TABLES,
  ...WEBHOOK_TABLES,
  ...EXPERIMENT_TABLES,
  ...FEEDBACK_TABLES,
  ...MONITORING_TABLES,
  ...AUDIT_TABLES,
  ...INVITATION_DELIVERY_TABLES,
  ...SETUP_TABLES,
  ...DEPLOYMENT_STATE_TABLES,
  schemaFingerprint,
};

// Order matters: sync creates the roles, then access grants the general table
// privileges over every table, and only then do the domain sidecars install
// their triggers, tenant grants and — where a table is an outbox or history —
// their narrower role-specific revocations. A revocation that ran before the
// broad grant would be silently undone by it (the webhook slice found exactly
// that), so the broad grant goes first and nothing after it grants more than
// its own tables. The immutable audit log stays last: its revocations are the
// strictest, and the ordering test pins both properties.
export const SIDECARS = [
  SYNC_SIDECAR_SQL,
  ACCESS_SIDECAR_SQL,
  PROTOCOL_SIDECAR_SQL,
  PROTOCOL_BUILDER_SIDECAR_SQL,
  ASSET_SIDECAR_SQL,
  STUDY_SIDECAR_SQL,
  NETWORK_SIDECAR_SQL,
  STUDY_ROLE_SIDECAR_SQL,
  CONSENT_SIDECAR_SQL,
  SCHEDULE_SIDECAR_SQL,
  TOKEN_SIDECAR_SQL,
  TEMPLATE_SIDECAR_SQL,
  WEBHOOK_SIDECAR_SQL,
  EXPERIMENT_SIDECAR_SQL,
  FEEDBACK_SIDECAR_SQL,
  MONITORING_SIDECAR_SQL,
  INVITATION_DELIVERY_SIDECAR_SQL,
  SETUP_SIDECAR_SQL,
  DEPLOYMENT_STATE_SIDECAR_SQL,
  AUDIT_SIDECAR_SQL,
];

// The stamp table is excluded from the unstamped probe: its presence alone
// says nothing about which build's tables sit beside it.
export const SCHEMA_TABLES = Object.values(SCHEMA)
  .map(getTableName)
  .filter((name) => name !== getTableName(schemaFingerprint));

export const SCHEMA_LOCK_KEY = 4021775688147129;

export type StaleSchema = {
  kind: 'stale';
  /** `unstamped` is a database carrying the tables but no fingerprint row. */
  reason: 'mismatch' | 'unstamped';
  found: string | null;
  appliedAt: Date | null;
};

export type SchemaState =
  | { kind: 'current' }
  /** A database with no Studio tables and no fingerprint: never provisioned. */
  | { kind: 'absent' }
  | StaleSchema;

export type SchemaProblem = Exclude<SchemaState, { kind: 'current' }>;

/**
 * Read-only verdict; application lives in scripts/apply.ts. A problem is
 * returned rather than thrown so callers can tell a verdict from a connection
 * failure: anything this throws is transient, and everything it returns is an
 * answer.
 */
export async function checkSchema(pool: pg.Pool): Promise<SchemaState> {
  const probe = await pool.query<{ stamped: boolean; tables: boolean }>(
    `select to_regclass('"schemaFingerprint"') is not null as stamped,
            ${SCHEMA_TABLES.map(
              (table) => `to_regclass('"${table}"') is not null`,
            ).join(' or ')} as tables`,
  );
  const { stamped, tables } = probe.rows[0] ?? {
    stamped: false,
    tables: false,
  };

  if (stamped) {
    const recorded = await pool.query<{
      fingerprint: string;
      appliedAt: Date;
    }>('select "fingerprint", "appliedAt" from "schemaFingerprint"');
    const row = recorded.rows[0];
    if (row) {
      if (row.fingerprint !== SCHEMA_FINGERPRINT) {
        return {
          kind: 'stale',
          reason: 'mismatch',
          found: row.fingerprint,
          appliedAt: row.appliedAt,
        };
      }
      return { kind: 'current' };
    }
  }

  // Tables but no fingerprint: adopting it would launder exactly the
  // staleness this exists to catch.
  if (tables) {
    return { kind: 'stale', reason: 'unstamped', found: null, appliedAt: null };
  }

  return { kind: 'absent' };
}

export async function stampFingerprint(
  db: pg.Pool | pg.PoolClient,
  fingerprint: string,
): Promise<void> {
  await db.query(
    `insert into "schemaFingerprint" ("fingerprint") values ($1)
     on conflict ("id") do update set "fingerprint" = excluded."fingerprint", "appliedAt" = CURRENT_TIMESTAMP`,
    [fingerprint],
  );
}

/**
 * Which set of remedies the reader can actually run.
 *
 * A message is only as useful as its next step, and the two lanes have
 * different ones: a repository checkout has `pnpm --filter …` scripts and
 * drizzle-kit, and a deployment has neither — it has the `studio-api` image
 * and the `migrate` command in it (#1909). Printing the checkout's scripts to
 * a container log tells an operator to run something that is not there.
 *
 * Passed in rather than inferred, and with no default, so every caller decides
 * which reader it is printing for.
 */
export type SchemaRemedyLane = 'development' | 'deployed';

function staleDetail(state: StaleSchema): string {
  return state.reason === 'unstamped'
    ? 'The database carries Studio tables but no fingerprint, so the SQL that built it is unknown.'
    : `Expected ${SCHEMA_FINGERPRINT.slice(0, 12)}, found ${state.found?.slice(0, 12)} recorded ${state.appliedAt?.toISOString()}.`;
}

/**
 * Why a deployment will not touch a database another build created, and what
 * to do instead.
 *
 * Here rather than beside `migrate` because both readers need the same words:
 * `studio-api migrate` refuses with this, and every process that boots against
 * such a database refuses with it too. Pre-release there is no reconciliation
 * to offer — there are no databases worth adopting and no migrations to run —
 * so the remedy is to recreate, and #1901 is the issue that changes that.
 */
export function staleDatabaseMessage(state: StaleSchema): string {
  return [
    'The database was not created by this build.',
    staleDetail(state),
    'Studio is pre-release and has no migration system yet, so a build cannot upgrade a database another build created (#1901).',
    'Recreate the database and run migrate against it again, or wait for the migration system.',
  ].join('\n');
}

export function schemaProblemMessage(
  state: SchemaProblem,
  lane: SchemaRemedyLane,
): string {
  if (state.kind === 'absent') {
    return [
      'The database has no Studio schema.',
      'Create it and start again:',
      ...(lane === 'deployed'
        ? [
            '  docker compose run --rm migrate    (the reference stack)',
            '  studio-api migrate                 (a container you run yourself)',
          ]
        : [
            '  pnpm --filter @codaco/studio-server db:reset        (local development)',
            '  pnpm --filter @codaco/studio-server apply-schema    (a database from a checkout)',
          ]),
    ].join('\n');
  }

  // A deployment gets the refusal `migrate` itself prints, word for word: the
  // two are the same verdict about the same database, and an operator reading
  // one after the other must not have to work out whether they mean the same
  // thing.
  if (lane === 'deployed') return staleDatabaseMessage(state);

  return [
    'The database was not built from the schema in this build.',
    staleDetail(state),
    'Studio has no migration system yet: pre-release, drizzle-kit push reconciles the schema in place, or recreate the database.',
    'Then start again:',
    '  pnpm --filter @codaco/studio-server apply-schema    (reconcile in place)',
    '  pnpm --filter @codaco/studio-server db:reset        (recreate)',
  ].join('\n');
}

/**
 * `checkSchema` and `stampFingerprint`, as Effects on a client.
 *
 * Both shapes exist on purpose and neither is a wrapper of the other. The
 * node-postgres pair above is what `scripts/apply.ts`, `apply-schema.ts` and
 * `db-reset.ts` run: drizzle-kit's `pushSchema` takes a node-postgres handle
 * and has no Effect driver, so a checkout lane without node-postgres is not
 * available at any price. The Effect pair below is what the deployed
 * `studio-api migrate` runs, because that process carries no `pg` at all.
 *
 * They read and write the same two statements. `db/__tests__/migrate.test.ts`
 * applies through the Effect pair and reads the result back through the
 * node-postgres `checkSchema`, so both are held to the same databases.
 */
export const checkSchemaEffect = Effect.fn('db.checkSchema')(function* (
  client: SqlClient.SqlClient,
) {
  const probe = yield* client.unsafe<{ stamped: boolean; tables: boolean }>(
    `select to_regclass('"schemaFingerprint"') is not null as stamped,
            ${SCHEMA_TABLES.map(
              (table) => `to_regclass('"${table}"') is not null`,
            ).join(' or ')} as tables`,
  );
  const { stamped, tables } = probe[0] ?? { stamped: false, tables: false };

  if (stamped) {
    const recorded = yield* client.unsafe<{
      fingerprint: string;
      appliedAt: Date | number;
    }>('select "fingerprint", "appliedAt" from "schemaFingerprint"');
    const row = recorded[0];
    if (row) {
      if (row.fingerprint !== SCHEMA_FINGERPRINT) {
        return {
          kind: 'stale',
          reason: 'mismatch',
          found: row.fingerprint,
          // Converted at the seam: this is a raw read, and on
          // `@effect/sql-pg` 4.0.0-rc.115 a `timestamptz` arrives as epoch
          // milliseconds rather than a `Date` (#1927 §20 Q6, fallback A).
          // rc.116's #8241 removes the need for this line, not the line's
          // correctness.
          appliedAt: new Date(row.appliedAt),
        } satisfies StaleSchema;
      }
      return { kind: 'current' } satisfies SchemaState;
    }
  }

  if (tables) {
    return {
      kind: 'stale',
      reason: 'unstamped',
      found: null,
      appliedAt: null,
    } satisfies StaleSchema;
  }

  return { kind: 'absent' } satisfies SchemaState;
});

export const stampFingerprintEffect = Effect.fn('db.stampFingerprint')(
  function* (client: SqlClient.SqlClient, fingerprint: string) {
    yield* client.unsafe(
      `insert into "schemaFingerprint" ("fingerprint") values ($1)
       on conflict ("id") do update set "fingerprint" = excluded."fingerprint", "appliedAt" = CURRENT_TIMESTAMP`,
      [fingerprint],
    );
  },
);
