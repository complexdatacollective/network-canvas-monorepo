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

const fixtures = vi.hoisted(() => {
  const TEAM_A = {
    id: 'team-a',
    name: 'Alpha research team',
    slug: 'alpha-research-team',
    createdAt: new Date('2026-08-28T00:00:00Z'),
  };
  const TEAM_B = {
    id: 'team-b',
    name: 'Beta research team',
    slug: 'beta-research-team',
    createdAt: new Date('2026-08-28T00:00:00Z'),
  };
  const OWNER = {
    id: 'membership-owner',
    organizationId: TEAM_A.id,
    userId: 'user-owner',
    role: 'owner',
    createdAt: new Date('2026-08-28T00:00:00Z'),
    user: {
      id: 'user-owner',
      name: 'Owner Researcher',
      email: 'owner@example.com',
      image: undefined,
    },
  };
  const COLLABORATOR = {
    id: 'membership-collaborator',
    organizationId: TEAM_A.id,
    userId: 'user-collaborator',
    role: 'member',
    createdAt: new Date('2026-08-28T00:00:00Z'),
    user: {
      id: 'user-collaborator',
      name: 'Team Collaborator',
      email: 'collaborator@example.com',
      image: undefined,
    },
  };
  const ACTIVE_TEAM_A = {
    ...TEAM_A,
    logo: null,
    metadata: null,
    members: [OWNER, COLLABORATOR],
    invitations: [
      {
        id: 'invitation-1',
        organizationId: TEAM_A.id,
        inviterId: OWNER.userId,
        email: 'pending@example.com',
        role: 'admin',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date('2026-08-28T00:00:00Z'),
      },
      {
        id: 'invitation-expired',
        organizationId: TEAM_A.id,
        inviterId: OWNER.userId,
        email: 'expired@example.com',
        role: 'member',
        status: 'pending',
        expiresAt: new Date(Date.now() - 86_400_000),
        createdAt: new Date('2019-12-01T00:00:00Z'),
      },
    ],
  };
  const BETA_MEMBER = {
    ...OWNER,
    id: 'membership-beta',
    organizationId: TEAM_B.id,
  };
  const ACTIVE_TEAM_B = {
    ...TEAM_B,
    logo: null,
    metadata: null,
    members: [BETA_MEMBER],
    invitations: [],
  };
  const protocolsByTeam = {
    'team-a': [
      {
        id: 'protocol-a',
        draftId: 'draft-a',
        name: 'Alpha protocol',
        createdAt: new Date('2026-08-28T00:00:00Z'),
        updatedAt: new Date('2026-08-28T00:00:00Z'),
      },
    ],
    'team-b': [
      {
        id: 'protocol-b',
        draftId: 'draft-b',
        name: 'Beta protocol',
        createdAt: new Date('2026-08-28T00:00:00Z'),
        updatedAt: new Date('2026-08-28T00:00:00Z'),
      },
    ],
  };
  const createProtocol = vi.fn();
  const createInvitation = vi.fn();
  const updateMemberRole = vi.fn();
  const cancelInvitation = vi.fn();
  const authStore = {
    revision: 0,
    listeners: new Set<() => void>(),
    notify() {
      this.revision += 1;
      for (const listener of this.listeners) listener();
    },
  };
  const authState: {
    activeTeam: typeof ACTIVE_TEAM_A | typeof ACTIVE_TEAM_B | undefined;
    activeMember:
      | typeof OWNER
      | typeof COLLABORATOR
      | typeof BETA_MEMBER
      | undefined;
    setActive: ReturnType<typeof vi.fn>;
    refetchActiveTeam: ReturnType<typeof vi.fn>;
    refetchActiveMember: ReturnType<typeof vi.fn>;
    activeTeamError: Error | null;
    activeMemberError: Error | null;
    activeTeamPending: boolean;
    activeMemberPending: boolean;
    activeTeamRefetching: boolean;
    activeMemberRefetching: boolean;
  } = {
    activeTeam: undefined,
    activeMember: undefined,
    setActive: vi.fn(),
    refetchActiveTeam: vi.fn(),
    refetchActiveMember: vi.fn(),
    activeTeamError: null,
    activeMemberError: null,
    activeTeamPending: false,
    activeMemberPending: false,
    activeTeamRefetching: false,
    activeMemberRefetching: false,
  };
  return {
    TEAM_A,
    TEAM_B,
    OWNER,
    COLLABORATOR,
    ACTIVE_TEAM_A,
    BETA_MEMBER,
    ACTIVE_TEAM_B,
    protocolsByTeam,
    createProtocol,
    createInvitation,
    updateMemberRole,
    cancelInvitation,
    authStore,
    authState,
  };
});

const {
  TEAM_A,
  TEAM_B,
  OWNER,
  COLLABORATOR,
  ACTIVE_TEAM_A,
  BETA_MEMBER,
  ACTIVE_TEAM_B,
  authStore,
  authState,
} = fixtures;

vi.mock('../../lib/auth.ts', async () => {
  const { useSyncExternalStore } = await import('react');
  const useAuthRevision = () =>
    useSyncExternalStore(
      (listener) => {
        fixtures.authStore.listeners.add(listener);
        return () => fixtures.authStore.listeners.delete(listener);
      },
      () => fixtures.authStore.revision,
      () => fixtures.authStore.revision,
    );
  return {
    authClient: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { user: {} }, error: null }),
      useSession: vi.fn().mockReturnValue({
        data: {
          user: { name: 'Owner Researcher', email: 'owner@example.com' },
        },
        isPending: false,
      }),
      useListOrganizations: vi.fn().mockReturnValue({
        data: [fixtures.TEAM_A, fixtures.TEAM_B],
        isPending: false,
        error: null,
      }),
      useActiveOrganization: vi.fn(() => {
        useAuthRevision();
        return {
          data: fixtures.authState.activeTeam,
          isPending: fixtures.authState.activeTeamPending,
          isRefetching: fixtures.authState.activeTeamRefetching,
          error: fixtures.authState.activeTeamError,
          refetch: fixtures.authState.refetchActiveTeam,
        };
      }),
      useActiveMember: vi.fn(() => {
        useAuthRevision();
        return {
          data: fixtures.authState.activeMember,
          isPending: fixtures.authState.activeMemberPending,
          isRefetching: fixtures.authState.activeMemberRefetching,
          error: fixtures.authState.activeMemberError,
          refetch: fixtures.authState.refetchActiveMember,
        };
      }),
      organization: {
        setActive: fixtures.authState.setActive,
        // The app shell's guard resolves memberships before it renders any
        // app route (§6.4), so this researcher has to belong to something.
        list: vi.fn(() =>
          Promise.resolve({
            data: [fixtures.TEAM_A, fixtures.TEAM_B],
            error: null,
          }),
        ),
      },
      signOut: vi.fn(),
    },
  };
});

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
        queryOptions: ({ input }: { input: { teamId: string } }) => ({
          queryKey: ['protocols', input.teamId],
          queryFn: () =>
            fixtures.protocolsByTeam[
              input.teamId as keyof typeof fixtures.protocolsByTeam
            ] ?? [],
        }),
        key: ({ input }: { input: { teamId: string } }) => [
          'protocols',
          input.teamId,
        ],
      },
      create: {
        mutationOptions: (options: object) => ({
          mutationFn: fixtures.createProtocol,
          ...options,
        }),
      },
      draft: {
        queryOptions: () => ({ queryKey: ['draft'], queryFn: vi.fn() }),
        key: () => ['draft'],
      },
    },
  },
  rpcClient: {
    protocols: {},
    team: {
      createInvitation: fixtures.createInvitation,
      updateMemberRole: fixtures.updateMemberRole,
      cancelInvitation: fixtures.cancelInvitation,
    },
  },
}));

/** The two halves §5.4 split the shipped team workspace into. */
const STUDIES = `/team/${fixtures.TEAM_A.id}`;
const MEMBERS = `/team/${fixtures.TEAM_A.id}/members`;

function renderTeam(path: string) {
  // One client behind both the router's guards and the components: the
  // session guard reads what a component's `queryClient.clear()` removes.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
    queryClient,
  );
  const ui = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  const view = render(ui);
  return { ...view, router, rerenderTeam: () => view.rerender(ui) };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.refetchActiveTeam.mockReset();
  authState.refetchActiveMember.mockReset();
  authState.activeTeam = ACTIVE_TEAM_A;
  authState.activeMember = OWNER;
  authState.activeTeamError = null;
  authState.activeMemberError = null;
  authState.activeTeamPending = false;
  authState.activeMemberPending = false;
  authState.activeTeamRefetching = false;
  authState.activeMemberRefetching = false;
  authState.setActive.mockImplementation(
    (input: { organizationId: string }) => {
      if (input.organizationId === TEAM_B.id) {
        authState.activeTeam = ACTIVE_TEAM_B;
        authState.activeMember = BETA_MEMBER;
      } else if (input.organizationId === TEAM_A.id) {
        authState.activeTeam = ACTIVE_TEAM_A;
        authState.activeMember = OWNER;
      }
      return Promise.resolve({ data: authState.activeTeam, error: null });
    },
  );
  fixtures.createInvitation.mockResolvedValue({
    invitationId: 'new-invitation',
    email: 'new@example.com',
    role: 'admin',
    status: 'pending',
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  fixtures.updateMemberRole.mockResolvedValue({
    memberId: COLLABORATOR.id,
    role: 'admin',
  });
  fixtures.cancelInvitation.mockResolvedValue({
    invitationId: 'invitation-1',
    status: 'canceled',
  });
  fixtures.createProtocol.mockImplementation(
    (input: { protocolId: string; draftId: string }) =>
      Promise.resolve({
        protocolId: input.protocolId,
        draftId: input.draftId,
      }),
  );
  authState.refetchActiveTeam.mockResolvedValue(undefined);
  authState.refetchActiveMember.mockResolvedValue(undefined);
});
/**
 * §5.4's split of the shipped team workspace, asserted at the two addresses it
 * landed on: `/team/$teamId`, the team's studies, and `/team/$teamId/members`,
 * its membership and invitations.
 *
 * The switcher these screens used to carry is gone with the split — the header
 * owns it, and it is a navigation now (§6.5), so nothing here blocks a
 * mutation against a team change. What each screen still owns is the
 * reconciliation every ambiguous mutation needs, and that is what most of this
 * file is about.
 */
describe('the team studies list', () => {
  it('lists the studies this team owns and reaches each one', async () => {
    renderTeam(STUDIES);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Studies' }),
    ).toBeInTheDocument();
    // The team comes from the URL, not from the active-team setting (§2.2).
    expect(
      await screen.findByRole('link', { name: 'Alpha protocol' }),
    ).toHaveAttribute('href', '/study/protocol-a');
    expect(screen.queryByText('Beta protocol')).toBeNull();
  });

  it('creates a study and opens its editor', async () => {
    const { router } = renderTeam(STUDIES);

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Study name' }),
      { target: { value: 'New study' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create study' }));

    await waitFor(() =>
      expect(fixtures.createProtocol.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ teamId: TEAM_A.id, name: 'New study' }),
      ),
    );
    // A new study's first act is designing its protocol (§10.2), so the
    // editor is where creating one lands.
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(
        /^\/study\/[0-9a-f-]+\/editor$/,
      ),
    );
  });

  it('leaves a researcher who moved on where they went', async () => {
    let finishCreation: ((created: { protocolId: string }) => void) | undefined;
    fixtures.createProtocol.mockImplementation(
      () =>
        new Promise<{ protocolId: string }>((resolve) => {
          finishCreation = resolve;
        }),
    );
    const { router } = renderTeam(STUDIES);

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Study name' }),
      { target: { value: 'Slow study' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create study' }));
    await waitFor(() => expect(finishCreation).toBeDefined());

    // The header is on every screen, so a creation can still be on the wire
    // when the researcher switches teams.
    await act(() =>
      router.navigate({ to: '/team/$teamId', params: { teamId: TEAM_B.id } }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/team/${TEAM_B.id}`),
    );

    await act(async () => {
      finishCreation?.({ protocolId: 'slow-study' });
    });

    // §6.5: a continuation that resolves after a later navigation has
    // committed must not act on where the researcher used to be. The study
    // exists and team A's list names it; being dragged into its editor from
    // another team is the failure. Waiting for the form to finish submitting
    // is what makes this able to fail — the navigation the guard suppresses
    // happens BEFORE that, so an unguarded continuation unmounts this button
    // rather than re-enabling it.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Create study' }),
      ).toBeEnabled(),
    );
    expect(router.state.location.pathname).toBe(`/team/${TEAM_B.id}`);
  });

  it('reuses the creation identity after a lost response', async () => {
    fixtures.createProtocol
      .mockRejectedValueOnce(new Error('response lost'))
      .mockImplementationOnce(
        (input: { protocolId: string; draftId: string }) =>
          Promise.resolve({
            protocolId: input.protocolId,
            draftId: input.draftId,
          }),
      );
    const { router } = renderTeam(STUDIES);

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Study name' }),
      { target: { value: 'Stable team study' } },
    );
    const create = screen.getByRole('button', { name: 'Create study' });
    fireEvent.click(create);
    await screen.findByText(/study could not be created/i);
    fireEvent.click(create);

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(
        /^\/study\/[0-9a-f-]+\/editor$/,
      ),
    );
    // Retrying the same name must not leave two studies behind.
    expect(fixtures.createProtocol).toHaveBeenCalledTimes(2);
    expect(fixtures.createProtocol.mock.calls[1]?.[0]).toEqual(
      fixtures.createProtocol.mock.calls[0]?.[0],
    );
  });
});

describe('the team members screen', () => {
  it('shows the team members, their roles, and its pending invitations', async () => {
    renderTeam(MEMBERS);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Members' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Team Collaborator')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for Team Collaborator')).toHaveValue(
      'member',
    );
    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    expect(screen.queryByText('expired@example.com')).toBeNull();
  });

  it('waits for the reconciler to make the URL team the active one', async () => {
    // Arriving on a team that is not yet the active one. Membership is only
    // readable for the active team, so the screen says it is waiting rather
    // than showing another team's members under this team's URL (§6.6).
    authState.activeTeam = ACTIVE_TEAM_B;
    authState.activeMember = BETA_MEMBER;
    renderTeam(MEMBERS);

    expect(await screen.findByText('Loading team access…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite user' })).toBeNull();
    await waitFor(() =>
      expect(authState.setActive).toHaveBeenCalledWith(
        { organizationId: TEAM_A.id },
        { disableSignal: true },
      ),
    );
  });

  it('offers a retry when team access cannot be loaded', async () => {
    authState.activeTeam = undefined;
    authState.activeMember = undefined;
    authState.activeTeamError = new Error('load failed');
    renderTeam(MEMBERS);

    expect(
      await screen.findByText(/could not load this team/i),
    ).toBeInTheDocument();
    authState.refetchActiveTeam.mockClear();
    authState.refetchActiveMember.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Retry team access' }));
    await waitFor(() => {
      expect(authState.refetchActiveTeam).toHaveBeenCalled();
      expect(authState.refetchActiveMember).toHaveBeenCalled();
    });
  });

  it('creates an invitation with this team and the selected role', async () => {
    renderTeam(MEMBERS);
    const email = await screen.findByRole('textbox', {
      name: 'Email address',
    });
    fireEvent.change(email, { target: { value: 'new@example.com' } });
    fireEvent.change(
      await screen.findByRole('combobox', { name: /team role/i }),
      { target: { value: 'admin' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));

    await waitFor(() =>
      expect(fixtures.createInvitation).toHaveBeenCalledWith({
        teamId: TEAM_A.id,
        email: 'new@example.com',
        role: 'admin',
      }),
    );
    expect(
      await screen.findByText(
        'Invitation created for new@example.com. Email delivery is queued.',
      ),
    ).toBeInTheDocument();
  });

  it('moves focus into the cleared invitation form after creation', async () => {
    renderTeam(MEMBERS);
    const email = await screen.findByRole('textbox', {
      name: 'Email address',
    });
    fireEvent.change(email, { target: { value: 'focused@example.com' } });
    const invite = screen.getByRole('button', { name: 'Invite user' });
    invite.focus();
    fireEvent.click(invite);

    expect(
      await screen.findByText(
        'Invitation created for focused@example.com. Email delivery is queued.',
      ),
    ).toBeInTheDocument();
    const clearedEmail = screen.getByRole('textbox', {
      name: 'Email address',
    });
    expect(clearedEmail).not.toBe(email);
    expect(clearedEmail).toHaveValue('');
    expect(clearedEmail).toHaveFocus();
  });

  it('refetches pending invitations after an ambiguous creation failure', async () => {
    const reconciledInvitation = {
      ...ACTIVE_TEAM_A.invitations[0]!,
      id: 'invitation-reconciled',
      email: 'reconciled@example.com',
    };
    fixtures.createInvitation.mockRejectedValueOnce(new Error('response lost'));
    authState.refetchActiveTeam.mockImplementationOnce(async () => {
      authState.activeTeam = {
        ...ACTIVE_TEAM_A,
        invitations: [...ACTIVE_TEAM_A.invitations, reconciledInvitation],
      };
    });
    const view = renderTeam(MEMBERS);

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Email address' }),
      { target: { value: 'reconciled@example.com' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));

    expect(
      await screen.findByText(/could not confirm the invitation/i),
    ).toBeInTheDocument();
    expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(1);
    view.rerenderTeam();
    expect(
      await screen.findByText('reconciled@example.com'),
    ).toBeInTheDocument();
  });

  it('reports a confirmed invitation as successful and retries its failed refresh', async () => {
    const createdInvitation = {
      ...ACTIVE_TEAM_A.invitations[0]!,
      id: 'new-invitation',
      email: 'new@example.com',
    };
    authState.refetchActiveTeam
      .mockImplementationOnce(async () => {
        authState.activeTeamError = new Error('refresh failed');
      })
      .mockImplementationOnce(async () => {
        authState.activeTeamError = null;
        authState.activeTeam = {
          ...ACTIVE_TEAM_A,
          invitations: [...ACTIVE_TEAM_A.invitations, createdInvitation],
        };
      });
    renderTeam(MEMBERS);

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Email address' }),
      { target: { value: 'new@example.com' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));

    expect(
      await screen.findByText(/invitation created.*could not be refreshed/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/could not confirm the invitation/i),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh team details' }),
    );
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(2),
    );
    await screen.findByText(
      'Invitation created for new@example.com. Team details refreshed.',
    );
    expect(await screen.findByText('new@example.com')).toBeInTheDocument();
    expect(fixtures.createInvitation).toHaveBeenCalledTimes(1);
  });

  it('validates invitation email before submitting it', async () => {
    renderTeam(MEMBERS);

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Email address' }),
      { target: { value: 'not-an-email' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));

    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toBeInTheDocument();
    expect(fixtures.createInvitation).not.toHaveBeenCalled();
  });

  it('updates a member role in this team', async () => {
    renderTeam(MEMBERS);
    const role = await screen.findByLabelText('Role for Team Collaborator');
    fireEvent.change(role, { target: { value: 'admin' } });

    await waitFor(() =>
      expect(fixtures.updateMemberRole).toHaveBeenCalledWith({
        teamId: TEAM_A.id,
        memberId: COLLABORATOR.id,
        role: 'admin',
      }),
    );
    expect(await screen.findByText('Team role updated.')).toBeInTheDocument();
    expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(1);
    expect(authState.refetchActiveMember).toHaveBeenCalledTimes(1);
  });

  it('renders a legacy multi-role membership without an editable selector', async () => {
    const multiRoleCollaborator = {
      ...COLLABORATOR,
      role: 'owner,admin',
    };
    authState.activeTeam = {
      ...ACTIVE_TEAM_A,
      members: [OWNER, multiRoleCollaborator],
    };
    renderTeam(MEMBERS);

    expect(await screen.findByText('Owner, Admin')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Role for Team Collaborator'),
    ).not.toBeInTheDocument();
    expect(fixtures.updateMemberRole).not.toHaveBeenCalled();
  });

  it('recovers the committed role after an ambiguous response', async () => {
    fixtures.updateMemberRole.mockRejectedValueOnce(new Error('response lost'));
    authState.refetchActiveTeam.mockImplementationOnce(async () => {
      authState.activeTeam = {
        ...ACTIVE_TEAM_A,
        members: [OWNER, { ...COLLABORATOR, role: 'admin' }],
      };
    });
    renderTeam(MEMBERS);

    fireEvent.change(
      await screen.findByLabelText('Role for Team Collaborator'),
      { target: { value: 'admin' } },
    );

    expect(
      await screen.findByText(
        /could not confirm whether the team role changed/i,
      ),
    ).toBeInTheDocument();
    expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(1);
    expect(authState.refetchActiveMember).toHaveBeenCalledTimes(1);
    expect(fixtures.updateMemberRole).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByLabelText('Role for Team Collaborator'),
    ).toHaveValue('admin');
  });

  it('reports a confirmed role commit as successful and retries its failed refresh', async () => {
    authState.refetchActiveTeam
      .mockImplementationOnce(async () => {
        authState.activeTeamError = new Error('refresh failed');
      })
      .mockImplementationOnce(async () => {
        authState.activeTeamError = null;
        authState.activeTeam = {
          ...ACTIVE_TEAM_A,
          members: [OWNER, { ...COLLABORATOR, role: 'admin' }],
        };
      });
    renderTeam(MEMBERS);

    fireEvent.change(
      await screen.findByLabelText('Role for Team Collaborator'),
      { target: { value: 'admin' } },
    );

    expect(
      await screen.findByText(/team role updated.*could not be refreshed/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh team details' }),
    );
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(2),
    );
    await screen.findByText('Team role updated. Team details refreshed.');
    expect(
      await screen.findByLabelText('Role for Team Collaborator'),
    ).toHaveValue('admin');
    expect(fixtures.updateMemberRole).toHaveBeenCalledTimes(1);
  });

  it('keeps role recovery available when a retry resolves with an auth error', async () => {
    authState.refetchActiveTeam
      .mockImplementationOnce(async () => {
        authState.activeTeamError = new Error('initial refresh failed');
      })
      .mockImplementationOnce(async () => {
        authState.activeTeamError = new Error('retry refresh failed');
      })
      .mockImplementationOnce(async () => {
        authState.activeTeamError = null;
        authState.activeTeam = {
          ...ACTIVE_TEAM_A,
          members: [OWNER, { ...COLLABORATOR, role: 'admin' }],
        };
      });
    renderTeam(MEMBERS);

    fireEvent.change(
      await screen.findByLabelText('Role for Team Collaborator'),
      { target: { value: 'admin' } },
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Refresh team details' }),
    );
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Refresh team details' }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText('Team role updated. Team details refreshed.'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh team details' }),
    );
    await screen.findByText('Team role updated. Team details refreshed.');
    expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(3);
    expect(fixtures.updateMemberRole).toHaveBeenCalledTimes(1);
  });

  it('retries reconciliation instead of repeating an ambiguous role mutation', async () => {
    fixtures.updateMemberRole.mockRejectedValueOnce(new Error('response lost'));
    authState.refetchActiveTeam
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockImplementationOnce(async () => {
        authState.activeTeam = {
          ...ACTIVE_TEAM_A,
          members: [OWNER, { ...COLLABORATOR, role: 'admin' }],
        };
      });
    renderTeam(MEMBERS);

    fireEvent.change(
      await screen.findByLabelText('Role for Team Collaborator'),
      { target: { value: 'admin' } },
    );

    expect(
      await screen.findByText(
        /could not confirm whether the team role changed.*could not be refreshed/i,
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh team details' }),
    );

    expect(
      await screen.findByLabelText('Role for Team Collaborator'),
    ).toHaveValue('admin');
    expect(fixtures.updateMemberRole).toHaveBeenCalledTimes(1);
    expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(2);
  });

  it('refreshes active membership after the current user changes their role', async () => {
    const selfAdmin = { ...COLLABORATOR, role: 'admin' };
    authState.activeMember = selfAdmin;
    authState.activeTeam = {
      ...ACTIVE_TEAM_A,
      members: [OWNER, selfAdmin],
    };
    fixtures.updateMemberRole.mockImplementation(
      (input: { memberId: string; role: 'owner' | 'admin' | 'member' }) => {
        const demoted = { ...selfAdmin, role: input.role };
        authState.activeMember = demoted;
        authState.activeTeam = {
          ...ACTIVE_TEAM_A,
          members: [OWNER, demoted],
        };
        return Promise.resolve(input);
      },
    );
    renderTeam(MEMBERS);

    fireEvent.change(
      await screen.findByLabelText('Role for Team Collaborator'),
      { target: { value: 'member' } },
    );

    await waitFor(() =>
      expect(authState.refetchActiveMember).toHaveBeenCalledTimes(1),
    );
    // What a real refetch would publish: Better Auth's organization hooks are
    // shared atoms, and every reader of them re-reads together.
    act(() => authStore.notify());
    expect(
      await screen.findByText(
        'Only team owners and admins can invite people or change roles.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite user' })).toBeNull();
  });

  it('cancels a pending invitation in this team', async () => {
    renderTeam(MEMBERS);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Cancel invitation for pending@example.com',
      }),
    );

    await waitFor(() =>
      expect(fixtures.cancelInvitation).toHaveBeenCalledWith({
        teamId: TEAM_A.id,
        invitationId: 'invitation-1',
      }),
    );
    expect(
      await screen.findByText('Invitation cancelled for pending@example.com.'),
    ).toBeInTheDocument();
  });

  it('recovers a committed cancellation after an ambiguous response', async () => {
    fixtures.cancelInvitation.mockRejectedValueOnce(new Error('response lost'));
    authState.refetchActiveTeam.mockImplementationOnce(async () => {
      authState.activeTeam = {
        ...ACTIVE_TEAM_A,
        invitations: ACTIVE_TEAM_A.invitations.map((invitation) =>
          invitation.id === 'invitation-1'
            ? { ...invitation, status: 'canceled' }
            : invitation,
        ),
      };
    });
    renderTeam(MEMBERS);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Cancel invitation for pending@example.com',
      }),
    );

    expect(
      await screen.findByText(
        /could not confirm whether the invitation was cancelled/i,
      ),
    ).toBeInTheDocument();
    expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(1);
    expect(authState.refetchActiveMember).toHaveBeenCalledTimes(1);
    expect(fixtures.cancelInvitation).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument();
  });

  it('reports a confirmed cancellation as successful and retries its failed refresh', async () => {
    authState.refetchActiveMember
      .mockImplementationOnce(async () => {
        authState.activeMemberError = new Error('refresh failed');
      })
      .mockImplementationOnce(async () => {
        authState.activeMemberError = null;
        authState.activeTeam = {
          ...ACTIVE_TEAM_A,
          invitations: ACTIVE_TEAM_A.invitations.map((invitation) =>
            invitation.id === 'invitation-1'
              ? { ...invitation, status: 'canceled' }
              : invitation,
          ),
        };
      });
    renderTeam(MEMBERS);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Cancel invitation for pending@example.com',
      }),
    );

    expect(
      await screen.findByText(/invitation cancelled.*could not be refreshed/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh team details' }),
    );
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(2),
    );
    await screen.findByText(
      'Invitation cancelled for pending@example.com. Team details refreshed.',
    );
    expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument();
    expect(fixtures.cancelInvitation).toHaveBeenCalledTimes(1);
  });

  it('shows roles without management controls to ordinary members', async () => {
    authState.activeMember = COLLABORATOR;
    renderTeam(MEMBERS);

    expect(
      await screen.findByText(
        'Only team owners and admins can invite people or change roles.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite user' })).toBeNull();
    expect(screen.getAllByText('Member').length).toBeGreaterThan(0);
  });

  it('shows an owner read-only while letting an admin manage other roles', async () => {
    authState.activeMember = { ...COLLABORATOR, role: 'admin' };
    renderTeam(MEMBERS);

    expect(
      await screen.findByLabelText('Role for Team Collaborator'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Role for Owner Researcher')).toBeNull();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });
});
