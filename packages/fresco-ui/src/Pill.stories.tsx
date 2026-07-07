import type { Meta, StoryObj } from '@storybook/react-vite';

import Icon from './Icon';
import Pill from './Pill';

const meta = {
  title: 'Components/Pill',
  component: Pill,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    as: { control: 'inline-radio', options: ['span', 'button'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    variant: {
      control: 'inline-radio',
      options: ['ghost', 'filled', 'outline'],
    },
  },
} satisfies Meta<typeof Pill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'v8.0.0-beta.3', size: 'md', variant: 'ghost' },
};

export const WithIcon: Story = {
  args: {
    children: 'v8.0.0-beta.3',
    variant: 'filled',
    icon: <Icon name="RefreshCw" className="size-3.5" />,
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Pill size="sm">v1.2.3</Pill>
      <Pill size="md">v1.2.3</Pill>
      <Pill size="lg">v1.2.3</Pill>
    </div>
  ),
};

// The load-bearing guarantee: a ghost pill and a filled/coloured pill occupy the
// SAME box, so switching update states never nudges neighbouring content.
export const SpacingStable: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      <Pill variant="ghost">v8.0.0-beta.3</Pill>
      <Pill
        as="button"
        variant="ghost"
        className="bg-sea-serpent/20 text-sea-serpent"
        icon={<Icon name="RefreshCw" className="size-3.5" />}
      >
        v8.0.0-beta.3
      </Pill>
      <Pill
        as="button"
        variant="ghost"
        className="bg-sea-green/20 text-sea-green"
        icon={<Icon name="Check" className="size-3.5" />}
      >
        v8.0.0-beta.3
      </Pill>
      <Pill className="bg-platinum text-charcoal shadow-sm">v8.0.0-beta.3</Pill>
    </div>
  ),
};
