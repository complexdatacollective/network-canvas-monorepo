import { Context, Effect, Layer, Predicate } from 'effect';
import type pg from 'pg';
import { expect } from 'vitest';

import { createStudio } from '../../app.ts';
import { AuthService } from '../../auth/service.ts';
import { Environment, type StudioEnv } from '../../env.ts';
import { Jobs, RecordedJobs } from '../../jobs/jobs.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import type { StudioServices } from '../../rpc/deps.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { limiterWithoutStore } from './valkey.ts';

/**
 * An auth service that answers every method with its null case; a suite states
 * only what it overrides. Growing the service then touches this file, not every
 * suite that stubs it.
 */
export const authServiceStub = (
  overrides: Partial<AuthService['Service']> = {},
): AuthService['Service'] =>
  AuthService.of({
    handler: () => Effect.succeed(Response.json({})),
    getSession: () => Effect.succeedNone,
    getMembership: () => Effect.succeedNone,
    listMemberships: () => Effect.succeed([]),
    signUpEmail: () => Effect.succeed({ kind: 'unavailable' }),
    signInEmail: () => Effect.succeed({ kind: 'refused' }),
    ...overrides,
  });

/** The same stub as a layer, for a suite that provides services rather than building a Studio. */
export const AuthServiceStub = (
  overrides?: Partial<AuthService['Service']>,
): Layer.Layer<AuthService> =>
  Layer.succeed(AuthService)(authServiceStub(overrides));

/**
 * The production auth service over a suite's scratch schema: `AuthService.layer`
 * built from the suite's own services (`openTestDatabase().services`), so the
 * adapter, the membership reads and the sign-in mail hook all run on the
 * scratch schema's application client.
 *
 * The limiter defaults to one over no store, which admits everything: every
 * vitest process resolves to the same localhost address, and a shared
 * per-address bucket would 429 one file's sign-in because another file signed
 * in (#1909). `jobs` replaces the queue the hook enqueues on, for a suite that
 * reads the magic link back out of a recording.
 */
export const liveAuthService = (
  env: StudioEnv,
  services: Context.Context<StudioServices>,
  options: {
    readonly limiter?: RateLimiter['Service'];
    readonly jobs?: Context.Context<Jobs>;
    /** The cipher OAuth tokens are sealed with, for a suite that seeded under a keyring of its own. */
    readonly cipher?: SecretsCipher['Service'];
  } = {},
): AuthService['Service'] => {
  const withJobs =
    options.jobs === undefined
      ? services
      : Context.merge(services, options.jobs);
  const context =
    options.cipher === undefined
      ? withJobs
      : Context.add(withJobs, SecretsCipher, options.cipher);
  return Effect.runSync(
    Effect.service(AuthService).pipe(
      Effect.provide(AuthService.layer),
      Effect.provideService(Environment, env),
      Effect.provideService(
        RateLimiter,
        options.limiter ?? limiterWithoutStore,
      ),
      Effect.provide(context),
    ),
  );
};

/** The one `sign-in-email` a recording holds, as the worker would read it. */
function sentLink(recorded: RecordedJobs['Service']): {
  email: string;
  url: string;
} {
  expect(recorded.recorded.map(({ queue }) => queue)).toEqual([
    'sign-in-email',
  ]);
  const payload = recorded.recorded[0]?.payload;
  if (
    !Predicate.hasProperty(payload, 'email') ||
    !Predicate.hasProperty(payload, 'url') ||
    !Predicate.isString(payload.email) ||
    !Predicate.isString(payload.url)
  ) {
    throw new Error(`not a sign-in email: ${JSON.stringify(payload)}`);
  }
  return { email: payload.email, url: payload.url };
}

/**
 * Signs a fresh user in end to end against a provisioned scratch schema,
 * asserting each step of the flow, and hands back the session cookie.
 *
 * The auth service is the production one over the suite's services, with the
 * sign-in mail queued on a recording rather than the scratch schema's queue —
 * the link is read back from there, which is where the worker would read it.
 * Its better-auth instance counts sign-in attempts in no store, so it enforces
 * no per-address limit of its own; the app's per-email limit still applies,
 * and the address below is fresh.
 */
export async function signInWithMagicLink(
  env: StudioEnv,
  pool: pg.Pool,
  prefix: string,
  /** The Effect data layer over the same scratch schema (`scratch.services()`). */
  services: Context.Context<StudioServices>,
) {
  if (!env.auth) throw new Error('dev env must configure auth');
  const jobs = Effect.runSync(
    Effect.context<Jobs | RecordedJobs>().pipe(
      Effect.provide(Jobs.layerRecording),
    ),
  );
  const auth = liveAuthService(env, services, { jobs });
  // The same pool the rpc handlers are wired with, so procedures address the
  // scratch schema too rather than whatever DATABASE_URL points at. The whole
  // Studio rather than its Hono half: `/rpc` is the Effect shell's now, and a
  // suite driving it needs `studio.rpc` (see support/rpc.ts).
  const studio = createStudio(env, { auth, pool, services });
  const app = studio.app;
  const email = `${prefix}-${Date.now()}@example.com`;

  const send = await app.request('/api/auth/sign-in/magic-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'origin': 'http://localhost:5173',
    },
    body: JSON.stringify({ email, callbackURL: '/' }),
  });
  expect(send.status).toBe(200);
  const sent = sentLink(Context.get(jobs, RecordedJobs));
  expect(sent.email).toBe(email);

  const verify = await app.request(sent.url);
  expect([302, 200]).toContain(verify.status);
  const setCookie = verify.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  const cookie = (setCookie ?? '').split(';')[0]!;

  return { studio, app, auth, email, cookie };
}
