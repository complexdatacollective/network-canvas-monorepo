import {
  queryOptions,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useRouter, type AnyRouter } from '@tanstack/react-router';
import { Predicate } from 'effect';
import { useEffect } from 'react';

import { Maintenance } from '@codaco/studio-contract/schema/errors';
import { AUTH_NOT_CONFIGURED_PROBLEM_TYPE } from '@codaco/studio-contract/schema/problem';

import { closeStudioEditorSessions } from '../editor/sessionLifecycle.ts';
import { parseRetryAfter, refusalOf } from '../runtime/errors.ts';
import { authClient } from './auth.ts';
import { refusalRetryDelay } from './queryClient.ts';

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

export const isSessionUnknown = (error: unknown): boolean =>
  error instanceof ServerUnreachableError ||
  refusalOf(error)?.kind === 'maintenance';

async function fetchSessionState(): Promise<SessionState> {
  let response: SessionResponse;
  let retryAfter: string | null = null;
  try {
    response = await authClient.getSession({
      fetchOptions: {
        onError: ({ response: refused }) => {
          retryAfter = refused.headers.get('retry-after');
        },
      },
    });
  } catch {
    throw new ServerUnreachableError();
  }

  const { data, error } = response;
  if (error) {
    if (error.status === 503) {
      // Only the not-configured 503 signs out: the proxy replaces every other 503 with its HTML page.
      if (
        Predicate.hasProperty(error, 'type') &&
        error.type === AUTH_NOT_CONFIGURED_PROBLEM_TYPE
      ) {
        return endedSession();
      }
      const seconds = parseRetryAfter(retryAfter);
      throw new Maintenance(
        seconds === undefined ? {} : { retryAfterSeconds: seconds },
      );
    }
    throw new ServerUnreachableError();
  }
  return data ? 'signedIn' : endedSession();
}

/**
 * Nobody is signed in — and this tab's editor session ends here.
 *
 * Here because this query is the one channel through which the application
 * learns it (§6.2). The app shell's guard reads it, the sign-in guard reads
 * it, and on a marketing page the site shell's own entry is the ONLY reader:
 * that branch has no guard at all, so a researcher who leaves the editor for a
 * public page and is signed out from another tab is told here and nowhere
 * else. Putting it in any one of those readers leaves the others out, which is
 * how the app guard came to be the only place that did it.
 *
 * What has to end is the socket the protocol editor talks its host over. The
 * server reads the account once, at the upgrade, and authorises and audits
 * every later message on that socket as them — so a socket that outlives the
 * session is one the next account to sign in on this tab would be editing,
 * and be audited, through. `closeStudioEditorSessions` is idempotent, so
 * saying it again about a session already ended costs nothing.
 *
 * Not knowing ends nothing: an unreachable server throws above rather than
 * reaching here, for the same reason it is not allowed to look like a
 * sign-out anywhere else in this file.
 */
async function endedSession(): Promise<SessionState> {
  await closeStudioEditorSessions();
  return 'signedOut';
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
 * The session as the app shell's guard has to read it: the endpoint's answer
 * when there is one, and the last answer it gave when it cannot be reached.
 *
 * **An unreachable server does not establish that the session is gone, and it
 * does not establish that anything has changed at all.** The guard runs again
 * for two different reasons and owes them different treatment. On a COLD
 * entry, nothing has been established: there is no answer to fall back on, so
 * not knowing reaches the router's `defaultErrorComponent`, which is what
 * `auth.test.tsx` pins. On a REVALIDATION of a tree that is already on screen,
 * there is one — and letting the error out there replaces the app match with
 * the error screen, unmounting whatever the researcher was working in.
 *
 * That is unsaved work. `router.invalidate()` runs no navigation blocker, so
 * an editor with unsaved values in it is discarded with nobody asked, on the
 * strength of an outage that said nothing about the session. Answering with
 * the last established state leaves the researcher where they are; every
 * screen below still fails its own reads and says so, and the moment
 * `/api/auth/*` answers again — the query stays invalidated after a failed
 * fetch, so the next guard asks again — a real `signedOut` gets them out.
 *
 * TanStack Query keeps `data` on a query whose refetch failed, so the cache
 * is the record of what was last established; `undefined` means nothing ever
 * was.
 *
 * **The app shell's guard is the only caller, and the other three read the
 * query directly on purpose.** This distinction is only reachable where a
 * guard can run a SECOND time over a screen that is already up, which is what
 * `revalidateSession` does — and only the app and site branches revalidate.
 * `/sign-in` has its own answer for not knowing, recorded there. `/` reads the
 * session only under `self-hosted`, where it always redirects and so has no
 * committed screen to preserve. `/no-team` is on the focused branch, which
 * mounts no revalidation and makes no request that could 401, so its guard
 * runs exactly once — on the cold entry this would not change.
 */
export async function resolveSessionState(
  queryClient: QueryClient,
): Promise<SessionState> {
  return await queryClient
    .fetchQuery(sessionQueryOptions)
    .catch((error: unknown) => {
      if (!isSessionUnknown(error)) throw error;
      const established = queryClient.getQueryData(
        sessionQueryOptions.queryKey,
      );
      if (established === undefined) throw error;
      return established;
    });
}

/**
 * Marks the cached session invalid and makes every COMMITTED guard re-ask on
 * the spot, rather than waiting for the researcher's next navigation.
 *
 * Both halves are here because the query has two kinds of reader and neither
 * covers the other.
 *
 * - `router.invalidate()` re-runs the COMMITTED guards, which is how the app
 *   branch re-asks: invalidation alone is what lets their `fetchQuery` go back
 *   to `/api/auth/*` past `staleTime: Infinity`.
 * - `refetchType: 'active'` re-asks for a COMPONENT observer, which is how the
 *   site branch does — `SiteLayout`'s entry into Studio is the only one in the
 *   app, and that branch has no guard to wake and may never gain one (§10.1).
 *   It was `'none'` on the reasoning that a refetch would race the guards, and
 *   there is nothing to race: no app route observes this query, so on that
 *   branch this refetches nothing at all and the guards remain the only asker.
 *   Where both could run — `/` under `self-hosted`, which is guarded AND on
 *   the site branch — query-core hands the second caller the first one's
 *   in-flight promise rather than issuing a second request.
 *
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
    refetchType: 'active',
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
 *
 * **Mounted by both shells that read a session**, and by neither of the other
 * two. `AppLayout` reads it through the app branch's guard and `SiteLayout`
 * through the header's entry into Studio, so both would otherwise hold an
 * answer nothing re-asks. It is deliberately NOT mounted at the root: the
 * participant branch owns the viewport for an interview and has no session at
 * all (§5.3), and the focused branch's one session reader — the sign-in
 * guard — already treats not knowing as "carry on".
 */
export function useSessionRevalidation(): void {
  const queryClient = useQueryClient();
  const router = useRouter();
  useMaintenanceRevalidation();

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

export function useMaintenanceRevalidation(): void {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer !== undefined) return;
      const state = cache.find({
        queryKey: sessionQueryOptions.queryKey,
        exact: true,
      })?.state;
      if (state?.fetchStatus !== 'idle') return;
      if (refusalOf(state.error)?.kind !== 'maintenance') return;
      timer = setTimeout(
        () => {
          timer = undefined;
          void revalidateSession(queryClient, router);
        },
        refusalRetryDelay(0, state.error),
      );
    };

    const unsubscribe = cache.subscribe(schedule);
    schedule();
    return () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [queryClient, router]);
}

type UnauthorizedResponseHandler = () => Promise<void>;

let unauthorizedResponseHandler: UnauthorizedResponseHandler | undefined;

/**
 * The rpc client is a module singleton created below the route tree, so it
 * cannot import the router back. The router registers what a 401 means as it
 * is built — `createAppRouter` is the only caller — and the router that owns
 * the page is the last one built.
 */
export function setUnauthorizedResponseHandler(
  handler: UnauthorizedResponseHandler,
): void {
  unauthorizedResponseHandler = handler;
}

export async function reportUnauthorizedResponse(): Promise<void> {
  await unauthorizedResponseHandler?.();
}
