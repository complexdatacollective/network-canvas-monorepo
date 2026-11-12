import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import ProgressBar from './ProgressBar';
import { REDUCED_MOTION_ATTRIBUTE } from './reducedMotion';
import Heading from './typography/Heading';

const meta: Meta<typeof ProgressBar> = {
  title: 'Components/ProgressBar',
  component: ProgressBar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
      description: 'Orientation of the progress bar',
      table: {
        type: { summary: "'horizontal' | 'vertical'" },
        defaultValue: { summary: "'vertical'" },
      },
    },
    percentProgress: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'Current progress percentage (0-100)',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '0' },
      },
    },
    indeterminate: {
      control: 'boolean',
      description: 'Whether progress is indeterminate',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    nudge: {
      control: 'boolean',
      description: 'Whether to show pulse glow animation when complete',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    label: {
      control: 'text',
      description: 'Accessible label for the progress bar',
      table: {
        type: { summary: 'string' },
      },
    },
    tone: {
      control: 'select',
      options: ['neutral', 'info'],
      description: 'How an unfinished bar is drawn',
      table: {
        type: { summary: "'neutral' | 'info'" },
        defaultValue: { summary: "'neutral'" },
      },
    },
  },
  args: {
    orientation: 'vertical',
    percentProgress: 50,
    indeterminate: false,
    nudge: true,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    orientation: 'vertical',
    percentProgress: 50,
  },
  render: (args) => (
    <div
      className={
        args.orientation === 'vertical'
          ? 'flex h-96 items-center justify-center'
          : 'flex h-24 w-96 items-center justify-center'
      }
    >
      <ProgressBar {...args} />
    </div>
  ),
};

/** The part of the bar that is drawn over its track. */
function indicatorOf(bar: HTMLElement) {
  const indicator = bar.firstElementChild?.firstElementChild;
  if (!(indicator instanceof HTMLElement)) {
    throw new Error('The progress bar has no indicator');
  }
  return indicator;
}

/**
 * Where the moving segment of an indeterminate bar is drawn at two points in
 * its one-second cycle: once it has grown out of the edge it starts from, and
 * later, on its way to the other edge.
 *
 * The animation is held at each point to be measured, and set going again
 * afterwards so the story is left moving for whoever is looking at it.
 */
async function sweepOf(indicator: HTMLElement) {
  const sweep = await waitFor(() => {
    const [animation] = indicator.getAnimations();
    if (!animation) throw new Error('The indicator is not animated');
    return animation;
  });
  const at = (milliseconds: number) => {
    sweep.currentTime = milliseconds;
    return indicator.getBoundingClientRect();
  };
  sweep.pause();
  try {
    return { grown: at(400), travelling: at(700) };
  } finally {
    sweep.play();
  }
}

export const Indeterminate: Story = {
  args: {
    indeterminate: true,
    orientation: 'horizontal',
  },
  render: (args) => (
    <div className="flex h-24 w-96 items-center justify-center">
      <ProgressBar {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole('progressbar');
    const track = bar.getBoundingClientRect();
    const indicator = indicatorOf(bar);

    // The animation scales and moves the indicator's own box, so a box with
    // no width leaves it nothing to draw however it is animated.
    await expect(indicator.offsetWidth).toBe(bar.offsetWidth);

    const { grown, travelling } = await sweepOf(indicator);
    // Grown out of the left edge to two fifths of the track…
    await expect(grown.left).toBeCloseTo(track.left, 0);
    await expect(grown.width).toBeCloseTo(track.width * 0.4, 0);
    // …then on its way to the right.
    await expect(travelling.left).toBeGreaterThan(track.left + 100);
  },
};

/**
 * In a right-to-left language a bar fills from the right, so the segment of
 * an indeterminate one starts there and travels to the left.
 */
export const IndeterminateRightToLeft: Story = {
  ...Indeterminate,
  globals: { appDirection: 'rtl' },
  play: async ({ canvasElement }) => {
    await expect(document.documentElement.dir).toBe('rtl');
    const bar = within(canvasElement).getByRole('progressbar');
    const track = bar.getBoundingClientRect();

    const { grown, travelling } = await sweepOf(indicatorOf(bar));
    await expect(grown.right).toBeCloseTo(track.right, 0);
    await expect(grown.width).toBeCloseTo(track.width * 0.4, 0);
    await expect(travelling.right).toBeLessThan(track.right - 100);
  },
};

/** A vertical bar fills from the top, and its segment travels downwards. */
export const IndeterminateVertical: Story = {
  args: {
    indeterminate: true,
    orientation: 'vertical',
  },
  render: (args) => (
    <div className="flex h-96 items-center justify-center">
      <ProgressBar {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByRole('progressbar');
    const track = bar.getBoundingClientRect();
    const indicator = indicatorOf(bar);

    await expect(indicator.offsetHeight).toBe(bar.offsetHeight);

    const { grown, travelling } = await sweepOf(indicator);
    await expect(grown.top).toBeCloseTo(track.top, 0);
    await expect(grown.height).toBeCloseTo(track.height * 0.4, 0);
    await expect(travelling.top).toBeGreaterThan(track.top + 100);
  },
};

/**
 * With reduced motion the segment does not travel. The bar is drawn filling
 * its track, faded so that it does not read as a finished one.
 */
export const IndeterminateWithReducedMotion: Story = {
  ...Indeterminate,
  play: async ({ canvasElement }) => {
    const root = document.documentElement;
    // The document's one reduced-motion setting, which the Storybook's own
    // provider leaves following the operating system. Put back afterwards:
    // left set, every later story in a run would render without motion.
    root.setAttribute(REDUCED_MOTION_ATTRIBUTE, 'always');
    try {
      const bar = within(canvasElement).getByRole('progressbar');
      const indicator = indicatorOf(bar);

      await waitFor(() => expect(indicator.getAnimations()).toHaveLength(0));
      const drawn = indicator.getBoundingClientRect();
      await expect(drawn.width).toBeCloseTo(bar.offsetWidth, 0);
      await expect(getComputedStyle(indicator).opacity).toBe('0.5');
    } finally {
      root.removeAttribute(REDUCED_MOTION_ATTRIBUTE);
    }
  },
};

export const Complete: Story = {
  args: {
    orientation: 'horizontal',
    percentProgress: 100,
    nudge: true,
  },
  render: (args) => (
    <div className="flex h-24 w-96 items-center justify-center">
      <ProgressBar {...args} />
    </div>
  ),
};

export const CompleteWithoutNudge: Story = {
  args: {
    orientation: 'horizontal',
    percentProgress: 100,
    nudge: false,
  },
  render: (args) => (
    <div className="flex h-24 w-96 items-center justify-center">
      <ProgressBar {...args} />
    </div>
  ),
};

export const AnimatedProgress: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: () => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            return 0;
          }
          return prev + 1;
        });
      }, 50);

      return () => clearInterval(interval);
    }, []);

    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-4">
          <Heading level="h3" margin="none" className="text-lg">
            Horizontal ({progress}%)
          </Heading>
          <div className="flex h-24 w-96 items-center justify-center">
            <ProgressBar
              orientation="horizontal"
              percentProgress={progress}
              label="Animated horizontal progress"
            />
          </div>
        </div>
        <div className="flex flex-col items-center gap-4">
          <Heading level="h3" margin="none" className="text-lg">
            Vertical ({progress}%)
          </Heading>
          <div className="flex h-96 items-center justify-center">
            <ProgressBar
              orientation="vertical"
              percentProgress={progress}
              label="Animated vertical progress"
            />
          </div>
        </div>
      </div>
    );
  },
};

export const AllOrientations: Story = {
  render: () => (
    <div className="flex gap-12">
      <div className="flex flex-col items-center gap-4">
        <Heading level="h3" margin="none" className="text-base">
          Vertical 25%
        </Heading>
        <div className="flex h-96">
          <ProgressBar
            orientation="vertical"
            percentProgress={25}
            label="25% progress"
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-4">
        <Heading level="h3" margin="none" className="text-base">
          Vertical 50%
        </Heading>
        <div className="flex h-96">
          <ProgressBar
            orientation="vertical"
            percentProgress={50}
            label="50% progress"
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-4">
        <Heading level="h3" margin="none" className="text-base">
          Vertical 75%
        </Heading>
        <div className="flex h-96">
          <ProgressBar
            orientation="vertical"
            percentProgress={75}
            label="75% progress"
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-4">
        <Heading level="h3" margin="none" className="text-base">
          Vertical 100%
        </Heading>
        <div className="flex h-96">
          <ProgressBar
            orientation="vertical"
            percentProgress={100}
            label="Complete"
          />
        </div>
      </div>
    </div>
  ),
};

export const HorizontalVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Heading level="h3" margin="none" className="text-sm">
          25% Progress
        </Heading>
        <div className="w-96">
          <ProgressBar
            orientation="horizontal"
            percentProgress={25}
            label="25% progress"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Heading level="h3" margin="none" className="text-sm">
          50% Progress
        </Heading>
        <div className="w-96">
          <ProgressBar
            orientation="horizontal"
            percentProgress={50}
            label="50% progress"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Heading level="h3" margin="none" className="text-sm">
          75% Progress
        </Heading>
        <div className="w-96">
          <ProgressBar
            orientation="horizontal"
            percentProgress={75}
            label="75% progress"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Heading level="h3" margin="none" className="text-sm">
          100% Complete (with nudge)
        </Heading>
        <div className="w-96">
          <ProgressBar
            orientation="horizontal"
            percentProgress={100}
            label="Complete"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Heading level="h3" margin="none" className="text-sm">
          Indeterminate
        </Heading>
        <div className="w-96">
          <ProgressBar orientation="horizontal" indeterminate label="Loading" />
        </div>
      </div>
    </div>
  ),
};

export const InfoTone: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      {[0, 40, 100].map((percent) => (
        <div key={percent} className="flex flex-col gap-2">
          <Heading level="h3" margin="none" className="text-sm">
            {percent}% (info tone)
          </Heading>
          <div className="w-96">
            <ProgressBar
              orientation="horizontal"
              percentProgress={percent}
              nudge={false}
              tone="info"
              label={`${percent}% progress`}
            />
          </div>
        </div>
      ))}
    </div>
  ),
};

export const WithCustomColors: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Heading level="h3" margin="none" className="text-sm">
          Default Color (inherits)
        </Heading>
        <div className="w-96">
          <ProgressBar
            orientation="horizontal"
            percentProgress={60}
            label="Default progress"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Heading level="h3" margin="none" className="text-sm">
          Custom Color (via CSS variable)
        </Heading>
        <div className="text-success w-96">
          <ProgressBar
            orientation="horizontal"
            percentProgress={60}
            label="Success progress"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Heading level="h3" margin="none" className="text-sm">
          Warning Color
        </Heading>
        <div className="text-warning w-96">
          <ProgressBar
            orientation="horizontal"
            percentProgress={60}
            label="Warning progress"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Heading level="h3" margin="none" className="text-sm">
          Destructive Color
        </Heading>
        <div className="text-destructive w-96">
          <ProgressBar
            orientation="horizontal"
            percentProgress={60}
            label="Destructive progress"
          />
        </div>
      </div>
    </div>
  ),
};
