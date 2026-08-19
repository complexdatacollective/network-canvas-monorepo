import { createHash } from 'node:crypto';

import {
  generateDrizzleJson,
  generateMigration,
  pushSchema,
} from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import {
  SCHEMA,
  SCHEMA_LOCK_KEY,
  SIDECARS,
  stampFingerprint,
} from '../src/db/schema.ts';

// Kept out of src/ so drizzle-kit (and its esbuild binary) can never reach
// the server or Netlify bundles.

let rendered: Promise<string[]> | undefined;

export function renderSchemaStatements(): Promise<string[]> {
  rendered ??= (async () => {
    const statements = await generateMigration(
      await generateDrizzleJson({}),
      await generateDrizzleJson(SCHEMA),
    );
    return [...statements, ...SIDECARS];
  })();
  return rendered;
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
 * Not transactional — a push failure partway leaves an unstamped database,
 * which checkSchema reports as stale and db:reset remedies.
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
    await stampFingerprint(lock, fingerprint);
    return { statements: push.sqlStatements, hints: push.hints };
  } finally {
    await lock
      .query(`select pg_advisory_unlock(${SCHEMA_LOCK_KEY})`)
      .catch(() => undefined);
    lock.release();
  }
}
