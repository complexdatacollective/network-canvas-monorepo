import { createHash } from 'node:crypto';

import {
  generateDrizzleJson,
  generateMigration,
  pushSchema,
} from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import { SCHEMA, SCHEMA_LOCK_KEY, SIDECARS } from '../src/db/schema.ts';

// The schema application half of src/db/schema.ts, kept out of src/ so
// drizzle-kit (and its esbuild binary) can never reach the server or Netlify
// bundles. The server only verifies; everything that provisions or reconciles
// a database goes through here, from a repo checkout.

/** The canonical DDL: the tables as drizzle-kit renders them, then the sidecars. */
export async function renderSchemaStatements(): Promise<string[]> {
  const statements = await generateMigration(
    await generateDrizzleJson({}),
    await generateDrizzleJson(SCHEMA),
  );
  return [...statements, ...SIDECARS];
}

export async function computeSchemaFingerprint(): Promise<string> {
  return createHash('sha256')
    .update((await renderSchemaStatements()).join('\n'))
    .digest('hex');
}

export type ApplyOutcome = {
  statements: string[];
  hints: { hint: string; statement?: string }[];
};

/**
 * drizzle-kit push: introspects the live database, applies whatever delta
 * brings it to the definitions, re-runs the sidecars (CREATE OR REPLACE), and
 * stamps the fingerprint. Not transactional — a failure partway leaves an
 * unstamped database, which checkSchema reports as stale and db:reset
 * remedies. The advisory lock serialises concurrent runs.
 */
export async function applySchema(pool: pg.Pool): Promise<ApplyOutcome> {
  const fingerprint = await computeSchemaFingerprint();
  if (fingerprint !== SCHEMA_FINGERPRINT) {
    throw new Error(
      'src/db/fingerprint.generated.ts does not match the schema definitions; run: pnpm --filter @codaco/studio-server sync-fingerprint',
    );
  }

  const lock = await pool.connect();
  try {
    await lock.query(`select pg_advisory_lock(${SCHEMA_LOCK_KEY})`);
    const push = await pushSchema(SCHEMA, drizzle({ client: pool }));
    await push.apply();
    await lock.query(SIDECARS.join('\n'));
    await lock.query(
      `insert into "schemaFingerprint" ("fingerprint") values ($1)
       on conflict ("id") do update set "fingerprint" = excluded."fingerprint", "appliedAt" = CURRENT_TIMESTAMP`,
      [fingerprint],
    );
    return { statements: push.sqlStatements, hints: push.hints };
  } finally {
    await lock
      .query(`select pg_advisory_unlock(${SCHEMA_LOCK_KEY})`)
      .catch(() => undefined);
    lock.release();
  }
}
