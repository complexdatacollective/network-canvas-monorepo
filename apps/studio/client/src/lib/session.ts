import {
  queryOptions,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useRouter, type AnyRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

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

/**
 * Marks the cached session invalid and makes every COMMITTED guard re-ask on
 * the spot, rather than waiting for the researcher's next navigation.
 *
 * `refetchType: 'none'` because the guards are the readers: invalidation alone
 * is what makes the next `fetchQuery` go back to `/api/auth/*` past
 * `staleTime: Infinity`, and a refetch issued here would only race them.
 * Neither caller may decide the answer itself — `setQueryData('signedOut')`
 * would let a procedure's authorization failure, or a tab switch, fabricate a
 * state the auth endpoint never reported (§6.2).
 */
export async function revalidateSession(
  queryClient: QueryClient,
  router: AnyRouter,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: sessionQueryOptions.queryKey,
    refetchType: 'none',
  });
  await router.invalidate();
}

/**
 * Re-asks whether the session is still there each time the tab comes back to
 * the foreground.
 *
 * A session can end without any request failing. Another tab signs out; the
 * cookie expires while the researcher reads a screen that makes no requests.
 * Nothing answers 401, so the 401 path above never runs — and the session query
 * is `staleTime: Infinity`, so no guard ever asks again on its own. Without
 * this the shell stays on screen, with this researcher's cached data in it,
 * until something happens to fail.
 *
 * `authClient.useSession()` used to cover this from the app shell, and it is
 * gone because it was a SECOND request for an answer the guard already has
 * (§6.2). This is not that channel back: it asks the same query the guards
 * read, and only when the tab is re-entered, which is the trigger Better Auth's
 * own session refresh uses for the same purpose. One revalidation at a time, so
 * a researcher flicking between tabs cannot stack them up.
 *
 * It does not catch a session that ends while this tab stays in the foreground.
 * Nothing short of polling would, and a second tab's sign-out is the case that
 * matters: the researcher goes there to do it and comes back here.
 */
export function useSessionRevalidation(): void {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    let inFlight = false;
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (inFlight) return;
      inFlight = true;
      void revalidateSession(queryClient, router).finally(() => {
        inFlight = false;
      });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [queryClient, router]);
}

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
