/* oxlint-disable no-process-env -- the single sanctioned environment boundary
 * for the Studio server; everything else imports from here. */

export type S3Env = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type DbEnv = {
  /** Postgres connection string, `pg.Pool`'s native format. */
  url: string;
};

/**
 * How magic-link email leaves the server. Fully resolved here so the auth
 * layer never consults the environment: `smtp` in any configured deployment,
 * `console` as the development loop (the link is printed to the server log),
 * `refuse` in production without SMTP — sends fail loudly rather than
 * silently dropping mail.
 */
export type MailerEnv =
  | { kind: 'smtp'; url: string; from: string }
  | { kind: 'console' }
  | { kind: 'refuse' };

export type AuthEnv = {
  secret: string;
  /**
   * The browser-facing origin — cookies and magic-link URLs are minted
   * against it. In development that is the Vite dev server, which proxies
   * every server path (single-origin invariant, #1245).
   */
  baseUrl: string;
  mailer: MailerEnv;
  /**
   * Proxy addresses/CIDRs whose X-Forwarded-For may be trusted when
   * resolving the client IP for rate limiting. Unset, a forwarded header is
   * not trusted — safe, but a proxied deployment then shares one rate-limit
   * bucket across all clients until this is configured.
   */
  trustedProxies: string[] | undefined;
};

export type StudioEnv = {
  port: number;
  host: string;
  /**
   * Directory of built client assets to serve for the self-host topology,
   * resolved against the working directory. Unset means the production
   * default (`../client` relative to the server bundle — the Docker image
   * layout); in development the Vite dev server serves the client instead
   * and this path simply doesn't resolve.
   */
  clientDist: string | undefined;
  /**
   * Object storage (#1246, 2026-08-11): the S3 API is the contract — R2 in
   * the managed topology, MinIO or any S3-compatible endpoint self-hosted.
   * Undefined means asset storage is not configured and the asset routes
   * refuse with 503.
   */
  s3: S3Env | undefined;
  /**
   * Postgres (#1246): the only relational store in either topology.
   * Undefined means no database is configured; surfaces that need one
   * (auth, and eventually sync) refuse rather than the server failing to
   * boot — the same degradation contract as `s3`.
   */
  db: DbEnv | undefined;
  /**
   * Authentication (#1255, #1245): requires the database. Undefined means
   * auth is not configured — `/api/auth/*` refuses with 503 and protected
   * procedures refuse, but the server boots.
   */
  auth: AuthEnv | undefined;
  production: boolean;
};

// Must match scripts/dev-s3.ts, which provisions this MinIO in Docker.
const DEV_S3: S3Env = {
  endpoint: 'http://localhost:9100',
  region: 'us-east-1',
  bucket: 'studio-dev',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
};

function readS3(): S3Env | undefined {
  const values = {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };
  const set = Object.values(values).filter(Boolean).length;
  if (set === 5) return values as S3Env;
  // Partial configuration is a deployment mistake, not a request for
  // defaults — fail fast rather than silently pointing at dev MinIO.
  if (set > 0) {
    const missing = Object.entries(values)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    throw new Error(
      `Incomplete S3 configuration; missing: ${missing.join(', ')}`,
    );
  }
  return process.env.NODE_ENV === 'production' ? undefined : DEV_S3;
}

// Must match scripts/dev-pg.ts, which provisions this Postgres in Docker.
// Instance and credentials are shared with packages/studio-sync's
// conformance suite so one dev container serves both.
const DEV_DATABASE_URL = 'postgres://postgres:spike@127.0.0.1:54318/studio_dev';

function readDb(production: boolean): DbEnv | undefined {
  const url = process.env.DATABASE_URL;
  if (url) return { url };
  return production ? undefined : { url: DEV_DATABASE_URL };
}

const DEV_AUTH_SECRET = 'studio-dev-secret-not-for-production';
const DEV_BASE_URL = 'http://localhost:5173';
const DEV_EMAIL_FROM = 'studio-dev@localhost';

function readMailer(realDeployment: boolean): MailerEnv {
  const url = process.env.SMTP_URL;
  const from = process.env.EMAIL_FROM;
  if (url) {
    if (from) return { kind: 'smtp', url, from };
    if (!realDeployment) return { kind: 'smtp', url, from: DEV_EMAIL_FROM };
    throw new Error('EMAIL_FROM is required when SMTP_URL is set');
  }
  // Half a mail configuration is a deployment mistake, same as partial S3.
  if (from) throw new Error('SMTP_URL is required when EMAIL_FROM is set');
  // On any real deployment, magic links must never fall back to the console
  // mailer: a sign-in link in a log aggregator is an account takeover.
  return realDeployment ? { kind: 'refuse' } : { kind: 'console' };
}

function readAuth(
  db: DbEnv | undefined,
  production: boolean,
): AuthEnv | undefined {
  // Sessions, users, and rate-limit counters all live in Postgres (#1246);
  // without a database there is nothing for auth to run on.
  if (!db) return undefined;

  // Dev conveniences (publicly-known secret, localhost origin, console
  // mailer) are keyed to the dev-default database, NOT to NODE_ENV: an
  // explicitly configured DATABASE_URL marks a real deployment, and a real
  // deployment that forgot NODE_ENV=production must still never sign
  // sessions with the dev secret.
  const realDeployment = production || Boolean(process.env.DATABASE_URL);

  const secret =
    process.env.BETTER_AUTH_SECRET ||
    (realDeployment ? undefined : DEV_AUTH_SECRET);
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET is required when DATABASE_URL is set');
  }
  // PUBLIC_URL, matching Fresco's name for the same thing. (Not BASE_URL:
  // Vite-driven runtimes — including vitest — set process.env.BASE_URL to
  // '/', which would silently shadow the real configuration.)
  const baseUrl =
    process.env.PUBLIC_URL || (realDeployment ? undefined : DEV_BASE_URL);
  if (!baseUrl) {
    throw new Error('PUBLIC_URL is required when auth is enabled');
  }
  const trustedProxies = process.env.TRUSTED_PROXIES?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    secret,
    baseUrl,
    mailer: readMailer(realDeployment),
    trustedProxies: trustedProxies?.length ? trustedProxies : undefined,
  };
}

export function readEnv(): StudioEnv {
  const rawPort = process.env.PORT;
  const port = rawPort == null || rawPort === '' ? 3000 : Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${JSON.stringify(rawPort)}`);
  }

  const production = process.env.NODE_ENV === 'production';
  const db = readDb(production);

  return {
    port,
    host: process.env.HOST ?? '0.0.0.0',
    clientDist: process.env.CLIENT_DIST || undefined,
    s3: readS3(),
    db,
    auth: readAuth(db, production),
    production,
  };
}
