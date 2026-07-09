import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  Link: ({
    children,
    className,
    href,
  }: {
    children: React.ReactNode;
    className?: string;
    href: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const useAuthMock = vi.fn(() => ({ kind: 'unlocked', mode: 'pin' }));
vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

const { mockIsRunningInstalled } = vi.hoisted(() => ({
  mockIsRunningInstalled: vi.fn(() => false),
}));
vi.mock('~/lib/pwa/isRunningInstalled', () => ({
  isRunningInstalled: mockIsRunningInstalled,
}));

// The version slot renders AppUpdatePill, which reads the app-wide
// AppUpdateProvider context (service-worker registration + update state) that
// isn't mounted in these unit tests. Stub it out — the update indicator has its
// own coverage in @codaco/fresco-ui; these tests exercise StatusRow's
// storage/encryption display.
vi.mock('../AppUpdate/AppUpdatePill', () => ({
  default: () => <span>Interviewer test</span>,
}));

import { STORAGE_PERSISTED_EVENT } from '~/lib/storage';

import { StatusRow, StatusRowView } from '../StatusRow';

afterEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ kind: 'unlocked', mode: 'pin' });
  mockIsRunningInstalled.mockReturnValue(false);
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

  it('hides count and status text below tablet landscape', async () => {
    mockEstimateStorage.mockResolvedValue({
      usage: 0,
      quota: 0,
      percent: 0,
    });
    mockIsPersisted.mockResolvedValue(true);
    render(<StatusRow protocolCount={3} interviewCount={7} />);

    expect(screen.getByRole('link')).toHaveClass(
      'hidden',
      'tablet-landscape:inline-flex',
    );
    expect(screen.getByText('Encrypted')).toHaveClass(
      'sr-only',
      'tablet-landscape:not-sr-only',
    );
    await waitFor(() =>
      expect(screen.getByText(/storage persistent/i)).toHaveClass(
        'sr-only',
        'tablet-landscape:not-sr-only',
      ),
    );
  });

  it('includes compact status labels in tooltip text', async () => {
    const user = userEvent.setup();
    render(
      <StatusRowView
        protocolCount={0}
        interviewCount={0}
        mode="pin"
        durability={{ persisted: true, usage: null }}
        installed={false}
      />,
    );

    const encryptedTrigger = screen.getByText('Encrypted').parentElement;
    const storageTrigger = screen.getByText('Storage persistent').parentElement;
    if (!encryptedTrigger || !storageTrigger) {
      throw new Error('Expected tooltip triggers to render');
    }

    await user.hover(encryptedTrigger);
    await waitFor(() =>
      expect(screen.getByText(/^Encrypted\./)).toBeInTheDocument(),
    );

    await user.hover(storageTrigger);
    await waitFor(() =>
      expect(screen.getByText(/^Storage persistent\./)).toBeInTheDocument(),
    );
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

  it('re-reads persistence when the security mode changes (encryption enabled)', async () => {
    mockEstimateStorage.mockResolvedValue({ usage: 0, quota: 0, percent: 0 });
    mockIsPersisted.mockResolvedValue(false);
    useAuthMock.mockReturnValue({ kind: 'unlocked', mode: 'none' });

    const { rerender } = render(
      <StatusRow protocolCount={0} interviewCount={0} />,
    );
    await waitFor(() =>
      expect(screen.getByText(/storage not persistent/i)).toBeInTheDocument(),
    );

    // Enrolling a secured vault requests persistence in the enrol path; that
    // grant lands with no focus/visibility change, so the mode change is what
    // must trigger the durability re-read (no reload needed).
    mockIsPersisted.mockResolvedValue(true);
    useAuthMock.mockReturnValue({ kind: 'unlocked', mode: 'pin' });
    rerender(<StatusRow protocolCount={0} interviewCount={0} />);

    await waitFor(() =>
      expect(screen.getByText(/storage persistent/i)).toBeInTheDocument(),
    );
  });

  it('re-checks persistence when the app is installed', async () => {
    mockEstimateStorage.mockResolvedValue({ usage: 0, quota: 0, percent: 0 });
    mockIsPersisted.mockResolvedValue(false);
    useAuthMock.mockReturnValue({ kind: 'unlocked', mode: 'none' });

    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage not persistent/i)).toBeInTheDocument(),
    );

    // main.tsx requests persistence on appinstalled; StatusRow reflects the new
    // grant when the event fires, without waiting for a reload.
    mockIsPersisted.mockResolvedValue(true);
    window.dispatchEvent(new Event('appinstalled'));

    await waitFor(() =>
      expect(screen.getByText(/storage persistent/i)).toBeInTheDocument(),
    );
  });

  // An installed app's data is partitioned away from browsing data and exempt
  // from routine cleanup, and there is no further user action that could flip
  // the grant — so the alarming warning is replaced by a calm best-effort
  // state (#886).
  it('shows a calm best-effort state instead of the warning when installed', async () => {
    mockEstimateStorage.mockResolvedValue({ usage: 0, quota: 0, percent: 0 });
    mockIsPersisted.mockResolvedValue(false);
    mockIsRunningInstalled.mockReturnValue(true);
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage best effort/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/storage not persistent/i),
    ).not.toBeInTheDocument();
  });

  it('re-reads persistence when a late grant announces itself', async () => {
    mockEstimateStorage.mockResolvedValue({ usage: 0, quota: 0, percent: 0 });
    mockIsPersisted.mockResolvedValue(false);
    render(<StatusRow protocolCount={0} interviewCount={0} />);
    await waitFor(() =>
      expect(screen.getByText(/storage not persistent/i)).toBeInTheDocument(),
    );

    // requestPersistentStorage() dispatches this event on a fresh grant (e.g.
    // the first-interaction retry succeeding) with no focus/visibility change.
    mockIsPersisted.mockResolvedValue(true);
    window.dispatchEvent(new Event(STORAGE_PERSISTED_EVENT));

    await waitFor(() =>
      expect(screen.getByText(/storage persistent/i)).toBeInTheDocument(),
    );
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
