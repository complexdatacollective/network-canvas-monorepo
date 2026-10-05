import { Effect, Option, Schema } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES } from '../audit/better-auth-policy.ts';
import { AuthService } from '../auth/service.ts';
import { Environment } from '../env.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import { contentTooLarge, readBodyCapped } from './body.ts';
import { tooManyRequests } from './middleware/rate-limit.ts';

// Not `HttpEffect.fromWebHandler`: the per-email limit reads the body, and a
// body read in a middleware would leave `fromWebHandler` an empty one to forward.

const MAX_AUTH_BODY_BYTES = 1024 * 1024;

/**
 * `/sign-in/social` is absent deliberately: the request names a provider, not
 * an account.
 */
const SIGN_IN_EMAIL_PATHS: ReadonlySet<string> = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-in/magic-link',
]);

const decodeSignInBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ email: Schema.NonEmptyString })),
);

function signInEmailSubject(
  path: string,
  body: Uint8Array,
): Option.Option<string> {
  if (!SIGN_IN_EMAIL_PATHS.has(path)) return Option.none();
  return Option.map(
    decodeSignInBody(new TextDecoder().decode(body)),
    ({ email }) => email.toLowerCase(),
  );
}

const ORGANIZATION_MUTATION_POLICIES: ReadonlyMap<
  string,
  { disposition: 'allowed' | 'blocked' }
> = new Map(
  Object.values(BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES)
    .filter(({ method }) => method === 'POST')
    .map((policy) => [policy.path, policy]),
);

const notFound = () =>
  HttpServerResponse.jsonUnsafe(
    { title: 'Not Found', status: 404 },
    { status: 404, contentType: 'application/problem+json' },
  );

/**
 * The request is rebuilt against the configured origin (`PUBLIC_URL`) rather
 * than the `Host` it arrived with, so better-auth's origin checks and the links
 * it mints cannot be steered by a header.
 */
export const AuthMount = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const env = yield* Environment;
    const auth = yield* AuthService;
    const limiter = yield* RateLimiter;
    const baseUrl = env.auth?.baseUrl ?? 'http://localhost';

    const handler = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const requested = new URL(request.url, baseUrl);
      const target = new URL(baseUrl);
      target.pathname = requested.pathname;
      target.search = requested.search;

      // Trailing slashes are normalized here, at the one better-auth forwarding
      // boundary, so no alternate URL can bypass the policy.
      const path = requested.pathname.replace(/\/+$/, '');
      if (
        request.method === 'POST' &&
        path.startsWith('/api/auth/organization/')
      ) {
        const policy = ORGANIZATION_MUTATION_POLICIES.get(path);
        if (!policy || policy.disposition === 'blocked') return notFound();
      }

      const body =
        request.method === 'POST'
          ? yield* readBodyCapped(MAX_AUTH_BODY_BYTES)
          : undefined;

      const email =
        body === undefined ? Option.none() : signInEmailSubject(path, body);
      if (Option.isSome(email)) {
        const decision = yield* limiter.check('sign_in_email', email.value);
        if (!decision.allowed) {
          return tooManyRequests(decision.retryAfterSeconds);
        }
      }

      const response = yield* auth.handler(
        new Request(target, {
          method: request.method,
          headers: request.headers,
          ...(body === undefined ? {} : { body }),
        }),
      );
      if (response.status !== 429) return HttpServerResponse.fromWeb(response);
      const retryAfter = Number(response.headers.get('X-Retry-After'));
      return tooManyRequests(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.ceil(retryAfter)
          : Math.ceil(limiter.rules.sign_in_address.windowMs / 1000),
      );
    }).pipe(
      Effect.catchTag('BodyTooLarge', () => Effect.succeed(contentTooLarge())),
    );

    yield* router.add('GET', '/api/auth/*', handler);
    yield* router.add('POST', '/api/auth/*', handler);
  }),
);
