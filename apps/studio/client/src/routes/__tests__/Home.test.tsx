// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRouter } from '../../router.tsx';

const mocks = vi.hoisted(() => ({
  createProtocol: vi.fn(),
  listProtocols: vi.fn(),
  useListOrganizations: vi.fn(),
  useActiveOrganization: vi.fn(),
  useActiveMember: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock('../../lib/auth.ts', () => ({
  authClient: {
    getSession: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    useSession: vi.fn().mockReturnValue({
      data: {
        user: {
          name: 'Researcher',
          email: 'researcher@example.com',
        },
      },
      isPending: false,
    }),
    useListOrganizations: mocks.useListOrganizations,
    useActiveOrganization: mocks.useActiveOrganization,
    useActiveMember: mocks.useActiveMember,
    organization: { setActive: mocks.setActive },
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: vi.fn().mockResolvedValue({
          name: 'Network Canvas Studio',
          version: '0.1.0',
          deployment: { mode: 'managed', billing: false },
        }),
      }),
    },
    protocols: {
      list: {
        queryOptions: () => ({
          queryKey: ['protocols'],
          queryFn: mocks.listProtocols,
        }),
        key: () => ['protocols'],
      },
      create: {
        mutationOptions: (options: object) => ({
          mutationFn: mocks.createProtocol,
          ...options,
        }),
      },
      draft: {
        queryOptions: () => ({
          queryKey: ['draft'],
          queryFn: vi.fn(),
        }),
        key: () => ['draft'],
      },
    },
  },
  rpcClient: { protocols: {} },
}));

function renderHome() {
  // One client behind both the router's guards and the components: the
  // session guard reads what a component's `queryClient.clear()` removes.
  const queryClient = new QueryClient();
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ['/'] }),
    queryClient,
  );
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useListOrganizations.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  });
  mocks.useActiveOrganization.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
  });
  mocks.useActiveMember.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
  });
  mocks.listProtocols.mockResolvedValue([]);
});

describe('Home', () => {
  it('announces the server status through one persistent live region', async () => {
    renderHome();

    expect(
      await screen.findByRole('heading', { name: 'Network Canvas Studio' }),
    ).toBeInTheDocument();

    const region = screen.getByTestId('server-status');
    await screen.findByText(/version 0\.1\.0/);
    expect(region).toHaveTextContent(
      'Network Canvas Studio server, version 0.1.0.',
    );
    expect(region).toHaveAttribute('role', 'status');
  });

  it('explains the empty team state', async () => {
    renderHome();
    expect(
      await screen.findByText(/do not belong to a Studio team yet/i),
    ).toBeInTheDocument();
  });
});
