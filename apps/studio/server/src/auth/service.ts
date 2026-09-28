import { and, eq } from 'drizzle-orm';
import { Context, Effect, Layer, Option } from 'effect';
import type { Headers } from 'effect/unstable/http';
import type { SqlError } from 'effect/unstable/sql';

import type { SignInEmailJob } from '@codaco/studio-sync/jobs';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { Database } from '../db/client.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction, UntenantedScope } from '../db/tenant.ts';
import { Environment } from '../env.ts';
import { Jobs } from '../jobs/jobs.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { studioAuthAdapter } from './adapter.ts';
import {
  createBetterAuthInstance,
  isEmailTaken,
  isRefusal,
  type SendMagicLink,
} from './better-auth.ts';
import { makeSqlBridge } from './sql-bridge.ts';

// Studio's auth provider as an Effect service (#1927 §12, S6 §3). better-auth
// is a Promise API; this is the one place its answers become Effects, so every
// caller — the rpc middleware, the HTTP gates, `setup.complete`, the team and
// study access helpers — asks the same questions of the same instance and
// reads the same null cases.
//
// Nothing here fails in the error channel. A session that does not resolve and
// a membership that does not exist are `Option.none()`, the two sign-in paths
// answer their refusal tags, and anything else better-auth rejects with is a
// defect — the same reading as before, where a failure left as a 500.

/**
 * A researcher signed in with a cookie session. The `kind` discriminant
 * reserves the slot for the token plane's ServicePrincipal (#1288).
 */
export type SessionPrincipal = {
  kind: 'user';
  userId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  /**
   * The stored UI-language preference (user.locale, localization design
   * §5.2); null until the researcher chooses one. On the principal because
   * the session lookup already reads the user row, so `me` forwards it
   * without a query of its own — and stays answerable database-free.
   */
  locale: string | null;
  sessionId: string;
};

export type Principal = SessionPrincipal;

/**
 * A user's standing in the team they were resolved against. Roles are the
 * organization plugin's ('owner' | 'admin' | 'member' by default); #1257's
 * RBAC taxonomy maps onto them later. Read-only request authorization stays
 * behind AuthService so better-auth remains replaceable (#1245); audited team
 * commands re-read and lock the same domain rows through TeamStore because
 * their authorization decision must share the write transaction.
 */
export type TeamMembership = {
  role: string;
};

/** A membership that names its team: what a study's tenant is resolved over. */
export type IdentifiedTeamMembership = TeamMembership & {
  teamId: string;
};

/**
 * A session the auth provider has just established for a caller who had none.
 *
 * `setCookies` are the provider's own `set-cookie` values: the browser is
 * signed in by carrying them out through the surface that asked — the `/rpc`
 * route's `SetCookies` holder — rather than by any cookie this application
 * knows how to spell. Strings rather than the provider's `Headers`, because an
 * Effect rpc handler cannot touch a response; it can only hand values to the
 * holder that does.
 */
export type EstablishedSession = {
  readonly userId: string;
  readonly setCookies: ReadonlyArray<string>;
};

export type SignUpOutcome =
  | { kind: 'created'; session: EstablishedSession }
  /** The address already has an account; nothing was created. */
  | { kind: 'emailTaken' }
  /** Auth is not configured, so no account can exist. */
  | { kind: 'unavailable' };

export type SignInOutcome =
  | { kind: 'signedIn'; session: EstablishedSession }
  /** Wrong credentials, no such account, or auth is not configured. */
  | { kind: 'refused' };

export class AuthService extends Context.Service<
  AuthService,
  {
    /** better-auth's own web handler, for the `/api/auth/*` mount. */
    readonly handler: (request: Request) => Effect.Effect<Response>;
    /** Cookie-session lookup; none when absent, expired, or auth is disabled. */
    readonly getSession: (
      headers: Headers.Headers,
    ) => Effect.Effect<Option.Option<SessionPrincipal>>;
    /** None when the user is not a member of the team (or auth is disabled). */
    readonly getMembership: (
      userId: string,
      teamId: string,
    ) => Effect.Effect<Option.Option<TeamMembership>>;
    /**
     * Every team the user belongs to. The search space a study identifier is
     * resolved over (app-shell design §6.3): a `/study/$studyId` URL names no
     * team, so the server derives it rather than trusting one from the browser.
     * Empty when the user belongs to nothing, or auth is disabled.
     */
    readonly listMemberships: (
      userId: string,
    ) => Effect.Effect<ReadonlyArray<IdentifiedTeamMembership>>;
    /**
     * Creates an email/password account and signs it in, returning the
     * cookies that carry the session.
     *
     * Here for first-run bootstrap alone (#1909): every other account arrives
     * through the provider's own endpoints under `/api/auth/*`, which the
     * browser talks to directly. `/setup` cannot, because the account it
     * creates and the ownership mark it writes have to be one procedure.
     */
    readonly signUpEmail: (input: {
      name: string;
      email: string;
      password: string;
    }) => Effect.Effect<SignUpOutcome>;
    /**
     * Signs an existing account in, for the one case `/setup` has to recover
     * from: an account created by an interrupted setup, whose ownership mark
     * never landed. Proving the password is what makes adopting it safe.
     */
    readonly signInEmail: (input: {
      email: string;
      password: string;
    }) => Effect.Effect<SignInOutcome>;
  }
>()('@studio/AuthService') {
  /**
   * An instance with no auth configured: `/api/auth/*` answers 503 problem
   * JSON and every question answers its null case, so a protected procedure
   * reads it as "nobody is signed in" rather than as a fault.
   */
  static readonly disabled = AuthService.of({
    handler: () =>
      Effect.succeed(
        Response.json(
          { title: 'Authentication Not Configured', status: 503 },
          {
            status: 503,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    getSession: () => Effect.succeedNone,
    getMembership: () => Effect.succeedNone,
    listMemberships: () => Effect.succeed([]),
    signUpEmail: () => Effect.succeed({ kind: 'unavailable' }),
    signInEmail: () => Effect.succeed({ kind: 'refused' }),
  });

  static readonly layerDisabled: Layer.Layer<AuthService> = Layer.succeed(
    AuthService,
  )(AuthService.disabled);

  /**
   * better-auth over the application client: the sql-pg adapter through the
   * bridge, the secrets wrapper over it, sign-in limits counted by the
   * process's `RateLimiter`, and sign-in mail queued on `Jobs`. It owns no
   * socket of its own — every statement is the application client's.
   */
  static readonly layer: Layer.Layer<
    AuthService,
    never,
    Environment | Database | SecretsCipher | RateLimiter | Jobs
  > = Layer.effect(
    AuthService,
    Effect.suspend(() => makeLive),
  );

  /**
   * Which of the two this process is: live where there is a database and auth
   * is configured, disabled everywhere else.
   *
   * A database with no keyring is refused here rather than served, although
   * the environment's own decode already refuses it: reaching the live layer
   * without one would surface as a missing-method error from inside
   * better-auth's first account write, and this names the cause instead.
   */
  static readonly layerFromEnvironment: Layer.Layer<
    AuthService,
    never,
    Environment | Database | SecretsCipher | RateLimiter | Jobs
  > = Layer.unwrap(
    Effect.gen(function* () {
      const env = yield* Environment;
      if (!env.db || !env.auth) return AuthService.layerDisabled;
      if (!env.secrets) {
        return yield* Effect.die(
          new Error(
            'A secrets keyring is required to serve authentication: STUDIO_SECRETS_KEY (or STUDIO_SECRETS_KEY_FILE) is unset while a database is configured.',
          ),
        );
      }
      return AuthService.layer;
    }),
  );
}

const { team_members: members } = AUTH_TABLES;

/**
 * Through the drizzle definitions rather than a raw SQL string, so the
 * physical names stay single-sourced in `auth-schema.ts`. The plugin's own api
 * surface is session-header-driven; this check is (userId, teamId)-keyed, so it
 * queries directly.
 */
const readMembership = Effect.fnUntraced(function* (
  userId: string,
  teamId: string,
): Effect.fn.Return<
  Option.Option<TeamMembership>,
  SqlError.SqlError,
  Transaction
> {
  const { tx } = yield* Transaction;
  const rows = yield* sqlErrorsOnly(
    tx
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.user_id, userId), eq(members.team_id, teamId)))
      .limit(1),
  );
  return Option.fromNullishOr(rows[0]);
});

/**
 * The same policy-free table `readMembership` reads, and the same index
 * (`team_members_user_id_team_id_idx`) serves it: this is the whole search
 * space a study identifier may be resolved over, so it is read before any
 * tenant is pinned and nothing else is read with it.
 */
const readMemberships = Effect.fnUntraced(function* (
  userId: string,
): Effect.fn.Return<
  ReadonlyArray<IdentifiedTeamMembership>,
  SqlError.SqlError,
  Transaction
> {
  const { tx } = yield* Transaction;
  return yield* sqlErrorsOnly(
    tx
      .select({ teamId: members.team_id, role: members.role })
      .from(members)
      .where(eq(members.user_id, userId))
      .orderBy(members.team_id),
  );
});

/**
 * How a magic link leaves this process: as a `sign-in-email` job the worker
 * sends (#1895). This process holds no mail transport at all. The URL travels
 * in the payload — the documented exception to identifiers-only payloads,
 * because the token is minted by better-auth inside the request and exists
 * nowhere else.
 *
 * A transaction of its own, because better-auth calls `sendMagicLink` outside
 * any adapter transaction: the magic-link endpoint writes its verification row
 * and then calls the hook as two separate awaits, with nothing enclosing them.
 * There is no domain write for this job to join. It is still a transaction
 * rather than a bare statement because `Jobs.enqueue` requires `Transaction`
 * and nothing but a scope provides one — which is the queue's atomicity
 * guarantee at the type level, and holds for this caller exactly as it does for
 * a command with domain work beside its job.
 *
 * Untenanted: a sign-in belongs to no team, and the queue's own tables carry
 * no tenant policy. The scope still pins the application role, which is the
 * half of it a bare statement outside a transaction would lose on rc.115.
 */
const enqueueSignInEmail = Effect.fn('auth.sendMagicLink')(
  function* (data: SignInEmailJob) {
    const jobs = yield* Jobs;
    yield* UntenantedScope.open(jobs.enqueue('sign-in-email', data));
  },
  // Nothing about a magic link is retryable here and nothing downstream can
  // act on the distinction: a refused singleton and an unreachable database
  // both mean the mail was not queued. Raising it as a defect is what rejects
  // the promise better-auth awaits, so it answers the sign-in request with a
  // failure rather than tell the person to check an inbox nothing will reach.
  Effect.orDie,
);

/**
 * The hook better-auth is handed: a promise over the services the layer was
 * built with. The context is captured once rather than read per call, because
 * better-auth's callback is a promise with no Effect context of its own.
 */
export const makeSendMagicLink: Effect.Effect<
  SendMagicLink,
  never,
  Database | Jobs
> = Effect.map(
  Effect.context<Database | Jobs>(),
  (services) => (data) =>
    Effect.runPromiseWith(services)(enqueueSignInEmail(data)),
);

const makeLive = Effect.gen(function* () {
  const env = yield* Environment;
  if (env.auth === undefined) {
    return yield* Effect.die(
      new Error('the live auth service was built with no auth configured'),
    );
  }
  const database = yield* Database;
  const instance = createBetterAuthInstance({
    env: env.auth,
    adapter: studioAuthAdapter(yield* makeSqlBridge),
    cipher: yield* SecretsCipher,
    sendMagicLink: yield* makeSendMagicLink,
    limits: {
      limiter: yield* RateLimiter,
      run: Effect.runPromiseWith(yield* Effect.context()),
    },
  });

  /**
   * The two membership reads, each in a pinned transaction of its own: on
   * rc.115 a statement outside one runs as the connecting login rather than
   * the application role. Nothing about either is a refusal the caller could
   * act on, so a database failure is a defect.
   */
  const pinned = <A>(
    read: Effect.Effect<A, SqlError.SqlError, Transaction>,
  ): Effect.Effect<A> =>
    Effect.orDie(
      Effect.provideService(UntenantedScope.open(read), Database, database),
    );

  return AuthService.of({
    handler: Effect.fn('auth.handler')(function* (request: Request) {
      return yield* Effect.promise(() => instance.handler(request));
    }),
    getSession: Effect.fn('auth.getSession')(function* (
      headers: Headers.Headers,
    ): Effect.fn.Return<Option.Option<SessionPrincipal>> {
      const result = yield* Effect.promise(() =>
        instance.api.getSession({ headers: new globalThis.Headers(headers) }),
      );
      if (!result) return Option.none();
      return Option.some({
        kind: 'user',
        userId: result.user.id,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        name: result.user.name,
        locale: result.user.locale ?? null,
        sessionId: result.session.id,
      });
    }),
    getMembership: Effect.fn('auth.getMembership')(function* (
      userId: string,
      teamId: string,
    ) {
      return yield* pinned(readMembership(userId, teamId));
    }),
    listMemberships: Effect.fn('auth.listMemberships')(function* (
      userId: string,
    ) {
      return yield* pinned(readMemberships(userId));
    }),
    // `returnHeaders` is what makes these usable from a procedure: the session
    // cookie better-auth would have set on its own response comes back as
    // headers, and their `set-cookie` values are what the caller carries out.
    signUpEmail: Effect.fn('auth.signUpEmail')(
      function* ({
        name,
        email,
        password,
      }: {
        name: string;
        email: string;
        password: string;
      }): Effect.fn.Return<SignUpOutcome, unknown> {
        const { headers, response } = yield* Effect.tryPromise({
          try: () =>
            instance.api.signUpEmail({
              body: { name, email, password },
              returnHeaders: true,
            }),
          catch: (cause: unknown) => cause,
        });
        return {
          kind: 'created',
          session: {
            userId: response.user.id,
            setCookies: headers.getSetCookie(),
          },
        };
      },
      Effect.catch((error): Effect.Effect<SignUpOutcome> =>
        isEmailTaken(error)
          ? Effect.succeed({ kind: 'emailTaken' })
          : Effect.die(error),
      ),
    ),
    signInEmail: Effect.fn('auth.signInEmail')(
      function* ({
        email,
        password,
      }: {
        email: string;
        password: string;
      }): Effect.fn.Return<SignInOutcome, unknown> {
        const { headers, response } = yield* Effect.tryPromise({
          try: () =>
            instance.api.signInEmail({
              body: { email, password },
              returnHeaders: true,
            }),
          catch: (cause: unknown) => cause,
        });
        return {
          kind: 'signedIn',
          session: {
            userId: response.user.id,
            setCookies: headers.getSetCookie(),
          },
        };
      },
      // Every refusal reads the same — wrong password, no such account, a
      // provider-side policy — because the caller has nothing different to
      // do about any of them, and `/setup` must not become an oracle for
      // which addresses have accounts.
      Effect.catch((error): Effect.Effect<SignInOutcome> =>
        isRefusal(error)
          ? Effect.succeed({ kind: 'refused' })
          : Effect.die(error),
      ),
    ),
  });
});
