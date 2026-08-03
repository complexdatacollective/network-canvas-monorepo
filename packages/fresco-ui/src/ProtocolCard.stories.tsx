import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from './Badge';
import { ProtocolCard } from './ProtocolCard';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

const meta = {
  title: 'Components/ProtocolCard',
  component: ProtocolCard,
  parameters: { layout: 'centered' },
  args: {
    background: (
      <div aria-hidden className="bg-neon-coral absolute inset-0 size-full" />
    ),
    children: (
      <div className="relative z-10 flex size-full flex-col gap-5 p-[6cqi]">
        <Badge variant="outline" className="self-start">
          Sociograms
        </Badge>
        <Heading
          level="h2"
          margin="none"
          className="flex-1 content-center text-[max(18px,6cqi)] leading-[1.05] font-black"
        >
          Social Support Networks
        </Heading>
        <Paragraph margin="none" className="line-clamp-3 text-current/80">
          A study exploring the structure of personal support networks.
        </Paragraph>
      </div>
    ),
    className: 'size-[28rem]',
  },
} satisfies Meta<typeof ProtocolCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Preview: Story = {};

export const Active: Story = {
  args: { isActive: true },
};
