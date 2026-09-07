import { randomBytes } from 'node:crypto';

import type pg from 'pg';
import { z } from 'zod';

import { assertSafePostgresMigrationEvidence } from '@codaco/studio-sync/postgres-migration-evidence';

import { REGISTRY_SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';

const stampSchema = z.strictObject({
  fingerprint: z.literal(REGISTRY_SCHEMA_FINGERPRINT),
  instance_id: z.uuid(),
});

/** Read-only boot check; the separate migration command owns every schema write. */
export async function readRegistrySchemaIdentity(
  pool: pg.Pool | pg.PoolClient,
): Promise<string> {
  try {
    // A development schema push can carry the same fingerprint. Only the
    // operator migration path creates this table; runtime roles cannot read
    // its contents or adopt a schema. Catalog inspection needs no history
    // schema USAGE grant, and an owner-backed view is not migration provenance.
    const provenance = await pool.query<{ versioned: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'registry_migrations'
          AND relation.relname = 'history' AND relation.relkind = 'r'
      ) AS versioned
    `);
    if (provenance.rows[0]?.versioned !== true)
      throw new Error('REGISTRY_SCHEMA_NOT_CURRENT');
    await assertSafePostgresMigrationEvidence(pool, {
      history: { schema: 'registry_migrations', name: 'history' },
      fingerprint: { schema: 'public', name: 'registry_schema_fingerprint' },
    });
    const result = await pool.query<{
      fingerprint: string;
      instance_id: string;
    }>(
      'SELECT fingerprint, instance_id FROM public.registry_schema_fingerprint',
    );
    if (result.rows.length !== 1)
      throw new Error('REGISTRY_SCHEMA_NOT_CURRENT');
    return stampSchema.parse(result.rows[0]).instance_id;
  } catch {
    throw new Error('REGISTRY_SCHEMA_NOT_CURRENT');
  }
}

export async function verifyRegistryDatabases(
  pool: pg.Pool,
  operatorPool: pg.Pool,
): Promise<string> {
  const identities = await Promise.all([
    readRegistrySchemaIdentity(pool),
    readRegistrySchemaIdentity(operatorPool),
  ]);
  if (identities[0] !== identities[1])
    throw new Error('REGISTRY_DATABASES_DO_NOT_MATCH');
  // Backups retain their installation ID. A fresh random database-scoped lock
  // proves that both sockets see the same live PostgreSQL lock manager as well.
  // Transaction-scoped locks leave no persistent probe rows or pooled locks.
  const key = randomBytes(8).readBigInt64BE().toString();
  const app = await pool.connect();
  let operator: pg.PoolClient | undefined;
  let appDiscard = false;
  let operatorDiscard = false;
  try {
    operator = await operatorPool.connect();
    await app.query('BEGIN');
    await operator.query('BEGIN');
    await app.query('SELECT pg_advisory_xact_lock($1::bigint)', [key]);
    const challenge = await operator.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',
      [key],
    );
    if (challenge.rows[0]?.acquired !== false)
      throw new Error('REGISTRY_DATABASES_DO_NOT_MATCH');
  } finally {
    try {
      await app.query('ROLLBACK');
    } catch {
      appDiscard = true;
    }
    try {
      await operator?.query('ROLLBACK');
    } catch {
      operatorDiscard = true;
    }
    app.release(appDiscard);
    operator?.release(operatorDiscard);
  }
  return identities[0];
}

/** The instance identity survives schema upgrades and backup restoration. */
export async function stampRegistryFingerprint(
  client: pg.PoolClient,
  fingerprint: string,
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(fingerprint))
    throw new Error('REGISTRY_SCHEMA_FINGERPRINT_INVALID');
  await client.query(
    `INSERT INTO public.registry_schema_fingerprint(fingerprint) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET fingerprint = excluded.fingerprint, applied_at = statement_timestamp()`,
    [fingerprint],
  );
}
