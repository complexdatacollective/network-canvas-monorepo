import type { Meta, StoryObj } from '@storybook/react-vite';
import { Database, Layers } from 'lucide-react';
import { useState } from 'react';

import SegmentedSwitcher, { type SegmentedOption } from './SegmentedSwitcher';

type Value = 'protocols' | 'data';
const ICON_OPTIONS: SegmentedOption<Value>[] = [
  { value: 'protocols', label: 'Protocols', icon: Layers },
  { value: 'data', label: 'Data', icon: Database },
];

type StoryArgs = { size: 'sm' | 'md' | 'lg'; disabledSecond: boolean };

const meta: Meta<StoryArgs> = {
  title: 'Components/SegmentedSwitcher',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { size: 'lg', disabledSecond: false },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    disabledSecond: { control: 'boolean' },
  },
  render: ({ size, disabledSecond }) => {
    const [value, setValue] = useState<Value>('protocols');
    const options = ICON_OPTIONS.map((o, i) =>
      i === 1 && disabledSecond ? { ...o, disabled: true } : o,
    );
    return (
      <SegmentedSwitcher
        aria-label="Demo switcher"
        size={size}
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
