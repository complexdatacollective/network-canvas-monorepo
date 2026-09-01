// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type AnyRoute,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../../router.tsx';
import AppLayout from '../AppLayout.tsx';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  useListOrganizations: vi.fn(),
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

/** The path a route declares, or undefined for a pathless layout route. */
function declaredPath(route: AnyRoute): string | undefined {
  const { options } = route;
  if (!('path' in options)) return undefined;
  const path: unknown = options.path;
  return typeof path === 'string' ? path : undefined;
}

/**
 * Every path-carrying route in the tree, mapped to the shell branch it sits
 * on. This is the assertion the design's §5.3 tree is really making: a route's
 * chrome is decided by where it sits, so the branch a path resolves under is
 * the thing that must not drift.
 */
function shellByPath(
  router: ReturnType<typeof buildRouter>,
): Record<string, string> {
  const shells: Record<string, string> = {};
  for (const branch of branchesOf(router)) {
    for (const route of descendantsOf(branch)) {
      const path = declaredPath(route);
      if (path === undefined) continue;
      const claimed = shells[path];
      // Two branches claiming one path is the one drift a plain record cannot
      // express: the second write would win and the map would read as correct
      // while one of the two routes is unreachable. Marketing's `/` landing on
      // the site branch while `/` is still the app branch's home is exactly
      // that collision, so name it in the value rather than lose it.
      shells[path] =
        claimed === undefined
          ? branchId(branch)
          : `${claimed} + ${branchId(branch)} (both claim this path)`;
    }
  }
  return shells;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { user: {} }, error: null });
  mocks.useListOrganizations.mockReturnValue({
    data: [],
    isPending: false,
    error: null,
  });
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

  it('puts every shipped route on the branch that owns its chrome', () => {
    expect(shellByPath(buildRouter())).toEqual({
      '/sign-in': 'focused',
      '/invitations/$invitationId': 'focused',
      '/': 'app',
      '/teams/$teamId/activity': 'app',
      '/teams/$teamId/protocols/$protocolId/drafts/$draftId': 'app',
    });
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

    // A route added to the site, focused or participant branch inherits no
    // component and no guard from its branch — which is what makes the
    // participant branch safe for an interview that must own the viewport,
    // and the focused branch usable while signed out.
    expect(chrome).toEqual({
      site: { component: undefined, guarded: false },
      focused: { component: undefined, guarded: false },
      participant: { component: undefined, guarded: false },
      app: { component: AppLayout, guarded: true },
    });
  });
});

describe('rendered chrome', () => {
  it('renders the app header inside the app branch', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Studio' })).toBeInTheDocument();
  });

  it('renders no app chrome on a focused route', async () => {
    // Signed out, so the sign-in guard leaves the visitor on the page.
    mocks.getSession.mockResolvedValue({ data: null, error: null });
    renderAt('/sign-in');
    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
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
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Studio' }),
    ).not.toBeInTheDocument();
  });
});
