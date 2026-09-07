import { getTableName, sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type pg from 'pg';

import {
  assertSafePostgresMigrationEvidence,
  UnsafePostgresMigrationEvidenceError,
} from '@codaco/studio-sync/postgres-migration-evidence';
import { SYNC_SIDECAR_SQL, SYNC_TABLES } from '@codaco/studio-sync/schema';

import { ASSET_SIDECAR_SQL, ASSET_TABLES } from '../asset/schema.ts';
import { AUDIT_SIDECAR_SQL, AUDIT_TABLES } from '../audit/schema.ts';
import { CONSENT_SIDECAR_SQL, CONSENT_TABLES } from '../consent/schema.ts';
import {
  EXPERIMENT_SIDECAR_SQL,
  EXPERIMENT_TABLES,
} from '../experiment/schema.ts';
import { FEEDBACK_SIDECAR_SQL, FEEDBACK_TABLES } from '../feedback/schema.ts';
import { INSTANCE_SIDECAR_SQL, INSTANCE_TABLES } from '../instance/schema.ts';
import {
  MONITORING_SIDECAR_SQL,
  MONITORING_TABLES,
} from '../monitoring/schema.ts';
import { NETWORK_SIDECAR_SQL, NETWORK_TABLES } from '../network/schema.ts';
import { PII_SIDECAR_SQL, PII_TABLES } from '../pii/schema.ts';
import { PROTOCOL_SIDECAR_SQL, PROTOCOL_TABLES } from '../protocol/schema.ts';
import { SCHEDULE_SIDECAR_SQL, SCHEDULE_TABLES } from '../schedule/schema.ts';
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
import {
  ACCESS_SIDECAR_SQL,
  FINGERPRINT_ACCESS_SIDECAR_SQL,
} from './access.ts';
import { AUTH_TABLES } from './auth-schema.ts';
import { BACKUP_ACCESS_SIDECAR_SQL } from './backup-access.ts';
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
  ...PII_TABLES,
  ...INSTANCE_TABLES,
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
  FINGERPRINT_ACCESS_SIDECAR_SQL,
  PROTOCOL_SIDECAR_SQL,
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
  PII_SIDECAR_SQL,
  INSTANCE_SIDECAR_SQL,
  BACKUP_ACCESS_SIDECAR_SQL,
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
  reason: 'mismatch' | 'unsafe-evidence' | 'unstamped' | 'unversioned';
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
 * Read-only verdict; deployment application lives in migrations/migrate.ts. A problem is
 * returned rather than thrown so callers can tell a verdict from a connection
 * failure: anything this throws is transient, and everything it returns is an
 * answer.
 */
export async function checkSchema(
  pool: pg.Pool | pg.PoolClient,
  options: { allowUnversioned?: boolean } = {},
): Promise<SchemaState> {
  const probe = await pool.query<{
    fingerprintSchema: string;
    stamped: boolean;
    tables: boolean;
    versioned: boolean;
  }>(
    `select coalesce(fingerprint_namespace.nspname, current_schema(), 'public')
              as "fingerprintSchema",
            fingerprint.oid is not null as stamped,
            ${SCHEMA_TABLES.map(
              (table) => `to_regclass('"${table}"') is not null`,
            ).join(' or ')} as tables,
            EXISTS (
              SELECT 1 FROM pg_class relation
              JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
              WHERE namespace.nspname = 'studio_migrations'
                AND relation.relname = 'history' AND relation.relkind = 'r'
            ) AS versioned
       from (select to_regclass('"schemaFingerprint"')::oid as oid) fingerprint
       left join pg_class fingerprint_relation
         on fingerprint_relation.oid = fingerprint.oid
       left join pg_namespace fingerprint_namespace
         on fingerprint_namespace.oid = fingerprint_relation.relnamespace`,
  );
  const { fingerprintSchema, stamped, tables, versioned } = probe.rows[0] ?? {
    fingerprintSchema: 'public',
    stamped: false,
    tables: false,
    versioned: false,
  };

  try {
    await assertSafePostgresMigrationEvidence(pool, {
      history: { schema: 'studio_migrations', name: 'history' },
      fingerprint: { schema: fingerprintSchema, name: 'schemaFingerprint' },
    });
  } catch (error) {
    if (!(error instanceof UnsafePostgresMigrationEvidenceError)) throw error;
    return {
      kind: 'stale',
      reason: 'unsafe-evidence',
      found: null,
      appliedAt: null,
    };
  }

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
      // Runtime roles may inspect catalogs but have no USAGE or SELECT on
      // migration history. A development stamp alone is not deployment
      // provenance; only the explicitly resolved development lane accepts it.
      if (!options.allowUnversioned && !versioned) {
        return {
          kind: 'stale',
          reason: 'unversioned',
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

export function schemaProblemMessage(state: SchemaProblem): string {
  if (state.kind === 'absent') {
    return [
      'The database has no Studio schema.',
      'Create it and start again:',
      '  pnpm --filter @codaco/studio-server db:reset        (local development)',
      '  docker compose run --rm studio migrate             (a deployed database)',
    ].join('\n');
  }

  if (state.reason === 'unsafe-evidence') {
    return [
      'The database migration evidence has an unsupported relation shape.',
      'Preserve the original database and its encryption keys. Restore a verified backup before starting Studio or applying migrations.',
      'See apps/studio/MIGRATIONS.md for recovery and replacement procedures.',
    ].join('\n');
  }

  if (state.reason === 'unstamped' || state.reason === 'unversioned') {
    return [
      state.reason === 'unversioned'
        ? 'The database carries a Studio schema fingerprint but no versioned migration history.'
        : 'The database carries Studio tables but no fingerprint, so the SQL that built it is unknown.',
      'Preserve the original database and its encryption keys. The migration command cannot adopt this database.',
      'For a previously versioned installation, restore a consistent backup that includes its migration history and fingerprint.',
      'For an unversioned pre-release installation, export using its original Studio build, then set up a new empty database and import the supported exports.',
      'See apps/studio/MIGRATIONS.md for recovery and replacement procedures.',
      'Only for a disposable local development database:',
      '  pnpm --filter @codaco/studio-server db:reset        (deletes existing data)',
    ].join('\n');
  }

  return [
    'The database was not built from the schema in this build.',
    `Expected ${SCHEMA_FINGERPRINT.slice(0, 12)}, found ${state.found?.slice(0, 12)} recorded ${state.appliedAt?.toISOString()}.`,
    'Back up the database and its encryption keys, then run the explicit migration command. Databases without migration history are not adopted automatically.',
    'Then start again:',
    '  docker compose run --rm studio migrate             (apply versioned migrations)',
    '  pnpm --filter @codaco/studio-server db:reset        (recreate)',
  ].join('\n');
}
