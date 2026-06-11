import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import Paragraph from '../../typography/Paragraph';
import RichSelectGroupField, {
  type RichSelectOption,
  type RichSelectSpacer,
} from './RichSelectGroup';

const meta: Meta<typeof RichSelectGroupField> = {
  title: 'Systems/Form/Fields/RichSelectGroup',
  component: RichSelectGroupField,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    'disabled': { control: 'boolean' },
    'readOnly': { control: 'boolean' },
    'aria-invalid': { control: 'boolean' },
    'multiple': { control: 'boolean' },
    'size': {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
    },
    'orientation': {
      control: 'select',
      options: ['vertical', 'horizontal'],
    },
    'useColumns': { control: 'boolean' },
  },
  args: {
    disabled: false,
    readOnly: false,
    multiple: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const basicOptions: RichSelectOption[] = [
  {
    value: 'option-a',
    label: 'Option A',
    description: 'This is the first option with a brief description.',
  },
  {
    value: 'option-b',
    label: 'Option B',
    description: 'This is the second option with a different description.',
  },
  {
    value: 'option-c',
    label: 'Option C',
    description: 'This is the third option with yet another description.',
  },
];

const markdownOptions: RichSelectOption[] = [
  {
    value: 'public',
    label: '**Public** Network',
    description:
      'Anyone can view and join this network. *Recommended for open research.*',
  },
  {
    value: 'private',
    label: '**Private** Network',
    description:
      'Only invited participants can access this network. Use for *sensitive data*.',
  },
  {
    value: 'restricted',
    label: '**Restricted** Access',
    description:
      'Participants need **approval** before joining. Good for *controlled studies*.',
  },
];

export const Default: Story = {
  render: function Render() {
    const [value, setValue] = useState<
      string | number | (string | number)[] | undefined
    >(undefined);

    return (
      <div className="w-full max-w-lg">
        <RichSelectGroupField
          options={basicOptions}
          value={value}
          onChange={setValue}
          aria-label="Select an option"
        />
      </div>
    );
  },
};

export const MultiSelect: Story = {
  render: function Render() {
    const [value, setValue] = useState<
      string | number | (string | number)[] | undefined
    >([]);

    return (
      <div className="w-full max-w-lg">
        <RichSelectGroupField
          options={basicOptions}
          value={value}
          onChange={setValue}
          multiple
          aria-label="Select options"
        />
      </div>
    );
  },
};

export const WithMarkdown: Story = {
  render: function Render() {
    const [value, setValue] = useState<
      string | number | (string | number)[] | undefined
    >(undefined);

    return (
      <div className="w-full max-w-lg">
        <RichSelectGroupField
          options={markdownOptions}
          value={value}
          onChange={setValue}
          aria-label="Select network type"
        />
      </div>
    );
  },
};

export const WithPreselected: Story = {
  render: function Render() {
    const [value, setValue] = useState<
      string | number | (string | number)[] | undefined
    >('option-b');

    return (
      <div className="w-full max-w-lg">
        <RichSelectGroupField
          options={basicOptions}
          value={value}
          onChange={setValue}
          aria-label="Select an option"
        />
      </div>
    );
  },
};

export const Horizontal: Story = {
  render: function Render() {
    const [value, setValue] = useState<
      string | number | (string | number)[] | undefined
    >(undefined);

    return (
      <div className="w-full max-w-3xl">
        <RichSelectGroupField
          options={basicOptions}
          value={value}
          onChange={setValue}
          orientation="horizontal"
          aria-label="Select an option"
        />
      </div>
    );
  },
};

export const WithColumns: Story = {
  render: function Render() {
    const manyOptions: RichSelectOption[] = Array.from(
      { length: 6 },
      (_, i) => ({
        value: `option-${i + 1}`,
        label: `Option ${i + 1}`,
        description: `Description for option ${i + 1} with some detail.`,
      }),
    );

    const [value, setValue] = useState<
      string | number | (string | number)[] | undefined
    >(undefined);

    return (
      <div className="w-full">
        <RichSelectGroupField
          options={manyOptions}
          value={value}
          onChange={setValue}
          useColumns
          aria-label="Select an option"
        />
      </div>
    );
  },
};

export const Sizes: Story = {
  render: function Render() {
    const [smValue, setSmValue] = useState<
      string | number | (string | number)[] | undefined
    >('option-a');
    const [mdValue, setMdValue] = useState<
      string | number | (string | number)[] | undefined
    >('option-b');
    const [lgValue, setLgValue] = useState<
      string | number | (string | number)[] | undefined
    >('option-c');
    const [xlValue, setXlValue] = useState<
      string | number | (string | number)[] | undefined
    >('option-a');

    return (
      <div className="flex w-full flex-col gap-8">
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            Small (sm)
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            value={smValue}
            onChange={setSmValue}
            size="sm"
            aria-label="Small size"
          />
        </div>
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            Medium (md) - Default
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            value={mdValue}
            onChange={setMdValue}
            size="md"
            aria-label="Medium size"
          />
        </div>
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            Large (lg)
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            value={lgValue}
            onChange={setLgValue}
            size="lg"
            aria-label="Large size"
          />
        </div>
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            Extra Large (xl)
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            value={xlValue}
            onChange={setXlValue}
            size="xl"
            aria-label="Extra large size"
          />
        </div>
      </div>
    );
  },
};

export const AllStates: Story = {
  render: function Render() {
    return (
      <div className="flex w-full max-w-lg flex-col gap-8">
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            Normal:
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            defaultValue="option-a"
            aria-label="Normal state"
          />
        </div>
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            ReadOnly with selection:
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            defaultValue="option-a"
            readOnly
            aria-label="ReadOnly state"
          />
        </div>
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            ReadOnly with no selection:
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            readOnly
            aria-label="ReadOnly no selection"
          />
        </div>
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            Disabled with selection:
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            defaultValue="option-a"
            disabled
            aria-label="Disabled state"
          />
        </div>
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            Disabled with no selection:
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            disabled
            aria-label="Disabled no selection"
          />
        </div>
        <div>
          <Paragraph margin="none" className="mb-2 text-sm font-medium">
            Invalid:
          </Paragraph>
          <RichSelectGroupField
            options={basicOptions}
            defaultValue="option-a"
            aria-invalid
            aria-label="Invalid state"
          />
        </div>
      </div>
    );
  },
};

export const WithSpacer: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Insert `{ type: "spacer" }` entries in `options` to visually separate groups of options. Spacers are skipped by keyboard navigation and hidden from assistive technology. Pass `className` on the spacer to restyle the divider.',
      },
    },
  },
  render: function Render() {
    const [value, setValue] = useState<
      string | number | (string | number)[] | undefined
    >(undefined);

    const options: (RichSelectOption | RichSelectSpacer)[] = [
      {
        value: 'biometric',
        label: 'Biometric authentication',
        description: 'Use a fingerprint or face scan to unlock.',
      },
      {
        value: 'pin',
        label: 'PIN code',
        description: 'An 8-digit numeric PIN.',
      },
      { type: 'spacer' },
      {
        value: 'none',
        label: 'No lock (not recommended)',
        description: 'Skip app security entirely.',
      },
    ];

    return (
      <div className="w-full max-w-lg">
        <RichSelectGroupField
          options={options}
          value={value}
          onChange={setValue}
          aria-label="Select a security method"
        />
      </div>
    );
  },
};

export const WithCustomOptionClassNames: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Each option accepts a `className`, merged into the option card. Useful for highlighting a destructive or discouraged choice.',
      },
    },
  },
  render: function Render() {
    const [value, setValue] = useState<
      string | number | (string | number)[] | undefined
    >(undefined);

    const options: (RichSelectOption | RichSelectSpacer)[] = [
      {
        value: 'pin',
        label: 'PIN code',
        description: 'An 8-digit numeric PIN.',
      },
      {
        value: 'passphrase',
        label: 'Passphrase',
        description: 'A password of at least 12 characters.',
      },
      { type: 'spacer', className: 'border-destructive/40 border-dashed' },
      {
        value: 'none',
        label: 'No lock (not recommended)',
        description: 'Skip app security. Your data will not be protected.',
        className: 'border-destructive/40 text-destructive',
      },
    ];

    return (
      <div className="w-full max-w-lg">
        <RichSelectGroupField
          options={options}
          value={value}
          onChange={setValue}
          aria-label="Select a security method"
        />
      </div>
    );
  },
};

export const DisabledOptions: Story = {
  render: function Render() {
    const [value, setValue] = useState<
      string | number | (string | number)[] | undefined
    >(undefined);

    return (
      <div className="w-full max-w-lg">
        <RichSelectGroupField
          options={[
            {
              value: 'enabled-1',
              label: 'Enabled Option',
              description: 'This option can be selected.',
            },
            {
              value: 'disabled-1',
              label: 'Disabled Option',
              description: 'This option is not available.',
              disabled: true,
            },
            {
              value: 'enabled-2',
              label: 'Another Enabled Option',
              description: 'This option can also be selected.',
            },
          ]}
          value={value}
          onChange={setValue}
          aria-label="Mixed disabled options"
        />
      </div>
    );
  },
};
