import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge, type BadgeColor } from './Badge';

const themeColors = [
  'white',
  'black',
  'neon-coral',
  'neon-coral-dark',
  'sea-green',
  'sea-green-dark',
  'slate-blue',
  'slate-blue-dark',
  'navy-taupe',
  'navy-taupe-dark',
  'cyber-grape',
  'cyber-grape-dark',
  'mustard',
  'mustard-dark',
  'rich-black',
  'rich-black-dark',
  'charcoal',
  'charcoal-dark',
  'platinum',
  'platinum-dark',
  'sea-serpent',
  'sea-serpent-dark',
  'paradise-pink',
  'paradise-pink-dark',
  'cerulean-blue',
  'cerulean-blue-dark',
  'neon-carrot',
  'neon-carrot-dark',
  'kiwi',
  'kiwi-dark',
  'tomato',
  'tomato-dark',
  'purple-pizazz',
  'purple-pizazz-dark',
  'barbie-pink',
  'barbie-pink-dark',
] satisfies BadgeColor[];

const meta = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Small status and metadata labels. Use semantic variants for status, or the color prop for named theme colors.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'],
    },
    color: {
      control: 'select',
      options: [undefined, ...themeColors],
    },
  },
  args: {
    children: 'Badge',
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const ThemeColors: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {themeColors.map((color) => (
        <Badge key={color} color={color}>
          {color}
        </Badge>
      ))}
    </div>
  ),
};

export const ThemeColorOutlines: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {themeColors.map((color) => (
        <Badge key={color} color={color} variant="outline">
          {color}
        </Badge>
      ))}
    </div>
  ),
};
