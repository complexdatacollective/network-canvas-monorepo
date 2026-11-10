import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, screen, userEvent, waitFor } from 'storybook/test';

import { Button } from '../../../Button';
import { Popover, PopoverContent, PopoverTrigger } from '../../../Popover';
import { presentationalTextValue } from '../../../PresentationalText';
import Heading from '../../../typography/Heading';
import Paragraph from '../../../typography/Paragraph';
import { UnorderedList } from '../../../typography/UnorderedList';
import ComboboxField from './Combobox';
import type { ComboboxOption } from './shared';

const sampleOptions: ComboboxOption[] = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
  { value: 'option4', label: 'Option 4' },
];

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
  { value: 'jp', label: 'Japan' },
  { value: 'br', label: 'Brazil' },
  { value: 'mx', label: 'Mexico' },
  { value: 'in', label: 'India' },
];

const meta: Meta<typeof ComboboxField> = {
  title: 'Systems/Form/Fields/ComboboxField',
  component: ComboboxField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    'options': {
      control: false,
      description: 'Array of options to display in the combobox',
      table: {
        type: { summary: 'ComboboxOption[]' },
      },
    },
    'placeholder': {
      control: 'text',
      description: 'Placeholder text for the trigger button',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'Select items...' },
      },
    },
    'searchPlaceholder': {
      control: 'text',
      description: 'Placeholder text for the search input',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'Search...' },
      },
    },
    'emptyMessage': {
      control: 'text',
      description: 'Message shown when no items match the search',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'No items found.' },
      },
    },
    'optionFromSearch': {
      control: false,
      description:
        'An option that depends on the text typed into the search box, such as a value that can be entered but is too many to list. Return undefined when the text offers nothing.',
      table: {
        type: { summary: '(search: string) => ComboboxOption | undefined' },
      },
    },
    'single': {
      control: 'boolean',
      description:
        'Choose one option instead of several. Choosing an option replaces the choice and closes the list; the value is a list holding at most one value.',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'showSearch': {
      control: 'boolean',
      description: 'Toggle search input visibility',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    'showSelectAll': {
      control: 'boolean',
      description: 'Show "Select All" action',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    'showDeselectAll': {
      control: 'boolean',
      description: 'Show "Deselect All" action',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    'singular': {
      control: 'text',
      description:
        'Singular label for count display (e.g., "1 Participant selected")',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'item' },
      },
    },
    'plural': {
      control: 'text',
      description:
        'Plural label for count display (e.g., "3 Participants selected")',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'items' },
      },
    },
    'disabled': {
      control: 'boolean',
      description: 'Whether the combobox is disabled',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'readOnly': {
      control: 'boolean',
      description: 'Whether the combobox is read-only',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'aria-invalid': {
      control: 'boolean',
      description: 'Whether the combobox has invalid state styling',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'size': {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
      description: 'Size of the combobox field',
      table: {
        type: { summary: 'sm | md | lg | xl' },
        defaultValue: { summary: 'md' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => {
    const [value, setValue] = useState<(string | number)[]>([]);

    return (
      <div className="flex flex-col gap-8">
        <div className="space-y-2">
          <Heading level="h3" margin="none" className="text-lg">
            Multi-Select Combobox
          </Heading>
          <Paragraph margin="none" className="text-sm opacity-70">
            A searchable multi-select dropdown with bulk actions
          </Paragraph>
          <UnorderedList className="mb-2 list-inside space-y-1 text-xs opacity-70">
            <li>Search/filter items</li>
            <li>Select All / Deselect All actions</li>
            <li>Check indicators for selected items</li>
            <li>Count display in trigger</li>
            <li>Keyboard navigation</li>
          </UnorderedList>
          <div className="w-80">
            <ComboboxField
              aria-label="Overview"
              name="overview"
              options={sampleOptions}
              placeholder="Select options..."
              value={value}
              onChange={(v) => setValue(v ?? [])}
            />
          </div>
          <Paragraph margin="none" className="text-xs opacity-70">
            Selected: {value.length === 0 ? 'none' : value.join(', ')}
          </Paragraph>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'The ComboboxField is a multi-select dropdown with search, bulk actions, and keyboard navigation. Built on Base-UI Combobox.',
      },
    },
  },
};

export const Sizes: Story = {
  name: 'Sizes: All Variants',
  render: () => {
    const [smValue, setSmValue] = useState<(string | number)[]>(['option1']);
    const [mdValue, setMdValue] = useState<(string | number)[]>([
      'option1',
      'option2',
    ]);
    const [lgValue, setLgValue] = useState<(string | number)[]>([
      'option1',
      'option2',
      'option3',
    ]);
    const [xlValue, setXlValue] = useState<(string | number)[]>([]);

    return (
      <div className="flex flex-col gap-6">
        <Heading level="h3" margin="none" className="text-lg">
          Combobox Sizes
        </Heading>
        <div className="flex w-full flex-col gap-4">
          <div>
            <Paragraph
              margin="none"
              className="mb-1 text-xs font-medium opacity-70"
            >
              Small (sm)
            </Paragraph>
            <ComboboxField
              aria-label="Size sm"
              name="size-sm"
              size="sm"
              options={sampleOptions}
              placeholder="Small combobox"
              value={smValue}
              onChange={(v) => setSmValue(v ?? [])}
            />
          </div>
          <div>
            <Paragraph
              margin="none"
              className="mb-1 text-xs font-medium opacity-70"
            >
              Medium (md) - default
            </Paragraph>
            <ComboboxField
              aria-label="Size md"
              name="size-md"
              size="md"
              options={sampleOptions}
              placeholder="Medium combobox"
              value={mdValue}
              onChange={(v) => setMdValue(v ?? [])}
            />
          </div>
          <div>
            <Paragraph
              margin="none"
              className="mb-1 text-xs font-medium opacity-70"
            >
              Large (lg)
            </Paragraph>
            <ComboboxField
              aria-label="Size lg"
              name="size-lg"
              size="lg"
              options={sampleOptions}
              placeholder="Large combobox"
              value={lgValue}
              onChange={(v) => setLgValue(v ?? [])}
            />
          </div>
          <div>
            <Paragraph
              margin="none"
              className="mb-1 text-xs font-medium opacity-70"
            >
              Extra Large (xl)
            </Paragraph>
            <ComboboxField
              aria-label="Size xl"
              name="size-xl"
              size="xl"
              options={sampleOptions}
              placeholder="Extra large combobox"
              value={xlValue}
              onChange={(v) => setXlValue(v ?? [])}
            />
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'All available sizes (sm, md, lg, xl). Medium is the default size.',
      },
    },
  },
};

export const States: Story = {
  name: 'States: All Variants',
  render: () => (
    <div className="flex flex-col gap-6">
      <Heading level="h3" margin="none" className="text-lg">
        Combobox States
      </Heading>
      <div className="flex w-full flex-col gap-4">
        <div>
          <Paragraph
            margin="none"
            className="mb-1 text-xs font-medium opacity-70"
          >
            Normal
          </Paragraph>
          <ComboboxField
            aria-label="State normal"
            name="state-normal"
            options={sampleOptions}
            placeholder="Normal state"
            value={[]}
            onChange={() => {
              // no-op
            }}
          />
        </div>
        <div>
          <Paragraph
            margin="none"
            className="mb-1 text-xs font-medium opacity-70"
          >
            With Selection
          </Paragraph>
          <ComboboxField
            aria-label="State selected"
            name="state-selected"
            options={sampleOptions}
            placeholder="With selection"
            value={['option1', 'option2']}
            onChange={() => {
              // no-op
            }}
          />
        </div>
        <div>
          <Paragraph
            margin="none"
            className="mb-1 text-xs font-medium opacity-70"
          >
            Disabled
          </Paragraph>
          <ComboboxField
            aria-label="State disabled"
            name="state-disabled"
            options={sampleOptions}
            disabled
            value={['option2']}
            onChange={() => {
              // no-op
            }}
          />
        </div>
        <div>
          <Paragraph
            margin="none"
            className="mb-1 text-xs font-medium opacity-70"
          >
            Read Only
          </Paragraph>
          <ComboboxField
            aria-label="State readonly"
            name="state-readonly"
            options={sampleOptions}
            readOnly
            value={['option1', 'option3']}
            onChange={() => {
              // no-op
            }}
          />
        </div>
        <div>
          <Paragraph
            margin="none"
            className="mb-1 text-xs font-medium opacity-70"
          >
            Invalid
          </Paragraph>
          <ComboboxField
            aria-label="State invalid"
            name="state-invalid"
            options={sampleOptions}
            aria-invalid
            value={['option2']}
            onChange={() => {
              // no-op
            }}
          />
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'All available states. State priority: disabled > readOnly > invalid > normal',
      },
    },
  },
};

export const WithSearch: Story = {
  render: () => {
    const [value, setValue] = useState<(string | number)[]>([]);

    return (
      <div className="flex flex-col gap-8">
        <div className="space-y-3">
          <Heading level="h3" margin="none" className="text-lg">
            Search Filtering
          </Heading>
          <Paragraph margin="none" className="text-sm opacity-70">
            Type to filter the list of options
          </Paragraph>
          <div className="w-80">
            <ComboboxField
              aria-label="With search"
              name="with-search"
              options={countryOptions}
              placeholder="Search countries..."
              searchPlaceholder="Type to filter..."
              emptyMessage="No countries found."
              value={value}
              onChange={(v) => setValue(v ?? [])}
            />
          </div>
          <Paragraph margin="none" className="text-xs opacity-70">
            Selected: {value.length === 0 ? 'none' : value.join(', ')}
          </Paragraph>
        </div>
        <div className="space-y-3">
          <Heading level="h3" margin="none" className="text-lg">
            Without Search
          </Heading>
          <Paragraph margin="none" className="text-sm opacity-70">
            Search can be disabled for shorter lists
          </Paragraph>
          <div className="w-80">
            <ComboboxField
              aria-label="Without search"
              name="without-search"
              options={sampleOptions}
              placeholder="Select options..."
              showSearch={false}
              value={[]}
              onChange={() => {
                // no-op
              }}
            />
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'The search input filters options as you type. Can be disabled with showSearch={false}.',
      },
    },
  },
};

export const WithSelectAll: Story = {
  name: 'Bulk Actions',
  render: () => {
    const [withActions, setWithActions] = useState<(string | number)[]>([]);
    const [withoutActions, setWithoutActions] = useState<(string | number)[]>(
      [],
    );

    return (
      <div className="flex flex-col gap-8">
        <div className="space-y-3">
          <Heading level="h3" margin="none" className="text-lg">
            With Bulk Actions (Default)
          </Heading>
          <Paragraph margin="none" className="text-sm opacity-70">
            Select All and Deselect All buttons
          </Paragraph>
          <div className="w-80">
            <ComboboxField
              aria-label="With bulk actions"
              name="with-bulk-actions"
              options={participantOptions}
              placeholder="Select participants..."
              singular="Participant"
              plural="Participants"
              value={withActions}
              onChange={(v) => setWithActions(v ?? [])}
            />
          </div>
          <Paragraph margin="none" className="text-xs opacity-70">
            Selected: {withActions.length} / {participantOptions.length}
          </Paragraph>
        </div>
        <div className="space-y-3">
          <Heading level="h3" margin="none" className="text-lg">
            Without Bulk Actions
          </Heading>
          <Paragraph margin="none" className="text-sm opacity-70">
            Can be disabled with showSelectAll/showDeselectAll props
          </Paragraph>
          <div className="w-80">
            <ComboboxField
              aria-label="Without bulk actions"
              name="without-bulk-actions"
              options={participantOptions}
              placeholder="Select participants..."
              showSelectAll={false}
              showDeselectAll={false}
              value={withoutActions}
              onChange={(v) => setWithoutActions(v ?? [])}
            />
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Bulk selection actions (Select All / Deselect All) can be toggled independently.',
      },
    },
  },
};

export const LongOptionList: Story = {
  render: () => {
    const [value, setValue] = useState<(string | number)[]>([]);

    const longOptions: ComboboxOption[] = Array.from(
      { length: 30 },
      (_, i) => ({
        value: `item-${i + 1}`,
        label: `Item ${i + 1} - A longer description here`,
      }),
    );

    return (
      <div className="flex flex-col gap-4">
        <Heading level="h3" margin="none" className="text-lg">
          Long List with Scroll
        </Heading>
        <Paragraph margin="none" className="text-sm opacity-70">
          Lists with many items show a scrollable dropdown with max height
        </Paragraph>
        <div className="w-96">
          <ComboboxField
            aria-label="Long list"
            name="long-list"
            options={longOptions}
            placeholder="Select items..."
            value={value}
            onChange={(v) => setValue(v ?? [])}
          />
        </div>
        <Paragraph margin="none" className="text-xs opacity-70">
          Selected: {value.length} items
        </Paragraph>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'The dropdown shows a max height with scrolling for long lists.',
      },
    },
  },
};

export const UsageExamples: Story = {
  render: () => {
    const [selectedParticipants, setSelectedParticipants] = useState<
      (string | number)[]
    >(participantOptions.map((p) => p.value));
    const [selectedCountries, setSelectedCountries] = useState<
      (string | number)[]
    >(['us', 'uk']);

    return (
      <div className="flex flex-col gap-8">
        <div className="space-y-3">
          <Heading level="h3" margin="none" className="text-lg">
            Participant Selector
          </Heading>
          <Paragraph margin="none" className="text-sm opacity-70">
            Typical usage for selecting participants (default all selected)
          </Paragraph>
          <div className="w-80">
            <ComboboxField
              aria-label="Participants"
              name="participants"
              options={participantOptions}
              placeholder="Select Participants..."
              singular="Participant"
              plural="Participants"
              value={selectedParticipants}
              onChange={(v) => setSelectedParticipants(v ?? [])}
            />
          </div>
          <Paragraph margin="none" className="text-xs opacity-70">
            {selectedParticipants.length === participantOptions.length
              ? 'All participants selected'
              : `${selectedParticipants.length} of ${participantOptions.length} participants selected`}
          </Paragraph>
        </div>

        <div className="space-y-3">
          <Heading level="h3" margin="none" className="text-lg">
            Country Multi-Select
          </Heading>
          <Paragraph margin="none" className="text-sm opacity-70">
            Filter by multiple countries with search
          </Paragraph>
          <div className="w-80">
            <ComboboxField
              aria-label="Countries"
              name="countries"
              options={countryOptions}
              placeholder="Select Countries..."
              searchPlaceholder="Search countries..."
              singular="Country"
              plural="Countries"
              value={selectedCountries}
              onChange={(v) => setSelectedCountries(v ?? [])}
            />
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Real-world usage examples showing participant selection and country filtering.',
      },
    },
  },
};

export const DisabledOptions: Story = {
  render: () => {
    const [value, setValue] = useState<(string | number)[]>(['option1']);

    const optionsWithDisabled: ComboboxOption[] = [
      { value: 'option1', label: 'Available Option 1' },
      { value: 'option2', label: 'Disabled Option 2', disabled: true },
      { value: 'option3', label: 'Available Option 3' },
      { value: 'option4', label: 'Disabled Option 4', disabled: true },
      { value: 'option5', label: 'Available Option 5' },
    ];

    return (
      <div className="flex flex-col gap-4">
        <Heading level="h3" margin="none" className="text-lg">
          Disabled Options
        </Heading>
        <Paragraph margin="none" className="text-sm opacity-70">
          Individual options can be disabled
        </Paragraph>
        <div className="w-80">
          <ComboboxField
            aria-label="Disabled options"
            name="disabled-options"
            options={optionsWithDisabled}
            placeholder="Select options..."
            value={value}
            onChange={(v) => setValue(v ?? [])}
          />
        </div>
        <Paragraph margin="none" className="text-xs opacity-70">
          Note: Select All only selects enabled options
        </Paragraph>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Individual options can be disabled. Select All respects disabled state.',
      },
    },
  },
};

/**
 * Opened from inside a Popover, as Interviewer's data view filters by protocol,
 * the list paints over the rest of the Popover rather than behind it.
 */
export const InsidePopover: Story = {
  render: function InsidePopoverStory() {
    const [value, setValue] = useState<(string | number)[]>([]);

    return (
      <Popover defaultOpen>
        <PopoverTrigger render={<Button>Open filters</Button>} />
        <PopoverContent aria-label="Filters" className="w-md">
          <div className="flex flex-col gap-4">
            <ComboboxField
              aria-label="Inside popover"
              name="inside-popover"
              options={sampleOptions}
              placeholder="Select options..."
              value={value}
              onChange={(v) => setValue(v ?? [])}
            />
            <div className="bg-surface-2 h-64 rounded p-4">
              <Paragraph margin="none">Other filters</Paragraph>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
  play: async () => {
    const trigger = await screen.findByRole('combobox');
    await userEvent.click(trigger);
    const option = await screen.findByRole('option', { name: 'Option 4' });

    await waitFor(() => {
      const box = option.getBoundingClientRect();
      expect(box.height).toBeGreaterThan(0);
      const painted = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      expect(painted !== null && option.contains(painted)).toBe(true);
    });

    await userEvent.click(option);
    await waitFor(() => expect(trigger).toHaveTextContent('1 item selected'));
  },
};

const localizedOptions: ComboboxOption[] = [
  { value: 'ar', label: { text: 'العربية', lang: 'ar', dir: 'rtl' } },
  { value: 'fa', label: { text: 'فارسی', lang: 'fa', dir: 'rtl' } },
  { value: 'es', label: { text: 'Español', lang: 'es', dir: 'ltr' } },
  { value: 'en', label: 'English' },
];

/**
 * Protocol copy arrives as `PresentationalText`: each listed option carries
 * the text's own `lang` and `dir`, so Arabic and Persian options lay out
 * right-to-left inside a left-to-right page. Search filters on the bare text.
 */
export const LocalizedOptions: Story = {
  render: () => {
    const [value, setValue] = useState<(string | number)[]>([]);

    return (
      <div className="w-80">
        <ComboboxField
          name="localized"
          aria-label="Languages spoken"
          options={localizedOptions}
          searchPlaceholder="Type to filter..."
          value={value}
          onChange={(v) => setValue(v ?? [])}
        />
      </div>
    );
  },
  play: async () => {
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Languages spoken' }),
    );

    const arabic = await screen.findByRole('option', { name: 'العربية' });
    await expect(arabic).toHaveAttribute('lang', 'ar');
    await expect(getComputedStyle(arabic).direction).toBe('rtl');
    await expect(
      screen.getByRole('option', { name: 'English' }),
    ).not.toHaveAttribute('lang');

    await userEvent.type(
      screen.getByPlaceholderText('Type to filter...'),
      'فار',
    );
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'العربية' })).toBeNull(),
    );
    await expect(screen.getByRole('option', { name: 'فارسی' })).toHaveAttribute(
      'dir',
      'rtl',
    );
  },
};

const topicOptions: ComboboxOption[] = [
  { value: 'diet', label: 'Diet' },
  { value: 'exercise', label: 'Exercise' },
  { value: 'sleep', label: 'Sleep' },
];

/**
 * `optionFromSearch` offers an option made from what was typed, after the
 * options that match it: here any word can be added as a topic. It is not
 * offered when the word is already a listed topic, and once chosen it stays
 * chosen after the search is cleared.
 */
export const OptionFromSearch: Story = {
  render: function OptionFromSearchStory() {
    const [value, setValue] = useState<(string | number)[]>([]);

    return (
      <div className="w-80">
        <ComboboxField
          name="topics"
          aria-label="Topics"
          options={topicOptions}
          searchPlaceholder="Search or type a new topic"
          optionFromSearch={(search) =>
            topicOptions.some((option) => option.value === search.toLowerCase())
              ? undefined
              : { value: search.toLowerCase(), label: `Add “${search}”` }
          }
          showSelectAll={false}
          value={value}
          onChange={(v) => setValue(v ?? [])}
        />
      </div>
    );
  },
  play: async () => {
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Topics' }),
    );
    const search = await screen.findByPlaceholderText(
      'Search or type a new topic',
    );

    await userEvent.type(search, 'sle');
    const matching = await screen.findAllByRole('option');
    await expect(matching.map((option) => option.textContent)).toEqual([
      'Sleep',
      'Add “sle”',
    ]);

    await userEvent.clear(search);
    await userEvent.type(search, 'sleep');
    await expect(
      (await screen.findAllByRole('option')).map(
        (option) => option.textContent,
      ),
    ).toEqual(['Sleep']);

    await userEvent.clear(search);
    await userEvent.type(search, 'reading');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Add “reading”' }),
    );
    await userEvent.clear(search);
    await userEvent.keyboard('{Escape}');

    await expect(
      screen.getByRole('combobox', { name: 'Topics' }),
    ).toHaveTextContent('1 item selected');
  },
};

/**
 * With `single`, the field chooses one option: choosing another replaces the
 * choice and closes the list. `optionFromSearch` works the same way.
 */
export const SingleChoice: Story = {
  render: function SingleChoiceStory() {
    const [value, setValue] = useState<(string | number)[]>([]);

    return (
      <div className="w-80">
        <ComboboxField
          name="single-topic"
          aria-label="Main topic"
          single
          options={topicOptions}
          optionFromSearch={(search) => ({
            value: search.toLowerCase(),
            label: `Add “${search}”`,
          })}
          renderValue={(selected) =>
            selected.map((option) => presentationalTextValue(option.label))
          }
          searchPlaceholder="Search or type a new topic"
          value={value}
          onChange={(v) => setValue(v ?? [])}
        />
      </div>
    );
  },
  play: async () => {
    const trigger = await screen.findByRole('combobox', {
      name: 'Main topic',
    });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: 'Diet' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await expect(trigger).toHaveTextContent('Diet');

    await userEvent.click(trigger);
    await userEvent.type(
      await screen.findByPlaceholderText('Search or type a new topic'),
      'reading',
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'Add “reading”' }),
    );
    await waitFor(() => expect(trigger).toHaveTextContent('Add “reading”'));
  },
};

const languageOptions: ComboboxOption[] = [
  { value: 'bs', label: 'Bosnian' },
  { value: 'pt-BR', label: 'Brazilian Portuguese' },
  { value: 'br', label: 'Breton' },
  { value: 'en-GB', label: 'British English' },
  { value: 'bg', label: 'Bulgarian' },
  { value: 'my', label: 'Burmese' },
  { value: 'ca', label: 'Catalan' },
  { value: 'zh-Hans', label: 'Chinese (Simplified)' },
  { value: 'zh-Hant', label: 'Chinese (Traditional)' },
  { value: 'hr', label: 'Croatian' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
];

/**
 * `renderValue` can list the whole selection, which is far longer than the
 * field. The trigger stays inside its container and truncates the text instead
 * of widening to fit it, and the chevron stays visible at the end.
 */
export const LongSelection: Story = {
  render: function LongSelectionStory() {
    const [value, setValue] = useState<(string | number)[]>(
      languageOptions.map((option) => option.value),
    );

    return (
      <div className="w-80" data-testid="long-selection-container">
        <ComboboxField
          name="long-selection"
          aria-label="Protocol languages"
          options={languageOptions}
          renderValue={(selectedOptions) =>
            selectedOptions
              .map((option) => presentationalTextValue(option.label))
              .join(', ')
          }
          value={value}
          onChange={(v) => setValue(v ?? [])}
        />
      </div>
    );
  },
  play: async () => {
    const trigger = await screen.findByRole('combobox', {
      name: 'Protocol languages',
    });
    const container = screen.getByTestId('long-selection-container');
    await expect(trigger).toHaveTextContent('Bosnian, Brazilian Portuguese');

    const chevron = trigger.querySelector('svg');
    await expect(chevron).toBeInTheDocument();

    await waitFor(() => {
      const triggerBox = trigger.getBoundingClientRect();
      expect(triggerBox.width).toBeLessThanOrEqual(
        container.getBoundingClientRect().width,
      );
      expect(chevron?.getBoundingClientRect().right).toBeLessThanOrEqual(
        triggerBox.right,
      );
    });
  },
};
