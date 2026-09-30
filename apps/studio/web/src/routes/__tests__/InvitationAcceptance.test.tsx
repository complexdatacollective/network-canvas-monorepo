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
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '@codaco/studio-contract/schema/account';
import { Forbidden } from '@codaco/studio-contract/schema/errors';
import {
  MemberId,
  TeamId,
  TeamInvitationId,
} from '@codaco/studio-contract/schema/ids';
import type { InstanceStatus } from '@codaco/studio-contract/schema/status';

import { registerStudioEditorSession } from '../../editor/sessionLifecycle.ts';
import { createAppRouter } from '../../router.tsx';
import {
  installRpcHarness,
  type StudioHandlers,
} from '../../test/rpcHarness.ts';

const mocks = vi.hoisted(() => ({
  /**
   * The acceptance command, as its own handler minus the options argument the
   * harness passes it: a fixture that has drifted from the contract fails
   * `tsc` rather than passing here.
   */
  acceptInvitation:
    vi.fn<
      (
        payload: Parameters<StudioHandlers['team.acceptInvitation']>[0],
      ) => ReturnType<StudioHandlers['team.acceptInvitation']>
    >(),
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

/** The signed-in researcher; nothing here turns on any of it. */
const ME: Me = {
  userId: 'user-1',
  email: 'researcher@example.org',
  emailVerified: true,
  name: 'Researcher',
  locale: null,
  teams: [{ teamId: TeamId.make('team-a'), role: 'owner' }],
};

const STATUS: InstanceStatus = {
  name: 'Network Canvas Studio',
  version: '0.1.0',
  auth: {
    enabled: true,
    magicLink: true,
    emailAndPassword: true,
    socialProviders: [],
  },
  deployment: { mode: 'managed', billing: false },
  setup: { required: false },
};

const INVITATION_ID = '00000000-0000-4000-8000-000000000123';
/** What the server answers with when the invitation is accepted. */
const ACCEPTED = {
  invitationId: TeamInvitationId.make(INVITATION_ID),
  teamId: TeamId.make('team-a'),
  teamName: 'Alpha research team',
  memberId: MemberId.make('member-a'),
  role: 'admin',
  status: 'accepted',
} as const;

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
  mocks.acceptInvitation.mockReturnValue(Effect.succeed(ACCEPTED));
  // The in-process rpc client, installed per test.
  installRpcHarness({
    'me': () => Effect.succeed(ME),
    'status': () => Effect.succeed(STATUS),
    'studies.list': () => Effect.succeed([]),
    'team.acceptInvitation': (payload) => mocks.acceptInvitation(payload),
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
    mocks.acceptInvitation.mockReturnValue(Effect.fail(new Forbidden({})));
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
    mocks.acceptInvitation.mockImplementation(() =>
      Effect.sync(() => {
        mocks.teams = [{ id: 'team-a', name: 'Alpha research team' }];
        return ACCEPTED;
      }),
    );
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

  /**
   * And this tab's editor session ends with the account.
   *
   * Switching accounts here is a sign-out, and the socket the protocol editor
   * talks its host over is upgraded once, under the account signing out: left
   * open, the account signing in next would edit, and be audited, through it.
   * Not said at this call site, though — `lib/session.ts` ends the session
   * wherever the session query answers that nobody is signed in, which is the
   * one channel every reader of the session shares, this route's own
   * destination included.
   */
  it('ends this tab’s editor session when the visitor signs out of it', async () => {
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
    const close = vi.fn(async () => undefined);
    const unregister = registerStudioEditorSession(close);
    try {
      const router = renderAt(`/invitations/${INVITATION_ID}`);

      fireEvent.click(
        await screen.findByRole('button', { name: 'Use a different account' }),
      );
      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/sign-in'),
      );
      await waitFor(() => expect(close).toHaveBeenCalled());
    } finally {
      unregister();
    }
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
