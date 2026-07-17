import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, within } from 'storybook/test';

import AppUpdateIndicator from './AppUpdateIndicator';

const NOTES = {
  version: '8.0.0-beta.4',
  body: `## What's new

- A brighter sociogram
- Faster protocol loading
- Clearer validation messages

## Improvements

- More responsive stage editing
- Better keyboard navigation
- Improved color contrast
- Smoother drag and drop

## Fixes

- Restored missing protocol thumbnails
- Prevented duplicate stage names
- Preserved unsaved form values
- Corrected release-note links
`,
};

const meta = {
  title: 'Components/AppUpdateIndicator',
  component: AppUpdateIndicator,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    appName: 'Architect',
    label: 'v8.0.0-beta.3',
    currentVersion: '8.0.0-beta.3',
    onInstall: fn(async () => true),
    releaseNotes: NOTES,
    size: 'md',
  },
} satisfies Meta<typeof AppUpdateIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { status: 'idle' },
};

export const Available: Story = {
  args: {
    status: 'available',
    availableVersion: '8.0.0-beta.4',
    unsavedWorkCaveat:
      'Reloading updates this tab and any other open Architect tabs; unsaved changes in progress will be lost.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /update is available/i }),
    );
    await screen.findByRole('dialog');
    await expect(
      await screen.findByText(/A brighter sociogram/i),
    ).toBeInTheDocument();
    const install = await screen.findByRole('button', {
      name: 'Install and reload',
    });
    await expect(install).toBeEnabled();
    await expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  },
};

export const Updated: Story = {
  args: { status: 'updated' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /was updated/i }));
    await screen.findByRole('dialog', { name: 'App Recently Updated' });
    await expect(
      await screen.findByText(/Faster protocol loading/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Install and reload' }),
    ).toBeNull();
  },
};
