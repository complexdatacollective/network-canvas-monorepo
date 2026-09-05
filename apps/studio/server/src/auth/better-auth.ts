import { betterAuth } from 'better-auth';
import { magicLink, organization } from 'better-auth/plugins';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

import { SOCIAL_PROVIDERS } from '@codaco/studio-rpc';
import type { DeploymentMode } from '@codaco/studio-rpc/surfaces';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import type { AuthEnv } from '../env.ts';
import { logOperational } from '../observability/logger.ts';
import type { EncryptionKeys } from '../pii/keys.ts';
import type { MagicLinkMailer } from './email.ts';
import { encryptedAuthAdapter } from './encrypted-adapter.ts';
import { selfHostedEnrollmentHooks } from './enrollment.ts';
import type { AuthService } from './service.ts';

// The only module that imports 'better-auth' (#1245).

export type BetterAuthInstanceOptions = {
  encryptionKeys?: EncryptionKeys;
  deploymentMode?: DeploymentMode;
};

export function createBetterAuthInstance(
  env: AuthEnv,
  pool: pg.Pool,
  mailer: MagicLinkMailer,
  options: BetterAuthInstanceOptions = {},
) {
  const deploymentMode = options.deploymentMode ?? 'self-hosted';
  return betterAuth({
    ...(deploymentMode === 'self-hosted'
      ? { databaseHooks: selfHostedEnrollmentHooks(pool) }
      : {}),
    logger: {
      level: 'warn',
      log(level) {
        logOperational(
          level === 'error' ? 'STUDIO_AUTH_ERROR' : 'STUDIO_AUTH_WARNING',
        );
      },
    },
    baseURL: env.baseUrl,
    basePath: '/api/auth',
    secret: env.secret,
    database: encryptedAuthAdapter(pool, options.encryptionKeys),
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
    // social: the seeded admin account and the self-host bootstrap owner
    // authenticate with a password. Self-host enrollment is invitation-only
    // and local password signup is disabled; managed enrollment stays open. Uses
    // better-auth's default scrypt hasher (better-auth/crypto), which is the
    // same function the seed script hashes SEED_ADMIN_PASSWORD with.
    emailAndPassword: {
      enabled: true,
      disableSignUp: deploymentMode === 'self-hosted',
    },
    user: {
      // Studio's per-user UI-language preference, stored on the user row
      // (db/auth-schema.ts, localization design §5.2). Declared so
      // better-auth's adapter round-trips the column; `input: false` keeps
      // better-auth's own endpoints (update-user and friends) from writing
      // it — only the account.updateLocale RPC does, which is also where
      // tags are validated against the supported registry.
      additionalFields: {
        locale: { type: 'string', required: false, input: false },
      },
    },
    account: {
      additionalFields: {
        accessTokenKeyId: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
        accessTokenAlgorithm: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
        refreshTokenKeyId: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
        refreshTokenAlgorithm: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
        idTokenKeyId: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
        idTokenAlgorithm: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
      },
      // Managed deployments retain their provider trust policy. Self-hosted
      // linking requires an actual verified-email claim, including for an
      // existing owner: some Entra tenants omit it and must use a magic link.
      accountLinking: {
        enabled: true,
        trustedProviders:
          deploymentMode === 'managed' ? [...SOCIAL_PROVIDERS] : [],
      },
    },
    plugins: [
      // Self-host creation crosses the shared verified-invitation hook;
      // existing identities can still sign in without an outstanding invite.
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
  options: BetterAuthInstanceOptions = {},
): AuthService {
  const auth = createBetterAuthInstance(env, pool, mailer, options);
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
        locale: result.user.locale ?? null,
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
    listMemberships: async (userId) => {
      // The same policy-free table `getMembership` reads, and the same index
      // (`team_members_user_id_team_id_idx`) serves it: this is the whole
      // search space a study identifier may be resolved over, so it is read
      // before any tenant is pinned and nothing else is read with it.
      const members = AUTH_TABLES.team_members;
      return db
        .select({ teamId: members.team_id, role: members.role })
        .from(members)
        .where(eq(members.user_id, userId))
        .orderBy(members.team_id);
    },
  };
}
