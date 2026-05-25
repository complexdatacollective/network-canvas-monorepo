import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import Button from './Button';
import ComboboxField from './form/fields/Combobox/Combobox';
import type { ComboboxOption } from './form/fields/Combobox/shared';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

const participantOptions: ComboboxOption[] = [
  { value: 'p1', label: 'Alice Johnson' },
  { value: 'p2', label: 'Bob Smith' },
  { value: 'p3', label: 'Charlie Brown' },
  { value: 'p4', label: 'Diana Ross' },
  { value: 'p5', label: 'Edward Norton' },
];

const countryOptions: ComboboxOption[] = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'au', label: 'Australia' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
];

const meta = {
  title: 'Components/Popover',
  component: Popover,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LayeredSurfaces: Story = {
  args: {
    // children is required by Popover but unused — `render` controls the tree.
    children: null,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A Popover whose content contains Comboboxes. Opening a Combobox stacks its popover-level surface on top of the outer Popover—the scenario we use to evaluate contrast and shadow intensity between adjacent popover surfaces. Use the toolbar Theme switcher to compare the Dashboard and Interview themes.',
      },
    },
  },
  render: () => {
    const [participants, setParticipants] = useState<(string | number)[]>([]);
    const [countries, setCountries] = useState<(string | number)[]>([]);

    return (
      <Popover defaultOpen>
        <PopoverTrigger render={<Button>Open filters</Button>} />
        <PopoverContent className="w-80">
          <div className="flex flex-col gap-4">
            <ComboboxField
              name="participants"
              options={participantOptions}
              placeholder="Select participants..."
              singular="Participant"
              plural="Participants"
              value={participants}
              onChange={(v) => setParticipants(v ?? [])}
            />
            <ComboboxField
              name="countries"
              options={countryOptions}
              placeholder="Select countries..."
              searchPlaceholder="Search countries..."
              singular="Country"
              plural="Countries"
              value={countries}
              onChange={(v) => setCountries(v ?? [])}
            />
          </div>
        </PopoverContent>
      </Popover>
    );
  },
};
