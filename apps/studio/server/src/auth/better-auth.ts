import { betterAuth } from 'better-auth';
import { isAPIError } from 'better-auth/api';
import { magicLink, organization } from 'better-auth/plugins';
import type { BetterAuthOptions, DBAdapter } from 'better-auth/types';
import type { Effect } from 'effect';

import { SOCIAL_PROVIDERS } from '@codaco/studio-rpc';

import type { AuthEnv } from '../env.ts';
import type { RateLimiter } from '../rate-limit/limiter.ts';
import type { SecretsCipherApi } from '../secrets/cipher.ts';
import { withSecretsAdapter } from './secrets-adapter.ts';

// The only module that builds a better-auth instance (#1245). Three siblings
// take narrower pieces: adapter.ts its adapter factory, secrets-adapter.ts its
// adapter types, scripts/seed/teams.ts its password hasher.

/**
 * The sign-in endpoints whose per-address limit Studio sets rather than
 * leaving to better-auth's own defaults. better-auth strips its base path
 * before matching, so these are the paths under `/api/auth`.
 */
const SIGN_IN_PATHS = new Set([
  '/sign-in/email',
  '/sign-in/magic-link',
  '/sign-in/social',
]);

/**
 * better-auth's rate-limit key is `<ip>|<path>`. The path is what says which
 * scope a denial belongs to in the limiter's log and in the per-minute
 * summary; the address half never leaves this process unhashed, because the
 * limiter hashes the whole key before it becomes key material.
 */
function scopeForAuthKey(key: string): string {
  const path = key.slice(key.lastIndexOf('|') + 1);
  return SIGN_IN_PATHS.has(path) ? 'sign_in_address' : 'better_auth';
}

/** Runs an Effect that needs nothing, for a promise-shaped caller. */
type RunEffect = <A>(effect: Effect.Effect<A>) => Promise<A>;

/**
 * better-auth's limiter, storing its counters where Studio's does (#1909).
 *
 * `customStorage` rather than `secondaryStorage`: the latter is the same
 * switch for sessions, and moving session storage to Valkey would make the
 * store a correctness dependency — an unreachable Valkey would sign everyone
 * out. This moves the counters and nothing else, and it takes precedence over
 * every built-in storage, so the `rateLimit` table better-auth's adapter still
 * declares is never read or written.
 *
 * It fails open for the same reason the rest of the limiter does: the
 * store's decision is the limiter's, and the limiter allows when it cannot
 * reach the store.
 */
function createAuthRateLimitStorage(
  limiter: RateLimiter['Service'],
  run: RunEffect,
) {
  return {
    consume: async (key: string, rule: { window: number; max: number }) => {
      const decision = await run(
        limiter.consume(scopeForAuthKey(key), key, {
          max: rule.max,
          windowMs: rule.window * 1000,
        }),
      );
      return decision.allowed
        ? { allowed: true, retryAfter: null }
        : { allowed: false, retryAfter: decision.retryAfterSeconds };
    },
  };
}

/**
 * How a magic link leaves this process. Declared here rather than taken from
 * `email.ts`'s mailer, because this process has no mail transport: sending is
 * the worker's, and what is passed in queues a job for it (#1895).
 */
export type SendMagicLink = (input: {
  email: string;
  url: string;
}) => Promise<void>;

/** A database adapter as `betterAuth({ database })` takes one. */
export type AuthDatabaseAdapter = (options: BetterAuthOptions) => DBAdapter;

export type BetterAuthDeps = {
  readonly env: AuthEnv;
  /**
   * The database adapter, taken from the caller so the instance does not
   * decide which client it runs on: `auth/adapter.ts`'s over the application
   * client, or the drizzle adapter the better-auth CLI generates a schema
   * from. Composed under the secrets wrapper here either way.
   */
  readonly adapter: AuthDatabaseAdapter;
  readonly cipher: SecretsCipherApi;
  readonly sendMagicLink: SendMagicLink;
  /**
   * Where sign-in attempts are counted, and how better-auth's promise
   * callbacks run it. Absent means this instance enforces no limit of its own:
   * the auth CLI's configuration and the suites that are not about limiting
   * construct one that way. Every server process passes one.
   *
   * The runner travels with the limiter so that neither can be passed without
   * the other: it runs the limiter over the services of the program that built
   * this instance, so a denial logs through that program's logger. With
   * `Effect.runPromise` instead it would log through the default one, as
   * plain text among the program's JSON.
   */
  readonly limits?:
    | { readonly limiter: RateLimiter['Service']; readonly run: RunEffect }
    | undefined;
};

export function createBetterAuthInstance({
  env,
  adapter,
  cipher,
  sendMagicLink,
  limits,
}: BetterAuthDeps) {
  return betterAuth({
    baseURL: env.baseUrl,
    basePath: '/api/auth',
    secret: env.secret,
    // Wrapped so `account`'s OAuth tokens are sealed in the database and
    // opened on the way out (#1900); `account.encryptOAuthTokens` stays unset
    // because it would seal with BETTER_AUTH_SECRET, unrotatable and bound to
    // no row. Composed here, at the factory, so the wrapper is the adapter
    // better-auth resolves for every path including its transactions.
    database: (options: BetterAuthOptions) =>
      withSecretsAdapter(adapter(options), cipher),
    // better-auth's own CSRF for /api/auth/*; the rest of the cookie plane
    // is covered by src/http/middleware/origin.ts (#1248).
    trustedOrigins: [env.baseUrl],
    // Sign-in attempt limits count in the shared store, so they mean the same
    // thing with one API container and with two (#1909). This supersedes the
    // 2026-08-13 reading of #1246 that put them in Postgres: the ruling of
    // 2026-09-15 is Valkey for rate limiting and Postgres for jobs, and the
    // counters are disposable state — losing them resets a window rather than
    // losing a record. What #1246 is actually about, the immutable audit log,
    // is untouched and stays in Postgres.
    rateLimit: limits
      ? {
          enabled: true,
          customStorage: createAuthRateLimitStorage(limits.limiter, limits.run),
          // better-auth's own default for these paths is three attempts in
          // ten seconds. Studio's is the `sign_in_address` constant
          // (src/rate-limit/scopes.ts); the per-email limit is Studio's own
          // middleware, because better-auth keys only by address and path.
          customRules: Object.fromEntries(
            [...SIGN_IN_PATHS].map((path) => [
              path,
              {
                window: limits.limiter.rules.sign_in_address.windowMs / 1000,
                max: limits.limiter.rules.sign_in_address.max,
              },
            ]),
          ),
        }
      : { enabled: false },
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
    // social: the seeded admin account (scripts/seed/seed.ts) needs somewhere to
    // authenticate with its known password, and open sign-up here matches
    // the same policy magic-link and social already carry (#1255) — access
    // control arrives with team invitations (#1256), not a gate here. Uses
    // better-auth's default scrypt hasher (better-auth/crypto), which is the
    // same function the seed script hashes SEED_ADMIN_PASSWORD with.
    emailAndPassword: {
      enabled: true,
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
        sendMagicLink: ({ email, url }) => sendMagicLink({ email, url }),
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

/**
 * better-auth's answer to "that address already has an account", as this
 * configuration produces it. The generic duplicate response — a fake success
 * carrying a synthetic user — is reached only with `requireEmailVerification`
 * or `autoSignIn: false`, and this instance sets neither, so the real refusal
 * arrives as this code. Anything else is a failure and is rethrown.
 */
const EMAIL_TAKEN_CODE = 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

export function isEmailTaken(error: unknown): boolean {
  if (!isAPIError(error)) return false;
  const body: unknown = error.body;
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    body.code === EMAIL_TAKEN_CODE
  );
}

/**
 * A refusal better-auth answered on purpose, as opposed to a failure: its own
 * `APIError`, whatever the code. A sign-in reads every one of them the same.
 */
export const isRefusal = (error: unknown): boolean => isAPIError(error);
