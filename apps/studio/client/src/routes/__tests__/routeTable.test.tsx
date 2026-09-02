// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { unclassifiedSurfacePaths } from '@codaco/studio-rpc/surfaces';

import { createAppRouter } from '../../router.tsx';

/**
 * §5.2's route table, asserted by rendering it.
 *
 * The shell's claim is that every destination the product will have exists, is
 * addressable and renders something honest. Nothing about that is checkable by
 * reading the tree: a route can be declared and still render nothing, render
 * two `<main>`s, or be reachable only from a navigation entry that points
 * somewhere else. So each destination is rendered, and each navigation region
 * is asked where its entries actually go.
 */

const fixtures = vi.hoisted(() => ({
  TEAM: { id: 'team-a', name: 'Alpha research team', slug: 'alpha' },
  deployment: { mode: 'managed', billing: false },
  getSession: vi.fn(),
  // Read at call time, so a test can put the researcher in no team, or in
  // several, before it renders.
  teams: [] as { id: string; name: string }[],
  STUDY: {
    id: 'study-1',
    draftId: 'draft-1',
    name: 'Shell proof',
    createdAt: new Date('2026-08-28T00:00:00Z'),
    updatedAt: new Date('2026-08-28T00:00:00Z'),
  },
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: fixtures.getSession,
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Researcher', email: 'researcher@example.com' } },
      isPending: false,
      error: null,
    }),
    useListOrganizations: vi.fn().mockReturnValue({
      data: [fixtures.TEAM],
      isPending: false,
      error: null,
    }),
    useActiveOrganization: vi.fn().mockReturnValue({
      data: { ...fixtures.TEAM, members: [], invitations: [] },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    useActiveMember: vi.fn().mockReturnValue({
      data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    organization: {
      setActive: vi.fn().mockResolvedValue({ error: null }),
      list: vi.fn(() => Promise.resolve({ data: fixtures.teams, error: null })),
    },
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: () => ({
          name: 'Network Canvas Studio',
          version: '0.1.0',
          auth: { enabled: true, magicLink: true, socialProviders: [] },
          // Read at call time, so a test can put the client on a self-hosted
          // instance before it renders.
          deployment: fixtures.deployment,
        }),
      }),
    },
    protocols: {
      list: {
        queryOptions: () => ({
          queryKey: ['protocols'],
          queryFn: () => [fixtures.STUDY],
        }),
        key: () => ['protocols'],
      },
      create: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      draft: {
        queryOptions: () => ({
          queryKey: ['draft'],
          queryFn: () => ({
            protocol: fixtures.STUDY,
            revision: { sequence: '1', hash: 'revision-1' },
            // No stages, so the editor selects none and acquires no editing
            // session: this file renders every route, and the editor's leased
            // session belongs to `Editor.test.tsx`.
            sections: {
              settings: { name: fixtures.STUDY.name, schemaVersion: 8 },
              stageOrder: { stages: [] },
            },
          }),
        }),
        key: () => ['draft'],
      },
    },
    audit: {
      list: {
        infiniteOptions: (options: {
          initialPageParam: string | undefined;
          getNextPageParam: (page: {
            nextCursor: string | null;
          }) => string | undefined;
        }) => ({
          queryKey: ['audit-list'],
          queryFn: () => ({ events: [], nextCursor: null }),
          initialPageParam: options.initialPageParam,
          getNextPageParam: options.getNextPageParam,
        }),
      },
      get: {
        queryOptions: () => ({ queryKey: ['audit-get'], queryFn: vi.fn() }),
      },
      filterOptions: {
        queryOptions: () => ({
          queryKey: ['audit-filter-options'],
          queryFn: () => ({ actors: [] }),
        }),
      },
    },
  },
  rpcClient: { protocols: {}, team: {} },
}));

const INVITATION_ID = '00000000-0000-4000-8000-000000000123';

type Destination = {
  /** The path the router registers, in its own `$param` spelling. */
  path: string;
  /** A concrete URL that resolves to it. */
  url: string;
  /** The `<h1>` the screen names itself with. */
  heading: string;
  /** Screens that are only reachable signed out. */
  signedOut?: true;
  /** Screens only a session belonging to no team at all can reach (§6.4). */
  teamless?: true;
};

/** Every destination in §5.2, in the order the design tables them. */
const DESTINATIONS: Destination[] = [
  // Site
  { path: '/', url: '/', heading: 'Network Canvas Studio' },
  { path: '/pricing', url: '/pricing', heading: 'Pricing' },
  { path: '/legal/$document', url: '/legal/terms', heading: 'Legal' },

  // Focused
  { path: '/sign-in', url: '/sign-in', heading: 'Sign in', signedOut: true },
  { path: '/sign-up', url: '/sign-up', heading: 'Create an account' },
  { path: '/sign-up/team', url: '/sign-up/team', heading: 'Name your team' },
  { path: '/sign-up/plan', url: '/sign-up/plan', heading: 'Choose a plan' },
  { path: '/sign-up/checkout', url: '/sign-up/checkout', heading: 'Checkout' },
  {
    path: '/sign-up/complete',
    url: '/sign-up/complete',
    heading: 'Account ready',
  },
  {
    path: '/invitations/$invitationId',
    url: `/invitations/${INVITATION_ID}`,
    heading: 'Accept team invitation',
  },
  { path: '/setup', url: '/setup', heading: 'First-run setup' },
  { path: '/no-team', url: '/no-team', heading: 'No team yet', teamless: true },

  // Participant
  { path: '/enter/$token', url: '/enter/token-1', heading: 'Welcome' },
  {
    path: '/enter/$token/consent',
    url: '/enter/token-1/consent',
    heading: 'Consent',
  },
  {
    path: '/enter/$token/interview',
    url: '/enter/token-1/interview',
    heading: 'Interview',
  },
  {
    path: '/enter/$token/complete',
    url: '/enter/token-1/complete',
    heading: 'Interview complete',
  },

  // App, platform level
  { path: '/account', url: '/account', heading: 'Profile' },
  { path: '/account/language', url: '/account/language', heading: 'Language' },
  {
    path: '/account/sign-in-methods',
    url: '/account/sign-in-methods',
    heading: 'Sign-in methods',
  },
  { path: '/account/tokens', url: '/account/tokens', heading: 'API tokens' },
  { path: '/gallery', url: '/gallery', heading: 'Gallery' },
  {
    path: '/gallery/$templateId',
    url: '/gallery/template-1',
    heading: 'Gallery protocol',
  },
  { path: '/templates', url: '/templates', heading: 'Templates' },

  // App, team level
  { path: '/team/$teamId', url: '/team/team-a', heading: 'Studies' },
  {
    path: '/team/$teamId/members',
    url: '/team/team-a/members',
    heading: 'Members',
  },
  { path: '/team/$teamId/roles', url: '/team/team-a/roles', heading: 'Roles' },
  {
    path: '/team/$teamId/activity',
    url: '/team/team-a/activity',
    heading: 'Team activity',
  },
  {
    path: '/team/$teamId/billing',
    url: '/team/team-a/billing',
    heading: 'Billing',
  },
  {
    path: '/team/$teamId/settings',
    url: '/team/team-a/settings',
    heading: 'Team settings',
  },
  {
    path: '/team/$teamId/settings/api',
    url: '/team/team-a/settings/api',
    heading: 'API access',
  },
  {
    path: '/team/$teamId/settings/webhooks',
    url: '/team/team-a/settings/webhooks',
    heading: 'Webhooks',
  },
  {
    path: '/team/$teamId/settings/messaging',
    url: '/team/team-a/settings/messaging',
    heading: 'Messaging',
  },

  // App, study level
  { path: '/study/$studyId', url: '/study/study-1', heading: 'Overview' },
  {
    // The editor names itself with the protocol it has open, which is the one
    // thing on this screen a researcher needs to be sure of.
    path: '/study/$studyId/editor',
    url: '/study/study-1/editor',
    heading: 'Shell proof',
  },
  {
    path: '/study/$studyId/editor/codebook',
    url: '/study/study-1/editor/codebook',
    heading: 'Codebook',
  },
  {
    path: '/study/$studyId/editor/stages/$stageId',
    url: '/study/study-1/editor/stages/stage-1',
    heading: 'Stage',
  },
  {
    path: '/study/$studyId/editor/assets',
    url: '/study/study-1/editor/assets',
    heading: 'Assets',
  },
  {
    path: '/study/$studyId/editor/translations',
    url: '/study/study-1/editor/translations',
    heading: 'Translations',
  },
  {
    path: '/study/$studyId/editor/preview',
    url: '/study/study-1/editor/preview',
    heading: 'Preview',
  },
  {
    path: '/study/$studyId/versions',
    url: '/study/study-1/versions',
    heading: 'Versions',
  },
  {
    path: '/study/$studyId/participants',
    url: '/study/study-1/participants',
    heading: 'Participants',
  },
  {
    path: '/study/$studyId/waves',
    url: '/study/study-1/waves',
    heading: 'Waves',
  },
  {
    path: '/study/$studyId/sessions',
    url: '/study/study-1/sessions',
    heading: 'Sessions',
  },
  {
    path: '/study/$studyId/sessions/$sessionId',
    url: '/study/study-1/sessions/session-1',
    heading: 'Session',
  },
  {
    path: '/study/$studyId/schedule',
    url: '/study/study-1/schedule',
    heading: 'Schedule',
  },
  {
    path: '/study/$studyId/recruitment',
    url: '/study/study-1/recruitment',
    heading: 'Recruitment',
  },
  {
    path: '/study/$studyId/settings',
    url: '/study/study-1/settings',
    heading: 'Study settings',
  },
  {
    path: '/study/$studyId/export',
    url: '/study/study-1/export',
    heading: 'Export',
  },
];

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [url] }),
    queryClient,
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** An index route's address and its parent's are the same URL. */
function trimIndexSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

/**
 * The route pattern `href` resolves to, or `undefined` when it resolves to no
 * route at all.
 *
 * A URL that matches nothing still produces matches — the branch it got as far
 * as — so resolving is not "did anything match?" but "did the whole URL
 * match?": `/team/t1/nope` stops at the team layout, whose matched pathname is
 * `/team/t1`. That is the difference between a navigation entry that renders a
 * screen and one that renders the not-found state, and it is what makes this
 * able to fail: an entry pointing at an unregistered path answers `undefined`.
 */
function registeredPathFor(
  router: ReturnType<typeof createAppRouter>,
  href: string,
): string | undefined {
  const leaf = router.matchRoutes(href, {}).at(-1);
  if (leaf === undefined) return undefined;
  if (trimIndexSlash(leaf.pathname) !== trimIndexSlash(href)) return undefined;
  const path = trimIndexSlash(leaf.fullPath);
  return path in router.routesByPath ? path : undefined;
}

/**
 * Where every link in the rendered CHROME goes, as route patterns, in document
 * order: the header first, then the area's navigation region.
 *
 * A `<nav>` inside `<main>` is a screen's own, not the shell's — the editor
 * has one — and it is excluded here for the same reason the sidebar count
 * below excludes it: this asks where the shell can send a researcher.
 *
 * The frame's skip link is excluded too — it addresses a fragment of the
 * current document rather than a route, which is exactly why `href` starting
 * with `#` is the test for it.
 */
function chromeDestinations(
  router: ReturnType<typeof createAppRouter>,
): (string | undefined)[] {
  return [...document.querySelectorAll('header, nav')]
    .filter((region) => region.closest('main') === null)
    .flatMap((region) => [...region.querySelectorAll('a[href]')])
    .map((link) => link.getAttribute('href') ?? '')
    .filter((href) => !href.startsWith('#'))
    .map((href) => registeredPathFor(router, href));
}

/**
 * The names of the area sidebars on screen — the `<nav>`s the shell renders
 * beside `<main>`, never one a screen renders inside it. §11.1's rule is about
 * the sidebar: at most one, drawn from {Study, Team, Account, Protocol
 * outline}.
 */
function sidebarNames(): (string | null)[] {
  return [...document.querySelectorAll('nav')]
    .filter((region) => region.closest('main') === null)
    .map((region) => region.getAttribute('aria-label'));
}

/**
 * What the shell is currently telling a screen reader, ignoring the half of
 * `RouteFocus`'s live-region pair that is deliberately empty.
 *
 * `queryAllByRole` rather than `getAllByRole`: with nothing mounted to
 * announce through there are no regions at all, and that is a result to
 * assert on rather than an error to throw.
 */
function announcements(): string[] {
  return screen
    .queryAllByRole('status')
    .map((region) => region.textContent?.trim() ?? '')
    .filter((text) => text !== '');
}

/** The same, for the links inside an open dropdown menu. */
function menuDestinations(
  router: ReturnType<typeof createAppRouter>,
): (string | undefined)[] {
  return [...document.querySelectorAll('[role="menu"] a[href]')]
    .map((link) => link.getAttribute('href') ?? '')
    .map((href) => registeredPathFor(router, href));
}

// The wordmark goes to the researcher's landing destination (§5.5, §6.4),
// which for the one-team fixture below is that team's studies.
const HEADER = ['/team/$teamId', '/gallery', '/templates'];

beforeEach(() => {
  fixtures.deployment = { mode: 'managed', billing: false };
  fixtures.teams = [fixtures.TEAM];
  fixtures.getSession.mockResolvedValue({
    data: { user: {}, session: { activeOrganizationId: fixtures.TEAM.id } },
    error: null,
  });
});

/**
 * `/` is one route that answers as two products (§10.4), and §6.4's landing
 * resolution is the half of it that decides where a session goes. Both are
 * asserted here rather than at the screens, because both are guards.
 */
describe('the root, by topology', () => {
  it('renders marketing on the managed service, signed in', async () => {
    const router = renderAt('/');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Network Canvas Studio',
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('sends a self-hosted researcher to their team', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    const router = renderAt('/');

    // A self-hoster's origin root is the URL they hand their researchers, so
    // it resolves rather than 404ing or showing them marketing.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-a'),
    );
  });

  it('sends a self-hosted researcher with no team to /no-team', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    fixtures.teams = [];
    const router = renderAt('/');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/no-team'),
    );
  });

  it('sends a self-hosted visitor with no session to sign in', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    fixtures.getSession.mockResolvedValue({ data: null, error: null });
    const router = renderAt('/');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
  });

  it('resolves several teams to the most recently active one', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    fixtures.teams = [
      { id: 'team-z', name: 'Zeta research team' },
      fixtures.TEAM,
    ];
    const router = renderAt('/');

    // The session names team-a, which is not the first of the list: §6.4's
    // case 3 is "the most recently active team", not "the first one".
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-a'),
    );
  });
});

describe('every destination in §5.2', () => {
  it('is a route the router registers, and no route is untested', () => {
    // Both directions. A destination missing from the tree fails the render
    // tests below; a route in the tree that nobody thought to render would
    // otherwise pass unnoticed, and this is what notices it.
    // No exceptions in either direction: §5.4's migration is done, so there is
    // no route the table does not name and no table entry without a route.
    const registered = Object.keys(createAppRouter().routesByPath).toSorted();

    expect(DESTINATIONS.map(({ path }) => path).toSorted()).toEqual(registered);
  });

  it('is classified for both topologies, with nothing left over', () => {
    // §10.4's classification is exhaustive over the route table, and it can
    // be exhaustive now that no route answers at an address the design does
    // not give it. A route added later without a topology decision fails
    // here rather than silently becoming "served by both".
    expect(
      unclassifiedSurfacePaths(Object.keys(createAppRouter().routesByPath)),
    ).toEqual([]);
  });

  it.each(DESTINATIONS)(
    'renders $path with exactly one main landmark',
    async ({ url, heading, signedOut, teamless }) => {
      if (signedOut) {
        fixtures.getSession.mockResolvedValue({ data: null, error: null });
      }
      // §6.4's fourth case, which `/no-team` is the screen for: its guard
      // sends a researcher who does belong to a team to that team, so the
      // only session this URL renders for is one that belongs to none.
      if (teamless) fixtures.teams = [];

      const router = renderAt(url);

      expect(
        await screen.findByRole('heading', { level: 1, name: heading }),
      ).toBeInTheDocument();
      // The URL renders itself, rather than a redirect to somewhere that
      // happens to have the same heading.
      expect(router.state.location.pathname).toBe(url);

      // One `<main>`, and the one the frame's skip link targets (§7.1). Two is
      // what an area layout nested inside another produces, and the skip link
      // resolves to the wrong one without either being visibly broken.
      const mains = screen.getAllByRole('main');
      expect(mains).toHaveLength(1);
      expect(mains[0]).toHaveAttribute('id', 'main-content');
    },
  );
});

describe('navigation', () => {
  it('reaches only registered routes from the team area', async () => {
    const router = renderAt('/team/team-a');
    await screen.findByRole('link', { name: 'Studies' });

    expect(chromeDestinations(router)).toEqual([
      ...HEADER,
      '/team/$teamId',
      '/team/$teamId/members',
      '/team/$teamId/roles',
      '/team/$teamId/activity',
      '/team/$teamId/billing',
      '/team/$teamId/settings',
    ]);
  });

  it('reaches only registered routes from the study area', async () => {
    const router = renderAt('/study/study-1');
    await screen.findByRole('link', { name: 'Overview' });

    expect(chromeDestinations(router)).toEqual([
      ...HEADER,
      '/study/$studyId',
      '/study/$studyId/editor',
      '/study/$studyId/versions',
      '/study/$studyId/participants',
      '/study/$studyId/waves',
      '/study/$studyId/sessions',
      '/study/$studyId/schedule',
      '/study/$studyId/recruitment',
      '/study/$studyId/export',
      '/study/$studyId/settings',
    ]);
  });

  it('reaches only registered routes from the protocol outline', async () => {
    const router = renderAt('/study/study-1/editor');
    await screen.findByRole('link', { name: 'Codebook' });

    expect(chromeDestinations(router)).toEqual([
      ...HEADER,
      '/study/$studyId',
      '/study/$studyId/editor/codebook',
      '/study/$studyId/editor',
      '/study/$studyId/editor/assets',
      '/study/$studyId/editor/translations',
      '/study/$studyId/editor/preview',
    ]);
  });

  it('reaches only registered routes from the account area', async () => {
    const router = renderAt('/account');
    await screen.findByRole('link', { name: 'Profile' });

    expect(chromeDestinations(router)).toEqual([
      ...HEADER,
      '/account',
      '/account/language',
      '/account/sign-in-methods',
      '/account/tokens',
    ]);
  });

  it('replaces the study sidebar with the outline rather than adding to it', async () => {
    renderAt('/study/study-1/editor');
    await screen.findByRole('link', { name: 'Codebook' });

    // The editor's area and the study's are siblings under a component-less
    // study route (§5.3). Nested instead, both would render, and this is the
    // assertion that says which happened: one sidebar, and it is the
    // outline's rather than the study's.
    expect(sidebarNames()).toEqual(['Protocol outline']);
  });

  it('reaches only registered routes from the account menu', async () => {
    const router = renderAt('/team/team-a');
    fireEvent.click(await screen.findByRole('button', { name: 'Account' }));
    await screen.findByRole('menuitem', { name: 'Profile' });

    expect(menuDestinations(router)).toEqual(['/account', '/account/language']);
  });

  it('reaches only registered routes from the team switcher', async () => {
    const router = renderAt('/team/team-a');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Current team Alpha research team',
      }),
    );
    await screen.findByRole('menuitem', { name: 'Team administration' });

    // The teams themselves are `menuitemradio`s that navigate rather than
    // links (§6.5), so the one link in this menu is the command beneath them.
    expect(menuDestinations(router)).toEqual(['/team/$teamId/settings']);
  });

  it('names the study and reaches its team from the study chip', async () => {
    const router = renderAt('/study/study-1');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Current study study-1' }),
    );
    await screen.findByRole('menuitem', {
      name: 'All studies in this team',
    });

    expect(menuDestinations(router)).toEqual(['/team/$teamId']);
  });
});

/**
 * §11.2's route-change contract, end to end.
 *
 * Every screen in the tree spreads `routeFocusTargetProps` on its `<h1>`, and
 * that alone does nothing: the props only mark a landing point, and something
 * has to be mounted above the router to use them. Asserting that a heading
 * carries the attribute would pass with nothing mounted at all, which is
 * exactly the state this file was written in — so the assertion is the
 * researcher's experience of a real navigation instead: where the caret ends
 * up, and what a screen reader is told.
 */
describe('a route change', () => {
  it('lands focus on the destination heading and announces it', async () => {
    renderAt('/team/team-a');
    const roles = await screen.findByRole('link', { name: 'Roles' });
    // Arriving is not a change: the boot location announces nothing.
    expect(announcements()).toEqual([]);

    // Activated without focusing it first, which is the case the contract is
    // about: the control the researcher used is gone and focus has dropped to
    // `<body>`, so the next Tab would restart at the top of the document.
    fireEvent.click(roles);

    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Roles',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    // The DESTINATION, not the screen just left: a live region still holding
    // "Studies" tells a screen reader the researcher is on a page they have
    // already left.
    expect(announcements()).toEqual(['Roles']);
  });
});

describe('a destination this deployment does not have', () => {
  it('renders billing as an explained row, and no link, when self-hosted', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    renderAt('/team/team-a');

    // The reason arrives with the status answer, so waiting for it is also
    // waiting for the row to have made up its mind.
    expect(
      await screen.findByText('Managed deployments only'),
    ).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    // A destination this instance does not have is shown and explained, never
    // linked: the researcher can see it exists as a Studio feature and that it
    // is not here, and cannot be sent to a URL this deployment 404s.
    expect(screen.queryByRole('link', { name: /Billing/ })).toBeNull();
  });

  it('links billing on the managed service', async () => {
    renderAt('/team/team-a');

    expect(
      await screen.findByRole('link', { name: 'Billing' }),
    ).toHaveAttribute('href', '/team/team-a/billing');
    expect(screen.queryByText('Managed deployments only')).toBeNull();
  });
});
