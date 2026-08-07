// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Home from '../Home.tsx';

vi.mock('../../lib/api.ts', () => ({
  fetchStatus: vi
    .fn()
    .mockResolvedValue({ name: 'Network Canvas Studio', version: '0.1.0' }),
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
  it('shows the server status once loaded', async () => {
    renderHome();

    expect(
      screen.getByRole('heading', { name: 'Network Canvas Studio' }),
    ).toBeInTheDocument();

    expect(await screen.findByTestId('server-status')).toHaveTextContent(
      'Network Canvas Studio server, version 0.1.0.',
    );
  });
});
