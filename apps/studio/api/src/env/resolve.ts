import { readFileSync } from 'node:fs';

import { parse as parseConnectionString } from 'pg-connection-string';

import type { DeploymentMode } from '@codaco/studio-contract/surfaces';

import { type KeyringApi, parseKeyring } from '../secrets/keyring.ts';
import type { EnvironmentVariables } from './schema.ts';

export type S3Env = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type AzureBlobEnv = {
  container: string;
  auth:
    | { kind: 'identity'; accountUrl: string; clientId: string | undefined }
    | { kind: 'connection-string'; connectionString: string };
};

export type ObjectStoreEnv =
  | { provider: 's3'; s3: S3Env }
  | { provider: 'azure-blob'; azureBlob: AzureBlobEnv };

export type DbEnv = {
  url: string;
  passwordFile?: string | undefined;
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

// An undefined objectStore, db, or auth means that surface is not configured
// and refuses with 503; the server still boots.
export type StudioEnv = {
  port: number;
  host: string;
  /** The worker's loopback health listener; the web process never binds it. */
  workerHealthPort: number;
  objectStore: ObjectStoreEnv | undefined;
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
  secrets: KeyringApi | undefined;
  /**
   * The shared rate-limit store (#1909). Undefined means no store: every limit
   * is disabled and the limiter says so at boot, which is the same posture the
   * store being unreachable takes at run time — a rate limit protects against
   * abuse and is not a correctness guarantee.
   */
  redis: string | undefined;
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
  telemetryEndpoint: string | undefined;
  deploymentMode: DeploymentMode;
  /** Only the seed command reads it; unset means the development password. */
  seedAdminPassword: string | undefined;
};

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

const SOCKET_URL_EXAMPLE =
  'postgres://studio@localhost/studio?host=/var/run/postgresql';

/** `prefer` and `allow` are refused: both fall back to plaintext. */
const CLIENT_SSL_MODES = new Set([
  'disable',
  'require',
  'verify-ca',
  'verify-full',
]);

function assertClientCanParse(url: string): void {
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    parsed = undefined;
  }
  if (parsed?.protocol !== 'postgres:' && parsed?.protocol !== 'postgresql:') {
    throw new Error(
      'DATABASE_URL must be a postgres:// URL. A socket path, a keyword ' +
        'connection string, or a URL with credentials but no host cannot be ' +
        "read by the server's database client. For a Unix socket, name its " +
        `directory in the \`host\` parameter: ${SOCKET_URL_EXAMPLE}`,
    );
  }
  const sslmode = parsed.searchParams.get('sslmode');
  if (sslmode === null || CLIENT_SSL_MODES.has(sslmode)) return;
  const accepted = [...CLIENT_SSL_MODES].join(', ');
  if (sslmode === 'prefer' || sslmode === 'allow') {
    throw new Error(
      `DATABASE_URL has sslmode=${sslmode}, which Studio refuses: it can ` +
        `connect without TLS when the server declines it. Use one of ${accepted}.`,
    );
  }
  throw new Error(
    `DATABASE_URL has sslmode=${sslmode}, which is not a supported sslmode. ` +
      `Use one of ${accepted}.`,
  );
}

/**
 * Trailing newlines only are stripped, as the Postgres image's own
 * `POSTGRES_PASSWORD_FILE` reader does.
 */
export function readPasswordFile(passwordFile: string): string {
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
  const password = contents.replace(/[\r\n]+$/, '');
  if (password === '') {
    throw new Error(
      `DATABASE_PASSWORD_FILE names ${passwordFile}, which is empty.`,
    );
  }
  return password;
}

function resolveDatabaseUrl(raw: EnvironmentVariables): string | undefined {
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
  if (parsed.hostname === '') {
    // The URL setter below is a silent no-op on an empty host, so this would
    // otherwise connect with no password and fail as an authentication error.
    throw new Error(
      `DATABASE_PASSWORD_FILE is set, but DATABASE_URL names no host to attach the password to. For a Unix socket, keep a host in the URL and name the socket's directory in the \`host\` parameter: ${SOCKET_URL_EXAMPLE}`,
    );
  }
  if (parsed.password !== '') {
    throw new Error(
      'DATABASE_URL carries a password and DATABASE_PASSWORD_FILE is also set. Keep one: remove the password from the URL, or unset DATABASE_PASSWORD_FILE.',
    );
  }

  const password = readPasswordFile(passwordFile);

  // The setter applies the userinfo percent-encode set, so a password
  // containing `@`, `/`, `:` or `#` survives the round trip through the
  // parser node-postgres uses.
  parsed.password = password;
  return parsed.toString();
}

const S3_VARIABLES = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

const AZURE_BLOB_VARIABLES = [
  'AZURE_STORAGE_ACCOUNT_URL',
  'AZURE_STORAGE_CONTAINER',
  'AZURE_STORAGE_CONNECTION_STRING',
  'AZURE_CLIENT_ID',
] as const;

function namesSet(
  raw: EnvironmentVariables,
  names: readonly (keyof EnvironmentVariables)[],
): string[] {
  return names.filter((name) => raw[name] !== undefined);
}

function resolveS3(raw: EnvironmentVariables): S3Env {
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

  // Partial configuration is a deployment mistake, not a request for
  // defaults — fail fast rather than half-configuring a store.
  const missing = S3_VARIABLES.filter((name) => raw[name] === undefined);
  throw new Error(
    `Incomplete S3 configuration; missing: ${missing.join(', ')}`,
  );
}

function resolveAzureBlob(raw: EnvironmentVariables): AzureBlobEnv {
  const container = raw.AZURE_STORAGE_CONTAINER;
  const accountUrl = raw.AZURE_STORAGE_ACCOUNT_URL;
  const connectionString = raw.AZURE_STORAGE_CONNECTION_STRING;
  if (!container) {
    throw new Error(
      'Incomplete Azure Blob Storage configuration; missing: AZURE_STORAGE_CONTAINER',
    );
  }
  if (accountUrl && connectionString) {
    throw new Error(
      'AZURE_STORAGE_ACCOUNT_URL and AZURE_STORAGE_CONNECTION_STRING are both set; set exactly one. The account URL authenticates with a managed identity, and is the one to keep on Azure.',
    );
  }
  if (connectionString) {
    if (raw.AZURE_CLIENT_ID) {
      throw new Error(
        'AZURE_CLIENT_ID names a managed identity, but AZURE_STORAGE_CONNECTION_STRING authenticates with the account key it carries. Remove one of them.',
      );
    }
    return { container, auth: { kind: 'connection-string', connectionString } };
  }
  if (!accountUrl) {
    throw new Error(
      'Incomplete Azure Blob Storage configuration; missing: AZURE_STORAGE_ACCOUNT_URL (or AZURE_STORAGE_CONNECTION_STRING outside Azure)',
    );
  }
  return {
    container,
    auth: { kind: 'identity', accountUrl, clientId: raw.AZURE_CLIENT_ID },
  };
}

/**
 * One provider, chosen here and nowhere later (#2077). The other provider's
 * variables are refused rather than ignored: a deployment carrying both says
 * two things about where its assets live, and only one of them can be true.
 * Unset, there is no object store, and a provider's variables without the
 * provider named are refused for the same reason.
 */
function resolveObjectStore(
  raw: EnvironmentVariables,
): ObjectStoreEnv | undefined {
  const provider = raw.STUDIO_OBJECT_STORE;
  const s3 = namesSet(raw, S3_VARIABLES);
  const azure = namesSet(raw, AZURE_BLOB_VARIABLES);
  const stray =
    provider === 's3'
      ? azure
      : provider === 'azure-blob'
        ? s3
        : [...s3, ...azure];
  if (stray.length > 0) {
    throw new Error(
      `${stray.join(', ')} ${stray.length === 1 ? 'is' : 'are'} set, but ${
        provider === undefined
          ? 'STUDIO_OBJECT_STORE is not'
          : `STUDIO_OBJECT_STORE is ${provider}`
      }. Set STUDIO_OBJECT_STORE to the provider they configure (s3 or azure-blob), and remove the other provider's variables.`,
    );
  }
  switch (provider) {
    case 's3':
      return { provider, s3: resolveS3(raw) };
    case 'azure-blob':
      return { provider, azureBlob: resolveAzureBlob(raw) };
    case undefined:
      return undefined;
  }
}

function resolveMailer(
  raw: EnvironmentVariables,
  devDefaults: boolean,
): MailerEnv {
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

function resolveSocialProviders(raw: EnvironmentVariables): SocialProvidersEnv {
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

function resolveAuth(
  raw: EnvironmentVariables,
  db: DbEnv | undefined,
): AuthEnv | undefined {
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
  raw: EnvironmentVariables,
  db: DbEnv | undefined,
  readSecretsFile: (path: string) => string,
): KeyringApi | undefined {
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

export function resolve(
  raw: EnvironmentVariables,
  options: ResolveOptions = {},
): StudioEnv {
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
  const db = databaseUrl
    ? {
        url: databaseUrl,
        ...(raw.DATABASE_PASSWORD_FILE
          ? { passwordFile: raw.DATABASE_PASSWORD_FILE }
          : {}),
      }
    : undefined;
  if (db) {
    assertPinnedRoleSurvives(db.url);
    assertClientCanParse(db.url);
  }

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
    objectStore: resolveObjectStore(raw),
    db,
    auth: resolveAuth(raw, db),
    mail: options.withMail ? resolveMailer(raw, devDefaults) : undefined,
    secrets,
    redis: raw.REDIS_URL,
    trustedProxies: raw.TRUSTED_PROXIES?.length
      ? raw.TRUSTED_PROXIES
      : undefined,
    devDefaults,
    telemetry: raw.STUDIO_TELEMETRY ?? true,
    telemetryEndpoint: raw.OTEL_EXPORTER_OTLP_ENDPOINT,
    deploymentMode: raw.STUDIO_DEPLOYMENT_MODE ?? DEFAULT_DEPLOYMENT_MODE,
    seedAdminPassword: raw.STUDIO_SEED_ADMIN_PASSWORD,
  };
}
