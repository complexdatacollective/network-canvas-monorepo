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
 * The study sidebar, once the shell has put it on screen.
 *
 * Rendering `RouterProvider` boots the whole app: the session guard resolves,
 * the header and its switchers render, the study area mounts, and only then
 * does the counts query start. Awaiting the sidebar here gives that boot and
 * the count that arrives after it one Testing Library budget each, rather than
 * asking a single `findBy` to cover both in series.
 *
 * The 5s budget in `disable-animations.js` is calibrated for a single wait
 * under load, and raising it is not the lever here: on a four-core CI runner
 * the two latencies together spent 5068ms of that budget in one run and ran
 * past it in another, while the same file's boot-only waits finished inside
 * 2s. Each still gets 5s and no more.
 *
 * It also scopes every query below to the region that is supposed to carry the
 * numbers, so the header's own links cannot answer for the sidebar, and so
 * whatever DOM a failure does print is the nav rather than the whole document.
 * The CI failure this helper exists to stop printed an unscoped `findBy`,
 * which hit Testing Library's 7000-character limit inside the header and never
 * reached a sidebar row at all.
 */
async function studySidebar() {
  return within(await screen.findByRole('navigation', { name: 'Study' }));
}

type StudySidebar = Awaited<ReturnType<typeof studySidebar>>;

/**
 * The sidebar rows that render a number, by their text.
 *
 * By text rather than by accessible name because the negative cases assert
 * that NO row carries a digit — a query by name can only ask about a name
 * someone predicted.
 */
function numberedRows(sidebar: StudySidebar): string[] {
  return sidebar
    .getAllByRole('link')
    .map((link) => link.textContent ?? '')
    .filter((text) => /\d/.test(text));
}

/**
 * The row for `destination`, with or without a number.
 *
 * A count is rendered inside the link, so the row's accessible name is either
 * the destination alone or the destination and its number, and a prefix finds
 * it in both states. Every wait below needs that. A query for an exact name
 * can only report that it found nothing, and it can only do so after spending
 * the whole wait budget — which is the wrong answer twice over here, because
 * both the number failing to arrive and a number arriving that should not have
 * leave the row on screen under the other name.
 */
function rowNamed(destination: string): RegExp {
  return new RegExp(`^${destination}\\b`);
}

/**
 * The countable row named `destination`, once its count has arrived.
 *
 * The count is rendered INSIDE the link, so it is part of the row's accessible
 * name — which is the whole reason it is placed there, and so the name is the
 * assertion: a number rendered beside the link rather than within it fails
 * here.
 *
 * Waiting on the NAME of a row that is already on screen, rather than
 * searching for a name that may never appear, is what makes a failure legible.
 * `findByRole` can only report that it found nothing, over a DOM dump that
 * Testing Library truncates at 7000 characters — in CI that ran out inside the
 * header and never reached a sidebar row, so the failure said nothing about
 * whether the row was there without its number or missing altogether. This
 * reports the name the row does carry.
 *
 * The row is re-queried on each poll rather than held, so it does not matter
 * whether React reuses the element when the number arrives.
 */
async function countedRow(
  sidebar: StudySidebar,
  destination: string,
  name: string,
): Promise<HTMLElement> {
  return waitFor(() => {
    const row = sidebar.getByRole('link', { name: rowNamed(destination) });
    expect(row).toHaveAccessibleName(name);
    return row;
  });
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
    const sidebar = await studySidebar();

    expect(
      await countedRow(sidebar, 'Participants', 'Participants 84'),
    ).toHaveAttribute('href', '/study/study-1/participants');
    expect(
      sidebar.getByRole('link', { name: 'Versions 6' }),
    ).toBeInTheDocument();
    expect(sidebar.getByRole('link', { name: 'Waves 3' })).toBeInTheDocument();
    expect(
      sidebar.getByRole('link', { name: 'Sessions 212' }),
    ).toBeInTheDocument();

    // And nowhere else: the counts go to the four destinations §5.5 makes
    // countable, not to every row that happens to be in the sidebar.
    expect(numberedRows(sidebar)).toHaveLength(4);
    expect(sidebar.getByRole('link', { name: 'Export' })).toBeInTheDocument();
  });

  it('asks about the study in the URL, and nothing else', async () => {
    fixtures.counts.mockResolvedValue({
      versions: 1,
      participants: 2,
      waves: 3,
      sessions: 4,
    });
    renderStudy('/study/study-7/waves');
    const sidebar = await studySidebar();

    await countedRow(sidebar, 'Waves', 'Waves 3');
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
    const sidebar = await studySidebar();

    const participants = await sidebar.findByRole('link', {
      name: rowNamed('Participants'),
    });
    expect(participants).toHaveAccessibleName('Participants');
    expect(numberedRows(sidebar)).toEqual([]);
  });

  it('shows no number when the procedure refuses', async () => {
    fixtures.counts.mockRejectedValue(new Error('FORBIDDEN'));
    renderStudy();
    const sidebar = await studySidebar();

    await sidebar.findByRole('link', { name: rowNamed('Participants') });
    await waitFor(() => expect(fixtures.counts).toHaveBeenCalled());
    // The sidebar is not the place to report a failed read: the researcher
    // gets the destinations, without numbers, and the screen behind each row
    // reports its own trouble.
    expect(numberedRows(sidebar)).toEqual([]);
    expect(sidebar.getByRole('link', { name: 'Sessions' })).toBeInTheDocument();
  });

  it('leaves an empty study’s rows unnumbered rather than showing zeroes', async () => {
    fixtures.counts.mockResolvedValue({
      versions: 0,
      participants: 0,
      waves: 0,
      sessions: 0,
    });
    renderStudy();
    const sidebar = await studySidebar();

    await sidebar.findByRole('link', { name: rowNamed('Participants') });
    await waitFor(() => expect(fixtures.counts).toHaveBeenCalled());
    // "Participants" reads better than "Participants 0", and a study with
    // nothing in it has nothing to count — `NavItem`'s rule, asserted here
    // because it is what makes the loading and failed cases above indistinct
    // from an honest empty study rather than a lie about a full one.
    expect(numberedRows(sidebar)).toEqual([]);
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
    const sidebar = await studySidebar();

    expect(
      await countedRow(sidebar, 'Participants', 'Participants 5'),
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
