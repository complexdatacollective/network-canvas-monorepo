import { Context } from 'effect';
import { RpcMiddleware } from 'effect/unstable/rpc';

// Imported rather than copied: one spelling of the header name, in the module
// that explains why it exists. Stage 2b moves that module into this package,
// at which point this re-export becomes the definition's new home.
export { CLIENT_SESSION_HEADER } from '@codaco/studio-rpc/client-session';

/**
 * Which browser tab is calling, or `null` for a caller that named none.
 *
 * Null is the ordinary case, not a failure: most procedures do not care, and a
 * tab that presents an id this rejects is treated exactly like one that
 * presented nothing at all. Only the protocol-builder's leases read it, and a
 * lease request without an owner simply does not get a lease.
 */
export class ClientSession extends Context.Service<
  ClientSession,
  { readonly id: string | null }
>()('@studio/ClientSession') {}

/**
 * One middleware serves both transports. A fetch request carries the header
 * directly; a WebSocket handshake cannot set headers from a browser, so the id
 * rides on the `/ws` upgrade URL's query string and a route middleware
 * rewrites it into the header before any rpc middleware runs. By the time this
 * one executes there is only ever a header to read.
 *
 * It declares no error because it cannot fail — see `ClientSession` above.
 *
 * The two Context ids differ on purpose: the middleware and the service it
 * provides are separate slots in a `Context`, and giving them the same string
 * would make each overwrite the other.
 */
export class ClientSessionMiddleware extends RpcMiddleware.Service<
  ClientSessionMiddleware,
  { provides: ClientSession }
>()('@studio/ClientSessionMiddleware') {}
