// Harness for `npx @better-auth/cli generate` — not part of the server
// runtime. Builds the same instance shape as src/auth/better-auth.ts so the
// emitted schema covers exactly the configured plugin set; the output is
// reviewed into src/db/schema.ts (see that file for the regeneration
// procedure).
import pg from 'pg';

import { createBetterAuthInstance } from '../src/auth/better-auth.ts';
import { createConsoleMailer } from '../src/auth/email.ts';

export const auth = createBetterAuthInstance(
  {
    secret: 'schema-generation-only',
    baseUrl: 'http://localhost:5173',
    mailer: { kind: 'console' },
  },
  // The dev Postgres from scripts/dev-pg.ts: generate diffs the live schema.
  new pg.Pool({
    connectionString: 'postgres://postgres:spike@127.0.0.1:54318/studio_dev',
  }),
  createConsoleMailer(),
);
