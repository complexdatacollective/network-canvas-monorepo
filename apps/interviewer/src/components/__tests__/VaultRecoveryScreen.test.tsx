import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

const revokeMock = vi.fn();
vi.mock('~/lib/auth/AuthContext', () => ({
  useAuth: () => ({ revoke: revokeMock }),
}));
vi.mock('@codaco/art', () => ({ BackgroundLights: () => null }));

import { VaultRecoveryScreen } from '../VaultRecoveryScreen';

function renderScreen() {
  return render(
    <DialogProvider>
      <VaultRecoveryScreen />
    </DialogProvider>,
  );
}

beforeEach(() => {
  revokeMock.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('VaultRecoveryScreen', () => {
  it('offers reload + reset, and reset is gated behind an explicit confirm', async () => {
    const user = userEvent.setup();
    renderScreen();

    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /reset all app data/i }),
    );

    expect(
      await screen.findByText(/reset all app data\?/i),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      screen.queryByRole('heading', {
        name: /can't read this device's security settings/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /permanently delete/i }),
    ).toBeInTheDocument();
    // Nothing is destroyed until the destructive confirm.
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('wipes via revoke() only on confirmed delete', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(
      screen.getByRole('button', { name: /reset all app data/i }),
    );
    await user.click(
      await screen.findByRole('button', { name: /permanently delete/i }),
    );

    await waitFor(() => expect(revokeMock).toHaveBeenCalledTimes(1));
  });

  it('surfaces an error in the confirm if revoke() fails', async () => {
    revokeMock.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    renderScreen();

    await user.click(
      screen.getByRole('button', { name: /reset all app data/i }),
    );
    await user.click(
      await screen.findByRole('button', { name: /permanently delete/i }),
    );

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
    // Confirm stays open and the destructive action is usable again.
    expect(
      screen.getByRole('button', { name: /permanently delete/i }),
    ).toBeEnabled();
  });
});
