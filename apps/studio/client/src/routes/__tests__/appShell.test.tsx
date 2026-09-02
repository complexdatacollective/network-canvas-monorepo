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
    organization: {
      setActive: fixtures.setActive,
      list: vi.fn().mockResolvedValue({
        data: [fixtures.TEAM_A, fixtures.TEAM_B],
        error: null,
      }),
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
    renderAt('/team/team-a');
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
    renderAt('/team/team-a');
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
    const router = renderAt('/team/team-a');
    const studies = await screen.findByRole('link', { name: 'Studies' });
    expect(studies).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Activity' })).not.toHaveAttribute(
      'aria-current',
    );

    await act(() =>
      router.navigate({
        to: '/team/$teamId/activity',
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
    renderAt('/team/team-a/activity');
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
    renderAt('/team/team-a');
    await screen.findByRole('link', { name: 'Studies' });

    expect(screen.queryByRole('link', { name: 'Activity' })).toBeNull();
  });

  /**
   * Better Auth answers about the ACTIVE team and the URL says which team a
   * screen is about, and the two disagree for the whole of every switch —
   * permanently when §6.6's write fails. A sidebar that reads the role without
   * checking which team it belongs to therefore decides one team's
   * destinations from another team's membership, in both directions.
   */
  describe('a role that belongs to a different team from the URL', () => {
    it('offers no manage-only destination it cannot vouch for', async () => {
      // Owner of team A, standing on team B's URL, with the membership still
      // describing A.
      fixtures.useActiveMember.mockReturnValue({
        data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
        isPending: false,
        error: null,
        refetch: vi.fn(),
      });
      renderAt('/team/team-b');
      await screen.findByRole('link', { name: 'Studies' });

      // Being an owner of A says nothing about B. Offered here, the row leads
      // to a screen whose procedure refuses them (§11.4).
      expect(screen.queryByRole('link', { name: 'Activity' })).toBeNull();
    });

    it('offers it again once the membership names the team on screen', async () => {
      // The other half, so the guard above is not just "never on team B": the
      // reconciliation has landed and the researcher owns this team.
      fixtures.useActiveMember.mockReturnValue({
        data: { id: 'member-3', organizationId: 'team-b', role: 'owner' },
        isPending: false,
        error: null,
        refetch: vi.fn(),
      });
      renderAt('/team/team-b');

      expect(
        await screen.findByRole('link', { name: 'Activity' }),
      ).toHaveAttribute('href', '/team/team-b/activity');
    });
  });
});

describe('header team switcher', () => {
  it('names the team the researcher is acting in', async () => {
    renderAt('/team/team-a');
    expect(
      await screen.findByRole('button', {
        name: 'Current team Alpha research team',
      }),
    ).toBeInTheDocument();
  });

  it('navigates to the chosen team, and the reconciler follows the URL', async () => {
    const router = renderAt('/team/team-a');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Current team Alpha research team',
      }),
    );
    fireEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Beta research team' }),
    );

    // §6.5: the switch is a navigation to the team's landing destination, and
    // §6.6's reconciler is what writes the setting — after that destination
    // has committed, never before it, so a blocked navigation changes
    // nothing. The order is what this asserts: the URL first, the write
    // second.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-b'),
    );
    await waitFor(() =>
      expect(fixtures.setActive).toHaveBeenCalledWith(
        { organizationId: 'team-b' },
        { disableSignal: true },
      ),
    );
  });

  it('names the committed team, not the one the setting still holds', async () => {
    // The write is refused, so the setting stays on team A for good — the
    // permanent version of the window every team switch passes through. The
    // screen below is already team B's: it lists and creates studies against
    // the `teamId` in the URL.
    fixtures.setActive.mockResolvedValue({
      data: null,
      error: { message: 'You are not a member of that team.' },
    });
    renderAt('/team/team-b');
    await screen.findByRole('heading', { level: 1, name: 'Studies' });

    // A chip naming A over B's screen is not a slow update, it is a wrong
    // answer to the one question the chip exists to answer — and the URL is
    // what settles it (§2.2), exactly as `teamRole` settles the role.
    expect(
      await screen.findByRole('button', {
        name: 'Current team Beta research team',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Current team Alpha research team',
      }),
    ).toBeNull();
  });

  it('marks the committed team as the chosen one, and administers it', async () => {
    fixtures.setActive.mockResolvedValue({
      data: null,
      error: { message: 'You are not a member of that team.' },
    });
    renderAt('/team/team-b');

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Current team Beta research team',
      }),
    );

    // The trigger and the open menu have to agree: a chip that says B over a
    // list that marks A is a worse answer than either alone, and "Team
    // administration" is a link to a team, so it goes to the one on screen.
    expect(
      await screen.findByRole('menuitemradio', {
        name: 'Beta research team',
        checked: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', {
        name: 'Alpha research team',
        checked: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Team administration' }),
    ).toHaveAttribute('href', '/team/team-b/settings');
  });

  it('leaves the setting alone until a navigation commits', async () => {
    renderAt('/team/team-a');
    await screen.findByRole('button', {
      name: 'Current team Alpha research team',
    });

    // The committed team is already the active one, so the reconciler has
    // nothing to write. Opening the menu is not a switch either: the write
    // follows the URL, and nothing has changed it.
    fireEvent.click(
      screen.getByRole('button', { name: 'Current team Alpha research team' }),
    );
    await screen.findByRole('menuitemradio', { name: 'Beta research team' });

    expect(fixtures.setActive).not.toHaveBeenCalled();
  });
});
