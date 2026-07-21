import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setNextEnabledMock = vi.fn<(v: boolean) => void>();
const setBeforeNextMock =
  vi.fn<(fn: (() => Promise<boolean>) | null) => void>();
const setStepDataMock = vi.fn<(patch: Record<string, unknown>) => void>();

let wizardData: Record<string, unknown> = {};
vi.mock('@codaco/fresco-ui/dialogs/useWizard', () => ({
  useWizard: () => ({
    setNextEnabled: setNextEnabledMock,
    setBeforeNext: setBeforeNextMock,
    setStepData: setStepDataMock,
    data: wizardData,
  }),
}));

type AuthStatusResult = {
  configured: boolean;
  locked: boolean;
  mode?: 'pin' | 'passphrase' | 'biometric' | 'none';
};

const statusMock = vi.fn<() => Promise<AuthStatusResult>>(async () => ({
  configured: false,
  locked: false,
}));
vi.mock('~/lib/auth/api', () => ({
  status: () => statusMock(),
  revoke: async () => {},
  enrolWithPin: async () => ({ ok: true }),
  enrolWithPassphrase: async () => ({ ok: true }),
  enrolWithBiometric: async () => ({ ok: true }),
}));

// Child configure components pull in heavy fresco-ui form fields; stub them so
// this test isolates the ReadOnlySummary reconciliation branch.
vi.mock('../Step3BiometricConfigure', () => ({
  default: () => <div data-testid="biometric-configure" />,
}));
vi.mock('../Step3PinConfigure', () => ({
  default: () => <div data-testid="pin-configure" />,
}));
vi.mock('../Step3PassphraseConfigure', () => ({
  default: () => <div data-testid="passphrase-configure" />,
}));

import Step3Configure from '../Step3Configure';

afterEach(() => {
  setNextEnabledMock.mockReset();
  setBeforeNextMock.mockReset();
  setStepDataMock.mockReset();
  statusMock
    .mockReset()
    .mockResolvedValue({ configured: false, locked: false });
  wizardData = {};
});

describe('Step3Configure — read-only summary reconciliation', () => {
  it('shows the configured summary when the vault holds the committed mode', async () => {
    wizardData = { selectedMethod: 'biometric', enrolmentCommitted: true };
    statusMock.mockResolvedValue({
      configured: true,
      locked: false,
      mode: 'biometric',
    });

    render(<Step3Configure />);

    expect(
      await screen.findByText('Biometric configured.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(setNextEnabledMock).toHaveBeenLastCalledWith(true),
    );
  });

  it('does not offer to replace a committed method while preserving stored data', async () => {
    wizardData = { selectedMethod: 'pin', enrolmentCommitted: true };
    statusMock.mockResolvedValue({
      configured: true,
      locked: false,
      mode: 'pin',
    });

    render(<Step3Configure allowChange={false} />);

    expect(await screen.findByText('PIN configured.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Change' }),
    ).not.toBeInTheDocument();
  });

  it('drops back into the configure form when a committed enrolment no longer matches the vault', async () => {
    // A same-method biometric "Change" revoked the old vault, then the user
    // cancelled the OS sheet: enrolmentCommitted is still true but the vault is
    // now unconfigured. Finish must not complete claiming a mode the vault lacks.
    wizardData = { selectedMethod: 'biometric', enrolmentCommitted: true };
    statusMock.mockResolvedValue({ configured: false, locked: false });

    render(<Step3Configure />);

    // Never presents the phantom "configured" summary...
    await waitFor(() =>
      expect(setStepDataMock).toHaveBeenCalledWith({
        enrolmentCommitted: false,
      }),
    );
    expect(screen.queryByText('Biometric configured.')).not.toBeInTheDocument();
    // ...and forces re-enrolment (Next must not proceed without re-enrolling).
    expect(setNextEnabledMock).not.toHaveBeenCalledWith(true);
  });

  it('recovers instead of stranding when the vault status check rejects', async () => {
    // A rejected status() must not leave the wizard stuck on the summary with
    // Next permanently disabled — fail safe by forcing re-enrolment.
    wizardData = { selectedMethod: 'pin', enrolmentCommitted: true };
    statusMock.mockRejectedValue(new Error('vault unreadable'));

    render(<Step3Configure />);

    await waitFor(() =>
      expect(setStepDataMock).toHaveBeenCalledWith({
        enrolmentCommitted: false,
      }),
    );
    expect(screen.queryByText('PIN configured.')).not.toBeInTheDocument();
    expect(setNextEnabledMock).not.toHaveBeenCalledWith(true);
  });
});
