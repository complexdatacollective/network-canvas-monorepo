import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type pg from 'pg';

// Applies the committed SQL migrations in drizzle/ (generated from
// src/db/schema.ts by `pnpm db:generate`). Idempotent: applied migrations
// are journaled in drizzle.__drizzle_migrations, so re-running is a no-op.
//
// The migrations folder must be resolved by the caller: the server bundle
// relocates this module (dist/index.js in production, /app in the image),
// so only the entry point knows where drizzle/ sits relative to itself —
// the same constraint as the client asset root in src/index.ts.
export async function runMigrations(
  pool: pg.Pool,
  migrationsFolder: string,
): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder });
}
