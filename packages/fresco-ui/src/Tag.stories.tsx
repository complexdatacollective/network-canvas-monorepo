import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { paletteColorStyles } from './styles/palette';
import Tag, { type TagColor } from './Tag';

const meta = {
  title: 'Components/Tag',
  component: Tag,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
A compact, uppercase label with an optional palette-coloured dot. Give it
\`onPressedChange\` and it becomes a toggle button (Base UI \`Toggle\`) that
exposes \`pressed\` as \`aria-pressed\` — the shape used for multi-select facet
filters such as Architect's capability filter and the protocol gallery sidebar.

\`\`\`tsx
import Tag from '@codaco/fresco-ui/Tag';

<Tag color="mustard" pressed={active} onPressedChange={setActive}>
  Create edges
</Tag>
\`\`\`

Props: \`color\` (palette name for the dot), \`pressed\` + \`onPressedChange\`
(interactive toggle), \`light\` (muted display tone), \`disabled\`, \`size\`
(\`md\` default, \`sm\` for dense filter rows), plus any button attributes.
`,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    color: {
      control: 'select',
      options: Object.keys(paletteColorStyles) as TagColor[],
    },
    pressed: { control: 'boolean' },
    light: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: { children: 'Create edges', color: 'mustard' },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Display: Story = {};

export const Light: Story = {
  args: { light: true },
};

export const WithoutColor: Story = {
  args: { color: null, children: 'Public health' },
};

export const Toggle: Story = {
  args: { pressed: true },
  render: (args) => {
    const [pressed, setPressed] = useState(args.pressed ?? false);
    return <Tag {...args} pressed={pressed} onPressedChange={setPressed} />;
  },
};

export const Disabled: Story = {
  args: { disabled: true, onPressedChange: () => undefined },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Tag size="sm" color="sea-green">
        Small
      </Tag>
      <Tag size="md" color="sea-green">
        Medium
      </Tag>
    </div>
  ),
};

export const FilterGroup: Story = {
  render: () => {
    const [selected, setSelected] = useState<string[]>(['edges']);
    const toggle = (id: string) =>
      setSelected((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      );
    const options: { id: string; label: string; color: TagColor }[] = [
      { id: 'nodes', label: 'Create nodes', color: 'neon-coral' },
      { id: 'edges', label: 'Create edges', color: 'mustard' },
      { id: 'ego', label: 'Capture ego data', color: 'sea-green' },
      {
        id: 'attributes',
        label: 'Capture node attributes with a much longer label',
        color: 'cerulean-blue',
      },
    ];

    return (
      <div className="flex max-w-sm flex-wrap gap-1">
        {options.map(({ id, label, color }) => (
          <Tag
            key={id}
            color={color}
            pressed={selected.includes(id)}
            onPressedChange={() => toggle(id)}
          >
            {label}
          </Tag>
        ))}
      </div>
    );
  },
};
