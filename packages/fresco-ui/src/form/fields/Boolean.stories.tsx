import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';

import BooleanField from './Boolean';

type StoryArgs = React.ComponentProps<typeof BooleanField> & {
  containerWidth: number;
};

const meta: Meta<StoryArgs> = {
  title: 'Systems/Form/Fields/BooleanField',
  component: BooleanField,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A radiogroup of option cards for a boolean value. Options sit side by side and wrap to a stack only when their container is too narrow for them — sizing is intrinsic, so the field also works inside fit-content parents. Use the container width control to watch the layout respond, and edit the options to see how label length affects when wrapping happens.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    'containerWidth': {
      control: { type: 'range', min: 120, max: 960, step: 10 },
      description:
        'Width (px) of the container the field is rendered in. Story-only — not a component prop.',
      table: {
        type: { summary: 'number' },
      },
    },
    'options': {
      control: 'object',
      description: 'Label and value for each choice',
      table: {
        type: { summary: 'Array<{ label: string; value: boolean }>' },
        defaultValue: {
          summary:
            '[{ label: "Yes", value: true }, { label: "No", value: false }]',
        },
      },
    },
    'value': {
      control: 'radio',
      options: [true, false, undefined],
      description: 'Current value of the boolean field',
      table: {
        type: { summary: 'boolean | undefined' },
        defaultValue: { summary: 'undefined' },
      },
    },
    'disabled': {
      control: 'boolean',
      description: 'Whether the field is disabled',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'readOnly': {
      control: 'boolean',
      description: 'Whether the field is read-only',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'noReset': {
      control: 'boolean',
      description: 'Hide the reset button',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'aria-invalid': {
      control: 'radio',
      options: [undefined, true, false],
      description: 'Indicates the field has a validation error',
      table: {
        type: { summary: "'true' | 'false' | boolean" },
        defaultValue: { summary: 'undefined' },
      },
    },
    'onChange': {
      action: 'onChange',
      description: 'Callback when value changes',
      table: {
        type: { summary: '(value: boolean | undefined) => void' },
      },
    },
  },
  args: {
    containerWidth: 600,
    disabled: false,
    readOnly: false,
    noReset: false,
    options: [
      { label: 'Yes', value: true },
      { label: 'No', value: false },
    ],
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const { containerWidth, ...fieldArgs } = args;
    const [value, setValue] = useState<boolean | undefined>(args.value);

    useEffect(() => {
      setValue(args.value);
    }, [args.value]);

    return (
      <div style={{ width: containerWidth, maxWidth: '100%' }}>
        <BooleanField
          {...fieldArgs}
          value={value}
          onChange={(newValue) => {
            setValue(newValue);
            args.onChange?.(newValue);
          }}
        />
      </div>
    );
  },
};
