import type { Meta, StoryObj } from '@storybook/react-vite';
import { Database, Layers } from 'lucide-react';
import { useState } from 'react';

import SegmentedSwitcher, { type SegmentedOption } from './SegmentedSwitcher';

type Value = 'protocols' | 'data';
const ICON_OPTIONS: SegmentedOption<Value>[] = [
  { value: 'protocols', label: 'Protocols', icon: Layers },
  { value: 'data', label: 'Data', icon: Database },
];

const COMPOSITION_DOC = `
A single-select segmented control built on Base UI's \`ToggleGroup\`, with a
spring-animated highlight that slides to the active segment. It never allows an
empty selection (clicking the active segment is a no-op).

\`\`\`tsx
import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';
import { Database, Layers } from 'lucide-react';

const options: SegmentedOption<'protocols' | 'data'>[] = [
  { value: 'protocols', label: 'Protocols', icon: Layers },
  { value: 'data', label: 'Data', icon: Database },
];

<SegmentedSwitcher
  aria-label="Workspace view"
  options={options}
  value={value}
  onValueChange={setValue}
  size="md"
  variant="outline"
/>
\`\`\`

**Props**

- **\`value\`** (\`T\`) — the currently selected option's \`value\`.
- **\`onValueChange\`** (\`(value: T) => void\`) — called with the newly picked
  value. A change that would deselect everything is ignored.
- **\`options\`** (\`SegmentedOption<T>[]\`) — each is
  \`{ value: T; label: ReactNode; icon?: LucideIcon; disabled?: boolean; render?: ReactElement }\`.
  \`render\` is a Base UI escape hatch to render a segment as another element
  (e.g. a router \`<Link>\`).
- **\`size\`** (\`'sm' | 'md' | 'lg' | 'xl'\`, default \`'md'\`) — track height is
  pinned to the matching \`Button\` height at each token, so they line up.
- **\`variant\`** (\`'outline' | 'glass'\`, default \`'outline'\`) — \`outline\`
  reads like a normal outline button (2px themed border, no fill); \`glass\` adds
  a translucent, backdrop-blurred, shadowed surface with a thicker border, for
  floating over content.
- **\`aria-label\`** (\`string\`, required) — labels the group for screen readers.
- **\`className\`** (\`string\`) — merged onto the track.

Keyboard operation and \`role="group"\`/toggle ARIA come from Base UI.
`;

type StoryArgs = {
  size: 'sm' | 'md' | 'lg' | 'xl';
  variant: 'outline' | 'glass';
  disabledSecond: boolean;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/SegmentedSwitcher',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { description: { component: COMPOSITION_DOC } },
  },
  args: { size: 'lg', variant: 'outline', disabledSecond: false },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg', 'xl'],
      description: 'Track height, pinned to the matching Button height.',
    },
    variant: {
      control: 'inline-radio',
      options: ['outline', 'glass'],
      description:
        'Track treatment. See the "Glass" story for the backdrop-blurred variant over content.',
    },
    disabledSecond: {
      control: 'boolean',
      description: 'Disable the second option to show the disabled state.',
    },
  },
  render: ({ size, variant, disabledSecond }) => {
    const [value, setValue] = useState<Value>('protocols');
    const options = ICON_OPTIONS.map((o, i) =>
      i === 1 && disabledSecond ? { ...o, disabled: true } : o,
    );
    return (
      <SegmentedSwitcher
        aria-label="Demo switcher"
        size={size}
        variant={variant}
        value={value}
        onValueChange={setValue}
        options={options}
      />
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// Every size token side by side, so their relative presence can be compared.
export const Sizes: Story = {
  render: () => {
    const [value, setValue] = useState<Value>('protocols');
    return (
      <div className="flex flex-col items-start gap-4">
        {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
          <SegmentedSwitcher
            key={size}
            aria-label={`Sizes example (${size})`}
            size={size}
            value={value}
            onValueChange={setValue}
            options={ICON_OPTIONS}
          />
        ))}
      </div>
    );
  },
};

// The status-filter shape: no icons, count embedded in the label, size md.
export const WithCounts: Story = {
  render: () => {
    type Filter = 'all' | 'in-progress' | 'complete';
    const [value, setValue] = useState<Filter>('all');
    const counts: Record<Filter, number> = {
      'all': 42,
      'in-progress': 7,
      'complete': 35,
    };
    const options: SegmentedOption<Filter>[] = (
      ['all', 'in-progress', 'complete'] as const
    ).map((v) => ({
      value: v,
      label: (
        <>
          {v === 'in-progress'
            ? 'In progress'
            : v === 'all'
              ? 'All'
              : 'Complete'}{' '}
          · {counts[v]}
        </>
      ),
    }));
    return (
      <SegmentedSwitcher
        aria-label="Status filter"
        size="md"
        value={value}
        onValueChange={setValue}
        options={options}
      />
    );
  },
};

// The default `outline` variant: a plain 2px themed border, no fill. Rendered
// bare — no wrapper — since it reads correctly on any background.
export const Outline: Story = { args: { variant: 'outline' } };

// The `glass` variant is translucent and backdrop-blurred, so it only reads
// when floating over content. The gradient panel below is a demo backdrop to
// make the blur/translucency visible — it is NOT part of the component.
export const Glass: Story = {
  render: () => {
    const [value, setValue] = useState<Value>('protocols');
    return (
      <div className="from-primary to-accent flex h-64 w-96 items-center justify-center rounded-2xl bg-linear-to-br p-8">
        <SegmentedSwitcher
          aria-label="Glass switcher"
          size="lg"
          variant="glass"
          value={value}
          onValueChange={setValue}
          options={ICON_OPTIONS}
        />
      </div>
    );
  },
};
