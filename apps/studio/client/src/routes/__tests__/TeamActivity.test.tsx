// @vitest-environment jsdom
import { ORPCError } from '@orpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../../router.tsx';

const fixtures = vi.hoisted(() => {
  const invitationCreated = {
    id: '00000000-0000-4000-8000-000000000003',
    sequence: '3',
    occurredAt: new Date('2026-08-30T10:15:00.000Z'),
    eventType: 'team.invitation.created',
    eventVersion: 1,
    category: 'team_access',
    outcome: 'succeeded',
    actor: { kind: 'user', id: 'user-owner', label: 'Owner Researcher' },
    subject: {
      type: 'team_invitation',
      id: 'invitation-1',
      label: 'invitee@example.com',
    },
    resource: null,
    title: 'Invitation created',
    rendered: true,
  };
  const roleDenied = {
    id: '00000000-0000-4000-8000-000000000002',
    sequence: '2',
    occurredAt: new Date('2026-08-30T10:05:00.000Z'),
    eventType: 'team.member.role_change_denied',
    eventVersion: 1,
    category: 'team_access',
    outcome: 'denied',
    actor: { kind: 'user', id: 'user-admin', label: 'Admin Researcher' },
    subject: { type: 'team_member', id: 'member-1', label: 'Member One' },
    resource: null,
    title: 'Member role change denied',
    rendered: true,
  };
  const futureEvent = {
    id: '00000000-0000-4000-8000-000000000001',
    sequence: '1',
    occurredAt: new Date('2026-08-30T10:00:00.000Z'),
    eventType: 'audit.future_event',
    eventVersion: 7,
    category: 'audit',
    outcome: 'succeeded',
    actor: { kind: 'system', id: null, label: 'Studio' },
    subject: null,
    resource: null,
    title: 'audit.future_event',
    rendered: false,
  };
  return {
    invitationCreated,
    roleDenied,
    futureEvent,
    listAudit: vi.fn(),
    getAudit: vi.fn(),
    auditFilterOptions: vi.fn(),
  };
});

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Owner Researcher', email: 'owner@example.com' } },
      isPending: false,
    }),
    useListOrganizations: vi.fn().mockReturnValue({
      data: [],
      error: null,
      isPending: false,
    }),
    useActiveOrganization: vi.fn().mockReturnValue({
      data: { id: 'team-a', name: 'Alpha research team' },
      error: null,
      isPending: false,
      refetch: vi.fn(),
    }),
    useActiveMember: vi.fn().mockReturnValue({
      data: { id: 'member-1', organizationId: 'team-a', role: 'owner' },
      error: null,
      isPending: false,
      refetch: vi.fn(),
    }),
    organization: {
      setActive: vi.fn().mockResolvedValue({ data: null, error: null }),
      list: vi.fn(),
    },
    signOut: vi.fn(),
  },
}));

type RetryOption =
  | boolean
  | number
  | ((failureCount: number, error: unknown) => boolean);

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    // The header renders on every app route, and its study segment asks for
    // the team's studies — a real dependency of the shell these tests mount,
    // not of this screen. It answers nothing here: no study is open, so the
    // query is disabled and the segment is absent.
    protocols: {
      list: {
        queryOptions: () => ({
          queryKey: ['protocols', 'list'],
          queryFn: () => [],
        }),
      },
    },
    // The team area reads the deployment topology from here to decide whether
    // this instance has billing at all (§10.4), so every test that renders a
    // team route needs an answer.
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
    // The header's study chip asks for the study on every app route, and
    // answers nothing on one that names no study.
    studies: {
      list: {
        queryOptions: () => ({ queryKey: ['studies'], queryFn: () => [] }),
        key: () => ['studies'],
      },
      get: {
        queryOptions: () => ({ queryKey: ['study'], queryFn: () => null }),
        key: () => ['study'],
      },
      create: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
    },
    audit: {
      list: {
        infiniteOptions: (options: {
          input: (pageParam: string | undefined) => Record<string, unknown>;
          initialPageParam: string | undefined;
          getNextPageParam: (page: {
            nextCursor: string | null;
          }) => string | undefined;
          retry?: RetryOption;
        }) => ({
          queryKey: ['audit-list', JSON.stringify(options.input(undefined))],
          queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
            fixtures.listAudit(options.input(pageParam)),
          initialPageParam: options.initialPageParam,
          getNextPageParam: options.getNextPageParam,
          // The real @orpc/tanstack-query queryOptions/infiniteOptions spread
          // their input options onto the returned query options, so a `retry`
          // passed by the route reaches React Query. Mirror that here, or a
          // retry regression cannot be observed.
          retry: options.retry,
        }),
      },
      get: {
        queryOptions: (options: {
          input: { teamId: string; eventId: string };
          retry?: RetryOption;
        }) => ({
          queryKey: ['audit-get', options.input.eventId],
          queryFn: () => fixtures.getAudit(options.input),
          retry: options.retry,
        }),
      },
      filterOptions: {
        queryOptions: (options: {
          input: { teamId: string };
          enabled?: boolean;
          staleTime?: number;
          retry?: RetryOption;
        }) => ({
          queryKey: ['audit-filter-options', options.input.teamId],
          queryFn: () => fixtures.auditFilterOptions(options.input),
          // `enabled` gates the second audit read; a mock that ignored it
          // could not observe the denied-path behaviour below.
          enabled: options.enabled,
          staleTime: options.staleTime,
          retry: options.retry,
        }),
      },
    },
  },
  rpcClient: {},
}));

// `retry` defaults to false so most tests observe a single attempt. The retry
// tests pass a retrying default instead, so that a route query which forwards
// no retry option of its own inherits it and visibly retries.
function renderActivity(defaultRetry: RetryOption = false) {
  // One client behind both the router's guards and the components: the
  // session guard reads what a component's `queryClient.clear()` removes.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: defaultRetry, retryDelay: 0 } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ['/team/team-a/activity'] }),
    queryClient,
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function listPages(input: { cursor?: string; teamId: string }) {
  return Promise.resolve(
    input.cursor === undefined
      ? {
          items: [fixtures.invitationCreated, fixtures.roleDenied],
          nextCursor: '2',
        }
      : { items: [fixtures.futureEvent], nextCursor: null },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // One test pins a timezone to reach a daylight-saving boundary; undoing it
  // here rather than in that test means a failed assertion cannot leave the
  // rest of the file running in New York.
  vi.unstubAllEnvs();
  fixtures.listAudit.mockImplementation(listPages);
  fixtures.getAudit.mockResolvedValue({
    ...fixtures.invitationCreated,
    teamLabel: 'Alpha research team',
    requestId: '00000000-0000-4000-8000-00000000aaaa',
    details: { role: 'member' },
  });
  // Deliberately a superset of the loaded pages: these are the team's whole
  // history, not the rows on screen.
  fixtures.auditFilterOptions.mockResolvedValue({
    actions: [
      { eventType: 'team.invitation.created', title: 'Invitation created' },
      {
        eventType: 'team.member.role_change_denied',
        title: 'Member role change denied',
      },
      { eventType: 'protocol.created', title: 'Protocol created' },
    ],
    actors: [
      { kind: 'user', id: 'user-owner', label: 'Owner Researcher' },
      { kind: 'user', id: 'user-departed', label: 'Departed Researcher' },
      { kind: 'system', id: null, label: 'Studio' },
    ],
    truncated: false,
  });
});

function optionLabels(select: HTMLElement): string[] {
  return [...select.querySelectorAll('option')].map(
    (option) => option.textContent ?? '',
  );
}

describe('Team activity screen', () => {
  it('lists events newest-first with titles and outcomes, then pages to the history boundary', async () => {
    renderActivity();

    expect(
      await screen.findByRole('cell', { name: 'Invitation created' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('cell', { name: 'Member role change denied' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Denied' })).toBeInTheDocument();
    expect(screen.getByText('invitee@example.com')).toBeInTheDocument();
    expect(
      screen.queryByRole('cell', {
        name: 'audit.future_event Unrecognized event',
      }),
    ).toBeNull();
    expect(fixtures.listAudit).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-a' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(
      await screen.findByRole('cell', {
        name: 'audit.future_event Unrecognized event',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Unrecognized event')).toBeInTheDocument();
    // Scoped to the row: the same text is now also an actor filter option,
    // because the options come from the team's history rather than the feed.
    expect(
      screen.getByRole('cell', { name: 'Studio (System)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/beginning of the recorded activity/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('applies filters server-side and resets pagination', async () => {
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByRole('cell', {
      name: 'audit.future_event Unrecognized event',
    });

    fixtures.listAudit.mockResolvedValue({
      items: [fixtures.roleDenied],
      nextCursor: null,
    });
    fireEvent.change(screen.getByLabelText('Outcome'), {
      target: { value: 'denied' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => {
      expect(fixtures.listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ outcomes: ['denied'] }),
      );
    });
    expect(fixtures.listAudit).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ cursor: expect.anything() }),
    );
    expect(
      await screen.findByRole('cell', { name: 'Member role change denied' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole('cell', { name: 'Invitation created' }),
      ).toBeNull();
    });

    fixtures.listAudit.mockResolvedValue({ items: [], nextCursor: null });
    fireEvent.change(screen.getByLabelText('Outcome'), {
      target: { value: 'failed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(
      await screen.findByText('No activity matches these filters.'),
    ).toBeInTheDocument();
  });

  it('offers filter values that are absent from the loaded pages', async () => {
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });
    await waitFor(() => {
      expect(fixtures.auditFilterOptions).toHaveBeenCalledWith({
        teamId: 'team-a',
      });
    });

    // 'Protocol created' is in no loaded page and 'Departed Researcher' has no
    // row on screen at all: an option list built from the feed cannot offer
    // either without paging through the whole history first.
    await waitFor(() => {
      expect(optionLabels(screen.getByLabelText('Action'))).toContain(
        'Protocol created',
      );
    });
    expect(optionLabels(screen.getByLabelText('Actor'))).toContain(
      'Departed Researcher',
    );
  });

  it('keeps every action selectable once a filter has narrowed the feed', async () => {
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });
    await waitFor(() => {
      expect(optionLabels(screen.getByLabelText('Action'))).toContain(
        'Protocol created',
      );
    });

    fixtures.listAudit.mockResolvedValue({
      items: [fixtures.roleDenied],
      nextCursor: null,
    });
    fireEvent.change(screen.getByLabelText('Action'), {
      target: { value: 'team.member.role_change_denied' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => {
      expect(fixtures.listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          eventTypes: ['team.member.role_change_denied'],
        }),
      );
    });

    // Options drawn from the feed would now be exactly the applied value, so
    // switching to a different action would first need Clear filters.
    expect(optionLabels(screen.getByLabelText('Action'))).toContain(
      'Invitation created',
    );
    // The option set is invariant across filter changes, so applying a filter
    // must not re-fetch it.
    expect(fixtures.auditFilterOptions).toHaveBeenCalledTimes(1);
  });

  // The server records event times to the microsecond, so an inclusive
  // millisecond cutoff would leave the last fraction of the chosen day outside
  // the window and quietly drop the events in it. The screen names the instant
  // the next day begins and lets the server exclude it, which no event can sit
  // just short of.
  it('sends a chosen date range as local midnights bounding a half-open window', async () => {
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });

    fireEvent.change(screen.getByLabelText('From date'), {
      target: { value: '2026-03-05' },
    });
    fireEvent.change(screen.getByLabelText('To date'), {
      target: { value: '2026-03-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => {
      expect(fixtures.listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          from: new Date('2026-03-05T00:00:00'),
          to: new Date('2026-03-06T00:00:00'),
        }),
      );
    });
  });

  // The boundary is the next local midnight, not twenty-four hours on. In a
  // zone that observes daylight saving those differ: on 8 March 2026 New York
  // puts its clocks forward, so the next midnight is 23 hours away and an
  // added day would end the window an hour into 10 March. The suite otherwise
  // runs in whatever zone the machine keeps, where the two agree and this
  // could not fail.
  it('ends the window at local midnight across a daylight-saving change', async () => {
    vi.stubEnv('TZ', 'America/New_York');
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });

    fireEvent.change(screen.getByLabelText('To date'), {
      target: { value: '2026-03-08' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => {
      expect(fixtures.listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ to: new Date('2026-03-09T00:00:00') }),
      );
    });
  });

  it('filters for a system actor that carries no id', async () => {
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });
    await waitFor(() => {
      expect(optionLabels(screen.getByLabelText('Actor'))).toContain(
        'Studio (System)',
      );
    });

    fixtures.listAudit.mockResolvedValue({
      items: [fixtures.futureEvent],
      nextCursor: null,
    });
    fireEvent.change(screen.getByLabelText('Actor'), {
      target: { value: 'system:' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => {
      expect(fixtures.listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ actor: { kind: 'system', id: null } }),
      );
    });
  });

  // The cap is the server's, and nothing on this screen raises it, so the
  // notice must be shown only when the server reports it and must not offer a
  // remedy the viewer does not have.
  it('says so when the option list is capped, and stays quiet when it is not', async () => {
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });
    await waitFor(() => {
      expect(fixtures.auditFilterOptions).toHaveBeenCalled();
    });
    expect(screen.queryByText(/missing from them/)).toBeNull();

    fixtures.auditFilterOptions.mockResolvedValue({
      actions: [],
      actors: [],
      truncated: true,
    });
    renderActivity();
    expect(
      await screen.findByText(/than these menus can list/),
    ).toBeInTheDocument();
  });

  it('asks for no filter options while the log itself is denied', async () => {
    fixtures.listAudit.mockRejectedValue(new ORPCError('FORBIDDEN'));
    renderActivity();
    await screen.findByText(/only available to team owners and admins/);
    // Every denied audit read commits a rate-limited audit.read_denied event;
    // one refusal per visit, not two.
    expect(fixtures.auditFilterOptions).not.toHaveBeenCalled();
  });

  it('shows the unfiltered empty state', async () => {
    fixtures.listAudit.mockResolvedValue({ items: [], nextCursor: null });
    renderActivity();
    expect(
      await screen.findByText(
        'No activity has been recorded for this team yet.',
      ),
    ).toBeInTheDocument();
  });

  it('recovers from a load error through Retry', async () => {
    // Rejects for every attempt: a transient failure is retried away by the
    // route's own retry option, so the error state needs a persistent failure.
    fixtures.listAudit.mockRejectedValue(new Error('network down'));
    renderActivity();

    expect(
      await screen.findByText('Team activity could not be loaded.'),
    ).toBeInTheDocument();
    fixtures.listAudit.mockImplementation(listPages);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('cell', { name: 'Invitation created' }),
    ).toBeInTheDocument();
  });

  it('shows the permission state for members', async () => {
    fixtures.listAudit.mockRejectedValue(new ORPCError('FORBIDDEN'));
    renderActivity();

    expect(
      await screen.findByText(/only available to team owners and admins/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to this team\u2019s studies' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Apply filters')).toBeNull();
  });

  it('opens an accessible detail dialog with local and exact UTC time', async () => {
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });

    fireEvent.click(screen.getByRole('button', { name: 'Invitation created' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Invitation created');
    expect(
      await screen.findByText('2026-08-30T10:15:00.000Z'),
    ).toBeInTheDocument();
    expect(screen.getByText('Time (UTC)')).toBeInTheDocument();
    expect(screen.getByText('Request ID')).toBeInTheDocument();
    expect(
      screen.getByText('00000000-0000-4000-8000-00000000aaaa'),
    ).toBeInTheDocument();
    expect(screen.getByText('role')).toBeInTheDocument();
    expect(fixtures.getAudit).toHaveBeenCalledWith({
      teamId: 'team-a',
      eventId: fixtures.invitationCreated.id,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  // The Fresco theme resets `--breakpoint-*` and defines only named
  // breakpoints, so a default-namespace variant such as `sm:` compiles to no
  // CSS at all and its declaration silently never applies.
  it('sizes page padding with a registered Fresco breakpoint', async () => {
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });

    // The `<main>` is the area layout's; the page container this test is
    // about is the route's own element inside it.
    const page = screen.getByRole('main').firstElementChild;
    const className = page?.className ?? '';
    expect(className).toContain('tablet-portrait:p-8');
    expect(className).not.toMatch(/(?:^|\s)(?:sm|md|lg|xl|2xl):/);
  });

  it('renders a detail value that JSON cannot express', async () => {
    fixtures.getAudit.mockResolvedValue({
      ...fixtures.invitationCreated,
      teamLabel: 'Alpha research team',
      requestId: '00000000-0000-4000-8000-00000000aaaa',
      details: { role: 'member', attemptCount: 9007199254740993n },
    });
    renderActivity();
    await screen.findByRole('cell', { name: 'Invitation created' });

    fireEvent.click(screen.getByRole('button', { name: 'Invitation created' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('attemptCount')).toBeInTheDocument();
    expect(screen.getByText('9007199254740993')).toBeInTheDocument();
  });

  it('does not retry either audit read after a permission refusal', async () => {
    fixtures.listAudit.mockRejectedValue(new ORPCError('FORBIDDEN'));
    renderActivity(2);

    expect(
      await screen.findByText(/only available to team owners and admins/),
    ).toBeInTheDocument();
    expect(fixtures.listAudit).toHaveBeenCalledTimes(1);
  });

  // A viewer demoted after the feed loaded gets FORBIDDEN from audit.get.
  // Retrying it appends a further audit.read_denied event per attempt.
  it('does not retry a detail read that was denied', async () => {
    fixtures.getAudit.mockRejectedValue(new ORPCError('FORBIDDEN'));
    renderActivity(2);
    await screen.findByRole('cell', { name: 'Invitation created' });

    fireEvent.click(screen.getByRole('button', { name: 'Invitation created' }));

    expect(
      await screen.findByText('The event could not be loaded.'),
    ).toBeInTheDocument();
    expect(fixtures.getAudit).toHaveBeenCalledTimes(1);
  });

  // Guards the shape of the fix: suppressing retries outright would also stop
  // a transient failure from recovering.
  it('still retries a detail read that failed transiently', async () => {
    fixtures.getAudit.mockRejectedValueOnce(new Error('network down'));
    renderActivity(2);
    await screen.findByRole('cell', { name: 'Invitation created' });

    fireEvent.click(screen.getByRole('button', { name: 'Invitation created' }));

    expect(await screen.findByText('Request ID')).toBeInTheDocument();
    expect(fixtures.getAudit).toHaveBeenCalledTimes(2);
  });
});
