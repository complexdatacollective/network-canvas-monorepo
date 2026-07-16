import type { Meta, StoryObj } from '@storybook/react-vite';

import ConcentricCircles from './ConcentricCircles';

const meta: Meta<typeof ConcentricCircles> = {
  title: 'Components/ConcentricCircles',
  component: ConcentricCircles,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  // n is required (the schema always supplies a ring count; 0 renders
  // nothing), so every story must provide it.
  args: {
    n: 4,
  },
  argTypes: {
    n: {
      control: { type: 'range', min: 0, max: 10, step: 1 },
      description: 'Number of concentric circles (0 renders nothing)',
      table: {
        type: { summary: 'number' },
      },
    },
    skewed: {
      control: 'boolean',
      description:
        'When true, circles are spaced by weighted area rather than equal increments',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EqualSpacing: Story = {
  args: {
    skewed: false,
  },
};

export const FiveCircles: Story = {
  args: {
    n: 5,
  },
};

export const TwoCircles: Story = {
  args: {
    n: 2,
  },
};

export const Comparison: Story = {
  parameters: {
    layout: 'centered',
  },
  render: () => (
    <div className="flex gap-8">
      <div className="flex flex-col items-center gap-2">
        <div style={{ width: 300, height: 300 }}>
          <ConcentricCircles n={4} skewed />
        </div>
        <span className="text-sm">Skewed (default)</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div style={{ width: 300, height: 300 }}>
          <ConcentricCircles n={4} skewed={false} />
        </div>
        <span className="text-sm">Equal spacing</span>
      </div>
    </div>
  ),
};
