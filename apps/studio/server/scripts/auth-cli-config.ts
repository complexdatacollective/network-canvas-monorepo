// Harness for `npx @better-auth/cli generate` — not part of the server
// runtime. Builds the real instance from src/auth/better-auth.ts so the
// emitted schema covers exactly the configured plugin set. Because that
// instance uses the drizzle adapter, the CLI emits a Drizzle TS schema:
// review its diff into src/db/schema.ts, then `pnpm db:generate` (see
// src/db/schema.ts for the full regeneration procedure).
import pg from 'pg';

import { createBetterAuthInstance } from '../src/auth/better-auth.ts';
import { createConsoleMailer } from '../src/auth/email.ts';
import { DEV, DEV_DATABASE_URL } from '../src/env/catalogue.ts';

export const auth = createBetterAuthInstance(
  {
    secret: 'schema-generation-only',
    baseUrl: DEV.baseUrl,
    mailer: { kind: 'console' },
    trustedProxies: undefined,
    socialProviders: {},
  },
  // The dev Postgres from scripts/dev-pg.ts: generate diffs the live schema.
  new pg.Pool({ connectionString: DEV_DATABASE_URL }),
  createConsoleMailer(),
);
