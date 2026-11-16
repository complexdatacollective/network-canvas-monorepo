import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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
          'A radiogroup of option cards for a boolean value. Options sit side by side and wrap to a stack only when their container is too narrow for them — sizing is intrinsic, so the field also works inside fit-content parents. Use the container width control to watch the layout respond, and edit the options to see how label length affects when wrapping happens.\n\nAn option may be marked `negative` to style it as a negative response: once selected, its border and indicator take the destructive colour instead of the primary one. Unselected negative options look like any other option. The emphasis is presentational only — the option label carries the meaning, so nothing extra is announced to assistive technology.',
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
      description:
        'Label and value for each choice. Set `negative` to style a choice as a negative response when selected.',
      table: {
        type: {
          summary:
            'Array<{ label: PresentationalText; value: boolean; negative?: boolean }>',
        },
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

const renderField = (args: StoryArgs) => {
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
};

export const Default: Story = {
  render: renderField,
};

export const NegativeOption: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The "No" option is marked `negative`. Select it to see the destructive border and indicator; select "Yes" to confirm the negative option returns to the neutral unselected treatment.',
      },
    },
  },
  args: {
    value: false,
    options: [
      { label: 'Yes', value: true },
      { label: 'No', value: false, negative: true },
    ],
  },
  render: renderField,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const themeColor = (className: string) => {
      const probe = document.createElement('span');
      probe.className = className;
      canvasElement.append(probe);
      const { color } = getComputedStyle(probe);
      probe.remove();
      return color;
    };
    const indicatorOf = (radio: HTMLElement) => {
      const svg = radio.querySelector('svg');
      if (!svg) throw new Error('Expected the option to render an indicator');
      return svg;
    };
    const destructive = themeColor('text-destructive');
    const primary = themeColor('text-primary');
    await expect(destructive).not.toBe(primary);

    const no = canvas.getByRole('radio', { name: 'No' });
    const yes = canvas.getByRole('radio', { name: 'Yes' });

    await waitFor(() =>
      expect(getComputedStyle(no).borderTopColor).toBe(destructive),
    );
    await expect(getComputedStyle(indicatorOf(no)).color).toBe(destructive);
    await expect(getComputedStyle(yes).borderTopColor).not.toBe(destructive);

    await userEvent.click(yes);
    await waitFor(() =>
      expect(getComputedStyle(yes).borderTopColor).toBe(primary),
    );
    await expect(getComputedStyle(no).borderTopColor).not.toBe(destructive);
    await expect(getComputedStyle(indicatorOf(no)).color).toBe(primary);

    // End where the story starts, on the destructive state it exists to show.
    await userEvent.click(no);
    await waitFor(() =>
      expect(getComputedStyle(no).borderTopColor).toBe(destructive),
    );
    await expect(getComputedStyle(indicatorOf(no)).color).toBe(destructive);
    await waitFor(() =>
      expect(getComputedStyle(yes).borderTopColor).not.toBe(primary),
    );
  },
};

export const NegativeOptionWithLongLabels: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'A negative option with a label long enough to wrap, in a narrow container — the indicator stays aligned to the first line and does not shrink.',
      },
    },
  },
  args: {
    containerWidth: 260,
    value: false,
    options: [
      { label: 'Yes, I am happy to take part in this study', value: true },
      {
        label: 'No, I would rather not take part in this study',
        value: false,
        negative: true,
      },
    ],
  },
  render: renderField,
};

export const LocalizedLabels: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Protocol copy arrives as `PresentationalText`: the field's own label and each option label render on an element carrying the text's `lang` and `dir`, so Arabic copy lays out right-to-left inside a left-to-right page.",
      },
    },
  },
  args: {
    label: { text: 'هل توافق على المشاركة؟', lang: 'ar', dir: 'rtl' },
    options: [
      { label: { text: 'نعم', lang: 'ar', dir: 'rtl' }, value: true },
      {
        label: { text: 'لا', lang: 'ar', dir: 'rtl' },
        value: false,
        negative: true,
      },
    ],
  },
  render: renderField,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const group = canvas.getByRole('radiogroup', {
      name: 'هل توافق على المشاركة؟',
    });
    await expect(group).toBeInTheDocument();
    const yes = canvas.getByText('نعم');
    await expect(yes.closest('[lang]')).toHaveAttribute('lang', 'ar');
    await expect(getComputedStyle(yes).direction).toBe('rtl');

    await userEvent.click(canvas.getByRole('radio', { name: 'لا' }));
    await expect(canvas.getByRole('radio', { name: 'لا' })).toBeChecked();
  },
};
