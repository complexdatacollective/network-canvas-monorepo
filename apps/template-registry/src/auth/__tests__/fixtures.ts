import { randomBytes, randomUUID } from 'node:crypto';

import {
  generateDrizzleJson,
  generateMigration,
} from 'drizzle-kit/api-postgres';
import { escapeIdentifier } from 'pg';

import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { REGISTRY_AUTH_TABLES } from '../schema.ts';
import {
  createRegistryAuth,
  type RegistryAuthOptions,
  type RegistryAuthDiagnostic,
} from '../service.ts';

export const REGISTRY_ORIGIN = 'https://registry.test';

// Public disposable-Postgres defaults shared by the repository's DB suites.
// oxlint-disable-next-line node/no-process-env -- this test fixture owns its database boundary
const port = Number(process.env.PGPORT ?? 54318);
const databaseUrl = `postgres://postgres:spike@127.0.0.1:${port}/postgres`;

export async function createAuthFixture() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  const database = `registry_auth_test_${suffix}`;
  const role = `registry_auth_test_${suffix}`;
  const onIdleError = () => undefined;
  const admin = createPostgresPool({
    connectionString: databaseUrl,
    max: 2,
    onIdleError,
  });
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  const owner = createPostgresPool({
    connectionString: url.toString(),
    max: 2,
    onIdleError,
  });
  const pool = createPostgresPool({
    connectionString: url.toString(),
    role,
    max: 4,
    onIdleError,
    roleMismatchCode: 'REGISTRY_DATABASE_ROLE_MISMATCH',
  });
  const dispose = async () => {
    await Promise.all([pool.end(), owner.end()]);
    try {
      await admin.query(
        `DROP DATABASE IF EXISTS ${escapeIdentifier(database)} WITH (FORCE)`,
      );
      await admin.query(`DROP ROLE IF EXISTS ${escapeIdentifier(role)}`);
    } finally {
      await admin.end();
    }
  };

  try {
    await admin.query(`CREATE DATABASE ${escapeIdentifier(database)}`);
    await admin.query(
      `CREATE ROLE ${escapeIdentifier(role)} NOLOGIN NOSUPERUSER NOBYPASSRLS`,
    );
    await admin.query(
      `GRANT ${escapeIdentifier(role)} TO CURRENT_USER WITH SET TRUE`,
    );
    const statements = await generateMigration(
      await generateDrizzleJson({}),
      await generateDrizzleJson(REGISTRY_AUTH_TABLES),
    );
    await owner.query(statements.join('\n'));
    await owner.query(
      `GRANT USAGE ON SCHEMA public TO ${escapeIdentifier(role)}`,
    );
    await owner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${escapeIdentifier(role)}`,
    );
  } catch (error) {
    await dispose();
    throw error;
  }

  const sent: { email: string; url: string }[] = [];
  const diagnostics: RegistryAuthDiagnostic[] = [];
  const options: RegistryAuthOptions = {
    pool,
    baseUrl: REGISTRY_ORIGIN,
    secret: randomBytes(32).toString('hex'),
    sendMagicLink: async (input) => {
      sent.push(input);
    },
    onDiagnostic: (code) => diagnostics.push(code),
  };
  const createAuth = (
    overrides: Partial<
      Pick<RegistryAuthOptions, 'sendMagicLink' | 'onDiagnostic'>
    > = {},
  ) => createRegistryAuth({ ...options, ...overrides });
  return {
    owner,
    pool,
    role,
    options,
    sent,
    diagnostics,
    createAuth,
    auth: createAuth(),
    dispose,
  };
}

export type AuthFixture = Awaited<ReturnType<typeof createAuthFixture>>;
