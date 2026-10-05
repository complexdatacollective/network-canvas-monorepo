import type { Meta, StoryObj } from '@storybook/react-vite';

import Surface from '../layout/Surface';
import FieldErrors from './FieldErrors';

const meta = {
  title: 'Form/FieldErrors',
  component: FieldErrors,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Renders a field\'s validation messages. With no `variant`, the messages are plain destructive text, except inside the `interview` theme or a `<Surface series="accent">`, where they are drawn as a destructive box with contrast text. Pass `variant="box"` to draw the box anywhere else plain destructive text would have poor contrast, or `variant="text"` to keep plain text on an accent Surface.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['text', 'box'],
    },
  },
  args: {
    id: 'field-errors-story',
    show: true,
    errors: ['This value must be unique.'],
  },
} satisfies Meta<typeof FieldErrors>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnAccentSurface: Story = {
  render: (args) => (
    <Surface series="accent">
      <FieldErrors {...args} />
    </Surface>
  ),
};

export const Box: Story = {
  args: { variant: 'box' },
};

export const MultipleErrors: Story = {
  args: {
    variant: 'box',
    errors: [
      'This value must be unique.',
      'Must be greater than the minimum value.',
    ],
  },
};

// Reproduces the contrast problem this variant fixes: on a colored row
// background, the default `text` variant's plain destructive text is hard to
// read, while `box` keeps a readable destructive-contrast box regardless of
// what it sits on.
export const OnColoredBackground: Story = {
  render: (args) => (
    <div className="bg-slate-blue flex flex-col gap-4 rounded p-5 text-white">
      <div>
        <p className="mb-2 text-xs opacity-70">variant=&quot;text&quot;</p>
        <FieldErrors {...args} variant="text" />
      </div>
      <div>
        <p className="mb-2 text-xs opacity-70">variant=&quot;box&quot;</p>
        <FieldErrors {...args} variant="box" />
      </div>
    </div>
  ),
};
