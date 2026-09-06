import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createMaintenancePool } from '../../db/pool.ts';
import type { DbEnv } from '../../env.ts';
import { runEncryptionCommand } from '../operator.ts';
import { configuration, encryptionEnvironment, rootOne } from './fixtures.ts';

const database = await reachableDb();
const entry = fileURLToPath(new URL('../../index.ts', import.meta.url));
const operator = fileURLToPath(new URL('../../encryption.ts', import.meta.url));

function environment(db: DbEnv) {
  return {
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '0',
    DATABASE_URL: db.url,
    BETTER_AUTH_SECRET: 'synthetic-studio-entrypoint-secret-for-tests',
    PUBLIC_URL: 'https://studio.example.org',
    ...encryptionEnvironment(),
  };
}

async function withDatabase(
  work: (
    scratch: Awaited<ReturnType<typeof createScratchDatabase>>,
  ) => Promise<void>,
) {
  if (!database) throw new Error('A local database is required.');
  const scratch = await createScratchDatabase(database);
  try {
    const allowedLogins = await enrollMigrationTestDatabase(
      scratch.pool,
      database,
    );
    const migrations = await readMigrations(
      fileURLToPath(new URL('../../../migrations', import.meta.url)),
    );
    await migrateDatabase(
      scratch.pool,
      migrations,
      SCHEMA_FINGERPRINT,
      allowedLogins,
    );
    await work(scratch);
  } finally {
    await scratch.dispose();
  }
}

function runNode(file: string, args: string[], env: Record<string, string>) {
  const child = spawnSync(process.execPath, [file, ...args], {
    env,
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(child.error).toBeUndefined();
  expect(
    child.signal,
    'operator must finish before the test deadline',
  ).toBeNull();
  expect(child.stderr).toBe('');
  return {
    status: child.status,
    records: child.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

async function runServer(env: Record<string, string>) {
  const child = spawn(process.execPath, [entry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks: string[] = [];
  const errors: string[] = [];
  let started = false;
  const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
  child.stdout.on('data', (chunk: Buffer) => {
    chunks.push(chunk.toString());
    if (
      !started &&
      chunks.join('').includes('"code":"STUDIO_SERVER_STARTED"')
    ) {
      started = true;
      child.kill('SIGTERM');
    }
  });
  child.stderr.on('data', (chunk: Buffer) => errors.push(chunk.toString()));
  try {
    const status = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    expect(
      child.signalCode,
      'server must finish startup and shutdown before the test deadline',
    ).toBeNull();
    expect(errors.join('')).toBe('');
    return {
      status,
      started,
      records: chunks
        .join('')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

describe('actual server encryption startup and operator entrypoints', () => {
  it('verifies through the operator command, starts with correct roots, and refuses wrong or missing roots before traffic', async () => {
    await withDatabase(async ({ db, pool }) => {
      const env = environment(db);
      const {
        BETTER_AUTH_SECRET: _authSecret,
        PUBLIC_URL: _origin,
        ...operatorEnv
      } = env;
      expect(runNode(operator, ['verify'], operatorEnv)).toEqual({
        status: 0,
        records: [{ operation: 'verify', verified: true }],
      });
      expect(
        (await pool.query('SELECT * FROM encryption_key_verifications'))
          .rowCount,
      ).toBe(8);
      expect(await runServer(env)).toMatchObject({ status: 0, started: true });
      for (const root of [
        'synthetic-secret-invalid-root',
        Buffer.alloc(32, 44).toString('base64'),
        '',
      ]) {
        const result = await runServer({
          ...env,
          STUDIO_ENCRYPTION_ROOT_TEST_ROOT_ONE: root,
        });
        expect(result.status).toBe(1);
        expect(result.started).toBe(false);
        expect(result.records).toEqual([
          {
            level: 50,
            time: expect.any(String),
            event: 'operational',
            code: 'STUDIO_ENCRYPTION_INVALID',
          },
        ]);
        expect(JSON.stringify(result.records)).not.toContain(
          root || 'STUDIO_SERVER_STARTED',
        );
      }
    });
  });

  it('never selects public roots in the operator lane and keeps failures value-free', async () => {
    await withDatabase(async ({ db }) => {
      const env = environment(db);
      const { STUDIO_ENCRYPTION_KEYSET: _keyset, ...withoutKeys } = env;
      const result = runNode(operator, ['verify'], {
        ...withoutKeys,
        STUDIO_DEV_DEFAULTS: 'true',
      });
      expect(result.status).toBe(1);
      expect(result.records).toEqual([
        {
          level: 50,
          time: expect.any(String),
          event: 'operational',
          code: 'STUDIO_ENCRYPTION_MAINTENANCE_FAILED',
        },
      ]);
      for (const args of [
        ['rotate', '--limit', '101'],
        ['verify', '--cursor', 'synthetic-secret-bad-cursor'],
      ]) {
        const failed = runNode(operator, args, env);
        expect(failed.status).toBe(1);
        expect(failed.records.map((record) => record.code)).toEqual([
          'STUDIO_ENCRYPTION_MAINTENANCE_FAILED',
        ]);
        expect(JSON.stringify(failed.records)).not.toContain(
          'synthetic-secret',
        );
      }
    });
  });

  it('exposes bounded maintenance results without starting unrelated application services', async () => {
    await withDatabase(async ({ db }) => {
      const maintenance = createMaintenancePool(db);
      const encryption = {
        configuration: configuration(),
        loadRootKey: async () => rootOne,
      };
      try {
        await expect(
          runEncryptionCommand(
            ['rotate', '--limit', '1'],
            maintenance,
            encryption,
          ),
        ).resolves.toEqual({
          operation: 'rotate',
          processed: 0,
          scanned: 0,
          passComplete: true,
          cursor: null,
        });
        await expect(
          runEncryptionCommand(
            ['migrate-legacy', '--limit', '1'],
            maintenance,
            encryption,
          ),
        ).resolves.toEqual({
          operation: 'migrate-legacy',
          processed: 0,
          scanned: 0,
          passComplete: true,
          afterId: null,
        });
      } finally {
        await maintenance.end();
      }
    });
  });

  it('performs a full first-batch verification and proof-only resume without corpus scans', async () => {
    await withDatabase(async ({ db, pool }) => {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ('bounded-user', 'Synthetic', 'bounded@example.test', true)`,
      );
      await pool.query(
        `INSERT INTO account (id, "userId", "accountId", "providerId", issuer, "updatedAt") VALUES ('bounded-account', 'bounded-user', 'bounded-account', 'google', 'https://accounts.google.com', now())`,
      );
      const maintenance = createMaintenancePool(db);
      const encryption = {
        configuration: configuration(),
        loadRootKey: async () => rootOne,
      };
      try {
        const client = await maintenance.connect();
        const queries = vi.spyOn(client, 'query');
        client.release();
        const first = await runEncryptionCommand(
          ['rotate', '--limit', '1'],
          maintenance,
          encryption,
        );
        expect(first).toMatchObject({
          operation: 'rotate',
          processed: 0,
          scanned: 1,
          passComplete: false,
        });
        expect(
          queries.mock.calls.some(
            ([sql]) =>
              typeof sql === 'string' &&
              sql.includes("SELECT DISTINCT 'pii-enc'"),
          ),
        ).toBe(true);
        if (!('cursor' in first) || !first.cursor)
          throw new Error('Expected a real resumable cursor.');
        queries.mockClear();
        expect(
          await runEncryptionCommand(
            [
              'rotate',
              '--limit',
              '1',
              '--cursor',
              JSON.stringify(first.cursor),
            ],
            maintenance,
            encryption,
          ),
        ).toEqual({
          operation: 'rotate',
          processed: 0,
          scanned: 0,
          passComplete: true,
          cursor: null,
        });
        const resumed = queries.mock.calls.map(([sql]) =>
          typeof sql === 'string' ? sql : '',
        );
        expect(
          resumed.some((sql) => sql.includes('SELECT purpose, key_id')),
        ).toBe(true);
        expect(
          resumed.some((sql) =>
            /SELECT DISTINCT|count\(|SELECT EXISTS|INSERT INTO encryption_key_verifications/i.test(
              sql,
            ),
          ),
        ).toBe(false);
        queries.mockRestore();
        expect(
          (await pool.query('SELECT * FROM encryption_key_verifications'))
            .rowCount,
        ).toBe(8);
      } finally {
        await maintenance.end();
      }
    });
  });

  it('rejects malformed legacy cursors before loading roots or registering permanent proofs', async () => {
    await withDatabase(async ({ db, pool }) => {
      const maintenance = createMaintenancePool(db);
      const loadRootKey = vi.fn(async () => rootOne);
      try {
        for (const afterId of ['', 'x'.repeat(256)]) {
          await expect(
            runEncryptionCommand(
              ['migrate-legacy', '--after-id', afterId],
              maintenance,
              { configuration: configuration(), loadRootKey },
            ),
          ).rejects.toThrow();
          expect({
            rootLoads: loadRootKey.mock.calls.length,
            registeredProofs: (
              await pool.query('SELECT * FROM encryption_key_verifications')
            ).rowCount,
          }).toEqual({ rootLoads: 0, registeredProofs: 0 });
        }
      } finally {
        await maintenance.end();
      }
    });
  });
});
