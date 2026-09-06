import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { escapeIdentifier, Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { createBetterAuthInstance } from '../../auth/better-auth.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import {
  createMaintenancePool,
  createOwnerPool,
  createPool,
} from '../../db/pool.ts';
import { readEnv } from '../../env.ts';
import {
  initializeCredentialMigration,
  initializeEncryption,
} from '../initialize.ts';
import { migrateLegacyOAuthBatch } from '../maintenance.ts';
import { runEncryptionCommand } from '../operator.ts';
import { ProtectedDataError } from '../protection.ts';
import { configuration, encryptionEnvironment, rootOne } from './fixtures.ts';

const database = await reachableDb();
const environment = readEnv();
const history = await readMigrations(
  fileURLToPath(new URL('../../../migrations', import.meta.url)),
);
const password = 'isolated-legacy-operator-test';
const accountId = 'legacy-account';
const userId = 'legacy-researcher';
const columns = ['accessToken', 'refreshToken', 'idToken'] as const;
const tokenCanary = 'synthetic-retained-credential-canary';

async function withDeployment(
  field: (typeof columns)[number],
  run: (fixture: {
    administrator: Pool;
    operator: Pool;
    rawRuntime: Pool;
    app: Pool;
    maintenance: Pool;
    operatorName: string;
    runtimeName: string;
    operatorUrl: URL;
    runtimeUrl: URL;
    keys: Awaited<ReturnType<typeof initializeCredentialMigration>>;
  }) => Promise<void>,
) {
  if (!database) throw new Error('An isolated local database is required.');
  const scratch = await createScratchDatabase(database);
  const suffix = randomUUID().replaceAll('-', '');
  const operatorName = `legacy-operator-${suffix}`;
  const runtimeName = `legacy-runtime-${suffix}`;
  const administrator = createOwnerPool(database);
  const pools: Pool[] = [];
  try {
    for (const role of [operatorName, runtimeName]) {
      await administrator.query(
        `CREATE ROLE ${escapeIdentifier(role)} LOGIN NOINHERIT NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS NOREPLICATION PASSWORD '${password}'`,
      );
      await administrator.query(
        `GRANT studio_app, studio_maintenance TO ${escapeIdentifier(role)} WITH SET TRUE, INHERIT FALSE`,
      );
    }
    const allowedLogins = await enrollMigrationTestDatabase(
      scratch.pool,
      database,
      [operatorName, runtimeName],
    );
    const databaseName = decodeURIComponent(
      new URL(scratch.db.url).pathname.slice(1),
    );
    // Distinct enrolled database owner and migration operator: the operator
    // owns the tables it authors, and has no superuser or inherited authority.
    await scratch.pool
      .query(`GRANT CREATE ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(operatorName)};
      GRANT CREATE, USAGE ON SCHEMA public TO ${escapeIdentifier(operatorName)}`);
    const operatorUrl = new URL(scratch.db.url);
    operatorUrl.username = operatorName;
    operatorUrl.password = password;
    const runtimeUrl = new URL(operatorUrl);
    runtimeUrl.username = runtimeName;
    const operator = createOwnerPool({ url: operatorUrl.href });
    const rawRuntime = createOwnerPool({ url: runtimeUrl.href });
    const app = createPool({ url: runtimeUrl.href });
    const maintenance = createMaintenancePool({ url: runtimeUrl.href });
    pools.push(operator, rawRuntime, app, maintenance);
    await migrateDatabase(
      operator,
      [history[0]!],
      history[0]!.manifest.fingerprint,
      allowedLogins,
    );
    await operator.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Synthetic researcher', 'legacy@example.test', true)`,
      [userId],
    );
    await operator.query(
      `INSERT INTO account (id, "userId", "accountId", "providerId", issuer, ${escapeIdentifier(field)}, "updatedAt") VALUES ($1, $2, $1, 'google', 'https://accounts.google.com', $3, now())`,
      [accountId, userId, tokenCanary],
    );
    await migrateDatabase(operator, history, SCHEMA_FINGERPRINT, allowedLogins);
    const keys = await initializeCredentialMigration({
      maintenancePool: maintenance,
      configuration: configuration(),
      loadRootKey: async () => rootOne,
    });
    await run({
      administrator: scratch.pool,
      operator,
      rawRuntime,
      app,
      maintenance,
      operatorName,
      runtimeName,
      operatorUrl,
      runtimeUrl,
      keys,
    });
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    await scratch.dispose();
    await administrator.query(
      `DROP ROLE IF EXISTS ${escapeIdentifier(operatorName)}, ${escapeIdentifier(runtimeName)}`,
    );
    await administrator.end();
  }
}

describe('operator-only retained OAuth credentials', () => {
  it.each(columns)(
    'keeps retained %s unavailable to the enrolled runtime while the ordinary operator can convert it',
    async (field) => {
      await withDeployment(
        field,
        async ({ operator, rawRuntime, app, maintenance, keys }) => {
          const client = await rawRuntime.connect();
          try {
            for (const role of ['NONE', 'studio_app', 'studio_maintenance']) {
              await client.query(`SET ROLE ${role}`);
              for (const column of [...columns.map(escapeIdentifier), '*']) {
                await expect(
                  client.query(`SELECT ${column} FROM account`),
                ).rejects.toMatchObject({ code: '42501' });
              }
              await expect(
                client.query(
                  `SELECT id FROM account WHERE ${escapeIdentifier(field)} = $1`,
                  [tokenCanary],
                ),
              ).rejects.toMatchObject({ code: '42501' });
            }
          } finally {
            await client.query('SET ROLE NONE');
            client.release();
          }
          for (const pool of [rawRuntime, app, maintenance]) {
            await expect(
              migrateLegacyOAuthBatch(pool, keys, { limit: 1 }),
            ).rejects.toThrow(ProtectedDataError);
          }
          expect(
            (
              await maintenance.query(
                'SELECT legacy_tokens_present FROM account',
              )
            ).rows,
          ).toEqual([{ legacy_tokens_present: true }]);
          await expect(
            maintenance.query(
              'UPDATE account SET legacy_tokens_present = false',
            ),
          ).rejects.toMatchObject({ code: '428C9' });
          await expect(
            initializeEncryption({
              maintenancePool: maintenance,
              configuration: configuration(),
              loadRootKey: async () => rootOne,
            }),
          ).rejects.toThrow('Encryption key verification failed');
          if (!environment.auth)
            throw new Error('Synthetic authentication settings are required.');
          for (const pool of [app, maintenance]) {
            const auth = createBetterAuthInstance(
              environment.auth,
              pool,
              { sendMagicLink: async () => undefined },
              { encryptionKeys: keys, deploymentMode: 'managed' },
            );
            const found = await (
              await auth.$context
            ).internalAdapter.findAccountByKey({
              issuer: 'https://accounts.google.com',
              accountId,
            });
            expect(found).toMatchObject({ id: accountId, [field]: null });
            expect(JSON.stringify(found)).not.toContain(tokenCanary);
          }
          await expect(
            migrateLegacyOAuthBatch(operator, keys, { limit: 1 }),
          ).resolves.toMatchObject({
            processed: 1,
            scanned: 1,
            passComplete: false,
          });
          expect(
            (
              await maintenance.query(
                'SELECT legacy_tokens_present FROM account',
              )
            ).rows,
          ).toEqual([{ legacy_tokens_present: false }]);
          await expect(
            initializeEncryption({
              maintenancePool: maintenance,
              configuration: configuration(),
              loadRootKey: async () => rootOne,
            }),
          ).resolves.toBeDefined();
          expect(
            (
              await operator.query(
                `SELECT action FROM credential_audit_events WHERE account_id = $1`,
                [accountId],
              )
            ).rows,
          ).toEqual([{ action: 'migrate_legacy' }]);
          const auth = createBetterAuthInstance(
            environment.auth,
            app,
            { sendMagicLink: async () => undefined },
            { encryptionKeys: keys, deploymentMode: 'managed' },
          );
          expect(
            await (
              await auth.$context
            ).internalAdapter.findAccountByKey({
              issuer: 'https://accounts.google.com',
              accountId,
            }),
          ).toMatchObject({ [field]: tokenCanary });
        },
      );
    },
  );

  it('refuses the real converter process with runtime credentials and succeeds with the separate operator credentials', async () => {
    await withDeployment(
      'accessToken',
      async ({ operator, maintenance, runtimeUrl, operatorUrl }) => {
        const entry = fileURLToPath(
          new URL('../../encryption.ts', import.meta.url),
        );
        for (const [url, expectedStatus] of [
          [runtimeUrl, 1],
          [operatorUrl, 0],
        ] as const) {
          const child = spawnSync(
            process.execPath,
            [entry, 'migrate-legacy', '--limit', '1'],
            {
              env: {
                NODE_ENV: 'production',
                DATABASE_URL: url.href,
                ...encryptionEnvironment(),
              },
              encoding: 'utf8',
              timeout: 10_000,
            },
          );
          expect(child.error).toBeUndefined();
          expect(child.signal).toBeNull();
          expect(child.stderr).toBe('');
          expect(child.status).toBe(expectedStatus);
          const output: unknown = JSON.parse(child.stdout.trim());
          expect(output).toMatchObject(
            expectedStatus === 0
              ? { operation: 'migrate-legacy', processed: 1 }
              : { code: 'STUDIO_ENCRYPTION_MAINTENANCE_FAILED' },
          );
          for (const value of [
            tokenCanary,
            password,
            rootOne.toString('base64'),
          ])
            expect(child.stdout).not.toContain(value);
        }
        expect(
          (
            await operator.query(
              'SELECT "accessToken", legacy_tokens_present FROM account',
            )
          ).rows,
        ).toEqual([{ accessToken: null, legacy_tokens_present: false }]);
        const refused = new Error('synthetic unused operator connection');
        const connect = vi
          .spyOn(operator, 'connect')
          .mockRejectedValue(refused);
        try {
          await expect(operator.connect()).rejects.toBe(refused);
          connect.mockClear();
          for (const command of ['verify', 'rotate']) {
            await expect(
              runEncryptionCommand(
                [command],
                maintenance,
                {
                  configuration: configuration(),
                  loadRootKey: async () => rootOne,
                },
                operator,
              ),
            ).resolves.toMatchObject({ operation: command });
          }
          expect(connect).not.toHaveBeenCalled();
        } finally {
          connect.mockRestore();
        }
      },
    );
  });

  it('rolls back plaintext removal, generated presence and ciphertext when a non-superuser operator cannot append the required audit', async () => {
    await withDeployment(
      'refreshToken',
      async ({ administrator, operator, maintenance, keys }) => {
        await administrator.query(`CREATE FUNCTION reject_conversion_audit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN RAISE EXCEPTION 'synthetic conversion audit refusal'; END $$;
        CREATE TRIGGER reject_conversion_audit BEFORE INSERT ON credential_audit_events FOR EACH ROW EXECUTE FUNCTION reject_conversion_audit()`);
        await expect(
          migrateLegacyOAuthBatch(operator, keys, { limit: 1 }),
        ).rejects.toThrow('synthetic conversion audit refusal');
        expect(
          (
            await operator.query(
              'SELECT "refreshToken", refresh_token_ciphertext, legacy_tokens_present FROM account',
            )
          ).rows,
        ).toEqual([
          {
            refreshToken: tokenCanary,
            refresh_token_ciphertext: null,
            legacy_tokens_present: true,
          },
        ]);
        expect(
          (await operator.query('SELECT id FROM credential_audit_events'))
            .rowCount,
        ).toBe(0);
        await expect(
          initializeEncryption({
            maintenancePool: maintenance,
            configuration: configuration(),
            loadRootKey: async () => rootOne,
          }),
        ).rejects.toThrow('Encryption key verification failed');
        await administrator.query(
          'DROP TRIGGER reject_conversion_audit ON credential_audit_events; DROP FUNCTION reject_conversion_audit()',
        );
        await expect(
          migrateLegacyOAuthBatch(operator, keys, { limit: 1 }),
        ).resolves.toMatchObject({ processed: 1 });
        expect(
          (await operator.query('SELECT action FROM credential_audit_events'))
            .rows,
        ).toEqual([{ action: 'migrate_legacy' }]);
      },
    );
  });

  it('requires the connecting identity own all retained-column grants, refusing inherited, PUBLIC and SET ROLE capabilities', async () => {
    await withDeployment(
      'accessToken',
      async ({
        administrator,
        operator,
        rawRuntime,
        operatorName,
        operatorUrl,
        keys,
      }) => {
        const parent = `legacy-reader-${randomUUID().replaceAll('-', '')}`;
        const adminName = (
          await administrator.query<{ name: string }>(
            'SELECT session_user AS name',
          )
        ).rows[0]!.name;
        const maskedColumns = (
          await administrator.query<{ name: string }>(
            `SELECT attname AS name FROM pg_attribute WHERE attrelid = 'account'::regclass AND attnum > 0 AND NOT attisdropped AND attname <> ALL($1::text[])`,
            [columns],
          )
        ).rows
          .map(({ name }) => escapeIdentifier(name))
          .join(', ');
        try {
          await administrator.query(`CREATE ROLE ${escapeIdentifier(parent)} NOLOGIN;
          ALTER TABLE account OWNER TO ${escapeIdentifier(adminName)};
          GRANT SELECT (${maskedColumns}), UPDATE ON account TO ${escapeIdentifier(operatorName)};
          GRANT SELECT ON account TO ${escapeIdentifier(parent)};
          GRANT ${escapeIdentifier(parent)} TO ${escapeIdentifier(operatorName)} WITH INHERIT TRUE, SET TRUE`);
          // PostgreSQL permits this real read through inherited membership; the
          // converter must still reject it before handling any token contents.
          expect(
            (await operator.query('SELECT "accessToken" FROM account')).rows,
          ).toEqual([{ accessToken: tokenCanary }]);
          await expect(
            migrateLegacyOAuthBatch(operator, keys, { limit: 1 }),
          ).rejects.toThrow(ProtectedDataError);
          await administrator.query(
            `GRANT SELECT ("accessToken", "refreshToken") ON account TO ${escapeIdentifier(operatorName)}`,
          );
          await expect(
            migrateLegacyOAuthBatch(operator, keys, { limit: 1 }),
          ).rejects.toThrow(ProtectedDataError);
          await administrator.query(
            `GRANT SELECT ("accessToken", "refreshToken", "idToken") ON account TO PUBLIC`,
          );
          await expect(
            migrateLegacyOAuthBatch(rawRuntime, keys, { limit: 1 }),
          ).rejects.toThrow(ProtectedDataError);
          await administrator.query(`REVOKE SELECT ("accessToken", "refreshToken", "idToken") ON account FROM PUBLIC;
          GRANT SELECT ("idToken") ON account TO ${escapeIdentifier(operatorName)}`);
          const borrowedUrl = new URL(operatorUrl);
          borrowedUrl.searchParams.set('options', `-c role=${parent}`);
          const borrowed = new Pool({ connectionString: borrowedUrl.href });
          try {
            await expect(
              migrateLegacyOAuthBatch(borrowed, keys, { limit: 1 }),
            ).rejects.toThrow(ProtectedDataError);
          } finally {
            await borrowed.end();
          }
          // Direct grants on every legacy column establish a legitimate separate
          // operator even when that login is not the owner of the account table.
          await expect(
            migrateLegacyOAuthBatch(operator, keys, { limit: 1 }),
          ).resolves.toMatchObject({ processed: 1 });
        } finally {
          await administrator.query(`REVOKE SELECT ON account FROM ${escapeIdentifier(parent)};
          REVOKE ${escapeIdentifier(parent)} FROM ${escapeIdentifier(operatorName)};
          DROP ROLE ${escapeIdentifier(parent)}`);
        }
      },
    );
  });
});
