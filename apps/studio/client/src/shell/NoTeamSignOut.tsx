import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';

import { SIGN_OUT_FAILURE_MESSAGE, useSignOut } from './useSignOut.ts';

/**
 * The way off `/no-team`, and the only one a researcher there has.
 *
 * A session with no team memberships is redirected here from every app route
 * (§6.4), and `/sign-in`'s own guard resolves the same landing and sends it
 * straight back — so the account menu, which is app-shell chrome and would be
 * the ordinary way to sign out, is on no screen this researcher can reach. The
 * two situations that produce it are both ones somebody has to be able to
 * leave: signing in as the wrong account, and waiting on an invitation that is
 * going to somebody else's address.
 *
 * A control rather than the header: `/no-team` is a focused-shell route, and
 * the focused shell exists precisely so these screens do not offer navigation
 * to someone who has nowhere to go yet (§3). Sign-out is not navigation.
 *
 * The sequence is the account menu's, unchanged — the same generation token,
 * the same ordering — differing only in the route it returns through, which
 * `useSignOut` explains.
 */
export default function NoTeamSignOut() {
  const { signOut, signOutFailed } = useSignOut('/no-team');

  return (
    <div className="flex flex-col gap-3">
      {signOutFailed && (
        <Alert variant="destructive">{SIGN_OUT_FAILURE_MESSAGE}</Alert>
      )}
      <Button
        className="self-start"
        size="sm"
        variant="outline"
        onClick={signOut}
      >
        Sign out
      </Button>
    </div>
  );
}
