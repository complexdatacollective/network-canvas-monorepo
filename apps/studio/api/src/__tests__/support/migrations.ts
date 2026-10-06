import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { readMigrationsDocument } from '../../../scripts/render-migrations.ts';
import {
  type DocumentMigration,
  EXECUTED_ARTEFACTS,
  hashArtefacts,
  migrationVersion,
  type MigrationsDocument,
  SNAPSHOT_ARTEFACT,
  type VerifiedMigrations,
  verifyMigrations,
} from '../../db/migrations-document.ts';
import { createOwnerPool } from '../../db/pool.ts';
import type { DbEnv } from '../../env.ts';

/**
 * The committed `migrations/` directory, read by the same code the build
 * renders `dist/migrations.json` with, so what a suite migrates is exactly what
 * an image ships.
 */
export function committedDocument(): MigrationsDocument {
  return readMigrationsDocument();
}

export function committedMigrations(): VerifiedMigrations {
  return verifyMigrations(committedDocument());
}

export type SyntheticMigration = {
  readonly slug: string;
  readonly delta?: string;
  readonly backfill?: string;
  /** Defaults to the previous migration's sidecars, unchanged. */
  readonly sidecars?: string;
  /** The schema this migration brings the database to; also the document's. */
  readonly fingerprint: string;
};

/**
 * A document with `extra` appended, hashed and numbered exactly as
 * `migrate:generate` would, so a suite can exercise a second release without
 * committing one. The snapshot is a stand-in: only its hash travels.
 */
export function withMigrations(
  document: MigrationsDocument,
  ...extra: readonly SyntheticMigration[]
): MigrationsDocument {
  const migrations: DocumentMigration[] = [...document.migrations];
  for (const migration of extra) {
    const previous = migrations.at(-1);
    const sidecars =
      migration.sidecars ??
      previous?.artefacts.find(({ name }) => name === 'sidecars.sql')?.sql ??
      '';
    const contents: Record<string, string> = {
      'delta.sql': migration.delta ?? '',
      ...(migration.backfill === undefined
        ? {}
        : { 'backfill.sql': migration.backfill }),
      'sidecars.sql': sidecars,
      [SNAPSHOT_ARTEFACT]: `{"synthetic":"${migration.slug}"}`,
    };
    const ordinal = migrations.length + 1;
    const version = migrationVersion(ordinal, migration.slug);
    const { artefacts, combined } = hashArtefacts(contents);
    migrations.push({
      version,
      ordinal,
      artefacts: EXECUTED_ARTEFACTS.filter((name) => name in contents).map(
        (name) => ({ name, sql: contents[name] ?? '' }),
      ),
      manifest: {
        version,
        ordinal,
        fingerprint: migration.fingerprint,
        drops: [],
        artefacts,
        combined,
      },
    });
  }
  return {
    fingerprint:
      migrations.at(-1)?.manifest.fingerprint ?? document.fingerprint,
    migrations,
  };
}

/**
 * The login the runner and convergence suites connect as: `NOSUPERUSER
 * CREATEROLE`, the shape of a managed Postgres owner (#1901 S-2), where every
 * tenant table's FORCEd policy binds the owner too. Cluster-wide and shared by
 * every run, so it is created once and never dropped. It holds ADMIN on the two
 * application roles because, in a real deployment, it is the login that
 * created them.
 */
const TEST_OWNER = 'studio_test_migrate_owner';

/** A local test cluster's fixture credential, never a deployment's. */
const TEST_OWNER_PASSWORD = 'studio-test-migrate-owner';

const OWNER_BOOTSTRAP_LOCK_KEY = 4021775688147131;

const ensureOwnerSql = `
DO $$ DECLARE conflicting_constraint text;
BEGIN
  PERFORM pg_advisory_xact_lock(${OWNER_BOOTSTRAP_LOCK_KEY});
  BEGIN
    CREATE ROLE ${TEST_OWNER} LOGIN NOSUPERUSER CREATEROLE NOBYPASSRLS PASSWORD '${TEST_OWNER_PASSWORD}';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS conflicting_constraint = CONSTRAINT_NAME;
      IF conflicting_constraint <> 'pg_authid_rolname_index' THEN RAISE; END IF;
  END;
  ALTER ROLE ${TEST_OWNER} LOGIN NOSUPERUSER CREATEROLE NOBYPASSRLS PASSWORD '${TEST_OWNER_PASSWORD}';
  GRANT ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance} TO ${TEST_OWNER} WITH ADMIN OPTION;
END $$;
`;

export type OwnedScratchDatabase = {
  /** Connected as `TEST_OWNER`, the database's owner. */
  readonly db: DbEnv;
  readonly pool: pg.Pool;
  /** Connected as the cluster's superuser, for oracles the owner cannot run. */
  readonly admin: pg.Pool;
  /** The same database as the cluster's superuser, for code that takes a URL. */
  readonly adminDb: DbEnv;
  readonly dispose: () => Promise<void>;
};

/**
 * An empty database owned by `TEST_OWNER`. The application roles must already
 * exist on the cluster: `reachableDb()` creates them.
 */
export async function createOwnedScratchDatabase(
  db: DbEnv,
): Promise<OwnedScratchDatabase> {
  const name = `studio_test_db_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const cluster = createOwnerPool(db);
  try {
    await cluster.query(ensureOwnerSql);
    await cluster.query(
      `create database ${pg.escapeIdentifier(name)} owner ${TEST_OWNER}`,
    );
  } finally {
    await cluster.end();
  }

  const urlAs = (user: string | null, password: string | null) => {
    const url = new URL(db.url);
    url.pathname = `/${name}`;
    if (user !== null) url.username = user;
    if (password !== null) url.password = password;
    return url.toString();
  };
  const owned = { url: urlAs(TEST_OWNER, TEST_OWNER_PASSWORD) };
  const pool = createOwnerPool(owned);
  const adminDb = { url: urlAs(null, null) };
  const admin = createOwnerPool(adminDb);

  return {
    db: owned,
    pool,
    admin,
    adminDb,
    dispose: async () => {
      await pool.end();
      await admin.end();
      const cleanup = createOwnerPool(db);
      try {
        await cleanup.query(
          `drop database if exists ${pg.escapeIdentifier(name)} with (force)`,
        );
      } finally {
        await cleanup.end();
      }
    },
  };
}
