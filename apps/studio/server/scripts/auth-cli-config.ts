// Harness for `npx @better-auth/cli generate` — not part of the server
// runtime. Builds the same instance shape as src/auth/better-auth.ts so the
// emitted drizzle schema covers exactly the configured plugin set; the output
// is reviewed into src/db/auth-schema.ts (see that file for the regeneration
// procedure).
import { createBetterAuthInstance } from '../src/auth/better-auth.ts';
import { createConsoleMailer } from '../src/auth/email.ts';
import { createOwnerPool } from '../src/db/pool.ts';
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
  createOwnerPool({ url: DEV_DATABASE_URL }),
  createConsoleMailer(),
);
