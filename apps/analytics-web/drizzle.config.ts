import dotenv from 'dotenv';
dotenv.config();

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    // eslint-disable-next-line no-process-env, turbo/no-undeclared-env-vars
    connectionString: process.env.POSTGRES_URL!,
  },
  verbose: true,
  strict: true,
});
