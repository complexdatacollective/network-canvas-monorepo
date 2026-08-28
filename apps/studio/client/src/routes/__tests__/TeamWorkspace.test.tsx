// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  const authState: {
    activeTeam: typeof ACTIVE_TEAM_A | typeof ACTIVE_TEAM_B | undefined;
    activeMember:
      | typeof OWNER
      | typeof COLLABORATOR
      | typeof BETA_MEMBER
      | undefined;
    setActive: ReturnType<typeof vi.fn>;
    inviteMember: ReturnType<typeof vi.fn>;
    updateMemberRole: ReturnType<typeof vi.fn>;
    refetchActiveTeam: ReturnType<typeof vi.fn>;
    refetchActiveMember: ReturnType<typeof vi.fn>;
    activeTeamError: Error | null;
    activeMemberError: Error | null;
  } = {
    activeTeam: undefined,
    activeMember: undefined,
    setActive: vi.fn(),
    inviteMember: vi.fn(),
    updateMemberRole: vi.fn(),
    refetchActiveTeam: vi.fn(),
    refetchActiveMember: vi.fn(),
    activeTeamError: null,
    activeMemberError: null,
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
  authState,
} = fixtures;

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Owner Researcher', email: 'owner@example.com' } },
      isPending: false,
    }),
    useListOrganizations: vi.fn().mockReturnValue({
      data: [fixtures.TEAM_A, fixtures.TEAM_B],
      isPending: false,
      error: null,
    }),
    useActiveOrganization: vi.fn(() => ({
      data: fixtures.authState.activeTeam,
      isPending: false,
      error: fixtures.authState.activeTeamError,
      refetch: fixtures.authState.refetchActiveTeam,
    })),
    useActiveMember: vi.fn(() => ({
      data: fixtures.authState.activeMember,
      isPending: false,
      error: fixtures.authState.activeMemberError,
      refetch: fixtures.authState.refetchActiveMember,
    })),
    organization: {
      setActive: fixtures.authState.setActive,
      inviteMember: fixtures.authState.inviteMember,
      updateMemberRole: fixtures.authState.updateMemberRole,
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
  rpcClient: { protocols: {} },
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

beforeEach(() => {
  vi.clearAllMocks();
  authState.activeTeam = ACTIVE_TEAM_A;
  authState.activeMember = OWNER;
  authState.activeTeamError = null;
  authState.activeMemberError = null;
  authState.setActive.mockImplementation(
    (input: { organizationId: string }) => {
      if (input.organizationId === TEAM_B.id) {
        authState.activeTeam = ACTIVE_TEAM_B;
        authState.activeMember = BETA_MEMBER;
      }
      return Promise.resolve({ data: authState.activeTeam, error: null });
    },
  );
  authState.inviteMember.mockResolvedValue({ data: {}, error: null });
  authState.updateMemberRole.mockResolvedValue({ data: {}, error: null });
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

  it('switches the active team and scopes the protocol list to it', async () => {
    const view = renderWorkspace();
    await screen.findByText('Alpha protocol');

    fireEvent.change(screen.getByLabelText('Active team'), {
      target: { value: TEAM_B.id },
    });
    await waitFor(() =>
      expect(authState.setActive).toHaveBeenCalledWith({
        organizationId: TEAM_B.id,
      }),
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
      expect(authState.inviteMember).toHaveBeenCalledWith({
        email: 'new@example.com',
        role: 'admin',
        organizationId: TEAM_A.id,
      }),
    );
    expect(
      await screen.findByText('Invitation created for new@example.com.'),
    ).toBeInTheDocument();
  });

  it('updates a member role in the active team', async () => {
    renderWorkspace();
    const role = await screen.findByLabelText('Role for Team Collaborator');
    fireEvent.change(role, { target: { value: 'admin' } });

    await waitFor(() =>
      expect(authState.updateMemberRole).toHaveBeenCalledWith({
        memberId: COLLABORATOR.id,
        role: 'admin',
        organizationId: TEAM_A.id,
      }),
    );
    expect(await screen.findByText('Team role updated.')).toBeInTheDocument();
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

  it('ignores the empty team placeholder', async () => {
    const view = renderWorkspace();
    const team = await screen.findByLabelText('Active team');

    fireEvent.change(team, { target: { value: '' } });
    view.rerenderWorkspace();

    expect(authState.setActive).not.toHaveBeenCalled();
    expect(team).toHaveValue(TEAM_A.id);
  });
});
