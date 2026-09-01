import { Outlet } from '@tanstack/react-router';

import AppFrame from '@codaco/fresco-ui/layout/AppFrame';

import AppHeader from '../shell/AppHeader.tsx';
import { useActiveTeamReconciler } from '../shell/useActiveTeamReconciler.ts';

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
 * cannot be left behind by an area transition.
 */
export default function AppLayout() {
  useActiveTeamReconciler();

  return (
    <AppFrame header={<AppHeader />} skipLinkLabel="Skip to main content">
      <Outlet />
    </AppFrame>
  );
}
