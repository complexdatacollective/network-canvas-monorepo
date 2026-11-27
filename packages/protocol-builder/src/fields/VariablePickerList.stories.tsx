import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Surface from '@codaco/fresco-ui/layout/Surface';

import {
  ANOTHER_FIELD,
  dynamicPill,
  useAttributeGroups,
} from '../testing/attributePickerGroups.ts';
import VariablePickerList from './VariablePickerList.tsx';

function ListHarness() {
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [closeRequests, setCloseRequests] = useState(0);
  const groups = useAttributeGroups(() => undefined);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-8">
      <Surface floating spacing="none" noContainer>
        <VariablePickerList
          groups={groups}
          optionPill={dynamicPill}
          onSelect={setChosen}
          onOpenChange={(open) => {
            if (!open) setCloseRequests((count) => count + 1);
          }}
          onCreateOption={() => Promise.resolve({ status: 'created' })}
          aria-label="Insert an attribute"
        />
      </Surface>
      <output data-testid="chosen">{chosen ?? 'nothing'}</output>
      <output data-testid="close-requests">{closeRequests}</output>
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Attribute list',
  component: ListHarness,
  parameters: {
    docs: {
      description: {
        component:
          'The searchable list of attributes that every attribute picker shows. The attribute picker opens it in its own popup; the Attribute menu of the rich text editor and the field picker of a form draw it in place inside their own popovers. Attributes are listed under headings, and an attribute that cannot be used here stays in its group, dimmed, with the reason beneath it.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ListHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The list on its own, drawn in place. It searches and chooses like the list
 * of the attribute picker, and asks its popover to close after a choice.
 */
export const InPlace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await canvas.findByRole('combobox', {
      name: 'Find or create an attribute',
    });
    await expect(
      canvas.getByText(
        'Type a name in the search box to create a new attribute.',
      ),
    ).toBeVisible();

    await userEvent.click(search);
    await userEvent.type(search, 'gend');
    await waitFor(() =>
      expect(
        canvas
          .getAllByRole('option')
          .map((option) => option.dataset.attributeId)
          .filter((id) => id !== undefined),
      ).toEqual(['gender']),
    );
    // The create row comes first, highlighted; the attribute is the next row.
    await expect(
      canvas.getByRole('option', { name: 'Create “gend”' }),
    ).toHaveAttribute('data-highlighted');
    await userEvent.keyboard('{ArrowDown}');
    await expect(
      canvas.getByRole('option', { name: 'gender' }),
    ).toHaveAttribute('data-highlighted');
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(canvas.getByTestId('chosen')).toHaveTextContent('gender'),
    );
    await expect(canvas.getByTestId('close-requests')).toHaveTextContent('1');
  },
};

/**
 * Unavailable attributes keep their place in their group, with the reason
 * shown beneath them before anything is chosen, and choosing one chooses
 * nothing.
 */
export const ReasonsInPlace: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = await canvas.findByRole('option', { name: 'first_name' });
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    await expect(row.closest('[data-attribute-group]')).toHaveAttribute(
      'data-attribute-group',
      'ego',
    );
    await expect(within(row).getByText(ANOTHER_FIELD)).toBeVisible();
    await expect(row).toHaveAccessibleDescription(
      expect.stringContaining(ANOTHER_FIELD),
    );
    row.scrollIntoView({ block: 'nearest' });
    await userEvent.click(row);
    await expect(canvas.getByTestId('chosen')).toHaveTextContent('nothing');
    await expect(canvas.getByTestId('close-requests')).toHaveTextContent('0');
  },
};
