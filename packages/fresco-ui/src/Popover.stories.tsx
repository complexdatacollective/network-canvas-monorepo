import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import Button from './Button';
import ComboboxField from './form/fields/Combobox/Combobox';
import type { ComboboxOption } from './form/fields/Combobox/shared';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

const participantOptions: ComboboxOption[] = [
  { value: 'p1', label: 'Alice Johnson' },
  { value: 'p2', label: 'Bob Smith' },
  { value: 'p3', label: 'Charlie Brown' },
  { value: 'p4', label: 'Diana Ross' },
  { value: 'p5', label: 'Edward Norton' },
  { value: 'p6', label: 'Fiona Apple' },
  { value: 'p7', label: 'George Harrison' },
  { value: 'p8', label: 'Hannah Arendt' },
];

const countryOptions: ComboboxOption[] = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'au', label: 'Australia' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'jp', label: 'Japan' },
  { value: 'br', label: 'Brazil' },
];

const languageOptions: ComboboxOption[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
];

const tagOptions: ComboboxOption[] = [
  { value: 'pilot', label: 'Pilot study' },
  { value: 'field', label: 'Field work' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'archived', label: 'Archived' },
];

const statusOptions: ComboboxOption[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'flagged', label: 'Flagged for review' },
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
          'A large Popover whose content contains multiple Comboboxes. Opening a Combobox stacks its popover-level surface on top of the outer Popover—the scenario we use to evaluate contrast and shadow intensity between adjacent popover surfaces. Use the toolbar Theme switcher to compare the Dashboard and Interview themes.',
      },
    },
  },
  render: () => {
    const [participants, setParticipants] = useState<(string | number)[]>([]);
    const [countries, setCountries] = useState<(string | number)[]>([]);
    const [languages, setLanguages] = useState<(string | number)[]>([]);
    const [tags, setTags] = useState<(string | number)[]>([]);
    const [statuses, setStatuses] = useState<(string | number)[]>([]);

    return (
      <Popover defaultOpen>
        <PopoverTrigger render={<Button>Open filters</Button>} />
        <PopoverContent className="w-[28rem]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <Heading level="h3" margin="none" className="text-lg">
                Filter sessions
              </Heading>
              <Paragraph margin="none" className="text-sm opacity-70">
                Narrow the session list by any combination of attributes below.
                Filters are combined with AND.
              </Paragraph>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Paragraph margin="none" className="text-xs font-medium">
                  Participants
                </Paragraph>
                <ComboboxField
                  name="participants"
                  options={participantOptions}
                  placeholder="Select participants..."
                  singular="Participant"
                  plural="Participants"
                  value={participants}
                  onChange={(v) => setParticipants(v ?? [])}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Paragraph margin="none" className="text-xs font-medium">
                  Countries
                </Paragraph>
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

              <div className="flex flex-col gap-1">
                <Paragraph margin="none" className="text-xs font-medium">
                  Languages
                </Paragraph>
                <ComboboxField
                  name="languages"
                  options={languageOptions}
                  placeholder="Select languages..."
                  singular="Language"
                  plural="Languages"
                  value={languages}
                  onChange={(v) => setLanguages(v ?? [])}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Paragraph margin="none" className="text-xs font-medium">
                  Tags
                </Paragraph>
                <ComboboxField
                  name="tags"
                  options={tagOptions}
                  placeholder="Select tags..."
                  singular="Tag"
                  plural="Tags"
                  value={tags}
                  onChange={(v) => setTags(v ?? [])}
                />
              </div>

              <div className="flex flex-col gap-1">
                <Paragraph margin="none" className="text-xs font-medium">
                  Status
                </Paragraph>
                <ComboboxField
                  name="statuses"
                  options={statusOptions}
                  placeholder="Select statuses..."
                  singular="Status"
                  plural="Statuses"
                  value={statuses}
                  onChange={(v) => setStatuses(v ?? [])}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-current/10 pt-3">
              <Button
                variant="text"
                onClick={() => {
                  setParticipants([]);
                  setCountries([]);
                  setLanguages([]);
                  setTags([]);
                  setStatuses([]);
                }}
              >
                Reset
              </Button>
              <Button>Apply filters</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
};
