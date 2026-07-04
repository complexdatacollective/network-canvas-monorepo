import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

const useAuthMock = vi.fn();
vi.mock('~/lib/auth/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import { LockScreen, LockScreenView } from '../LockScreen';
import { BiometricLockBody } from '../UnlockForms/BiometricLockBody';

const noop = vi.fn(async () => ({ ok: true }));
const revoke = vi.fn(async () => undefined);

// Every lock body now renders the shared ResetAppDataButton, which reads
// useAuth().revoke and useDialog(); wrap renders so both resolve.
function renderInProviders(ui: ReactElement) {
  return render(<DialogProvider>{ui}</DialogProvider>);
}

describe('LockScreenView', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ revoke });
  });

  it('renders the PIN unlock body for mode="pin"', () => {
    renderInProviders(
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

  it('renders the passphrase unlock body for mode="passphrase"', () => {
    renderInProviders(
      <LockScreenView
        mode="passphrase"
        unlockWithPin={noop}
        unlockWithPassphrase={noop}
        unlockWithBiometric={noop}
        unlockWithRecovery={noop}
      />,
    );
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('renders the biometric unlock body for mode="biometric"', () => {
    renderInProviders(
      <LockScreenView
        mode="biometric"
        unlockWithPin={noop}
        unlockWithPassphrase={noop}
        unlockWithBiometric={noop}
        unlockWithRecovery={noop}
      />,
    );
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('renders nothing for mode="none"', () => {
    const { container } = renderInProviders(
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
  revoke,
  unlockWithPin: vi.fn(async () => ({ ok: true })),
  unlockWithPassphrase: vi.fn(async () => ({ ok: true })),
  unlockWithBiometric: vi.fn(async () => ({ ok: true })),
  unlockWithRecovery: vi.fn(async () => ({ ok: true })),
};

afterEach(() => {
  useAuthMock.mockReset();
  revoke.mockClear().mockResolvedValue(undefined);
  base.unlockWithBiometric.mockClear().mockResolvedValue({ ok: true });
  base.unlockWithRecovery.mockClear().mockResolvedValue({ ok: true });
});

describe('LockScreen — biometric vault', () => {
  it('offers biometric unlock and a recovery-passphrase fallback', async () => {
    // Keep the auto-attempt from resolving to a lockable state so the dialog
    // stays put and we can exercise the explicit button + recovery flow.
    base.unlockWithBiometric.mockResolvedValue({ ok: false });
    useAuthMock.mockReturnValue({ ...base, mode: 'biometric' });
    renderInProviders(<LockScreen />);

    // The body auto-attempts biometric unlock once on mount; the explicit
    // button press is a further, second call.
    await waitFor(() =>
      expect(base.unlockWithBiometric).toHaveBeenCalledTimes(1),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /unlock with biometrics/i }),
    );
    expect(base.unlockWithBiometric).toHaveBeenCalledTimes(2);

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
    renderInProviders(<LockScreen />);
    expect(screen.getByText(/enter your pin/i)).toBeInTheDocument();
  });

  it('renders nothing when unlocked', () => {
    useAuthMock.mockReturnValue({ ...base, kind: 'unlocked', mode: 'pin' });
    const { container } = renderInProviders(<LockScreen />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BiometricLockBody — best-effort auto-unlock', () => {
  beforeEach(() => {
    // ResetAppDataButton reads useAuth().revoke; the body drives biometric
    // unlock purely through props, so a minimal auth stub suffices here.
    useAuthMock.mockReturnValue({ revoke });
  });

  it('auto-calls unlockWithBiometric exactly once on mount when available', async () => {
    const unlockWithBiometric = vi.fn(async () => ({ ok: false }));
    renderInProviders(
      <BiometricLockBody
        limited={false}
        unlockWithBiometric={unlockWithBiometric}
        unlockWithRecovery={noop}
      />,
    );

    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
    // A React re-render / StrictMode double-mount must not re-fire the prompt.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unlockWithBiometric).toHaveBeenCalledTimes(1);
  });

  it('keeps the "Unlock with biometrics" button as a fallback', async () => {
    const unlockWithBiometric = vi.fn(async () => ({ ok: false }));
    renderInProviders(
      <BiometricLockBody
        limited={false}
        unlockWithBiometric={unlockWithBiometric}
        unlockWithRecovery={noop}
      />,
    );

    const button = await screen.findByRole('button', {
      name: /unlock with biometrics/i,
    });
    expect(button).toBeInTheDocument();

    await userEvent.click(button);
    expect(unlockWithBiometric).toHaveBeenCalledTimes(2);
  });

  it('does NOT auto-call when limited (starts in recovery)', async () => {
    const unlockWithBiometric = vi.fn(async () => ({ ok: true }));
    renderInProviders(
      <BiometricLockBody
        limited
        unlockWithBiometric={unlockWithBiometric}
        unlockWithRecovery={noop}
      />,
    );

    // Let any mount effects flush, then assert no attempt was made.
    await screen.findByLabelText(/passphrase/i);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unlockWithBiometric).not.toHaveBeenCalled();
  });

  it('does NOT auto-call while in the recovery state', async () => {
    const unlockWithBiometric = vi.fn(async () => ({ ok: false }));
    renderInProviders(
      <BiometricLockBody
        limited={false}
        unlockWithBiometric={unlockWithBiometric}
        unlockWithRecovery={noop}
      />,
    );

    // One auto-attempt on the biometric state.
    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));

    // Toggle to recovery and back; neither transition may re-fire the prompt.
    await userEvent.click(
      screen.getByRole('button', { name: /use recovery passphrase/i }),
    );
    await screen.findByLabelText(/passphrase/i);
    await userEvent.click(
      screen.getByRole('button', { name: /back to biometrics/i }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(unlockWithBiometric).toHaveBeenCalledTimes(1);
  });
});
