import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { escapeIdentifier, Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { createBetterAuthInstance } from '../../auth/better-auth.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
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
    rawMaintenance: Pool;
    app: Pool;
    maintenance: Pool;
    operatorName: string;
    runtimeName: string;
    operatorUrl: URL;
    runtimeUrl: URL;
    maintenanceUrl: URL;
    allowedLogins: string[];
    keys: Awaited<ReturnType<typeof initializeCredentialMigration>>;
  }) => Promise<void>,
) {
  if (!database) throw new Error('An isolated local database is required.');
  const scratch = await createScratchDatabase(database);
  const suffix = randomUUID().replaceAll('-', '');
  const operatorName = `legacy-operator-${suffix}`;
  const runtimeName = `legacy-app-${suffix}`;
  const maintenanceName = `legacy-maintenance-${suffix}`;
  const administrator = createOwnerPool(database);
  const pools: Pool[] = [];
  try {
    for (const [role, scopedRoles] of [
      [operatorName, ['studio_app', 'studio_maintenance']],
      [runtimeName, ['studio_app']],
      [maintenanceName, ['studio_maintenance']],
    ] as const) {
      await administrator.query(
        `CREATE ROLE ${escapeIdentifier(role)} LOGIN NOINHERIT NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS NOREPLICATION PASSWORD '${password}'`,
      );
      await administrator.query(
        `GRANT ${scopedRoles.map(escapeIdentifier).join(', ')} TO ${escapeIdentifier(role)} WITH ADMIN FALSE, SET TRUE, INHERIT FALSE`,
      );
    }
    const allowedLogins = await enrollMigrationTestDatabase(
      scratch.pool,
      database,
      [operatorName, runtimeName, maintenanceName],
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
    const maintenanceUrl = new URL(operatorUrl);
    maintenanceUrl.username = maintenanceName;
    const operator = createOwnerPool({ url: operatorUrl.href });
    const rawRuntime = createOwnerPool({ url: runtimeUrl.href });
    const rawMaintenance = createOwnerPool({ url: maintenanceUrl.href });
    const app = createPool({ url: runtimeUrl.href });
    const maintenance = createMaintenancePool({ url: maintenanceUrl.href });
    pools.push(operator, rawRuntime, rawMaintenance, app, maintenance);
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
      rawMaintenance,
      app,
      maintenance,
      operatorName,
      runtimeName,
      operatorUrl,
      runtimeUrl,
      maintenanceUrl,
      allowedLogins,
      keys,
    });
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    await scratch.dispose();
    await administrator.query(
      `DROP ROLE IF EXISTS ${escapeIdentifier(operatorName)}, ${escapeIdentifier(runtimeName)}, ${escapeIdentifier(maintenanceName)}`,
    );
    await administrator.end();
  }
}

describe('operator-only retained OAuth credentials', () => {
  it.each(
    ['studio_app', 'studio_maintenance'].flatMap((role) =>
      columns.map((field) => ({ role, field })),
    ),
  )(
    'refuses $role clearing retained $field or bypassing the conversion boundary through sibling writes',
    async ({ role, field }) => {
      await withDeployment(
        field,
        async ({ app, maintenance, operator, keys }) => {
          const runtime = role === 'studio_app' ? app : maintenance;
          const column = escapeIdentifier(field);
          await expect(
            runtime.query(`UPDATE account SET ${column} = NULL WHERE id = $1`, [
              accountId,
            ]),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            runtime.query(
              `UPDATE account SET ${column} = DEFAULT WHERE id = $1`,
              [accountId],
            ),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            runtime.query(
              `INSERT INTO account (id, "userId", "accountId", "providerId", ${column}, "updatedAt") VALUES ('runtime-null-token', $1, 'external-new', 'google', NULL, now())`,
              [userId],
            ),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            runtime.query(
              `INSERT INTO account (id, "userId", "accountId", "providerId", "updatedAt") VALUES ($1, $2, $1, 'google', now()) ON CONFLICT (id) DO UPDATE SET ${column} = NULL`,
              [accountId, userId],
            ),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            runtime.query(
              `MERGE INTO account a USING (VALUES ($1::text)) source(id) ON a.id = source.id WHEN MATCHED THEN UPDATE SET ${column} = NULL`,
              [accountId],
            ),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            runtime.query(`COPY account (${column}) FROM STDIN`),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            runtime.query('TRUNCATE account CASCADE'),
          ).rejects.toMatchObject({ code: '42501' });
          await expect(
            runtime.query(
              'ALTER TABLE account DISABLE TRIGGER account_audit_deletion',
            ),
          ).rejects.toMatchObject({ code: '42501' });
          expect(
            (
              await operator.query(
                `SELECT ${column} AS token, legacy_tokens_present FROM account WHERE id = $1`,
                [accountId],
              )
            ).rows,
          ).toEqual([{ token: tokenCanary, legacy_tokens_present: true }]);
          await expect(
            initializeEncryption({
              maintenancePool: maintenance,
              configuration: configuration(),
              loadRootKey: async () => rootOne,
            }),
          ).rejects.toThrow('Encryption key verification failed');
          expect(
            (await operator.query('SELECT action FROM credential_audit_events'))
              .rows,
          ).toEqual([]);
          await expect(
            migrateLegacyOAuthBatch(operator, keys, { limit: 1 }),
          ).resolves.toMatchObject({ processed: 1 });
          expect(
            (
              await operator.query(
                `SELECT ${column} AS token, legacy_tokens_present FROM account WHERE id = $1`,
                [accountId],
              )
            ).rows,
          ).toEqual([{ token: null, legacy_tokens_present: false }]);
          expect(
            (await operator.query('SELECT action FROM credential_audit_events'))
              .rows,
          ).toEqual([{ action: 'migrate_legacy' }]);
        },
      );
    },
  );

  it('retains a trigger boundary against accidental legacy write grants and audits the permitted deletion path', async () => {
    await withDeployment(
      'accessToken',
      async ({ operator, app, maintenance }) => {
        await operator.query(
          `UPDATE account SET "refreshToken" = $1, "idToken" = $1`,
          [tokenCanary],
        );
        for (const [role, runtime] of [
          ['studio_app', app],
          ['studio_maintenance', maintenance],
        ] as const) {
          for (const field of columns) {
            const column = escapeIdentifier(field);
            await operator.query(
              `GRANT INSERT (${column}), UPDATE (${column}) ON account TO ${escapeIdentifier(role)}`,
            );
            await expect(
              runtime.query(`UPDATE account SET ${column} = NULL`),
            ).rejects.toMatchObject({
              code: 'P0001',
              message: 'retained OAuth token writes are forbidden',
            });
            await expect(
              runtime.query(
                `INSERT INTO account (id, "userId", "accountId", "providerId", ${column}, "updatedAt") VALUES ($1, $2, $1, 'google', $3, now())`,
                [randomUUID(), userId, tokenCanary],
              ),
            ).rejects.toMatchObject({
              code: 'P0001',
              message: 'retained OAuth token writes are forbidden',
            });
            await operator.query(
              `REVOKE INSERT (${column}), UPDATE (${column}) ON account FROM ${escapeIdentifier(role)}`,
            );
          }
        }
        expect(
          (
            await operator.query(
              'SELECT "accessToken", "refreshToken", "idToken", legacy_tokens_present FROM account',
            )
          ).rows,
        ).toEqual([
          {
            accessToken: tokenCanary,
            refreshToken: tokenCanary,
            idToken: tokenCanary,
            legacy_tokens_present: true,
          },
        ]);
        await operator.query(
          'REVOKE INSERT ON credential_audit_events FROM studio_app',
        );
        await expect(
          app.query('DELETE FROM account WHERE id = $1', [accountId]),
        ).rejects.toMatchObject({ code: '42501' });
        expect((await operator.query('SELECT id FROM account')).rows).toEqual([
          { id: accountId },
        ]);
        await operator.query(
          'GRANT INSERT ON credential_audit_events TO studio_app',
        );
        await app.query('DELETE FROM account WHERE id = $1', [accountId]);
        expect((await operator.query('SELECT id FROM account')).rows).toEqual(
          [],
        );
        expect(
          (
            await operator.query(
              'SELECT account_id, action FROM credential_audit_events',
            )
          ).rows,
        ).toEqual([{ account_id: accountId, action: 'delete' }]);
      },
    );
  });

  it.each(columns)(
    'keeps retained %s unavailable to the enrolled runtime while the ordinary operator can convert it',
    async (field) => {
      await withDeployment(
        field,
        async ({
          operator,
          rawRuntime,
          rawMaintenance,
          app,
          maintenance,
          keys,
        }) => {
          for (const [pool, intendedRole, forbiddenRole] of [
            [rawRuntime, 'studio_app', 'studio_maintenance'],
            [rawMaintenance, 'studio_maintenance', 'studio_app'],
          ] as const) {
            const client = await pool.connect();
            try {
              await expect(
                client.query(`SET ROLE ${forbiddenRole}`),
              ).rejects.toMatchObject({ code: '42501' });
              for (const role of ['NONE', intendedRole]) {
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
          }
          for (const pool of [rawRuntime, rawMaintenance, app, maintenance]) {
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
            maintenance.query(
              'UPDATE account SET legacy_tokens_present = DEFAULT',
            ),
          ).rejects.toMatchObject({ code: '42501' });
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
      async ({
        operator,
        maintenance,
        runtimeUrl,
        maintenanceUrl,
        operatorUrl,
        operatorName,
        allowedLogins,
      }) => {
        const entry = fileURLToPath(
          new URL('../../encryption.ts', import.meta.url),
        );
        const runCommand = (url: URL, args: string[]) => {
          const child = spawnSync(process.execPath, [entry, ...args], {
            env: {
              NODE_ENV: 'production',
              DATABASE_URL: url.href,
              STUDIO_DATABASE_ALLOWED_LOGINS: JSON.stringify(allowedLogins),
              STUDIO_DATABASE_ADMINISTRATIVE_LOGINS: JSON.stringify([
                operatorName,
              ]),
              ...encryptionEnvironment(),
            },
            encoding: 'utf8',
            timeout: 10_000,
          });
          expect(child.error).toBeUndefined();
          expect(child.signal).toBeNull();
          expect(child.stderr).toBe('');
          const output: unknown = JSON.parse(child.stdout.trim());
          for (const value of [
            tokenCanary,
            password,
            rootOne.toString('base64'),
          ])
            expect(child.stdout).not.toContain(value);
          return { status: child.status, output };
        };
        for (const url of [runtimeUrl, maintenanceUrl]) {
          expect(
            runCommand(url, ['migrate-legacy', '--limit', '1']),
          ).toMatchObject({
            status: 1,
            output: { code: 'STUDIO_ENCRYPTION_MAINTENANCE_FAILED' },
          });
          expect(
            (
              await operator.query(
                'SELECT "accessToken", legacy_tokens_present FROM account',
              )
            ).rows,
          ).toEqual([
            { accessToken: tokenCanary, legacy_tokens_present: true },
          ]);
          expect(
            (await operator.query('SELECT action FROM credential_audit_events'))
              .rows,
          ).toEqual([]);
        }
        expect(
          runCommand(operatorUrl, ['migrate-legacy', '--limit', '1']),
        ).toMatchObject({
          status: 0,
          output: { operation: 'migrate-legacy', processed: 1 },
        });
        expect(
          (
            await operator.query(
              'SELECT "accessToken", legacy_tokens_present FROM account',
            )
          ).rows,
        ).toEqual([{ accessToken: null, legacy_tokens_present: false }]);
        // Each offline invocation needs only its own DATABASE_URL. The restricted
        // maintenance login and explicitly declared non-owner operator both work
        // without a server maintenance URL, auth settings or provider credentials.
        for (const url of [maintenanceUrl, operatorUrl]) {
          for (const operation of ['verify', 'rotate']) {
            expect(runCommand(url, [operation])).toMatchObject({
              status: 0,
              output: { operation },
            });
          }
        }
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
                { allowedLogins, administrativeLogins: [operatorName] },
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
