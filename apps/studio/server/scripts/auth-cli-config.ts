// Harness for `npx @better-auth/cli generate` — not part of the server
// runtime. Builds the same instance shape as src/auth/better-auth.ts so the
// emitted drizzle schema covers exactly the configured plugin set; the output
// is reviewed into src/db/auth-schema.ts (see that file for the regeneration
// procedure).
import { randomBytes } from 'node:crypto';

import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { createBetterAuthInstance } from '../src/auth/better-auth.ts';
import { AUTH_TABLES } from '../src/db/auth-schema.ts';
import { DEV, DEV_DATABASE_URL } from '../src/env/development.ts';
import { createSecretsCipher } from '../src/secrets/cipher.ts';
import { parseKeyring } from '../src/secrets/keyring.ts';

export const auth = createBetterAuthInstance({
  env: {
    secret: 'schema-generation-only',
    baseUrl: DEV.baseUrl,
    trustedProxies: undefined,
    socialProviders: {},
  },
  // The drizzle adapter, not the server's: generate emits a schema in the
  // adapter's own dialect, and a drizzle schema is what src/db/auth-schema.ts
  // is. The dev Postgres from scripts/dev.ts: generate diffs the live schema.
  adapter: drizzleAdapter(
    drizzle({ client: new pg.Pool({ connectionString: DEV_DATABASE_URL }) }),
    { provider: 'pg', schema: AUTH_TABLES },
  ),
  // Nothing is sent from here; the generator only reads the plugin set.
  sendMagicLink: () => Promise.resolve(),
  // Likewise nothing is sealed: the generator never runs a query. A key minted
  // here and discarded keeps that true — a real one would put live material in
  // a developer's schema-generation run for no purpose.
  cipher: createSecretsCipher(
    parseKeyring(
      `schema-generation-only:${randomBytes(32).toString('base64')}`,
    ),
  ),
});
