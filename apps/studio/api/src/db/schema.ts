import { getTableName, sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { Effect } from 'effect';
import type { SqlClient } from 'effect/sql';
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

/** The two ways a deployment runs `migrate`; a checkout has neither. */
const MIGRATE_COMMANDS = [
  '  docker compose run --rm migrate    (the reference stack)',
  '  studio-api migrate                 (a container you run yourself)',
];

/**
 * What a deployment says about a database whose schema another build stamped,
 * and what brings it up to date.
 *
 * Here rather than beside `migrate` because more than one reader needs the
 * same words: a deployed `api` or `worker` logs this while it waits closed for
 * the schema (`platform/schema-gate.ts`), and an operator who reads it and then
 * runs `migrate` must not have to work out whether the two describe the same
 * database. `migrate` is the remedy, so a database it cannot upgrade — history
 * it did not write, or a newer build's — is answered by the refusal `migrate`
 * prints, which this points to rather than repeats.
 */
export function staleDatabaseMessage(state: StaleSchema): string {
  return [
    'The database schema is not this build’s.',
    staleDetail(state),
    'Run migrate from this build’s image to bring it up to date:',
    ...MIGRATE_COMMANDS,
    'If migrate refuses, follow the remedy it prints.',
  ].join('\n');
}

export function schemaProblemMessage(
  state: SchemaProblem,
  lane: SchemaRemedyLane,
): string {
  if (state.kind === 'absent') {
    return [
      'The database has no Studio schema.',
      ...(lane === 'deployed'
        ? [
            'Run migrate from this build’s image to create it:',
            ...MIGRATE_COMMANDS,
          ]
        : [
            'Create it and start again:',
            '  pnpm --filter @codaco/studio-api db:reset        (local development)',
            '  pnpm --filter @codaco/studio-api apply-schema    (a database from a checkout)',
          ]),
    ].join('\n');
  }

  if (lane === 'deployed') return staleDatabaseMessage(state);

  return [
    'The database was not built from the schema in this build.',
    staleDetail(state),
    'In a checkout, apply-schema reconciles a development database in place and db:reset recreates it; a database carrying migration history is upgraded by migrate instead.',
    'Then start again:',
    '  pnpm --filter @codaco/studio-api apply-schema    (reconcile in place)',
    '  pnpm --filter @codaco/studio-api db:reset        (recreate)',
  ].join('\n');
}

/**
 * Not a wrapper of the node-postgres pair above: drizzle-kit's `pushSchema`
 * needs node-postgres, and the deployed `studio-api migrate` carries no `pg`.
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
      appliedAt: Date;
    }>('select "fingerprint", "appliedAt" from "schemaFingerprint"');
    const row = recorded[0];
    if (row) {
      if (row.fingerprint !== SCHEMA_FINGERPRINT) {
        return {
          kind: 'stale',
          reason: 'mismatch',
          found: row.fingerprint,
          appliedAt: row.appliedAt,
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
