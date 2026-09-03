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
  /** Whether `getSession` answers with a session, read at call time. */
  signedIn: true,
  /**
   * How many `getSession` reads answer normally before the rest answer with an
   * error — the shape better-fetch resolves a refused read with. The landing
   * resolution reads the session a SECOND time, after the guard's read has
   * already succeeded, so a transient failure is a failure of that one.
   */
  successfulSessionReads: Number.POSITIVE_INFINITY,
  sessionReads: 0,
  /** What `organization.list` answers with, read at call time. */
  teams: [] as { id: string; name: string }[],
  /** The session's `activeOrganizationId`, which `setActive` moves. */
  activeTeamId: undefined as string | undefined,
  listTeams: vi.fn(),
  setActive: vi.fn(),
  useListOrganizations: vi.fn(),
  useActiveOrganization: vi.fn(),
  useActiveMember: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn(() => {
      fixtures.sessionReads += 1;
      if (fixtures.sessionReads > fixtures.successfulSessionReads) {
        return Promise.resolve({
          data: null,
          error: { status: 500, message: 'unavailable' },
        });
      }
      return Promise.resolve(
        fixtures.signedIn
          ? {
              data: {
                user: {},
                session: { activeOrganizationId: fixtures.activeTeamId },
              },
              error: null,
            }
          : { data: null, error: null },
      );
    }),
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
    signOut: fixtures.signOut,
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
  fixtures.signedIn = true;
  fixtures.successfulSessionReads = Number.POSITIVE_INFINITY;
  fixtures.sessionReads = 0;
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
  fixtures.signOut.mockImplementation(() => {
    // The cookie is gone from here on, which is what lets the sign-in page be
    // the end of the sequence rather than a bounce back to `/no-team`.
    fixtures.signedIn = false;
    return Promise.resolve({ data: { success: true }, error: null });
  });
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

/**
 * The half of a reconciliation that happens after the write.
 *
 * Better Auth's `refetch` resolves whether or not the request worked — it
 * wraps it in a promise it settles from `finally` and records a failure on the
 * hook — so `Promise.allSettled` reports success for two refreshes that never
 * happened. A reconciliation marked settled there leaves the shell naming the
 * team the researcher has just left, with the guard refusing to try again.
 */
describe('an active-team write whose refresh does not land', () => {
  it('says so rather than reporting a switch nothing saw', async () => {
    fixtures.useActiveMember.mockReturnValue({
      data: null,
      isPending: false,
      error: { status: 500, message: 'unavailable' },
      refetch: vi.fn(),
    });
    renderAt('/team/team-b');

    await waitFor(() => expect(fixtures.setActive).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Studio could not switch to this team',
    );
  });

  it('tries again even when the team query already names this team', async () => {
    // The team refreshed and the member did not, so §6.6's comparison agrees
    // with the URL while the shell is still describing the old team's
    // membership. Taking the comparison here would refuse the retry outright —
    // the optimisation deciding correctness, which §6.6 forbids.
    fixtures.useActiveOrganization.mockReturnValue(
      resolved({ ...fixtures.TEAM_B, members: [], invitations: [] }),
    );
    fixtures.useActiveMember.mockReturnValue({
      data: null,
      isPending: false,
      error: { status: 500, message: 'unavailable' },
      refetch: vi.fn(),
    });
    renderAt('/team/team-b');

    await screen.findByRole('alert');
    expect(fixtures.setActive).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(fixtures.setActive).toHaveBeenCalledTimes(2));
  });
});

/**
 * The switcher reports no failure of its own — it shows what it was given, and
 * the shell above owns the outage. These two say what that leaves on screen.
 */
describe('the team list, when it cannot be read', () => {
  it('draws no team segment when nothing could be read', async () => {
    fixtures.useListOrganizations.mockReturnValue({
      data: null,
      isPending: false,
      error: { status: 500, message: 'unavailable' },
      refetch: vi.fn(),
    });
    renderAt('/team/team-a');
    await screen.findByRole('button', { name: 'Account' });

    // A resolved read with nothing in it, as far as this component can tell.
    // It draws no segment rather than an empty one, and says nothing about
    // why — reporting the failure belongs to the layer that made the request.
    expect(screen.queryByRole('combobox', { name: /^Team/ })).toBeNull();
    expect(screen.queryByText('Your teams could not be loaded.')).toBeNull();
  });

  it('keeps an earlier list usable when a later read fails', async () => {
    // Better Auth leaves the last good `data` in place beside the error, and
    // those teams are still the researcher's way to every team they name. A
    // later read failing must not take them away.
    fixtures.useListOrganizations.mockReturnValue({
      data: [fixtures.TEAM_A, fixtures.TEAM_B],
      isPending: false,
      error: { status: 500, message: 'unavailable' },
      refetch: vi.fn(),
    });
    renderAt('/team/team-a');

    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Team Alpha research team' }),
    );

    expect(
      await screen.findByRole('option', { name: /^Beta research team/ }),
    ).toBeInTheDocument();
  });

  it('stays quiet for a list that really is empty', async () => {
    // The other half of the distinction: a RESOLVED empty list is an answer,
    // and the switcher's absence is the right treatment for it — §6.4's
    // `/no-team` is where that researcher belongs.
    fixtures.useListOrganizations.mockReturnValue(resolved([]));
    renderAt('/team/team-a');

    await screen.findByRole('link', { name: 'Studio' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('combobox', { name: /^Team/ })).toBeNull();
  });
});

describe('two team URLs committed while a write is on the wire', () => {
  it('writes the newest team last, not whichever answers first', async () => {
    // Neither team is the active one, so the reconciler has a write to make on
    // arrival and another to make after the navigation.
    fixtures.useActiveOrganization.mockReturnValue(
      resolved({
        id: 'team-z',
        name: 'Zeta research team',
        members: [],
        invitations: [],
      }),
    );
    let settleFirstWrite: (() => void) | undefined;
    fixtures.setActive.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleFirstWrite = () => resolve({ data: {}, error: null });
        }),
    );

    const router = renderAt('/team/team-a');
    await waitFor(() => expect(fixtures.setActive).toHaveBeenCalledTimes(1));
    expect(fixtures.setActive.mock.calls[0]?.[0]).toEqual({
      organizationId: 'team-a',
    });

    await act(() =>
      router.navigate({
        to: '/team/$teamId/roles',
        params: { teamId: 'team-b' },
      }),
    );
    // The destination RENDERED. The reconciler reads committed params, so a
    // pending location says nothing about what it has seen.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Roles' }),
    ).toBeInTheDocument();

    // Given time to be wrong. Two writes in flight together are resolved by
    // the server in whatever order it answers them, and the last one to land
    // wins — which can be team A, the team the researcher has just left. A
    // study route or `/account` names no team, so nothing would put it right.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fixtures.setActive).toHaveBeenCalledTimes(1);

    await act(async () => {
      settleFirstWrite?.();
    });

    await waitFor(() => expect(fixtures.setActive).toHaveBeenCalledTimes(2));
    expect(fixtures.setActive.mock.calls[1]?.[0]).toEqual({
      organizationId: 'team-b',
    });
  });
});

describe('the active team the landing resolution reads', () => {
  it('lands a session that names no team on the first one it has', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    // Nothing sets `activeOrganizationId` when a session is created, so this is
    // what a first sign-in reads — not an edge case, the ordinary case. §6.4
    // answers it with the first team; a resolution that cannot HOLD the answer
    // never gets that far, and the researcher meets the error screen at the
    // one moment they have just proved who they are.
    fixtures.activeTeamId = undefined;
    const router = renderAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Studies' }),
    ).toBeInTheDocument();
    expect(router.state.resolvedLocation?.pathname).toBe('/team/team-a');
  });

  it('reaches the error screen when the read itself fails', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    // The active team is the SECOND of the list, so "the session names no
    // team" and "the session could not be read" resolve to different places:
    // the first falls back to team A, and this one must not.
    fixtures.activeTeamId = fixtures.TEAM_B.id;
    // The guard's own read succeeds; the landing resolution's does not.
    fixtures.successfulSessionReads = 1;

    renderAt('/');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Something went wrong',
      }),
    ).toBeInTheDocument();
    // Not team A. Redirecting there would also have the reconciler persist it
    // as the active team, so a read that merely failed would rewrite the fact
    // it failed to read.
    expect(screen.queryByRole('heading', { name: 'Studies' })).toBeNull();
  });
});

describe('a session that ends outside this tab', () => {
  it('gets the researcher out when the tab is re-entered', async () => {
    const router = renderAt('/team/team-a');
    await screen.findByRole('heading', { level: 1, name: 'Studies' });
    const { queryClient } = router.options.context;
    expect(queryClient.getQueryData(['protocols'])).toBeDefined();

    // Signed out in another tab, or simply expired. Nothing here fails, and
    // the session query is `staleTime: Infinity`, so left alone no guard ever
    // asks again and this shell stays up with its cached data in it.
    fixtures.signedIn = false;

    fireEvent(document, new Event('visibilitychange'));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(router.state.resolvedLocation?.pathname).toBe('/sign-in');
    // §6.2: what was in the cache belonged to the researcher whose session has
    // ended, and nobody signing in next may be served it.
    expect(queryClient.getQueryData(['protocols'])).toBeUndefined();
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

/**
 * `/no-team` is a claim about the researcher, not a screen anyone may open:
 * "you belong to no team, here is how to get one". §6.4's landing sends people
 * here, and every other way of arriving — a bookmark, a shared link, the back
 * button after leaving a team — has to be answered by the same resolution the
 * landing used, or the screen says something untrue and offers no way out of
 * it.
 */
describe('the no-team screen', () => {
  it('sends a signed-out visitor to sign in', async () => {
    fixtures.signedIn = false;
    const router = renderAt('/no-team');

    // Nothing here is public: it describes a session's memberships, and a
    // visitor with no session has none to describe.
    expect(
      await screen.findByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('sends a researcher who does belong to a team where they belong', async () => {
    const router = renderAt('/no-team');

    // Without this the screen tells a researcher with two teams that they
    // have none, and offers to create one — and nothing on it ever changes
    // its mind, because it reads nothing.
    //
    // The destination RENDERED, because `state.location` is set to it before
    // the app shell's own guard has had a chance to refuse it: reading the
    // pathname alone would pass on a redirect that is about to be undone.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Studies' }),
    ).toBeInTheDocument();
    expect(router.state.resolvedLocation?.pathname).toBe('/team/team-a');
  });

  it('keeps a researcher who really has no team', async () => {
    fixtures.teams = [];
    const router = renderAt('/no-team');

    expect(
      await screen.findByRole('heading', { name: 'No team yet' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/no-team');
  });

  it('lets a researcher who belongs to no team sign out of it', async () => {
    fixtures.teams = [];
    renderAt('/no-team');
    await screen.findByRole('heading', { name: 'No team yet' });

    // Every app route bounces this session back here (§6.4) and `/sign-in`
    // resolves the same landing and does the same, so the account menu is on
    // no screen they can reach. Without a control here, signing in as
    // somebody else means clearing the cookie by hand.
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // The sequence RAN, and the sign-in page RENDERED at the end of it. The
    // first assertion is what fails if the sequence's own navigation cannot
    // commit — returning through `/account`, which this session's guard
    // redirects away from, aborts the sign-out silently and signs nobody out.
    await waitFor(() => expect(fixtures.signOut).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('keeps a researcher whose teams could not be read', async () => {
    fixtures.listTeams.mockResolvedValue({
      data: null,
      error: { message: 'unavailable' },
    });
    const router = renderAt('/no-team');

    // The app shell's guard sends an unresolved list THROUGH; this one has to
    // leave it WHERE IT IS, and the two agree: only a resolved answer moves
    // anybody. Redirecting on a failed read would bounce the researcher
    // between here and the shell for as long as the outage lasts.
    expect(
      await screen.findByRole('heading', { name: 'No team yet' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/no-team');
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
    // `SiteNavigation` owns the link; this asserts the site shell puts that
    // header first, which is what makes its bypass the first focusable thing.
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Skip to main content');

    // Exactly one. The site shell used to render a bypass of its own, and a
    // second link with the same name and the same target is what a visitor
    // meets first on every public page.
    expect(
      screen.getAllByRole('link', { name: 'Skip to main content' }),
    ).toHaveLength(1);
  });

  it('moves focus to the page main when that link is used', async () => {
    renderAt('/');
    const skipLink = await screen.findByRole('link', {
      name: 'Skip to main content',
    });

    fireEvent.click(skipLink);

    // A `<main>` is not focusable on its own, so a plain fragment link would
    // leave focus on the bypass and the next Tab would restart at the top.
    // The handler that prevents that is `SiteNavigation`'s; this pins that it
    // still reaches the `id` Studio's own site screens render.
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});

/**
 * The public pages that are NOT the marketing home. Every destination
 * `SiteNavigation` owns leads to another Network Canvas site, so on `/pricing`
 * and `/legal/*` the persistent header is the only chrome a reader has and it
 * led nowhere: not into Studio, and not to a sign-in.
 */
describe('the site header, on a public page that is not marketing', () => {
  it('offers a visitor a way to sign in', async () => {
    fixtures.signedIn = false;
    renderAt('/pricing');
    await screen.findByRole('heading', { level: 1, name: 'Pricing' });

    const entry = screen.getByRole('link', { name: 'Sign in' });
    expect(entry).toHaveAttribute('href', '/sign-in');

    // The destination RENDERED. An href alone says only where the link
    // points, and the pending location would say the same thing before the
    // route had committed.
    fireEvent.click(entry);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('carries a signed-in researcher to their landing destination', async () => {
    renderAt('/pricing');

    // §6.4, not `/`: under `managed` that is this same marketing site, and
    // under `self-hosted` it is a redirect (§10.4).
    const entry = await screen.findByRole('link', { name: 'Go to Studio' });
    expect(entry).toHaveAttribute('href', '/team/team-a');

    fireEvent.click(entry);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Studies' }),
    ).toBeInTheDocument();
  });

  it('re-asks the session when the tab is re-entered', async () => {
    renderAt('/pricing');
    expect(
      await screen.findByRole('link', { name: 'Go to Studio' }),
    ).toHaveAttribute('href', '/team/team-a');

    // Signed out in another tab while this one sat on a legal document or a
    // pricing page. Nothing here fails — this branch makes no authenticated
    // request at all — and the session query is `staleTime: Infinity`, so
    // without a revalidation on this shell too the header keeps offering a way
    // into Studio backed by a session that ended, and the app guard is handed
    // the same cached answer when it is used.
    fixtures.signedIn = false;
    fireEvent(document, new Event('visibilitychange'));

    const entry = await screen.findByRole('link', { name: 'Sign in' });
    expect(screen.queryByRole('link', { name: 'Go to Studio' })).toBeNull();

    // The destination RENDERED, so this is the researcher signing in again
    // rather than an href that would meet a guard with other ideas.
    fireEvent.click(entry);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('offers the same entry in the compact menu', async () => {
    // `renderUtility` is rendered in both presentations, and the compact one
    // is where a narrow viewport puts every header item — so an entry that
    // reached only the desktop bar would be missing on a phone, which is the
    // viewport a shared legal link is most often opened on.
    fixtures.signedIn = false;
    renderAt('/pricing');
    await screen.findByRole('heading', { level: 1, name: 'Pricing' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Open site navigation' }),
    );

    const compactNavigation = screen.getAllByRole('navigation', {
      name: 'Primary navigation',
    })[1];
    if (!compactNavigation) throw new Error('Expected the compact menu.');
    expect(
      within(compactNavigation).getByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/sign-in');
  });
});
