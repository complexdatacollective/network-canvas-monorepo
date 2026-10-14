import type { Meta, StoryObj } from '@storybook/react-vite';

import NodeDropAnimation from './NodeDropAnimation';

const meta: Meta<typeof NodeDropAnimation> = {
  title: 'Components/NodeDropAnimation',
  component: NodeDropAnimation,
  tags: ['autodocs'],
  parameters: {
    // It loops forever, so a snapshot would catch a random frame.
    chromatic: { disableSnapshot: true },
    layout: 'centered',
    docs: {
      description: {
        component: `
A decorative loop of a node dropping into an empty slot. Use it on an empty
drop target to show that people can be dropped there. It takes its colour from
the surrounding text colour and is hidden from assistive technology, so pair it
with text (visible or \`sr-only\`) that says what to do. With reduced motion it
shows a still frame of the node just above its slot.

\`\`\`tsx
import NodeDropAnimation from '@codaco/fresco-ui/NodeDropAnimation';

<div className="text-text">
  <NodeDropAnimation size="md" />
  <span className="sr-only">Drop people here</span>
</div>
\`\`\`

**Props:** \`size\` (\`'sm' | 'md' | 'lg'\`, default \`'md'\`), \`className\`.
        `,
      },
    },
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      table: { defaultValue: { summary: 'md' } },
    },
  },
};

export default meta;

type Story = StoryObj<typeof NodeDropAnimation>;

export const Default: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const Large: Story = { args: { size: 'lg' } };

export const TakesTheTextColour: Story = {
  args: { className: 'text-accent' },
};
