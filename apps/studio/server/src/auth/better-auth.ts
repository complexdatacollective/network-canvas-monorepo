import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, organization } from 'better-auth/plugins';
import { and, eq } from 'drizzle-orm';
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
    // A third, always-available sign-in method alongside magic-link and
    // social: the seeded admin account (src/db/seed.ts) needs somewhere to
    // authenticate with its known password, and open sign-up here matches
    // the same policy magic-link and social already carry (#1255) — access
    // control arrives with team invitations (#1256), not a gate here. Uses
    // better-auth's default scrypt hasher (better-auth/crypto), which is the
    // same function the seed script hashes SEED_ADMIN_PASSWORD with.
    emailAndPassword: {
      enabled: true,
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
      // control arrives with team invitations (#1256).
      magicLink({
        expiresIn: 300,
        storeToken: 'hashed',
        sendMagicLink: ({ email, url }) => mailer.sendMagicLink({ email, url }),
      }),
      // Teams are better-auth organizations (#1249). The tenant boundary
      // tables keep domain names and snake_case: they are domain tables that
      // better-auth happens to manage. session stays camelCase like the rest
      // of the auth core. Invitation email delivery lands with #1256.
      //
      // The plugin's own `teams` option must stay disabled: it models a
      // subdivision *inside* an organization, so enabling it would put a
      // second, unrelated meaning of "team" in this schema and claim the
      // `activeTeamId` session field this mapping already uses. A grouping
      // layer below the team is a Project, and would not be built on it.
      organization({
        // Deleting a team would strand its tenant data. Only team_members and
        // team_invitations cascade; protocols would refuse the delete with a
        // raw foreign-key violation, and the sync tables — which carry team_id
        // with no foreign key at all — would silently orphan their drafts,
        // sections, manifests and leases. Nothing in Studio calls this
        // endpoint yet, so it stays closed until a deliberate tenant-purge
        // path lands with the team-role work that follows #1249.
        disableOrganizationDeletion: true,
        schema: {
          session: { fields: { activeOrganizationId: 'activeTeamId' } },
          organization: {
            modelName: 'teams',
            fields: { createdAt: 'created_at' },
          },
          member: {
            modelName: 'team_members',
            fields: {
              organizationId: 'team_id',
              userId: 'user_id',
              createdAt: 'created_at',
            },
          },
          invitation: {
            modelName: 'team_invitations',
            fields: {
              organizationId: 'team_id',
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
  const db = drizzle({ client: pool });
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
    getMembership: async (userId, teamId) => {
      // Through the drizzle definitions rather than a raw SQL string: the
      // adapter already queries these tables via drizzle, and this keeps the
      // physical names single-sourced in auth-schema.ts. The plugin's own api
      // surface is session-header-driven; this check is (userId, teamId)-
      // keyed, so it queries directly.
      const members = AUTH_TABLES.team_members;
      const rows = await db
        .select({ role: members.role })
        .from(members)
        .where(and(eq(members.user_id, userId), eq(members.team_id, teamId)))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
