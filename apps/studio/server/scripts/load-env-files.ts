import { existsSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { isLocalDatabase } from '../src/env.ts';

const file = (name: string) =>
  fileURLToPath(new URL(`../${name}`, import.meta.url));

/**
 * For scripts that decide what to touch from the environment, rather than
 * taking `--env-file` flags: which files apply depends on what they find.
 * `.env` is read first and decides — the committed development defaults join
 * it only for a local target, so a `--force` reset of a managed database is
 * never handed the development marker and the publicly-known credentials it
 * licenses. A developer whose `.env` points at their own local Postgres still
 * gets the rest of the development lane, and so does a plain `pnpm dev`
 * checkout with no `.env` at all.
 */
export function loadEnvFiles(): void {
  if (existsSync(file('.env'))) process.loadEnvFile(file('.env'));
  const target = process.env.DATABASE_URL;
  if (
    (!target || isLocalDatabase(target)) &&
    existsSync(file('.env.development'))
  ) {
    process.loadEnvFile(file('.env.development'));
  }
}
