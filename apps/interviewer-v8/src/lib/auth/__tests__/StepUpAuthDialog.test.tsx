import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
vi.mock('../AuthContext', () => ({ useAuth: () => useAuthMock() }));

const verifyBiometricMock = vi.fn(async () => ({ ok: true }));
const verifyWithPinMock = vi.fn(async () => ({ ok: true }));
const verifyWithPassphraseMock = vi.fn(async () => ({ ok: true }));
const verifyWithRecoveryMock = vi.fn(async (_phrase: string) => ({
  ok: true,
}));
vi.mock('../api', () => ({
  verifyBiometric: () => verifyBiometricMock(),
  verifyWithPin: () => verifyWithPinMock(),
  verifyWithPassphrase: () => verifyWithPassphraseMock(),
  verifyWithRecovery: (phrase: string) => verifyWithRecoveryMock(phrase),
}));

const hasPasskeyWindowLimitationMock = vi.fn(() => false);
vi.mock('~/lib/pwa/passkeyWindowLimitation', () => ({
  hasPasskeyWindowLimitation: () => hasPasskeyWindowLimitationMock(),
}));

import StepUpAuthDialog from '../StepUpAuthDialog';

afterEach(() => {
  useAuthMock.mockReset();
  verifyBiometricMock.mockClear().mockResolvedValue({ ok: true });
  verifyWithRecoveryMock.mockClear().mockResolvedValue({ ok: true });
  hasPasskeyWindowLimitationMock.mockClear().mockReturnValue(false);
});

describe('StepUpAuthDialog', () => {
  it('biometric mode resolves via a fresh verifyBiometric (no gate change)', async () => {
    useAuthMock.mockReturnValue({ mode: 'biometric' });
    const onResolve = vi.fn();
    render(<StepUpAuthDialog open onResolve={onResolve} />);

    await userEvent.click(
      screen.getByRole('button', { name: /verify identity/i }),
    );
    await waitFor(() => expect(verifyBiometricMock).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenCalledWith({ ok: true });
  });

  it('renders nothing for mode none', () => {
    useAuthMock.mockReturnValue({ mode: 'none' });
    const { container } = render(<StepUpAuthDialog open onResolve={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('biometric mode offers a recovery-passphrase fallback that verifies without a gate change', async () => {
    useAuthMock.mockReturnValue({ mode: 'biometric' });
    const onResolve = vi.fn();
    render(<StepUpAuthDialog open onResolve={onResolve} />);

    await userEvent.click(
      screen.getByRole('button', { name: /use recovery passphrase/i }),
    );
    await userEvent.type(
      screen.getByLabelText(/passphrase/i),
      'Recovery-Phrase-7!',
    );
    await userEvent.click(screen.getByRole('button', { name: /^verify$/i }));

    await waitFor(() =>
      expect(verifyWithRecoveryMock).toHaveBeenCalledWith('Recovery-Phrase-7!'),
    );
    expect(onResolve).toHaveBeenCalledWith({ ok: true });
    expect(verifyBiometricMock).not.toHaveBeenCalled();
  });

  it('defaults biometric step-up to recovery in a limited PWA window (crbug.com/364926914)', async () => {
    hasPasskeyWindowLimitationMock.mockReturnValue(true);
    useAuthMock.mockReturnValue({ mode: 'biometric' });
    render(<StepUpAuthDialog open onResolve={vi.fn()} />);

    expect(
      screen.getByText(/isn't available in the installed app/i),
    ).toBeInTheDocument();
    // Biometrics stays reachable as an explicit escape hatch, not the default.
    expect(
      screen.getByRole('button', { name: /try biometrics anyway/i }),
    ).toBeInTheDocument();
  });
});
