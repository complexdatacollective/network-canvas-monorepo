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

/**
 * The shell's guards and its unresolved states.
 *
 * Everything here is about a moment the happy path skips over: a team list
 * that has not arrived yet, a write that failed, a session that belongs to no
 * team, and a keyboard visitor on the public site. Each of those is a place
 * the shell can quietly tell the researcher something untrue, so each is
 * rendered rather than reasoned about.
 */

const fixtures = vi.hoisted(() => ({
  TEAM_A: { id: 'team-a', name: 'Alpha research team', slug: 'alpha' },
  TEAM_B: { id: 'team-b', name: 'Beta research team', slug: 'beta' },
  deployment: { mode: 'managed', billing: false },
  /** What `organization.list` answers with, read at call time. */
  teams: [] as { id: string; name: string }[],
  /** The session's `activeOrganizationId`, which `setActive` moves. */
  activeTeamId: undefined as string | undefined,
  listTeams: vi.fn(),
  setActive: vi.fn(),
  useListOrganizations: vi.fn(),
  useActiveOrganization: vi.fn(),
  useActiveMember: vi.fn(),
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn(() =>
      Promise.resolve({
        data: {
          user: {},
          session: { activeOrganizationId: fixtures.activeTeamId },
        },
        error: null,
      }),
    ),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Researcher', email: 'researcher@example.com' } },
      isPending: false,
      error: null,
    }),
    useListOrganizations: fixtures.useListOrganizations,
    useActiveOrganization: fixtures.useActiveOrganization,
    useActiveMember: fixtures.useActiveMember,
    organization: {
      setActive: fixtures.setActive,
      list: fixtures.listTeams,
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
          deployment: fixtures.deployment,
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

/** The Better Auth hook's shape for a list that has resolved. */
function resolved<Data>(data: Data) {
  return { data, isPending: false, error: null, refetch: vi.fn() };
}

/** The same hook before its first answer arrives. */
function unresolved() {
  return { data: null, isPending: true, error: null, refetch: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.deployment = { mode: 'managed', billing: false };
  fixtures.teams = [fixtures.TEAM_A, fixtures.TEAM_B];
  fixtures.activeTeamId = fixtures.TEAM_A.id;
  fixtures.listTeams.mockImplementation(() =>
    Promise.resolve({ data: fixtures.teams, error: null }),
  );
  fixtures.setActive.mockImplementation(
    ({ organizationId }: { organizationId: string }) => {
      fixtures.activeTeamId = organizationId;
      return Promise.resolve({ data: {}, error: null });
    },
  );
  fixtures.useListOrganizations.mockReturnValue(
    resolved([fixtures.TEAM_A, fixtures.TEAM_B]),
  );
  fixtures.useActiveOrganization.mockReturnValue(
    resolved({ ...fixtures.TEAM_A, members: [], invitations: [] }),
  );
  fixtures.useActiveMember.mockReturnValue(
    resolved({ id: 'member-1', organizationId: 'team-a', role: 'owner' }),
  );
});

describe('the header wordmark, before the team list arrives', () => {
  it('keeps the active team as home while the list is still loading', async () => {
    fixtures.useListOrganizations.mockReturnValue(unresolved());
    renderAt('/team/team-a');

    // An unresolved list is not an empty one. Sending the wordmark to
    // `/no-team` here strands the researcher who activates it: that route has
    // no reconciliation guard, so their memberships arriving changes nothing.
    expect(await screen.findByRole('link', { name: 'Studio' })).toHaveAttribute(
      'href',
      '/team/team-a',
    );
  });

  it('offers no home at all when nothing has resolved yet', async () => {
    fixtures.useListOrganizations.mockReturnValue(unresolved());
    fixtures.useActiveOrganization.mockReturnValue(unresolved());
    renderAt('/team/team-a');

    await screen.findByRole('button', { name: 'Account' });
    // The wordmark is still there — it is the shell's identity — but it is not
    // a link to a destination nothing has chosen yet.
    expect(screen.getByText('Studio')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Studio' })).toBeNull();
  });

  it('sends the wordmark to /no-team once the list says there are none', async () => {
    // The guard let this researcher in and the list has since come back
    // empty — they left their last team in another tab. A RESOLVED empty list
    // is the one case that means `/no-team`, and it still does.
    fixtures.useListOrganizations.mockReturnValue(resolved([]));
    renderAt('/team/team-a');

    expect(await screen.findByRole('link', { name: 'Studio' })).toHaveAttribute(
      'href',
      '/no-team',
    );
  });
});

describe('a failed active-team write', () => {
  it('says so rather than leaving the screen waiting', async () => {
    fixtures.setActive.mockResolvedValue({
      data: null,
      error: { message: 'You are not a member of that team.' },
    });
    renderAt('/team/team-b');

    // Better Auth resolves a refused write with an `error` field rather than
    // rejecting, so an unchecked result reports a switch that never happened
    // and every team-scoped screen below sits on a spinner for ever.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Studio could not switch to this team',
    );
  });

  it('tries the same write again when asked', async () => {
    fixtures.setActive.mockResolvedValue({
      data: null,
      error: { message: 'You are not a member of that team.' },
    });
    renderAt('/team/team-b');
    await screen.findByRole('alert');
    expect(fixtures.setActive).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(fixtures.setActive).toHaveBeenCalledTimes(2));
  });

  it('writes once and stays quiet when it succeeds', async () => {
    renderAt('/team/team-b');
    await screen.findByRole('button', { name: 'Account' });

    await waitFor(() =>
      expect(fixtures.setActive).toHaveBeenCalledWith(
        { organizationId: 'team-b' },
        { disableSignal: true },
      ),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the landing destination after a team switch', () => {
  it('does not send the researcher back to the team they left', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    const router = renderAt('/');

    // `/` caches the memberships it resolved, active team and all.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-a'),
    );

    await act(() =>
      router.navigate({ to: '/team/$teamId', params: { teamId: 'team-b' } }),
    );
    await waitFor(() => expect(fixtures.activeTeamId).toBe('team-b'));

    await act(() => router.navigate({ to: '/' }));

    // Inside the cache's 30-second freshness window. Without invalidation the
    // stale answer wins and the researcher is bounced back to team A.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-b'),
    );
  });
});

describe('a session that belongs to no team', () => {
  it('never renders an app route it has no data for', async () => {
    fixtures.teams = [];
    fixtures.useListOrganizations.mockReturnValue(resolved([]));
    fixtures.useActiveOrganization.mockReturnValue(resolved(null));
    fixtures.useActiveMember.mockReturnValue(resolved(null));
    const router = renderAt('/account');

    // §6.4: the app shell's guard resolves memberships, so a bookmark or a
    // deep link lands on `/no-team` rather than on a screen whose data the
    // researcher has no team to own.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/no-team'),
    );
    expect(
      await screen.findByRole('heading', { name: 'No team yet' }),
    ).toBeInTheDocument();
  });

  it('lets a researcher through when the list cannot be read', async () => {
    fixtures.listTeams.mockResolvedValue({
      data: null,
      error: { message: 'unavailable' },
    });
    const router = renderAt('/account');

    // Not knowing is not the same as knowing they have none, and "you belong
    // to no team" is the one lie a researcher is most likely to believe.
    expect(
      await screen.findByRole('heading', { name: 'Profile' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account');
  });
});

describe('the site shell', () => {
  it('offers a bypass link before the site navigation', async () => {
    renderAt('/');
    await screen.findByRole('heading', {
      level: 1,
      name: 'Network Canvas Studio',
    });

    // WCAG 2.4.1: the site header repeats on every public page, so the bypass
    // has to be reachable before it — which means first in the document.
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Skip to main content');
  });

  it('moves focus to the page main when that link is used', async () => {
    renderAt('/');
    const skipLink = await screen.findByRole('link', {
      name: 'Skip to main content',
    });

    fireEvent.click(skipLink);

    // A `<main>` is not focusable on its own, so a plain fragment link would
    // leave focus on the bypass and the next Tab would restart at the top.
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});
