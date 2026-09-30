import { Context, Effect, Ref } from 'effect';
import {
  Cookies,
  HttpEffect,
  HttpRouter,
  HttpServerResponse,
} from 'effect/unstable/http';

/**
 * How a `/rpc` handler puts a cookie on the HTTP response it is answering.
 *
 * Effect's rpc server has no response-header hook of its own: the whole ndjson
 * body is one `HttpServerResponse`, and a handler's result reaches it as a wire
 * frame rather than as a response mutation. So a handler that has to sign a
 * browser in — `setup.complete`, and only it — appends the provider's own
 * `set-cookie` strings here, and the route middleware below folds them onto the
 * response on the way out.
 *
 * The holder is per request. A call that arrived over the WebSocket has none at
 * all, which is the same thing today's `context.resHeaders` being absent meant:
 * a frame has no response to carry a cookie on, so nothing is set and the
 * procedure says so in its result.
 */
export class SetCookies extends Context.Service<
  SetCookies,
  {
    readonly append: (cookie: string) => Effect.Effect<void>;
    readonly read: Effect.Effect<ReadonlyArray<string>>;
  }
>()('@studio/SetCookies') {}

/**
 * A fresh holder, allocated by the effect the middleware runs per request.
 * Building one value at registration time and closing over it would make every
 * request on the process share one list, so a cookie minted for one caller
 * would be set on another's response.
 */
const makeSetCookies = Effect.map(Ref.make<ReadonlyArray<string>>([]), (ref) =>
  SetCookies.of({
    append: (cookie) => Ref.update(ref, (all) => [...all, cookie]),
    read: Ref.get(ref),
  }),
);

/**
 * The route-scoped middleware that gives `/rpc` its holder and sets whatever
 * was appended on the outgoing response.
 *
 * The strings are parsed back into `Cookies` rather than written as raw
 * `set-cookie` headers, because Effect's `Headers` is a single-valued record:
 * a raw header could carry only one cookie, and the provider may hand back
 * more than one. `Cookies.fromSetCookie` keeps the encoded value verbatim and
 * re-serializes the standard attributes, and the response's cookie collection
 * is what both the Node listener and the web handler turn into one
 * `set-cookie` header each.
 *
 * A pre-response handler rather than a `map` over the response, for the same
 * reason the request id is one: it has to reach the response the router
 * synthesises as well as the one the route chose.
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
