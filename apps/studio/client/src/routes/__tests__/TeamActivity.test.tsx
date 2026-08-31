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
  };
});

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Owner Researcher', email: 'owner@example.com' } },
      isPending: false,
    }),
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    audit: {
      list: {
        infiniteOptions: (options: {
          input: (pageParam: string | undefined) => Record<string, unknown>;
          initialPageParam: string | undefined;
          getNextPageParam: (page: {
            nextCursor: string | null;
          }) => string | undefined;
        }) => ({
          queryKey: ['audit-list', JSON.stringify(options.input(undefined))],
          queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
            fixtures.listAudit(options.input(pageParam)),
          initialPageParam: options.initialPageParam,
          getNextPageParam: options.getNextPageParam,
        }),
      },
      get: {
        queryOptions: (options: {
          input: { teamId: string; eventId: string };
        }) => ({
          queryKey: ['audit-get', options.input.eventId],
          queryFn: () => fixtures.getAudit(options.input),
        }),
      },
    },
  },
  rpcClient: {},
}));

function renderActivity() {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ['/teams/team-a/activity'] }),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.listAudit.mockImplementation(
    (input: { cursor?: string; teamId: string }) =>
      Promise.resolve(
        input.cursor === undefined
          ? {
              items: [fixtures.invitationCreated, fixtures.roleDenied],
              nextCursor: '2',
            }
          : { items: [fixtures.futureEvent], nextCursor: null },
      ),
  );
  fixtures.getAudit.mockResolvedValue({
    ...fixtures.invitationCreated,
    teamLabel: 'Alpha research team',
    requestId: '00000000-0000-4000-8000-00000000aaaa',
    details: { role: 'member' },
  });
});

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
    expect(screen.getByText('Studio (System)')).toBeInTheDocument();
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
    fixtures.listAudit.mockRejectedValueOnce(new Error('network down'));
    renderActivity();

    expect(
      await screen.findByText('Team activity could not be loaded.'),
    ).toBeInTheDocument();
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
      screen.getByRole('link', { name: 'Back to your teams' }),
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
});
