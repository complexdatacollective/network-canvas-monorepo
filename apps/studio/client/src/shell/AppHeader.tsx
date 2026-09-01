import { Link } from '@tanstack/react-router';

import { authClient } from '../lib/auth.ts';
import { landingDestination } from '../lib/landing.ts';
import AccountMenu from './AccountMenu.tsx';
import StudySwitcher from './StudySwitcher.tsx';
import TeamSwitcher from './TeamSwitcher.tsx';

/**
 * The application header's contents (§5.5). `AppFrame` renders the `<header>`
 * element itself; this is what goes inside it, and it is the same on every app
 * route: the wordmark, the team the researcher is acting in, the study they
 * are acting in when they are inside one, the two platform-level libraries,
 * and their account.
 *
 * The team chip stays in the editor deliberately. A wrong-team edit is
 * expensive and slow to notice, and the editor is the one place a researcher
 * spends hours without navigating.
 */
const HEADER_LINK_CLASSES = 'focusable font-heading rounded font-semibold';

export default function AppHeader() {
  // The wordmark goes to the researcher's landing destination (§5.5), not to
  // `/`: inside the application `/` is marketing, or a redirect on a
  // self-hosted instance (§10.4). The same resolution `/` and the sign-in
  // bounce use, over what the header already has in hand — the switcher's own
  // team list — so a header link and a guard cannot disagree about where
  // "home" is.
  const teams = authClient.useListOrganizations();
  const activeTeam = authClient.useActiveOrganization();
  const landing = landingDestination({
    teams: teams.data ?? [],
    activeTeamId: activeTeam.data?.id,
  });

  return (
    <div className="border-surface-2 flex flex-wrap items-center gap-4 border-b px-4 py-2">
      {landing.to === '/no-team' ? (
        <Link
          className="focusable font-heading rounded font-bold no-underline"
          to="/no-team"
        >
          Studio
        </Link>
      ) : (
        <Link
          className="focusable font-heading rounded font-bold no-underline"
          to="/team/$teamId"
          params={landing.params}
          // The team's own path is a prefix of every route beneath it, so
          // without this the wordmark would carry `aria-current="page"` on
          // every team screen.
          activeOptions={{ exact: true }}
        >
          Studio
        </Link>
      )}
      <TeamSwitcher />
      <StudySwitcher />
      <div className="ms-auto flex flex-wrap items-center justify-end gap-4">
        <Link
          className={HEADER_LINK_CLASSES}
          to="/gallery"
          // A template's own route sits beneath this path, and it is a
          // destination of the gallery rather than the gallery itself, so
          // only the gallery is the current page.
          activeOptions={{ exact: true }}
        >
          Gallery
        </Link>
        <Link
          className={HEADER_LINK_CLASSES}
          to="/templates"
          activeOptions={{ exact: true }}
        >
          Templates
        </Link>
        <AccountMenu />
      </div>
    </div>
  );
}
