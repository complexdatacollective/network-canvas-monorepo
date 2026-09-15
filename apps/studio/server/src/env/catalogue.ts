import type { VariableName } from './variables.ts';

// `CATALOGUE` is typed as an exhaustive record over `VariableName`, so adding
// a variable to `variables.ts` without documenting it fails `pnpm typecheck`.

/**
 * `scripts/dev.ts` imports these values rather than restating them: it exports
 * them into the environment the development compose stack is interpolated
 * with, so the containers and the generated `.env.development` cannot drift
 * apart. Every credential here is published and points at a container on this
 * machine.
 *
 * The Postgres port and credentials are also what `packages/studio-sync`'s
 * conformance suite expects.
 */
export const DEV = {
  pgHost: '127.0.0.1',
  pgPort: 54318,
  pgUser: 'postgres',
  pgPassword: 'spike',
  pgDatabase: 'studio_dev',
  // 9100 so Fresco's dev object store (9000) and this one can run side by
  // side. Garage's S3 API, published on the host loopback by
  // docker-compose.dev.yml.
  s3Port: 9100,
  // Garage signs requests for whatever region its configuration names, and
  // the development stack configures it from this value — so the two cannot
  // disagree, and `garage` is the name Garage itself defaults to.
  s3Region: 'garage',
  s3Bucket: 'studio-dev',
  // Garage's key format: `GK` and 24 hex characters, then 64 hex characters
  // of secret. Fixed rather than generated so the value in `.env.development`
  // is the value the container is bootstrapped with.
  s3AccessKeyId: 'GK000000000000000073646576',
  s3SecretAccessKey:
    '0000000000000000000000000073747564696f2d6465762d6e6f742d70726f64',
  garageRpcSecret:
    '000000000000000000000073747564696f2d6465762d6761726167652d727063',
  garageAdminToken:
    '00000000000000000073747564696f2d6465762d6761726167652d61646d696e',
  valkeyPort: 63790,
  // Mailpit, from docker-compose.dev.yml: SMTP in, and a browser UI to read
  // what came out.
  smtpPort: 1025,
  mailpitUiPort: 8025,
  // Effectively no limit. Development is where a person reloads a page fifty
  // times in a minute and where the suite signs in dozens of times, and being
  // refused for either would only ever be noise: what the limits are for is a
  // deployment facing the internet, and every one of them is set there. The
  // store is still exercised — every decision still goes through Valkey — so
  // a mistake in the limiter itself still shows up locally.
  rateLimit: '100000/1m',
  authSecret: 'studio-dev-secret-not-for-production',
  /**
   * The development keyring (#1900). Its 32 bytes are the ASCII of
   * `studio-dev-keyring-not-for-prod!`, so anyone who decodes a ciphertext's
   * key out of a local database finds a sentence saying what it is rather
   * than a value they might mistake for a generated one.
   */
  secretsKey: 'dev:c3R1ZGlvLWRldi1rZXlyaW5nLW5vdC1mb3ItcHJvZCE=',
  // The Vite dev server, which proxies every server path — the single-origin
  // invariant (#1245).
  baseUrl: 'http://localhost:5173',
  emailFrom: 'studio-dev@localhost',
} as const;

export const DEV_DATABASE_URL = `postgres://${DEV.pgUser}:${DEV.pgPassword}@${DEV.pgHost}:${DEV.pgPort}/${DEV.pgDatabase}`;
export const DEV_S3_ENDPOINT = `http://localhost:${DEV.s3Port}`;
export const DEV_SMTP_URL = `smtp://127.0.0.1:${DEV.smtpPort}`;
export const DEV_REDIS_URL = `redis://127.0.0.1:${DEV.valkeyPort}`;

export const GROUPS = [
  'Process',
  'Object storage',
  'Database',
  'Secrets',
  'Authentication',
  'Rate limiting',
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
  NODE_ENV: {
    group: 'Process',
    summary:
      'Runtime mode. Anything other than `production` leaves development affordances available.',
    deployment: 'Set to `production` by the `studio-api` image.',
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
  PORT: {
    group: 'Process',
    summary: 'TCP port the HTTP server listens on.',
    deployment: 'Unset ⇒ 3000.',
    example: '3000',
  },
  HOST: {
    group: 'Process',
    summary: 'Interface the HTTP server binds to.',
    deployment: 'Unset ⇒ `0.0.0.0`.',
    example: '0.0.0.0',
  },
  WORKER_HEALTH_PORT: {
    group: 'Process',
    summary:
      'TCP port the worker process serves `/healthz` and `/readyz` on, bound to `127.0.0.1` only.',
    deployment:
      'Unset ⇒ 3001. The worker routes no traffic, so this listener exists for the container healthcheck and is never published or proxied; the address it binds is fixed in code, not configurable. The web process ignores it and serves the same two routes on `PORT`.',
    example: '3001',
  },
  STUDIO_TELEMETRY: {
    group: 'Process',
    summary:
      'Whether this instance reports anonymous usage telemetry. Declared here so the development lane can turn it off; nothing reads it until #1897 builds the reporting it governs.',
    deployment:
      'Unset ⇒ true. Set to `false` to opt an instance out. It does not govern the update check (#1901), which is not configurable and is blocked at the firewall instead.',
    devDefault: 'false',
    example: 'true',
  },
  STUDIO_DEPLOYMENT_MODE: {
    group: 'Process',
    summary:
      'Which topology this deployment serves: `managed` (marketing, pricing, sign-up, billing) or `self-hosted` (first-run setup). The other topology’s paths are refused with 404.',
    deployment:
      'Unset ⇒ `self-hosted`. The managed deployment sets `managed` in the container environment, at run time rather than at build time, because every entrypoint reads it inside the running process.',
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
    summary: 'Postgres connection string, `pg.Pool`’s native format.',
    deployment:
      'Unset ⇒ no database; auth and sync refuse while the server still boots. The login owns the schema and needs `CREATEROLE` the first time `apply-schema` runs; the server runs as the `studio_app` role it creates. A connection string carrying an `options` parameter is refused at boot: node-postgres would let it override the `role=` every pool pins itself with, and both processes would run as the login instead.',
    devDefault: DEV_DATABASE_URL,
    example: 'postgres://user@host:5432/studio',
  },
  DATABASE_PASSWORD_FILE: {
    group: 'Database',
    summary:
      'Path of a file holding the password for `DATABASE_URL`, which must then carry none.',
    deployment:
      'How the reference compose stack delivers the database password: a Compose file secret at `/run/secrets/postgres_password`, so it appears neither in `docker inspect` nor in any process environment. The file is read once at boot and its password inserted into `DATABASE_URL`. Setting it while `DATABASE_URL` also carries a password is a boot error — there would be no way to tell which was meant. Trailing newlines are stripped, matching what the Postgres image does with the same file.',
    example: '/run/secrets/postgres_password',
  },

  STUDIO_SECRETS_KEY: {
    group: 'Secrets',
    summary:
      'The keyring Studio encrypts stored secrets with — webhook signing secrets, API-key protocol assets and OAuth tokens. One or more `<id>:<base64 of 32 bytes>` entries separated by commas or whitespace, the first of which is the one new values are written under.',
    deployment:
      'Required whenever `DATABASE_URL` is set, unless `STUDIO_SECRETS_KEY_FILE` names a file holding it; setting both is refused at boot. Generate an entry with `openssl rand -base64 32` and write it as `k1:<value>`. Back it up with the database: without it every stored secret is unreadable, and the server refuses to start rather than serve a database it can only half read. Rotate by adding a new entry at the front, deploying, running `studio-api rotate-secrets`, and then removing the old entry.',
    devDefault: DEV.secretsKey,
    example: `k1:${'x'.repeat(43)}=`,
  },
  STUDIO_SECRETS_KEY_FILE: {
    group: 'Secrets',
    summary:
      'Path to a file holding the keyring, read once at boot; the file may put one entry per line.',
    deployment:
      'The reference stack mounts the keyring as a Compose file secret under `/run/secrets`, so it never appears in `docker inspect` or in a log of the environment. Takes the place of `STUDIO_SECRETS_KEY`, which stays for development and for hosts that have no file secrets; setting both is refused at boot.',
    example: '/run/secrets/studio_secrets_key',
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
      'Read by the worker process, which sends every message Studio sends; the web process never reads it. Unset ⇒ the worker boots without its mail workers and says so, and sign-in and invitation mail queues until one is configured. A sign-in or invitation link is never written to the log outside development.',
    devDefault: DEV_SMTP_URL,
    example: 'smtp://user:password@smtp.example.org:587',
  },
  EMAIL_FROM: {
    group: 'Authentication',
    summary: 'From address on sign-in and team-invitation email.',
    deployment:
      'Read by the worker process alongside `SMTP_URL`: required with it, and refused without it.',
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
  STUDIO_SEED_ADMIN_PASSWORD: {
    group: 'Authentication',
    summary:
      'Password of the `admin@studio.test` account the `seed` command creates, which owns every seeded team.',
    deployment:
      'Read only by `seed` and `db:reset`. Required to seed a non-local database: the published development password is refused there, because it is a working credential on any instance that keeps it. Unset ⇒ the development password, for local databases only.',
    example: 'a-long-random-value-chosen-for-this-instance',
  },
  REDIS_URL: {
    group: 'Rate limiting',
    summary:
      'Redis 7-compatible server (the reference stack runs Valkey) holding every rate-limit counter.',
    deployment:
      'Unset ⇒ there is no limiter store, every limit below is disabled, and the server says so once at boot outside development. The reference compose stack always sets it. Any Redis 7-compatible server will do — the limiter uses `EVAL`, sorted sets and hashes and nothing else — and the counters are disposable: losing them resets every window rather than losing data.',
    devDefault: DEV_REDIS_URL,
    example: 'redis://valkey:6379',
  },
  RATE_LIMIT_SIGN_IN_ADDRESS: {
    group: 'Rate limiting',
    summary:
      'Sign-in and magic-link requests per client address, as `count/window`.',
    deployment:
      'Unset ⇒ `10/10m`. Ten attempts from one address in ten minutes covers a shared institutional address whose users mistype passwords, and makes credential stuffing from a single host pointless.',
    devDefault: DEV.rateLimit,
    example: '10/10m',
  },
  RATE_LIMIT_SIGN_IN_EMAIL: {
    group: 'Rate limiting',
    summary: 'Sign-in and magic-link requests per email address.',
    deployment:
      'Unset ⇒ `5/10m`. An account belongs to one person, and a person who has failed five times in ten minutes needs the reset link rather than a sixth attempt. This is the limit an attacker spreading attempts across addresses meets.',
    devDefault: DEV.rateLimit,
    example: '5/10m',
  },
  RATE_LIMIT_INVITATION_ACCEPT: {
    group: 'Rate limiting',
    summary: 'Team-invitation acceptances per invitation token.',
    deployment:
      'Unset ⇒ `10/10m`. An invitation is accepted once; ten allows a reload, a wrong account, and a sign-in in between, and stops a token being brute-forced through one link.',
    devDefault: DEV.rateLimit,
    example: '10/10m',
  },
  RATE_LIMIT_PARTICIPANT_REDEEM_ADDRESS: {
    group: 'Rate limiting',
    summary: 'Participation-link redemptions per client address.',
    deployment:
      'Unset ⇒ `20/10m`. A lab runs several interviews from one address, so this is deliberately loose; the per-link limit below is what protects a single link. Declared now and enforced when the participant routes land (#1899).',
    devDefault: DEV.rateLimit,
    example: '20/10m',
  },
  RATE_LIMIT_PARTICIPANT_REDEEM_LINK: {
    group: 'Rate limiting',
    summary: 'Participation-link redemptions per link.',
    deployment:
      'Unset ⇒ `5/10m`. A link is redeemed once, so five covers a reload and a lost response while making a link identifier not worth guessing. Declared now and enforced when the participant routes land (#1899).',
    devDefault: DEV.rateLimit,
    example: '5/10m',
  },
  RATE_LIMIT_PARTICIPANT_SYNC: {
    group: 'Rate limiting',
    summary: 'Interview sync writes per participant session.',
    deployment:
      'Unset ⇒ `600/1m`. Ten writes a second is far above what answering questions produces and far below what a script replaying a session could. Declared now and enforced when the participant routes land (#1899).',
    devDefault: DEV.rateLimit,
    example: '600/1m',
  },
  RATE_LIMIT_RPC_USER: {
    group: 'Rate limiting',
    summary: 'Internal RPC calls per signed-in user.',
    deployment:
      'Unset ⇒ `600/1m`. The app issues a burst of calls per screen, so the limit is a ceiling on a runaway client rather than a budget a person can feel: ten calls a second sustained is more than any screen needs.',
    devDefault: DEV.rateLimit,
    example: '600/1m',
  },
  RATE_LIMIT_RPC_TEAM: {
    group: 'Rate limiting',
    summary: 'Internal RPC calls per team, across everyone in it.',
    deployment:
      'Unset ⇒ `3000/1m`. A team is many researchers working at once, so this protects the instance rather than the person: it is five times the per-user limit, which one runaway client cannot reach alone.',
    devDefault: DEV.rateLimit,
    example: '3000/1m',
  },
  RATE_LIMIT_STORAGE_READ: {
    group: 'Rate limiting',
    summary:
      'Reads from `/storage`, per participant session where the request carries one and otherwise per client address.',
    deployment:
      'Unset ⇒ `2000/5m`. Generous by design: an interview fetches every stimulus it shows, and an institution often puts a whole building behind one address. Keyed per client address until the participant session token exists (#1899).',
    devDefault: DEV.rateLimit,
    example: '2000/5m',
  },
  RATE_LIMIT_PUBLIC_API: {
    group: 'Rate limiting',
    summary: 'Calls to `/api/v1`, per client address.',
    deployment:
      'Unset ⇒ `300/1m`. Five calls a second suits an analysis script paging through results and leaves the instance responsive to everyone else. Per address rather than per `Authorization` header: there is no token plane until #1899, so a header is an unvalidated string and keying on it would let a caller mint a fresh allowance per request by changing it. It becomes the resolved token id when tokens exist.',
    devDefault: DEV.rateLimit,
    example: '300/1m',
  },
  RATE_LIMIT_WS_UPGRADE: {
    group: 'Rate limiting',
    summary: 'WebSocket upgrades per signed-in user.',
    deployment:
      'Unset ⇒ `30/1m`. A tab opens one socket and reopens it when the network drops, so thirty a minute absorbs a flapping connection while stopping a reconnect loop from becoming a connection storm.',
    devDefault: DEV.rateLimit,
    example: '30/1m',
  },

  TRUSTED_PROXIES: {
    group: 'Authentication',
    summary:
      'Comma-separated proxy addresses or CIDRs whose `X-Forwarded-For` may be trusted when resolving the client IP.',
    deployment:
      'Unset ⇒ forwarded headers are not read at all, which is safe but shares one rate-limit bucket across every client. List only your own proxies, and only where each one overwrites the header rather than appending to a client-supplied value.',
    example: '10.0.0.0/8,192.168.0.0/16',
  },
};
