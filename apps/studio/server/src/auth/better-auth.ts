import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import type pg from 'pg';

import type { AuthEnv } from '../env.ts';
import type { MagicLinkMailer } from './email.ts';
import type { AuthService } from './service.ts';

// The only module that imports 'better-auth' (#1245: the library stays
// replaceable behind src/auth's service interface). Everything
// library-specific — cookie names, plugin endpoints, session shapes — is
// contained here and adapted to AuthService.

export function createBetterAuthInstance(
  env: AuthEnv,
  pool: pg.Pool,
  mailer: MagicLinkMailer,
) {
  return betterAuth({
    baseURL: env.baseUrl,
    basePath: '/api/auth',
    secret: env.secret,
    database: pool,
    // better-auth's own CSRF for /api/auth/*; the rest of the cookie plane
    // is covered by src/auth/csrf.ts (#1248).
    trustedOrigins: [env.baseUrl],
    // Durable security counters live in Postgres, never memory or Redis
    // (#1246): sign-in attempt limits survive deploys.
    rateLimit: { enabled: true, storage: 'database' },
    // The rate-limit key is the client IP, so whether a forwarded header can
    // be believed decides whether the magic-link send cap means anything.
    // With a trusted-proxy list, better-auth walks X-Forwarded-For from the
    // right and takes the first hop outside the list. Without one it still
    // trusts a *single-value* header at face value, which a forged
    // X-Forwarded-For satisfies — one fresh bucket per request, and the cap
    // is a no-op. So an unconfigured deployment reads no forwarded header at
    // all and shares one bucket per path: a blunt limit, but a real one.
    advanced: {
      ipAddress: env.trustedProxies
        ? { trustedProxies: env.trustedProxies }
        : { ipAddressHeaders: [] },
    },
    // OAuth sign-in (#1255). Only the providers whose credentials resolved
    // are registered; the SPA learns the same set via AuthCapabilities.
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
        trustedProviders: ['google', 'microsoft'],
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
