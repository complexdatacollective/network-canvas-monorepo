import { type ClientBase, Pool } from 'pg';
import { parseIntoClientConfig } from 'pg-connection-string';

// A bounded wait prevents an unavailable database from exhausting the pool
// while successive startup probes wait for the operating system's timeout.
const CONNECTION_TIMEOUT_MS = 10_000;

export type PostgresPoolOptions = {
  connectionString: string;
  /** An unquoted lowercase PostgreSQL identifier, at most 63 ASCII bytes. */
  role?: string;
  /** Maximum concurrent connections, from 1 through 32; defaults to pg's 10. */
  max?: number;
  /** Receives no error or client details, which may contain credentials. */
  onIdleError: () => void;
  /** Up to 64 uppercase letters, digits, or underscores, starting with a letter. */
  roleMismatchCode?: string;
};

/**
 * A lazy pool with a bounded connection timeout. When a role is supplied,
 * every physical connection starts as that role and RESET ROLE returns to it.
 * Without a role, the connecting login and its URL settings are unchanged.
 */
export function createPostgresPool({
  connectionString,
  role,
  max,
  onIdleError,
  roleMismatchCode = 'POSTGRES_DATABASE_ROLE_MISMATCH',
}: PostgresPoolOptions): Pool {
  if (
    role !== undefined &&
    (role.length > 63 || !/^[a-z_]/.test(role) || /[^a-z0-9_]/.test(role))
  ) {
    throw new Error('POSTGRES_POOL_INVALID_ROLE');
  }
  if (max !== undefined && (!Number.isInteger(max) || max < 1 || max > 32)) {
    throw new Error('POSTGRES_POOL_INVALID_MAX');
  }
  if (
    roleMismatchCode.length > 64 ||
    !/^[A-Z]/.test(roleMismatchCode) ||
    /[^A-Z0-9_]/.test(roleMismatchCode)
  ) {
    throw new Error('POSTGRES_POOL_INVALID_ROLE_MISMATCH_CODE');
  }

  // pg gives URL fields precedence over an options object. Parse once before
  // pinning the role, retaining host/TLS settings and other startup options.
  const parsed =
    role === undefined ? undefined : parseIntoClientConfig(connectionString);
  const onConnect =
    role === undefined
      ? undefined
      : async (client: ClientBase) => {
          const result = await client.query<{ role: string }>(
            'SELECT current_user AS role',
          );
          if (result.rows[0]?.role !== role) throw new Error(roleMismatchCode);
        };
  const configuration = {
    ...parsed,
    // A URL can itself carry a connectionString query parameter. Never let
    // the driver parse that nested value and override the pinned fields.
    connectionString: role === undefined ? connectionString : undefined,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    // Parsed URL parameters can include pool configuration too. Always write
    // a bounded max so a URL's max/poolSize cannot override the default.
    max: max ?? 10,
    options:
      role === undefined
        ? undefined
        : `${parsed?.options ? `${parsed.options} ` : ''}-c role=${role}`,
    // pg-pool awaits this hook before handing out a client; its connect event
    // does not await async listeners. Fail closed if startup parsing changes.
    onConnect,
  };
  const pool = new Pool(configuration);
  // pg discards a failed idle client before this event. Handling it prevents
  // an uncaught exception, and passing no arguments keeps connection details
  // out of the caller's diagnostic logger.
  pool.on('error', () => onIdleError());
  return pool;
}
