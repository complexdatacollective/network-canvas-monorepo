import { Context, Effect, Ref } from 'effect';
import {
  Cookies,
  HttpEffect,
  HttpRouter,
  HttpServerResponse,
} from 'effect/http';

/**
 * Effect's rpc server has no response-header hook, so a handler appends
 * `set-cookie` strings here and the middleware below folds them onto the
 * response.
 */
export class SetCookies extends Context.Service<
  SetCookies,
  {
    readonly append: (cookie: string) => Effect.Effect<void>;
    readonly read: Effect.Effect<ReadonlyArray<string>>;
  }
>()('@studio/SetCookies') {}

/**
 * Allocated per request: one shared holder would set one caller's cookie on
 * another's response.
 */
const makeSetCookies = Effect.map(Ref.make<ReadonlyArray<string>>([]), (ref) =>
  SetCookies.of({
    append: (cookie) => Ref.update(ref, (all) => [...all, cookie]),
    read: Ref.get(ref),
  }),
);

/**
 * Parsed back into `Cookies` because Effect's `Headers` is single-valued and
 * the provider may hand back more than one cookie.
 */
export const SetCookiesMiddleware = HttpRouter.middleware<{
  provides: SetCookies;
}>()((httpEffect) =>
  Effect.gen(function* () {
    const setCookies = yield* makeSetCookies;
    return yield* HttpEffect.withPreResponseHandler(
      Effect.provideService(httpEffect, SetCookies, setCookies),
      (_request, response) =>
        Effect.map(setCookies.read, (cookies) =>
          cookies.length === 0
            ? response
            : HttpServerResponse.mergeCookies(
                response,
                Cookies.fromSetCookie(cookies),
              ),
        ),
    );
  }),
);
