import { queryOptions } from '@tanstack/react-query';

import { authClient } from './auth.ts';

/**
 * The session could not be determined at all: the request never completed, or
 * `/api/auth/*` answered with something other than the supported no-database
 * degradation. The router's `defaultErrorComponent` recognises it and explains
 * the outage, rather than treating "we could not ask" as "you are signed out".
 */
export class ServerUnreachableError extends Error {
  constructor() {
    super('The server could not be reached.');
    this.name = 'ServerUnreachableError';
  }
}

/** The two definitive answers. Not knowing throws instead. */
type SessionState = 'signedIn' | 'signedOut';

type SessionResponse = Awaited<ReturnType<typeof authClient.getSession>>;

async function fetchSessionState(): Promise<SessionState> {
  let response: SessionResponse;
  try {
    response = await authClient.getSession();
  } catch {
    throw new ServerUnreachableError();
  }

  const { data, error } = response;
  if (error) {
    // A server with no database answers /api/auth/* with 503 — the supported
    // degradation, not a failure. That is a reachable server saying nobody is
    // signed in, so it belongs on the sign-in page, which reads the same
    // capability from the status query and explains it.
    if (error.status === 503) return 'signedOut';
    throw new ServerUnreachableError();
  }
  return data ? 'signedIn' : 'signedOut';
}

/**
 * Every guard reads the session through this one query, so a navigation costs
 * no request while it is fresh (§6.2).
 *
 * Throwing for the unreachable case leaves `state.data === undefined`, so a
 * boot-time network blip is never cached behind `staleTime: Infinity`, and the
 * error reaches the router's `defaultErrorComponent`.
 *
 * Signing in needs no cache update today: both routes into a session — the
 * magic link's verify redirect and the social callback — arrive as a full
 * document load, so the cache starts empty and the first guard asks. A
 * sign-in that ever completes inside the SPA, with the session in its
 * response, must `setQueryData(sessionQueryOptions.queryKey, 'signedIn')`
 * rather than invalidate: that is correct on the next guard with no round
 * trip and no race.
 */
export const sessionQueryOptions = queryOptions({
  queryKey: ['session'],
  queryFn: fetchSessionState,
  // Deliberately not 'static': `isStaleByTime` returns false for 'static'
  // before it consults `isInvalidated`, which would make the 401 path below
  // permanently inert.
  staleTime: Infinity,
  // `fetchQuery` only forces `retry: false` when nothing else sets it, so a
  // client with a retrying default would put a retry storm behind every guard
  // the moment the server goes away.
  retry: false,
});

type UnauthorizedResponseHandler = () => Promise<void>;

let unauthorizedResponseHandler: UnauthorizedResponseHandler | undefined;

/**
 * The oRPC client is a module singleton created below the route tree, so it
 * cannot import the router back. The router registers what a 401 means as it
 * is built — `createAppRouter` is the only caller — and the router that owns
 * the page is the last one built.
 */
export function setUnauthorizedResponseHandler(
  handler: UnauthorizedResponseHandler,
): void {
  unauthorizedResponseHandler = handler;
}

/** Called by the oRPC client for every procedure that answers 401. */
export async function reportUnauthorizedResponse(): Promise<void> {
  await unauthorizedResponseHandler?.();
}
