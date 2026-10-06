import { and, eq, sql } from 'drizzle-orm';
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
    // What the worker's daily update check last read from the release manifest
    // (#1901). Written by `recordUpdateCheck` alone; the four `latest_*` columns
    // are one fact and move together. NULL until a check has succeeded.
    latestVersion: text('latest_version'),
    latestReleasedAt: timestamp('latest_released_at', { withTimezone: true }),
    latestNotesUrl: text('latest_notes_url'),
    latestSchemaChange: boolean('latest_schema_change'),
    // When a check last succeeded, whether or not it found anything new.
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    // The version the owner has been emailed about, or is being emailed about:
    // `claimNotification` sets it before the send, which is what makes the
    // email once per version. Cleared again when the send did not happen.
    notifiedVersion: text('notified_version'),
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
    check(
      'deployment_state_latest_release_check',
      sql`(${table.latestVersion} IS NULL) = (${table.latestReleasedAt} IS NULL)
          AND (${table.latestVersion} IS NULL) = (${table.latestNotesUrl} IS NULL)
          AND (${table.latestVersion} IS NULL) = (${table.latestSchemaChange} IS NULL)
          AND (${table.latestVersion} IS NULL
               OR ${table.latestVersion} ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$')
          AND (${table.latestNotesUrl} IS NULL OR ${table.latestNotesUrl} ~ '^https://')`,
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

const RELEASE_COLUMNS = {
  version: deploymentState.latestVersion,
  releasedAt: deploymentState.latestReleasedAt,
  notesUrl: deploymentState.latestNotesUrl,
  schemaChange: deploymentState.latestSchemaChange,
};

/** The newest release the daily update check has recorded (#1901). */
export type LatestRelease = {
  readonly version: string;
  readonly releasedAt: Date;
  readonly notesUrl: string;
  readonly schemaChange: boolean;
};

const theRow = <Row>(rows: ReadonlyArray<Row>) =>
  rows[0] === undefined
    ? Effect.die(new Error('deployment_state has no row'))
    : Effect.succeed(rows[0]);

/**
 * Bounded on the server: a caller that gives up interrupts its fiber, not the
 * statement queued behind a migration's lock.
 */
const READ_STATEMENT_TIMEOUT = '1s';

/**
 * The flag and the release are two reads, each selecting only its own columns.
 * A new image's api boots against the older schema between `up -d` and
 * `migrate`; if the flag read named the `latest_*` columns, a release that
 * added or renamed one would make the flag unreadable exactly when the window
 * is open, and the gate would report the schema instead of the maintenance
 * window (#1901). The flag read must depend on nothing a later release can
 * change.
 */
const readFlag = Effect.fn('db.deploymentState.read')(function* () {
  const { tx, sql: client } = yield* Transaction;
  yield* client`select set_config('statement_timeout', ${READ_STATEMENT_TIMEOUT}, true)`;
  const rows = yield* tx
    .select(STATE_COLUMNS)
    .from(deploymentState)
    .where(eq(deploymentState.id, 1));
  return yield* theRow(rows);
}, sqlErrorsOnly);

const readRelease = Effect.fn('db.deploymentState.readLatestRelease')(
  function* () {
    const { tx, sql: client } = yield* Transaction;
    yield* client`select set_config('statement_timeout', ${READ_STATEMENT_TIMEOUT}, true)`;
    const rows = yield* tx
      .select(RELEASE_COLUMNS)
      .from(deploymentState)
      .where(eq(deploymentState.id, 1));
    return yield* theRow(rows);
  },
  sqlErrorsOnly,
);

type Release = Effect.Success<ReturnType<typeof readRelease>>;

/** Null until a check has recorded a release; the four columns move together. */
const releaseOf = (release: Release): LatestRelease | null =>
  release.version === null ||
  release.releasedAt === null ||
  release.notesUrl === null ||
  release.schemaChange === null
    ? null
    : {
        version: release.version,
        releasedAt: release.releasedAt,
        notesUrl: release.notesUrl,
        schemaChange: release.schemaChange,
      };

export const readDeploymentState = (): Effect.Effect<
  DeploymentState,
  SqlError.SqlError,
  Database
> => UntenantedScope.open(readFlag());

export const readDeploymentStateAsMaintenance = (): Effect.Effect<
  DeploymentState,
  SqlError.SqlError,
  MaintenanceDatabase
> => MaintenanceScope.open(readFlag());

/**
 * What the worker's update check last recorded, or null when it has recorded
 * nothing yet (a fresh instance, or one whose manifest has never been
 * reachable). Read by the application role, bounded like `readDeploymentState`.
 */
export const readLatestRelease = (): Effect.Effect<
  LatestRelease | null,
  SqlError.SqlError,
  Database
> => Effect.map(UntenantedScope.open(readRelease()), releaseOf);

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

/**
 * Record what the manifest said. Touches the `latest_*` columns and
 * `checked_at` and nothing else: the maintenance flag, its reason and
 * `updated_at` (which dates the flag) are not this write's to move.
 */
export const recordUpdateCheck: (
  release: LatestRelease,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'db.deploymentState.recordUpdateCheck',
)(function* (release: LatestRelease) {
  const { tx } = yield* Transaction;
  yield* tx
    .update(deploymentState)
    .set({
      latestVersion: release.version,
      latestReleasedAt: release.releasedAt,
      latestNotesUrl: release.notesUrl,
      latestSchemaChange: release.schemaChange,
      checkedAt: sql`now()`,
    })
    .where(eq(deploymentState.id, 1));
}, sqlErrorsOnly);

/**
 * Take the right to email the owner about `version`. True exactly once per
 * version: the row is claimed only when it does not already name this version,
 * and the `RETURNING` is what says whether this call was the one that did.
 */
export const claimNotification: (
  version: string,
) => Effect.Effect<boolean, SqlError.SqlError, Transaction> = Effect.fn(
  'db.deploymentState.claimNotification',
)(function* (version: string) {
  const { tx } = yield* Transaction;
  const rows = yield* tx
    .update(deploymentState)
    .set({ notifiedVersion: version })
    .where(
      and(
        eq(deploymentState.id, 1),
        sql`${deploymentState.notifiedVersion} IS DISTINCT FROM ${version}`,
      ),
    )
    .returning({ notifiedVersion: deploymentState.notifiedVersion });
  return rows.length === 1;
}, sqlErrorsOnly);

/**
 * Give a claim back because the email was not sent. Compare-and-reset: only a
 * row still naming `version` is cleared, so it cannot undo a later claim. NULL
 * rather than the version before it is equivalent, because only the latest
 * version is ever claimed.
 */
export const releaseNotificationClaim: (
  version: string,
) => Effect.Effect<void, SqlError.SqlError, Transaction> = Effect.fn(
  'db.deploymentState.releaseNotificationClaim',
)(function* (version: string) {
  const { tx } = yield* Transaction;
  yield* tx
    .update(deploymentState)
    .set({ notifiedVersion: null })
    .where(
      and(
        eq(deploymentState.id, 1),
        eq(deploymentState.notifiedVersion, version),
      ),
    );
}, sqlErrorsOnly);
