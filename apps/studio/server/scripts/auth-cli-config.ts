// Harness for `npx @better-auth/cli generate` — not part of the server
// runtime. Builds the same instance shape as src/auth/better-auth.ts so the
// emitted drizzle schema covers exactly the configured plugin set; the output
// is reviewed into src/db/auth-schema.ts (see that file for the regeneration
// procedure).
import { randomBytes } from 'node:crypto';

import pg from 'pg';

import { createBetterAuthInstance } from '../src/auth/better-auth.ts';
import { DEV, DEV_DATABASE_URL } from '../src/env/development.ts';
import { createSecretsCipher } from '../src/secrets/cipher.ts';
import { parseKeyring } from '../src/secrets/keyring.ts';

export const auth = createBetterAuthInstance(
  {
    secret: 'schema-generation-only',
    baseUrl: DEV.baseUrl,
    trustedProxies: undefined,
    socialProviders: {},
  },
  // The dev Postgres from scripts/dev.ts: generate diffs the live schema.
  new pg.Pool({ connectionString: DEV_DATABASE_URL }),
  // Nothing is sent from here; the generator only reads the plugin set.
  () => Promise.resolve(),
  // Likewise nothing is sealed: the generator never runs a query. A key minted
  // here and discarded keeps that true — a real one would put live material in
  // a developer's schema-generation run for no purpose.
  createSecretsCipher(
    parseKeyring(
      `schema-generation-only:${randomBytes(32).toString('base64')}`,
    ),
  ),
);
