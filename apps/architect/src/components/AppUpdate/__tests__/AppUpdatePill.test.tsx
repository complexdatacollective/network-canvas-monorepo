import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { install } = vi.hoisted(() => ({
  install: vi.fn().mockResolvedValue(true),
}));

vi.mock('../AppUpdateProvider', () => ({
  useAppUpdateContext: () => ({
    status: 'available' as const,
    availableVersion: '8.2.1',
    releaseNotes: null,
    install,
  }),
}));

import AppUpdatePill from '../AppUpdatePill';

describe('AppUpdatePill', () => {
  it('explains that installing leaves other Architect tabs running', () => {
    render(<AppUpdatePill />);

    fireEvent.click(
      screen.getByRole('button', { name: /update is available/i }),
    );

    expect(
      screen.getByText(
        'Installing the update will reload only this tab. Other open Architect tabs will keep running until they are reloaded.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/reload.*any other open Architect tabs/i),
    ).toBeNull();
  });
});
