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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authClient } from '../../lib/auth.ts';
import { createAppRouter } from '../../router.tsx';
import {
  activatableDestinations,
  destinationItems,
} from '../../shell/everythingBarDestinations.ts';
import {
  createMockCommandsProvider,
  MOCK_DOCUMENTATION_FAILING_QUERY,
} from '../../shell/everythingBarMockProviders.ts';
import {
  currentAreaFor,
  navigationManifest,
} from '../../shell/navigationManifest.ts';
import {
  clearSurfaceRequest,
  readSurfaceRequest,
} from '../../shell/surfaceRequests.ts';

/**
 * The everything bar as Studio actually mounts it (everything-bar design §4,
 * §12.2).
 *
 * What is asserted here is the app half — the seam between Studio's own
 * navigation manifest and the shared component. The component's own behaviour
 * (matching, ranking, selection stability, pagination, recents) is proved by
 * its interaction tests in fresco-ui and is deliberately not re-proved here.
 */

const fixtures = vi.hoisted(() => ({
  TEAM: { id: 'team-a', name: 'Alpha research team', slug: 'alpha' },
  deployment: { mode: 'managed', billing: false },
  getSession: vi.fn(),
  STUDY: {
    id: 'study-1',
    draftId: 'draft-1',
    name: 'Shell proof',
    createdAt: new Date('2026-08-28T00:00:00Z'),
    updatedAt: new Date('2026-08-28T00:00:00Z'),
  },
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: fixtures.getSession,
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Researcher', email: 'researcher@example.com' } },
      isPending: false,
      error: null,
    }),
    useListOrganizations: vi.fn().mockReturnValue({
      data: [fixtures.TEAM],
      isPending: false,
      error: null,
    }),
    useActiveOrganization: vi.fn().mockReturnValue({
      data: { ...fixtures.TEAM, members: [], invitations: [] },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    useActiveMember: vi.fn().mockReturnValue({
      data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    organization: {
      setActive: vi.fn().mockResolvedValue({ error: null }),
      list: vi.fn(() =>
        Promise.resolve({ data: [fixtures.TEAM], error: null }),
      ),
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
          // Read at call time, so a test can put the client on a self-hosted
          // instance before it renders.
          deployment: fixtures.deployment,
        }),
      }),
    },
    protocols: {
      list: {
        queryOptions: () => ({
          queryKey: ['protocols'],
          queryFn: () => [fixtures.STUDY],
        }),
        key: () => ['protocols'],
      },
      create: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      draft: {
        queryOptions: () => ({ queryKey: ['draft'], queryFn: vi.fn() }),
        key: () => ['draft'],
      },
    },
    audit: {
      list: {
        infiniteOptions: (options: {
          initialPageParam: string | undefined;
          getNextPageParam: (page: {
            nextCursor: string | null;
          }) => string | undefined;
        }) => ({
          queryKey: ['audit-list'],
          queryFn: () => ({ events: [], nextCursor: null }),
          initialPageParam: options.initialPageParam,
          getNextPageParam: options.getNextPageParam,
        }),
      },
      get: {
        queryOptions: () => ({ queryKey: ['audit-get'], queryFn: vi.fn() }),
      },
      filterOptions: {
        queryOptions: () => ({
          queryKey: ['audit-filter-options'],
          queryFn: () => ({ actors: [] }),
        }),
      },
    },
  },
  rpcClient: { protocols: {}, team: {} },
}));

const DIALOG_NAME = 'Search and commands';
const NO_RESULTS = 'Nothing matches that search.';
const PENDING = 'Searching…';
const ERROR_ROW =
  'These results could not be loaded. Press Enter to try again.';

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

/** Opens the bar the way a researcher does, and hands back its input. */
async function openBar() {
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
  const dialog = await screen.findByRole('dialog', { name: DIALOG_NAME });
  return { dialog, input: within(dialog).getByRole('combobox') };
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

/**
 * The heading of the group a result row is rendered under.
 *
 * Read from the row rather than by holding a group element across the wait for
 * it: a group's own node is replaced when its rows change, so an element
 * captured while the group held only a pending indicator is stale by the time
 * the results it was waiting for arrive.
 */
function groupOf(row: HTMLElement): string | null | undefined {
  const group = row.closest('[role="group"]');
  const headingId = group?.getAttribute('aria-labelledby') ?? '';
  return row.ownerDocument.getElementById(headingId)?.textContent;
}

/** An index route's address and its parent's are the same URL. */
function trimIndexSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

/**
 * The route pattern `href` resolves to, or `undefined` when it resolves to no
 * route at all — the same resolution the route-table test uses.
 *
 * A URL that matches nothing still produces matches (the branch it got as far
 * as), so resolving is "did the WHOLE URL match?", not "did anything match?".
 * That is what makes this able to fail: a manifest entry pointing at an
 * unregistered path answers `undefined`.
 */
function registeredPathFor(
  router: ReturnType<typeof createAppRouter>,
  href: string,
): string | undefined {
  const leaf = router.matchRoutes(href, {}).at(-1);
  if (leaf === undefined) return undefined;
  if (trimIndexSlash(leaf.pathname) !== trimIndexSlash(href)) return undefined;
  const path = trimIndexSlash(leaf.fullPath);
  return path in router.routesByPath ? path : undefined;
}

/** Better Auth's active-membership hook, answering for the team under test. */
function activeMember(role: string, organizationId = fixtures.TEAM.id) {
  return {
    data: { id: 'member-1', organizationId, role },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof authClient.useActiveMember>;
}

beforeEach(() => {
  vi.mocked(authClient.useActiveMember).mockReturnValue(activeMember('owner'));
  fixtures.deployment = { mode: 'managed', billing: false };
  fixtures.getSession.mockResolvedValue({
    data: { user: {}, session: { activeOrganizationId: fixtures.TEAM.id } },
    error: null,
  });
  // Recents are local, most-recent-first and shared by every test in this file
  // otherwise: an activation in one test would seed the empty state of the next.
  window.localStorage.clear();
  clearSurfaceRequest();
});

describe('opening the bar', () => {
  it('opens on the keyboard shortcut from any app route', async () => {
    renderAt('/study/study-1');
    await screen.findByRole('link', { name: 'Overview' });

    // Not open until asked: a bar that renders its dialog unconditionally would
    // pass every assertion below without the binding existing.
    expect(
      screen.queryByRole('dialog', { name: DIALOG_NAME }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    expect(
      await screen.findByRole('dialog', { name: DIALOG_NAME }),
    ).toBeInTheDocument();
  });

  it('opens on Ctrl+K, for a researcher who is not on a Mac', async () => {
    renderAt('/team/team-a');
    await screen.findByRole('link', { name: 'Members' });

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    expect(
      await screen.findByRole('dialog', { name: DIALOG_NAME }),
    ).toBeInTheDocument();
  });

  it('opens from the header field, which names the binding', async () => {
    renderAt('/team/team-a');

    const trigger = await screen.findByRole('button', {
      name: /^Search and commands \((Command|Control) K\)$/,
    });
    fireEvent.click(trigger);

    expect(
      await screen.findByRole('dialog', { name: DIALOG_NAME }),
    ).toBeInTheDocument();
  });
});

describe('go to', () => {
  it('navigates to the destination a result names', async () => {
    const router = renderAt('/study/study-1');
    await screen.findByRole('link', { name: 'Overview' });

    const { dialog, input } = await openBar();
    type(input, 'waves');

    const option = await within(dialog).findByRole('option', {
      name: /^Waves/,
    });
    expect(groupOf(option)).toBe('Go to');

    // The keyboard path: the row the combobox points at is the one Enter
    // activates, so this asserts the highlight as well as the navigation.
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/study/study-1/waves'),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: DIALOG_NAME }),
      ).not.toBeInTheDocument(),
    );
  });

  it('finds another area from inside a study, not only the mounted one', async () => {
    renderAt('/study/study-1');
    await screen.findByRole('link', { name: 'Overview' });

    const { dialog, input } = await openBar();
    // The team's activity log, from a study screen: the fundamental
    // requirement, and what a per-area provider would fail.
    type(input, 'activity');

    const option = await within(dialog).findByRole('option', {
      name: /^Activity/,
    });
    expect(groupOf(option)).toBe('Go to');
  });

  it('offers only destinations the built router registers', () => {
    const router = createAppRouter();
    const entries = navigationManifest({
      teamId: 'team-a',
      studyId: 'study-1',
      canManageTeam: true,
      billingUnavailableReason: undefined,
    });
    const items = destinationItems({
      entries,
      currentArea: currentAreaFor('/study/study-1'),
    });

    // Not a vacuous pass: every area contributes, so a manifest that silently
    // dropped one would be caught here rather than by an empty loop below.
    expect(new Set(entries.map((entry) => entry.area))).toEqual(
      new Set(['study', 'editor', 'team', 'account', 'platform']),
    );
    expect(items.length).toBeGreaterThan(20);

    const unresolved = items
      .map((item) => item.activate.href)
      .filter((href) => registeredPathFor(router, href) === undefined);
    expect(unresolved).toEqual([]);

    // The oracle can fail: a plausible-looking href for a route that does not
    // exist resolves to nothing, which is exactly what a stale manifest entry
    // would look like.
    expect(
      registeredPathFor(router, '/study/study-1/dashboard'),
    ).toBeUndefined();
  });

  it('renders every sidebar-only re-entry row under a destination of its own', () => {
    const entries = navigationManifest({
      teamId: 'team-a',
      studyId: 'study-1',
      canManageTeam: true,
      billingUnavailableReason: undefined,
    });
    const activatable = new Set(
      activatableDestinations(entries).map((entry) => entry.href),
    );

    const reentry = entries.filter((entry) => entry.reentry === true);
    // The editor outline's "Back to study" is one; if it were the only entry
    // for its href, excluding it from the bar would be a parity hole.
    expect(reentry.length).toBeGreaterThan(0);
    for (const entry of reentry) {
      expect(activatable.has(entry.href)).toBe(true);
    }
  });
});

describe('commands', () => {
  it('launches a command from another area, and records its surface', async () => {
    const router = renderAt('/study/study-1');
    await screen.findByRole('link', { name: 'Overview' });

    const { dialog, input } = await openBar();
    // The team's invitation command, from a study screen.
    type(input, 'invite');

    const option = await within(dialog).findByRole('option', {
      name: /^Invite a team member/,
    });
    expect(groupOf(option)).toBe('Commands');
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    fireEvent.keyDown(input, { key: 'Enter' });

    // ONE navigation, to the screen that owns the action — and the surface it
    // was asked to open, recorded for the screen to honour once #1249/#1263's
    // registrations exist. The bar launched it; nothing was mutated.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-a/members'),
    );
    expect(readSurfaceRequest()).toEqual({
      href: '/team/team-a/members',
      surface: 'members.invite',
    });
  });

  /**
   * A command is a launch into the screen that owns the action (invariant 3),
   * so offering one the researcher may not perform is not a harmless extra
   * row: it advertises an action and then lands them on a screen that
   * correctly refuses to show it. The bar has to be filtered by the same
   * capability the destination screen is.
   */
  it('does not offer the invitation command to an ordinary member', async () => {
    vi.mocked(authClient.useActiveMember).mockReturnValue(
      activeMember('member'),
    );
    renderAt('/team/team-a');
    await screen.findByRole('link', { name: 'Members' });

    const { dialog, input } = await openBar();
    type(input, 'invite');

    // The bar SETTLED with nothing to offer, rather than an assertion racing
    // results that had not arrived: `TeamMembers` renders no invitation form
    // for this researcher, so there is no invitation surface to launch.
    await within(dialog).findByText(NO_RESULTS);
    expect(
      within(dialog).queryByRole('option', { name: /^Invite a team member/ }),
    ).toBeNull();
  });

  it('reads the capability against the team it is searching for', async () => {
    // The bar takes its team from the URL and its role from Better Auth's
    // ACTIVE membership, and those name different teams for the whole of every
    // switch (§6.6). An owner of team A gets no manage-only result for team B
    // out of it.
    vi.mocked(authClient.useActiveMember).mockReturnValue(
      activeMember('owner', 'team-a'),
    );
    renderAt('/team/team-b');
    await screen.findByRole('link', { name: 'Members' });

    const { dialog, input } = await openBar();
    type(input, 'invite');

    await within(dialog).findByText(NO_RESULTS);
    expect(
      within(dialog).queryByRole('option', { name: /^Invite a team member/ }),
    ).toBeNull();
  });

  it('still offers a member the commands they can perform', async () => {
    // The other half: the capability filter removes one command, not the
    // group. Creating a study is something every member of a team may do.
    vi.mocked(authClient.useActiveMember).mockReturnValue(
      activeMember('member'),
    );
    renderAt('/team/team-a');
    await screen.findByRole('link', { name: 'Members' });

    const { dialog, input } = await openBar();
    type(input, 'create a study');

    const option = await within(dialog).findByRole('option', {
      name: /^Create a study/,
    });
    expect(groupOf(option)).toBe('Commands');
  });

  it('expresses every command as a launch, never as an action', () => {
    const router = createAppRouter();
    const provider = createMockCommandsProvider({
      teamId: 'team-a',
      studyId: 'study-1',
      canManageTeam: true,
    });
    if (!provider.local) throw new Error('the commands provider is local');

    const items = provider.items();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      // The launcher rule, made structural: a route the shell can navigate,
      // plus a name the destination screen resolves. The activation type admits
      // no callback, so a mutation is not expressible.
      expect(item.activate.kind).toBe('open');
      expect(registeredPathFor(router, item.activate.href)).toBeDefined();
    }
  });
});

describe('a destination this deployment does not have', () => {
  it('is offered where the deployment reports billing', async () => {
    fixtures.deployment = { mode: 'managed', billing: true };
    renderAt('/team/team-a');
    await screen.findByRole('link', { name: 'Billing' });

    const { dialog, input } = await openBar();
    type(input, 'billing');

    const option = await within(dialog).findByRole('option', {
      name: /^Billing/,
    });
    expect(groupOf(option)).toBe('Go to');
  });

  it('is explained in the sidebar and absent from the bar when self-hosted', async () => {
    fixtures.deployment = { mode: 'self-hosted', billing: false };
    renderAt('/team/team-a');

    // The row still exists in the chrome, disabled and explained — so the bar's
    // silence below is about the bar, not about the destination disappearing.
    expect(
      await screen.findByText('Managed deployments only'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Billing/ })).toBeNull();

    const { dialog, input } = await openBar();
    type(input, 'billing');

    await within(dialog).findByText(NO_RESULTS);
    expect(
      within(dialog).queryByRole('option', { name: /Billing/ }),
    ).toBeNull();
  });

  it('gets the same treatment on a managed deployment without billing', async () => {
    // The topology serves the surface; this deployment has not got it, which
    // is every deployment today (§10.3). Reading the mode alone offers a
    // result that lands on a placeholder — the one thing a launcher must not
    // do — so the capability decides this too.
    fixtures.deployment = { mode: 'managed', billing: false };
    renderAt('/team/team-a');

    expect(
      await screen.findByText('Not enabled on this deployment'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Billing/ })).toBeNull();

    const { dialog, input } = await openBar();
    type(input, 'billing');

    await within(dialog).findByText(NO_RESULTS);
    expect(
      within(dialog).queryByRole('option', { name: /Billing/ }),
    ).toBeNull();
  });
});

describe('the documentation provider', () => {
  it('renders its pending row while it is out, then its results', async () => {
    renderAt('/team/team-a');
    await screen.findByRole('link', { name: 'Members' });

    const { dialog, input } = await openBar();
    type(input, 'participants');

    // The searching row is a rendered state, not a bare spinner (§8): a
    // researcher can tell "still looking" from "nothing found".
    expect(await within(dialog).findByText(PENDING)).toBeInTheDocument();

    const result = await within(dialog).findByRole('option', {
      name: /Managing participants/,
    });
    expect(groupOf(result)).toBe('Documentation');
    // It leaves Studio, in a new tab, carrying the result's URL and never the
    // query text (invariant 5).
    expect(result).toHaveAttribute(
      'href',
      'https://documentation.networkcanvas.com/en/studio/participants',
    );
    expect(result).toHaveAttribute('target', '_blank');
    await waitFor(() => expect(within(dialog).queryByText(PENDING)).toBeNull());
  });

  it('renders a retryable error row when its search fails', async () => {
    renderAt('/team/team-a');
    await screen.findByRole('link', { name: 'Members' });

    const { dialog, input } = await openBar();
    type(input, MOCK_DOCUMENTATION_FAILING_QUERY);

    expect(
      await within(dialog).findByRole('option', { name: ERROR_ROW }),
    ).toBeInTheDocument();
    // A failed group is contained: no stuck spinner, and no false "no matches"
    // over the rest of the bar.
    await waitFor(() => expect(within(dialog).queryByText(PENDING)).toBeNull());
    expect(within(dialog).queryByText(NO_RESULTS)).toBeNull();
  });
});
