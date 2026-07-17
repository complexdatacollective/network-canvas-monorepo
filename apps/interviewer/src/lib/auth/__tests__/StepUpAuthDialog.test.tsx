import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
vi.mock('../AuthContext', () => ({ useAuth: () => useAuthMock() }));

const hasPasskeyWindowLimitationMock = vi.fn(() => false);
vi.mock('~/lib/pwa/passkeyWindowLimitation', () => ({
  hasPasskeyWindowLimitation: () => hasPasskeyWindowLimitationMock(),
}));

import StepUpAuthDialog, { StepUpAuthDialogView } from '../StepUpAuthDialog';

const verifyBiometric = vi.fn(async () => ({ ok: true }));
const verifyWithPin = vi.fn(async () => ({ ok: true }));
const verifyWithPassphrase = vi.fn(async () => ({ ok: true }));
const verifyWithRecovery = vi.fn(async () => ({ ok: true }));
const revoke = vi.fn(async () => undefined);

const authValue = {
  kind: 'unlocked' as const,
  mode: 'pin' as const,
  verifyBiometric,
  verifyWithPin,
  verifyWithPassphrase,
  verifyWithRecovery,
  revoke,
};

beforeEach(() => {
  useAuthMock.mockReturnValue(authValue);
  hasPasskeyWindowLimitationMock.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('StepUpAuthDialogView', () => {
  it('renders the authentication UI selected by context', () => {
    render(
      <StepUpAuthDialogView open onResolve={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('Confirm your identity')).toBeInTheDocument();
    expect(screen.getByText('Authenticate to continue.')).toBeInTheDocument();
    expect(screen.getByText('PIN')).toBeInTheDocument();
  });
});

describe('StepUpAuthDialog', () => {
  it('automatically resolves biometric mode via fresh verification without changing the gate', async () => {
    useAuthMock.mockReturnValue({
      ...authValue,
      mode: 'biometric',
    });
    const onResolve = vi.fn();
    render(<StepUpAuthDialog open onResolve={onResolve} />);

    await waitFor(() => expect(verifyBiometric).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenCalledWith({ ok: true });
  });

  it('renders nothing for mode none', () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'none' });
    const { container } = render(<StepUpAuthDialog open onResolve={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('verifies a biometric recovery passphrase without changing the gate', async () => {
    verifyBiometric.mockResolvedValueOnce({ ok: false });
    useAuthMock.mockReturnValue({
      ...authValue,
      mode: 'biometric',
    });
    const onResolve = vi.fn();
    const user = userEvent.setup();
    render(<StepUpAuthDialog open onResolve={onResolve} />);

    await waitFor(() => expect(verifyBiometric).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole('button', { name: 'Recover with passphrase' }),
    );
    await user.type(
      await screen.findByTestId('passphrase-input'),
      'Recovery-Phrase-7!',
    );
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() =>
      expect(verifyWithRecovery).toHaveBeenCalledWith('Recovery-Phrase-7!'),
    );
    expect(onResolve).toHaveBeenCalledWith({ ok: true });
  });

  it('starts with passphrase recovery in a limited PWA window', async () => {
    hasPasskeyWindowLimitationMock.mockReturnValue(true);
    useAuthMock.mockReturnValue({
      ...authValue,
      mode: 'biometric',
    });
    const user = userEvent.setup();
    render(<StepUpAuthDialog open onResolve={vi.fn()} />);

    expect(
      screen.getByText(/isn't available in this installed app/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Recover by resetting' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    expect(verifyBiometric).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.getByRole('button', { name: 'Unlock with biometrics' }),
    ).toBeInTheDocument();
  });

  it('resolves cancellation through the shared dialog callback', async () => {
    const onResolve = vi.fn();
    render(<StepUpAuthDialog open onResolve={onResolve} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onResolve).toHaveBeenCalledWith({
      ok: false,
      reason: 'cancelled',
    });
  });

  it('ignores a pending automatic biometric result after cancellation', async () => {
    let resolveBiometric: (result: { ok: boolean }) => void = () => {};
    verifyBiometric.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBiometric = resolve;
        }),
    );
    useAuthMock.mockReturnValue({
      ...authValue,
      mode: 'biometric',
    });
    const onResolve = vi.fn();
    const { rerender } = render(
      <StepUpAuthDialog open onResolve={onResolve} />,
    );

    await waitFor(() => expect(verifyBiometric).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    rerender(<StepUpAuthDialog open={false} onResolve={onResolve} />);
    await act(async () => {
      resolveBiometric({ ok: true });
    });

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({
      ok: false,
      reason: 'cancelled',
    });
  });
});
