import type { Meta, StoryObj } from '@storybook/react-vite';
import { cancelFrame, frame, LayoutGroup } from 'motion/react';
import { useState } from 'react';
import { useArgs } from 'storybook/preview-api';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import { awaitPassiveEffects } from '../../storybook-support/awaitPassiveEffects';
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
  // Renders through Storybook's useArgs, which only Storybook's own render
  // may call, so the mirror check cannot draw it afresh. The other stories
  // here cover the same layout.
  tags: ['!mirror'],
  render: function Render(args) {
    const [, updateArgs] = useArgs();

    return (
      <div className="w-full max-w-md">
        <ToggleField
          {...args}
          onChange={(value) => {
            updateArgs({ value });
            args.onChange?.(value);
          }}
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
    // Base UI marks the thumb with the switch's state.
    const thumb = neighbour.querySelector('[data-checked], [data-unchecked]');

    await expect(thumb).not.toBeNull();

    const thumbOffset = () =>
      thumb!.getBoundingClientRect().top -
      neighbour.getBoundingClientRect().top;

    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(resolve));

    // The Storybook host skips Motion animations, which would leave nothing
    // here to replay.
    const samples: number[] = [];
    await withAnimationsEnabled(async () => {
      await userEvent.click(
        canvas.getByRole('switch', { name: 'Expanding toggle' }),
      );
      for (let count = 0; count < 8; count++) {
        await nextFrame();
        samples.push(thumbOffset());
      }
    });

    for (const sample of samples) {
      await expect(sample).toBeCloseTo(samples[0]!, 1);
    }
  },
};

/**
 * A toggle centred in a container whose contents depend on it, as in a dialog
 * that shows more fields once something is switched on. Switching it on adds a
 * panel below, so the whole toggle moves up in the same render that moves its
 * thumb. The thumb must still slide along the track only, never away from it.
 */
export const InsideAResizingContainer: Story = {
  render: () => {
    const [on, setOn] = useState(false);
    return (
      <div className="flex h-120 w-96 flex-col items-center justify-center gap-4">
        <ToggleField
          value={on}
          onChange={(v) => setOn(v ?? false)}
          aria-label="Show details"
        />
        {on && <div className="h-40 w-full rounded bg-current opacity-10" />}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const toggle = canvas.getByRole('switch', { name: 'Show details' });
    // Base UI marks the thumb with the switch's state.
    const thumb = toggle.querySelector<HTMLElement>(
      '[data-checked], [data-unchecked]',
    )!;

    const rest = thumb.getBoundingClientRect();
    const restTrack = toggle.getBoundingClientRect();
    const restInset = rest.top - restTrack.top;
    const start = rest.left - restTrack.left;

    // One sample per frame, after Motion has written that frame's styles.
    const frames: { inset: number; left: number }[] = [];
    const sample = () => {
      const box = thumb.getBoundingClientRect();
      const trackBox = toggle.getBoundingClientRect();
      if (frames.length < 30) {
        frames.push({
          inset: box.top - trackBox.top,
          left: box.left - trackBox.left,
        });
      }
    };

    // The Storybook host skips Motion animations; this story is about one.
    await withAnimationsEnabled(async () => {
      frame.postRender(sample, true);
      try {
        await userEvent.click(toggle);
        await waitFor(() => expect(frames).toHaveLength(30));
      } finally {
        cancelFrame(sample);
      }
    });

    // The thumb rests as far from the end of the track as it started from
    // the start.
    const end = restTrack.width - rest.width - start;

    // The panel moved the toggle…
    await expect(
      restTrack.top - toggle.getBoundingClientRect().top,
    ).toBeGreaterThan(40);
    // …yet the thumb stayed inside the track in every frame…
    for (const { inset } of frames) {
      await expect(inset).toBeCloseTo(restInset, 0);
    }
    // …while it slid across, rather than jumping, to the other end.
    await expect(
      frames.some(({ left }) => left > start + 1 && left < end - 1),
    ).toBe(true);
    await waitFor(() =>
      expect(
        thumb.getBoundingClientRect().left -
          toggle.getBoundingClientRect().left,
      ).toBeCloseTo(end, 0),
    );
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
