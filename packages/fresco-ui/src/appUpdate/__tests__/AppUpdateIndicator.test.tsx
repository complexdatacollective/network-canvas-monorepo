import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AppUpdateIndicator from '../AppUpdateIndicator';

const renderAvailableUpdate = (onInstall: () => Promise<boolean>) => {
  render(
    <AppUpdateIndicator
      status="available"
      appName="Interviewer"
      label="Interviewer 8.0.0-beta.1"
      currentVersion="8.0.0-beta.1"
      releaseNotes={null}
      onInstall={onInstall}
      unsavedWorkCaveat="Saved responses are kept."
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: /update is available/i }));
};

describe('AppUpdateIndicator', () => {
  it('shows progress while the update activates', async () => {
    const onInstall = vi.fn(() => new Promise<boolean>(() => {}));
    renderAvailableUpdate(onInstall);

    fireEvent.click(screen.getByRole('button', { name: 'Install and reload' }));

    expect(screen.getByRole('button', { name: 'Installing…' })).toBeDisabled();
    expect(screen.getByText('Installing the update…')).toBeInTheDocument();
    await waitFor(() => expect(onInstall).toHaveBeenCalledOnce());
  });

  it('offers a retry when activation fails', async () => {
    const onInstall = vi.fn().mockResolvedValue(false);
    renderAvailableUpdate(onInstall);

    fireEvent.click(screen.getByRole('button', { name: 'Install and reload' }));

    expect(
      await screen.findByText(/update could not be applied/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});
