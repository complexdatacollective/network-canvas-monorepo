import type { Meta, StoryObj } from '@storybook/react-vite';
import { LayoutGroup } from 'motion/react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import Heading from '../../typography/Heading';
import ToggleField from './ToggleField';

const meta: Meta<typeof ToggleField> = {
  title: 'Systems/Form/Fields/ToggleField',
  component: ToggleField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    'value': {
      control: 'boolean',
      description: 'Whether the toggle is checked',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'disabled': {
      control: 'boolean',
      description: 'Whether the toggle is disabled',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'readOnly': {
      control: 'boolean',
      description: 'Whether the toggle is read-only',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    'aria-invalid': {
      control: 'radio',
      options: [undefined, true, false],
      description: 'Indicates the field has a validation error',
      table: {
        type: { summary: "'true' | 'false' | boolean" },
        defaultValue: { summary: 'undefined' },
      },
    },
    'size': {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
      description: 'Size variant of the toggle',
      table: {
        type: { summary: "'sm' | 'md' | 'lg' | 'xl'" },
        defaultValue: { summary: 'md' },
      },
    },
    'onChange': {
      action: 'onChange',
      description: 'Callback when toggle state changes',
      table: {
        type: { summary: '(value: boolean) => void' },
      },
    },
  },
  args: {
    value: false,
    disabled: false,
    readOnly: false,
    size: 'md',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState(false);

    return (
      <div className="w-full max-w-md">
        <ToggleField
          value={value}
          onChange={(v) => setValue(v ?? false)}
          aria-label="Enable Option"
        />
      </div>
    );
  },
};

export const SizeVariants: Story = {
  render: () => {
    const [values, setValues] = useState({
      sm: false,
      md: true,
      lg: false,
      xl: true,
    });

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <span className="w-12 text-sm text-current opacity-70">sm</span>
          <ToggleField
            size="sm"
            value={values.sm}
            onChange={(v) => setValues((prev) => ({ ...prev, sm: v ?? false }))}
            aria-label="Small toggle"
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-12 text-sm text-current opacity-70">md</span>
          <ToggleField
            size="md"
            value={values.md}
            onChange={(v) => setValues((prev) => ({ ...prev, md: v ?? false }))}
            aria-label="Medium toggle"
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-12 text-sm text-current opacity-70">lg</span>
          <ToggleField
            size="lg"
            value={values.lg}
            onChange={(v) => setValues((prev) => ({ ...prev, lg: v ?? false }))}
            aria-label="Large toggle"
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-12 text-sm text-current opacity-70">xl</span>
          <ToggleField
            size="xl"
            value={values.xl}
            onChange={(v) => setValues((prev) => ({ ...prev, xl: v ?? false }))}
            aria-label="Extra large toggle"
          />
        </div>
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="w-24 text-sm text-current opacity-70">
          Disabled Off
        </span>
        <ToggleField disabled value={false} aria-label="Disabled toggle off" />
      </div>
      <div className="flex items-center gap-4">
        <span className="w-24 text-sm text-current opacity-70">
          Disabled On
        </span>
        <ToggleField disabled value={true} aria-label="Disabled toggle on" />
      </div>
    </div>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="w-28 text-sm text-current opacity-70">
          Read-only Off
        </span>
        <ToggleField readOnly value={false} aria-label="Read-only toggle off" />
      </div>
      <div className="flex items-center gap-4">
        <span className="w-28 text-sm text-current opacity-70">
          Read-only On
        </span>
        <ToggleField readOnly value={true} aria-label="Read-only toggle on" />
      </div>
    </div>
  ),
};

export const Invalid: Story = {
  name: 'Invalid State',
  render: () => {
    const [offValue, setOffValue] = useState(false);
    const [onValue, setOnValue] = useState(true);

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <span className="w-24 text-sm text-current opacity-70">
            Invalid Off
          </span>
          <ToggleField
            value={offValue}
            onChange={(v) => setOffValue(v ?? false)}
            aria-label="Invalid toggle off"
            aria-invalid={true}
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-24 text-sm text-current opacity-70">
            Invalid On
          </span>
          <ToggleField
            value={onValue}
            onChange={(v) => setOnValue(v ?? false)}
            aria-label="Invalid toggle on"
            aria-invalid={true}
          />
        </div>
      </div>
    );
  },
};

/**
 * A `LayoutGroup` wraps the content of every Dialog opened without a
 * `layoutId`, so toggles routinely render inside one. A group re-snapshots
 * every member whenever any member updates, which used to make each toggle
 * replay its thumb animation whenever nearby content reflowed. The thumb keeps
 * its own group so only the toggle the participant actually operated animates.
 */
export const IsolatedFromEnclosingLayoutGroup: Story = {
  name: 'Isolated From Enclosing Layout Group',
  render: () => {
    const [expanded, setExpanded] = useState(false);
    const [neighbour, setNeighbour] = useState(false);

    return (
      <LayoutGroup>
        <div className="flex w-full max-w-md flex-col gap-4">
          <div className="flex flex-col gap-4">
            <ToggleField
              value={expanded}
              onChange={(v) => setExpanded(v ?? false)}
              aria-label="Expanding toggle"
            />
            {expanded && <div className="h-30 rounded bg-current opacity-10" />}
          </div>
          <ToggleField
            value={neighbour}
            onChange={(v) => setNeighbour(v ?? false)}
            aria-label="Neighbour toggle"
          />
        </div>
      </LayoutGroup>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const neighbour = canvas.getByRole('switch', { name: 'Neighbour toggle' });
    const thumb = neighbour.firstElementChild;

    await expect(thumb).not.toBeNull();

    const thumbOffset = () =>
      thumb!.getBoundingClientRect().top -
      neighbour.getBoundingClientRect().top;

    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(resolve));

    await userEvent.click(
      canvas.getByRole('switch', { name: 'Expanding toggle' }),
    );

    const samples: number[] = [];
    for (let frame = 0; frame < 8; frame++) {
      await nextFrame();
      samples.push(thumbOffset());
    }

    for (const sample of samples) {
      await expect(sample).toBeCloseTo(samples[0]!, 1);
    }
  },
};

export const AllStates: Story = {
  render: () => {
    const [normalOff, setNormalOff] = useState(false);
    const [normalOn, setNormalOn] = useState(true);
    const [invalidOff, setInvalidOff] = useState(false);
    const [invalidOn, setInvalidOn] = useState(true);

    return (
      <div className="flex flex-col gap-8">
        <div>
          <Heading level="h3" margin="none" className="mb-4 text-sm">
            Normal
          </Heading>
          <div className="flex gap-4">
            <ToggleField
              value={normalOff}
              onChange={(v) => setNormalOff(v ?? false)}
              aria-label="Normal toggle off"
            />
            <ToggleField
              value={normalOn}
              onChange={(v) => setNormalOn(v ?? false)}
              aria-label="Normal toggle on"
            />
          </div>
        </div>

        <div>
          <Heading level="h3" margin="none" className="mb-4 text-sm">
            Disabled
          </Heading>
          <div className="flex gap-4">
            <ToggleField
              disabled
              value={false}
              aria-label="Disabled toggle off"
            />
            <ToggleField
              disabled
              value={true}
              aria-label="Disabled toggle on"
            />
          </div>
        </div>

        <div>
          <Heading level="h3" margin="none" className="mb-4 text-sm">
            Read-only
          </Heading>
          <div className="flex gap-4">
            <ToggleField
              readOnly
              value={false}
              aria-label="Read-only toggle off"
            />
            <ToggleField
              readOnly
              value={true}
              aria-label="Read-only toggle on"
            />
          </div>
        </div>

        <div>
          <Heading level="h3" margin="none" className="mb-4 text-sm">
            Invalid
          </Heading>
          <div className="flex gap-4">
            <ToggleField
              value={invalidOff}
              onChange={(v) => setInvalidOff(v ?? false)}
              aria-label="Invalid toggle off"
              aria-invalid={true}
            />
            <ToggleField
              value={invalidOn}
              onChange={(v) => setInvalidOn(v ?? false)}
              aria-label="Invalid toggle on"
              aria-invalid={true}
            />
          </div>
        </div>
      </div>
    );
  },
};
