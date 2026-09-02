import { useQueryClient } from '@tanstack/react-query';
import {
  useNavigate,
  useRouter,
  type HistoryState,
} from '@tanstack/react-router';
import { useState } from 'react';

import { closeStudioEditorSessions } from '../editor/sessionLifecycle.ts';
import { authClient } from '../lib/auth.ts';
import { createUuid } from '../lib/createUuid.ts';

/**
 * Ending the session, as one sequence with one caller per shell.
 *
 * It lives here rather than inside the account menu because sign-out is not
 * the account area's: `/no-team` is a focused-shell route with no header and
 * no account menu on it (§3), and a researcher who belongs to no team can
 * reach nothing else — every app route bounces them back here (§6.4) and
 * `/sign-in` bounces them here too. Without a way out of that screen the only
 * way to sign in as somebody else is to clear the cookie by hand.
 *
 * The sequence itself is unchanged, and its ordering is load-bearing: leave
 * the current route by an ordinary navigation so the editor's blocker runs
 * while the session is still valid, verify that THIS navigation committed,
 * release the editor's lease while the cookie still works, sign out, and only
 * then empty the cache. Each step's comment says why.
 */

/**
 * The history state a sign-out's own navigation carries, and the only thing
 * that can tell its continuation "the location you are looking at is the one
 * you asked for".
 *
 * The token has to travel with the navigation rather than be held beside it,
 * because every other candidate is shared with whatever else committed. The
 * pathname is the destination either way. The history index is the same
 * either way, since a blocked push advances nothing. And the entry key is
 * freshly random for any push, so it differs from the one before it either
 * way. What is unique to this attempt is a value only this attempt put on the
 * wire.
 *
 * Declared as an extension of the router's own `HistoryState` rather than as a
 * bare object: that interface is what a navigation's `state` is typed as, and
 * a type sharing none of its (all-optional) properties is not assignable to
 * it. Extending it is also the honest description — this is history state
 * with one more field on it.
 */
type SignOutAttemptState = HistoryState & { studioSignOutAttempt: string };

/** That key as a value, checked against the shape, so the two cannot drift. */
const SIGN_OUT_ATTEMPT_KEY =
  'studioSignOutAttempt' satisfies keyof SignOutAttemptState;

/** What a sign-out puts on its navigation, and what nothing else puts there. */
function signOutAttemptState(attempt: string): SignOutAttemptState {
  return { [SIGN_OUT_ATTEMPT_KEY]: attempt };
}

/** The sign-out attempt a location was navigated to by, if it was one. */
function signOutAttemptOf(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  // History state is whatever some earlier navigation put there — across a
  // reload, whatever a previous version of this code put there — so every
  // step of reading it is a check rather than an assertion.
  if (!(SIGN_OUT_ATTEMPT_KEY in state)) return undefined;
  const attempt = state[SIGN_OUT_ATTEMPT_KEY];
  return typeof attempt === 'string' ? attempt : undefined;
}

/** Said once, because both callers say it. */
export const SIGN_OUT_FAILURE_MESSAGE = 'Sign-out did not complete. Try again.';

/**
 * Where the sequence's first navigation goes, which is per-shell rather than
 * fixed.
 *
 * `/account` for the app shell: it is a plain app route in both topologies.
 * `/` is not — it is marketing under `managed` and a redirect under
 * `self-hosted` (§10.4), so a self-hosted sign-out would compare against a URL
 * the router never commits and abort silently. `/sign-in` is not either: its
 * guard sends a still-signed-in researcher to their landing destination.
 *
 * `/no-team` for the focused shell, because a teamless session cannot commit
 * `/account` at all: the app shell's guard redirects it straight back here
 * (§6.4), the redirect carries none of this attempt's state, and the
 * verification below would then abort every sign-out that screen offered.
 */
export type SignOutReturnRoute = '/account' | '/no-team';

export function useSignOut(returnTo: SignOutReturnRoute): {
  signOut: () => void;
  signOutFailed: boolean;
} {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signOutFailed, setSignOutFailed] = useState(false);

  const signOut = () => {
    setSignOutFailed(false);
    void (async () => {
      // §6.5's generation token, carried on the navigation this sign-out is
      // about to make.
      const attempt = createUuid();
      try {
        // Leave the editor by an ordinary navigation first, so its blocker
        // runs while the session is still valid (§6.5).
        await navigate({
          to: returnTo,
          state: signOutAttemptState(attempt),
        });
        // Did THIS navigation commit?
        //
        // Awaiting it does not answer that. A blocked push is dropped
        // silently, and its promise neither rejects nor settles: it parks,
        // and resolves later when some unrelated navigation commits, because
        // the router chains each commit promise to the one before it. So a
        // researcher who signs out from a dirty editor, chooses "Keep
        // editing", and then goes to their profile an hour later resumes this
        // exact continuation — at `/account`, which is what a pathname
        // comparison alone was asking for — and is signed out without being
        // asked (§6.5).
        //
        // The token is what makes the question answerable: only the
        // navigation started above carries it, so an unrelated commit at the
        // same address fails this check and the abandoned sign-out stays
        // abandoned. Nothing here undoes the researcher's own navigation —
        // they asked to be at this route and they are.
        const committed = router.state.location;
        if (committed.pathname !== returnTo) return;
        if (signOutAttemptOf(committed.state) !== attempt) return;
        await closeStudioEditorSessions();
        const result = await authClient.signOut();
        // better-fetch resolves failed requests with an error field
        // instead of throwing; a failed sign-out leaves the cookie
        // valid, so pretending it worked would be a lie.
        if (result.error) {
          setSignOutFailed(true);
          return;
        }
        queryClient.clear();
        await navigate({ to: '/sign-in' });
      } catch {
        setSignOutFailed(true);
      }
    })();
  };

  return { signOut, signOutFailed };
}
