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

const mocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  getSession: vi.fn(),
  magicLink: vi.fn(),
  setActive: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(),
  listTeams: vi.fn(),
  /** What `organization.list` answers with, read at call time. */
  teams: [] as { id: string; name: string }[],
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: mocks.getSession,
    useSession: mocks.useSession,
    useListOrganizations: vi.fn().mockReturnValue({
      data: [],
      isPending: false,
      error: null,
    }),
    // `refetch` is not optional decoration: §6.6's reconciler awaits both when
    // it writes the active team, which is what accepting an invitation and
    // then entering that team makes it do.
    useActiveOrganization: vi.fn().mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    useActiveMember: vi.fn().mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    signIn: { magicLink: mocks.magicLink, social: vi.fn() },
    signOut: mocks.signOut,
    organization: { setActive: mocks.setActive, list: mocks.listTeams },
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
  rpcClient: {
    team: { acceptInvitation: mocks.acceptInvitation },
    protocols: {},
  },
}));

const INVITATION_ID = '00000000-0000-4000-8000-000000000123';
const SESSION = {
  user: {
    id: 'invitee-user',
    email: 'invitee@example.com',
    emailVerified: true,
    name: 'Invited Researcher',
  },
  session: { id: 'invitee-session' },
};

function renderAt(path: string) {
  // One client behind both the router's guards and the components: the
  // session guard reads what a component's `queryClient.clear()` removes.
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.teams = [];
  mocks.listTeams.mockImplementation(() =>
    Promise.resolve({ data: mocks.teams, error: null }),
  );
  mocks.getSession.mockResolvedValue({ data: null, error: null });
  mocks.useSession.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
  });
  mocks.magicLink.mockResolvedValue({
    data: { status: true },
    error: null,
  });
  mocks.setActive.mockResolvedValue({ data: { id: 'team-a' }, error: null });
  mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
  mocks.acceptInvitation.mockResolvedValue({
    invitationId: INVITATION_ID,
    teamId: 'team-a',
    teamName: 'Alpha research team',
    memberId: 'member-a',
    role: 'admin',
    status: 'accepted',
  });
});

describe('invitation acceptance', () => {
  it('preserves the validated invitation through magic-link sign-in', async () => {
    const router = renderAt(`/invitations/${INVITATION_ID}`);

    expect(
      await screen.findByRole('heading', { name: 'Accept team invitation' }),
    ).toBeInTheDocument();
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Sign in to continue' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Email address' }),
      {
        target: { value: 'invitee@example.com' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

    await waitFor(() =>
      expect(mocks.magicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'invitee@example.com',
          callbackURL: `/invitations/${INVITATION_ID}`,
          errorCallbackURL: `/sign-in?invitationId=${INVITATION_ID}`,
        }),
      ),
    );
  });

  it('requires an explicit action and activates the joined team after acceptance', async () => {
    mocks.getSession.mockResolvedValue({ data: SESSION, error: null });
    mocks.useSession.mockReturnValue({
      data: SESSION,
      isPending: false,
      error: null,
    });
    renderAt(`/invitations/${INVITATION_ID}`);

    expect(
      await screen.findByText(/Signed in as invitee@example.com/),
    ).toBeInTheDocument();
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Join team' }));

    await waitFor(() =>
      expect(mocks.acceptInvitation).toHaveBeenCalledWith({
        invitationId: INVITATION_ID,
      }),
    );
    await waitFor(() =>
      expect(mocks.setActive).toHaveBeenCalledWith({
        organizationId: 'team-a',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Invitation accepted' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Alpha research team/)).toBeInTheDocument();
    // The accepted team's own studies list, not `/`, which is marketing
    // (§10.2, §10.4).
    expect(screen.getByRole('link', { name: 'Open team' })).toHaveAttribute(
      'href',
      '/team/team-a',
    );
  });

  it('does not expose invitation details when acceptance is refused', async () => {
    mocks.useSession.mockReturnValue({
      data: SESSION,
      isPending: false,
      error: null,
    });
    mocks.acceptInvitation.mockRejectedValue(new Error('forbidden'));
    renderAt(`/invitations/${INVITATION_ID}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Join team' }));
    expect(
      await screen.findByText(
        /This invitation is not available for the signed-in account/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Alpha research team')).not.toBeInTheDocument();
    expect(mocks.setActive).not.toHaveBeenCalled();
  });

  it('opens the joined team instead of bouncing back to /no-team', async () => {
    // The whole journey an invited researcher without a team actually makes.
    // It starts at `/no-team`, and that first screen is what makes the rest of
    // it dangerous: resolving it caches "this session belongs to no team" for
    // thirty seconds, and both the app shell's guard and `/no-team`'s own read
    // that same cache. Accepting the invitation makes it false without
    // touching it, so unless acceptance says so, "Open team" enters the shell,
    // is told the researcher has no team, and is sent straight back here —
    // with `/no-team` agreeing, because it is reading the same stale answer.
    mocks.getSession.mockResolvedValue({ data: SESSION, error: null });
    mocks.useSession.mockReturnValue({
      data: SESSION,
      isPending: false,
      error: null,
    });
    const router = renderAt('/no-team');
    await screen.findByRole('heading', { name: 'No team yet' });

    await act(() =>
      router.navigate({
        to: '/invitations/$invitationId',
        params: { invitationId: INVITATION_ID },
      }),
    );
    // The invitation is what changes the answer, so the server starts giving
    // the new one the moment it is accepted.
    mocks.acceptInvitation.mockImplementation(() => {
      mocks.teams = [{ id: 'team-a', name: 'Alpha research team' }];
      return Promise.resolve({
        invitationId: INVITATION_ID,
        teamId: 'team-a',
        teamName: 'Alpha research team',
        memberId: 'member-a',
        role: 'admin',
        status: 'accepted',
      });
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Join team' }));

    fireEvent.click(await screen.findByRole('link', { name: 'Open team' }));

    // The team's studies, RENDERED. Not `state.location`, which is set to the
    // destination before the guard that may refuse it has run: a bounce back
    // to `/no-team` lands after the pathname already reads `/team/team-a`, so
    // an assertion on it passes with the bug still there.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Studies' }),
    ).toBeInTheDocument();
    expect(router.state.resolvedLocation?.pathname).toBe('/team/team-a');
  });

  it('lets a signed-in visitor switch accounts without losing the invitation', async () => {
    mocks.getSession.mockResolvedValue({ data: SESSION, error: null });
    mocks.useSession.mockReturnValue({
      data: SESSION,
      isPending: false,
      error: null,
    });
    mocks.signOut.mockImplementationOnce(async () => {
      mocks.getSession.mockResolvedValue({ data: null, error: null });
      mocks.useSession.mockReturnValue({
        data: null,
        isPending: false,
        error: null,
      });
      return { data: { success: true }, error: null };
    });
    const router = renderAt(`/invitations/${INVITATION_ID}`);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Use a different account' }),
    );
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-in'),
    );
    expect(router.state.location.search).toMatchObject({
      invitationId: INVITATION_ID,
    });
  });
});
