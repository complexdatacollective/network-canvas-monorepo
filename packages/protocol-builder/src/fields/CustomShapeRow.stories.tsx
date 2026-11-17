import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';

import CustomShapeRow from './CustomShapeRow.tsx';

const meta = {
  title: 'Protocol Builder/Fields/Custom shape row',
  component: CustomShapeRow,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One of a node type’s own shapes inside the custom shapes field: a preview drawn as the node will be, its name, and the button that removes it.',
      },
    },
  },
  decorators: [
    (Story) => (
      <ul className="bg-input text-input-contrast flex max-w-3xl flex-col gap-4 rounded border-2 p-4">
        <Story />
      </ul>
    ),
  ],
  args: {
    name: 'customShapes.home.name',
    shape: { name: 'Home', asset: 'home-image' },
    preview: 'square',
    color: 'node-color-seq-4',
    disabled: false,
    readOnly: false,
    onRename: fn(),
    onRemove: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof CustomShapeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unused: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Remove shape Home' }),
    ).toBeEnabled();
  },
};

/** Used as the type's default shape, so it cannot be removed. */
export const InUse: Story = {
  args: { usage: 'default' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Remove shape Home' }),
    ).toBeDisabled();
  },
};

/** Imported from a file that held content a node does not draw. */
export const WithNotice: Story = {
  args: {
    notice: {
      origin: 'imported',
      removed: ['scripts', 'filters'],
      centredLabel: true,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/was left out: scripts and filters\./),
    ).toBeVisible();
  },
};

/** A name another shape of the type already has. */
export const NameTaken: Story = {
  args: {
    nameIssue: 'Another shape of this node type is already named "Home".',
  },
};
