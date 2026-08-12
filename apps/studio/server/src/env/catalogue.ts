import type { VariableName } from './variables.ts';

// The documentation half of the environment declaration. Nothing under
// `src/` outside this directory imports it — it is read by
// `scripts/generate-env-docs.ts`, by the dev scripts (which take their
// container ports and credentials from `DEV` below), and by the drift guard.
//
// `CATALOGUE` is typed as an exhaustive record over `VariableName`, so adding
// a variable to `variables.ts` without documenting it fails `pnpm typecheck`.
// That is what makes the schema the documentation source rather than merely
// its inspiration.

/**
 * The concrete development stack: one Postgres and one MinIO container, both
 * provisioned by `scripts/dev-pg.ts` and `scripts/dev-s3.ts`. Those scripts
 * import these values rather than restating them, so the containers and the
 * generated `.env.development` cannot drift apart.
 *
 * The Postgres port and credentials are also what `packages/studio-sync`'s
 * conformance suite expects, so the one container serves both.
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
  emailFrom: 'studio-dev@localhost',
} as const;

export const DEV_DATABASE_URL = `postgres://${DEV.pgUser}:${DEV.pgPassword}@${DEV.pgHost}:${DEV.pgPort}/${DEV.pgDatabase}`;
export const DEV_S3_ENDPOINT = `http://localhost:${DEV.s3Port}`;

export type VariableDoc = {
  /** Groups variables into sections in the generated documentation. */
  group: string;
  /** What the variable is, in one sentence. */
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

export const GROUPS = [
  'Process',
  'Object storage',
  'Database',
  'Authentication',
] as const;

export const CATALOGUE: Record<VariableName, VariableDoc> = {
  NODE_ENV: {
    group: 'Process',
    summary:
      'Runtime mode. Anything other than `production` leaves development affordances available.',
    deployment: 'Set to `production` by the Docker image and by Netlify.',
    example: 'production',
  },
  STUDIO_DEV_DEFAULTS: {
    group: 'Process',
    summary:
      'Marks the process as running against the committed development defaults.',
    deployment:
      'Never set. Combining it with `NODE_ENV=production` is refused at boot.',
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
  CLIENT_DIST: {
    group: 'Process',
    summary:
      'Directory of built client assets to serve, resolved against the working directory.',
    deployment:
      'Unset ⇒ `../client` relative to the server bundle, the Docker image layout. Irrelevant where a CDN serves the client.',
    example: '../client/dist',
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
      'Unset ⇒ no database; auth and sync refuse while the server still boots.',
    devDefault: DEV_DATABASE_URL,
    example: 'postgres://user:password@host:5432/studio',
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
      'The browser-facing origin. Cookies and magic-link URLs are minted against it.',
    deployment: 'Required whenever `DATABASE_URL` is set.',
    devDefault: DEV.baseUrl,
    example: 'https://studio.example.org',
  },
  SMTP_URL: {
    group: 'Authentication',
    summary: 'SMTP transport magic-link email is sent through.',
    deployment:
      'Unset ⇒ magic-link sends refuse. A sign-in link is never written to the log outside development.',
    example: 'smtp://user:password@smtp.example.org:587',
  },
  EMAIL_FROM: {
    group: 'Authentication',
    summary: 'From address on magic-link email.',
    deployment: 'Required alongside `SMTP_URL`, and refused without it.',
    devDefault: DEV.emailFrom,
    example: 'signin@studio.example.org',
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
  TRUSTED_PROXIES: {
    group: 'Authentication',
    summary:
      'Comma-separated proxy addresses or CIDRs whose `X-Forwarded-For` may be trusted when resolving the client IP.',
    deployment:
      'Unset ⇒ forwarded headers are not trusted, which is safe but shares one rate-limit bucket across every client behind a proxy.',
    example: '10.0.0.0/8,192.168.0.0/16',
  },
};
