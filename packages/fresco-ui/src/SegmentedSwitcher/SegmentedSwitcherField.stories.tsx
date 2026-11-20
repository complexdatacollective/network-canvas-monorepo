import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent } from 'storybook/test';

import UnconnectedField from '../form/Field/UnconnectedField';
import type { SegmentedOption } from './SegmentedSwitcher';
import SegmentedSwitcherField from './SegmentedSwitcherField';

const COMPOSITION_DOC = `
\`SegmentedSwitcher\` as a field's control: pass it as a field's \`component\`
and the field names it with its label (\`aria-labelledby\`), describes it with
its hint and any error (\`aria-describedby\`), and gives it its \`id\`.

\`\`\`tsx
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import SegmentedSwitcherField from '@codaco/fresco-ui/SegmentedSwitcherField';

<UnconnectedField
  name="size"
  component={SegmentedSwitcherField}
  label="Size"
  hint="How tall the picture is shown."
  size="sm"
  value={size}
  onChange={setSize}
  options={[
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
  ]}
/>
\`\`\`

**Props**, besides those the field passes:

- **\`options\`** (\`SegmentedOption<T>[]\`) — as \`SegmentedSwitcher\` takes them.
- **\`value\`** (\`T | undefined\`) — the chosen option's \`value\`; with none, no
  segment is pressed.
- **\`onChange\`** (\`(value: T | undefined) => void\`) — called with the option
  chosen.
- **\`size\`**, **\`variant\`**, **\`className\`** — as \`SegmentedSwitcher\` takes
  them.
- **\`disabled\`** — every segment ignores the pointer and the keyboard.
- **\`readOnly\`** — the value is shown and kept: a choice is not answered.
`;

type Size = 'small' | 'medium' | 'large';
const SIZES: SegmentedOption<Size>[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

type StoryArgs = {
  size: 'sm' | 'md' | 'lg' | 'xl';
  disabled: boolean;
  readOnly: boolean;
  label: string;
  hint: string;
};

const meta: Meta<StoryArgs> = {
  title: 'Systems/Form/Fields/SegmentedSwitcherField',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: COMPOSITION_DOC } },
  },
  args: {
    size: 'sm',
    disabled: false,
    readOnly: false,
    label: 'Size',
    hint: 'How tall the picture is shown.',
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    label: { control: 'text' },
    hint: { control: 'text' },
  },
  render: ({ size, disabled, readOnly, label, hint }) => {
    const [value, setValue] = useState<Size | undefined>('small');
    return (
      <UnconnectedField
        name="size"
        component={SegmentedSwitcherField<Size>}
        label={label}
        hint={hint}
        size={size}
        disabled={disabled}
        readOnly={readOnly}
        value={value}
        onChange={setValue}
        options={SIZES}
      />
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const group = canvas.getByRole('group', { name: 'Size' });
    await expect(group).toHaveAccessibleDescription(
      'How tall the picture is shown.',
    );

    const large = canvas.getByRole('button', { name: 'Large' });
    await userEvent.click(large);
    await expect(large).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'Small' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    for (const name of ['Small', 'Medium', 'Large']) {
      await expect(canvas.getByRole('button', { name })).toBeDisabled();
    }
  },
};

export const ReadOnly: Story = {
  args: { readOnly: true },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Large' }));
    await expect(canvas.getByRole('button', { name: 'Small' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

const ALIGNMENTS: SegmentedOption<'start' | 'center' | 'end'>[] = [
  { value: 'start', label: 'Start', icon: AlignLeft },
  { value: 'center', label: 'Centre', icon: AlignCenter },
  { value: 'end', label: 'End', icon: AlignRight },
];

// Two fields side by side, the second with icons and no hint, as a block's
// settings show them.
export const BesideAnother: Story = {
  render: ({ size }) => {
    const [height, setHeight] = useState<Size | undefined>('medium');
    const [align, setAlign] = useState<'start' | 'center' | 'end' | undefined>(
      'start',
    );
    return (
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <UnconnectedField
          name="height"
          component={SegmentedSwitcherField<Size>}
          label="Size"
          hint="How tall the picture is shown."
          size={size}
          value={height}
          onChange={setHeight}
          options={SIZES}
        />
        <UnconnectedField
          name="align"
          component={SegmentedSwitcherField<'start' | 'center' | 'end'>}
          label="Position"
          size={size}
          value={align}
          onChange={setAlign}
          options={ALIGNMENTS}
        />
      </div>
    );
  },
  play: async ({ canvas }) => {
    const position = canvas.getByRole('group', { name: 'Position' });
    await expect(position).not.toHaveAttribute('aria-describedby');
    await userEvent.click(canvas.getByRole('button', { name: 'End' }));
    await expect(canvas.getByRole('button', { name: 'End' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
