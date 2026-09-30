import type { VariableName } from './schema.ts';

// The development lane's own values, and the one place they exist.
//
// Nothing under `src/` outside this module's type import may reach them:
// `src/env.ts` imports `./schema.ts`, and anything `schema.ts` could reach
// would be compiled into the production server bundle — which is how the
// publicly-known development auth secret once shipped inside a built
// deployable. Only `scripts/` and the environment suites import this file, and
// the `import type` above is erased, so there is no runtime edge from the
// schema to here in either direction.

/**
 * `scripts/dev.ts` imports these values rather than restating them: it exports
 * them into the environment the development compose stack is interpolated
 * with, so the containers and the generated `.env.development` cannot drift
 * apart. Every credential here is published and points at a container on this
 * machine.
 *
 * `DEV_ENVIRONMENT` below is built from them too, so what the containers are
 * started with and what the committed `.env.development` tells the server to
 * connect to are one value with two readers.
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

/**
 * The committed `.env.development`, as data: every variable the development
 * lane sets, and its value. `scripts/env-docs.ts` writes the file from this
 * and the schema's own documentation, so the two cannot drift, and a variable
 * absent from here is absent from the file.
 *
 * Keyed by `VariableName`, so an entry for a variable the schema does not
 * declare fails `pnpm typecheck` — the same guard the deleted catalogue's
 * exhaustive record gave, in the direction that still matters. The other
 * direction is deliberately open: most variables have no development value.
 */
export const DEV_ENVIRONMENT: Partial<Record<VariableName, string>> = {
  NODE_ENV: 'development',
  STUDIO_DEV_DEFAULTS: '1',
  STUDIO_TELEMETRY: 'false',
  STUDIO_DEPLOYMENT_MODE: 'managed',

  S3_ENDPOINT: DEV_S3_ENDPOINT,
  S3_REGION: DEV.s3Region,
  S3_BUCKET: DEV.s3Bucket,
  S3_ACCESS_KEY_ID: DEV.s3AccessKeyId,
  S3_SECRET_ACCESS_KEY: DEV.s3SecretAccessKey,

  DATABASE_URL: DEV_DATABASE_URL,

  STUDIO_SECRETS_KEY: DEV.secretsKey,

  BETTER_AUTH_SECRET: DEV.authSecret,
  PUBLIC_URL: DEV.baseUrl,
  SMTP_URL: DEV_SMTP_URL,
  EMAIL_FROM: DEV.emailFrom,

  REDIS_URL: DEV_REDIS_URL,
};
