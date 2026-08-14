/* oxlint-disable no-process-env -- the single sanctioned environment boundary
 * for the pg-backed suites' Postgres location. */

export const PGPORT = Number(process.env.PGPORT ?? 54318);
