import { Context, Schema } from 'effect';
import { RpcMiddleware } from 'effect/unstable/rpc';

import { RateLimited, Unauthorized } from '../schema/errors.ts';
import type { UserId } from '../schema/ids.ts';

// Declarations only: the tag a researcher-facing procedure names, and the
// principal it gets in return. The implementation and its layer live in the
// server, which is the only half that can read a cookie or query Better Auth.

/**
 * A researcher signed in with a cookie session — the server's
 * `SessionPrincipal`, with `userId` branded.
 *
 * `kind` is a discriminant with one member today. It reserves the slot for the
 * token plane's `ServicePrincipal` (#1288), so procedures written now against
 * `kind === 'user'` keep compiling when a second kind arrives instead of
 * silently accepting one.
 */
export class Principal extends Context.Service<
  Principal,
  {
    readonly kind: 'user';
    readonly userId: UserId;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly name: string;
    /**
     * The stored UI-language preference; null until the researcher chooses
     * one. Carried on the principal because the session lookup already reads
     * the user row, so `me` answers it without a query of its own.
     */
    readonly locale: string | null;
    readonly sessionId: string;
  }
>()('@studio/Principal') {}

/**
 * `error` is `Unauthorized | RateLimited` because the per-user rate limit is
 * decided here: the limiter is keyed by the principal, so it cannot run before
 * the session is resolved, and running it as a second middleware would mean
 * every authenticated procedure declaring the same two errors by hand.
 *
 * `requiredForClient` is false. Setting it true adds
 * `RpcMiddleware.ForClient<'@studio/Authenticated'>` to `RpcClient.make`'s
 * requirements, forcing the web app to provide a client-side middleware layer
 * whose only job would be to attach a credential. Studio's credential is an
 * httpOnly cookie the browser attaches to same-origin requests itself, and
 * which script cannot read — so there is nothing for such a layer to do.
 */
export class Authenticated extends RpcMiddleware.Service<
  Authenticated,
  { provides: Principal }
>()('@studio/Authenticated', {
  error: Schema.Union([Unauthorized, RateLimited]),
  requiredForClient: false,
}) {}
