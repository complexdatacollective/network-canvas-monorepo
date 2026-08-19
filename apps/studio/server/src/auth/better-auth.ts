import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

import { SOCIAL_PROVIDERS } from '@codaco/studio-rpc';

import {
  account,
  rateLimit,
  session,
  user,
  verification,
} from '../db/auth-schema.ts';
import type { AuthEnv } from '../env.ts';
import type { MagicLinkMailer } from './email.ts';
import type { AuthService } from './service.ts';

// The only module that imports 'better-auth' (#1245).

// Model names resolve against these keys; the physical shape is pinned by
// src/db/auth-schema.ts.
const authSchema = { user, session, account, verification, rateLimit };

export function createBetterAuthInstance(
  env: AuthEnv,
  pool: pg.Pool,
  mailer: MagicLinkMailer,
) {
  return betterAuth({
    baseURL: env.baseUrl,
    basePath: '/api/auth',
    secret: env.secret,
    database: drizzleAdapter(drizzle({ client: pool }), {
      provider: 'pg',
      schema: authSchema,
    }),
    // better-auth's own CSRF for /api/auth/*; the rest of the cookie plane
    // is covered by src/auth/csrf.ts (#1248).
    trustedOrigins: [env.baseUrl],
    // Durable security counters live in Postgres, never memory or Redis
    // (#1246): sign-in attempt limits survive deploys.
    rateLimit: { enabled: true, storage: 'database' },
    // Without a trusted-proxy list better-auth still trusts a single-value
    // X-Forwarded-For at face value, which a forgery satisfies — one fresh
    // rate-limit bucket per request, so the cap becomes a no-op. Reading no
    // forwarded header shares one bucket per path: blunt, but real.
    advanced: {
      ipAddress: env.trustedProxies
        ? { trustedProxies: env.trustedProxies }
        : { ipAddressHeaders: [] },
    },
    socialProviders: {
      ...(env.socialProviders.google && {
        google: {
          clientId: env.socialProviders.google.clientId,
          clientSecret: env.socialProviders.google.clientSecret,
        },
      }),
      ...(env.socialProviders.microsoft && {
        microsoft: {
          clientId: env.socialProviders.microsoft.clientId,
          clientSecret: env.socialProviders.microsoft.clientSecret,
          tenantId: env.socialProviders.microsoft.tenantId,
        },
      }),
    },
    account: {
      // A Google or Microsoft sign-in whose verified email matches an
      // existing (verified, e.g. magic-link) user joins that user rather
      // than erroring: both IdPs verify addresses, so the claim is trusted
      // as ownership proof even where the id token omits `email_verified`
      // (some Entra tenants).
      accountLinking: {
        enabled: true,
        trustedProviders: [...SOCIAL_PROVIDERS],
      },
    },
    plugins: [
      // Sign-up is deliberately open for now (recorded on #1255): access
      // control arrives with workspace invitations (#1256).
      magicLink({
        expiresIn: 300,
        storeToken: 'hashed',
        sendMagicLink: ({ email, url }) => mailer.sendMagicLink({ email, url }),
      }),
    ],
  });
}

export function createBetterAuthService(
  env: AuthEnv,
  pool: pg.Pool,
  mailer: MagicLinkMailer,
): AuthService {
  const auth = createBetterAuthInstance(env, pool, mailer);
  return {
    handler: (request) => auth.handler(request),
    getSession: async (headers) => {
      const result = await auth.api.getSession({ headers });
      if (!result) return null;
      return {
        kind: 'user',
        userId: result.user.id,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        name: result.user.name,
        sessionId: result.session.id,
      };
    },
  };
}
