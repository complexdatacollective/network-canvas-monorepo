// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '@codaco/studio-contract/schema/account';
import { TeamId } from '@codaco/studio-contract/schema/ids';
import type { InstanceStatus } from '@codaco/studio-contract/schema/status';
import { TeamCommandError } from '@codaco/studio-contract/schema/team';

import { createAppRouter } from '../../router.tsx';
import {
  installRpcHarness,
  type StudioHandlers,
} from '../../test/rpcHarness.ts';

/**
 * The one refusal the members screen explains instead of reconciling: a
 * cancellation that races the invitation's delivery job (#1930, design Q15).
 *
 * `team.cancelInvitation` now answers with the contract's real
 * `TeamCommandError` code rather than a flattened `CONFLICT`, so the screen can
 * tell "nothing happened, try again in a moment" from "we cannot tell what
 * happened". Both halves are asserted here: the declared refusal gets the
 * specific sentence, and any other code still gets the reconcile-and-refresh
 * message the screen has always shown, so the branch cannot widen unnoticed.
 */

type Answer<Tag extends keyof StudioHandlers> = (
  payload: Parameters<StudioHandlers[Tag]>[0],
) => ReturnType<StudioHandlers[Tag]>;

const fixtures = vi.hoisted(() => {
  const TEAM = {
    id: 'team-a',
    name: 'Alpha research team',
    slug: 'alpha-research-team',
    createdAt: new Date('2026-08-28T00:00:00Z'),
  };
  const OWNER = {
    id: 'membership-owner',
    organizationId: TEAM.id,
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
  const ACTIVE_TEAM = {
    ...TEAM,
    logo: null,
    metadata: null,
    members: [OWNER],
    invitations: [
      {
        id: 'invitation-1',
        organizationId: TEAM.id,
        inviterId: OWNER.userId,
        email: 'pending@example.com',
        role: 'admin',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date('2026-08-28T00:00:00Z'),
      },
    ],
  };
  const cancelInvitation = vi.fn<Answer<'team.cancelInvitation'>>();
  const authState = {
    refetchActiveTeam: vi.fn(),
    refetchActiveMember: vi.fn(),
  };
  return { TEAM, OWNER, ACTIVE_TEAM, cancelInvitation, authState };
});

const { TEAM, authState } = fixtures;

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Owner Researcher', email: 'owner@example.com' } },
      isPending: false,
    }),
    useListOrganizations: vi.fn().mockReturnValue({
      data: [fixtures.TEAM],
      isPending: false,
      error: null,
    }),
    useActiveOrganization: vi.fn(() => ({
      data: fixtures.ACTIVE_TEAM,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: fixtures.authState.refetchActiveTeam,
    })),
    useActiveMember: vi.fn(() => ({
      data: fixtures.OWNER,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: fixtures.authState.refetchActiveMember,
    })),
    organization: {
      setActive: vi.fn(() =>
        Promise.resolve({ data: fixtures.ACTIVE_TEAM, error: null }),
      ),
      // The app shell's guard resolves memberships before it renders any app
      // route (§6.4), so this researcher has to belong to something.
      list: vi.fn(() =>
        Promise.resolve({ data: [fixtures.TEAM], error: null }),
      ),
    },
    signOut: vi.fn(),
  },
}));

const ME: Me = {
  userId: 'user-owner',
  email: 'owner@example.com',
  emailVerified: true,
  name: 'Owner Researcher',
  locale: null,
  teams: [{ teamId: TeamId.make(TEAM.id), role: 'owner' }],
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

const MEMBERS = `/team/${TEAM.id}/members`;

function renderMembers() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [MEMBERS] }),
    queryClient,
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const cancelPendingInvitation = async () =>
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Cancel invitation for pending@example.com',
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  authState.refetchActiveTeam.mockResolvedValue(undefined);
  authState.refetchActiveMember.mockResolvedValue(undefined);
  installRpcHarness({
    'me': () => Effect.succeed(ME),
    'status': () => Effect.succeed(STATUS),
    'studies.list': () => Effect.succeed([]),
    'team.cancelInvitation': (payload) => fixtures.cancelInvitation(payload),
  });
});

describe('cancelling an invitation the delivery job is holding', () => {
  it('says the invitation is being sent rather than asking for a refresh', async () => {
    fixtures.cancelInvitation.mockReturnValue(
      Effect.fail(new TeamCommandError({ code: 'DELIVERY_IN_PROGRESS' })),
    );
    renderMembers();

    await cancelPendingInvitation();

    expect(
      await screen.findByText(
        'This invitation is being sent right now. Try again in a moment.',
      ),
    ).toBeInTheDocument();
    // The refusal is confirmed, so the screen neither claims uncertainty nor
    // offers the recovery button that uncertainty comes with.
    expect(
      screen.queryByText(/could not confirm whether the invitation/i),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Refresh team details' }),
    ).toBeNull();
    // Nothing was cancelled, so the invitation is still listed.
    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    // The team is still refreshed: every mutation on this screen is reconciled
    // the same way, and the refusal changes what the researcher is TOLD, not
    // whether the screen goes back for the team's state.
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(1),
    );
    // "Try again in a moment" is only true if there is something to try again
    // with. The screen disables every team mutation while one is in flight, so
    // the sentence is a lie unless this button comes back — which it does only
    // because the `finally` that clears the in-flight invitation still runs
    // through the early return this branch takes.
    expect(
      await screen.findByRole('button', {
        name: 'Cancel invitation for pending@example.com',
      }),
    ).toBeEnabled();
  });

  it('keeps the reconcile message for every other refusal', async () => {
    fixtures.cancelInvitation.mockReturnValue(
      Effect.fail(new TeamCommandError({ code: 'CONFLICT' })),
    );
    renderMembers();

    await cancelPendingInvitation();

    expect(
      await screen.findByText(
        /could not confirm whether the invitation was cancelled/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'This invitation is being sent right now. Try again in a moment.',
      ),
    ).toBeNull();
    await waitFor(() =>
      expect(authState.refetchActiveTeam).toHaveBeenCalledTimes(1),
    );
  });
});
