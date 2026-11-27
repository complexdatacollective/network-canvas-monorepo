import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import NodeTypeOrderField from './NodeTypeOrderField.tsx';

const TYPES = [
  { id: 'person', label: 'Person' },
  { id: 'place', label: 'Place' },
  { id: 'group', label: 'Group' },
];

/**
 * The control on its own, with the order it last reported written out below
 * it, so a play can read what a sociogram prompt would save.
 */
function Control({
  initialValue,
}: Readonly<{
  initialValue?: string[];
}>) {
  const [value, setValue] = useState(initialValue);

  return (
    <DialogProvider>
      <div className="max-w-md p-6">
        <NodeTypeOrderField
          id="node-type-order"
          name="nodeTypeOrder"
          aria-label="Order of node types"
          types={TYPES}
          {...(value === undefined ? {} : { value })}
          onChange={(next) => setValue(next)}
        />
        <output data-testid="reported-order">
          {value === undefined ? 'nothing reported' : value.join(', ')}
        </output>
      </div>
    </DialogProvider>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Node type order',
  component: Control,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The order in which a sociogram prompt hands over the unplaced nodes of a stage that shows several node types. Every type the stage shows is listed, and only those: a saved order naming a type the stage no longer shows drops it, and a type it does not name yet follows the others in the order the stage lists its types. With no saved order the list shows that order, which is what the interview uses without one.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Control>;

export default meta;
type Story = StoryObj<typeof meta>;

const listedTypes = (canvasElement: HTMLElement) =>
  within(canvasElement)
    .getAllByRole('listitem')
    .map((item) => item.textContent?.trim());

/** No saved order: the types in the order the stage lists them. */
export const NoSavedOrder: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(listedTypes(canvasElement)).toEqual(['Person', 'Place', 'Group']),
    );
  },
};

/** A saved order is shown as it was saved. */
export const SavedOrder: Story = {
  args: { initialValue: ['group', 'person', 'place'] },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(listedTypes(canvasElement)).toEqual(['Group', 'Person', 'Place']),
    );
  },
};

/**
 * A saved order that misses a type the stage shows, and names one it does
 * not: the missing type comes last and the other is not listed.
 */
export const SavedOrderThatDoesNotFit: Story = {
  args: { initialValue: ['place', 'venue', 'person'] },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(listedTypes(canvasElement)).toEqual(['Place', 'Person', 'Group']),
    );
  },
};

/** Moving a type reports every type the stage shows, in the new order. */
export const MovingAType: Story = {
  args: { initialValue: ['place', 'person'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const handle = await canvas.findByRole('button', {
      name: 'Reorder item 1 of 3',
    });
    handle.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(canvas.getByTestId('reported-order')).toHaveTextContent(
        'person, place, group',
      ),
    );
  },
};
