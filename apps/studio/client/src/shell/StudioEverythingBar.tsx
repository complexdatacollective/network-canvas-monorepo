import {
  Link,
  useNavigate,
  useParams,
  useRouterState,
} from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import EverythingBar, {
  type EverythingBarLabels,
  type EverythingBarLinkRenderProps,
} from '@codaco/fresco-ui/navigation/EverythingBar';

import { authClient } from '../lib/auth.ts';
import { useBillingUnavailableReason } from '../lib/deployment.ts';
import { canManageTeam, teamRole } from '../lib/teamRoles.ts';
import { createDestinationsProvider } from './everythingBarDestinations.ts';
import {
  createMockCommandsProvider,
  createMockDocumentationProvider,
} from './everythingBarMockProviders.ts';
import { currentAreaFor, navigationManifest } from './navigationManifest.ts';
import { recordSurfaceRequest } from './surfaceRequests.ts';

/**
 * Studio's everything bar (everything-bar design §4), mounted in the app
 * shell's header and opened from any app route with `⌘K` / `Ctrl+K`.
 *
 * The component is shared and knows nothing about Studio; this is the app half:
 * which providers exist, what they may see, how a result becomes a navigation,
 * and every rendered string.
 *
 * **App shell only** (invariant 7). It is mounted by `AppHeader`, which the app
 * branch renders and the site, focused and participant branches do not — so a
 * participant can never open a researcher search surface.
 */

/**
 * Every string the bar renders, as whole sentences rather than fragments.
 *
 * They are literals here because Studio has no message catalogue yet; #1310
 * turns this object into catalogue lookups, and the shape is already the one it
 * needs — `resultCount` and `chordHint` are functions of their data, which is a
 * translator's placeholder, not a sentence assembled in JavaScript.
 */
const LABELS: EverythingBarLabels = {
  triggerPlaceholder: 'Search Studio',
  triggerMac: 'Search and commands (Command K)',
  triggerOther: 'Search and commands (Control K)',
  dialog: 'Search and commands',
  searchLabel: 'Search destinations, commands and documentation',
  searchPlaceholder: 'Find a place, a thing, an action, or an answer',
  results: 'Results',
  recents: 'Recent',
  groups: {
    'go-to': 'Go to',
    'commands': 'Commands',
    'documentation': 'Documentation',
  },
  showMore: 'Show more',
  pending: 'Searching…',
  error: 'These results could not be loaded. Press Enter to try again.',
  noResults: 'Nothing matches that search.',
  resultCount: (count) => (count === 1 ? '1 result' : `${count} results`),
  chordHint: (keys) => `Shortcut: ${keys.join(' then ')}`,
  footerNavigate: 'Navigate',
  footerSelect: 'Select',
  footerClose: 'Close',
  footerNavigateKeys: 'Up and down arrow keys',
  footerSelectKeys: 'Enter key',
};

/**
 * Recents are per browser and per researcher (§5.6). The researcher half of
 * that key is missing because the app shell reads no identity — `AppLayout`
 * deliberately holds no session query, and the profile screen that will have a
 * name and an id is #1255. Until then this is per browser only, which is why
 * every stored entry is a REFERENCE re-resolved through its provider before it
 * renders: a shared browser shows the next researcher no label they may not
 * see, only the destinations their own manifest still resolves.
 */
const RECENTS_STORAGE_KEY = 'studio:everything-bar:recents';

/** Documentation results leave Studio; everything else is a router navigation. */
function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export default function StudioEverythingBar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const pathname = useRouterState({
    // The COMMITTED location, so the current-context ranking follows what is on
    // screen rather than a pending navigation a blocker may still cancel.
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  // `strict: false` because most app routes have neither parameter, and the
  // absence is the answer for them rather than a type error.
  const { studyId, teamId: routeTeamId } = useParams({ strict: false });
  const activeTeam = authClient.useActiveOrganization();
  const activeMember = authClient.useActiveMember();
  const billingUnavailableReason = useBillingUnavailableReason();

  // A study route names no team (§6.3), so inside a study this falls back to
  // the active-team setting — the same fallback the header's study chip makes,
  // and what lets "invite" find the team's command from a study screen.
  const teamId = routeTeamId ?? activeTeam.data?.id;
  // Against the team the bar is searching FOR, not against whichever team the
  // active membership currently names: a team URL commits before §6.6's
  // reconciler has moved the setting, so the two name different teams for the
  // whole of every switch and permanently after a failed write.
  const canManage = canManageTeam(teamRole(activeMember.data, teamId));
  const currentArea = currentAreaFor(pathname);

  // `⌘K` from anywhere in the app shell. The binding lives here rather than in
  // the component because an app's shortcut registry owns every binding (§4);
  // this is that registry's first entry, and the `g`-chords join it in slice 2.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return;
      if (!event.metaKey && !event.ctrlKey) return;
      // The browser's own bindings on this chord are a search box and a
      // downloads panel; the researcher asked for ours.
      event.preventDefault();
      setOpen((current) => !current);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Providers are re-created exactly when what they can see changes — the
  // researcher's team, their study, their role, the deployment's surfaces — and
  // held stable otherwise. Re-creating them on every render would re-run the
  // bar's whole result pipeline on every render; never re-creating them would
  // leave the previous context's results on screen, still activatable.
  const entries = useMemo(
    () =>
      navigationManifest({
        teamId,
        studyId,
        canManageTeam: canManage,
        billingUnavailableReason,
      }),
    [teamId, studyId, canManage, billingUnavailableReason],
  );

  const destinations = useMemo(
    () => createDestinationsProvider({ entries, currentArea }),
    [entries, currentArea],
  );
  // The capability goes to the commands provider as well as to the manifest.
  // A command is a launch into the screen that owns the action (invariant 3),
  // so a command offered to someone who may not perform it lands them on a
  // screen that correctly refuses them — which is a worse answer than not
  // offering it, and the one thing a launcher must never do.
  const commands = useMemo(
    () =>
      createMockCommandsProvider({ teamId, studyId, canManageTeam: canManage }),
    [teamId, studyId, canManage],
  );
  const documentation = useMemo(() => createMockDocumentationProvider(), []);

  const renderLink = useCallback(
    ({ children, href, ...props }: EverythingBarLinkRenderProps) => {
      // A documentation result leaves the app, so it is a plain anchor: handing
      // an absolute URL to the router's `Link` would ask it to resolve a route
      // that is not in this application's tree.
      if (isExternalHref(href)) {
        return (
          <a {...props} href={href}>
            {children}
          </a>
        );
      }

      // Everything else goes through the router, which is what makes an
      // activation an ordinary navigation — so the editor's dirty-state blocker
      // applies to it without this component knowing the blocker exists (§4).
      return (
        <Link {...props} to={href}>
          {children}
        </Link>
      );
    },
    [],
  );

  return (
    <EverythingBar
      providers={[destinations, commands, documentation]}
      labels={LABELS}
      renderLink={renderLink}
      onOpenSurface={({ href, surface }) => {
        // ONE navigation, carrying the surface with it. The bar has already
        // prevented the row's own link default, so this is the only one; a
        // second, plain arrival could win the race and drop the surface.
        //
        // Recording rather than opening is the launcher rule (invariant 3): the
        // destination screen performs it. Nothing consumes the record yet —
        // `surfaceRequests.ts` records which slice makes destinations honour it.
        recordSurfaceRequest({ href, surface });
        void navigate({ to: href });
      }}
      open={open}
      onOpenChange={setOpen}
      recentsStorageKey={RECENTS_STORAGE_KEY}
    />
  );
}
