import process from 'node:process';

import { SEED_ADMIN_PASSWORD } from '../src/db/seed/teams.ts';
import { type DbEnv, isLocalDatabase, type StudioEnv } from '../src/env.ts';

/**
 * The connection string is what gets destroyed, so it is what decides whether
 * a destructive command needs confirming — not NODE_ENV, which is `production`
 * on previews too. A non-local target needs both an explicit --force and a
 * password chosen for that instance: the published development password is a
 * working credential on any reachable instance that keeps it.
 */
export function confirmDestructiveTarget(
  env: StudioEnv,
  force: boolean,
  verb: string,
): { db: DbEnv; target: string } {
  if (!env.db) {
    console.error(`DATABASE_URL is not set; there is no database to ${verb}.`);
    process.exit(1);
  }
  const url = new URL(env.db.url);
  const target = `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  if (isLocalDatabase(env.db.url)) return { db: env.db, target };
  if (!force) {
    console.error(
      `Refusing to ${verb} ${target}: it is not a local database. Pass --force to do it anyway.`,
    );
    process.exit(1);
  }
  // Present is not enough: the variable set to the published value would
  // hand the known credential ownership of every seeded team on a reachable
  // instance, which is exactly what the variable exists to prevent.
  if (!env.seedAdminPassword || env.seedAdminPassword === SEED_ADMIN_PASSWORD) {
    console.error(
      `Refusing to seed ${target} with the published development password. Set STUDIO_SEED_ADMIN_PASSWORD to a value chosen for this instance.`,
    );
    process.exit(1);
  }
  return { db: env.db, target };
}
