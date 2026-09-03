// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  const studiesByTeam = {
    'team-a': [
      {
        id: 'study-a',
        name: 'Alpha study',
        state: 'draft',
        participationMode: 'managed',
        protocolId: 'protocol-a',
        createdAt: new Date('2026-08-28T00:00:00Z'),
        waveCount: 0,
        participantCount: 0,
      },
      {
        id: 'study-a-live',
        name: 'Alpha fieldwork',
        state: 'live',
        participationMode: 'anonymous',
        protocolId: 'protocol-a-live',
        createdAt: new Date('2026-08-27T00:00:00Z'),
        waveCount: 2,
        participantCount: 1,
      },
    ],
    'team-b': [
      {
        id: 'study-b',
        name: 'Beta study',
        state: 'draft',
        participationMode: 'managed',
        protocolId: 'protocol-b',
        createdAt: new Date('2026-08-28T00:00:00Z'),
        waveCount: 0,
        participantCount: 0,
      },
    ],
  };
  const createStudy = vi.fn();
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
    studiesByTeam,
    createStudy,
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
    me: {
      queryOptions: () => ({
        queryKey: ['me'],
        queryFn: () => ({
          userId: 'user-1',
          email: 'researcher@example.org',
          emailVerified: true,
          name: 'Researcher',
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
          deployment: { mode: 'managed', billing: false },
        }),
      }),
    },
    studies: {
      list: {
        queryOptions: ({ input }: { input: { teamId: string } }) => ({
          queryKey: ['studies', input.teamId],
          queryFn: () =>
            fixtures.studiesByTeam[
              input.teamId as keyof typeof fixtures.studiesByTeam
            ] ?? [],
        }),
        key: ({ input }: { input: { teamId: string } }) => [
          'studies',
          input.teamId,
        ],
      },
      get: {
        queryOptions: () => ({ queryKey: ['study'], queryFn: vi.fn() }),
        key: () => ['study'],
      },
      create: {
        mutationOptions: (options: object) => ({
          mutationFn: fixtures.createStudy,
          ...options,
        }),
      },
    },
    protocols: {
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

/** The two halves §5.4 split the shipped team screen into. */
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
  fixtures.createStudy.mockImplementation(
    (input: { studyId: string; protocolId: string; draftId: string }) =>
      Promise.resolve({
        studyId: input.studyId,
        protocolId: input.protocolId,
        draftId: input.draftId,
      }),
  );
  authState.refetchActiveTeam.mockResolvedValue(undefined);
  authState.refetchActiveMember.mockResolvedValue(undefined);
});
/**
 * §5.4's split of the shipped team screen, asserted at the two addresses it
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
    // The link addresses the STUDY, which is no longer the protocol it points
    // at: a list that named the protocol id would send every study URL to the
    // wrong object the moment a study retargets its protocol line.
    expect(
      await screen.findByRole('link', { name: 'Alpha study' }),
    ).toHaveAttribute('href', '/study/study-a');
    expect(screen.queryByText('Beta study')).toBeNull();

    // Where each study is in its lifecycle, and who takes part, on the row
    // itself: choosing between a draft and a live study is the decision this
    // screen exists for.
    const live = screen
      .getByRole('link', { name: 'Alpha fieldwork' })
      .closest('li');
    if (!live) throw new Error('expected the study row to be a list item');
    expect(within(live).getByText('Live')).toBeInTheDocument();
    expect(
      within(live).getByText('Anonymous participants'),
    ).toBeInTheDocument();
    expect(within(live).getByText('2 waves')).toBeInTheDocument();
    expect(within(live).getByText('1 participant')).toBeInTheDocument();

    // A draft study has no waves and no participants, and says so by leaving
    // the counts out rather than by reporting two zeroes.
    const draft = screen
      .getByRole('link', { name: 'Alpha study' })
      .closest('li');
    if (!draft) throw new Error('expected the study row to be a list item');
    expect(within(draft).getByText('Draft')).toBeInTheDocument();
    expect(within(draft).queryByText('0 waves')).toBeNull();
  });

  it('tells a team member that creating studies is not theirs to do', async () => {
    // #1257: creating a study is a team Admin or Owner action, and the
    // procedure refuses everyone else — so a Member is told that once, rather
    // than offered a form whose submission could only fail.
    authState.activeMember = COLLABORATOR;
    renderTeam(STUDIES);

    // The list itself is still theirs — it is how a Member reaches the studies
    // they hold a grant on — and waiting for it is what makes the absences
    // below mean something: this screen has finished rendering.
    expect(
      await screen.findByRole('link', { name: 'Alpha study' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Only team owners and admins can create studies.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Study name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create study' })).toBeNull();
  });

  it('offers creation to an admin of the team in the URL', async () => {
    authState.activeMember = { ...COLLABORATOR, role: 'admin' };
    renderTeam(STUDIES);

    expect(
      await screen.findByRole('button', { name: 'Create study' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Only team owners and admins can create studies.'),
    ).toBeNull();
  });

  it('creates a study and opens its editor', async () => {
    const { router } = renderTeam(STUDIES);

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Study name' }),
      { target: { value: 'New study' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create study' }));

    await waitFor(() =>
      expect(fixtures.createStudy.mock.calls[0]?.[0]).toEqual(
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
    let finishCreation: ((created: { studyId: string }) => void) | undefined;
    fixtures.createStudy.mockImplementation(
      () =>
        new Promise<{ studyId: string }>((resolve) => {
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
      finishCreation?.({ studyId: 'slow-study' });
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

  it('leaves a researcher who came back where they came back to', async () => {
    let finishCreation: ((created: { studyId: string }) => void) | undefined;
    fixtures.createStudy.mockImplementation(
      () =>
        new Promise<{ studyId: string }>((resolve) => {
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

    // Away and back, both before the response lands. The address the request
    // was made from is the address the researcher is on again — so a
    // continuation that asks "am I still where I was?" by comparing pathnames
    // is told yes, and pulls them into an editor from a navigation they made
    // two screens ago.
    await act(() =>
      router.navigate({ to: '/team/$teamId', params: { teamId: TEAM_B.id } }),
    );
    expect(
      await screen.findByRole('link', { name: 'Beta study' }),
    ).toBeInTheDocument();
    await act(() =>
      router.navigate({ to: '/team/$teamId', params: { teamId: TEAM_A.id } }),
    );
    expect(
      await screen.findByRole('link', { name: 'Alpha study' }),
    ).toBeInTheDocument();

    await act(async () => {
      finishCreation?.({ studyId: 'slow-study' });
    });

    // Waiting for the form to finish submitting is what makes this able to
    // fail: the navigation the guard suppresses happens BEFORE that.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Create study' }),
      ).toBeEnabled(),
    );
    // The team's studies, still RENDERED — not the editor of a study created
    // three navigations ago.
    expect(
      screen.getByRole('link', { name: 'Alpha study' }),
    ).toBeInTheDocument();
    expect(router.state.resolvedLocation?.pathname).toBe(STUDIES);
  });

  it('reuses the creation identity after a lost response', async () => {
    fixtures.createStudy
      .mockRejectedValueOnce(new Error('response lost'))
      .mockImplementationOnce(
        (input: { studyId: string; protocolId: string; draftId: string }) =>
          Promise.resolve({
            studyId: input.studyId,
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
    expect(fixtures.createStudy).toHaveBeenCalledTimes(2);
    expect(fixtures.createStudy.mock.calls[1]?.[0]).toEqual(
      fixtures.createStudy.mock.calls[0]?.[0],
    );
  });

  it('does not carry a creation identity across a team switch', async () => {
    fixtures.createStudy.mockRejectedValueOnce(new Error('response lost'));
    const { router } = renderTeam(STUDIES);

    const nameIn = async (value: string) => {
      const field = await screen.findByRole('textbox', { name: 'Study name' });
      // Cleared first: the header switches teams without remounting this
      // screen, so the field may still hold what was typed into it before.
      fireEvent.change(field, { target: { value: '' } });
      fireEvent.change(field, { target: { value } });
    };

    await nameIn('Shared name');
    fireEvent.click(screen.getByRole('button', { name: 'Create study' }));
    await screen.findByText(/study could not be created/i);

    await act(() =>
      router.navigate({ to: '/team/$teamId', params: { teamId: TEAM_B.id } }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/team/${TEAM_B.id}`),
    );

    await nameIn('Shared name');
    fireEvent.click(screen.getByRole('button', { name: 'Create study' }));

    await waitFor(() => expect(fixtures.createStudy).toHaveBeenCalledTimes(2));
    const [first, second] = fixtures.createStudy.mock.calls.map(
      ([input]) =>
        input as {
          teamId: string;
          studyId: string;
          protocolId: string;
          draftId: string;
        },
    );
    expect(first?.teamId).toBe(TEAM_A.id);
    expect(second?.teamId).toBe(TEAM_B.id);
    // A protocol id is unique across the whole instance, not within a team.
    // Reusing team A's here is not a harmless duplicate: if A's ambiguous
    // request had actually committed, the id is taken, and the server refuses
    // B's creation outright — the researcher cannot create a study in team B
    // under that name at all.
    expect(second?.studyId).not.toBe(first?.studyId);
    expect(second?.protocolId).not.toBe(first?.protocolId);
    expect(second?.draftId).not.toBe(first?.draftId);
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
