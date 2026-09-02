import { Outlet } from '@tanstack/react-router';

import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import AppFrame from '@codaco/fresco-ui/layout/AppFrame';

import AppHeader from '../shell/AppHeader.tsx';
import {
  useActiveTeamReconciler,
  type ActiveTeamFailure,
} from '../shell/useActiveTeamReconciler.ts';

/**
 * What the researcher sees when the active team could not be moved to the team
 * whose URL they are on.
 *
 * It belongs to the shell rather than to any screen because that is the scope
 * of the damage: every screen that reads the active team — membership,
 * invitations, the researcher's own role — is now describing a different team
 * from the one in the address bar, and each of them would otherwise sit on a
 * spinner with nothing to say about why.
 */
function TeamSwitchFailure({ failure }: { failure: ActiveTeamFailure }) {
  return (
    <Alert variant="destructive" density="compact" className="m-0 rounded-none">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Studio could not switch to this team. Screens that depend on it will
          stay empty until it does.
        </span>
        <Button size="sm" variant="outline" onClick={failure.retry}>
          Try again
        </Button>
      </div>
    </Alert>
  );
}

/**
 * The application shell (§5.3): the skip link, the header, and the region the
 * area layouts render into. Rendered once, by the app branch, so the header
 * survives every area transition.
 *
 * It renders no `<nav>` and no `<main>`: both belong to the area layout below
 * it, because a study's sidebar and the editor's outline replace each other
 * wholesale rather than nesting, and a `<main>` here would nest one inside the
 * other and give the skip link two candidates.
 *
 * **It reads no session state, and that is the point.**
 * `authClient.useSession()` stood here, and it was a second live channel to
 * `/api/auth/get-session`: two requests for one answer on every page load, one
 * from the app branch's guard and one from this component. It was read for two
 * things, and neither is here any more.
 *
 * - The "Signed in as …" line. The query the guard resolves carries only
 *   `signedIn`/`signedOut` by design (§6.2), so the researcher's name was
 *   available only at the price of that second request. Identity belongs to
 *   the account area's profile screen (§5.5), which arrives with `/account`.
 * - Getting the researcher out when the session goes away, and clearing the
 *   cache on the way. That now lives in the guard, which is the one thing that
 *   learns the session has ended — and which unmounts this component by
 *   redirecting, so an effect here would be racing the guard's own redirect
 *   for the same fact and would lose it whenever the redirect is not blocked.
 *
 * It does own one write, and exactly one: §6.6's active-team reconciliation,
 * which follows the committed URL. It lives here because this component is
 * mounted for every app route and unmounted for none of them, so the setting
 * cannot be left behind by an area transition. When that write fails it says
 * so here, above every area, for the reason `TeamSwitchFailure` records.
 */
export default function AppLayout() {
  const teamSwitchFailure = useActiveTeamReconciler();

  return (
    <AppFrame
      // In the header slot, so the message sits above every area's `<main>`
      // without adding a row to the frame's own grid — which is the container
      // each area sizes itself against.
      header={
        <>
          <AppHeader />
          {teamSwitchFailure && (
            <TeamSwitchFailure failure={teamSwitchFailure} />
          )}
        </>
      }
      skipLinkLabel="Skip to main content"
    >
      <Outlet />
    </AppFrame>
  );
}
