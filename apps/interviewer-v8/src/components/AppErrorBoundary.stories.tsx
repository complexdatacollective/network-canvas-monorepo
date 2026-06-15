import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

import { AppErrorBoundary } from './AppErrorBoundary';

// Renders the boundary's fallback for real (blob backdrop + fresco-ui Dialog)
// by throwing during render — the jsdom unit test stubs the Dialog out, so
// this story is what exercises the actual error UI.
function Thrower(): never {
  throw new Error('Storybook: deliberate render error');
}

const meta: Meta<typeof AppErrorBoundary> = {
  title: 'Components/AppErrorBoundary',
  component: AppErrorBoundary,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AppErrorBoundary>;

export const ErrorFallback: Story = {
  render: () => (
    <AppErrorBoundary>
      <Thrower />
    </AppErrorBoundary>
  ),
  play: async ({ canvasElement }) => {
    // The dialog portals to document.body, outside the story canvas.
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(
        within(dialog).getByText('Something went wrong'),
      ).toBeInTheDocument(),
    );
    await expect(
      within(dialog).getByRole('button', { name: 'Reload' }),
    ).toBeInTheDocument();
    // dismissible={false} — no close button.
    await expect(
      within(dialog).queryByRole('button', { name: /close/i }),
    ).not.toBeInTheDocument();
  },
};
