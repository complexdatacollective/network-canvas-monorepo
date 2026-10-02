import { and, eq } from 'drizzle-orm';
import { Context, Effect, Layer, Option } from 'effect';
import type { Headers } from 'effect/http';
import type { SqlError } from 'effect/sql';

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

export type SessionPrincipal = {
  kind: 'user';
  userId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  locale: string | null;
  sessionId: string;
};

export type Principal = SessionPrincipal;

export type TeamMembership = {
  role: string;
};

export type IdentifiedTeamMembership = TeamMembership & {
  teamId: string;
};

export type EstablishedSession = {
  readonly userId: string;
  readonly setCookies: ReadonlyArray<string>;
};

export type SignUpOutcome =
  | { kind: 'created'; session: EstablishedSession }
  | { kind: 'emailTaken' }
  | { kind: 'unavailable' };

export type SignInOutcome =
  | { kind: 'signedIn'; session: EstablishedSession }
  | { kind: 'refused' };

export class AuthService extends Context.Service<
  AuthService,
  {
    readonly handler: (request: Request) => Effect.Effect<Response>;
    readonly getSession: (
      headers: Headers.Headers,
    ) => Effect.Effect<Option.Option<SessionPrincipal>>;
    readonly getMembership: (
      userId: string,
      teamId: string,
    ) => Effect.Effect<Option.Option<TeamMembership>>;
    readonly listMemberships: (
      userId: string,
    ) => Effect.Effect<ReadonlyArray<IdentifiedTeamMembership>>;
    readonly signUpEmail: (input: {
      name: string;
      email: string;
      password: string;
    }) => Effect.Effect<SignUpOutcome>;
    readonly signInEmail: (input: {
      email: string;
      password: string;
    }) => Effect.Effect<SignInOutcome>;
  }
>()('@studio/AuthService') {
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

  static readonly layer: Layer.Layer<
    AuthService,
    never,
    Environment | Database | SecretsCipher | RateLimiter | Jobs
  > = Layer.effect(
    AuthService,
    Effect.suspend(() => makeLive),
  );

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

const enqueueSignInEmail = Effect.fn('auth.sendMagicLink')(function* (
  data: SignInEmailJob,
) {
  const jobs = yield* Jobs;
  yield* UntenantedScope.open(jobs.enqueue('sign-in-email', data));
}, Effect.orDie);

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
      // Every refusal reads the same: `/setup` must not become an oracle for which
      // addresses have accounts.
      Effect.catch((error): Effect.Effect<SignInOutcome> =>
        isRefusal(error)
          ? Effect.succeed({ kind: 'refused' })
          : Effect.die(error),
      ),
    ),
  });
});
