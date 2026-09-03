// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../../router.tsx';
import { destinationItems } from '../everythingBarDestinations.ts';
import { studyDestinations } from '../navigationManifest.ts';

/**
 * The counts on the study sidebar's countable destinations (§5.5).
 *
 * What a number in a sidebar promises is that it is TRUE, so the cases here
 * are as much about the rows that must carry no number — while the answer is
 * outstanding, after it fails, before the team is even known — as about the
 * four that carry one. A 0 invented for a study with forty participants in it
 * is not a smaller version of the right answer; it is a wrong one, and it is
 * the one a naive `?? 0` produces.
 */

const fixtures = vi.hoisted(() => ({
  TEAM: { id: 'team-a', name: 'Alpha research team', slug: 'alpha' },
  /** Read at call time so a test can sign the researcher out of every team. */
  activeTeam: undefined as { id: string } | undefined,
  /** The `studies.counts` answer, per test. */
  counts: vi.fn(),
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
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
    useActiveOrganization: vi.fn(() => ({
      data: fixtures.activeTeam,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    })),
    useActiveMember: vi.fn().mockReturnValue({
      data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    organization: {
      setActive: vi.fn().mockResolvedValue({ error: null }),
      list: vi.fn().mockResolvedValue({ data: [fixtures.TEAM], error: null }),
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
          auth: {
            enabled: true,
            magicLink: true,
            emailAndPassword: true,
            socialProviders: [],
          },
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
    studies: {
      // The header's study chip asks these on every study route; they are
      // not under test here, so they answer nothing.
      get: {
        queryOptions: () => ({ queryKey: ['study'], queryFn: vi.fn() }),
        key: () => ['study'],
      },
      list: {
        queryOptions: () => ({ queryKey: ['studies'], queryFn: () => [] }),
        key: () => ['studies'],
      },
      counts: {
        // What `@orpc/tanstack-query` itself builds, in the one respect these
        // cases depend on: a `skipToken` input (a symbol) becomes a
        // `skipToken` queryFn, which is what stops the query being asked at
        // all rather than being asked and ignored.
        queryOptions: ({ input, ...options }: { input: unknown }) => ({
          ...options,
          queryKey: ['study-counts', input],
          queryFn:
            typeof input === 'symbol' ? input : () => fixtures.counts(input),
        }),
      },
    },
  },
  rpcClient: { protocols: {}, team: {} },
}));

function renderStudy(path = '/study/study-1') {
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

/**
 * The sidebar rows that render a number, by their text.
 *
 * Read off the navigation region rather than the whole document so the
 * header's own links cannot answer for the sidebar, and by text rather than by
 * accessible name because the negative cases assert that NO row carries a
 * digit — a query by name can only ask about a name someone predicted.
 */
function numberedRows(): string[] {
  return within(screen.getByRole('navigation'))
    .getAllByRole('link')
    .map((link) => link.textContent ?? '')
    .filter((text) => /\d/.test(text));
}

beforeEach(() => {
  fixtures.activeTeam = { id: fixtures.TEAM.id };
  fixtures.counts.mockReset();
});

describe('the study sidebar’s counts', () => {
  it('names the number beside each countable destination', async () => {
    fixtures.counts.mockResolvedValue({
      versions: 6,
      participants: 84,
      waves: 3,
      sessions: 212,
    });
    renderStudy();

    // The count is rendered INSIDE the link, so it is part of the row's
    // accessible name — which is the whole reason it is placed there. Finding
    // the row by that name is therefore the assertion: a number rendered
    // beside the link instead of within it would fail here.
    expect(
      await screen.findByRole('link', { name: 'Participants 84' }),
    ).toHaveAttribute('href', '/study/study-1/participants');
    expect(
      screen.getByRole('link', { name: 'Versions 6' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Waves 3' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Sessions 212' }),
    ).toBeInTheDocument();

    // And nowhere else: the counts go to the four destinations §5.5 makes
    // countable, not to every row that happens to be in the sidebar.
    expect(numberedRows()).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Export' })).toBeInTheDocument();
  });

  it('asks about the study in the URL, and nothing else', async () => {
    fixtures.counts.mockResolvedValue({
      versions: 1,
      participants: 2,
      waves: 3,
      sessions: 4,
    });
    renderStudy('/study/study-7/waves');

    await screen.findByRole('link', { name: 'Waves 3' });
    // A study route names no team, and the procedure needs none: the server
    // resolves it from the study. Asking about the wrong study would put
    // another study's numbers on this one's sidebar.
    expect(fixtures.counts).toHaveBeenCalledWith({ studyId: 'study-7' });
  });

  it('shows no number at all while the answer is outstanding', async () => {
    // A promise that never settles: the state every sidebar is in for its
    // first paint, and the one a `?? 0` would render as an empty study.
    fixtures.counts.mockReturnValue(new Promise(() => undefined));
    renderStudy();

    const participants = await screen.findByRole('link', {
      name: 'Participants',
    });
    expect(participants).toBeInTheDocument();
    expect(numberedRows()).toEqual([]);
  });

  it('shows no number when the procedure refuses', async () => {
    fixtures.counts.mockRejectedValue(new Error('FORBIDDEN'));
    renderStudy();

    await screen.findByRole('link', { name: 'Participants' });
    await waitFor(() => expect(fixtures.counts).toHaveBeenCalled());
    // The sidebar is not the place to report a failed read: the researcher
    // gets the destinations, without numbers, and the screen behind each row
    // reports its own trouble.
    expect(numberedRows()).toEqual([]);
    expect(screen.getByRole('link', { name: 'Sessions' })).toBeInTheDocument();
  });

  it('leaves an empty study’s rows unnumbered rather than showing zeroes', async () => {
    fixtures.counts.mockResolvedValue({
      versions: 0,
      participants: 0,
      waves: 0,
      sessions: 0,
    });
    renderStudy();

    await screen.findByRole('link', { name: 'Participants' });
    await waitFor(() => expect(fixtures.counts).toHaveBeenCalled());
    // "Participants" reads better than "Participants 0", and a study with
    // nothing in it has nothing to count — `NavItem`'s rule, asserted here
    // because it is what makes the loading and failed cases above indistinct
    // from an honest empty study rather than a lie about a full one.
    expect(numberedRows()).toEqual([]);
  });

  it('asks before the active team is known, because the question needs none', async () => {
    // The window before the active-team setting has answered — a bookmark
    // opened on a first sign-in. The study is in the URL, and that is all the
    // procedure takes, so the numbers arrive as soon as they would anywhere.
    fixtures.activeTeam = undefined;
    fixtures.counts.mockResolvedValue({
      versions: 2,
      participants: 5,
      waves: 1,
      sessions: 3,
    });
    renderStudy();

    expect(
      await screen.findByRole('link', { name: 'Participants 5' }),
    ).toBeInTheDocument();
    expect(fixtures.counts).toHaveBeenCalledWith({ studyId: 'study-1' });
  });
});

describe('the everything bar reading the same manifest', () => {
  it('offers each destination by name, with no count attached', () => {
    const entries = studyDestinations('study-1', {
      versions: 6,
      participants: 84,
      waves: 3,
      sessions: 212,
    });
    const items = destinationItems({ entries, currentArea: 'study' });

    // Invariant 1 is that the bar and the sidebar list the same destinations;
    // it is not that they render them the same way. A result is a place to go,
    // and the bar persists activations as recents, so a number carried into
    // one would be a number nobody refreshes.
    expect(items.map((item) => item.label)).toContain('Participants');
    expect(items.filter((item) => /\d/.test(item.label))).toEqual([]);
    expect(items).toHaveLength(entries.length);
  });
});
