// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { rpcClient } from '../../lib/api.ts';
import { createAppRouter } from '../../router.tsx';

const STAGE_A = '11111111-1111-4111-8111-111111111111';
const STAGE_B = '22222222-2222-4222-8222-222222222222';
const DRAFT = {
  protocol: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    draftId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Shell proof',
    createdAt: new Date('2026-08-28T00:00:00Z'),
    updatedAt: new Date('2026-08-28T00:00:00Z'),
  },
  revision: { sequence: '2', hash: 'revision-2' },
  sections: {
    settings: { name: 'Shell proof', schemaVersion: 8 },
    stageOrder: { stages: [STAGE_A, STAGE_B] },
    [`stage:${STAGE_A}`]: {
      id: STAGE_A,
      type: 'Information',
      label: 'Welcome',
      title: 'Welcome',
      items: [],
    },
    [`stage:${STAGE_B}`]: {
      id: STAGE_B,
      type: 'Information',
      label: 'Follow-up',
      title: 'Follow-up',
      items: [],
    },
    assets: {},
  },
};

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn().mockReturnValue({
      data: { user: { name: 'Researcher', email: 'r@example.com' } },
      isPending: false,
    }),
    useListOrganizations: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    status: { queryOptions: vi.fn() },
    protocols: {
      list: {
        queryOptions: vi.fn(),
        key: () => ['protocols'],
      },
      create: { mutationOptions: vi.fn() },
      draft: {
        queryOptions: () => ({
          queryKey: ['draft'],
          queryFn: () => Promise.resolve(DRAFT),
        }),
        key: () => ['draft'],
      },
    },
  },
  rpcClient: {
    protocols: {
      acquireSection: vi
        .fn()
        .mockResolvedValue({ mode: 'editable', leaseEpoch: '1' }),
      renewSection: vi.fn().mockResolvedValue({ renewed: true }),
      releaseSection: vi.fn().mockResolvedValue(undefined),
      commitSection: vi
        .fn()
        .mockResolvedValue({ sequence: '3', hash: 'revision-3' }),
      addInformationStage: vi
        .fn()
        .mockResolvedValue({ sequence: '3', hash: 'r3' }),
      moveStage: vi.fn().mockResolvedValue({ sequence: '3', hash: 'r3' }),
    },
  },
}));

function renderEditor() {
  const router = createAppRouter(
    createMemoryHistory({
      initialEntries: [
        `/teams/team-a/protocols/${DRAFT.protocol.id}/drafts/${DRAFT.protocol.draftId}`,
      ],
    }),
  );
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('Studio editor shell', () => {
  it('provides the outline, editing canvas, inspector, and keyboard reorder actions', async () => {
    renderEditor();

    expect(
      await screen.findByRole('heading', { name: 'Protocol outline' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Protocol sections' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(
      screen.getByRole('heading', { name: 'Inspector' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move Follow-up up' }));
    await waitFor(() =>
      expect(rpcClient.protocols.moveStage).toHaveBeenCalledWith(
        expect.objectContaining({ stageId: STAGE_B, toIndex: 0 }),
      ),
    );
  });

  it('sends a coalesced screen-name command through the leased session', async () => {
    renderEditor();
    const input = await screen.findByRole('textbox', { name: 'Screen name' });
    fireEvent.change(input, { target: { value: 'Welcome screen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save screen' }));

    await waitFor(() =>
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: `stage:${STAGE_A}`,
          commands: [{ op: 'set', key: 'label', value: 'Welcome screen' }],
        }),
      ),
    );
  });

  it('keeps non-screen outline sections selectable', async () => {
    renderEditor();
    await screen.findByRole('heading', { name: 'Welcome' });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(
      await screen.findByRole('heading', { name: 'Protocol settings' }),
    ).toBeInTheDocument();

    const validationButton = await screen.findByRole('button', {
      name: /protocol valid|validation problems?/i,
    });
    fireEvent.click(validationButton);
    expect(document.getElementById('protocol-problems')).toHaveFocus();
  });

  it('disables editing when another session holds the screen lease', async () => {
    vi.mocked(rpcClient.protocols.acquireSection).mockResolvedValueOnce({
      mode: 'readOnly',
    });
    renderEditor();

    expect(
      await screen.findByText(/read-only while another editor holds its lock/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Screen name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save screen' })).toBeDisabled();
  });
});
