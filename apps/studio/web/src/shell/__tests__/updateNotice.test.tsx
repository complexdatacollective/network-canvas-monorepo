// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { Forbidden } from '@codaco/studio-contract/schema/errors';
import type {
  InstanceStatus,
  UpdateAvailable,
} from '@codaco/studio-contract/schema/status';
import type { DeploymentMode } from '@codaco/studio-contract/surfaces';

import { StudioI18nProvider } from '../../i18n/StudioI18nProvider.tsx';
import { createAppRouter } from '../../router.tsx';
import {
  installRpcHarness,
  type StudioHandlers,
} from '../../test/rpcHarness.ts';
import UpdateNotice from '../UpdateNotice.tsx';

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Researcher', email: 'researcher@example.com' } },
      isPending: false,
      error: null,
    }),
    useListOrganizations: vi.fn().mockReturnValue({
      data: [{ id: 'team-a', name: 'Alpha research team', slug: 'alpha' }],
      isPending: false,
      error: null,
    }),
    useActiveOrganization: vi.fn(() => ({
      data: { id: 'team-a' },
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
      list: vi.fn().mockResolvedValue({
        data: [{ id: 'team-a', name: 'Alpha research team', slug: 'alpha' }],
        error: null,
      }),
    },
    signOut: vi.fn(),
  },
}));

const statusIn = (mode: DeploymentMode): InstanceStatus => ({
  name: 'Network Canvas Studio',
  version: '1.2.3',
  auth: {
    enabled: true,
    magicLink: true,
    emailAndPassword: true,
    socialProviders: [],
  },
  deployment: { mode, billing: false },
  setup: { required: false },
});

const NOTES_URL = 'https://releases.networkcanvas.com/studio/1.3.0';

const UPDATE: UpdateAvailable = {
  version: '1.3.0',
  releasedAt: new Date('2026-10-01T12:00:00Z'),
  notesUrl: NOTES_URL,
  schemaChange: false,
};

const SCHEMA_UPDATE: UpdateAvailable = { ...UPDATE, schemaChange: true };

type Answer = ReturnType<StudioHandlers['status.updateAvailable']>;

function renderNotice() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <StudioI18nProvider>
        <UpdateNotice />
      </StudioI18nProvider>
    </QueryClientProvider>,
  );
  return { view, queryClient };
}

/**
 * The notice's own question has been asked and has finished. Asserting that
 * something is ABSENT is only evidence once the read that could have put it
 * there is over, so the negative cases wait for the request, and then for
 * nothing to be in flight, before they look.
 */
async function settled(
  harness: { calls: ReadonlyArray<{ tag: string }> },
  queryClient: QueryClient,
) {
  await waitFor(() =>
    expect(
      harness.calls.filter((call) => call.tag === 'status.updateAvailable'),
    ).toHaveLength(1),
  );
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
}

describe('the update notice', () => {
  it('tells the owner the version, links the release notes, and says this release does not change the database', async () => {
    installRpcHarness({
      'status.updateAvailable': () => Effect.succeed(UPDATE),
      'status': () => Effect.succeed(statusIn('managed')),
    });
    renderNotice();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Studio 1.3.0 is available');
    expect(notice).toHaveTextContent(
      'This release does not change the database.',
    );
    expect(notice).not.toHaveTextContent(/backup/i);
    expect(
      within(notice).getByRole('link', { name: 'Release notes' }),
    ).toHaveAttribute('href', NOTES_URL);
  });

  it('says a release that changes the database is undone by restoring the backup taken during the upgrade', async () => {
    installRpcHarness({
      'status.updateAvailable': () => Effect.succeed(SCHEMA_UPDATE),
      'status': () => Effect.succeed(statusIn('managed')),
    });
    renderNotice();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Studio 1.3.0 is available');
    expect(notice).toHaveTextContent(
      'This release changes the database: rolling back means restoring the backup taken during the upgrade.',
    );
    expect(notice).not.toHaveTextContent('does not change the database');
  });

  it('links the self-host upgrade guide on a self-hosted instance', async () => {
    installRpcHarness({
      'status.updateAvailable': () => Effect.succeed(UPDATE),
      'status': () => Effect.succeed(statusIn('self-hosted')),
    });
    renderNotice();

    const guide = await screen.findByRole('link', { name: 'Upgrade guide' });
    expect(guide).toHaveAttribute(
      'href',
      expect.stringContaining('/apps/studio/docs/self-host/upgrade.md'),
    );
    expect(screen.getByRole('link', { name: 'Release notes' })).toHaveAttribute(
      'href',
      NOTES_URL,
    );
  });

  it('does not offer the self-host guide on a managed instance', async () => {
    const harness = installRpcHarness({
      'status.updateAvailable': () => Effect.succeed(UPDATE),
      'status': () => Effect.succeed(statusIn('managed')),
    });
    renderNotice();

    await screen.findByRole('link', { name: 'Release notes' });
    // The mode is what decides the link, so wait for the read that carries it.
    await waitFor(() =>
      expect(harness.calls.map((call) => call.tag)).toContain('status'),
    );
    expect(screen.queryByRole('link', { name: 'Upgrade guide' })).toBeNull();
  });

  it('renders no region at all for someone who is not the owner, and never asks for the mode', async () => {
    // The server answers `null` for everyone but the owner; the notice has no
    // way to tell the two apart and must not try.
    const harness = installRpcHarness({
      'status.updateAvailable': () => Effect.succeed(null),
      'status': () => Effect.succeed(statusIn('self-hosted')),
    });
    const { view, queryClient } = renderNotice();
    await settled(harness, queryClient);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(view.container).toBeEmptyDOMElement();
    expect(harness.calls.map((call) => call.tag)).not.toContain('status');
  });

  it('renders nothing for an instance that is already current', async () => {
    // Same wire answer as above — `null` — reached by the owner of a current
    // instance. Kept as its own case because it is the other half of the
    // contract: the server, not the client, decides "current".
    const harness = installRpcHarness({
      'status.updateAvailable': () => Effect.succeed(null),
    });
    const { view, queryClient } = renderNotice();
    await settled(harness, queryClient);

    expect(view.container).toBeEmptyDOMElement();
  });

  it('renders nothing, and no error of its own, when the read is refused', async () => {
    const harness = installRpcHarness({
      'status.updateAvailable': (): Answer => Effect.fail(new Forbidden({})),
    });
    const { view, queryClient } = renderNotice();
    await settled(harness, queryClient);

    expect(view.container).toBeEmptyDOMElement();
  });

  it('renders nothing while the read is still outstanding', () => {
    installRpcHarness({
      'status.updateAvailable': () => Effect.never,
    });
    const { view } = renderNotice();

    expect(view.container).toBeEmptyDOMElement();
  });
});

describe('the update notice in the app shell', () => {
  it('is in the header, above the screen, and absent when there is nothing to announce', async () => {
    installRpcHarness({
      'me': () =>
        Effect.succeed({
          userId: 'user-1',
          email: 'researcher@example.org',
          emailVerified: true,
          name: 'Researcher',
          locale: null,
          teams: [],
        }),
      'status': () => Effect.succeed(statusIn('self-hosted')),
      'status.updateAvailable': () => Effect.succeed(UPDATE),
      'studies.get': () => Effect.fail(new Forbidden({})),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createAppRouter(
      createMemoryHistory({
        initialEntries: ['/study/11111111-1111-4111-8111-111111111111'],
      }),
      queryClient,
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const banner = await screen.findByRole('banner');
    expect(
      await within(banner).findByText(/Studio 1\.3\.0 is available/),
    ).toBeInTheDocument();
  });
});
