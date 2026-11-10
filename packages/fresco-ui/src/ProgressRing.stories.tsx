import type { Meta, StoryObj } from '@storybook/react-vite';
import { Check } from 'lucide-react';

import ProgressRing from './ProgressRing';

const STEP = '3/18';

const meta: Meta<typeof ProgressRing> = {
  title: 'Components/ProgressRing',
  component: ProgressRing,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `A ring that fills clockwise from the top, with whatever it measures centred in its middle. It fills its box to the edge, so size it with \`className\`.

The ring is presentational: it is hidden from assistive technology and names nothing itself. Name the progress on the control it sits in, or add visually hidden text among its children.

\`\`\`tsx
import ProgressRing from '@codaco/fresco-ui/ProgressRing';

<ProgressRing value={0.92} className="size-14">
  <span aria-hidden className="text-sm font-semibold tabular-nums">92%</span>
</ProgressRing>
\`\`\`

Props:
- \`value\`: how much of the ring is filled, from 0 to 1. Values outside that range are clamped.
- \`complete\`: draws the filled arc in the success colour.
- \`children\`: centred over the ring.
- \`className\`: sizes the ring.`,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
      description: 'How much of the ring is filled, from 0 to 1',
      table: { type: { summary: 'number' } },
    },
    complete: {
      control: 'boolean',
      description: 'Draw the filled arc in the success colour',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    className: {
      control: 'text',
      description: 'Sizes the ring',
      table: { type: { summary: 'string' } },
    },
  },
  args: {
    value: 0.42,
    complete: false,
    className: 'size-14',
  },
};

export default meta;
type Story = StoryObj<typeof ProgressRing>;

/** A percentage in the middle, as the Family Pedigree's completeness ring. */
export const Percentage: Story = {
  render: (args) => (
    <ProgressRing {...args}>
      <span aria-hidden className="text-sm font-semibold tabular-nums">
        {Math.round(args.value * 100)}%
      </span>
    </ProgressRing>
  ),
};

/** Finished: the arc turns to the success colour and a tick replaces the number. */
export const Complete: Story = {
  args: { value: 1, complete: true },
  render: (args) => (
    <ProgressRing {...args}>
      <Check aria-hidden className="text-success size-8 stroke-[4px]" />
    </ProgressRing>
  ),
};

/** A step count in a smaller ring, as the stage editor walkthrough's. */
export const StepCount: Story = {
  args: { value: 3 / 18, className: 'size-10' },
  render: (args) => (
    <ProgressRing {...args}>
      <span aria-hidden className="font-heading text-2xs font-extrabold">
        {STEP}
      </span>
    </ProgressRing>
  ),
};

/** Nothing done yet: only the faint track shows. */
export const Empty: Story = {
  args: { value: 0 },
};

/** The ring alone, with nothing in its middle. */
export const WithoutLabel: Story = {
  args: { value: 0.66 },
};
