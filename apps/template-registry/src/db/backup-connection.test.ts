import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { createRegistryInstallation } from '../__tests__/installation.ts';
import { assertRegistryBackupAccess } from './backup.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import { registryMigrator } from './migrate.ts';
import { REGISTRY_BACKUP_ROLE } from './schema.ts';

const migrations = await readMigrations(
  fileURLToPath(new URL('../../migrations', import.meta.url)),
  'Template Registry',
);
const failure = new Error('REGISTRY_BACKUP_ACCESS_UNSAFE');

async function installed() {
  const f = await createRegistryInstallation();
  try {
    await registryMigrator.migrate(
      f.owner,
      migrations,
      REGISTRY_SCHEMA_FINGERPRINT,
      f.allowedLogins,
    );
    return f;
  } catch (error) {
    await f.dispose();
    throw error;
  }
}

it('borrows one real backup connection for the entire verifier and returns it cleanly', async () => {
  const f = await installed();
  try {
    const warm = await f.backupPool.connect();
    const originalErrorListeners = warm.listeners('error');
    warm.release();
    let acquisitions = 0;
    const onAcquire = () => {
      acquisitions += 1;
    };
    f.backupPool.on('acquire', onAcquire);
    try {
      await assertRegistryBackupAccess(f.backupPool);
      expect(acquisitions).toBe(1);
    } finally {
      f.backupPool.off('acquire', onAcquire);
    }
    expect(f.backupPool.totalCount).toBe(1);
    expect(f.backupPool.idleCount).toBe(1);
    const client = await f.backupPool.connect();
    try {
      expect(client).toBe(warm);
      expect(client.listeners('error')).toEqual(originalErrorListeners);
      expect(
        (
          await client.query(
            "SELECT current_user AS role, session_user AS login, current_setting('transaction_read_only') AS readonly",
          )
        ).rows,
      ).toEqual([
        { role: REGISTRY_BACKUP_ROLE, login: f.logins.backup, readonly: 'off' },
      ]);
    } finally {
      client.release();
    }
  } finally {
    await f.dispose();
  }
});

it('preserves the supplied client transaction and savepoint on acceptance and refusal', async () => {
  const f = await installed();
  try {
    const client = await f.backupPool.connect();
    try {
      await client.query(
        "BEGIN READ ONLY; SET LOCAL application_name = 'caller-owned-backup'; SAVEPOINT caller_guard",
      );
      await assertRegistryBackupAccess(client);
      expect(
        (
          await client.query(
            "SELECT current_user AS role, current_setting('application_name') AS marker, current_setting('transaction_read_only') AS readonly",
          )
        ).rows,
      ).toEqual([
        {
          role: REGISTRY_BACKUP_ROLE,
          marker: 'caller-owned-backup',
          readonly: 'on',
        },
      ]);
      await client.query('SET LOCAL ROLE NONE');
      await expect(assertRegistryBackupAccess(client)).rejects.toEqual(failure);
      await client.query('ROLLBACK TO SAVEPOINT caller_guard');
      expect(
        (
          await client.query(
            "SELECT current_user AS role, current_setting('application_name') AS marker",
          )
        ).rows,
      ).toEqual([
        { role: REGISTRY_BACKUP_ROLE, marker: 'caller-owned-backup' },
      ]);
      expect(f.backupPool.idleCount).toBe(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    await expect(
      assertRegistryBackupAccess(f.backupPool),
    ).resolves.toBeUndefined();
  } finally {
    await f.dispose();
  }
});

it('keeps the actual catalog-query borrower identity in a read-only transaction until verification finishes', async () => {
  const f = await installed();
  try {
    const pid = (
      await f.backupPool.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      )
    ).rows[0]!.pid;
    let borrowed: pg.PoolClient | undefined;
    const onAcquire = (client: pg.PoolClient) => {
      borrowed = client;
    };
    f.backupPool.on('acquire', onAcquire);
    try {
      await f.withAdministrator(async (locker) =>
        f.withAdministrator(async (observer) => {
          const lock = await locker.connect();
          try {
            await lock.query(
              'BEGIN; LOCK TABLE pg_catalog.pg_init_privs IN ACCESS EXCLUSIVE MODE',
            );
            const decision = assertRegistryBackupAccess(f.backupPool).then(
              () => null,
              (error: unknown) => error,
            );
            await expect
              .poll(
                async () =>
                  (
                    await observer.query<{ blocked: boolean }>(
                      "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND relation = 'pg_catalog.pg_init_privs'::regclass AND NOT granted) AS blocked",
                      [pid],
                    )
                  ).rows[0]?.blocked,
              )
              .toBe(true);
            if (!borrowed) throw new Error('BACKUP_TEST_BORROWER_MISSING');
            // This real read queues behind the blocked catalog query, before
            // verification can finish and enqueue COMMIT on the same connection.
            const state = borrowed.query(
              "SELECT pg_backend_pid() AS pid, current_user AS role, session_user AS login, current_setting('transaction_read_only') AS readonly",
            );
            await lock.query('ROLLBACK');
            expect((await state).rows).toEqual([
              {
                pid,
                role: REGISTRY_BACKUP_ROLE,
                login: f.logins.backup,
                readonly: 'on',
              },
            ]);
            expect(await decision).toBeNull();
          } finally {
            await lock.query('ROLLBACK');
            lock.release();
          }
        }),
      );
    } finally {
      f.backupPool.off('acquire', onAcquire);
    }
  } finally {
    await f.dispose();
  }
});

it('redacts actual connection authentication failures without retaining a borrower', async () => {
  const f = await installed();
  const url = new URL(f.backupDatabaseUrl);
  url.password = 'private-provider-failure-that-must-not-escape';
  const pool = createPostgresPool({
    connectionString: url.toString(),
    role: REGISTRY_BACKUP_ROLE,
    max: 1,
    onIdleError: () => {
      throw new Error('BACKUP_TEST_IDLE_FAILURE');
    },
  });
  try {
    await expect(assertRegistryBackupAccess(pool)).rejects.toEqual(failure);
    expect(pool.totalCount).toBe(0);
    await expect(
      assertRegistryBackupAccess(f.backupPool),
    ).resolves.toBeUndefined();
  } finally {
    await pool.end();
    await f.dispose();
  }
});

it.each(['terminate', 'deadline'] as const)(
  'discards the pinned borrower after actual catalog-query %s and preserves fixed errors',
  async (cause) => {
    const f = await installed();
    try {
      const warm = await f.backupPool.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      const pid = warm.rows[0]!.pid;
      await f.withAdministrator(async (locker) => {
        await f.withAdministrator(async (observer) => {
          const lock = await locker.connect();
          try {
            await lock.query(
              'BEGIN; LOCK TABLE pg_catalog.pg_init_privs IN ACCESS EXCLUSIVE MODE',
            );
            const started = performance.now();
            const result = assertRegistryBackupAccess(f.backupPool).then(
              () => null,
              (error: unknown) => error,
            );
            await expect
              .poll(
                async () =>
                  (
                    await observer.query<{ blocked: boolean }>(
                      "SELECT wait_event_type = 'Lock' AND query LIKE 'WITH identities AS MATERIALIZED%' AND EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND relation = 'pg_catalog.pg_init_privs'::regclass AND NOT granted) AS blocked FROM pg_stat_activity WHERE pid = $1",
                      [pid],
                    )
                  ).rows[0]?.blocked,
              )
              .toBe(true);
            expect(f.backupPool.totalCount).toBe(1);
            expect(f.backupPool.idleCount).toBe(0);
            if (cause === 'terminate') {
              expect(
                (
                  await observer.query(
                    'SELECT pg_terminate_backend($1) AS terminated',
                    [pid],
                  )
                ).rows,
              ).toEqual([{ terminated: true }]);
            }
            expect(await result).toEqual(failure);
            expect(performance.now() - started).toBeLessThan(15_000);
            expect(f.backupPool.totalCount).toBe(0);
            expect(f.backupPool.waitingCount).toBe(0);
          } finally {
            await lock.query('ROLLBACK');
            lock.release();
          }
        });
      });
      await expect(
        assertRegistryBackupAccess(f.backupPool),
      ).resolves.toBeUndefined();
      expect(
        (await f.backupPool.query('SELECT pg_backend_pid() AS pid')).rows,
      ).not.toEqual([{ pid }]);
    } finally {
      await f.dispose();
    }
  },
);

it('bounds pool acquisition and discards a borrower that arrives after the verification deadline', async () => {
  const f = await installed();
  // A valid pg Pool can have a longer acquisition bound than the verifier.
  const pool = new pg.Pool({
    connectionString: f.backupDatabaseUrl,
    options: `-c role=${REGISTRY_BACKUP_ROLE}`,
    max: 1,
    connectionTimeoutMillis: 20_000,
  });
  try {
    const held = await pool.connect();
    try {
      expect(
        (await held.query('SELECT current_user AS role, session_user AS login'))
          .rows,
      ).toEqual([{ role: REGISTRY_BACKUP_ROLE, login: f.logins.backup }]);
      const started = performance.now();
      const result = assertRegistryBackupAccess(pool).then(
        () => null,
        (error: unknown) => error,
      );
      await expect.poll(() => pool.waitingCount).toBe(1);
      expect(await result).toEqual(failure);
      expect(performance.now() - started).toBeLessThan(15_000);
      // The pool's own 20-second acquisition timeout has not fired.
      expect(pool.waitingCount).toBe(1);
    } finally {
      held.release();
    }
    await expect.poll(() => pool.totalCount).toBe(0);
    expect(pool.waitingCount).toBe(0);
    await expect(assertRegistryBackupAccess(pool)).resolves.toBeUndefined();
  } finally {
    await pool.end();
    await f.dispose();
  }
});
