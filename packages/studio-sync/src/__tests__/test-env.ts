/* oxlint-disable no-process-env -- the single sanctioned environment boundary
 * for the conformance suite's Postgres location. */

export const PGPORT = Number(process.env.PGPORT ?? 54318);
export const PGUSER = process.env.PGUSER ?? 'postgres';
export const PGPASSWORD = process.env.PGPASSWORD ?? 'spike';

export const CI = process.env.CI === 'true';
