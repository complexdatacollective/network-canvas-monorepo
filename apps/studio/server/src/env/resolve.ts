import type { RawEnv } from './variables.ts';

// The domain model the rest of the server consumes, and the cross-field rules
// that build it. `variables.ts` validates variables one at a time; the rules
// that span several of them — all-or-nothing S3, the SMTP pairing, the mailer's
// three-way resolution — cannot be expressed there and live here.

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

/**
 * OAuth sign-in providers (#1255: the launch set is magic link, Google, and
 * Microsoft). Each provider is configured independently and offered only when
 * its credential pair is complete; an absent provider simply isn't rendered
 * by the SPA.
 */
export type SocialProvidersEnv = {
  google?: { clientId: string; clientSecret: string };
  microsoft?: { clientId: string; clientSecret: string; tenantId?: string };
};

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
   * resolving the client IP for rate limiting. Unset, no forwarded header is
   * read at all — safe, but every client then shares one rate-limit bucket
   * until this is configured.
   */
  trustedProxies: string[] | undefined;
  socialProviders: SocialProvidersEnv;
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

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';

function resolveS3(raw: RawEnv): S3Env | undefined {
  const values = {
    endpoint: raw.S3_ENDPOINT,
    region: raw.S3_REGION,
    bucket: raw.S3_BUCKET,
    accessKeyId: raw.S3_ACCESS_KEY_ID,
    secretAccessKey: raw.S3_SECRET_ACCESS_KEY,
  };
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = values;
  if (endpoint && region && bucket && accessKeyId && secretAccessKey) {
    return { endpoint, region, bucket, accessKeyId, secretAccessKey };
  }

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length === Object.keys(values).length) return undefined;
  // Partial configuration is a deployment mistake, not a request for
  // defaults — fail fast rather than half-configuring a store.
  throw new Error(
    `Incomplete S3 configuration; missing: ${missing.join(', ')}`,
  );
}

function resolveMailer(raw: RawEnv, devDefaults: boolean): MailerEnv {
  if (raw.SMTP_URL) {
    if (!raw.EMAIL_FROM) {
      throw new Error('EMAIL_FROM is required when SMTP_URL is set');
    }
    return { kind: 'smtp', url: raw.SMTP_URL, from: raw.EMAIL_FROM };
  }
  // Half a mail configuration is a deployment mistake, same as partial S3.
  // Under the development defaults it is not: `.env.development` supplies
  // EMAIL_FROM so that adding SMTP_URL alone (the Mailpit loop) completes the
  // pair, which leaves it harmlessly unpaired until then.
  if (raw.EMAIL_FROM && !devDefaults) {
    throw new Error('SMTP_URL is required when EMAIL_FROM is set');
  }
  // Outside development, magic links must never fall back to the console
  // mailer: a sign-in link in a log aggregator is an account takeover.
  return devDefaults ? { kind: 'console' } : { kind: 'refuse' };
}

function resolveSocialProviders(raw: RawEnv): SocialProvidersEnv {
  const providers: SocialProvidersEnv = {};

  // Same fail-fast contract as resolveS3: half a credential pair is a
  // deployment mistake, not a request to silently drop the provider.
  if (raw.GOOGLE_CLIENT_ID || raw.GOOGLE_CLIENT_SECRET) {
    if (!raw.GOOGLE_CLIENT_ID || !raw.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        `Incomplete Google OAuth configuration; missing: ${
          raw.GOOGLE_CLIENT_ID ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID'
        }`,
      );
    }
    providers.google = {
      clientId: raw.GOOGLE_CLIENT_ID,
      clientSecret: raw.GOOGLE_CLIENT_SECRET,
    };
  }

  if (
    raw.MICROSOFT_CLIENT_ID ||
    raw.MICROSOFT_CLIENT_SECRET ||
    raw.MICROSOFT_TENANT_ID
  ) {
    if (!raw.MICROSOFT_CLIENT_ID || !raw.MICROSOFT_CLIENT_SECRET) {
      const missing = [
        !raw.MICROSOFT_CLIENT_ID && 'MICROSOFT_CLIENT_ID',
        !raw.MICROSOFT_CLIENT_SECRET && 'MICROSOFT_CLIENT_SECRET',
      ].filter(Boolean);
      throw new Error(
        `Incomplete Microsoft OAuth configuration; missing: ${missing.join(', ')}`,
      );
    }
    providers.microsoft = {
      clientId: raw.MICROSOFT_CLIENT_ID,
      clientSecret: raw.MICROSOFT_CLIENT_SECRET,
      tenantId: raw.MICROSOFT_TENANT_ID,
    };
  }

  return providers;
}

function resolveAuth(
  raw: RawEnv,
  db: DbEnv | undefined,
  devDefaults: boolean,
): AuthEnv | undefined {
  // Validated before the database check so a half-configured provider fails
  // fast even on a deployment where auth is otherwise off.
  const socialProviders = resolveSocialProviders(raw);

  // Sessions, users, and rate-limit counters all live in Postgres (#1246);
  // without a database there is nothing for auth to run on.
  if (!db) return undefined;

  if (!raw.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required when DATABASE_URL is set');
  }
  if (!raw.PUBLIC_URL) {
    throw new Error('PUBLIC_URL is required when auth is enabled');
  }

  return {
    secret: raw.BETTER_AUTH_SECRET,
    baseUrl: raw.PUBLIC_URL,
    mailer: resolveMailer(raw, devDefaults),
    trustedProxies: raw.TRUSTED_PROXIES?.length
      ? raw.TRUSTED_PROXIES
      : undefined,
    socialProviders,
  };
}

export function resolve(raw: RawEnv): StudioEnv {
  const production = raw.NODE_ENV === 'production';
  const devDefaults = raw.STUDIO_DEV_DEFAULTS === true;

  // The marker only ever arrives from the committed `.env.development`, which
  // the dev script loads and no deployment path does. Seeing it anywhere else
  // means a deployment picked that file up somehow — refuse rather than serve
  // with a publicly-known signing secret and a console mailer.
  //
  // The check is for an explicit development or test NODE_ENV rather than
  // merely "not production", because the two mistakes travel together: an
  // entrypoint that accidentally sources `.env.development` is exactly the one
  // likely to have forgotten `NODE_ENV=production`, and a guard that only
  // fires on the second would let that deployment through. `.env.development`
  // sets NODE_ENV itself, so the supported development path always satisfies
  // this.
  if (
    devDefaults &&
    raw.NODE_ENV !== 'development' &&
    raw.NODE_ENV !== 'test'
  ) {
    throw new Error(
      'STUDIO_DEV_DEFAULTS must not be set unless NODE_ENV is development or test',
    );
  }

  const db = raw.DATABASE_URL ? { url: raw.DATABASE_URL } : undefined;

  return {
    port: raw.PORT ?? DEFAULT_PORT,
    host: raw.HOST ?? DEFAULT_HOST,
    clientDist: raw.CLIENT_DIST,
    s3: resolveS3(raw),
    db,
    auth: resolveAuth(raw, db, devDefaults),
    production,
  };
}
