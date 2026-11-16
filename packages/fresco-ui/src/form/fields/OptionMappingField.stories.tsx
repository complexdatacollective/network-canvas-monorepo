import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import Node from '../../Node';
import UnconnectedField from '../Field/UnconnectedField';
import OptionMappingField, {
  type OptionMappingOption,
  type OptionMappingValue,
} from './OptionMappingField';

const meta = {
  title: 'Systems/Form/Fields/OptionMapping',
  component: OptionMappingField,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    showOptionLabels: { control: 'boolean' },
  },
} satisfies Meta<typeof OptionMappingField>;

export default meta;
type Story = StoryObj<typeof meta>;

const shapeOptions = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'diamond', label: 'Diamond' },
];

const isShape = (value: string) =>
  value === 'circle' || value === 'square' || value === 'diamond';

const renderShape = (option: OptionMappingOption) =>
  isShape(option.value) ? (
    <Node
      presentational
      shape={option.value}
      label=""
      color="node-color-seq-1"
      size="xxs"
      className="size-11"
    />
  ) : null;

const relationshipRows = [
  { id: 'friend', label: 'Friend' },
  { id: 'family', label: 'Family member' },
  { id: 'colleague', label: 'Colleague', note: 'Uses the default shape' },
];

const relationshipValue = [
  { id: 'friend', value: 'circle' },
  { id: 'family', value: 'square' },
];

export const Default: Story = {
  args: {
    'name': 'shapes',
    'rows': relationshipRows,
    'options': shapeOptions,
    'renderOption': renderShape,
    'value': relationshipValue,
    'aria-label': 'Shape for each value',
  },
};

export const WithOptionLabels: Story = {
  args: {
    ...Default.args,
    name: 'shapes-labelled',
    showOptionLabels: true,
  },
};

/** One row whose label would repeat the field's: a plain picker. */
export const SingleRowWithoutRowLabel: Story = {
  args: {
    ...Default.args,
    name: 'default-shape',
    rows: [{ id: 'shape', label: 'Default shape' }],
    value: [{ id: 'shape', value: 'square' }],
    rowLabelsHidden: true,
    showOptionLabels: true,
  },
};

export const NarrowContainer: Story = {
  args: { ...Default.args, name: 'shapes-narrow' },
  decorators: [
    (StoryComponent) => (
      <div className="w-72">
        <StoryComponent />
      </div>
    ),
  ],
};

export const Disabled: Story = {
  args: { ...Default.args, name: 'shapes-disabled', disabled: true },
};

export const ReadOnly: Story = {
  args: { ...Default.args, name: 'shapes-read-only', readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const friend = canvas.getByRole('radiogroup', { name: 'Friend' });
    await userEvent.click(
      within(friend).getByRole('radio', { name: 'Square' }),
    );
    await expect(
      within(friend).getByRole('radio', { name: 'Circle' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};

function InFieldExample() {
  const [value, setValue] = useState<OptionMappingValue>(relationshipValue);
  return (
    <UnconnectedField
      name="shape-for-each-value"
      label="Shape for each value"
      hint="Choose the shape a node takes for each value. A value with no shape chosen uses the default shape. [Learn more](https://example.com)."
      component={OptionMappingField}
      rows={relationshipRows.map((row) =>
        value.some((entry) => entry.id === row.id)
          ? { id: row.id, label: row.label }
          : { ...row, note: 'Uses the default shape' },
      )}
      options={shapeOptions}
      renderOption={renderShape}
      value={value}
      onRowChange={(rowId, next) =>
        setValue((current) => [
          ...current.filter((entry) => entry.id !== rowId),
          { id: rowId, value: next },
        ])
      }
    />
  );
}

/** With a label and a hint from `Field`, mapping each row as it is pressed. */
export const InField: Story = {
  args: Default.args,
  render: () => <InFieldExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const colleague = canvas.getByRole('radiogroup', { name: 'Colleague' });
    await expect(colleague).toHaveAccessibleDescription(
      'Uses the default shape',
    );

    await userEvent.click(
      within(colleague).getByRole('radio', { name: 'Diamond' }),
    );

    await expect(
      within(colleague).getByRole('radio', { name: 'Diamond' }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(colleague).not.toHaveAccessibleDescription();
    await expect(
      within(canvas.getByRole('radiogroup', { name: 'Friend' })).getByRole(
        'radio',
        { name: 'Circle' },
      ),
    ).toHaveAttribute('aria-checked', 'true');
  },
};
