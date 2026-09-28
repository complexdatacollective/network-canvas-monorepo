import { Effect, Option, Schema } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

import { BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES } from '../audit/better-auth-policy.ts';
import { AuthService } from '../auth/service.ts';
import { Environment } from '../env.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import { contentTooLarge, readBodyCapped } from './body.ts';
import { tooManyRequests } from './middleware/rate-limit.ts';

// `/api/auth/*`: better-auth's own endpoints, which the browser talks to
// directly (#1245). The route hands better-auth a Web `Request` it builds
// itself rather than wrapping its handler with `HttpEffect.fromWebHandler`,
// because two things have to happen to the request first and one of them
// reads the body: the per-email sign-in limit is keyed by the account the body
// names, and a body read in a middleware would leave `fromWebHandler` an empty
// one to forward. So the body is read here, once, and the same bytes are what
// better-auth receives.

/**
 * The most a better-auth request body may be. Every endpoint Studio exposes
 * takes a small JSON object — credentials, a name, an invitation id, a profile
 * update — so a megabyte is far past anything legitimate while still being an
 * amount a request may be buffered to. The bound exists because the body is
 * buffered: without one, a single unauthenticated request could hold as much
 * memory as it cared to send.
 */
const MAX_AUTH_BODY_BYTES = 1024 * 1024;

/**
 * The two sign-in endpoints that name the account being signed in to. The
 * per-address limit is better-auth's own (src/auth/better-auth.ts); this is
 * the other half of the pair — an attacker spreading attempts across a botnet
 * meets a per-address limit once per host, and a per-email limit every time.
 *
 * `/sign-in/social` is absent deliberately: the request names a provider, not
 * an account, and the identity is not known until the provider answers.
 */
const SIGN_IN_EMAIL_PATHS: ReadonlySet<string> = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-in/magic-link',
]);

/**
 * The account a sign-in body names. A body that is not JSON, or that names
 * nothing, is not limited here: better-auth is about to refuse it, and
 * inventing a bucket for an unparseable body would let a malformed request
 * spend a real caller's allowance.
 */
const decodeSignInBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ email: Schema.NonEmptyString })),
);

/**
 * The email a sign-in POST is limited under, or none.
 *
 * Invitation acceptance is not here. better-auth's
 * `/organization/accept-invitation` is blocked outright
 * (audit/better-auth-policy.ts) so that acceptance and its audit event share
 * one transaction, which means a limit on that path would guard a route that
 * only ever answers 404. It lives on `team.acceptInvitation` instead, which is
 * the path the client takes.
 */
function signInEmailSubject(
  path: string,
  body: Uint8Array,
): Option.Option<string> {
  if (!SIGN_IN_EMAIL_PATHS.has(path)) return Option.none();
  return Option.map(
    decodeSignInBody(new TextDecoder().decode(body)),
    // Lower-cased so one account is one bucket: the local part is formally
    // case-sensitive, but no identity provider Studio speaks to treats it that
    // way, and two buckets would double the limit.
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
 * `GET` and `POST` on `/api/auth` and everything under it — the only methods
 * better-auth is reached with. Anything else is not registered here and falls
 * through to the machine surfaces' problem-JSON 404.
 *
 * The request better-auth sees is rebuilt against the configured browser
 * origin (`PUBLIC_URL`) rather than the `Host` the request arrived with, so its
 * origin checks and the links it mints cannot be steered by a header. Only
 * the path and query are taken from the request, and the path is set on that
 * origin rather than resolved against it. An instance with no auth configured
 * has no origin to rebuild against and no provider to reach: its disabled
 * service answers 503 whatever it is handed, so a placeholder serves.
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

      // Studio owns these writes so their domain row and immutable audit
      // event share one transaction. Trailing slashes are normalized here, at
      // the one better-auth forwarding boundary, so no alternate URL can
      // bypass the policy.
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

      // Per-email sign-in (#1909). better-auth keys its own limiter by address
      // and path and never looks inside the body, so the account this attempt
      // names has to be read here.
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
      // better-auth answers its own rate limit with a `{ message }` body and
      // an `X-Retry-After` header. Every other refusal on this server is
      // problem JSON with `Retry-After`, and a caller should not have to know
      // which limiter refused it in order to read the answer.
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
