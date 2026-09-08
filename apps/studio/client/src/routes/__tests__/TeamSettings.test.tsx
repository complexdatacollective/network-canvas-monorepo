// @vitest-environment jsdom
import { ORPCError } from '@orpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { AuditAlertItem, AuditAlertSettings } from '@codaco/studio-rpc';

import { studioProductionLocales } from '../../i18n/locales.ts';
import TeamSettings from '../TeamSettings.tsx';

const calls = vi.hoisted(() => ({
  settings: vi.fn<(input: { teamId: string }) => Promise<AuditAlertSettings>>(),
  list: vi.fn<
    (input: {
      teamId: string;
      cursor?: string;
    }) => Promise<{ items: AuditAlertItem[]; nextCursor: string | null }>
  >(),
  updateSettings:
    vi.fn<
      (input: {
        teamId: string;
        revision: string | null;
        recipients: AuditAlertSettings['recipients'];
      }) => Promise<{ revision: string }>
    >(),
  markRead:
    vi.fn<(input: { teamId: string; alertId: string }) => Promise<void>>(),
  acknowledge:
    vi.fn<(input: { teamId: string; deliveryId: string }) => Promise<void>>(),
}));

vi.mock('../../lib/api.ts', async () => {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  const rpcClient = { audit: { alerts: calls } };
  return { rpcClient, orpc: createTanstackQueryUtils(rpcClient) };
});

const revision = '00000000-0000-4000-8000-000000000001';
const nextRevision = '00000000-0000-4000-8000-000000000002';
const canary = 'server-diagnostic-private-credential-canary';
const initialSettings = (): AuditAlertSettings => ({
  revision,
  recipients: [{ memberId: 'owner-member', inApp: true, email: false }],
  eligibleMembers: [
    {
      memberId: 'owner-member',
      name: 'Owner Researcher',
      email: 'owner@example.test',
    },
    {
      memberId: 'admin-member',
      name: 'Admin Researcher',
      email: 'admin@example.test',
    },
  ],
  eligibleMembersTruncated: false,
  emailAvailable: true,
});
const alert = (overrides: Partial<AuditAlertItem> = {}): AuditAlertItem => ({
  id: '00000000-0000-4000-8000-000000000011',
  sequence: '11',
  policy: 'contact_access',
  createdAt: new Date('2026-09-06T12:00:00.000Z'),
  inApp: true,
  readAt: null,
  emailState: null,
  emailDeliveryId: null,
  emailAcknowledgedAt: null,
  ...overrides,
});

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 2, retryDelay: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppI18nProvider
        locale="en"
        locales={studioProductionLocales}
        timeZone="UTC"
      >
        <DialogProvider>
          <TeamSettings teamId="team-a" />
        </DialogProvider>
      </AppI18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.settings.mockResolvedValue(initialSettings());
  calls.list.mockResolvedValue({ items: [], nextCursor: null });
  calls.updateSettings.mockResolvedValue({ revision: nextRevision });
  calls.markRead.mockResolvedValue();
  calls.acknowledge.mockResolvedValue();
});

describe('Team activity alert settings', () => {
  it('saves chosen eligible members and channels with the visible revision', async () => {
    renderSettings();
    const inApp = await screen.findByRole('checkbox', {
      name: 'In Studio alerts for Owner Researcher',
    });
    expect(inApp).toBeChecked();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Email alerts for Admin Researcher',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save alert preferences' }),
    );
    expect(
      await screen.findByText('Alert preferences saved.'),
    ).toBeInTheDocument();
    expect(calls.updateSettings.mock.calls[0]?.[0]).toEqual({
      teamId: 'team-a',
      revision,
      recipients: [
        { memberId: 'owner-member', inApp: true, email: false },
        { memberId: 'admin-member', inApp: false, email: true },
      ],
    });
    expect(calls.settings).toHaveBeenCalledTimes(2);
    fireEvent.click(inApp);
    expect(screen.queryByText('Alert preferences saved.')).toBeNull();
  });

  it('explains removed eligibility and unavailable email before saving only supported choices', async () => {
    calls.settings.mockResolvedValue({
      ...initialSettings(),
      emailAvailable: false,
      recipients: [
        { memberId: 'owner-member', inApp: true, email: true },
        { memberId: 'departed-member', inApp: false, email: true },
      ],
    });
    renderSettings();
    expect(
      await screen.findByText(/Some configured recipients no longer qualify/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Email delivery is unavailable/),
    ).toBeInTheDocument();
    const email = screen.getByRole('checkbox', {
      name: 'Email alerts for Owner Researcher',
    });
    expect(email).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(email);
    expect(email).not.toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Save alert preferences' }),
    );
    await waitFor(() => expect(calls.updateSettings).toHaveBeenCalledTimes(1));
    expect(calls.updateSettings.mock.calls[0]?.[0].recipients).toEqual([
      { memberId: 'owner-member', inApp: true, email: false },
    ]);
  });

  it('rejects too many recipients before sending a settings mutation', async () => {
    calls.settings.mockResolvedValue({
      ...initialSettings(),
      recipients: [],
      eligibleMembers: Array.from({ length: 11 }, (_, index) => ({
        memberId: `member-${index}`,
        name: `Researcher ${index}`,
        email: `researcher${index}@example.test`,
      })),
    });
    renderSettings();
    await screen.findByRole('checkbox', {
      name: 'In Studio alerts for Researcher 10',
    });
    for (let index = 0; index < 11; index++)
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: `In Studio alerts for Researcher ${index}`,
        }),
      );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save alert preferences' }),
    );
    expect(
      await screen.findByText(
        /Choose up to 10 eligible recipients and use only/,
      ),
    ).toBeInTheDocument();
    expect(calls.updateSettings).not.toHaveBeenCalled();
  });

  it('preserves choices on a revision conflict and never displays raw server diagnostics', async () => {
    calls.updateSettings.mockRejectedValue(
      new ORPCError('CONFLICT', { message: canary }),
    );
    renderSettings();
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Email alerts for Admin Researcher',
    });
    fireEvent.click(checkbox);
    fireEvent.click(
      screen.getByRole('button', { name: 'Save alert preferences' }),
    );
    expect(
      await screen.findByText(/These preferences changed elsewhere/),
    ).toBeInTheDocument();
    expect(checkbox).toBeChecked();
    expect(calls.updateSettings).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain(canary);
  });

  it('reports a confirmed save separately from a failed follow-up read', async () => {
    calls.updateSettings.mockImplementation(async () => {
      calls.settings.mockRejectedValue(new Error(canary));
      return { revision: nextRevision };
    });
    renderSettings();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save alert preferences' }),
    );
    expect(
      await screen.findByText(
        'Alert preferences were saved. Refresh to load their current state.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/The save could not be confirmed/)).toBeNull();
    expect(document.body.textContent).not.toContain(canary);
  });

  it('does not retry a denied settings read or request a second denied feed', async () => {
    calls.settings.mockRejectedValue(
      new ORPCError('FORBIDDEN', { message: canary }),
    );
    renderSettings();
    expect(
      await screen.findByText(
        /A verified owner or administrator account is required/,
      ),
    ).toBeInTheDocument();
    expect(calls.settings).toHaveBeenCalledTimes(1);
    expect(calls.list).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(canary);
  });

  it('marks only the selected personal alert read and loads later pages with the server cursor', async () => {
    calls.list.mockImplementation(async (input) =>
      input.cursor
        ? {
            items: [
              alert({
                id: '00000000-0000-4000-8000-000000000010',
                sequence: '10',
                policy: 'credential_access',
                readAt: new Date(),
              }),
            ],
            nextCursor: null,
          }
        : {
            items: [
              alert({
                readAt: calls.markRead.mock.calls.length ? new Date() : null,
              }),
            ],
            nextCursor: '11',
          },
    );
    renderSettings();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark as read' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull(),
    );
    expect(calls.markRead.mock.calls[0]?.[0]).toEqual({
      teamId: 'team-a',
      alertId: alert().id,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load more alerts' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Integration credential activity',
      }),
    ).toBeInTheDocument();
    expect(calls.list.mock.calls.at(-1)?.[0]).toEqual({
      teamId: 'team-a',
      cursor: '11',
    });
  });

  it('requires confirmation for uncertain delivery and records acknowledgement without a resend action', async () => {
    const item = alert({
      emailState: 'uncertain',
      emailDeliveryId: '00000000-0000-4000-8000-000000000020',
    });
    calls.list.mockImplementation(async () => ({
      items: [
        {
          ...item,
          emailAcknowledgedAt: calls.acknowledge.mock.calls.length
            ? new Date()
            : null,
        },
      ],
      nextCursor: null,
    }));
    renderSettings();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Acknowledge uncertainty' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Acknowledge this delivery?');
    expect(calls.acknowledge).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(/does not resend the email/),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Acknowledge uncertainty' }),
    );
    expect(
      await screen.findByText('Uncertainty acknowledged'),
    ).toBeInTheDocument();
    expect(calls.acknowledge.mock.calls[0]?.[0]).toEqual({
      teamId: 'team-a',
      deliveryId: item.emailDeliveryId,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('hides cached alerts when the refreshed feed denies permission', async () => {
    calls.list.mockResolvedValue({ items: [alert()], nextCursor: null });
    renderSettings();
    const heading = await screen.findByRole('heading', {
      name: 'Participant contact information accessed',
    });
    calls.list.mockRejectedValue(
      new ORPCError('FORBIDDEN', { message: canary }),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Refresh' })[0]!);
    expect(
      await screen.findByText(
        /A verified owner or administrator account is required/,
      ),
    ).toBeInTheDocument();
    expect(heading).not.toBeInTheDocument();
    expect(calls.list).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain(canary);
  });
});
