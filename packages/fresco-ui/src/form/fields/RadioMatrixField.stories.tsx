import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import UnconnectedField from '../Field/UnconnectedField';
import RadioMatrixField, { type RadioMatrixValue } from './RadioMatrixField';

const meta = {
  title: 'Systems/Form/Fields/RadioMatrix',
  component: RadioMatrixField,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
} satisfies Meta<typeof RadioMatrixField>;

export default meta;
type Story = StoryObj<typeof meta>;

const partnershipOptions = [
  { value: 'current', label: 'Current partner' },
  { value: 'ex', label: 'Ex-partner' },
  { value: 'none', label: 'Not a partner' },
];

const parentRows = [
  { id: 'egg-parent', label: 'Linda (egg parent)' },
  { id: 'sperm-parent', label: 'Robert (sperm parent)' },
  { id: 'additional-0', label: 'Karen (step-parent)' },
];

export const Default: Story = {
  args: {
    'name': 'partnerships',
    'rows': parentRows,
    'options': partnershipOptions,
    'defaultOption': 'none',
    'rowHeader': 'Person',
    'aria-label': "Who are Linda's partners?",
  },
};

export const Prefilled: Story = {
  args: {
    'name': 'partnerships-prefilled',
    'rows': parentRows,
    'options': partnershipOptions,
    'defaultOption': 'none',
    'rowHeader': 'Person',
    'value': [
      { id: 'egg-parent', value: 'ex' },
      { id: 'sperm-parent', value: 'current' },
      { id: 'additional-0', value: 'none' },
    ],
    'aria-label': "Who are Linda's partners?",
  },
};

export const ManyRowsLongLabels: Story = {
  args: {
    'name': 'partnerships-many',
    'rows': Array.from({ length: 6 }, (_, i) => ({
      id: `person-${String(i)}`,
      label: `Family member ${String(i + 1)} with a fairly long descriptive name`,
    })),
    'options': partnershipOptions,
    'defaultOption': 'none',
    'rowHeader': 'Person',
    'aria-label': 'Relationships',
  },
};

export const Disabled: Story = {
  args: {
    'name': 'partnerships-disabled',
    'rows': parentRows,
    'options': partnershipOptions,
    'defaultOption': 'none',
    'rowHeader': 'Person',
    'disabled': true,
    'value': [{ id: 'sperm-parent', value: 'current' }],
    'aria-label': "Who are Linda's partners?",
  },
};

/**
 * On a narrow container the matrix collapses to stacked per-row groups with
 * visible option labels, rather than the aligned column grid.
 */
export const Narrow: Story = {
  args: {
    'name': 'partnerships-narrow',
    'rows': parentRows,
    'options': partnershipOptions,
    'defaultOption': 'none',
    'aria-label': "Who are Linda's partners?",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * Intended usage: inside a `Field` (here the form-context-free
 * `UnconnectedField`), so the focal person is named in the question label.
 */
export const InAField: Story = {
  args: {
    rows: parentRows,
    options: partnershipOptions,
    defaultOption: 'none',
    rowHeader: 'Person',
  },
  render: (args) => {
    const [value, setValue] = useState<RadioMatrixValue | undefined>(undefined);
    return (
      <UnconnectedField
        name="partnerships"
        label="Who are Linda's partners?"
        hint="Choose one relationship for each person."
        component={RadioMatrixField}
        rows={args.rows}
        options={args.options}
        defaultOption={args.defaultOption}
        rowHeader={args.rowHeader}
        value={value}
        onChange={setValue}
      />
    );
  },
};

function MatrixWithValueDisplay(
  args: React.ComponentProps<typeof meta.component>,
) {
  const [value, setValue] = useState<RadioMatrixValue | undefined>(undefined);
  return (
    <div>
      <RadioMatrixField {...args} value={value} onChange={setValue} />
      <p className="mt-8">
        Value:&nbsp;
        <span data-testid="matrix-value">
          {value === undefined ? 'unset' : JSON.stringify(value)}
        </span>
      </p>
    </div>
  );
}

export const SelectingARowEmitsTheFullMatrix: Story = {
  args: {
    'name': 'partnerships-interaction',
    'rows': parentRows,
    'options': partnershipOptions,
    'defaultOption': 'none',
    'rowHeader': 'Person',
    'aria-label': "Who are Linda's partners?",
  },
  render: (args) => <MatrixWithValueDisplay {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const valueDisplay = canvas.getByTestId('matrix-value');

    await expect(valueDisplay).toHaveTextContent('unset');

    // Mark Linda as a current partner; Robert/Karen stay at their default.
    const lindaGroup = canvas.getByRole('radiogroup', {
      name: 'Linda (egg parent)',
    });
    await userEvent.click(
      within(lindaGroup).getByRole('radio', { name: 'Current partner' }),
    );

    await expect(valueDisplay).toHaveTextContent(
      '"id":"egg-parent","value":"current"',
    );
    await expect(valueDisplay).toHaveTextContent(
      '"id":"sperm-parent","value":"none"',
    );
  },
};
