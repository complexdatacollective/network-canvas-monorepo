import {
  Link,
  useNavigate,
  useParams,
  useRouterState,
} from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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
 * Every string the bar renders, as whole messages rather than fragments
 * (#1310). `resultCount` is an ICU plural and `chordHint` a message over an
 * intl-formatted list, because both are functions of their data — a
 * translator's placeholder, not a sentence assembled in JavaScript. The
 * shared component keeps receiving resolved strings (`EverythingBarLabels`),
 * which is the host-supplied-copy contract of design decision 10.
 */
const barMessages = defineMessages({
  triggerPlaceholder: {
    id: 'studio.everythingBar.triggerPlaceholder',
    defaultMessage: 'Search Studio',
    description: "Placeholder shown in the header's everything-bar trigger.",
  },
  triggerMac: {
    id: 'studio.everythingBar.triggerMac',
    defaultMessage: 'Search and commands (Command K)',
    description:
      'Accessible name of the everything-bar trigger on macOS, naming the Command K shortcut.',
  },
  triggerOther: {
    id: 'studio.everythingBar.triggerOther',
    defaultMessage: 'Search and commands (Control K)',
    description:
      'Accessible name of the everything-bar trigger outside macOS, naming the Control K shortcut.',
  },
  dialog: {
    id: 'studio.everythingBar.dialog',
    defaultMessage: 'Search and commands',
    description: 'Accessible name of the everything-bar dialog.',
  },
  searchLabel: {
    id: 'studio.everythingBar.searchLabel',
    defaultMessage: 'Search destinations, commands and documentation',
    description: "Accessible name of the everything bar's search input.",
  },
  searchPlaceholder: {
    id: 'studio.everythingBar.searchPlaceholder',
    defaultMessage: 'Find a place, a thing, an action, or an answer',
    description: "Placeholder shown in the everything bar's search input.",
  },
  results: {
    id: 'studio.everythingBar.results',
    defaultMessage: 'Results',
    description: "Accessible name of the everything bar's results listbox.",
  },
  recents: {
    id: 'studio.everythingBar.recents',
    defaultMessage: 'Recent',
    description: "Heading of the everything bar's recent-activations section.",
  },
  groupGoTo: {
    id: 'studio.everythingBar.groupGoTo',
    defaultMessage: 'Go to',
    description:
      'Heading of the everything-bar result group listing destinations.',
  },
  groupCommands: {
    id: 'studio.everythingBar.groupCommands',
    defaultMessage: 'Commands',
    description: 'Heading of the everything-bar result group listing commands.',
  },
  groupDocumentation: {
    id: 'studio.everythingBar.groupDocumentation',
    defaultMessage: 'Documentation',
    description:
      'Heading of the everything-bar result group listing documentation.',
  },
  showMore: {
    id: 'studio.everythingBar.showMore',
    defaultMessage: 'Show more',
    description:
      "Row that reveals a result group's next slice in the everything bar.",
  },
  pending: {
    id: 'studio.everythingBar.pending',
    defaultMessage: 'Searching…',
    description:
      "Shown while an everything-bar provider's search is still running.",
  },
  error: {
    id: 'studio.everythingBar.error',
    defaultMessage:
      'These results could not be loaded. Press Enter to try again.',
    description:
      'Shown, and retried on activation, when an everything-bar search failed.',
  },
  noResults: {
    id: 'studio.everythingBar.noResults',
    defaultMessage: 'Nothing matches that search.',
    description: 'Shown when a settled everything-bar query matched nothing.',
  },
  resultCount: {
    id: 'studio.everythingBar.resultCount',
    defaultMessage: '{count, plural, one {# result} other {# results}}',
    description:
      'Politely announced result total under the everything-bar search input.',
  },
  chordHint: {
    id: 'studio.everythingBar.chordHint',
    defaultMessage: 'Shortcut: {keys}',
    description:
      "What a result's keyboard chord means; {keys} is the formatted list of keys to press in order.",
  },
  footerNavigate: {
    id: 'studio.everythingBar.footerNavigate',
    defaultMessage: 'Navigate',
    description: "Footer label naming what the everything bar's arrow keys do.",
  },
  footerSelect: {
    id: 'studio.everythingBar.footerSelect',
    defaultMessage: 'Select',
    description:
      "Footer label naming what the everything bar's Enter key does.",
  },
  footerClose: {
    id: 'studio.everythingBar.footerClose',
    defaultMessage: 'Close',
    description:
      "Footer label naming what the everything bar's Escape key does.",
  },
  footerNavigateKeys: {
    id: 'studio.everythingBar.footerNavigateKeys',
    defaultMessage: 'Up and down arrow keys',
    description:
      'Names the arrow-key caps in the everything-bar footer for assistive technology.',
  },
  footerSelectKeys: {
    id: 'studio.everythingBar.footerSelectKeys',
    defaultMessage: 'Enter key',
    description:
      'Names the Enter cap in the everything-bar footer for assistive technology.',
  },
});

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
  const intl = useAppIntl();

  const labels = useMemo<EverythingBarLabels>(
    () => ({
      triggerPlaceholder: intl.formatMessage(barMessages.triggerPlaceholder),
      triggerMac: intl.formatMessage(barMessages.triggerMac),
      triggerOther: intl.formatMessage(barMessages.triggerOther),
      dialog: intl.formatMessage(barMessages.dialog),
      searchLabel: intl.formatMessage(barMessages.searchLabel),
      searchPlaceholder: intl.formatMessage(barMessages.searchPlaceholder),
      results: intl.formatMessage(barMessages.results),
      recents: intl.formatMessage(barMessages.recents),
      groups: {
        'go-to': intl.formatMessage(barMessages.groupGoTo),
        'commands': intl.formatMessage(barMessages.groupCommands),
        'documentation': intl.formatMessage(barMessages.groupDocumentation),
      },
      showMore: intl.formatMessage(barMessages.showMore),
      pending: intl.formatMessage(barMessages.pending),
      error: intl.formatMessage(barMessages.error),
      noResults: intl.formatMessage(barMessages.noResults),
      resultCount: (count) =>
        intl.formatMessage(barMessages.resultCount, { count }),
      // The keys are data; the list joins them in locale order and the
      // message wraps the whole thing — never a sentence built by hand.
      chordHint: (keys) =>
        intl.formatMessage(barMessages.chordHint, {
          keys: intl.formatList(keys, { type: 'unit' }),
        }),
      footerNavigate: intl.formatMessage(barMessages.footerNavigate),
      footerSelect: intl.formatMessage(barMessages.footerSelect),
      footerClose: intl.formatMessage(barMessages.footerClose),
      footerNavigateKeys: intl.formatMessage(barMessages.footerNavigateKeys),
      footerSelectKeys: intl.formatMessage(barMessages.footerSelectKeys),
    }),
    [intl],
  );

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
    () => createDestinationsProvider({ entries, currentArea, intl }),
    [entries, currentArea, intl],
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
      labels={labels}
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
