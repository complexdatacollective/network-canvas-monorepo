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

const fixtures = vi.hoisted(() => ({
  TEAM_A: { id: 'team-a', name: 'Alpha research team', slug: 'alpha' },
  TEAM_B: { id: 'team-b', name: 'Beta research team', slug: 'beta' },
  // Shaped like `StudySummarySchema`, because the switcher reads the state and
  // the counts to write each study's supporting line.
  STUDY_1: {
    id: 'study-1',
    draftId: 'draft-1',
    name: 'Wave one pilot',
    state: 'live' as const,
    participationMode: 'managed' as const,
    protocolId: 'protocol-1',
    createdAt: new Date('2026-08-28T00:00:00Z'),
    waveCount: 2,
    participantCount: 14,
  },
  STUDY_2: {
    id: 'study-2',
    draftId: null,
    name: 'Methods comparison',
    state: 'draft' as const,
    participationMode: 'anonymous' as const,
    protocolId: null,
    createdAt: new Date('2026-08-29T00:00:00Z'),
    waveCount: 0,
    participantCount: 0,
  },
  setActive: vi.fn(),
  useActiveMember: vi.fn(),
  // Hoisted rather than fixed in the mock factory, because the team list's
  // three states — resolved, still loading, and failed — are what half of the
  // switcher's behaviour is about, and each test says which one it is in.
  useListOrganizations: vi.fn(),
  // Hoisted for the same reason: the active-team SETTING and the membership
  // list can disagree, and a test needs to say so.
  useActiveOrganization: vi.fn(),
  // Read at call time, so a test can put a study in the team's list or leave
  // it out. `protocols.list` is team-scoped, so a study missing from it is a
  // study this team does not own.
  studies: [] as {
    id: string;
    draftId: string | null;
    name: string;
    state: 'draft' | 'live' | 'paused' | 'closed';
    participationMode: 'managed' | 'anonymous';
    protocolId: string | null;
    createdAt: Date;
    waveCount: number;
    participantCount: number;
  }[],
  // Every `protocols.list` request the shell made, in order, by the team it
  // asked. The header asks for a team's studies in two places now — the study
  // segment's siblings and the owner lookup behind it — and both of them are
  // supposed to stay silent where no study is on screen, which is a claim
  // about requests rather than about anything rendered.
  studyListRequests: [] as string[],
  /** Every `studies.get` the shell made, by study id. */
  studyGetRequests: [] as string[],
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn(),
    useListOrganizations: fixtures.useListOrganizations,
    useActiveOrganization: fixtures.useActiveOrganization,
    useActiveMember: fixtures.useActiveMember,
    organization: {
      setActive: fixtures.setActive,
      list: vi.fn().mockResolvedValue({
        data: [fixtures.TEAM_A, fixtures.TEAM_B],
        error: null,
      }),
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
          teams: [
            { teamId: 'team-a', role: 'owner' },
            // Comma-separated, as Better Auth stores a legacy multi-role
            // membership: the switcher must read it as "Owner, Admin".
            { teamId: 'team-b', role: 'admin,member' },
          ],
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
        // Keyed by the team, as the real one is.
        queryOptions: ({ input }: { input: { teamId: string } }) => ({
          queryKey: ['studies', input.teamId],
          queryFn: () => {
            fixtures.studyListRequests.push(input.teamId);
            return fixtures.studies;
          },
        }),
        key: () => ['studies'],
      },
      get: {
        // The server resolves a study's team from the id alone. `null` for a
        // study no team of this researcher's owns, which is what the real
        // procedure refuses.
        queryOptions: ({ input }: { input: { studyId: string } }) => ({
          queryKey: ['study', input.studyId],
          queryFn: () => {
            fixtures.studyGetRequests.push(input.studyId);
            const study = fixtures.studies.find((s) => s.id === input.studyId);
            if (!study) throw new Error('FORBIDDEN');
            return {
              teamId: fixtures.TEAM_A.id,
              study,
              protocolDraftId: study.draftId,
            };
          },
        }),
        key: () => ['study'],
      },
      create: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
    },
    protocols: {
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

/** Better Auth's list hook, for a list that has resolved. */
function resolvedTeams(teams: { id: string; name: string }[]) {
  return { data: teams, isPending: false, error: null, refetch: vi.fn() };
}

// Helper utilities for interacting with the header switcher in tests.
/**
 * Presses a listbox option in the header's switcher.
 *
 * A bare `click` is not enough: Base UI's `Select` ignores a click on an
 * option it has not highlighted unless a pointer press began on that option,
 * because opening the list can drop an option under a stationary cursor. The
 * `pointerdown` is what a real mouse sends first, and what marks the click as
 * one the reader aimed.
 */
function pressOption(option: HTMLElement): void {
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

/**
 * How many segments the switcher is drawing.
 *
 * The segments are direct children of the frame that borders them — there is
 * no wrapper element between — so the frame is the trigger's own parent. This
 * is the oracle that separates "the study segment is absent" from "the study
 * segment is present but empty", which is the distinction the control makes.
 */
function lockupSegments(): number {
  const trigger = screen.getByRole('combobox', { name: /^Team/ });
  const frame = trigger.parentElement;
  if (frame === null) {
    throw new Error('the team switcher is not inside a lockup');
  }
  // Marked segments rather than child elements: Base UI renders a hidden form
  // control beside each trigger, so the frame has two children per segment.
  return frame.querySelectorAll('[data-switcher-segment]').length;
}

beforeEach(() => {
  fixtures.setActive.mockReset();
  fixtures.setActive.mockResolvedValue({ data: {}, error: null });
  fixtures.useActiveMember.mockReturnValue({
    data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
  fixtures.useListOrganizations.mockReturnValue(
    resolvedTeams([fixtures.TEAM_A, fixtures.TEAM_B]),
  );
  fixtures.useActiveOrganization.mockReturnValue({
    data: { ...fixtures.TEAM_A, members: [], invitations: [] },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  });
  fixtures.studies = [fixtures.STUDY_1, fixtures.STUDY_2];
  fixtures.studyListRequests = [];
  fixtures.studyGetRequests = [];
});

describe('composed app shell', () => {
  it('renders one main landmark and one named navigation region', async () => {
    renderAt('/team/team-a');
    await screen.findByRole('button', { name: 'Account' });

    // `AppFrame` renders neither landmark and every route below it has
    // stopped declaring its own, so exactly one of each survives — which is
    // what makes the skip link's target unambiguous (§5.3, §7.1).
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');

    const regions = screen.getAllByRole('navigation');
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveAccessibleName('Team');
  });

  it('moves focus to the area main when the skip link is used', async () => {
    renderAt('/team/team-a');
    const skipLink = await screen.findByRole('link', {
      name: 'Skip to main content',
    });

    fireEvent.click(skipLink);

    // The link and the landmark are rendered by different components, so this
    // is the pair asserted at runtime rather than either one trusted alone. A
    // `<main>` is not focusable by itself: staying on the link would leave the
    // next Tab restarting at the top of the document.
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('marks only the committed destination as the current page', async () => {
    const router = renderAt('/team/team-a');
    const studies = await screen.findByRole('link', { name: 'Studies' });
    expect(studies).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Activity' })).not.toHaveAttribute(
      'aria-current',
    );

    await act(() =>
      router.navigate({
        to: '/team/$teamId/activity',
        params: { teamId: 'team-a' },
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    expect(screen.getByRole('link', { name: 'Studies' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps one main landmark on a team-scoped route', async () => {
    renderAt('/team/team-a/activity');
    await screen.findByRole('heading', { name: 'Team activity' });

    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });

  it('omits the Activity destination from a collaborator sidebar', async () => {
    fixtures.useActiveMember.mockReturnValue({
      data: { id: 'member-2', organizationId: 'team-a', role: 'member' },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });
    renderAt('/team/team-a');
    await screen.findByRole('link', { name: 'Studies' });

    expect(screen.queryByRole('link', { name: 'Activity' })).toBeNull();
  });

  /**
   * Better Auth answers about the ACTIVE team and the URL says which team a
   * screen is about, and the two disagree for the whole of every switch —
   * permanently when §6.6's write fails. A sidebar that reads the role without
   * checking which team it belongs to therefore decides one team's
   * destinations from another team's membership, in both directions.
   */
  describe('a role that belongs to a different team from the URL', () => {
    it('offers no manage-only destination it cannot vouch for', async () => {
      // Owner of team A, standing on team B's URL, with the membership still
      // describing A.
      fixtures.useActiveMember.mockReturnValue({
        data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
        isPending: false,
        error: null,
        refetch: vi.fn(),
      });
      renderAt('/team/team-b');
      await screen.findByRole('link', { name: 'Studies' });

      // Being an owner of A says nothing about B. Offered here, the row leads
      // to a screen whose procedure refuses them (§11.4).
      expect(screen.queryByRole('link', { name: 'Activity' })).toBeNull();
    });

    it('offers it again once the membership names the team on screen', async () => {
      // The other half, so the guard above is not just "never on team B": the
      // reconciliation has landed and the researcher owns this team.
      fixtures.useActiveMember.mockReturnValue({
        data: { id: 'member-3', organizationId: 'team-b', role: 'owner' },
        isPending: false,
        error: null,
        refetch: vi.fn(),
      });
      renderAt('/team/team-b');

      expect(
        await screen.findByRole('link', { name: 'Activity' }),
      ).toHaveAttribute('href', '/team/team-b/activity');
    });
  });
});

describe('header team switcher', () => {
  it('names the team the researcher is acting in', async () => {
    renderAt('/team/team-a');
    // The kicker qualifying the name, joined by the accessible-name algorithm
    // rather than by JavaScript — "Team" is a whole translated word and the
    // team name is a datum, and neither is a fragment of the other.
    expect(
      await screen.findByRole('combobox', {
        name: 'Team Alpha research team',
      }),
    ).toBeInTheDocument();
  });

  it('navigates to the chosen team, and the reconciler follows the URL', async () => {
    const router = renderAt('/team/team-a');
    fireEvent.click(
      await screen.findByRole('combobox', {
        name: 'Team Alpha research team',
      }),
    );
    pressOption(
      await screen.findByRole('option', { name: /^Beta research team/ }),
    );

    // §6.5: the switch is a navigation to the team's landing destination, and
    // §6.6's reconciler is what writes the setting — after that destination
    // has committed, never before it, so a blocked navigation changes
    // nothing. The order is what this asserts: the URL first, the write
    // second.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/team/team-b'),
    );
    await waitFor(() =>
      expect(fixtures.setActive).toHaveBeenCalledWith(
        { organizationId: 'team-b' },
        { disableSignal: true },
      ),
    );
  });

  it('names the committed team, not the one the setting still holds', async () => {
    // The write is refused, so the setting stays on team A for good — the
    // permanent version of the window every team switch passes through. The
    // screen below is already team B's: it lists and creates studies against
    // the `teamId` in the URL.
    fixtures.setActive.mockResolvedValue({
      data: null,
      error: { message: 'You are not a member of that team.' },
    });
    renderAt('/team/team-b');
    await screen.findByRole('heading', { level: 1, name: 'Studies' });

    // A switcher naming A over B's screen is not a slow update, it is a wrong
    // answer to the one question the switcher exists to answer — and the URL
    // is what settles it (§2.2), exactly as `teamRole` settles the role.
    expect(
      await screen.findByRole('combobox', {
        name: 'Team Beta research team',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', {
        name: 'Team Alpha research team',
      }),
    ).toBeNull();
  });

  it('marks the committed team as the chosen one, and administers it', async () => {
    fixtures.setActive.mockResolvedValue({
      data: null,
      error: { message: 'You are not a member of that team.' },
    });
    renderAt('/team/team-b');

    fireEvent.click(
      await screen.findByRole('combobox', {
        name: 'Team Beta research team',
      }),
    );

    // The trigger and the open menu have to agree: a switcher that says B over
    // a list that marks A is a worse answer than either alone.
    expect(
      await screen.findByRole('option', {
        name: /^Beta research team/,
        selected: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: /^Alpha research team/,
        selected: false,
      }),
    ).toBeInTheDocument();

    // And "Team administration" administers the team on screen rather than the
    // one the setting still holds. It is a destination, so it is a link, and
    // its address is assertable without going anywhere — which is also what
    // lets a researcher open it in a new tab.
    expect(
      screen.getByRole('link', { name: 'Team administration' }),
    ).toHaveAttribute('href', '/team/team-b/settings');
  });

  it('leaves the setting alone until a navigation commits', async () => {
    renderAt('/team/team-a');
    await screen.findByRole('combobox', {
      name: 'Team Alpha research team',
    });

    // The committed team is already the active one, so the reconciler has
    // nothing to write. Opening the menu is not a switch either: the write
    // follows the URL, and nothing has changed it.
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Team Alpha research team' }),
    );
    await screen.findByRole('option', { name: /^Beta research team/ });

    expect(fixtures.setActive).not.toHaveBeenCalled();
  });

  it('does nothing at all when the team already current is chosen', async () => {
    // Asserted from a screen INSIDE the team rather than from its landing
    // destination, because that is where the difference shows: a switch goes
    // to `/team/$teamId`, so re-selecting the team already current would move
    // the researcher off the settings screen they were reading.
    const router = renderAt('/team/team-a/settings');
    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Team Alpha research team' }),
    );

    // Base UI reports every press of an option, the selected one included.
    // Re-selecting where you already are is not a switch, and in a
    // router-driven header it is a navigation the editor's dirty-state blocker
    // would have to prompt about.
    pressOption(
      await screen.findByRole('option', { name: /^Alpha research team/ }),
    );

    await waitFor(() => expect(router.state.status).toBe('idle'));
    expect(router.state.location.pathname).toBe('/team/team-a/settings');
    expect(fixtures.setActive).not.toHaveBeenCalled();
  });

  it('keeps the switcher present, and busy, while the team list is loading', async () => {
    fixtures.useListOrganizations.mockReturnValue({
      data: null,
      isPending: true,
      error: null,
      refetch: vi.fn(),
    });
    renderAt('/team/team-a');

    // Neither absent nor naming a team nobody has answered about: the kicker
    // and a skeleton hold the space the name will take, and the element says
    // it is busy. Rendering nothing until the list lands makes the header jump
    // sideways the moment it does.
    //
    // Not a button, deliberately. With no teams to switch to, no command and
    // no failure to retry there is nothing to open, and the switcher renders
    // inert rather than spending a tab stop on a menu that names nothing.
    await screen.findByRole('button', { name: 'Account' });
    const face = document.querySelector('header [aria-busy="true"]');
    expect(face).not.toBeNull();
    expect(face).toHaveTextContent('Team');
    expect(screen.queryByText('Choose a team')).toBeNull();
  });
});

/**
 * §5.5's header object: the team, and the study inside it, as one control that
 * reads as a path.
 */
describe('the header switcher lockup', () => {
  it('draws the study segment beside the team on a study route', async () => {
    renderAt('/study/study-1');

    expect(
      await screen.findByRole('combobox', { name: 'Team Alpha research team' }),
    ).toBeInTheDocument();
    // The team's own studies list contains this study, so it is genuinely this
    // team's, and its siblings are genuinely its siblings.
    expect(
      await screen.findByRole('combobox', {
        name: 'Study Wave one pilot, Live',
      }),
    ).toBeInTheDocument();
    expect(lockupSegments()).toBe(2);
  });

  it('offers the study its siblings, and the way back to all of them', async () => {
    renderAt('/study/study-1');
    fireEvent.click(
      await screen.findByRole('combobox', {
        name: 'Study Wave one pilot, Live',
      }),
    );

    expect(
      await screen.findByRole('option', {
        name: /^Wave one pilot/,
        selected: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'All studies in this team' }),
    ).toHaveAttribute('href', '/team/team-a');
  });

  it('leaves the study segment out entirely outside a study', async () => {
    renderAt('/team/team-a');
    await screen.findByRole('combobox', { name: 'Team Alpha research team' });

    // Absent, not empty. Outside a study there is no study, and a divider with
    // a blank beside it would say the opposite.
    expect(screen.queryByRole('combobox', { name: /^Study/ })).toBeNull();
    expect(lockupSegments()).toBe(1);
  });

  it('names no team when the active one is no longer a membership', async () => {
    // `activeOrganizationId` outlives membership: a researcher who leaves the
    // team they were last acting in keeps it in the setting. On a route that
    // names no team, that setting is the only candidate — and taking it
    // unchecked names a team they can no longer open.
    fixtures.useActiveOrganization.mockReturnValue({
      data: {
        id: 'team-gone',
        name: 'Departed lab',
        members: [],
        invitations: [],
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });
    renderAt('/account');

    const team = await screen.findByRole('combobox', { name: /^Team/ });
    await waitFor(() => expect(team).not.toHaveAttribute('aria-busy'));

    // The placeholder, not the departed team.
    expect(team).toHaveAccessibleName('Team Choose a team');
    expect(screen.queryByText('Departed lab')).toBeNull();

    // And nothing offers to administer it. The trailing destination is built
    // from the same resolved team, so an unresolved one leaves it out.
    fireEvent.click(team);
    expect(
      screen.queryByRole('link', { name: 'Team administration' }),
    ).toBeNull();
    // The teams they DO have are still there to switch to.
    expect(
      await screen.findByRole('option', { name: /^Alpha research team/ }),
    ).toBeInTheDocument();
  });

  it('gives every study its state and its size, and the active team its role', async () => {
    renderAt('/study/study-1');

    const study = await screen.findByRole('combobox', { name: /^Study/ });
    await waitFor(() => expect(study).not.toHaveAttribute('aria-busy'));
    fireEvent.click(study);

    // The state first, then only the counts there are: a study nobody has
    // joined reads as "Draft", not "Draft · 0 participants".
    expect(
      await screen.findByRole('option', { name: /Wave one pilot/ }),
    ).toHaveTextContent('Live · 2 waves · 14 participants');
    expect(
      screen.getByRole('option', { name: /Methods comparison/ }),
    ).toHaveTextContent('Draft');
    expect(
      screen.getByRole('option', { name: /Methods comparison/ }),
    ).not.toHaveTextContent('participants');

    // The dot is coloured BY the state, not one grey for all of them. It is
    // decoration — the line above carries the state for a reader — so this
    // asserts the two differ rather than naming a colour.
    const toneOf = (name: RegExp) =>
      screen
        .getByRole('option', { name })
        .querySelector('span[aria-hidden="true"].rounded-full')?.className;
    expect(toneOf(/Wave one pilot/)).toContain('bg-success');
    expect(toneOf(/Methods comparison/)).not.toContain('bg-success');

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });

    // A role on EVERY team, which only `me` can supply — Better Auth's team
    // list drops it. A legacy comma-separated membership reads as a sentence
    // rather than being shouted as "ADMIN,MEMBER".
    const team = await screen.findByRole('combobox', { name: /^Team/ });
    fireEvent.click(team);
    expect(
      await screen.findByRole('option', { name: /^Alpha research team/ }),
    ).toHaveTextContent('Owner');
    expect(
      screen.getByRole('option', { name: /^Beta research team/ }),
    ).toHaveTextContent('Admin, Member');
  });

  it('asks no team for its studies on a route that shows no study', async () => {
    // The header is on every app route, and the study segment's two queries —
    // the siblings, and the owner lookup that fans out across every team the
    // researcher has — must not run where there is no study to be about.
    renderAt('/account');

    // Settle the header before asking. Every query the shell starts has begun
    // by the time the team switcher has an answer, so an empty list here is a
    // list that stays empty rather than one read too early.
    const team = await screen.findByRole('combobox', { name: /^Team/ });
    await waitFor(() => expect(team).not.toHaveAttribute('aria-busy'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(fixtures.studyListRequests).toEqual([]);
    expect(lockupSegments()).toBe(1);
  });

  it('names a study none of the researcher’s teams owns by its identifier', async () => {
    // A canonical link into a study none of this researcher's teams answers
    // for — the case §6.3's `study.shell` is what will actually resolve. Every
    // team is asked and none has it, so nothing here can say what the study is
    // called or which team it belongs to, and the identifier is what the shell
    // honestly knows.
    fixtures.studies = [fixtures.STUDY_2];
    renderAt('/study/study-1');

    // Gate on the lookup having SETTLED rather than on the name that proves
    // the point. While it is still running the name is a skeleton, so the
    // identifier appearing at all is the settled answer.
    expect(await screen.findByText('study-1')).toBeInTheDocument();
    expect(lockupSegments()).toBe(2);

    // A label in the frame, not a control: no sibling can be offered, because
    // none of any team's studies is one, and \u201call studies in this team\u201d has no
    // team to name. A combobox here would open onto a list holding only the
    // study already on screen.
    expect(screen.queryByRole('combobox', { name: /^Study/ })).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });
});
