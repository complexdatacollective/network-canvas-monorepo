import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

const useAuthMock = vi.fn();
vi.mock('~/lib/auth/AuthContext', () => ({ useAuth: () => useAuthMock() }));
vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => ({
    getAuthorizedInterviewId: () => null,
  }),
}));

import { LockScreen } from '../LockScreen';

const revoke = vi.fn(async () => undefined);

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
});

function renderLockScreen() {
  return render(
    <DialogProvider>
      <LockScreen />
    </DialogProvider>,
  );
}

describe('LockScreen — reset app data escape hatch', () => {
  it('offers a "Recover by resetting" control in the PIN body', () => {
    useAuthMock.mockReturnValue({ ...base, mode: 'pin' });
    renderLockScreen();

    expect(
      screen.getByRole('button', { name: /recover by resetting/i }),
    ).toBeInTheDocument();
  });

  it('opens the destructive confirm and wipes via revoke() only after confirming', async () => {
    useAuthMock.mockReturnValue({ ...base, mode: 'pin' });
    const user = userEvent.setup();
    renderLockScreen();

    await user.click(
      screen.getByRole('button', { name: /recover by resetting/i }),
    );

    expect(
      await screen.findByText(/reset all app data\?/i),
    ).toBeInTheDocument();
    // Nothing destroyed until the destructive confirm is pressed.
    expect(revoke).not.toHaveBeenCalled();

    await user.click(
      await screen.findByRole('button', { name: /permanently delete/i }),
    );

    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
  });
});
