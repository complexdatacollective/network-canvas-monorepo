import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { escapeIdentifier } from 'pg';
import { expect, it, vi } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { createAccountAssetsFixture } from './__tests__/account-assets-fixture.ts';
import { createRegistryInstallation } from './__tests__/installation.ts';
import type { RegistryBlobStore } from './blob-store.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './db/fingerprint.generated.ts';
import { registryMigrator } from './db/migrate.ts';
import { setRegistryPoolBounds } from './db/pool.ts';
import { readRegistryEnv } from './env.ts';
import { initializeRegistry, type RegistryRuntime } from './runtime.ts';
import { listenRegistry } from './server.ts';

const migrations = await readMigrations(
  fileURLToPath(new URL('../migrations', import.meta.url)),
  'Template Registry',
);

async function fixture(stamped = true, ownerConnection?: 'app' | 'operator') {
  const assets = await createAccountAssetsFixture();
  const database = await createRegistryInstallation();
  await registryMigrator.migrate(
    database.owner,
    migrations,
    REGISTRY_SCHEMA_FINGERPRINT,
    database.allowedLogins,
  );
  if (!stamped)
    await database.owner.query('DELETE FROM registry_schema_fingerprint');
  if (ownerConnection) {
    await database.withAdministrator((administrator) =>
      administrator.query(
        `GRANT ${escapeIdentifier(database.roles[ownerConnection])} TO ${escapeIdentifier(database.logins.owner)} WITH SET TRUE, INHERIT FALSE`,
      ),
    );
  }
  const poolFor = (role: string, connectionString: string) => {
    const pool = createPostgresPool({
      connectionString,
      role,
      onIdleError: () => {
        throw new Error('REGISTRY_TEST_IDLE_ERROR');
      },
    });
    setRegistryPoolBounds(pool);
    return pool;
  };
  const pool = poolFor(
    database.roles.app,
    ownerConnection === 'app'
      ? database.databaseUrl
      : database.runtimeDatabaseUrl,
  );
  const operatorPool = poolFor(
    database.roles.operator,
    ownerConnection === 'operator'
      ? database.databaseUrl
      : database.operatorDatabaseUrl,
  );
  const configuration = readRegistryEnv({
    REGISTRY_PUBLIC_URL: 'https://registry.example.test',
    REGISTRY_DATABASE_URL: database.runtimeDatabaseUrl,
    REGISTRY_OPERATOR_DATABASE_URL: database.operatorDatabaseUrl,
    REGISTRY_AUTH_SECRET: randomBytes(32).toString('hex'),
    REGISTRY_SMTP_URL: 'smtp://127.0.0.1:2525',
    REGISTRY_MAIL_FROM: 'registry@example.test',
    REGISTRY_S3_ENDPOINT: 'http://127.0.0.1:9000',
    REGISTRY_S3_REGION: 'auto',
    REGISTRY_S3_BUCKET: 'registry',
    REGISTRY_S3_ACCESS_KEY_ID: 'synthetic-access',
    REGISTRY_S3_SECRET_ACCESS_KEY: 'synthetic-secret',
  });
  const blobs = {
    ready: vi.fn(async () => undefined),
    close: vi.fn(),
    put: vi.fn<RegistryBlobStore['put']>(),
    get: vi.fn<RegistryBlobStore['get']>(),
    delete: vi.fn<RegistryBlobStore['delete']>(),
    scan: vi.fn<RegistryBlobStore['scan']>(),
  };
  const onDiagnostic = vi.fn();
  return {
    accountAssetDirectory: assets.directory,
    database,
    configuration,
    pool,
    operatorPool,
    blobs,
    onDiagnostic,
    async dispose() {
      await Promise.all(
        [pool, operatorPool]
          .filter((candidate) => !candidate.ending)
          .map((candidate) => candidate.end()),
      );
      await database.dispose();
      await assets.dispose();
    },
  };
}

it.each(['app', 'operator'] as const)(
  'refuses a database owner behind the expected %s role before storage or auth admission',
  async (purpose) => {
    const inputs = await fixture(true, purpose);
    let unexpectedRuntime: RegistryRuntime | undefined;
    try {
      // The installation already contains valid, separate restricted logins.
      // Selecting the expected NOLOGIN role does not make an owner URL safe.
      const unsafe = purpose === 'app' ? inputs.pool : inputs.operatorPool;
      const client = await unsafe.connect();
      try {
        await client.query('SET ROLE NONE');
        const ownership = await client.query<{ owns_database: boolean }>(
          'SELECT datdba = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owns_database FROM pg_database WHERE datname = current_database()',
        );
        expect(ownership.rows).toEqual([{ owns_database: true }]);
        await client.query(`SET ROLE ${inputs.database.roles[purpose]}`);
      } finally {
        client.release();
      }
      await expect(
        initializeRegistry(inputs).then((runtime) => {
          unexpectedRuntime = runtime;
          return runtime;
        }),
      ).rejects.toThrow('REGISTRY_STARTUP_FAILED');
      expect(inputs.blobs.ready).not.toHaveBeenCalled();
      expect(inputs.blobs.close).toHaveBeenCalledTimes(1);
      expect(
        (await inputs.database.owner.query('SELECT * FROM registry_auth_user'))
          .rows,
      ).toEqual([]);
    } finally {
      await unexpectedRuntime?.close();
      await inputs.dispose();
    }
  },
);

it('refuses an unstamped database before storage, auth, workers or a listener can start, and closes owned resources', async () => {
  const inputs = await fixture(false);
  let unexpectedRuntime: RegistryRuntime | undefined;
  try {
    await expect(
      initializeRegistry(inputs).then((runtime) => {
        unexpectedRuntime = runtime;
        return runtime;
      }),
    ).rejects.toThrow('REGISTRY_STARTUP_FAILED');
    expect(inputs.blobs.ready).not.toHaveBeenCalled();
    expect(inputs.blobs.close).toHaveBeenCalledTimes(1);
    await expect(inputs.pool.query('SELECT 1')).rejects.toThrow(
      'Cannot use a pool after calling end',
    );
    await expect(inputs.operatorPool.query('SELECT 1')).rejects.toThrow(
      'Cannot use a pool after calling end',
    );
    expect(
      (
        await inputs.database.owner.query(
          'SELECT * FROM registry_schema_fingerprint',
        )
      ).rows,
    ).toEqual([]);
    expect(
      (await inputs.database.owner.query('SELECT * FROM registry_auth_user'))
        .rows,
    ).toEqual([]);
  } finally {
    await unexpectedRuntime?.close();
    await inputs.dispose();
  }
});

it('refuses inaccessible private storage after validating both database roles without leaking its error', async () => {
  const inputs = await fixture();
  inputs.blobs.ready.mockRejectedValue(
    new Error('private-storage-credential-canary'),
  );
  try {
    const error: unknown = await initializeRegistry(inputs).catch(
      (value: unknown) => value,
    );
    expect(error).toEqual(new Error('REGISTRY_STARTUP_FAILED'));
    expect(error).not.toHaveProperty('cause');
    expect(inputs.blobs.ready).toHaveBeenCalledTimes(1);
    expect(inputs.blobs.close).toHaveBeenCalledTimes(1);
    await expect(inputs.pool.query('SELECT 1')).rejects.toThrow(
      'Cannot use a pool after calling end',
    );
    await expect(inputs.operatorPool.query('SELECT 1')).rejects.toThrow(
      'Cannot use a pool after calling end',
    );
  } finally {
    await inputs.dispose();
  }
});

it('serves live health and public reads, refuses stale readiness, drains admission and closes the listener', async () => {
  const inputs = await fixture();
  const runtime = await initializeRegistry(inputs);
  const listener = await listenRegistry(runtime, 0, '127.0.0.1');
  try {
    const address = listener.server.address();
    if (!address || typeof address === 'string')
      throw new Error('REGISTRY_TEST_HTTP_ADDRESS_MISSING');
    const origin = `http://127.0.0.1:${address.port}`;
    expect((await fetch(`${origin}/healthz`)).status).toBe(200);
    expect((await fetch(`${origin}/readyz`)).status).toBe(200);
    const entries = await fetch(`${origin}/api/v1/entries`);
    expect(entries.status).toBe(200);
    expect(await entries.json()).toEqual({ data: [], next_cursor: null });
    await inputs.database.owner.query(
      "UPDATE registry_schema_fingerprint SET fingerprint = repeat('0', 64)",
    );
    expect((await fetch(`${origin}/readyz`)).status).toBe(503);
    expect((await fetch(`${origin}/healthz`)).status).toBe(200);
    expect(inputs.onDiagnostic).toHaveBeenCalledWith(
      'REGISTRY_READINESS_FAILED',
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    await inputs.database.owner.query(
      'UPDATE registry_schema_fingerprint SET fingerprint = $1',
      [REGISTRY_SCHEMA_FINGERPRINT],
    );
    expect((await fetch(`${origin}/readyz`)).status).toBe(200);
    runtime.stopAdmission();
    expect((await fetch(`${origin}/readyz`)).status).toBe(503);
    const draining = await fetch(`${origin}/api/v1/entries`);
    expect(draining.status).toBe(503);
    expect(draining.headers.get('Content-Type')).toBe(
      'application/problem+json',
    );
    expect(draining.headers.get('Cache-Control')).toBe('no-store');
    expect(draining.headers.get('Content-Security-Policy')).toContain(
      "default-src 'none'",
    );
    await listener.close();
    await listener.close();
    expect(inputs.blobs.close).toHaveBeenCalledTimes(1);
    expect(listener.server.listening).toBe(false);
    await expect(inputs.pool.query('SELECT 1')).rejects.toThrow(
      'Cannot use a pool after calling end',
    );
    await expect(inputs.operatorPool.query('SELECT 1')).rejects.toThrow(
      'Cannot use a pool after calling end',
    );
  } finally {
    await listener.close();
    await inputs.dispose();
  }
});

it.each(['app', 'operator'] as const)(
  'refuses readiness when the serving %s login acquires direct data privileges',
  async (purpose) => {
    const inputs = await fixture();
    const runtime = await initializeRegistry(inputs);
    const listener = await listenRegistry(runtime, 0, '127.0.0.1');
    const login = escapeIdentifier(inputs.database.logins[purpose]);
    try {
      const address = listener.server.address();
      if (!address || typeof address === 'string')
        throw new Error('REGISTRY_TEST_HTTP_ADDRESS_MISSING');
      const ready = `http://127.0.0.1:${address.port}/readyz`;
      expect((await fetch(ready)).status).toBe(200);
      await inputs.database.owner.query(
        `GRANT SELECT ON registry_auth_user TO ${login}`,
      );
      expect((await fetch(ready)).status).toBe(503);
      expect(inputs.onDiagnostic).toHaveBeenCalledWith(
        'REGISTRY_READINESS_FAILED',
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      );
      await inputs.database.owner.query(
        `REVOKE SELECT ON registry_auth_user FROM ${login}`,
      );
      expect((await fetch(ready)).status).toBe(200);
    } finally {
      await listener.close();
      await inputs.dispose();
    }
  },
);

it('refuses unversioned startup before storage or auth despite a matching fingerprint', async () => {
  const inputs = await fixture();
  let unexpectedRuntime: RegistryRuntime | undefined;
  try {
    await inputs.database.owner.query('DROP TABLE registry_migrations.history');
    await expect(
      initializeRegistry(inputs).then((runtime) => {
        unexpectedRuntime = runtime;
        return runtime;
      }),
    ).rejects.toThrow('REGISTRY_STARTUP_FAILED');
    expect(inputs.blobs.ready).not.toHaveBeenCalled();
    expect(inputs.blobs.close).toHaveBeenCalledTimes(1);
    expect(
      (await inputs.database.owner.query('SELECT * FROM registry_auth_user'))
        .rows,
    ).toEqual([]);
    expect(
      (
        await inputs.database.owner.query(
          "SELECT to_regclass('registry_migrations.history') AS history",
        )
      ).rows,
    ).toEqual([{ history: null }]);
  } finally {
    await unexpectedRuntime?.close();
    await inputs.dispose();
  }
});

it('marks a running registry unready when versioned provenance disappears without repairing it', async () => {
  const inputs = await fixture();
  const runtime = await initializeRegistry(inputs);
  try {
    expect((await runtime.app.request('/readyz')).status).toBe(200);
    await inputs.database.owner.query('DROP TABLE registry_migrations.history');
    expect((await runtime.app.request('/readyz')).status).toBe(503);
    expect((await runtime.app.request('/healthz')).status).toBe(200);
    expect(
      (
        await inputs.database.owner.query(
          "SELECT to_regclass('registry_migrations.history') AS history",
        )
      ).rows,
    ).toEqual([{ history: null }]);
  } finally {
    await runtime.close();
    await inputs.dispose();
  }
});

it('refuses missing account assets before auth, workers and listener admission', async () => {
  const inputs = await fixture();
  try {
    await expect(
      initializeRegistry({
        ...inputs,
        accountAssetDirectory: `${inputs.accountAssetDirectory}/missing`,
      }),
    ).rejects.toEqual(new Error('REGISTRY_STARTUP_FAILED'));
    expect(
      (await inputs.database.owner.query('SELECT id FROM registry_auth_user'))
        .rows,
    ).toEqual([]);
    expect(inputs.blobs.close).toHaveBeenCalledTimes(1);
    expect(inputs.pool.ending).toBe(true);
    expect(inputs.operatorPool.ending).toBe(true);
  } finally {
    await inputs.dispose();
  }
});
