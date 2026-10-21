// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Effect, Redacted } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemberId, TeamId } from '@codaco/studio-contract/schema/ids';
import type { InstanceStatus } from '@codaco/studio-contract/schema/status';

import { authClient } from '../../lib/auth.ts';
import { createAppRouter } from '../../router.tsx';
import { installRpcHarness } from '../../test/rpcHarness.ts';

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn(),
    useSession: vi.fn(),
    useListOrganizations: vi.fn(),
    useActiveOrganization: vi.fn(),
    useActiveMember: vi.fn(),
    organization: { setActive: vi.fn(), list: vi.fn() },
    signIn: { magicLink: vi.fn(), social: vi.fn(), email: vi.fn() },
    signOut: vi.fn(),
  },
}));

const mocked = vi.mocked(authClient, true);

type GetSessionResult = Awaited<ReturnType<typeof authClient.getSession>>;
type ListResult = Awaited<ReturnType<typeof authClient.organization.list>>;
type MagicLinkResult = Awaited<ReturnType<typeof authClient.signIn.magicLink>>;
type SocialResult = Awaited<ReturnType<typeof authClient.signIn.social>>;

const EXISTING_TEAM = { id: 'team-a', name: 'Alpha research team' };
const NEW_TEAM = { id: 'team-new', name: 'Lab of Networks' };

const fixtures = {
  deployment: {
    mode: 'managed',
    billing: false,
  } as InstanceStatus['deployment'],
  signedIn: true,
  teams: [] as { id: string; name: string }[],
  canCreateTeam: true,
  created: [] as string[],
};

const DEFERRED_FUNNEL_STEPS = [
  '/sign-up/plan',
  '/sign-up/checkout',
  '/sign-up/complete',
];

function status(): InstanceStatus {
  return {
    name: 'Network Canvas Studio',
    version: '0.1.0',
    auth: {
      enabled: true,
      magicLink: true,
      emailAndPassword: true,
      socialProviders: ['google', 'microsoft'],
    },
    deployment: fixtures.deployment,
    setup: { required: false },
    telemetry: false,
    logLevel: 'Info',
  };
}

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [url] }),
    queryClient,
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function linkTargets(): (string | null)[] {
  return screen.queryAllByRole('link').map((link) => link.getAttribute('href'));
}

beforeEach(() => {
  vi.resetAllMocks();
  fixtures.deployment = { mode: 'managed', billing: false };
  fixtures.signedIn = true;
  fixtures.teams = [];
  fixtures.canCreateTeam = true;
  fixtures.created = [];

  installRpcHarness({
    'status': () => Effect.sync(status),
    'me': () =>
      Effect.sync(() => ({
        userId: 'user-1',
        email: Redacted.make('researcher@example.org'),
        emailVerified: true,
        name: Redacted.make('Researcher'),
        locale: null,
        teams: fixtures.teams.map((team) => ({
          teamId: TeamId.make(team.id),
          role: 'owner',
        })),
        canCreateTeam: fixtures.canCreateTeam,
      })),
    'team.create': ({ name }) =>
      Effect.sync(() => {
        fixtures.created.push(Redacted.value(name));
        fixtures.teams = [NEW_TEAM];
        return {
          teamId: TeamId.make(NEW_TEAM.id),
          teamName: name,
          memberId: MemberId.make('member-new'),
        };
      }),
    'studies.list': () => Effect.succeed([]),
  });

  mocked.getSession.mockImplementation(() =>
    Promise.resolve(
      (fixtures.signedIn
        ? {
            data: {
              user: { id: 'user-1' },
              session: { id: 'session-1', activeOrganizationId: null },
            },
            error: null,
          }
        : { data: null, error: null }) as unknown as GetSessionResult,
    ),
  );
  mocked.organization.list.mockImplementation(() =>
    Promise.resolve({
      data: fixtures.teams,
      error: null,
    } as unknown as ListResult),
  );
  mocked.organization.setActive.mockResolvedValue({
    data: null,
    error: null,
  } as unknown as Awaited<
    ReturnType<typeof authClient.organization.setActive>
  >);
  mocked.useListOrganizations.mockImplementation(
    () =>
      ({
        data: fixtures.teams,
        isPending: false,
        error: null,
        refetch: vi.fn(),
      }) as unknown as ReturnType<typeof authClient.useListOrganizations>,
  );
  mocked.useActiveOrganization.mockImplementation(
    () =>
      ({
        data: { ...NEW_TEAM, members: [], invitations: [] },
        isPending: false,
        error: null,
        refetch: vi.fn(),
      }) as unknown as ReturnType<typeof authClient.useActiveOrganization>,
  );
  mocked.useActiveMember.mockImplementation(
    () =>
      ({
        data: { id: 'member-new', organizationId: NEW_TEAM.id, role: 'owner' },
        isPending: false,
        error: null,
        refetch: vi.fn(),
      }) as unknown as ReturnType<typeof authClient.useActiveMember>,
  );
  mocked.signIn.magicLink.mockResolvedValue({
    data: { status: true },
    error: null,
  } as unknown as MagicLinkResult);
  mocked.signIn.social.mockResolvedValue({
    data: { url: 'https://accounts.example.com', redirect: true },
    error: null,
  } as unknown as SocialResult);
});

describe('/sign-up', () => {
  beforeEach(() => {
    fixtures.signedIn = false;
  });

  it('offers a magic link, Google and Microsoft, and no password', async () => {
    renderAt('/sign-up');

    await screen.findByRole('heading', { level: 1, name: 'Create an account' });
    expect(
      await screen.findByRole('textbox', { name: /Email address/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with Microsoft' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).toBeNull();
    expect(screen.queryByRole('button', { name: /password/i })).toBeNull();
  });

  it('sends the magic link back to the team step', async () => {
    renderAt('/sign-up');

    fireEvent.change(
      await screen.findByRole('textbox', { name: /Email address/ }),
      { target: { value: 'new@example.org' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-up link' }));

    await waitFor(() =>
      expect(mocked.signIn.magicLink).toHaveBeenCalledWith({
        email: 'new@example.org',
        callbackURL: '/sign-up/team',
        errorCallbackURL: '/sign-up',
      }),
    );
    expect(
      await screen.findByText(/We sent a link to new@example\.org/),
    ).toBeInTheDocument();
  });

  it('sends a provider sign-up back to the team step', async () => {
    renderAt('/sign-up');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Continue with Microsoft' }),
    );

    await waitFor(() =>
      expect(mocked.signIn.social).toHaveBeenCalledWith({
        provider: 'microsoft',
        callbackURL: '/sign-up/team',
        errorCallbackURL: '/sign-up',
      }),
    );
  });

  it('links to sign-in, and to no deferred funnel step', async () => {
    renderAt('/sign-up');
    await screen.findByRole('textbox', { name: /Email address/ });

    expect(
      screen.getByRole('link', { name: 'Already have an account? Sign in' }),
    ).toHaveAttribute('href', '/sign-in');
    for (const step of DEFERRED_FUNNEL_STEPS) {
      expect(linkTargets()).not.toContain(step);
    }
  });

  it('explains a failed link it was sent back with', async () => {
    renderAt('/sign-up?error=EXPIRED_TOKEN');

    expect(
      await screen.findByText(/That sign-up link is no longer valid/),
    ).toBeInTheDocument();
  });

  it('continues a signed-in researcher with no team to the team step', async () => {
    fixtures.signedIn = true;
    const router = renderAt('/sign-up');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-up/team'),
    );
  });

  it('sends a signed-in researcher with a team to their landing destination', async () => {
    fixtures.signedIn = true;
    fixtures.teams = [EXISTING_TEAM];
    const router = renderAt('/sign-up');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-a'),
    );
  });
});

describe('/sign-up/team', () => {
  it('sends a visitor with no session back to /sign-up', async () => {
    fixtures.signedIn = false;
    const router = renderAt('/sign-up/team');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/sign-up'),
    );
  });

  it('sends a researcher who already has a team to their landing destination', async () => {
    fixtures.teams = [EXISTING_TEAM];
    const router = renderAt('/sign-up/team');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-a'),
    );
  });

  it('creates the team and lands on its study list', async () => {
    const router = renderAt('/sign-up/team');

    await screen.findByRole('heading', { level: 1, name: 'Name your team' });
    for (const step of DEFERRED_FUNNEL_STEPS) {
      expect(linkTargets()).not.toContain(step);
    }
    fireEvent.change(screen.getByRole('textbox', { name: /Team name/ }), {
      target: { value: '  Lab of Networks  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-new'),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Studies' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/team/team-new');
    expect(fixtures.created).toEqual(['Lab of Networks']);
  });

  it('lets a researcher sign out or change language before naming a team', async () => {
    renderAt('/sign-up/team');

    await screen.findByRole('heading', { level: 1, name: 'Name your team' });
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /^Interface language:/ }),
    ).toBeInTheDocument();
  });
});

describe('/sign-in', () => {
  beforeEach(() => {
    fixtures.signedIn = false;
  });

  it('links to /sign-up on the managed service', async () => {
    renderAt('/sign-in');

    expect(
      await screen.findByRole('link', {
        name: 'New to Studio? Create an account',
      }),
    ).toHaveAttribute('href', '/sign-up');
  });

  it('offers no account creation on a self-hosted instance', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    renderAt('/sign-in');

    await screen.findByRole('textbox', { name: /Email address/ });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue with Google' })),
    );
    expect(
      screen.queryByRole('link', { name: 'New to Studio? Create an account' }),
    ).toBeNull();
  });

  it('offers no account creation to somebody accepting an invitation', async () => {
    renderAt('/sign-in?invitationId=00000000-0000-4000-8000-000000000123');

    await screen.findByRole('button', { name: 'Continue with Google' });
    expect(
      screen.queryByRole('link', { name: 'New to Studio? Create an account' }),
    ).toBeNull();
  });
});

describe('/no-team', () => {
  const INVITATION =
    /ask one of its owners or admins to invite researcher@example\.org/;

  it('links to the team step on the managed service', async () => {
    renderAt('/no-team');

    expect(
      await screen.findByRole('link', { name: 'Create a team' }),
    ).toHaveAttribute('href', '/sign-up/team');
    expect(await screen.findByText(INVITATION)).toBeInTheDocument();
    for (const step of DEFERRED_FUNNEL_STEPS) {
      expect(linkTargets()).not.toContain(step);
    }
  });

  it('creates a team in place for a self-hosted owner', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    const router = renderAt('/no-team');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create a team' }),
    );
    expect(screen.queryByRole('link', { name: 'Create a team' })).toBeNull();
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /Team name/ }),
      { target: { value: 'Lab of Networks' } },
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create team' }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Studies' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/team/team-new');
    expect(fixtures.created).toEqual(['Lab of Networks']);
  });

  it('explains the invitation path to a self-hosted researcher who may not create teams', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    fixtures.canCreateTeam = false;
    renderAt('/no-team');

    expect(
      await screen.findByText(/only its owner can create teams/),
    ).toBeInTheDocument();
    expect(screen.getByText(INVITATION)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create a team' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Create a team' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });
});
