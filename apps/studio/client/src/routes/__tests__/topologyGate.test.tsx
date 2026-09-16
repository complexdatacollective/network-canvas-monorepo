// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MANAGED_ONLY_PATHS,
  SELF_HOST_ONLY_PATHS,
  type DeploymentMode,
} from '@codaco/studio-contract/surfaces';

import { createAppRouter } from '../../router.tsx';

/**
 * The topology gate (§10.4), at the only layer that still has one.
 *
 * The server used to refuse a gated page path with a real 404, reading the
 * same classification. Since #1909 nginx serves every page path and the server
 * sees none, so `topologyGuard` in `lib/deployment.ts` is the whole
 * enforcement — and "the client guards its route tree" stopped being a second
 * opinion and became the only one.
 *
 * Both directions are asserted, and over the CLASSIFICATION rather than a
 * hand-written list, so a path added to either list without a guard on its
 * route fails here. That is the oracle that can fail: dropping `beforeLoad`
 * from any one of these routes leaves it rendering its screen on the topology
 * that must not have it.
 */

const fixtures = vi.hoisted(() => ({
  TEAM: { id: 'team-a', name: 'Alpha research team', slug: 'alpha' },
  deployment: { mode: 'managed' as DeploymentMode, billing: false },
  getSession: vi.fn(),
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
      list: vi.fn(() =>
        Promise.resolve({ data: [fixtures.TEAM], error: null }),
      ),
    },
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    me: {
      queryOptions: () => ({
        queryKey: ['me'],
        queryFn: () => ({
          userId: 'user-1',
          email: 'researcher@example.org',
          emailVerified: true,
          name: 'Researcher',
          locale: null,
          teams: [{ teamId: 'team-a', role: 'owner' }],
        }),
      }),
      key: () => ['me'],
    },
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: () => ({
          name: 'Network Canvas Studio',
          version: '0.1.0',
          auth: {
            enabled: true,
            magicLink: true,
            emailAndPassword: true,
            socialProviders: [],
          },
          // Open, so a served `/setup` renders its form rather than its own
          // "already set up" not-found; what these cases decide is the
          // topology, and this keeps the second guard out of the way.
          setup: { required: true },
          // Read at call time, so each case picks the topology before it
          // renders.
          deployment: fixtures.deployment,
        }),
      }),
    },
    studies: {
      list: {
        queryOptions: () => ({ queryKey: ['studies'], queryFn: () => [] }),
        key: () => ['studies'],
      },
      // The app shell's entity lockup reads this on every app route, and
      // `/team/$teamId/billing` is one. No study on screen, so it answers
      // null: the lockup renders no study segment, and this file asks only
      // what the screen calls itself.
      get: {
        queryOptions: () => ({ queryKey: ['study'], queryFn: () => null }),
        key: () => ['study'],
      },
      create: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
    },
  },
  rpcClient: { protocols: {}, team: {} },
}));

/** A concrete URL for a route path: `/legal/$document` ⇒ `/legal/sample`. */
function requestPath(routePath: string): string {
  return routePath.replaceAll(/\$[A-Za-z0-9_]+/g, 'team-a');
}

/** The `<h1>` each gated route's own screen names itself with, when served. */
const HEADINGS: Record<string, string> = {
  '/pricing': 'Pricing',
  '/legal/$document': 'Legal',
  '/sign-up': 'Create an account',
  '/sign-up/team': 'Name your team',
  '/sign-up/plan': 'Choose a plan',
  '/sign-up/checkout': 'Checkout',
  '/sign-up/complete': 'Account ready',
  '/team/$teamId/billing': 'Billing',
  '/setup': 'First-run setup',
};

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

/** What the screen at `url` calls itself, once it has settled. */
async function headingAt(url: string): Promise<string> {
  const router = renderAt(url);
  const title = await screen.findByRole('heading', { level: 1 });
  // The URL renders itself rather than bouncing somewhere that happens to
  // have the same heading: a gate that redirected would pass on the text
  // alone.
  expect(router.state.location.pathname).toBe(url);
  return title.textContent ?? '';
}

const NOT_AVAILABLE = 'Page not available';

beforeEach(() => {
  fixtures.deployment = { mode: 'managed', billing: false };
  fixtures.getSession.mockResolvedValue({
    data: { user: {}, session: { activeOrganizationId: fixtures.TEAM.id } },
    error: null,
  });
});

describe('a self-hosted instance', () => {
  beforeEach(() => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
  });

  it.each([...MANAGED_ONLY_PATHS])('refuses %s', async (routePath) => {
    expect(await headingAt(requestPath(routePath))).toBe(NOT_AVAILABLE);
  });

  it.each([...SELF_HOST_ONLY_PATHS])('serves %s', async (routePath) => {
    expect(await headingAt(requestPath(routePath))).toBe(HEADINGS[routePath]);
  });
});

describe('the managed service', () => {
  it.each([...SELF_HOST_ONLY_PATHS])('refuses %s', async (routePath) => {
    // The higher-stakes direction: first-run configuration of the whole
    // instance, reachable by a tenant of the managed service.
    expect(await headingAt(requestPath(routePath))).toBe(NOT_AVAILABLE);
  });

  it.each([...MANAGED_ONLY_PATHS])('serves %s', async (routePath) => {
    // The other half of the guard, and what stops it being satisfied by
    // refusing everything: these are exactly the screens this topology has.
    expect(await headingAt(requestPath(routePath))).toBe(HEADINGS[routePath]);
  });
});

describe('the not-found screen', () => {
  it('answers an address no route matches at all', async () => {
    // The gate is not its only caller. Before the root route carried a
    // `notFoundComponent`, an unrouted URL rendered TanStack's own unstyled
    // text with no heading and nothing for focus to land on.
    expect(await headingAt('/no-such-page')).toBe(NOT_AVAILABLE);
  });

  it('lands focus on its heading, like every other arrival', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    renderAt('/pricing');
    const title = await screen.findByRole('heading', { level: 1 });
    // §7.2's contract. A refusal is the arrival where announcing nothing is
    // worst: the researcher is told the page changed and not what to.
    expect(title).toHaveAttribute('data-route-focus-target');
  });

  it('renders exactly one main landmark', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    renderAt('/pricing');
    await screen.findByRole('heading', { level: 1, name: NOT_AVAILABLE });

    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
  });
});
