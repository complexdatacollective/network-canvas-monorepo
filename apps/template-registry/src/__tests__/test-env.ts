/* oxlint-disable node/no-process-env -- the single disposable PostgreSQL test boundary; no deployment env is loaded. */

const connection = new URL('postgres://127.0.0.1/postgres');
connection.port = process.env.PGPORT ?? '54318';
connection.username = process.env.PGUSER ?? 'postgres';
connection.password = process.env.PGPASSWORD ?? 'spike';

export const REGISTRY_TEST_DATABASE_URL = connection.href;
