// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Home from '../Home.tsx';

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    status: {
      queryOptions: () => ({
        queryKey: ['status'],
        queryFn: vi.fn().mockResolvedValue({
          name: 'Network Canvas Studio',
          version: '0.1.0',
        }),
      }),
    },
  },
}));

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>,
  );
}

describe('Home', () => {
  it('announces the server status through one persistent live region', async () => {
    renderHome();

    expect(
      screen.getByRole('heading', { name: 'Network Canvas Studio' }),
    ).toBeInTheDocument();

    // The live region exists from first render (announcing the pending
    // check), and the pending→success transition swaps its content.
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Checking the server connection');

    await screen.findByText(/version 0\.1\.0/);
    expect(region).toHaveTextContent(
      'Network Canvas Studio server, version 0.1.0.',
    );
    expect(screen.getByTestId('server-status')).toBe(region);
  });
});
