import { Link } from '@tanstack/react-router';

import { authClient } from '../lib/auth.ts';
import { landingDestination, type LandingDestination } from '../lib/landing.ts';
import AccountMenu from './AccountMenu.tsx';
import { platformDestinations } from './navigationManifest.ts';
import StudioEverythingBar from './StudioEverythingBar.tsx';
import StudySwitcher from './StudySwitcher.tsx';
import TeamSwitcher from './TeamSwitcher.tsx';

/**
 * The application header's contents (§5.5). `AppFrame` renders the `<header>`
 * element itself; this is what goes inside it, and it is the same on every app
 * route: the wordmark, the team the researcher is acting in, the study they
 * are acting in when they are inside one, the everything bar, the two
 * platform-level libraries, and their account.
 *
 * The team chip stays in the editor deliberately. A wrong-team edit is
 * expensive and slow to notice, and the editor is the one place a researcher
 * spends hours without navigating.
 *
 * The two library links are the PLATFORM MANIFEST, rendered here the way an
 * area sidebar renders its own (everything-bar design §5.2). There is no
 * manifest-less chrome: a header link added outside the manifest would be a
 * destination the everything bar could not find, so it is added there instead.
 */
const HEADER_LINK_CLASSES = 'focusable font-heading rounded font-semibold';
const WORDMARK_TEXT_CLASSES = 'font-heading font-bold';
const WORDMARK_LINK_CLASSES = `focusable rounded no-underline ${WORDMARK_TEXT_CLASSES}`;

/**
 * Where the wordmark goes, or `undefined` while nothing has answered.
 *
 * **An unresolved team list is not an empty one.** Better Auth's hook holds
 * `null` until the list arrives and keeps it if the request fails, and reading
 * either as "this researcher has no teams" points the wordmark at `/no-team` —
 * a route with no reconciliation guard, so a researcher who activates it in
 * that window stays on the "No team yet" screen after their memberships
 * arrive. Only a resolved list can answer that question; until one does, the
 * active team is the destination the researcher is already in, and when even
 * that is unknown there is no honest home to offer.
 */
function homeDestination(
  teams: readonly { id: string; name: string }[] | null | undefined,
  activeTeamId: string | undefined,
): LandingDestination | undefined {
  if (teams) return landingDestination({ teams, activeTeamId });
  return activeTeamId === undefined
    ? undefined
    : { to: '/team/$teamId', params: { teamId: activeTeamId } };
}

function Wordmark({ home }: { home: LandingDestination | undefined }) {
  if (home === undefined) {
    return <span className={WORDMARK_TEXT_CLASSES}>Studio</span>;
  }
  if (home.to === '/no-team') {
    return (
      <Link className={WORDMARK_LINK_CLASSES} to="/no-team">
        Studio
      </Link>
    );
  }
  return (
    <Link
      className={WORDMARK_LINK_CLASSES}
      to="/team/$teamId"
      params={home.params}
      // The team's own path is a prefix of every route beneath it, so without
      // this the wordmark would carry `aria-current="page"` on every team
      // screen.
      activeOptions={{ exact: true }}
    >
      Studio
    </Link>
  );
}

export default function AppHeader() {
  // The wordmark goes to the researcher's landing destination (§5.5), not to
  // `/`: inside the application `/` is marketing, or a redirect on a
  // self-hosted instance (§10.4). The same resolution `/` and the sign-in
  // bounce use, over what the header already has in hand — the switcher's own
  // team list — so a header link and a guard cannot disagree about where
  // "home" is.
  const teams = authClient.useListOrganizations();
  const activeTeam = authClient.useActiveOrganization();
  const home = homeDestination(teams.data, activeTeam.data?.id);

  return (
    <div className="border-surface-2 flex flex-wrap items-center gap-4 border-b px-4 py-2">
      <Wordmark home={home} />
      <TeamSwitcher />
      <StudySwitcher />
      {/* Grows into the space the switchers leave, because the field is also
          the discoverability surface for the shortcut it names. */}
      <div className="max-w-sm min-w-40 grow basis-64">
        <StudioEverythingBar />
      </div>
      <div className="ms-auto flex flex-wrap items-center justify-end gap-4">
        {platformDestinations().map((entry) => (
          <Link
            key={entry.id}
            className={HEADER_LINK_CLASSES}
            to={entry.link.to}
            params={entry.link.params}
            activeOptions={entry.link.activeOptions}
          >
            {entry.label}
          </Link>
        ))}
        <AccountMenu />
      </div>
    </div>
  );
}
