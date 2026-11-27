import type { Meta, StoryObj } from '@storybook/react-vite';
import { Database, Layers } from 'lucide-react';
import { cancelFrame, frame } from 'motion/react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import { awaitPassiveEffects } from '../storybook-support/awaitPassiveEffects';
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
  aria-label="Board view"
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
- **\`variant\`** (\`'outline' | 'glass' | 'plain'\`, default \`'outline'\`) —
  \`outline\` reads like a normal outline button (2px themed border, no fill);
  \`glass\` adds a translucent, backdrop-blurred, shadowed surface with a
  thicker border, for floating over content; \`plain\` draws no track at all,
  for a switcher whose container is its track, such as a pill-shaped popup.
- **\`aria-label\`** (\`string\`) or **\`aria-labelledby\`** (\`string\`) —
  exactly one is required: a name for the group, or the id of an element on
  the page that names it, such as a field's label.
- **\`aria-describedby\`** (\`string\`) — the id of an element that describes
  the group, such as a field's hint.
- **\`id\`** (\`string\`) — the group's id, for a switcher that is a field's
  control. To use it as one, render \`SegmentedSwitcherField\`
  (\`@codaco/fresco-ui/SegmentedSwitcherField\`) as the field's \`component\`,
  which passes all three from the field.
- **\`disabled\`** (\`boolean\`) — every segment ignores the pointer and the
  keyboard.
- **\`className\`** (\`string\`) — merged onto the track.

Keyboard operation and \`role="group"\`/toggle ARIA come from Base UI.
`;

type StoryArgs = {
  size: 'sm' | 'md' | 'lg' | 'xl';
  variant: 'outline' | 'glass' | 'plain';
  disabledSecond: boolean;
  disabled: boolean;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/SegmentedSwitcher',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { description: { component: COMPOSITION_DOC } },
  },
  args: {
    size: 'lg',
    variant: 'outline',
    disabledSecond: false,
    disabled: false,
  },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg', 'xl'],
      description: 'Track height, pinned to the matching Button height.',
    },
    variant: {
      control: 'inline-radio',
      options: ['outline', 'glass', 'plain'],
      description:
        'Track treatment. See the "Glass" story for the backdrop-blurred variant over content.',
    },
    disabledSecond: {
      control: 'boolean',
      description: 'Disable the second option to show the disabled state.',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable every segment.',
    },
  },
  render: ({ size, variant, disabledSecond, disabled }) => {
    const [value, setValue] = useState<Value>('protocols');
    const options = ICON_OPTIONS.map((o, i) =>
      i === 1 && disabledSecond ? { ...o, disabled: true } : o,
    );
    return (
      <SegmentedSwitcher
        aria-label="Demo switcher"
        size={size}
        variant={variant}
        disabled={disabled}
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

// Every segment off at once, as a disabled field's control is.
export const Disabled: Story = { args: { disabled: true } };

/**
 * The switcher centred in a container whose contents depend on the choice, as
 * in a dialog whose fields change with it. Picking "Data" adds a panel below,
 * so the whole switcher moves up in the same render that moves the highlight.
 * The highlight must still slide along the track only, never away from it.
 */
export const InsideAResizingContainer: Story = {
  render: () => {
    const [value, setValue] = useState<Value>('protocols');
    return (
      <div className="flex h-120 w-96 flex-col items-center justify-center gap-4">
        <SegmentedSwitcher
          aria-label="Resizing container switcher"
          value={value}
          onValueChange={setValue}
          options={ICON_OPTIONS}
        />
        {value === 'data' && (
          <div className="h-40 w-full rounded bg-current opacity-10" />
        )}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const group = canvas.getByRole('group', {
      name: 'Resizing container switcher',
    });
    const track = group.parentElement!;
    const data = canvas.getByRole('button', { name: 'Data' });
    const highlight = () =>
      group.querySelector<HTMLElement>('span[aria-hidden]');

    const rest = highlight()!.getBoundingClientRect();
    const restTrack = track.getBoundingClientRect();
    const restInset = rest.top - restTrack.top;

    // One sample per frame, after Motion has written that frame's styles.
    const frames: { trackTop: number; inset: number; left: number }[] = [];
    const sample = () => {
      const box = highlight()?.getBoundingClientRect();
      const trackBox = track.getBoundingClientRect();
      if (box && frames.length < 40) {
        frames.push({
          trackTop: trackBox.top,
          inset: box.top - trackBox.top,
          left: box.left - trackBox.left,
        });
      }
    };

    // The Storybook host skips Motion animations; this story is about one.
    await withAnimationsEnabled(async () => {
      frame.postRender(sample, true);
      try {
        await userEvent.click(data);
        await waitFor(() => expect(frames).toHaveLength(40));
      } finally {
        cancelFrame(sample);
      }
    });

    const end =
      data.getBoundingClientRect().left - track.getBoundingClientRect().left;
    const start = rest.left - restTrack.left;

    // The panel moved the switcher…
    await expect(
      restTrack.top - track.getBoundingClientRect().top,
    ).toBeGreaterThan(40);
    // …yet the highlight stayed inside the track in every frame…
    for (const { inset } of frames) {
      await expect(inset).toBeCloseTo(restInset, 0);
    }
    // …while it slid across, rather than jumping, to the picked segment.
    await expect(
      frames.some(({ left }) => left > start + 1 && left < end - 1),
    ).toBe(true);
    await waitFor(() =>
      expect(
        highlight()!.getBoundingClientRect().left -
          track.getBoundingClientRect().left,
      ).toBeCloseTo(end, 0),
    );
  },
};
