import { ORPCError } from '@orpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';

import { studioProductionLocales } from '../../i18n/locales.ts';
import type { rpcClient } from '../../lib/api.ts';
import AccountRegistry from '../AccountRegistry.tsx';
import Templates from '../Templates.tsx';

const calls = vi.hoisted(() => ({
  me: vi.fn<typeof rpcClient.me>(),
  registry: vi.fn<typeof rpcClient.account.registry>(),
  linkRegistry: vi.fn<typeof rpcClient.account.linkRegistry>(),
  list: vi.fn<typeof rpcClient.templates.list>(),
  publish: vi.fn<typeof rpcClient.templates.publish>(),
  import: vi.fn<typeof rpcClient.templates.import>(),
}));
vi.mock('../../lib/api.ts', async () => {
  const { createTanstackQueryUtils } = await import('@orpc/tanstack-query');
  const rpcClient = {
    me: calls.me,
    account: { registry: calls.registry, linkRegistry: calls.linkRegistry },
    templates: {
      list: calls.list,
      publish: calls.publish,
      import: calls.import,
    },
  };
  return { rpcClient, orpc: createTanstackQueryUtils(rpcClient) };
});
vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    useListOrganizations: () => ({
      data: [
        { id: 'team-a', name: 'Alpha research team' },
        { id: 'team-b', name: 'Beta research team' },
      ],
      isPending: false,
      error: null,
    }),
  },
}));

const origin = 'https://registry.example';
const credential = `ncr1_${'a'.repeat(43)}`;
const entryId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const templateId = '33333333-3333-4333-8333-333333333333';
const publisher = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Publisher Researcher',
  orcid: null,
};
const account = {
  origin,
  link: { origin, publisher, linkedAt: new Date('2026-09-08T00:00:00Z') },
};
type TemplateVersion = Awaited<
  ReturnType<typeof rpcClient.templates.list>
>[number];
const version = (): TemplateVersion => ({
  templateId,
  versionId,
  name: 'Research template',
  kind: 'protocol',
  version: 1,
  publishedAt: new Date('2026-09-08T00:00:00Z'),
  registryOrigin: null,
  publications: [],
});
const publication = {
  entryId,
  registryUrl: origin,
  root: 'a'.repeat(64),
  publisher,
  publishedAt: new Date('2026-09-08T00:00:00Z'),
};

function renderPage(page: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppI18nProvider
        locale="en"
        locales={studioProductionLocales}
        timeZone="UTC"
      >
        {page}
      </AppI18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  calls.me.mockResolvedValue({
    userId: 'user-a',
    name: 'Researcher',
    email: 'researcher@example.test',
    emailVerified: true,
    locale: null,
    teams: [
      { teamId: 'team-a', role: 'owner,admin' },
      { teamId: 'team-b', role: 'member' },
    ],
  });
  calls.registry.mockResolvedValue(account);
  calls.linkRegistry.mockResolvedValue(account);
  calls.list.mockResolvedValue([version()]);
  calls.publish.mockResolvedValue({ publication, replayed: false });
  calls.import.mockResolvedValue({ templateId, versionId, replayed: false });
});

describe('Studio Registry forms', () => {
  it('links the publisher and clears the request credential without losing focus', async () => {
    calls.registry.mockResolvedValue({ origin, link: null });
    calls.linkRegistry.mockImplementation(async () => {
      calls.registry.mockResolvedValue(account);
      return account;
    });
    renderPage(<AccountRegistry />);
    const input = await screen.findByLabelText(
      /Registry publishing credential/,
    );
    fireEvent.change(input, { target: { value: credential } });
    const submit = screen.getByRole('button', {
      name: 'Verify and link account',
    });
    submit.focus();
    fireEvent.click(submit);
    expect(
      await screen.findByText('The Registry publisher identity was linked.'),
    ).toBeInTheDocument();
    expect(calls.linkRegistry.mock.calls[0]?.[0]).toEqual({ credential });
    expect(input).toHaveValue('');
    expect(submit).toHaveFocus();
    expect(
      screen.getByText(/Linked as Publisher Researcher/),
    ).toBeInTheDocument();
  });

  it('uses team names, publishes once, clears the credential and renders the receipt', async () => {
    calls.publish.mockImplementation(async () => {
      calls.list.mockResolvedValue([
        { ...version(), publications: [publication] },
      ]);
      return { publication, replayed: false };
    });
    renderPage(<Templates />);
    expect(
      await screen.findByRole('option', { name: 'Alpha research team' }),
    ).toBeInTheDocument();
    const input = await screen.findByLabelText(
      /Registry publishing credential/,
    );
    fireEvent.change(input, { target: { value: credential } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish version' }));
    expect(
      await screen.findByText('The template version was published.'),
    ).toBeInTheDocument();
    expect(calls.publish.mock.calls[0]?.[0]).toEqual({
      teamId: 'team-a',
      versionId,
      credential,
    });
    expect(calls.publish).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Published by Publisher Researcher/),
    ).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Published' })).toBeDisabled();
  });

  it('waits for an actual Registry response and prevents another click while publishing', async () => {
    let release!: (
      value: Awaited<ReturnType<typeof rpcClient.templates.publish>>,
    ) => void;
    calls.publish.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    renderPage(<Templates />);
    fireEvent.change(
      await screen.findByLabelText(/Registry publishing credential/),
      { target: { value: credential } },
    );
    const submit = screen.getByRole('button', { name: 'Publish version' });
    fireEvent.click(submit);
    await waitFor(() => expect(calls.publish).toHaveBeenCalledTimes(1));
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(calls.publish).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('The template version was published.'),
    ).toBeNull();
    release({ publication, replayed: false });
    expect(
      await screen.findByText('The template version was published.'),
    ).toBeInTheDocument();
  });

  it('imports in the selected team and distinctly reports a newer schema', async () => {
    calls.import.mockRejectedValueOnce(
      new ORPCError('UNPROCESSABLE_CONTENT', {
        message: 'TEMPLATE_SCHEMA_UNSUPPORTED',
      }),
    );
    renderPage(<Templates />);
    const entry = await screen.findByLabelText(/Registry entry ID/);
    fireEvent.change(entry, { target: { value: entryId } });
    fireEvent.click(screen.getByRole('button', { name: 'Import template' }));
    expect(
      await screen.findByText(
        'This Registry template uses a newer protocol schema than this Studio supports.',
      ),
    ).toBeInTheDocument();
    expect(calls.import.mock.calls[0]?.[0]).toEqual({
      teamId: 'team-a',
      entryId,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import template' }));
    expect(
      await screen.findByText('The Registry template was imported.'),
    ).toBeInTheDocument();
    expect(calls.import).toHaveBeenCalledTimes(2);
  });

  it('clears the team-scoped forms and removes mutation controls for a member team', async () => {
    renderPage(<Templates />);
    fireEvent.change(await screen.findByLabelText(/Registry entry ID/), {
      target: { value: entryId },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Team' }), {
      target: { value: 'team-b' },
    });
    expect(
      await screen.findByText(
        'Only team owners and administrators can publish or import templates.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish version' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Import template' }),
    ).toBeNull();
    expect(calls.publish).not.toHaveBeenCalled();
    expect(calls.import).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Team' }), {
      target: { value: 'team-a' },
    });
    expect(await screen.findByLabelText(/Registry entry ID/)).toHaveValue('');
  });

  it('shows loading honestly and renders a bounded read error', async () => {
    let fail!: (error: Error) => void;
    calls.registry.mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    renderPage(<Templates />);
    expect(screen.getByText('Loading templates…')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'This Studio instance has no Template Registry configured.',
      ),
    ).toBeNull();
    await waitFor(() => expect(calls.registry).toHaveBeenCalledTimes(1));
    fail(new Error('private-provider-diagnostic'));
    expect(
      await screen.findByText('Templates could not be loaded. Try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('private-provider-diagnostic')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Import template' }),
    ).toBeNull();
  });

  it('renders import provenance and template-list failures', async () => {
    calls.list.mockResolvedValue([
      {
        ...version(),
        registryOrigin: {
          registry_url: origin,
          entry_id: entryId,
          source_version_hash: 'a'.repeat(64),
          fetched_at: '2026-09-08T00:00:00Z',
        },
      },
    ]);
    const page = renderPage(<Templates />);
    expect(
      await screen.findByText(/Imported from https:\/\/registry.example/),
    ).toBeInTheDocument();
    page.unmount();
    calls.list.mockRejectedValue(new Error('private-storage-canary'));
    renderPage(<Templates />);
    expect(
      await screen.findByText('Templates could not be loaded. Try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('private-storage-canary')).toBeNull();
  });
});
