import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useRouterState,
  type RouterHistory,
} from '@tanstack/react-router';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import AppArea from '@codaco/fresco-ui/layout/AppArea';
import RouteFocus from '@codaco/fresco-ui/navigation/RouteFocus';
import { TeamInvitationIdSchema } from '@codaco/studio-rpc';

import { fetchDeploymentMode } from './lib/deployment.ts';
import {
  landingRedirect,
  resolveLandingDestination,
  resolveTeamlessSession,
} from './lib/landing.ts';
import { queryClient as applicationQueryClient } from './lib/queryClient.ts';
import {
  resolveSessionState,
  revalidateSession,
  ServerUnreachableError,
  sessionQueryOptions,
  setUnauthorizedResponseHandler,
} from './lib/session.ts';
import AcceptInvitation from './routes/AcceptInvitation.tsx';
import AppLayout from './routes/AppLayout.tsx';
import Editor from './routes/Editor.tsx';
import ErrorScreen from './routes/ErrorScreen.tsx';
import Marketing from './routes/Marketing.tsx';
import SignIn from './routes/SignIn.tsx';
import TeamActivity from './routes/TeamActivity.tsx';
import TeamMembers from './routes/TeamMembers.tsx';
import TeamStudies from './routes/TeamStudies.tsx';
import AccountArea from './shell/AccountArea.tsx';
import NoTeamSignOut from './shell/NoTeamSignOut.tsx';
import Placeholder, { type PlaceholderProps } from './shell/Placeholder.tsx';
import ProtocolOutlineArea from './shell/ProtocolOutlineArea.tsx';
import ScreenMain from './shell/ScreenMain.tsx';
import SiteLayout from './shell/SiteLayout.tsx';
import StudyArea from './shell/StudyArea.tsx';
import TeamArea from './shell/TeamArea.tsx';

/**
 * Everything a guard or a loader may read (§6.1). Nothing that can go stale
 * belongs here: the session is a query, so a guard asks the client for it
 * rather than reading a value frozen when the router was built.
 */
type ShellContext = {
  queryClient: QueryClient;
};

/**
 * Above every branch, because §11.2's route-change contract is the whole
 * router's and not the app shell's: a participant moving through an interview
 * and a visitor moving around the public site are owed the same landing and
 * the same announcement as a researcher inside the shell.
 *
 * Every screen in the tree already spreads `routeFocusTargetProps` on its
 * `<h1>`, which marks a landing point and does nothing else — this is what
 * uses them. It is fed the COMMITTED location: a pending one changes before
 * the destination has rendered, so the effect would land on and announce the
 * heading of the screen the researcher is leaving, and nothing would change
 * again once the real one arrived.
 */
function RootLayout() {
  const location = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });

  return (
    <DialogProvider>
      <RouteFocus location={location} />
      <Outlet />
    </DialogProvider>
  );
}

const rootRoute = createRootRouteWithContext<ShellContext>()({
  component: RootLayout,
});

// UNBUILT DESTINATIONS
// ====================
//
// The shell's job is that every destination §5.2 gives the product exists, is
// addressable and says what it will be (see `shell/Placeholder.tsx`). Which
// route each placeholder occupies is this design's; what eventually renders
// there belongs to the issue it names.
//
// The three factories differ only in who owns the `<main id="main-content">`
// the screen renders into, which is decided by the branch the route sits on
// (§5.3, §7.1).

/** Inside the app shell, where the area layout owns `<main>`. */
function areaPlaceholder(props: PlaceholderProps) {
  return function AreaPlaceholder() {
    return <Placeholder {...props} />;
  };
}

/**
 * Outside the app shell — site, focused and participant — where there is no
 * area layout and the screen owns its own `<main>`.
 */
function screenPlaceholder(props: PlaceholderProps) {
  return function ScreenPlaceholder() {
    return (
      <ScreenMain>
        <Placeholder {...props} />
      </ScreenMain>
    );
  };
}

/**
 * Inside the app shell, in an area that declares no sidebar: the gallery and
 * the template library, which §5.3 and §11.1 name as the only such routes.
 * `AppArea` with no navigation is `<main>` alone, so the landmark still comes
 * from one place — but there is no area layout above these routes to render
 * it, deliberately, because there is no navigation region for one to own.
 */
function libraryPlaceholder(props: PlaceholderProps) {
  return function LibraryPlaceholder() {
    const pathname = useRouterState({
      // The COMMITTED location, which is `resolvedLocation`: `location` is the
      // PENDING one, set to the destination before the transaction runs.
      select: (state) => (state.resolvedLocation ?? state.location).pathname,
    });
    return (
      <AppArea location={pathname}>
        <Placeholder {...props} />
      </AppArea>
    );
  };
}

// One deployable serves four products, and the first thing the tree encodes is
// which of the four a route belongs to (§3, §5.3). Chrome is a property of
// route position: a route inherits its shell from the branch it sits on, so
// moving a route between branches is the only way to change its chrome, and
// the app shell can never leak into a participant's interview.

/** The public site: `SiteNavigation` + `SiteFooter`, and no session. */
const siteLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'site',
  component: SiteLayout,
});

/** Single-task screens: a centred panel and no navigation. */
const focusedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'focused',
});

/** The interview owns the viewport: no chrome at all. */
const participantLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'participant',
});

// ---------------------------------------------------------------------------
// Site (§5.2)
// ---------------------------------------------------------------------------

/**
 * `/`, which is two different routes depending on what this deployment is
 * (§10.4). It is in the "both topologies" list deliberately: a self-hoster's
 * origin root is the URL they hand their researchers, so 404ing it would make
 * the instance dead at the address people actually type.
 *
 * - **managed** renders marketing, signed in or out. A signed-in researcher
 *   gets to their own work from the header rather than by having the page
 *   taken away from them.
 * - **self-hosted** renders nothing at all: a session resolves through §6.4's
 *   landing rule and no session goes to `/sign-in`.
 *
 * The mode is a query, not a boot snapshot: one bundle is served by both
 * topologies, so the answer cannot be compiled in. The HTTP layer is what
 * makes a gated path a real 404 (§10.4); this guard is the client's own half.
 */
const marketingRoute = createRoute({
  getParentRoute: () => siteLayoutRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    if ((await fetchDeploymentMode(context.queryClient)) === 'managed') return;

    const session = await context.queryClient.fetchQuery(sessionQueryOptions);
    if (session === 'signedOut') throw redirect({ to: '/sign-in' });
    throw landingRedirect(await resolveLandingDestination(context.queryClient));
  },
  component: Marketing,
});

const pricingRoute = createRoute({
  getParentRoute: () => siteLayoutRoute,
  path: '/pricing',
  component: screenPlaceholder({
    title: 'Pricing',
    description:
      'What each Studio plan includes and what it costs, so a research group can decide before they sign up.',
    issue: '#1253',
  }),
});

const legalRoute = createRoute({
  getParentRoute: () => siteLayoutRoute,
  path: '/legal/$document',
  component: screenPlaceholder({
    title: 'Legal',
    description:
      "Studio's terms of service, privacy notice and data processing agreement, each addressed by name.",
    issue: '#1253',
  }),
});

// ---------------------------------------------------------------------------
// Focused (§5.2)
// ---------------------------------------------------------------------------

const signInRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/sign-in',
  validateSearch: (search): { error?: string; invitationId?: string } => {
    const invitationId = TeamInvitationIdSchema.safeParse(search.invitationId);
    return {
      ...(typeof search.error === 'string' ? { error: search.error } : {}),
      ...(invitationId.success ? { invitationId: invitationId.data } : {}),
    };
  },
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient
      .fetchQuery(sessionQueryOptions)
      .catch((error: unknown) => {
        // This guard's only question is "are you already signed in?". An
        // unreachable server cannot answer it, and not knowing is no reason to
        // replace the sign-in page with the error screen.
        if (error instanceof ServerUnreachableError) return undefined;
        throw error;
      });
    if (session !== 'signedIn') return;
    if (search.invitationId) {
      throw redirect({
        to: '/invitations/$invitationId',
        params: { invitationId: search.invitationId },
      });
    }
    // Where an already-signed-in researcher belongs (§6.4), resolved by the
    // helper `/` uses, so the two cannot answer differently. Not knowing is
    // no reason to take the sign-in page away from someone standing on it, so
    // a resolution that fails leaves them here.
    const destination = await resolveLandingDestination(
      context.queryClient,
    ).catch(() => undefined);
    if (destination === undefined) return;
    throw landingRedirect(destination);
  },
  component: SignIn,
});

const signUpRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/sign-up',
  component: screenPlaceholder({
    title: 'Create an account',
    description:
      'Where a researcher creates their Studio account, and the first step of the funnel that ends with a team and a first study.',
    issue: '#1255',
  }),
});

const signUpTeamRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/sign-up/team',
  component: screenPlaceholder({
    title: 'Name your team',
    description:
      'Names the team the new account will own — the boundary every study, member and invoice belongs to.',
    issue: '#1249',
  }),
});

const signUpPlanRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/sign-up/plan',
  component: screenPlaceholder({
    title: 'Choose a plan',
    description:
      'Which plan the new team starts on, and what that settles about seats and limits.',
    issue: '#1253',
  }),
});

const signUpCheckoutRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/sign-up/checkout',
  component: screenPlaceholder({
    title: 'Checkout',
    description:
      "Hands off to the payment provider's own checkout, so card details never reach Studio.",
    issue: '#1253',
  }),
});

const signUpCompleteRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/sign-up/complete',
  component: screenPlaceholder({
    title: 'Account ready',
    description:
      'Where checkout returns: the subscription is confirmed, the team exists, and its first study is created.',
    issue: '#1253',
  }),
});

const invitationRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/invitations/$invitationId',
  component: () => {
    const { invitationId } = invitationRoute.useParams();
    return <AcceptInvitation invitationId={invitationId} />;
  },
});

const setupRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/setup',
  component: screenPlaceholder({
    title: 'First-run setup',
    description:
      'Configures a freshly installed self-hosted instance: its first owner, its name, and how it sends mail and stores files.',
    issue: '#1250',
  }),
});

const noTeamRoute = createRoute({
  getParentRoute: () => focusedLayoutRoute,
  path: '/no-team',
  // The fourth caller §6.4 said would join the landing resolution, and the
  // half of it the app shell's guard cannot do: that guard sends a teamless
  // session HERE, and nothing until now asked whether the session arriving
  // here is teamless at all.
  //
  // Both wrong answers are reachable without it. A signed-out visitor opens a
  // screen that describes a session they do not have. And a researcher who
  // does belong to a team — arriving by bookmark, by a link someone sent
  // them, or by the back button after an invitation was accepted — is told
  // they belong to none and offered a team to create, on a screen that reads
  // nothing and so never corrects itself.
  //
  // Resolved through `resolveLandingDestination`, the same function `/`, the
  // sign-in bounce and the app shell use, so a fourth guard cannot answer
  // differently — and, like the app shell's, only a RESOLVED answer moves
  // anybody: a team list that could not be read leaves the researcher here,
  // because bouncing them into a shell whose guard is about to read the same
  // failure would put them in a loop for as long as the outage lasts.
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.fetchQuery(sessionQueryOptions);
    if (session === 'signedOut') throw redirect({ to: '/sign-in' });

    const destination = await resolveLandingDestination(
      context.queryClient,
    ).catch(() => undefined);
    // `/no-team` resolving to itself is the one answer that means "stay", and
    // throwing its redirect from its own guard would be a loop.
    if (destination === undefined || destination.to === '/no-team') return;
    throw landingRedirect(destination);
  },
  // The sign-out is not part of the unbuilt screen: it is the way OFF a route
  // that is the terminus of every redirect this session can trigger. The guard
  // above sends them here from `/sign-in`, the app shell's guard sends them
  // here from everywhere else, and neither screen they can reach carries the
  // account menu — so without it, signing in as somebody else means clearing
  // the cookie by hand.
  component: screenPlaceholder({
    title: 'No team yet',
    description:
      'What a signed-in researcher who belongs to no team sees: how to create one, or what to expect while waiting for an invitation.',
    issue: '#1249',
    action: <NoTeamSignOut />,
  }),
});

// ---------------------------------------------------------------------------
// Participant (§5.2) — no chrome, no session, no researcher navigation.
// ---------------------------------------------------------------------------

const enterRoute = createRoute({
  getParentRoute: () => participantLayoutRoute,
  path: '/enter/$token',
  component: screenPlaceholder({
    title: 'Welcome',
    description:
      "Where a participant's invitation link lands: the study's welcome, the language they will answer in, and anything they should read first.",
    issue: '#1265',
  }),
});

const enterConsentRoute = createRoute({
  getParentRoute: () => participantLayoutRoute,
  path: '/enter/$token/consent',
  component: screenPlaceholder({
    title: 'Consent',
    description:
      "The study's consent text, and the participant's recorded decision about taking part in it.",
    issue: '#1266',
  }),
});

const enterInterviewRoute = createRoute({
  getParentRoute: () => participantLayoutRoute,
  path: '/enter/$token/interview',
  component: screenPlaceholder({
    title: 'Interview',
    description:
      'The interview itself, run by the Network Canvas interview runtime and owning the whole viewport.',
    issue: '#1293',
  }),
});

const enterCompleteRoute = createRoute({
  getParentRoute: () => participantLayoutRoute,
  path: '/enter/$token/complete',
  component: screenPlaceholder({
    title: 'Interview complete',
    description:
      'Confirms the interview is finished and sends the participant wherever the study asked to return them.',
    issue: '#1292',
  }),
});

/** Header and sidebar; authenticated. The session guard lives here. */
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context }) => {
    // `fetchQuery` answers from the cache while the query is fresh, so the
    // whole authenticated tree costs one request rather than one per
    // navigation — and it re-asks once the query has been invalidated, which
    // `ensureQueryData` would not.
    //
    // Through `resolveSessionState`, because this guard runs on a tree that is
    // already on screen as well as on a cold entry: a server that cannot be
    // reached is not a reason to unmount the researcher's work. What it does
    // with each ANSWER is unchanged, and only an answer gets this far.
    const session = await resolveSessionState(context.queryClient);
    if (session === 'signedOut') {
      // Everything else in the cache belongs to the researcher whose session
      // has just ended, and removal is the only operation that guarantees
      // none of it is served to whoever signs in next (§6.2).
      //
      // This is the one place that can do it. `AppLayout` used to, off
      // `authClient.useSession()` — a second live channel that noticed the
      // transition independently of this guard. With one channel, the guard
      // learns it and then unmounts `AppLayout` by redirecting, and a
      // component effect racing that redirect for the same fact loses
      // whenever the redirect is not blocked: nothing clears the cache at
      // all. The prohibition this bends is §6.6's, which is about writing
      // tenancy state from a loader; dropping a dead session's cache is not
      // that.
      context.queryClient.clear();
      // A dirty-form blocker must not strand the researcher in a private
      // route whose cached data has just been removed. Authentication has
      // already gone away, so there is no editor state left worth keeping.
      throw redirect({ to: '/sign-in', ignoreBlocker: true });
    }
    // An unreachable server on a COLD entry throws ServerUnreachableError out
    // of the resolution and out of this guard, so the router renders its
    // defaultErrorComponent rather than bouncing a possibly-still-
    // authenticated researcher to the sign-in page. On a revalidation of a
    // tree already on screen it does not get this far — see
    // `resolveSessionState`.

    // §6.4's second half: a session with no team memberships has nowhere in
    // this tree to be. Without this, a bookmark or a deep link into
    // `/team/…`, `/study/…`, `/account` or `/gallery` enters the shell and
    // meets screens that spin, fail RPC authorization, or show a placeholder
    // where the answer should be. The guard is what makes `/no-team`
    // reachable from those addresses and not only from the post-sign-in
    // landing.
    //
    // Resolved through the same resolution `/` and the sign-in bounce use, so
    // three guards cannot answer differently — and only a RESOLVED zero
    // redirects: a list that could not be read leaves the researcher where
    // they asked to be, because "you belong to no team" is the one thing they
    // are most likely to believe and the most expensive to be wrong about.
    const teamless = await resolveTeamlessSession(context.queryClient).catch(
      () => false,
    );
    if (teamless) throw redirect({ to: '/no-team' });
  },
  component: AppLayout,
});

// Below the app layout, chrome is a property of the AREA (§5.3): the app
// layout renders the header and the frame, and each area layout renders the
// `<nav>` it labels and the `<main id="main-content">` the skip link targets.
// Areas are siblings, never nested, so one area's navigation region replaces
// another's rather than rendering beside it.

// ---------------------------------------------------------------------------
// App, platform level (§5.2)
// ---------------------------------------------------------------------------

/** The researcher's own settings. Sidebar: Account. */
const accountLayoutRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/account',
  component: AccountArea,
});

const accountIndexRoute = createRoute({
  getParentRoute: () => accountLayoutRoute,
  path: '/',
  component: areaPlaceholder({
    title: 'Profile',
    description:
      "The researcher's own name, email address and everything else Studio holds about them as a person rather than as a member of a team.",
    issue: '#1255',
  }),
});

const accountLanguageRoute = createRoute({
  getParentRoute: () => accountLayoutRoute,
  path: '/language',
  component: areaPlaceholder({
    title: 'Language',
    description:
      'The language Studio itself speaks to this researcher, which is a separate choice from the languages a protocol offers its participants.',
    issue: '#1310',
  }),
});

const accountSignInMethodsRoute = createRoute({
  getParentRoute: () => accountLayoutRoute,
  path: '/sign-in-methods',
  component: areaPlaceholder({
    title: 'Sign-in methods',
    description:
      'Which providers can sign this account in, and which sessions are signed in on it right now.',
    issue: '#1255',
  }),
});

const accountTokensRoute = createRoute({
  getParentRoute: () => accountLayoutRoute,
  path: '/tokens',
  component: areaPlaceholder({
    title: 'API tokens',
    description:
      "Personal tokens for reaching Studio's API as this researcher, and revoking one that should no longer work.",
    issue: '#1288',
  }),
});

const galleryRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/gallery',
  component: libraryPlaceholder({
    title: 'Gallery',
    description:
      'Protocols other researchers have published, to read, cite and copy into a team as the starting point for a study.',
    issue: '#1285',
  }),
});

const galleryTemplateRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/gallery/$templateId',
  component: libraryPlaceholder({
    title: 'Gallery protocol',
    description:
      'One published protocol in full: what it collects, who made it, and where it came from.',
    issue: '#1283',
  }),
});

const templatesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/templates',
  component: libraryPlaceholder({
    title: 'Templates',
    description:
      'The protocol templates this instance offers as starting points, and what each one is for.',
    issue: '#1282',
  }),
});

// ---------------------------------------------------------------------------
// App, team level (§5.2)
//
// §5.4's migration has happened: the team screen that shipped at `/` is
// now `/team/$teamId` (its studies) and `/team/$teamId/members` (its
// membership and invitations), and the audit trail moved off
// `/teams/$teamId/activity` onto `/team/$teamId/activity`. No public URLs
// existed to redirect — Studio has no production deployment — so the old
// addresses are gone rather than forwarded.
// ---------------------------------------------------------------------------

/** Team administration. Sidebar: Team. */
const teamLayoutRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/team/$teamId',
  component: TeamArea,
});

const teamIndexRoute = createRoute({
  getParentRoute: () => teamLayoutRoute,
  path: '/',
  component: () => {
    const { teamId } = teamLayoutRoute.useParams();
    return <TeamStudies teamId={teamId} />;
  },
});

const teamMembersRoute = createRoute({
  getParentRoute: () => teamLayoutRoute,
  path: '/members',
  component: () => {
    const { teamId } = teamLayoutRoute.useParams();
    return <TeamMembers teamId={teamId} />;
  },
});

const teamRolesRoute = createRoute({
  getParentRoute: () => teamLayoutRoute,
  path: '/roles',
  component: areaPlaceholder({
    title: 'Roles',
    description:
      'What each member is allowed to do, and who among them may see participant identifiers.',
    issue: '#1257',
  }),
});

const teamAuditRoute = createRoute({
  getParentRoute: () => teamLayoutRoute,
  path: '/activity',
  component: TeamActivity,
});

const teamBillingRoute = createRoute({
  getParentRoute: () => teamLayoutRoute,
  path: '/billing',
  component: areaPlaceholder({
    title: 'Billing',
    description:
      "The team's plan, the seats it is paying for, and its invoices.",
    issue: '#1253',
  }),
});

const teamSettingsRoute = createRoute({
  getParentRoute: () => teamLayoutRoute,
  path: '/settings',
  component: areaPlaceholder({
    title: 'Team settings',
    description:
      "The team's name, the defaults every new study inherits from it, and deleting the team.",
    issue: '#1249',
  }),
});

const teamSettingsApiRoute = createRoute({
  getParentRoute: () => teamLayoutRoute,
  path: '/settings/api',
  component: areaPlaceholder({
    title: 'API access',
    description:
      "The team's API credentials, what each one may reach, and when it was last used.",
    issue: '#1288',
  }),
});

const teamSettingsWebhooksRoute = createRoute({
  getParentRoute: () => teamLayoutRoute,
  path: '/settings/webhooks',
  component: areaPlaceholder({
    title: 'Webhooks',
    description:
      'Where Studio should tell another system that something happened in this team, and whether those messages are arriving.',
    issue: '#1291',
  }),
});

const teamSettingsMessagingRoute = createRoute({
  getParentRoute: () => teamLayoutRoute,
  path: '/settings/messaging',
  component: areaPlaceholder({
    title: 'Messaging',
    description:
      'How this team reaches participants by email and SMS, and the sender they will see it come from.',
    issue: '#1305',
  }),
});

// ---------------------------------------------------------------------------
// App, study level (§5.2)
// ---------------------------------------------------------------------------

/**
 * The study. It declares the path and the params and renders NOTHING: a route
 * with no component renders `Outlet`, so it contributes no DOM of its own.
 *
 * Its two children are sibling AREA layouts, exactly one of which is ever
 * matched, and that is what makes the editor's outline REPLACE the study
 * sidebar rather than render beside it. An editor layout nested under the
 * study's area would render two `<nav>`s and two `<main id="main-content">`s,
 * with the skip link resolving to the outer one (§5.3).
 *
 * `$studyId` addresses a PROTOCOL until #1262 lands the studies model. The
 * shell does not wait for an entity model to exist before giving the product
 * its shape, and it should not pretend the model is here either: the parameter
 * is named for what the product has decided to have, and what it currently
 * identifies is the protocol that study work is being done against.
 */
const studyRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/study/$studyId',
});

/** The study's own area. Sidebar: Study. */
const studyAreaLayoutRoute = createRoute({
  getParentRoute: () => studyRoute,
  id: 'study-area',
  component: () => {
    const { studyId } = studyRoute.useParams();
    return <StudyArea studyId={studyId} />;
  },
});

const studyIndexRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/',
  component: areaPlaceholder({
    title: 'Overview',
    description:
      'How collection on this study is going: what has come in, what is outstanding, and what needs attention.',
    issue: '#1268',
  }),
});

const studyVersionsRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/versions',
  component: areaPlaceholder({
    title: 'Versions',
    description:
      'The protocol versions this study has published, and what changed between one and the next.',
    issue: '#1276',
  }),
});

const studyParticipantsRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/participants',
  component: areaPlaceholder({
    title: 'Participants',
    description:
      'The people taking part in this study, and the identifiers and attributes the study holds about them.',
    issue: '#1263',
  }),
});

const studyWavesRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/waves',
  component: areaPlaceholder({
    title: 'Waves',
    description:
      'The timepoints this study collects at, and how far each participant has progressed through them.',
    issue: '#1267',
  }),
});

const studySessionsRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/sessions',
  component: areaPlaceholder({
    title: 'Sessions',
    description:
      'Every interview session this study has collected, finished or otherwise.',
    issue: '#1269',
  }),
});

const studySessionRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/sessions/$sessionId',
  component: areaPlaceholder({
    title: 'Session',
    description:
      'One session in detail: the network it collected, the answers it recorded, and how it was captured.',
    issue: '#1269',
  }),
});

const studyScheduleRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/schedule',
  component: areaPlaceholder({
    title: 'Schedule',
    description:
      'When this study contacts participants and runs its waves, and whether it is keeping to that.',
    issue: '#1304',
  }),
});

const studyRecruitmentRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/recruitment',
  component: areaPlaceholder({
    title: 'Recruitment',
    description:
      'How participants arrive: the links that let them in, the consent they are asked for, and what they meet on the way.',
    issue: '#1265',
  }),
});

const studySettingsRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/settings',
  component: areaPlaceholder({
    title: 'Study settings',
    description:
      "The study's name, where it is in its lifecycle, how it is delivered, and how it is closed.",
    issue: '#1262',
  }),
});

const studyExportRoute = createRoute({
  getParentRoute: () => studyAreaLayoutRoute,
  path: '/export',
  component: areaPlaceholder({
    title: 'Export',
    description:
      'Collected data out of Studio: the interchange formats analysis needs, and the archives a repository will take.',
    issue: '#1324',
  }),
});

/** The protocol editor's area. Sidebar: Protocol outline. */
const editorLayoutRoute = createRoute({
  getParentRoute: () => studyRoute,
  path: '/editor',
  component: () => {
    const { studyId } = studyRoute.useParams();
    return <ProtocolOutlineArea studyId={studyId} />;
  },
});

const editorIndexRoute = createRoute({
  getParentRoute: () => editorLayoutRoute,
  path: '/',
  component: Editor,
});

const editorCodebookRoute = createRoute({
  getParentRoute: () => editorLayoutRoute,
  path: '/codebook',
  component: areaPlaceholder({
    title: 'Codebook',
    description:
      'The entities and variables this protocol collects, and the rules each of them follows.',
    issue: '#1273',
  }),
});

const editorStageRoute = createRoute({
  getParentRoute: () => editorLayoutRoute,
  path: '/stages/$stageId',
  component: areaPlaceholder({
    title: 'Stage',
    description:
      'One stage in detail: the interface it uses, the prompts it asks, and how a participant answers it.',
    issue: '#1274',
  }),
});

const editorAssetsRoute = createRoute({
  getParentRoute: () => editorLayoutRoute,
  path: '/assets',
  component: areaPlaceholder({
    title: 'Assets',
    description:
      'The images, videos, audio and network files this protocol shows participants.',
    issue: '#1278',
  }),
});

const editorTranslationsRoute = createRoute({
  getParentRoute: () => editorLayoutRoute,
  path: '/translations',
  component: areaPlaceholder({
    title: 'Translations',
    description:
      'Every piece of text a participant will read, in each language this study offers them.',
    issue: '#1311',
  }),
});

const editorPreviewRoute = createRoute({
  getParentRoute: () => editorLayoutRoute,
  path: '/preview',
  component: areaPlaceholder({
    title: 'Preview',
    description:
      'The draft run exactly as a participant would meet it, recording nothing.',
    issue: '#1279',
  }),
});

const routeTree = rootRoute.addChildren([
  siteLayoutRoute.addChildren([marketingRoute, pricingRoute, legalRoute]),
  focusedLayoutRoute.addChildren([
    signInRoute,
    signUpRoute,
    signUpTeamRoute,
    signUpPlanRoute,
    signUpCheckoutRoute,
    signUpCompleteRoute,
    invitationRoute,
    setupRoute,
    noTeamRoute,
  ]),
  participantLayoutRoute.addChildren([
    enterRoute,
    enterConsentRoute,
    enterInterviewRoute,
    enterCompleteRoute,
  ]),
  appLayoutRoute.addChildren([
    accountLayoutRoute.addChildren([
      accountIndexRoute,
      accountLanguageRoute,
      accountSignInMethodsRoute,
      accountTokensRoute,
    ]),
    galleryRoute,
    galleryTemplateRoute,
    templatesRoute,
    teamLayoutRoute.addChildren([
      teamIndexRoute,
      teamMembersRoute,
      teamRolesRoute,
      teamAuditRoute,
      teamBillingRoute,
      teamSettingsRoute,
      teamSettingsApiRoute,
      teamSettingsWebhooksRoute,
      teamSettingsMessagingRoute,
    ]),
    studyRoute.addChildren([
      studyAreaLayoutRoute.addChildren([
        studyIndexRoute,
        studyVersionsRoute,
        studyParticipantsRoute,
        studyWavesRoute,
        studySessionsRoute,
        studySessionRoute,
        studyScheduleRoute,
        studyRecruitmentRoute,
        studySettingsRoute,
        studyExportRoute,
      ]),
      editorLayoutRoute.addChildren([
        editorIndexRoute,
        editorCodebookRoute,
        editorStageRoute,
        editorAssetsRoute,
        editorTranslationsRoute,
        editorPreviewRoute,
      ]),
    ]),
  ]),
]);

export function createAppRouter(
  history?: RouterHistory,
  queryClient: QueryClient = applicationQueryClient,
) {
  const router = createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultErrorComponent: ErrorScreen,
    // Preloading on intent is safe because every guard and loader is a pure
    // read; `defaultPreloadStaleTime: 0` hands freshness back to TanStack
    // Query, so a hover re-runs the guard but not the request (§6.2).
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  });

  setUnauthorizedResponseHandler(async () => {
    // A procedure answering 401 makes the cached session a lie, but it cannot
    // say which lie: only /api/auth/* can tell signed-out from unreachable
    // from no-database. `revalidateSession` is what asks it — the same thing
    // the shell does when the tab is re-entered, from the other trigger.
    await revalidateSession(queryClient, router);
  });

  return router;
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  // Interface merging is the documented registration mechanism for router
  // type inference; a type alias cannot merge.
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Register {
    router: typeof router;
  }
}
