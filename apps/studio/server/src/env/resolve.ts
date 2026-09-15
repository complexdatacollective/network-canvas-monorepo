import { readFileSync } from 'node:fs';

import { parse as parseConnectionString } from 'pg-connection-string';

import type { DeploymentMode } from '@codaco/studio-rpc/surfaces';

import { type Keyring, parseKeyring } from '../secrets/keyring.ts';
import type { RawEnv } from './variables.ts';

export type S3Env = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type DbEnv = {
  url: string;
};

export type MailerEnv =
  | { kind: 'smtp'; url: string; from: string }
  | { kind: 'console' }
  | { kind: 'refuse' };

export type SocialProvidersEnv = {
  google?: { clientId: string; clientSecret: string };
  microsoft?: { clientId: string; clientSecret: string; tenantId?: string };
};

export type AuthEnv = {
  secret: string;
  /** The browser-facing origin; cookies and magic-link URLs are minted against it. */
  baseUrl: string;
  trustedProxies: string[] | undefined;
  socialProviders: SocialProvidersEnv;
};

// An undefined s3, db, or auth means that surface is not configured and
// refuses with 503; the server still boots.
export type StudioEnv = {
  port: number;
  host: string;
  clientDist: string | undefined;
  s3: S3Env | undefined;
  db: DbEnv | undefined;
  auth: AuthEnv | undefined;
  /**
   * The mail transport, and only where it was asked for: the worker process
   * sends every message Studio sends (#1895), so the web process never reads
   * these variables at all. `undefined` therefore means two different things by
   * design — "this process does not send mail" for the web process, and "no
   * transport is configured" for the worker, which is the `refuse` kind.
   */
  mail: MailerEnv | undefined;
  /**
   * The keyring every stored secret is encrypted with (#1900). Undefined only
   * where there is no database to hold a secret: a deployment that has one and
   * no keyring is refused here rather than allowed to write values it could
   * not read back, and both entrypoints refuse again at boot for the key ids
   * already in use.
   */
  secrets: Keyring | undefined;
  devDefaults: boolean;
  deploymentMode: DeploymentMode;
  /** Only the seed command reads it; unset means the development password. */
  seedAdminPassword: string | undefined;
};

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';

/**
 * Unset means self-hosted, the fail-closed direction. Its failure mode is
 * loud — a managed deployment that forgets the variable 404s its own pricing
 * page on the first smoke request — where defaulting the other way fails
 * silently, with an institution's own instance publishing a pricing page, a
 * plan-selection step and a billing screen it has no business showing.
 */
const DEFAULT_DEPLOYMENT_MODE: DeploymentMode = 'self-hosted';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

/**
 * Whether a Postgres connection string names this machine. What decides
 * whether a database is safe to create, destroy, or point development
 * credentials at — not `NODE_ENV`, which is `production` on previews too.
 */
export function isLocalDatabase(url: string): boolean {
  try {
    const parsed = new URL(url);
    // node-postgres lets the query string override the authority's host
    // (`?host=` and `?hostaddr=`), and connects to THAT. Judging the
    // authority alone would call `…@localhost/db?host=remote.example` local
    // and let the automatic dev-boot reset drop a remote schema. Which value
    // wins when a parameter repeats is the parser's business (its last
    // occurrence today); this check does not try to agree with it, and
    // instead calls the string local only when the authority AND every
    // override name this machine — a Unix socket path is this machine by
    // definition. A string that names any other host anywhere is not local,
    // whichever of them the parser would pick.
    const overrides = [
      ...parsed.searchParams.getAll('host'),
      ...parsed.searchParams.getAll('hostaddr'),
    ];
    return (
      LOOPBACK_HOSTS.has(parsed.hostname) &&
      overrides.every(
        (host) => host.startsWith('/') || LOOPBACK_HOSTS.has(host),
      )
    );
  } catch {
    return false;
  }
}

/**
 * Refuses a connection string that would unpin the role Studio's pools run as.
 *
 * Every pool sets pg's `options` startup parameter to `-c role=…`
 * (src/db/pool.ts), which is what keeps the server off the connecting login —
 * in development the container's superuser, which row-level security does not
 * apply to at all. node-postgres merges a connection string's parameters over
 * the configuration it was given rather than under it, so an `options` in
 * `DATABASE_URL` wins: every pool in both processes would connect as the
 * login, and nothing else in the system would notice.
 *
 * Read with `pg-connection-string`, which is the parser node-postgres itself
 * hands the string to: what it calls `options` is exactly what pg will send as
 * the startup parameter, so the guard and the pool cannot disagree about which
 * strings carry one. It is a ranged dependency rather than a pinned one for
 * that reason — pnpm then keeps the single copy `pg` already resolves, and the
 * guard cannot end up reading with a different version of the parser than the
 * pool it guards. `new URL` could disagree: it rejects the host-less form
 * `postgres://user:pass@/db?options=…` — a connection string pg accepts, and
 * one a hosting provider's socket configuration produces — which the guard
 * used to tolerate rather than refuse.
 *
 * Two formats carry no `options` by construction, and are accepted for that
 * reason rather than by an exception: the bare socket form
 * (`/var/run/postgresql studio_dev`), whose whole grammar is a path and a
 * database name, and a libpq keyword DSN (`host=… dbname=… options=…`), which
 * the parser reads as one long database name because node-postgres does not
 * accept keyword DSNs at all — pg would never honour an `options` written
 * that way.
 */
function assertPinnedRoleSurvives(url: string): void {
  // Not caught: a string this throws on is one pg would throw on too, at the
  // first connection instead of at boot. The error redacts the input itself.
  if (!('options' in parseConnectionString(url))) return;
  throw new Error(
    'DATABASE_URL must not carry an `options` parameter: it overrides the ' +
      '`role=` startup parameter every Studio pool pins its identity with, so ' +
      'the web process and the worker would both run as the connecting login ' +
      'instead of studio_app and studio_maintenance, bypassing row-level ' +
      'security. Remove `options` from the connection string.',
  );
}

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

function resolveAuth(raw: RawEnv, db: DbEnv | undefined): AuthEnv | undefined {
  // Validated before the database check so a half-configured provider fails
  // fast even on a deployment where auth is otherwise off.
  const socialProviders = resolveSocialProviders(raw);

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
    trustedProxies: raw.TRUSTED_PROXIES?.length
      ? raw.TRUSTED_PROXIES
      : undefined,
    socialProviders,
  };
}

/**
 * The keyring, or nothing where there is no database to hold a secret.
 *
 * Read before anything is written under it rather than lazily at the first
 * secret: a deployment whose keyring is missing or malformed must fail at
 * boot, while it still has the one it was using, and not halfway through its
 * first webhook subscription.
 */
function resolveSecrets(
  raw: RawEnv,
  db: DbEnv | undefined,
  readSecretsFile: (path: string) => string,
): Keyring | undefined {
  if (raw.STUDIO_SECRETS_KEY && raw.STUDIO_SECRETS_KEY_FILE) {
    // Never a guess about which one was meant: the two would usually hold the
    // same keyring, and the time they do not is the time it matters.
    throw new Error(
      'STUDIO_SECRETS_KEY and STUDIO_SECRETS_KEY_FILE are both set; set exactly one.',
    );
  }

  const path = raw.STUDIO_SECRETS_KEY_FILE;
  if (path) {
    let text: string;
    try {
      text = readSecretsFile(path);
    } catch {
      // The path, and nothing the read said: a filesystem error can quote the
      // content it was reading, and this file is entirely key material.
      throw new Error(`STUDIO_SECRETS_KEY_FILE could not be read: ${path}`);
    }
    return parseKeyring(text);
  }

  // Parsed even with no database configured: a mistake in it is worth catching
  // wherever it is set, and the parse is a base64 decode rather than anything
  // a boot would notice.
  if (raw.STUDIO_SECRETS_KEY) return parseKeyring(raw.STUDIO_SECRETS_KEY);

  if (!db) return undefined;
  throw new Error(
    'A secrets keyring is required when DATABASE_URL is set: set ' +
      'STUDIO_SECRETS_KEY_FILE to a file holding it, or STUDIO_SECRETS_KEY to ' +
      'its value. Generate the first entry with `openssl rand -base64 32` and ' +
      'write it as `k1:<value>`. Back the keyring up with the database: ' +
      'without it every stored secret is unreadable.',
  );
}

/**
 * `withMail` says the caller read `SMTP_URL` and `EMAIL_FROM` rather than
 * withholding them (see `readEnv`). Resolution cannot infer it: under the
 * development defaults an unset `SMTP_URL` means the console mailer, which is
 * indistinguishable here from the web process never having read the variable.
 *
 * `readSecretsFile` is the one filesystem read this module does. It defaults
 * to reading the file; it is injectable so the environment tests can exercise
 * the file lane and its refusals without writing key material to disk.
 */
export type ResolveOptions = {
  withMail?: boolean;
  readSecretsFile?: (path: string) => string;
};

export function resolve(raw: RawEnv, options: ResolveOptions = {}): StudioEnv {
  const devDefaults = raw.STUDIO_DEV_DEFAULTS === true;

  // Checked against an explicit development or test NODE_ENV rather than
  // merely "not production", because the two mistakes travel together: an
  // entrypoint that accidentally sources `.env.development` is exactly the one
  // likely to have forgotten `NODE_ENV=production`.
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
  if (db) assertPinnedRoleSurvives(db.url);

  // The marker travels with a publicly-known signing secret, a console mailer,
  // and a boot that applies the schema to whatever DATABASE_URL names. An
  // exported DATABASE_URL beats the committed file (Node's env-file loader
  // yields to the existing environment), so the two can meet without anyone
  // choosing it — and the lane must never carry those credentials, or that
  // DDL, to a database that isn't this machine's.
  if (devDefaults && db && !isLocalDatabase(db.url)) {
    throw new Error(
      'STUDIO_DEV_DEFAULTS is set but DATABASE_URL does not point at a local database. ' +
        'To work against a remote database, leave the development lane for the process: ' +
        'STUDIO_DEV_DEFAULTS= <command>',
    );
  }

  const secrets = resolveSecrets(
    raw,
    db,
    options.readSecretsFile ?? ((path) => readFileSync(path, 'utf8')),
  );

  return {
    port: raw.PORT ?? DEFAULT_PORT,
    host: raw.HOST ?? DEFAULT_HOST,
    clientDist: raw.CLIENT_DIST,
    s3: resolveS3(raw),
    db,
    auth: resolveAuth(raw, db),
    mail: options.withMail ? resolveMailer(raw, devDefaults) : undefined,
    secrets,
    devDefaults,
    deploymentMode: raw.STUDIO_DEPLOYMENT_MODE ?? DEFAULT_DEPLOYMENT_MODE,
    seedAdminPassword: raw.STUDIO_SEED_ADMIN_PASSWORD,
  };
}
