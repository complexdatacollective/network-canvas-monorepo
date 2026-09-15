import { readFileSync } from 'node:fs';

import { parse as parseConnectionString } from 'pg-connection-string';

import type { DeploymentMode } from '@codaco/studio-rpc/surfaces';

import {
  parseRateLimitSpec,
  type RateLimitSettings,
} from '../rate-limit/scopes.ts';
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
  /** The worker's loopback health listener; the web process never binds it. */
  workerHealthPort: number;
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
  /**
   * The shared rate-limit store (#1909). Undefined means no store: every limit
   * is disabled and the limiter says so at boot, which is the same posture the
   * store being unreachable takes at run time — a rate limit protects against
   * abuse and is not a correctness guarantee.
   */
  redis: string | undefined;
  /** What each rate-limited scope allows; see src/rate-limit/scopes.ts. */
  rateLimits: RateLimitSettings;
  /**
   * Proxies whose `X-Forwarded-For` may be believed when resolving a client
   * address. Also on `auth`, which is where better-auth's own resolution reads
   * it — but the address-keyed rate limits apply to surfaces that exist
   * without a database, and `auth` does not.
   */
  trustedProxies: string[] | undefined;
  devDefaults: boolean;
  /**
   * Whether this instance reports anonymous usage telemetry. Nothing reads it
   * yet — #1897 builds the reporting — but it resolves here so the variable
   * and its opt-out exist before the first version that could report.
   */
  telemetry: boolean;
  deploymentMode: DeploymentMode;
  /** Only the seed command reads it; unset means the development password. */
  seedAdminPassword: string | undefined;
};

/**
 * What each scope allows when a deployment says nothing (#1909). Here rather
 * than in `variables.ts` for the reason stated at the top of that file: a
 * default declared in a schema is compiled into the production bundle. These
 * are ordinary operating limits rather than credentials, but the rule holds
 * for the whole catalogue so that it holds for the ones that matter.
 *
 * Each is justified in the catalogue entry beside it, which is what a deployer
 * reads. The shape they share: a limit that a legitimate burst never reaches,
 * set low enough that the attack the scope exists to stop is not worth
 * running.
 */
const RATE_LIMIT_DEFAULTS = {
  signInAddress: '10/10m',
  signInEmail: '5/10m',
  invitationAccept: '10/10m',
  participantRedeemAddress: '20/10m',
  participantRedeemLink: '5/10m',
  participantSync: '600/1m',
  rpcUser: '600/1m',
  rpcTeam: '3000/1m',
  storageRead: '2000/5m',
  publicApi: '300/1m',
  wsUpgrade: '30/1m',
} as const;

function resolveRateLimits(raw: RawEnv): RateLimitSettings {
  const spec = (configured: string | undefined, fallback: string) =>
    parseRateLimitSpec(configured ?? fallback);
  return {
    sign_in_address: spec(
      raw.RATE_LIMIT_SIGN_IN_ADDRESS,
      RATE_LIMIT_DEFAULTS.signInAddress,
    ),
    sign_in_email: spec(
      raw.RATE_LIMIT_SIGN_IN_EMAIL,
      RATE_LIMIT_DEFAULTS.signInEmail,
    ),
    invitation_accept: spec(
      raw.RATE_LIMIT_INVITATION_ACCEPT,
      RATE_LIMIT_DEFAULTS.invitationAccept,
    ),
    participant_redeem_address: spec(
      raw.RATE_LIMIT_PARTICIPANT_REDEEM_ADDRESS,
      RATE_LIMIT_DEFAULTS.participantRedeemAddress,
    ),
    participant_redeem_link: spec(
      raw.RATE_LIMIT_PARTICIPANT_REDEEM_LINK,
      RATE_LIMIT_DEFAULTS.participantRedeemLink,
    ),
    participant_sync: spec(
      raw.RATE_LIMIT_PARTICIPANT_SYNC,
      RATE_LIMIT_DEFAULTS.participantSync,
    ),
    rpc_user: spec(raw.RATE_LIMIT_RPC_USER, RATE_LIMIT_DEFAULTS.rpcUser),
    rpc_team: spec(raw.RATE_LIMIT_RPC_TEAM, RATE_LIMIT_DEFAULTS.rpcTeam),
    storage_read: spec(
      raw.RATE_LIMIT_STORAGE_READ,
      RATE_LIMIT_DEFAULTS.storageRead,
    ),
    public_api: spec(raw.RATE_LIMIT_PUBLIC_API, RATE_LIMIT_DEFAULTS.publicApi),
    ws_upgrade: spec(raw.RATE_LIMIT_WS_UPGRADE, RATE_LIMIT_DEFAULTS.wsUpgrade),
  };
}

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';
// One above the web process's port, because in development both processes run
// on one host and the worker cannot reuse PORT.
const DEFAULT_WORKER_HEALTH_PORT = 3001;

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

/**
 * The effective connection string, with the file secret's password folded in.
 *
 * The compose stack (#1909) delivers the database password as a Compose file
 * secret rather than a variable, so it appears in neither `docker inspect` nor
 * any process environment — but `pg.Pool` and pg-boss both take one connection
 * string, and pg-boss takes nothing else. Producing the URL here is what lets
 * `DbEnv` stay `{ url }`, so every consumer is unchanged and none of them has
 * to know where the password came from.
 *
 * Read once, at boot, like every other variable: a file whose contents change
 * under a running process would give different pools different passwords.
 */
function resolveDatabaseUrl(raw: RawEnv): string | undefined {
  const url = raw.DATABASE_URL;
  const passwordFile = raw.DATABASE_PASSWORD_FILE;

  if (!url) {
    if (passwordFile) {
      throw new Error(
        'DATABASE_PASSWORD_FILE is set but DATABASE_URL is not; there is no connection to put the password into.',
      );
    }
    return undefined;
  }
  if (!passwordFile) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // The forms `new URL` refuses are the ones with no authority to hold a
    // password — a bare socket path, a libpq keyword DSN. Refusing the
    // combination says which of the two to change; inserting nothing and
    // carrying on would fail later as an authentication error with no clue
    // that the file was never used.
    throw new Error(
      'DATABASE_PASSWORD_FILE is set, but DATABASE_URL is not a URL a password can be inserted into (a socket path or keyword connection string has nowhere to put one). Use a postgres:// URL, or drop DATABASE_PASSWORD_FILE and configure the password the way that connection form expects.',
    );
  }
  if (parsed.password !== '') {
    throw new Error(
      'DATABASE_URL carries a password and DATABASE_PASSWORD_FILE is also set. Keep one: remove the password from the URL, or unset DATABASE_PASSWORD_FILE.',
    );
  }

  let contents: string;
  try {
    contents = readFileSync(passwordFile, 'utf8');
  } catch (error) {
    throw new Error(
      `DATABASE_PASSWORD_FILE names ${passwordFile}, which could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  // Trailing newlines only, and for a specific reason: the Postgres image's
  // own POSTGRES_PASSWORD_FILE reader strips exactly these, so a file written
  // with a shell redirection sets a password there that must match here.
  // Anything else in the file is part of the password.
  const password = contents.replace(/[\r\n]+$/, '');
  if (password === '') {
    throw new Error(
      `DATABASE_PASSWORD_FILE names ${passwordFile}, which is empty.`,
    );
  }

  // The setter applies the userinfo percent-encode set, so a password
  // containing `@`, `/`, `:` or `#` survives the round trip through the
  // parser node-postgres uses.
  parsed.password = password;
  return parsed.toString();
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
  // Under the development defaults it is not: the committed file supplies
  // both, aimed at the Mailpit container the development stack runs, so the
  // worker exercises the same delivery path a deployment does. A developer
  // who clears SMTP_URL to work without Docker's mail sink is left with an
  // unpaired EMAIL_FROM and the console mailer rather than a boot failure.
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

  const databaseUrl = resolveDatabaseUrl(raw);
  const db = databaseUrl ? { url: databaseUrl } : undefined;
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
    workerHealthPort: raw.WORKER_HEALTH_PORT ?? DEFAULT_WORKER_HEALTH_PORT,
    s3: resolveS3(raw),
    db,
    auth: resolveAuth(raw, db),
    mail: options.withMail ? resolveMailer(raw, devDefaults) : undefined,
    secrets,
    redis: raw.REDIS_URL,
    rateLimits: resolveRateLimits(raw),
    trustedProxies: raw.TRUSTED_PROXIES?.length
      ? raw.TRUSTED_PROXIES
      : undefined,
    devDefaults,
    telemetry: raw.STUDIO_TELEMETRY ?? true,
    deploymentMode: raw.STUDIO_DEPLOYMENT_MODE ?? DEFAULT_DEPLOYMENT_MODE,
    seedAdminPassword: raw.STUDIO_SEED_ADMIN_PASSWORD,
  };
}
