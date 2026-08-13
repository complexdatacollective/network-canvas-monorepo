import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import type { ValidationName, VariableType } from '@codaco/protocol-validation';

import { VariablePill, type VariablePillProps } from './VariablePill';

const VARIABLE_TYPES = [
  'boolean',
  'categorical',
  'datetime',
  'layout',
  'location',
  'number',
  'ordinal',
  'scalar',
  'text',
] as const satisfies readonly VariableType[];

const VALIDATION_NAMES = [
  'required',
  'requiredAcceptsNull',
  'minLength',
  'maxLength',
  'minValue',
  'maxValue',
  'minSelected',
  'maxSelected',
  'unique',
  'differentFrom',
  'sameAs',
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const satisfies readonly ValidationName[];

type StoryArgs = VariablePillProps & {
  containerWidth: number;
};

const meta = {
  title: 'Components/VariablePill',
  component: VariablePill,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A presentation-only variable reference. The type region remains fixed while the label uses the available width and truncates when constrained. Active validation rules are included in the accessible name without adding visible glyphs.',
      },
    },
  },
  args: {
    containerWidth: 520,
    interactive: true,
    label: 'participant_age',
    type: 'number',
    validations: ['required', 'minValue', 'maxValue', 'unique'],
  },
  argTypes: {
    containerWidth: {
      control: { type: 'range', min: 240, max: 900, step: 10 },
      description: 'Width of the visible story container in pixels.',
    },
    disclosure: {
      control: false,
      description:
        'Supplied by a parent that owns a popover the pill discloses; it makes an interactive pill announce itself as a button with expanded state.',
    },
    interactive: {
      control: 'boolean',
      description:
        'Applies the interactive visual treatment and places the pill in the tab order.',
    },
    label: {
      control: 'text',
      description: 'Displayed variable name.',
    },
    type: {
      control: 'select',
      options: VARIABLE_TYPES,
      description: 'Variable type, which selects the icon and accent color.',
    },
    validations: {
      control: 'check',
      options: VALIDATION_NAMES,
      description:
        'Validation rules announced in the accessible name; they do not change the visible pill.',
    },
  },
  render: ({ containerWidth, ...args }) => (
    <div
      className="bg-surface-2 flex max-w-full rounded p-4"
      style={{ width: `${containerWidth}px` }}
    >
      <VariablePill {...args} />
    </div>
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * A pill with no popover behind it stays purely presentational: it is not a
 * control, so it takes no role, no popup semantics, and no place in the tab
 * order — a variable mentioned in passing must never sound actionable.
 */
export const Static: Story = {
  args: {
    interactive: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button')).toBeNull();

    const pill = canvasElement.querySelector('data');
    await expect(pill).not.toBeNull();
    await expect(pill).not.toHaveAttribute('aria-expanded');
    await expect(pill).not.toHaveAttribute('aria-haspopup');
    await expect(pill).not.toHaveAttribute('tabindex');
  },
};
