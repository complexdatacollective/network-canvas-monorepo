import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor } from 'storybook/test';

import NodeContextMenu from './NodeContextMenu';

const meta: Meta<typeof NodeContextMenu> = {
  title: 'Components/NodeContextMenu',
  component: NodeContextMenu,
  args: {
    isEgo: false,
    isFinalized: false,
    canAddSibling: true,
    onAction: () => {},
    children: (
      <button type="button" data-testid="node">
        Node
      </button>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof NodeContextMenu>;

async function openMenu() {
  await userEvent.click(await screen.findByTestId('node'));
}

export const Editable: Story = {
  play: async () => {
    await openMenu();
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Add parent' })).toBeTruthy(),
    );
    for (const name of [
      'Add child',
      'Add partner',
      'Add sibling',
      'Edit name',
      'Delete',
    ]) {
      expect(screen.getByRole('menuitem', { name })).toBeTruthy();
    }
  },
};

export const Finalized: Story = {
  args: { isFinalized: true },
  play: async () => {
    await openMenu();
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Edit name' })).toBeTruthy(),
    );
    for (const name of [
      'Add parent',
      'Add child',
      'Add partner',
      'Add sibling',
      'Delete',
    ]) {
      expect(screen.queryByRole('menuitem', { name })).toBeNull();
    }
  },
};

export const FinalizedEgo: Story = {
  args: { isFinalized: true, isEgo: true },
  play: async () => {
    await openMenu();
    // The ego has no editable name, so finalizing leaves no actions and the
    // node renders without a menu.
    expect(screen.queryByRole('menuitem')).toBeNull();
  },
};
