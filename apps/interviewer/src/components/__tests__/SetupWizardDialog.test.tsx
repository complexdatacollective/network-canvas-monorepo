import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockEnrolWithoutLock,
  mockOpenDialog,
  mockRefresh,
  mockRevoke,
  mockSetAnalyticsEnabled,
  mockStatus,
  mockToastAdd,
  mockUpdateSettings,
} = vi.hoisted(() => ({
  mockEnrolWithoutLock: vi.fn(),
  mockOpenDialog: vi.fn(),
  mockRefresh: vi.fn(),
  mockRevoke: vi.fn(),
  mockSetAnalyticsEnabled: vi.fn(),
  mockStatus: vi.fn(),
  mockToastAdd: vi.fn(),
  mockUpdateSettings: vi.fn(),
}));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: mockOpenDialog }),
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: mockToastAdd }),
}));

vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({
    enabled: false,
    setEnabled: mockSetAnalyticsEnabled,
  }),
}));

vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => ({ refresh: mockRefresh }),
}));

vi.mock('~/lib/auth/api', () => ({
  enrolWithoutLock: mockEnrolWithoutLock,
  revoke: mockRevoke,
  status: mockStatus,
}));

vi.mock('~/lib/db/api', () => ({
  updateSettings: mockUpdateSettings,
}));

import { useSetupWizard } from '../SetupWizardDialog';

function SetupLauncher() {
  const { openSetupWizard } = useSetupWizard({ preserveExistingData: true });
  return (
    <button type="button" onClick={() => void openSetupWizard()}>
      Launch setup
    </button>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('settings-launched setup wizard', () => {
  it('keeps a newly configured lock when the wizard is dismissed', async () => {
    mockOpenDialog.mockResolvedValue(null);
    mockStatus.mockResolvedValue({
      configured: true,
      locked: false,
      mode: 'pin',
    });

    render(<SetupLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockEnrolWithoutLock).not.toHaveBeenCalled();
    expect(mockOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelLabel: 'Exit setup',
        confirmCancel: expect.objectContaining({
          primaryLabel: 'Exit setup',
        }),
      }),
    );
  });

  it('continues without a lock when dismissed before enrolment', async () => {
    mockOpenDialog.mockResolvedValue(null);
    mockStatus.mockResolvedValue({
      configured: false,
      locked: false,
    });
    mockEnrolWithoutLock.mockResolvedValue({ ok: true });

    render(<SetupLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockEnrolWithoutLock).toHaveBeenCalledOnce();
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('preserves an existing analytics opt-out when the toggle is untouched', async () => {
    mockOpenDialog.mockResolvedValue({
      selectedMethod: 'pin',
      enrolmentCommitted: true,
    });

    render(<SetupLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockSetAnalyticsEnabled).toHaveBeenCalledWith(false);
  });

  it('refreshes auth when a post-enrolment settings write fails', async () => {
    mockOpenDialog.mockResolvedValue({
      selectedMethod: 'pin',
      enrolmentCommitted: true,
    });
    mockUpdateSettings.mockRejectedValue(new Error('settings unavailable'));

    render(<SetupLauncher />);
    await userEvent.click(screen.getByRole('button', { name: 'Launch setup' }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledOnce());
    expect(mockToastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Setup could not be completed',
        description: 'settings unavailable',
      }),
    );
  });
});
