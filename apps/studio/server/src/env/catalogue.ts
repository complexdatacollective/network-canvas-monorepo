import type { VariableName } from './variables.ts';

// `CATALOGUE` is typed as an exhaustive record over `VariableName`, so adding
// a variable to `variables.ts` without documenting it fails `pnpm typecheck`.

/**
 * `scripts/dev-pg.ts` and `scripts/dev-s3.ts` import these values rather than
 * restating them, so the containers and the generated `.env.development`
 * cannot drift apart. The Postgres port and credentials are also what
 * `packages/studio-sync`'s conformance suite expects.
 */
export const DEV = {
  pgHost: '127.0.0.1',
  pgPort: 54318,
  pgUser: 'postgres',
  pgPassword: 'spike',
  pgDatabase: 'studio_dev',
  // 9100 so Fresco's dev MinIO (9000) and this one can run side by side.
  s3Port: 9100,
  s3Region: 'us-east-1',
  s3Bucket: 'studio-dev',
  s3AccessKeyId: 'minioadmin',
  s3SecretAccessKey: 'minioadmin',
  authSecret: 'studio-dev-secret-not-for-production',
  // The Vite dev server, which proxies every server path — the single-origin
  // invariant (#1245).
  baseUrl: 'http://localhost:5173',
  emailFrom: 'studio-dev@localhost.test',
} as const;

export const DEV_DATABASE_URL = `postgres://${DEV.pgUser}:${DEV.pgPassword}@${DEV.pgHost}:${DEV.pgPort}/${DEV.pgDatabase}`;
export const DEV_S3_ENDPOINT = `http://localhost:${DEV.s3Port}`;

export const GROUPS = [
  'Process',
  'Object storage',
  'Database',
  'Authentication',
] as const;

export type Group = (typeof GROUPS)[number];

export type VariableDoc = {
  group: Group;
  summary: string;
  /** What happens in a real deployment when it is set, and when it is not. */
  deployment: string;
  /** Written to `.env.development`. Omitted variables are absent from it. */
  devDefault?: string;
  /**
   * Obviously-fake placeholder written to `.env.example`, commented out.
   * Never a development value — the guard in `__tests__/docs.test.ts`
   * enforces that the deployer template contains no `devDefault`.
   */
  example?: string;
};

export const CATALOGUE: Record<VariableName, VariableDoc> = {
  STUDIO_ROLE: {
    group: 'Process',
    summary: 'Run web requests, durable workers, or both from the same image.',
    deployment:
      'Unset ⇒ both. worker exposes only liveness, readiness and protected metrics. Run exactly one web or both process per database; additional worker replicas coordinate through database leases.',
    example: 'both',
  },
  STUDIO_ENCRYPTION_KEYSET: {
    group: 'Database',
    summary:
      'Versioned encryption keyset JSON; contains key IDs and namespaced environment references, never root material.',
    deployment:
      'Required when a database is configured. Every roots[].reference must name a STUDIO_ENCRYPTION_ROOT_* environment value holding a canonical base64 32-byte root, or KMS ciphertext when STUDIO_ENCRYPTION_KEY_PROVIDER=aws-kms. Studio verifies stored key proofs before auth, workers or traffic. Operator commands never choose public defaults; explicit local development may use the public fixture keyset. See server/src/pii/README.md for configuration and backup custody.',
    example: 'REPLACE_WITH_KEYSET_JSON',
  },
  STUDIO_ENCRYPTION_KEY_PROVIDER: {
    group: 'Database',
    summary: 'Root key loader: environment (default) or aws-kms.',
    deployment:
      'Available with either deployment mode. KMS uses only explicit provider credentials and a fixed regional AWS endpoint; it never falls back to environment plaintext or development roots.',
    example: 'environment',
  },
  STUDIO_ENCRYPTION_KMS_KEY_ARN: {
    group: 'Database',
    summary: 'Exact symmetric AWS KMS key ARN; mutable aliases are refused.',
    deployment:
      'Required for aws-kms. The ARN fixes the AWS commercial region, account and key. Grant only kms:Decrypt on this key with the documented encryption-context conditions.',
    example: 'REPLACE_WITH_KMS_KEY_ARN',
  },
  STUDIO_ENCRYPTION_KMS_DEPLOYMENT: {
    group: 'Database',
    summary:
      'Public deployment identifier authenticated in the KMS encryption context.',
    deployment:
      'Required for aws-kms. Use a stable lower-case identifier (up to 63 letters, digits or hyphens, starting with a letter), unique to the environment. It must match root wrapping and IAM conditions. Never use participant data.',
    example: 'studio-staging',
  },
  STUDIO_ENCRYPTION_KMS_ACCESS_KEY_ID: {
    group: 'Database',
    summary: 'Dedicated KMS principal access key ID.',
    deployment:
      'Required for aws-kms. This identity is separate from R2/S3 and backup credentials. Supply through the deployment secret facility; ambient AWS profiles or metadata are never used.',
    example: 'REPLACE_WITH_KMS_ACCESS_KEY_ID',
  },
  STUDIO_ENCRYPTION_KMS_SECRET_ACCESS_KEY: {
    group: 'Database',
    summary: 'Dedicated KMS principal secret access key.',
    deployment:
      'Required for aws-kms. Store in the deployment secret facility and rotate the credential independently of wrapped application roots. Never pass it as a command-line argument.',
    example: 'REPLACE_WITH_KMS_SECRET_ACCESS_KEY',
  },
  STUDIO_ENCRYPTION_KMS_SESSION_TOKEN: {
    group: 'Database',
    summary: 'Session token when the KMS principal uses temporary credentials.',
    deployment:
      'Set with the matching temporary access key and secret. Refresh the complete credential set before expiry; unavailable credentials cause a startup refusal.',
    example: 'REPLACE_WITH_KMS_SESSION_TOKEN',
  },
  NODE_ENV: {
    group: 'Process',
    summary:
      'Runtime mode. Anything other than `production` leaves development affordances available.',
    deployment: 'Set to `production` by the Docker image and by Netlify.',
    devDefault: 'development',
    example: 'production',
  },
  STUDIO_DEV_DEFAULTS: {
    group: 'Process',
    summary:
      'Marks the process as running against the committed development defaults.',
    deployment:
      'Never set. It is refused at boot unless `NODE_ENV` is `development` or `test`.',
    devDefault: '1',
  },
  STUDIO_TELEMETRY: {
    group: 'Process',
    summary:
      'Enable Studio analytics and sanitized exception reporting through the Network Canvas PostHog relay.',
    deployment:
      'Unset ⇒ true in BOTH managed and self-hosted deployments. Set false to prevent server and browser SDK initialization, telemetry hooks, timers and relay requests. The browser reads this runtime decision from status before loading its SDK; restart processes and reload open tabs after changing it. No separate browser consent setting or build-time switch exists.',
    example: 'false',
  },
  PORT: {
    group: 'Process',
    summary: 'TCP port the HTTP server listens on.',
    deployment: 'Unset ⇒ 3000.',
    example: '3000',
  },
  STUDIO_METRICS_TOKEN: {
    group: 'Process',
    summary:
      'Bearer token required to read the protected Prometheus /metrics endpoint.',
    deployment:
      'Unset ⇒ /metrics refuses with 404. Use a separate random secret of at least 32 characters (openssl rand -base64 32); configure it only on operator scrapers. Never use the authentication signing secret.',
  },
  HOST: {
    group: 'Process',
    summary: 'Interface the HTTP server binds to.',
    deployment: 'Unset ⇒ `0.0.0.0`.',
    example: '0.0.0.0',
  },
  CLIENT_DIST: {
    group: 'Process',
    summary:
      'Directory of built client assets to serve, resolved against the working directory.',
    deployment:
      'Unset ⇒ `../client` relative to the server bundle, the Docker image layout. Irrelevant where a CDN serves the client.',
    example: '../client/dist',
  },
  STUDIO_DEPLOYMENT_MODE: {
    group: 'Process',
    summary:
      'Which topology this deployment serves: `managed` (marketing, pricing, sign-up, billing) or `self-hosted` (first-run setup). The other topology’s paths are refused with 404.',
    deployment:
      'Unset ⇒ `self-hosted`. The managed deployment sets `managed` in its runtime environment — the container environment, or a Netlify site variable, never a build-time one, because both entrypoints read it inside the running process.',
    devDefault: 'managed',
    example: 'self-hosted',
  },

  S3_ENDPOINT: {
    group: 'Object storage',
    summary: 'S3-compatible endpoint holding content-addressed asset bytes.',
    deployment: 'Required with the other four `S3_*` variables.',
    devDefault: DEV_S3_ENDPOINT,
    example: 'https://s3.us-east-1.amazonaws.com',
  },
  S3_REGION: {
    group: 'Object storage',
    summary: 'Region passed to the S3 client.',
    deployment: 'Required with the other four `S3_*` variables.',
    devDefault: DEV.s3Region,
    example: 'us-east-1',
  },
  S3_BUCKET: {
    group: 'Object storage',
    summary: 'Bucket asset objects are written to and read from.',
    deployment: 'Required with the other four `S3_*` variables.',
    devDefault: DEV.s3Bucket,
    example: 'studio-assets',
  },
  S3_ACCESS_KEY_ID: {
    group: 'Object storage',
    summary: 'Access key for the object store.',
    deployment: 'Required with the other four `S3_*` variables.',
    devDefault: DEV.s3AccessKeyId,
  },
  S3_SECRET_ACCESS_KEY: {
    group: 'Object storage',
    summary: 'Secret key for the object store.',
    deployment: 'Required with the other four `S3_*` variables.',
    devDefault: DEV.s3SecretAccessKey,
  },

  DATABASE_URL: {
    group: 'Database',
    summary:
      'Postgres application connection string, `pg.Pool`’s native format.',
    deployment:
      'Required by web and combined processes; a worker-only process omits it. The persistent web server uses a dedicated LOGIN permitted to SET only `studio_app`. Offline migration, reset, seed, backup and restore commands receive their separate administrative or backup `DATABASE_URL` for that invocation.',
    devDefault: DEV_DATABASE_URL,
    example: 'postgres://user:password@host:5432/studio',
  },

  STUDIO_MAINTENANCE_DATABASE_URL: {
    group: 'Database',
    summary:
      'Postgres maintenance-worker connection string, `pg.Pool`’s native format.',
    deployment:
      "Required by every persistent server with a database and is the worker-only process's sole database connection. Use a distinct dedicated LOGIN permitted to SET only `studio_maintenance`; never reuse the application, migration, restore, or backup LOGIN. Explicit local development alone falls back to `DATABASE_URL`.",
    example: 'postgres://maintenance:password@host:5432/studio',
  },

  STUDIO_DATABASE_ALLOWED_LOGINS: {
    group: 'Database',
    summary: 'JSON array of this deployment’s database login names.',
    deployment:
      'Required by `migrate` and by every persistent server outside explicit local development. Enroll the database owner, migration login, distinct application and maintenance runtime logins, and any separately provisioned backup login. Provision explicit CONNECT before admitting database connections. Migration, startup, and readiness refuse PUBLIC, shared-role, missing, or unexpected access.',
    example:
      '["studio_migrator","studio_app_runtime","studio_maintenance_runtime"]',
  },

  STUDIO_DATABASE_ADMINISTRATIVE_LOGINS: {
    group: 'Database',
    summary:
      'Optional JSON array of explicitly administrative database login names.',
    deployment:
      'Defaults to an empty array. Configure a separately provisioned non-owner migration or conversion login here and in STUDIO_DATABASE_ALLOWED_LOGINS. Database ownership is recognized separately. Serving app and maintenance connections must never use a configured administrative login.',
    example: '["studio_schema_operator"]',
  },

  BETTER_AUTH_SECRET: {
    group: 'Authentication',
    summary: 'Signing secret for sessions and magic-link tokens.',
    deployment:
      'Required whenever `DATABASE_URL` is set. Generate one with `openssl rand -base64 32`.',
    devDefault: DEV.authSecret,
  },
  PUBLIC_URL: {
    group: 'Authentication',
    summary:
      'The browser-facing origin. Cookies, magic-link URLs, and team-invitation URLs are minted against it.',
    deployment: 'Required whenever `DATABASE_URL` is set.',
    devDefault: DEV.baseUrl,
    example: 'https://studio.example.org',
  },
  SMTP_URL: {
    group: 'Authentication',
    summary:
      'SMTP transport sign-in and team-invitation email is sent through.',
    deployment:
      'Selects SMTP; cannot be combined with `POSTMARK_SERVER_TOKEN`. With neither transport configured, magic-link sends refuse and team invitations cannot be created. Accepts smtp:// or smtps:// credentials and host/port only; query options, fragments, and paths are refused. TLS is required except for localhost, 127.0.0.1, and ::1 development relays. Connection and greeting waits are bounded to 10 seconds, socket inactivity to 20 seconds, and the full send to 40 seconds. A sign-in or invitation link is never written to the log outside development.',
    example: 'smtp://user:password@smtp.example.org:587',
  },
  POSTMARK_SERVER_TOKEN: {
    group: 'Authentication',
    summary: 'Server API token selecting the Postmark email transport.',
    deployment:
      'Managed delivery uses Postmark; self-hosters may select it explicitly or keep SMTP. Requires `EMAIL_FROM` and cannot be combined with `SMTP_URL`. Store this server-scoped secret only in the backend. Requests use the fixed HTTPS Postmark email endpoint, with open/link tracking disabled, no redirects or automatic retries, a 10-second connection deadline and a 30-second total deadline. No provider response or token is logged.',
    example: 'replace-with-postmark-server-token',
  },
  POSTMARK_MESSAGE_STREAM: {
    group: 'Authentication',
    summary: 'Postmark transactional message stream ID.',
    deployment:
      'Optional with `POSTMARK_SERVER_TOKEN`; defaults to `outbound`. Provision a transactional stream. IDs start with an ASCII letter and contain at most 30 letters, digits, underscores or hyphens. A stream without a server token is refused.',
    example: 'outbound',
  },
  EMAIL_FROM: {
    group: 'Authentication',
    summary: 'From address on sign-in and team-invitation email.',
    deployment:
      'Required alongside `SMTP_URL` or `POSTMARK_SERVER_TOKEN`, and refused without either outside development. Postmark requires the sender address or domain to be verified in the selected server account.',
    devDefault: DEV.emailFrom,
    example: 'studio@studio.example.org',
  },
  GOOGLE_CLIENT_ID: {
    group: 'Authentication',
    summary: 'OAuth client ID for "Continue with Google" sign-in (#1255).',
    deployment:
      'Required with `GOOGLE_CLIENT_SECRET`; unset ⇒ Google sign-in is not offered. Create a Web application OAuth client in the Google Cloud Console with `<PUBLIC_URL>/api/auth/callback/google` as an authorized redirect URI.',
    example: 'xxxxxxxx.apps.googleusercontent.com',
  },
  GOOGLE_CLIENT_SECRET: {
    group: 'Authentication',
    summary: 'OAuth client secret paired with `GOOGLE_CLIENT_ID`.',
    deployment: 'Required with `GOOGLE_CLIENT_ID`, and refused without it.',
    example: 'GOCSPX-xxxxxxxxxxxxxxxx',
  },
  MICROSOFT_CLIENT_ID: {
    group: 'Authentication',
    summary:
      'Entra application (client) ID for "Continue with Microsoft" sign-in (#1255).',
    deployment:
      'Required with `MICROSOFT_CLIENT_SECRET`; unset ⇒ Microsoft sign-in is not offered. Register an application in Microsoft Entra with `<PUBLIC_URL>/api/auth/callback/microsoft` as a Web redirect URI.',
    example: '00000000-0000-0000-0000-000000000000',
  },
  MICROSOFT_CLIENT_SECRET: {
    group: 'Authentication',
    summary: 'Client secret paired with `MICROSOFT_CLIENT_ID`.',
    deployment: 'Required with `MICROSOFT_CLIENT_ID`, and refused without it.',
    example: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  MICROSOFT_TENANT_ID: {
    group: 'Authentication',
    summary:
      'Entra tenant to accept sign-ins from, for single-tenant registrations.',
    deployment:
      'Unset ⇒ `common` (any organizational or personal Microsoft account, matching a multitenant registration). Refused without the other two `MICROSOFT_*` variables.',
    example: 'contoso.onmicrosoft.com',
  },
  STUDIO_BOOTSTRAP_TOKEN: {
    group: 'Authentication',
    summary:
      'Single-use authorization for first-run self-hosted instance and owner creation.',
    deployment:
      'Set a cryptographically random 32-byte token encoded as unpadded base64url (43 characters), then enter it at `/setup`. Unset disables first-run setup; completed instances remain completed after token removal or replacement. Managed deployments do not expose setup. See `SETUP.md`.',
    example: 'replace-with-a-random-32-byte-base64url-token',
  },
  STUDIO_SEED_ADMIN_PASSWORD: {
    group: 'Authentication',
    summary:
      'Password of the `admin@studio.test` account the `seed` command creates, which owns every seeded team.',
    deployment:
      'Read only by `seed` and `db:reset`. Required to seed a non-local database: the published development password is refused there, because it is a working credential on any instance that keeps it. Unset ⇒ the development password, for local databases only.',
    example: 'a-long-random-value-chosen-for-this-instance',
  },
  TRUSTED_PROXIES: {
    group: 'Authentication',
    summary:
      'Comma-separated proxy IP addresses or CIDRs. A UUID X-Request-Id is accepted only when the actual transport peer is in this list.',
    deployment:
      'Unset ⇒ request ids are generated locally and forwarded headers are not read for authentication. List only your own proxies, each overwriting client-supplied request-id and forwarded headers. Header values never establish transport trust; fetch-only runtimes without socket information always generate request ids.',
    example: '10.0.0.0/8,192.168.0.0/16',
  },
};
