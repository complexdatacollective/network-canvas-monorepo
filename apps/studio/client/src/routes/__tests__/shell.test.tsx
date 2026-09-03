// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type AnyRoute,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../../router.tsx';
import SiteLayout from '../../shell/SiteLayout.tsx';
import AppLayout from '../AppLayout.tsx';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  useListOrganizations: vi.fn(),
  useActiveOrganization: vi.fn(),
  useActiveMember: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: mocks.getSession,
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Researcher', email: 'researcher@example.com' } },
      isPending: false,
      error: null,
    }),
    useListOrganizations: mocks.useListOrganizations,
    useActiveOrganization: mocks.useActiveOrganization,
    useActiveMember: mocks.useActiveMember,
    organization: { setActive: mocks.setActive },
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: vi.fn().mockResolvedValue({
          name: 'Network Canvas Studio',
          version: '0.1.0',
          auth: { enabled: true, magicLink: true, socialProviders: [] },
          deployment: { mode: 'managed', billing: false },
        }),
      }),
    },
    protocols: {
      list: {
        queryOptions: () => ({ queryKey: ['protocols'], queryFn: () => [] }),
        key: () => ['protocols'],
      },
      create: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      draft: {
        queryOptions: () => ({ queryKey: ['draft'], queryFn: vi.fn() }),
        key: () => ['draft'],
      },
    },
  },
  rpcClient: { protocols: {}, team: {} },
}));

const INVITATION_ID = '00000000-0000-4000-8000-000000000123';

function buildRouter() {
  return createAppRouter(undefined, new QueryClient());
}

function renderAt(path: string) {
  const queryClient = new QueryClient();
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
    queryClient,
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function childrenOf(route: AnyRoute): AnyRoute[] {
  const { children } = route;
  return Array.isArray(children) ? (children as AnyRoute[]) : [];
}

/** Every route below `route`, itself excluded. */
function descendantsOf(route: AnyRoute): AnyRoute[] {
  return childrenOf(route).flatMap((child) => [child, ...descendantsOf(child)]);
}

function branchesOf(router: ReturnType<typeof buildRouter>): AnyRoute[] {
  return childrenOf(router.routeTree);
}

function branchId(route: AnyRoute): string {
  const { options } = route;
  if (!('id' in options)) return '(no id)';
  const id: unknown = options.id;
  return typeof id === 'string' ? id : '(no id)';
}

/**
 * The URL a route answers at. An index route's own `fullPath` carries a
 * trailing slash that its parent's does not, and the two are the same URL:
 * `/team/$teamId/` is what `/team/$teamId` renders.
 */
function addressOf(route: AnyRoute): string {
  const path: string = route.fullPath;
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

/** Every route with no children — the ones that actually render a screen. */
function leavesOf(route: AnyRoute): AnyRoute[] {
  return descendantsOf(route).filter((child) => childrenOf(child).length === 0);
}

/**
 * The addresses each shell branch answers at. This is the assertion §5.3's
 * tree is really making: a route's chrome is decided by where it sits, so the
 * branch a path resolves under is the thing that must not drift. Sorted, so
 * the expectation pins the set of destinations rather than the order they
 * happen to be declared in.
 */
function pathsByShell(
  router: ReturnType<typeof buildRouter>,
): Record<string, string[]> {
  return Object.fromEntries(
    branchesOf(router).map((branch) => [
      branchId(branch),
      leavesOf(branch).map(addressOf).toSorted(),
    ]),
  );
}

/**
 * The layout routes that declare an area — the `<nav>` and the
 * `<main id="main-content">` (§5.3). Every route under the app layout has to
 * sit under exactly one of them, or be allowlisted below. Identified by the
 * router's own derived ids, because an area layout that carries a path
 * (`/account`, `/team/$teamId`) has no `id` of its own to read.
 */
const AREA_LAYOUT_IDS = [
  '/app/account',
  '/app/team/$teamId',
  '/app/study/$studyId/study-area',
  '/app/study/$studyId/editor',
];

/**
 * App routes allowed to sit under no area layout at all, because their area
 * declares no sidebar and they render `<main>` themselves (§5.3, §11.1). The
 * allowlist is the design decision made visible: adding to it is a review-time
 * choice, where forgetting an area layout is a test failure.
 */
const SIDEBAR_LESS_PATHS = ['/gallery', '/gallery/$templateId', '/templates'];

function areaLayoutsAbove(route: AnyRoute): string[] {
  const areas: string[] = [];
  let current: AnyRoute | undefined = route.parentRoute as AnyRoute | undefined;
  while (current) {
    const id: string = current.id;
    if (AREA_LAYOUT_IDS.includes(id)) areas.push(id);
    current = current.parentRoute as AnyRoute | undefined;
  }
  return areas;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { user: {} }, error: null });
  mocks.useListOrganizations.mockReturnValue({
    data: [],
    isPending: false,
    error: null,
  });
  mocks.useActiveOrganization.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
  mocks.useActiveMember.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
  mocks.setActive.mockResolvedValue({ data: null, error: null });
});

describe('shell branches', () => {
  it('hangs the four shells off the root as siblings', () => {
    expect(branchesOf(buildRouter()).map(branchId)).toEqual([
      'site',
      'focused',
      'participant',
      'app',
    ]);
  });

  it('puts every route on the branch that owns its chrome', () => {
    // The whole of §5.2's route table, by the shell each destination is
    // rendered in — no divergences and no legacy addresses: §5.4's migration
    // has moved the team screen, the audit trail and the editor onto the
    // addresses the design gives them, which is what frees `/` for marketing.
    expect(pathsByShell(buildRouter())).toEqual({
      site: ['/', '/legal/$document', '/pricing'],
      focused: [
        '/invitations/$invitationId',
        '/no-team',
        '/setup',
        '/sign-in',
        '/sign-up',
        '/sign-up/checkout',
        '/sign-up/complete',
        '/sign-up/plan',
        '/sign-up/team',
      ],
      participant: [
        '/enter/$token',
        '/enter/$token/complete',
        '/enter/$token/consent',
        '/enter/$token/interview',
      ],
      app: [
        '/account',
        '/account/language',
        '/account/sign-in-methods',
        '/account/tokens',
        '/gallery',
        '/gallery/$templateId',
        '/study/$studyId',
        '/study/$studyId/editor',
        '/study/$studyId/editor/assets',
        '/study/$studyId/editor/codebook',
        '/study/$studyId/editor/preview',
        '/study/$studyId/editor/stages/$stageId',
        '/study/$studyId/editor/translations',
        '/study/$studyId/export',
        '/study/$studyId/participants',
        '/study/$studyId/recruitment',
        '/study/$studyId/schedule',
        '/study/$studyId/sessions',
        '/study/$studyId/sessions/$sessionId',
        '/study/$studyId/settings',
        '/study/$studyId/versions',
        '/study/$studyId/waves',
        '/team/$teamId',
        '/team/$teamId/activity',
        '/team/$teamId/billing',
        '/team/$teamId/members',
        '/team/$teamId/roles',
        '/team/$teamId/settings',
        '/team/$teamId/settings/api',
        '/team/$teamId/settings/messaging',
        '/team/$teamId/settings/webhooks',
        '/templates',
      ],
    });
  });

  it('gives every app route exactly one area layout', () => {
    const router = buildRouter();
    const app = branchesOf(router).find((branch) => branchId(branch) === 'app');

    // The area layout is what renders the `<nav>` and the
    // `<main id="main-content">` the frame's skip link targets. A route
    // parented straight onto the app layout would render neither, and nothing
    // else in the tree would notice — so the chain is asserted here, over the
    // whole branch, rather than left to the route tests that happen to render
    // one screen each.
    const misplaced = leavesOf(app as AnyRoute)
      .map((leaf) => ({ path: addressOf(leaf), areas: areaLayoutsAbove(leaf) }))
      .filter(({ path, areas }) =>
        SIDEBAR_LESS_PATHS.includes(path)
          ? areas.length !== 0
          : areas.length !== 1,
      );

    expect(misplaced).toEqual([]);
  });

  it('allowlists exactly the three sidebar-less app routes', () => {
    // The allowlist above is only a decision if it is also complete: these
    // three are the routes §5.3 gives no navigation region, and a fourth
    // added to that list is a change to the design, not to a test fixture.
    expect(SIDEBAR_LESS_PATHS).toEqual([
      '/gallery',
      '/gallery/$templateId',
      '/templates',
    ]);
  });

  it('hands preload freshness to the query cache rather than the router', () => {
    const { options } = buildRouter();

    // Preloading on intent is only safe because every guard and loader is a
    // pure read (§6.2). `defaultPreloadStaleTime` must be 0 explicitly:
    // omitting it does not disable the router's own freshness window, it
    // restores TanStack Router's 30-second default, which would serve a
    // preloaded match from route-level state that TanStack Query had already
    // invalidated — the session among it.
    expect(options.defaultPreload).toBe('intent');
    expect(options.defaultPreloadStaleTime).toBe(0);
  });

  it('declares chrome and the session guard on the app branch alone', () => {
    const branches = branchesOf(buildRouter());
    const chrome = Object.fromEntries(
      branches.map((branch) => [
        branchId(branch),
        {
          component: branch.options.component,
          guarded: branch.options.beforeLoad !== undefined,
        },
      ]),
    );

    // The site branch owns the Network Canvas header and footer (§10.1) and
    // nothing else does. A route added to the focused or participant branch
    // inherits no component and no guard at all — which is what makes the
    // participant branch safe for an interview that must own the viewport,
    // and the focused branch usable while signed out. No branch but the app's
    // carries the session guard: a visitor to marketing has no session.
    expect(chrome).toEqual({
      site: { component: SiteLayout, guarded: false },
      focused: { component: undefined, guarded: false },
      participant: { component: undefined, guarded: false },
      app: { component: AppLayout, guarded: true },
    });
  });
});

describe('rendered chrome', () => {
  it('renders the app header inside the app branch', async () => {
    renderAt('/team/team-a');
    // Sign out lives in the account menu now (§5.5), so the menu's trigger is
    // what the header renders unconditionally.
    expect(
      await screen.findByRole('button', { name: 'Account' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Studio' })).toBeInTheDocument();
  });

  it('renders the site header, and no app chrome, on marketing', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Network Canvas Studio',
      }),
    ).toBeInTheDocument();
    // The site shell, not the app shell: no account menu and no team chip.
    //
    // The header's Studio entry does read the session, and this page renders
    // without waiting on it — the heading above arrived while it was still
    // out. What the site branch must not have is a session GUARD, which the
    // branch test above asserts directly.
    expect(
      screen.queryByRole('button', { name: 'Account' }),
    ).not.toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(
      within(main).getByRole('link', { name: 'Create an account' }),
    ).toHaveAttribute('href', '/sign-up');
    expect(within(main).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in',
    );
  });

  it('renders no app chrome on a focused route', async () => {
    // Signed out, so the sign-in guard leaves the visitor on the page.
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    renderAt('/sign-in');
    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Account' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Studio' }),
    ).not.toBeInTheDocument();
  });

  it('renders no app chrome on the invitation route', async () => {
    renderAt(`/invitations/${INVITATION_ID}`);
    expect(
      await screen.findByRole('heading', { name: 'Accept team invitation' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Account' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Studio' }),
    ).not.toBeInTheDocument();
  });
});
