import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEstimateStorage, mockIsPersisted } = vi.hoisted(() => ({
  mockEstimateStorage: vi.fn(),
  mockIsPersisted: vi.fn(),
}));

vi.mock('~/lib/storage', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/storage')>('~/lib/storage');
  return {
    ...actual,
    estimateStorage: mockEstimateStorage,
    isStoragePersisted: mockIsPersisted,
  };
});

vi.mock('wouter', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const useAuthMock = vi.fn(() => ({ kind: 'unlocked', mode: 'pin' }));
vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

import { StatusRow } from '../StatusRow';

afterEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ kind: 'unlocked', mode: 'pin' });
});

describe('StatusRow', () => {
  it('shows protocol and interview counts', () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
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
      percent: 1,
    });
    mockIsPersisted.mockResolvedValue(true);
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage persistent/i)).toBeInTheDocument(),
    );
  });

  it('warns when storage is not persisted', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
      percent: 0,
    });
    mockIsPersisted.mockResolvedValue(false);
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage not persistent/i)).toBeInTheDocument(),
    );
  });

  it('reports encrypted storage for a secured vault mode', async () => {
    mockEstimateStorage.mockResolvedValue({ usage: 0, quota: 0, percent: 0 });
    mockIsPersisted.mockResolvedValue(true);
    useAuthMock.mockReturnValue({ kind: 'unlocked', mode: 'biometric' });
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    expect(screen.getByText('Encrypted')).toBeInTheDocument();
    expect(screen.queryByText(/not encrypted/i)).not.toBeInTheDocument();
  });

  // Regression: with no security enrolled, the footer previously showed a
  // shield reading "Storage protected" (which only meant eviction
  // durability) — a false encryption claim. It must state the truth.
  it('warns "Not encrypted" for mode none and never claims protection', async () => {
    mockEstimateStorage.mockResolvedValue({ usage: 0, quota: 0, percent: 0 });
    mockIsPersisted.mockResolvedValue(true);
    useAuthMock.mockReturnValue({ kind: 'unlocked', mode: 'none' });
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    expect(screen.getByText('Not encrypted')).toBeInTheDocument();
    expect(screen.queryByText('Encrypted')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/storage persistent/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/protected/i)).not.toBeInTheDocument();
  });

  it('re-checks persistence when the tab regains focus', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
      percent: 0,
    });
    mockIsPersisted.mockResolvedValue(false);
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage not persistent/i)).toBeInTheDocument(),
    );

    // A late-landing requestPersistentStorage() grant is reflected once the
    // tab regains focus, without remounting the component.
    mockIsPersisted.mockResolvedValue(true);
    window.dispatchEvent(new Event('focus'));

    await waitFor(() =>
      expect(screen.getByText(/storage persistent/i)).toBeInTheDocument(),
    );
  });
});
