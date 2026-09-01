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

function renderWorkspace() {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ['/'] }),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  const view = render(ui);
  return { ...view, router, rerenderWorkspace: () => view.rerender(ui) };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

describe('Studio team workspace', () => {
  it('shows the active team with its protocols, members, roles, and invitations', async () => {
    renderWorkspace();

    expect(
      await screen.findByRole('heading', {
        name: 'Alpha research team protocols',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Active team')).toHaveValue(TEAM_A.id);
    expect(screen.getByText('Currently active')).toBeInTheDocument();
    expect(await screen.findByText('Alpha protocol')).toBeInTheDocument();
    expect(screen.getByText('Team Collaborator')).toBeInTheDocument();
    expect(screen.getByLabelText('Role for Team Collaborator')).toHaveValue(
      'member',
    );
    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    expect(screen.queryByText('expired@example.com')).toBeNull();
  });

  it('offers the Activity destination only to owners and admins', async () => {
    renderWorkspace();

    const link = await screen.findByRole('link', { name: 'Activity' });
    expect(link).toHaveAttribute('href', '/teams/team-a/activity');

    authState.activeMember = COLLABORATOR;
    authStore.notify();
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Activity' })).toBeNull();
    });
  });

  it('switches the active team and scopes the protocol list to it', async () => {
    const view = renderWorkspace();
    await screen.findByText('Alpha protocol');

    fireEvent.change(screen.getByLabelText('Active team'), {
      target: { value: TEAM_B.id },
    });
    await waitFor(() =>
      expect(authState.setActive).toHaveBeenCalledWith(
        { organizationId: TEAM_B.id },
        { disableSignal: true },
      ),
    );
    view.rerenderWorkspace();

    expect(
      await screen.findByRole('heading', {
        name: 'Beta research team protocols',
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Beta protocol')).toBeInTheDocument();
    expect(screen.queryByText('Alpha protocol')).not.toBeInTheDocument();
  });

  it('reconciles active access after a lost switch response', async () => {
    authState.setActive.mockRejectedValueOnce(new Error('response lost'));
    authState.refetchActiveTeam.mockImplementationOnce(async () => {
      authState.activeTeam = ACTIVE_TEAM_B;
      act(() => authStore.notify());
    });
    authState.refetchActiveMember.mockImplementationOnce(async () => {
      authState.activeMember = BETA_MEMBER;
      act(() => authStore.notify());
    });
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText('Active team'), {
      target: { value: TEAM_B.id },
    });

    expect(
      await screen.findByText(/studio could not switch teams/i),
    ).toBeInTheDocument();
    expect(authState.refetchActiveTeam).toHaveBeenCalledOnce();
    expect(authState.refetchActiveMember).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('heading', {
        name: 'Beta research team protocols',
      }),
    ).toBeInTheDocument();
  });

  it('reconciles cleared active access after a rejected switch', async () => {
    authState.setActive.mockResolvedValueOnce({
      data: null,
      error: { message: 'team is no longer available' },
    });
    authState.refetchActiveTeam.mockImplementationOnce(async () => {
      authState.activeTeam = undefined;
      act(() => authStore.notify());
    });
    authState.refetchActiveMember.mockImplementationOnce(async () => {
      authState.activeMember = undefined;
      act(() => authStore.notify());
    });
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText('Active team'), {
      target: { value: TEAM_B.id },
    });

    expect(
      await screen.findByText(/studio could not switch teams/i),
    ).toBeInTheDocument();
    expect(authState.refetchActiveTeam).toHaveBeenCalledOnce();
    expect(authState.refetchActiveMember).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByLabelText('Active team')).toHaveValue(''),
    );
    expect(screen.queryByText('Alpha protocol')).not.toBeInTheDocument();
  });

  it('prevents a delayed automatic refresh from overwriting a later switch', async () => {
    const firstTeamReconciliation = deferred<void>();
    const firstMemberReconciliation = deferred<void>();
    const launchAutomaticRefresh = deferred<void>();
    const finishAutomaticRefresh = deferred<void>();
    let persistedTeam = ACTIVE_TEAM_A;
    let persistedMember = OWNER;
    let setActiveCalls = 0;
    let teamRefetchCalls = 0;
    let memberRefetchCalls = 0;

    authState.setActive.mockImplementation(
      (
        input: { organizationId: string },
        fetchOptions?: { disableSignal?: boolean },
      ) => {
        setActiveCalls += 1;
        if (input.organizationId === TEAM_B.id) {
          persistedTeam = ACTIVE_TEAM_B;
          persistedMember = BETA_MEMBER;
        } else {
          persistedTeam = ACTIVE_TEAM_A;
          persistedMember = OWNER;
        }

        if (setActiveCalls === 1 && !fetchOptions?.disableSignal) {
          void launchAutomaticRefresh.promise.then(async () => {
            const staleTeam = persistedTeam;
            const staleMember = persistedMember;
            await finishAutomaticRefresh.promise;
            authState.activeTeam = staleTeam;
            authState.activeMember = staleMember;
            act(() => authStore.notify());
          });
        }

        return Promise.resolve({ data: persistedTeam, error: null });
      },
    );
    authState.refetchActiveTeam.mockImplementation(async () => {
      teamRefetchCalls += 1;
      const response = persistedTeam;
      if (teamRefetchCalls === 1) await firstTeamReconciliation.promise;
      authState.activeTeam = response;
      act(() => authStore.notify());
    });
    authState.refetchActiveMember.mockImplementation(async () => {
      memberRefetchCalls += 1;
      const response = persistedMember;
      if (memberRefetchCalls === 1) await firstMemberReconciliation.promise;
      authState.activeMember = response;
      act(() => authStore.notify());
    });
    renderWorkspace();

    fireEvent.change(await screen.findByLabelText('Active team'), {
      target: { value: TEAM_B.id },
    });
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledOnce(),
    );
    await act(async () => launchAutomaticRefresh.resolve());
    await act(async () => firstTeamReconciliation.resolve());
    await waitFor(() =>
      expect(authState.refetchActiveMember).toHaveBeenCalledOnce(),
    );
    await act(async () => firstMemberReconciliation.resolve());
    await waitFor(() =>
      expect(screen.getByLabelText('Active team')).toBeEnabled(),
    );

    fireEvent.change(screen.getByLabelText('Active team'), {
      target: { value: TEAM_A.id },
    });
    await waitFor(() => expect(authState.setActive).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByLabelText('Active team')).toHaveValue(TEAM_A.id),
    );

    await act(async () => finishAutomaticRefresh.resolve());
    expect(screen.getByLabelText('Active team')).toHaveValue(TEAM_A.id);
    expect(authState.setActive).toHaveBeenNthCalledWith(
      1,
      { organizationId: TEAM_B.id },
      { disableSignal: true },
    );
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
    const { router } = renderWorkspace();

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Protocol name' }),
      { target: { value: 'Stable team protocol' } },
    );
    const create = screen.getByRole('button', { name: 'Create protocol' });
    fireEvent.click(create);
    await screen.findByText(/protocol could not be created/i);
    fireEvent.click(create);

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(
        /^\/teams\/team-a\/protocols\/[0-9a-f-]+\/drafts\/[0-9a-f-]+$/,
      ),
    );
    expect(fixtures.createProtocol).toHaveBeenCalledTimes(2);
    expect(fixtures.createProtocol.mock.calls[1]?.[0]).toEqual(
      fixtures.createProtocol.mock.calls[0]?.[0],
    );
  });

  it('retains each team creation identity while switching away and back', async () => {
    fixtures.createProtocol
      .mockRejectedValueOnce(new Error('response lost'))
      .mockImplementationOnce(
        (input: { protocolId: string; draftId: string }) =>
          Promise.resolve({
            protocolId: input.protocolId,
            draftId: input.draftId,
          }),
      );
    const view = renderWorkspace();

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Protocol name' }),
      { target: { value: 'Persistent retry protocol' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create protocol' }));
    await screen.findByText(/protocol could not be created/i);

    fireEvent.change(screen.getByLabelText('Active team'), {
      target: { value: TEAM_B.id },
    });
    await waitFor(() =>
      expect(authState.setActive).toHaveBeenLastCalledWith(
        { organizationId: TEAM_B.id },
        { disableSignal: true },
      ),
    );
    view.rerenderWorkspace();
    await screen.findByRole('heading', {
      name: 'Beta research team protocols',
    });

    fireEvent.change(screen.getByLabelText('Active team'), {
      target: { value: TEAM_A.id },
    });
    await waitFor(() =>
      expect(authState.setActive).toHaveBeenLastCalledWith(
        { organizationId: TEAM_A.id },
        { disableSignal: true },
      ),
    );
    view.rerenderWorkspace();

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Protocol name' }),
      { target: { value: 'Persistent retry protocol' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create protocol' }));

    await waitFor(() =>
      expect(fixtures.createProtocol).toHaveBeenCalledTimes(2),
    );
    expect(fixtures.createProtocol.mock.calls[1]?.[0]).toEqual(
      fixtures.createProtocol.mock.calls[0]?.[0],
    );
  });

  it('creates an invitation with the selected team and role', async () => {
    renderWorkspace();
    const email = await screen.findByRole('textbox', {
      name: 'Email address',
    });
    fireEvent.change(email, { target: { value: 'new@example.com' } });
    fireEvent.change(
      await screen.findByRole('combobox', { name: /team role/i }),
      {
        target: { value: 'admin' },
      },
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

  it('blocks team switching until invitation creation and reconciliation finish', async () => {
    const invitation = deferred<{
      invitationId: string;
      email: string;
      role: 'admin';
      status: 'pending';
      expiresAt: Date;
    }>();
    const reconciliation = deferred<void>();
    fixtures.createInvitation.mockReturnValueOnce(invitation.promise);
    authState.refetchActiveTeam.mockReturnValueOnce(reconciliation.promise);
    renderWorkspace();

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Email address' }),
      { target: { value: 'pending-invite@example.com' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));

    await waitFor(() =>
      expect(fixtures.createInvitation).toHaveBeenCalledOnce(),
    );
    expect(screen.getByLabelText('Active team')).toBeDisabled();
    await act(async () =>
      invitation.resolve({
        invitationId: 'pending-invitation',
        email: 'pending-invite@example.com',
        role: 'admin',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    );
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledOnce(),
    );
    expect(screen.getByLabelText('Active team')).toBeDisabled();
    await act(async () => reconciliation.resolve());
    await waitFor(() =>
      expect(screen.getByLabelText('Active team')).toBeEnabled(),
    );
  });

  it('blocks team switching until a role update and reconciliation finish', async () => {
    const roleUpdate = deferred<{ memberId: string; role: 'admin' }>();
    const teamReconciliation = deferred<void>();
    const memberReconciliation = deferred<void>();
    fixtures.updateMemberRole.mockReturnValueOnce(roleUpdate.promise);
    authState.refetchActiveTeam.mockReturnValueOnce(teamReconciliation.promise);
    authState.refetchActiveMember.mockReturnValueOnce(
      memberReconciliation.promise,
    );
    renderWorkspace();

    fireEvent.change(
      await screen.findByLabelText('Role for Team Collaborator'),
      { target: { value: 'admin' } },
    );

    await waitFor(() =>
      expect(fixtures.updateMemberRole).toHaveBeenCalledOnce(),
    );
    expect(screen.getByLabelText('Active team')).toBeDisabled();
    await act(async () =>
      roleUpdate.resolve({ memberId: COLLABORATOR.id, role: 'admin' }),
    );
    await waitFor(() => {
      expect(authState.refetchActiveTeam).toHaveBeenCalledOnce();
      expect(authState.refetchActiveMember).toHaveBeenCalledOnce();
    });
    expect(screen.getByLabelText('Active team')).toBeDisabled();
    await act(async () => {
      teamReconciliation.resolve();
      memberReconciliation.resolve();
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Active team')).toBeEnabled(),
    );
  });

  it('moves focus into the cleared invitation form after creation', async () => {
    renderWorkspace();
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
      const reconciledTeam = {
        ...ACTIVE_TEAM_A,
        invitations: [...ACTIVE_TEAM_A.invitations, reconciledInvitation],
      };
      authState.activeTeam = reconciledTeam;
    });
    const view = renderWorkspace();

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Email address' }),
      { target: { value: 'reconciled@example.com' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));

    expect(
      await screen.findByText(/could not confirm the invitation/i),
    ).toBeInTheDocument();
    expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(1);
    view.rerenderWorkspace();
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
    renderWorkspace();

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
    expect(authState.activeTeam?.invitations).toContainEqual(
      expect.objectContaining({ email: 'new@example.com' }),
    );
    expect(await screen.findByText('new@example.com')).toBeInTheDocument();
    expect(fixtures.createInvitation).toHaveBeenCalledTimes(1);
  });

  it('validates invitation email before submitting it', async () => {
    renderWorkspace();

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

  it('updates a member role in the active team', async () => {
    renderWorkspace();
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
    renderWorkspace();

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
    renderWorkspace();

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
    renderWorkspace();

    fireEvent.change(
      await screen.findByLabelText('Role for Team Collaborator'),
      { target: { value: 'admin' } },
    );

    expect(
      await screen.findByText(/team role updated.*could not be refreshed/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/team role could not be changed/i),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh team details' }),
    );
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(2),
    );
    await screen.findByText('Team role updated. Team details refreshed.');
    expect(authState.activeTeam?.members).toContainEqual(
      expect.objectContaining({ id: COLLABORATOR.id, role: 'admin' }),
    );
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
    renderWorkspace();

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
    expect(
      await screen.findByLabelText('Role for Team Collaborator'),
    ).toHaveValue('admin');
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
    renderWorkspace();

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
    const view = renderWorkspace();

    fireEvent.change(
      await screen.findByLabelText('Role for Team Collaborator'),
      { target: { value: 'member' } },
    );

    await waitFor(() =>
      expect(authState.refetchActiveMember).toHaveBeenCalledTimes(1),
    );
    view.rerenderWorkspace();
    expect(
      await screen.findByText(
        'Only team owners and admins can invite people or change roles.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite user' })).toBeNull();
  });

  it('cancels a pending invitation in the active team', async () => {
    renderWorkspace();
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
    renderWorkspace();

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
    renderWorkspace();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Cancel invitation for pending@example.com',
      }),
    );

    expect(
      await screen.findByText(/invitation cancelled.*could not be refreshed/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/invitation could not be cancelled/i),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh team details' }),
    );
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(2),
    );
    await screen.findByText(
      'Invitation cancelled for pending@example.com. Team details refreshed.',
    );
    expect(authState.activeTeam?.invitations).toContainEqual(
      expect.objectContaining({ id: 'invitation-1', status: 'canceled' }),
    );
    expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument();
    expect(fixtures.cancelInvitation).toHaveBeenCalledTimes(1);
  });

  it('shows roles without management controls to ordinary members', async () => {
    authState.activeMember = COLLABORATOR;
    renderWorkspace();

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
    renderWorkspace();

    expect(
      await screen.findByLabelText('Role for Team Collaborator'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Role for Owner Researcher')).toBeNull();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('does not auto-activate repeatedly when the active team fails to load', async () => {
    authState.activeTeam = undefined;
    authState.activeTeamError = new Error('load failed');
    renderWorkspace();

    expect(
      await screen.findByText(/could not load the active team/i),
    ).toBeInTheDocument();
    expect(authState.setActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry team access' }));
    await waitFor(() => {
      expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(1);
      expect(authState.refetchActiveMember).toHaveBeenCalledTimes(1);
    });
  });

  it('waits for membership in the selected team before exposing controls', async () => {
    authState.activeTeam = ACTIVE_TEAM_B;
    authState.activeMember = OWNER;
    renderWorkspace();

    expect(await screen.findByText('Loading team access…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite user' })).toBeNull();
    expect(screen.queryByText('Beta protocol')).toBeNull();
  });

  it('disables team switching until both access hooks finish loading', async () => {
    authState.activeMemberPending = true;
    const memberPendingView = renderWorkspace();

    expect(await screen.findByLabelText('Active team')).toBeDisabled();
    memberPendingView.unmount();

    authState.activeMemberPending = false;
    authState.activeTeamPending = true;
    const teamPendingView = renderWorkspace();

    expect(await screen.findByLabelText('Active team')).toBeDisabled();
    teamPendingView.unmount();

    authState.activeTeamPending = false;
    authState.activeMemberPending = false;
    renderWorkspace();

    expect(await screen.findByLabelText('Active team')).toBeEnabled();
  });

  it('disables team switching while either access hook is refetching', async () => {
    authState.activeMemberRefetching = true;
    const memberRefetchView = renderWorkspace();

    expect(await screen.findByLabelText('Active team')).toBeDisabled();
    memberRefetchView.unmount();

    authState.activeMemberRefetching = false;
    authState.activeTeamRefetching = true;
    const teamRefetchView = renderWorkspace();

    expect(await screen.findByLabelText('Active team')).toBeDisabled();
    teamRefetchView.unmount();

    authState.activeTeamRefetching = false;
    renderWorkspace();

    expect(await screen.findByLabelText('Active team')).toBeEnabled();
  });

  it('does not navigate to a protocol whose team stopped being active during creation', async () => {
    let resolveCreation: (() => void) | undefined;
    fixtures.createProtocol.mockImplementationOnce(
      (input: { protocolId: string; draftId: string }) =>
        new Promise<{ protocolId: string; draftId: string }>((resolve) => {
          resolveCreation = () => resolve(input);
        }),
    );
    const view = renderWorkspace();

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Protocol name' }),
      { target: { value: 'Team-specific protocol' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create protocol' }));

    await waitFor(() => expect(fixtures.createProtocol).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Active team')).toBeDisabled();

    authState.activeTeam = ACTIVE_TEAM_B;
    authState.activeMember = BETA_MEMBER;
    act(() => authStore.notify());
    await screen.findByRole('heading', {
      name: 'Beta research team protocols',
    });
    resolveCreation?.();

    await waitFor(() =>
      expect(screen.getByLabelText('Active team')).toBeEnabled(),
    );
    expect(view.router.state.location.pathname).toBe('/');
  });

  it('ignores the empty team placeholder', async () => {
    const view = renderWorkspace();
    const team = await screen.findByLabelText('Active team');

    fireEvent.change(team, { target: { value: '' } });
    view.rerenderWorkspace();

    expect(authState.setActive).not.toHaveBeenCalled();
    expect(team).toHaveValue(TEAM_A.id);
  });
});
