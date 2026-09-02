import { useQueryClient } from '@tanstack/react-query';
import {
  Link,
  useNavigate,
  useRouter,
  type HistoryState,
} from '@tanstack/react-router';
import { UserRound } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import { IconButton } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';

import { closeStudioEditorSessions } from '../editor/sessionLifecycle.ts';
import { authClient } from '../lib/auth.ts';
import { createUuid } from '../lib/createUuid.ts';

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

/**
 * The header's account menu (§5.5): profile, language, sign out.
 *
 * Profile and Language are ordinary router navigations into the account area,
 * which means the editor's dirty-state blocker applies to them without
 * anything here knowing about it (§6.5). Sign out cannot be one — it ends the
 * session — so it runs the sequence below instead.
 *
 * That sequence is the one `AppLayout` performed, with §6.5's generation token
 * added to the check it makes before committing to anything. Its ordering is
 * load-bearing and each step's comment says why.
 */
export default function AccountMenu() {
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
        // runs while the session is still valid (§6.5). The destination is
        // `/account` — the area this menu belongs to — because it is a plain
        // app route in both topologies. `/` is not: it is marketing under
        // `managed` and a redirect under `self-hosted` (§10.4), so a
        // self-hosted sign-out would compare against a URL the router never
        // commits and abort silently. `/sign-in` is not either: its guard
        // sends a still-signed-in researcher to their landing destination.
        await navigate({
          to: '/account',
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
        // they asked to be at `/account` and they are.
        const committed = router.state.location;
        if (committed.pathname !== '/account') return;
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

  return (
    <>
      {signOutFailed && (
        <Alert variant="destructive">
          Sign-out did not complete. Try again.
        </Alert>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <IconButton
              size="sm"
              variant="text"
              aria-label="Account"
              icon={<UserRound aria-hidden />}
            />
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link to="/account" />}>
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/account/language" />}>
            Language
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
