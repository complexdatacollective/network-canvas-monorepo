import { z } from 'zod';

// Deliberately NO `.default()` calls anywhere in this file. Defaults declared
// here would be compiled into the production server bundle, which is how the
// publicly-known development auth secret used to ship inside the built
// Netlify function. Development values live in the committed
// `.env.development`, which no deployment path loads.

export const serverSchemas = {
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),

  /**
   * Set only by the committed `.env.development`, which the dev script loads
   * and no deployment path does. It — not `NODE_ENV` — is what activates the
   * development conveniences (console mailer, and tolerating a stray
   * `EMAIL_FROM`), so a deployment that forgot `NODE_ENV=production` still
   * cannot run with them.
   */
  STUDIO_DEV_DEFAULTS: z.stringbool().optional(),

  PORT: z.coerce.number().int().min(0).max(65535).optional(),
  HOST: z.string().min(1).optional(),
  CLIENT_DIST: z.string().min(1).optional(),

  // http(s) only: a bare `host:port` parses as a URL whose scheme is the
  // hostname, which the S3 client would then fail on far from here.
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  DATABASE_URL: z.string().min(1).optional(),

  /**
   * 32 bytes of base64 is 44 characters, so the documented
   * `openssl rand -base64 32` clears this comfortably. The floor exists to
   * refuse a placeholder or truncated value at boot rather than let it
   * quietly weaken session and magic-link token signing.
   */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),

  /**
   * Named `PUBLIC_URL` to match Fresco's name for the same thing, and
   * specifically not `BASE_URL`: Vite-driven runtimes — including vitest —
   * set `process.env.BASE_URL` to `/`, which would silently shadow the real
   * configuration.
   */
  PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),

  SMTP_URL: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),

  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_TENANT_ID: z.string().min(1).optional(),

  TRUSTED_PROXIES: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .optional(),
} as const;

export type VariableName = keyof typeof serverSchemas;

export type RawEnv = Readonly<{
  [Name in VariableName]?: z.infer<(typeof serverSchemas)[Name]>;
}>;
