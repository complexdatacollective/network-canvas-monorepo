import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
vi.mock('~/lib/auth/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import { LockScreen, LockScreenView } from '../LockScreen';

const noop = vi.fn(async () => ({ ok: true }));

describe('LockScreenView', () => {
  it('renders the PIN unlock body for mode="pin"', () => {
    render(
      <LockScreenView
        mode="pin"
        unlockWithPin={noop}
        unlockWithPassphrase={noop}
        unlockWithBiometric={noop}
        unlockWithRecovery={noop}
      />,
    );
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('renders nothing for mode="none"', () => {
    const { container } = render(
      <LockScreenView
        mode="none"
        unlockWithPin={noop}
        unlockWithPassphrase={noop}
        unlockWithBiometric={noop}
        unlockWithRecovery={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

const base = {
  kind: 'locked' as const,
  unlockWithPin: vi.fn(async () => ({ ok: true })),
  unlockWithPassphrase: vi.fn(async () => ({ ok: true })),
  unlockWithBiometric: vi.fn(async () => ({ ok: true })),
  unlockWithRecovery: vi.fn(async () => ({ ok: true })),
};

afterEach(() => {
  useAuthMock.mockReset();
  base.unlockWithBiometric.mockClear().mockResolvedValue({ ok: true });
  base.unlockWithRecovery.mockClear().mockResolvedValue({ ok: true });
});

describe('LockScreen — biometric vault', () => {
  it('offers biometric unlock and a recovery-passphrase fallback', async () => {
    useAuthMock.mockReturnValue({ ...base, mode: 'biometric' });
    render(<LockScreen />);

    await userEvent.click(
      screen.getByRole('button', { name: /unlock with biometrics/i }),
    );
    expect(base.unlockWithBiometric).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole('button', { name: /use recovery passphrase/i }),
    );
    await userEvent.type(
      screen.getByLabelText(/passphrase/i),
      'Tr0ub4dor&3-clever',
    );
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    await waitFor(() =>
      expect(base.unlockWithRecovery).toHaveBeenCalledWith(
        'Tr0ub4dor&3-clever',
      ),
    );
  });

  it('renders the PIN form for a pin vault', () => {
    useAuthMock.mockReturnValue({ ...base, mode: 'pin' });
    render(<LockScreen />);
    expect(screen.getByText(/enter your pin/i)).toBeInTheDocument();
  });

  it('renders nothing when unlocked', () => {
    useAuthMock.mockReturnValue({ ...base, kind: 'unlocked', mode: 'pin' });
    const { container } = render(<LockScreen />);
    expect(container).toBeEmptyDOMElement();
  });
});
