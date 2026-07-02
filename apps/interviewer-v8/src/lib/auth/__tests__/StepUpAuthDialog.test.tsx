import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
vi.mock('../AuthContext', () => ({ useAuth: () => useAuthMock() }));

const verifyBiometricMock = vi.fn(async () => ({ ok: true }));
const verifyWithPinMock = vi.fn(async () => ({ ok: true }));
const verifyWithPassphraseMock = vi.fn(async () => ({ ok: true }));
vi.mock('../api', () => ({
  verifyBiometric: () => verifyBiometricMock(),
  verifyWithPin: () => verifyWithPinMock(),
  verifyWithPassphrase: () => verifyWithPassphraseMock(),
}));

import StepUpAuthDialog from '../StepUpAuthDialog';

afterEach(() => {
  useAuthMock.mockReset();
  verifyBiometricMock.mockClear().mockResolvedValue({ ok: true });
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
});
