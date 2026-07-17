import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AppUpdateIndicator from '../AppUpdateIndicator';

const renderAvailableUpdate = (onInstall: () => Promise<boolean>) => {
  render(
    <AppUpdateIndicator
      status="available"
      appName="Interviewer"
      label="Interviewer 8.0.0-beta.1"
      currentVersion="8.0.0-beta.1"
      availableVersion="8.0.0-beta.2"
      releaseNotes={{
        version: '8.0.0-beta.2',
        body: "## What's new\n\n- Faster protocol loading",
      }}
      onInstall={onInstall}
      unsavedWorkCaveat="Saved responses are kept."
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: /update is available/i }));
};

describe('AppUpdateIndicator', () => {
  it('describes the available versions and keeps changelog content out of the footer', () => {
    renderAvailableUpdate(vi.fn().mockResolvedValue(true));

    expect(
      screen.getByText(
        'You are currently using version 8.0.0-beta.1. This update will install version 8.0.0-beta.2.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Saved responses are kept.')).toBeInTheDocument();

    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).queryByText('Saved responses are kept.'),
    ).not.toBeInTheDocument();
    expect(
      within(footer).getByRole('button', { name: 'Install and reload' }),
    ).toBeEnabled();
    expect(
      within(footer).getByRole('button', { name: 'Cancel' }),
    ).toBeEnabled();
  });

  it('cancels an available update without installing it', () => {
    const onInstall = vi.fn().mockResolvedValue(true);
    renderAvailableUpdate(onInstall);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('renders release notes as a bounded surface with subordinate headings', () => {
    renderAvailableUpdate(vi.fn().mockResolvedValue(true));

    expect(
      screen.getByRole('heading', { level: 3, name: "What's new" }),
    ).toBeInTheDocument();

    const changelog = screen.getByRole('region', {
      name: 'Interviewer changelog',
    });
    expect(changelog.parentElement?.parentElement).toHaveClass(
      'bg-surface-1',
      'max-h-72',
    );
  });

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

  it('uses an explanatory description and primary close action after updating', () => {
    render(
      <AppUpdateIndicator
        status="updated"
        appName="Interviewer"
        label="Interviewer 8.0.0-beta.2"
        currentVersion="8.0.0-beta.2"
        releaseNotes={null}
        onInstall={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /was updated/i }));

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'App Recently Updated',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your app was recently updated. Find details of the changes below.',
      ),
    ).toBeInTheDocument();

    const closeButton = within(screen.getByRole('contentinfo')).getByRole(
      'button',
      { name: 'Close' },
    );
    expect(closeButton).toHaveClass(
      'bg-(--component-text)',
      '[--component-text:var(--primary)]',
    );
  });
});
