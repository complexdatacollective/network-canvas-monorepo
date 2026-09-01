// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../../router.tsx';

const fixtures = vi.hoisted(() => ({
  TEAM_A: { id: 'team-a', name: 'Alpha research team', slug: 'alpha' },
  TEAM_B: { id: 'team-b', name: 'Beta research team', slug: 'beta' },
  setActive: vi.fn(),
  useActiveMember: vi.fn(),
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn(),
    useListOrganizations: vi.fn().mockReturnValue({
      data: [fixtures.TEAM_A, fixtures.TEAM_B],
      isPending: false,
      error: null,
    }),
    useActiveOrganization: vi.fn().mockReturnValue({
      data: { ...fixtures.TEAM_A, members: [], invitations: [] },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    useActiveMember: fixtures.useActiveMember,
    organization: { setActive: fixtures.setActive },
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

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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

beforeEach(() => {
  fixtures.setActive.mockReset();
  fixtures.setActive.mockResolvedValue({ data: {}, error: null });
  fixtures.useActiveMember.mockReturnValue({
    data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe('composed app shell', () => {
  it('renders one main landmark and one named navigation region', async () => {
    renderAt('/');
    await screen.findByRole('button', { name: 'Account' });

    // `AppFrame` renders neither landmark and every route below it has
    // stopped declaring its own, so exactly one of each survives — which is
    // what makes the skip link's target unambiguous (§5.3, §7.1).
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');

    const regions = screen.getAllByRole('navigation');
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveAccessibleName('Team');
  });

  it('moves focus to the area main when the skip link is used', async () => {
    renderAt('/');
    const skipLink = await screen.findByRole('link', {
      name: 'Skip to main content',
    });

    fireEvent.click(skipLink);

    // The link and the landmark are rendered by different components, so this
    // is the pair asserted at runtime rather than either one trusted alone. A
    // `<main>` is not focusable by itself: staying on the link would leave the
    // next Tab restarting at the top of the document.
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('marks only the committed destination as the current page', async () => {
    const router = renderAt('/');
    const studies = await screen.findByRole('link', { name: 'Studies' });
    expect(studies).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Activity' })).not.toHaveAttribute(
      'aria-current',
    );

    await act(() =>
      router.navigate({
        to: '/teams/$teamId/activity',
        params: { teamId: 'team-a' },
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    expect(screen.getByRole('link', { name: 'Studies' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps one main landmark on a team-scoped route', async () => {
    renderAt('/teams/team-a/activity');
    await screen.findByRole('heading', { name: 'Team activity' });

    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });

  it('omits the Activity destination from a collaborator sidebar', async () => {
    fixtures.useActiveMember.mockReturnValue({
      data: { id: 'member-2', organizationId: 'team-a', role: 'member' },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });
    renderAt('/');
    await screen.findByRole('link', { name: 'Studies' });

    expect(screen.queryByRole('link', { name: 'Activity' })).toBeNull();
  });
});

describe('header team switcher', () => {
  it('names the team the researcher is acting in', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('button', {
        name: 'Current team Alpha research team',
      }),
    ).toBeInTheDocument();
  });

  it('switches the active team without navigating away', async () => {
    const router = renderAt('/');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Current team Alpha research team',
      }),
    );
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Beta research team' }),
    );

    await waitFor(() =>
      expect(fixtures.setActive).toHaveBeenCalledWith({
        organizationId: 'team-b',
      }),
    );
    // No destination exists for a team yet, so the switch is the whole of it.
    // Navigating to `/` in the meantime would eject a researcher from the
    // editor as a side effect of naming a different team.
    expect(router.state.location.pathname).toBe('/');
  });

  it('reports a switch that does not complete', async () => {
    fixtures.setActive.mockResolvedValue({
      data: null,
      error: { status: 500 },
    });
    renderAt('/');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Current team Alpha research team',
      }),
    );
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Beta research team' }),
    );

    expect(
      await screen.findByText('Studio could not switch teams. Try again.'),
    ).toBeInTheDocument();
  });
});
