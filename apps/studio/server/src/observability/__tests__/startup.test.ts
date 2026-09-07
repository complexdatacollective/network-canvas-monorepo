import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { escapeIdentifier } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  createScratchDatabase,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { readEnv } from '../../env.ts';
import { encryptionEnvironment } from '../../pii/__tests__/fixtures.ts';

const database = await reachableDb();
const runtimePassword = 'startup-runtime-synthetic-only';

describe.skipIf(!database)('startup migration provenance', () => {
  it('refuses an unversioned development database outside the explicit development lane', async () => {
    if (!database)
      throw new Error('Database required for startup provenance test.');
    const scratch = await createScratchDatabase(database);
    try {
      await provisionScratchSchema(scratch.pool);
      const entry = new URL('../../index.ts', import.meta.url).href;
      const run = (development: boolean, databaseUrl = scratch.db.url) =>
        spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '--eval',
            `await import(${JSON.stringify(entry)}); console.log(JSON.stringify({marker: 'startup-completed'})); process.exit(0);`,
          ],
          {
            env: {
              ...encryptionEnvironment(),
              NODE_ENV: development ? 'development' : 'production',
              STUDIO_DEV_DEFAULTS: String(development),
              DATABASE_URL: databaseUrl,
              BETTER_AUTH_SECRET:
                'migration-provenance-local-test-secret-64-characters-long-enough',
              PUBLIC_URL: 'http://127.0.0.1:3000',
              PORT: '0',
              HOST: '127.0.0.1',
            },
            encoding: 'utf8',
            timeout: 10_000,
          },
        );
      const development = run(true);
      expect(development.error).toBeUndefined();
      expect(development.status).toBe(0);
      expect(development.stdout).toContain('"marker":"startup-completed"');
      const deployed = run(false);
      expect(deployed.error).toBeUndefined();
      expect(deployed.status).toBe(1);
      expect(deployed.stderr).toBe('');
      expect(deployed.stdout).toContain('"code":"STUDIO_SCHEMA_STALE"');
      expect(deployed.stdout).not.toContain('"marker":"startup-completed"');
      const versioned = await createScratchDatabase(database);
      const runtimeLogin = `startup_runtime_${randomUUID().replaceAll('-', '')}`;
      let runtimeCreated = false;
      try {
        const identity = (
          await versioned.pool.query<{ database: string; login: string }>(
            'SELECT current_database() AS database, session_user AS login',
          )
        ).rows[0]!;
        await versioned.pool
          .query(`REVOKE CONNECT ON DATABASE ${escapeIdentifier(identity.database)} FROM PUBLIC;
          GRANT CONNECT ON DATABASE ${escapeIdentifier(identity.database)} TO ${escapeIdentifier(identity.login)}`);
        const migrations = await readMigrations(
          fileURLToPath(new URL('../../../migrations', import.meta.url)),
        );
        expect(migrations.length).toBeGreaterThan(0);
        expect(
          await migrateDatabase(
            versioned.pool,
            migrations,
            SCHEMA_FINGERPRINT,
            [identity.login],
          ),
        ).toEqual(migrations.map(({ manifest }) => manifest.id));
        await versioned.pool.query(
          `CREATE ROLE ${escapeIdentifier(runtimeLogin)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${runtimePassword}';
           GRANT studio_app, studio_maintenance TO ${escapeIdentifier(runtimeLogin)} WITH ADMIN FALSE, SET TRUE, INHERIT FALSE;
           GRANT CONNECT ON DATABASE ${escapeIdentifier(identity.database)} TO ${escapeIdentifier(runtimeLogin)}`,
        );
        runtimeCreated = true;
        const ownerBacked = run(false, versioned.db.url);
        expect(ownerBacked.error).toBeUndefined();
        expect(ownerBacked.status).toBe(1);
        expect(ownerBacked.stdout).toContain(
          '"code":"STUDIO_DATABASE_IDENTITY_UNSAFE"',
        );
        expect(ownerBacked.stdout).not.toContain(
          '"marker":"startup-completed"',
        );
        const runtimeUrl = new URL(versioned.db.url);
        runtimeUrl.username = runtimeLogin;
        runtimeUrl.password = runtimePassword;
        const current = run(false, runtimeUrl.href);
        expect(current.error).toBeUndefined();
        expect(current.status).toBe(0);
        expect(current.stdout).toContain('"marker":"startup-completed"');
        expect(current.stdout).not.toContain('"code":"STUDIO_SCHEMA_STALE"');
      } finally {
        if (runtimeCreated)
          await versioned.pool.query(
            `REVOKE CONNECT ON DATABASE ${escapeIdentifier(new URL(versioned.db.url).pathname.slice(1))} FROM ${escapeIdentifier(runtimeLogin)};
             DROP ROLE ${escapeIdentifier(runtimeLogin)}`,
          );
        await versioned.dispose();
      }
    } finally {
      await scratch.dispose();
    }
  });
});

describe('startup diagnostic privacy', () => {
  it.each([
    'throw new Error("secret-payload-canary")',
    'void Promise.reject(new Error("secret-payload-canary"))',
  ])('contains a fatal process failure after startup: %s', (failure) => {
    const entry = new URL('../../index.ts', import.meta.url).href;
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(entry)}); ${failure};`,
      ],
      {
        // This suite owns log privacy; the separate telemetry subprocess suite
        // exercises default-on reporting against a local receiver.
        env: {
          NODE_ENV: 'production',
          PORT: '0',
          HOST: '127.0.0.1',
          STUDIO_TELEMETRY: 'false',
        },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toBe('');
    const records = child.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    // Static-asset probing can finish while fatal shutdown drains. Assert the
    // fatal diagnostic itself; an unrelated warning may be emitted after it.
    expect(
      records.filter((record) => record.code === 'STUDIO_PROCESS_FAILED'),
    ).toEqual([
      {
        level: 50,
        time: expect.any(String),
        event: 'operational',
        code: 'STUDIO_PROCESS_FAILED',
      },
    ]);
    expect(child.stdout).not.toContain('secret-payload-canary');
  });

  it('suppresses the environment library raw validation diagnostic', () => {
    const diagnostic = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.stubEnv('STUDIO_METRICS_TOKEN', 'secret\n');
    try {
      expect(() => readEnv()).toThrow('Invalid environment variables');
      expect(diagnostic).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      diagnostic.mockRestore();
    }
  });

  it.each([
    { STUDIO_METRICS_TOKEN: 'secret\n' },
    {
      DATABASE_URL: 'postgres://localhost:1/studio',
      BETTER_AUTH_SECRET: 'startup-only-authentication-secret-32-characters',
      PUBLIC_URL: 'https://studio.example.test',
      SMTP_URL: 'smtp://127.0.0.1:1',
      EMAIL_FROM: 'Invalid <private-sender-canary>',
    },
  ])(
    'exits the actual Node entrypoint with one fixed diagnostic for invalid configuration: %j',
    (configuration) => {
      const child = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../../index.ts', import.meta.url))],
        {
          env: { NODE_ENV: 'production', ...configuration },
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(1);
      expect(child.stderr).toBe('');
      const lines = child.stdout.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!)).toEqual({
        level: 50,
        time: expect.any(String),
        event: 'operational',
        code: 'STUDIO_CONFIGURATION_INVALID',
      });
    },
  );
});
