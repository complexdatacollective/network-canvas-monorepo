import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEstimateStorage, mockIsPersisted } = vi.hoisted(() => ({
  mockEstimateStorage: vi.fn(),
  mockIsPersisted: vi.fn(),
}));

vi.mock('~/lib/platform/storage', async () => {
  const actual = await vi.importActual<typeof import('~/lib/platform/storage')>(
    '~/lib/platform/storage',
  );
  return {
    ...actual,
    estimateStorage: mockEstimateStorage,
    isStoragePersisted: mockIsPersisted,
  };
});

vi.mock('wouter', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { StatusRow } from '../StatusRow';

afterEach(() => {
  vi.clearAllMocks();
});

describe('StatusRow', () => {
  it('shows protocol and interview counts', () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
      free: 0,
      percent: 0,
    });
    mockIsPersisted.mockResolvedValue(true);
    render(<StatusRow protocolCount={3} interviewCount={7} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('surfaces persisted-storage durability once resolved', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 1024 * 1024,
      quota: 100 * 1024 * 1024,
      free: 99 * 1024 * 1024,
      percent: 1,
    });
    mockIsPersisted.mockResolvedValue(true);
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage protected/i)).toBeInTheDocument(),
    );
  });

  it('warns when storage is not persisted', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
      free: 0,
      percent: 0,
    });
    mockIsPersisted.mockResolvedValue(false);
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage not protected/i)).toBeInTheDocument(),
    );
  });
});
