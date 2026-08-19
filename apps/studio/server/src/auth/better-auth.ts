import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, organization } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

import { SOCIAL_PROVIDERS } from '@codaco/studio-rpc';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import type { AuthEnv } from '../env.ts';
import type { MagicLinkMailer } from './email.ts';
import type { AuthService } from './service.ts';

// The only module that imports 'better-auth' (#1245).

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
      schema: AUTH_TABLES,
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
      // Workspaces are better-auth organizations (#1249). The tenant boundary
      // tables keep domain names and snake_case: they are domain tables that
      // better-auth happens to manage. session stays camelCase like the rest
      // of the auth core. Invitation email delivery lands with #1256.
      organization({
        schema: {
          session: { fields: { activeOrganizationId: 'activeWorkspaceId' } },
          organization: {
            modelName: 'workspaces',
            fields: { createdAt: 'created_at' },
          },
          member: {
            modelName: 'workspace_members',
            fields: {
              organizationId: 'workspace_id',
              userId: 'user_id',
              createdAt: 'created_at',
            },
          },
          invitation: {
            modelName: 'workspace_invitations',
            fields: {
              organizationId: 'workspace_id',
              inviterId: 'inviter_id',
              expiresAt: 'expires_at',
              createdAt: 'created_at',
            },
          },
        },
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
    getMembership: async (userId, workspaceId) => {
      // Raw pg like every other runtime query: the plugin's api surface is
      // session-header-driven, and this check is (userId, workspaceId)-keyed.
      const result = await pool.query<{ role: string }>(
        'select role from workspace_members where user_id = $1 and workspace_id = $2',
        [userId, workspaceId],
      );
      const row = result.rows[0];
      return row ? { workspaceId, role: row.role } : null;
    },
  };
}
