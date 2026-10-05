import { Context, Effect, Layer, Predicate } from 'effect';
import { expect } from 'vitest';

import { createStudio } from '../../app.ts';
import { AuthService } from '../../auth/service.ts';
import { Environment, type StudioEnv } from '../../env.ts';
import { Jobs, RecordedJobs } from '../../jobs/jobs.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import type { StudioServices } from '../../rpc/deps.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { composeStudio } from './serve.ts';
import { limiterWithoutStore } from './valkey.ts';

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

export const AuthServiceStub = (
  overrides?: Partial<AuthService['Service']>,
): Layer.Layer<AuthService> =>
  Layer.succeed(AuthService)(authServiceStub(overrides));

/**
 * The limiter defaults to one over no store, which admits everything: every
 * vitest process resolves to the same localhost address.
 */
export const liveAuthService = (
  env: StudioEnv,
  services: Context.Context<StudioServices>,
  options: {
    readonly limiter?: RateLimiter['Service'];
    readonly jobs?: Context.Context<Jobs>;
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

export async function signInWithMagicLink(
  env: StudioEnv,
  prefix: string,
  services: Context.Context<StudioServices>,
) {
  if (!env.auth) throw new Error('dev env must configure auth');
  const jobs = Effect.runSync(
    Effect.context<Jobs | RecordedJobs>().pipe(
      Effect.provide(Jobs.layerRecording),
    ),
  );
  const auth = liveAuthService(env, services, { jobs });
  const studio = createStudio(env, { auth, services });
  const stack = composeStudio(env, studio);
  const email = `${prefix}-${Date.now()}@example.com`;

  try {
    const send = await stack.request('/api/auth/sign-in/magic-link', {
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

    const verify = await stack.request(sent.url);
    expect([302, 200]).toContain(verify.status);
    const setCookie = verify.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    const cookie = (setCookie ?? '').split(';')[0]!;

    return { studio, auth, email, cookie };
  } finally {
    await stack.dispose();
  }
}
