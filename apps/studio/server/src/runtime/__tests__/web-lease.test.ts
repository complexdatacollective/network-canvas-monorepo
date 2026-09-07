import { fileURLToPath } from 'node:url';

import { expect, it, vi } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createPool } from '../../db/pool.ts';
import { checkSchema } from '../../db/schema.ts';
import { acquireWebLease } from '../web-lease.ts';

const database = await reachableDb();

it('binds one web lease to the resolved Studio tables across different search-path prefixes', async () => {
  if (!database) throw new Error('A local PostgreSQL instance is required.');
  const scratch = await createScratchDatabase(database);
  const publicPool = createPool(scratch.db);
  const alternateUrl = new URL(scratch.db.url);
  alternateUrl.searchParams.set('options', '-c search_path=pg_catalog,public');
  const alternatePool = createPool({ url: alternateUrl.href });
  const lost = vi.fn();
  const leases: Awaited<ReturnType<typeof acquireWebLease>>[] = [];
  try {
    const allowedLogins = await enrollMigrationTestDatabase(
      scratch.pool,
      database,
    );
    await migrateDatabase(
      scratch.pool,
      await readMigrations(
        fileURLToPath(new URL('../../../migrations', import.meta.url)),
      ),
      SCHEMA_FINGERPRINT,
      allowedLogins,
    );
    const locations = [];
    for (const pool of [publicPool, alternatePool]) {
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
      locations.push(
        (
          await pool.query<{ namespace: string; evidence: number }>(
            `SELECT current_schema() AS namespace, to_regclass('"schemaFingerprint"')::oid AS evidence`,
          )
        ).rows[0]!,
      );
    }
    expect(locations.map(({ namespace }) => namespace)).toEqual([
      'public',
      'pg_catalog',
    ]);
    expect(locations[0]!.evidence).toBeGreaterThan(0);
    expect(locations[1]!.evidence).toBe(locations[0]!.evidence);

    const first = await acquireWebLease(publicPool, lost);
    leases.push(first);
    await expect(
      acquireWebLease(alternatePool, lost).then((lease) => {
        leases.push(lease);
      }),
    ).rejects.toThrow('A Studio web process already owns this database.');

    leases.shift()!.stop();
    // Stop destroys the dedicated session; wait for its real server-side
    // release, rather than assuming that a local release call has arrived.
    await expect
      .poll(async () => {
        try {
          leases.push(await acquireWebLease(alternatePool, lost));
          return true;
        } catch {
          return false;
        }
      })
      .toBe(true);
    expect(lost).not.toHaveBeenCalled();
  } finally {
    for (const lease of leases) lease.stop();
    await Promise.all([publicPool.end(), alternatePool.end()]);
    await scratch.dispose();
  }
});
