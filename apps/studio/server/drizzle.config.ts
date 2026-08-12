import { defineConfig } from 'drizzle-kit';

import { DEV_DATABASE_URL } from './src/env/catalogue.ts';

// drizzle-kit's config: `pnpm db:generate` diffs src/db/schema.ts against
// the snapshots in drizzle/meta and emits SQL migrations into drizzle/,
// which boot applies (src/db/migrate.ts). The credentials are only used by
// the interactive commands (`drizzle-kit studio`/`push`) and point at the
// dev Postgres from scripts/dev-pg.ts — generation itself is offline.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: DEV_DATABASE_URL },
});
