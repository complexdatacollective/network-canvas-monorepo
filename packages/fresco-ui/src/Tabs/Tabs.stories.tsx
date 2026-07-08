import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  FlaskConical,
  Info,
  LineChart,
  type LucideIcon,
  Route,
  Shield,
  Upload,
} from 'lucide-react';
import { useState } from 'react';

import { Tabs, TabsPanel } from './Tabs';

const ICONS: LucideIcon[] = [
  Info,
  Route,
  Upload,
  LineChart,
  Shield,
  FlaskConical,
];

const LABEL_SETS = {
  short: ['About', 'Setup', 'Export', 'Privacy', 'Security', 'Data'],
  default: [
    'About',
    'Interview',
    'Data export',
    'Privacy',
    'Security',
    'Synthetic data',
  ],
  long: [
    'About this device',
    'Interview behaviour & stage navigation',
    'Data export & archive format',
    'Privacy & analytics',
    'Security & authenticators',
    'Synthetic data generation',
  ],
} satisfies Record<string, string[]>;

const BODIES = [
  'Version, storage and device information for this installation.',
  'Stage navigation and other in-interview behaviour.',
  'Export format and archive layout options.',
  'Analytics and error-reporting preferences.',
  'Lock behaviour and authenticator management.',
  'Generate synthetic sessions to validate the export pipeline.',
];

type StoryArgs = {
  containerWidth: number;
  showIcons: boolean;
  labelLength: keyof typeof LABEL_SETS;
};

const COMPOSITION_DOC = `
A compound, Base UI-backed tabs component. \`Tabs\` renders its own rail from a
\`tabs\` array plus the moving active highlight; you only supply one
\`TabsPanel\` per tab \`value\`. Both are imported from \`@codaco/fresco-ui/Tabs\`:

\`\`\`tsx
import { Tabs, TabsPanel } from '@codaco/fresco-ui/Tabs';
import { Info, LineChart } from 'lucide-react';

<Tabs
  aria-label="Settings sections"
  value={section}
  onValueChange={setSection}
  tabs={[
    { value: 'about', label: 'About', icon: Info },
    { value: 'privacy', label: 'Privacy', icon: LineChart },
  ]}
>
  <TabsPanel value="about">…about content…</TabsPanel>
  <TabsPanel value="privacy">…privacy content…</TabsPanel>
</Tabs>
\`\`\`

**The parts**

- **\`Tabs\`** — root, rail and layout (a container-query flex row). Props:
  \`tabs\` (\`{ value: string; label: ReactNode; icon?: LucideIcon; disabled?: boolean }[]\`),
  \`aria-label\`, \`value\`, \`defaultValue\`, \`onValueChange(value: string)\`,
  \`orientation\` (\`'vertical'\` default), \`className\`, \`style\`. The rail sizes to
  the widest label, bounded per breakpoint.
- **\`TabsPanel\`** — content for a tab \`value\`; fills the row and is its own
  \`@container\`. Props: \`value\`, \`keepMounted?\`, \`className\`.

Accessibility (roving arrow-key focus, \`role=tablist/tab/tabpanel\`,
\`aria-selected\`, \`aria-controls\`) comes from Base UI.
`;

const meta: Meta<StoryArgs> = {
  title: 'Components/Tabs',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: COMPOSITION_DOC } },
  },
  args: { containerWidth: 640, showIcons: true, labelLength: 'default' },
  argTypes: {
    containerWidth: {
      control: { type: 'range', min: 240, max: 820, step: 20 },
      description:
        'Width of the component (shown with a dashed outline). The tab column grows to fit the widest label; below the breakpoint cap, long labels wrap rather than widening the column further.',
    },
    showIcons: {
      control: 'boolean',
      description: 'Render a leading icon on each tab.',
    },
    labelLength: {
      control: 'inline-radio',
      options: ['short', 'default', 'long'],
      description:
        'Swap the label set. "long" labels demonstrate multi-line wrapping within the tab column.',
    },
  },
  render: ({ containerWidth, showIcons, labelLength }) => {
    const [section, setSection] = useState<string>('0');
    const labels = LABEL_SETS[labelLength];
    const tabs = labels.map((label, i) => ({
      value: String(i),
      label,
      icon: showIcons ? ICONS[i] : undefined,
    }));
    return (
      <Tabs
        aria-label="Example sections"
        value={section}
        onValueChange={setSection}
        tabs={tabs}
        // The dashed outline marks the component's own bounds so its size can be
        // judged; it is not part of the component.
        className="outline-text/25 outline-2 outline-offset-8 outline-dashed"
        style={{ width: '100%', maxWidth: containerWidth }}
      >
        {labels.map((label, i) => (
          <TabsPanel key={i} value={String(i)}>
            <h3 className="font-heading text-lg font-extrabold">{label}</h3>
            <p className="text-text/70 mt-2 text-sm">{BODIES[i]}</p>
          </TabsPanel>
        ))}
      </Tabs>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// Long labels wrap to multiple lines within the tab column rather than forcing
// it ever wider — the tab radius stays a fixed rounded rect, not a stadium.
export const LongLabels: Story = { args: { labelLength: 'long' } };

// A narrow component: the column has hit its cap, so the default labels sit
// tight and any long label wraps.
export const Narrow: Story = { args: { containerWidth: 300 } };

// Text-only tabs, no leading icons.
export const WithoutIcons: Story = { args: { showIcons: false } };
