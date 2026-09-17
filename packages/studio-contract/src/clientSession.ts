// How a Studio client names itself to the server, on both of the transports
// the SPA speaks.
//
// A protocol-builder lock belongs to a browser tab, and a tab outlives the
// sockets it opens: a network blip that reconnects `/ws` must not turn a
// researcher into a stranger to the section they still have open. So the tab
// mints an id once and presents it on every call, and the server derives the
// lock owner from it rather than from the connection. Presence stays per
// connection — that is what a colleague's cursor is.
//
// Two spellings because the transports allow different things. A fetch request
// carries a header. A WebSocket handshake, from a browser, cannot: the
// `WebSocket` constructor takes a URL and subprotocols and nothing else, so the
// id rides on the upgrade URL's query string.

export const CLIENT_SESSION_HEADER = 'x-studio-client-session';
export const CLIENT_SESSION_PARAM = 'clientSession';

/**
 * The shape a minted id has: `crypto.randomUUID()`, and anything else of the
 * same order. The id is client-supplied and ends up in the `leases.owner`
 * column, so an unbounded or exotic string is refused here rather than stored.
 */
const CLIENT_SESSION_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** `undefined` for a caller that named none, or named one this rejects. */
export function readClientSessionId(
  raw: string | undefined,
): string | undefined {
  return raw !== undefined && CLIENT_SESSION_ID.test(raw) ? raw : undefined;
}
