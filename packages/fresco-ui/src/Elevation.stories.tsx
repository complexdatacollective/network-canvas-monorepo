import type { Meta, StoryObj } from '@storybook/react-vite';

import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

const ELEVATION_LEVELS = ['none', 'low', 'medium', 'high'] as const;

const ELEVATION_CLASSES = {
  none: 'elevation-none',
  low: 'elevation-low',
  medium: 'elevation-medium',
  high: 'elevation-high',
} as const;

const BACKGROUNDS = [
  {
    label: 'background',
    bg: 'bg-background',
    text: 'text-text',
  },
  {
    label: 'surface-1',
    bg: 'bg-surface-1',
    text: 'text-surface-1-contrast',
  },
  {
    label: 'primary',
    bg: 'bg-primary',
    text: 'text-primary-contrast',
  },
  {
    label: 'destructive',
    bg: 'bg-destructive',
    text: 'text-destructive-contrast',
  },
];

const Card = ({
  level,
  className = '',
}: {
  level: (typeof ELEVATION_LEVELS)[number];
  className?: string;
}) => (
  <div
    className={`flex h-24 items-center justify-center rounded-lg p-4 font-medium ${ELEVATION_CLASSES[level]} ${className}`}
  >
    elevation-{level}
  </div>
);

const meta = {
  title: 'Design System/Elevation',
  parameters: {
    layout: 'padded',
    a11y: { disable: true },
    docs: {
      description: {
        component:
          "The `elevation` plugin generates realistic, multi-layer shadows whose color is derived from the parent element's **published background**. Apply `publish-colors` (with a `bg-*` utility) to a parent, then put `elevation-low | medium | high` on a child — the shadow tints itself to fit the surface beneath it.",
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Levels: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Heading level="h2" margin="none" className="mb-2">
          Levels
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Four utilities — `elevation-none`, `elevation-low`,
          `elevation-medium`, `elevation-high` — increasing in blur and reducing
          in opacity as elevation grows.
        </Paragraph>
      </div>
      <div className="bg-background publish-colors tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6 rounded-lg p-8">
        {ELEVATION_LEVELS.map((level) => (
          <Card key={level} level={level} className="bg-surface" />
        ))}
      </div>
    </div>
  ),
};

export const BackgroundAdaptation: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Heading level="h2" margin="none" className="mb-2">
          Background Adaptation
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Shadow color is derived from `--published-bg` on the parent, so the
          same `elevation-high` utility tints differently on each surface below.
          The plugin uses `oklch(from var(--published-bg) ...)` to carry the
          parent hue/chroma into the shadow.
        </Paragraph>
      </div>
      <div className="tablet-landscape:grid-cols-2 grid grid-cols-1 gap-6">
        {BACKGROUNDS.map(({ label, bg, text }) => (
          <div
            key={label}
            className={`publish-colors rounded-lg p-8 ${bg} ${text}`}
          >
            <div className="mb-4 font-[monospace] text-xs opacity-70">
              {bg} publish-colors
            </div>
            <Card level="high" />
          </div>
        ))}
      </div>
    </div>
  ),
};

export const PublishColorsContract: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Heading level="h2" margin="none" className="mb-2">
          The `publish-colors` Contract
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Elevation shadows reference `--published-bg`. Without `publish-colors`
          on a parent that has `bg-*`, the shadow falls back to the
          plugin&apos;s default and won&apos;t match the visible surface.
          Compare the two cards below — same `bg-primary`, same
          `elevation-medium` child, only the right column publishes its color.
        </Paragraph>
      </div>
      <div className="tablet-landscape:grid-cols-2 grid grid-cols-1 gap-6">
        <div className="bg-primary text-primary-contrast rounded-lg p-8">
          <div className="mb-4 font-[monospace] text-xs opacity-70">
            bg-primary <span className="line-through">publish-colors</span>
          </div>
          <Card level="medium" />
        </div>
        <div className="bg-primary text-primary-contrast publish-colors rounded-lg p-8">
          <div className="mb-4 font-[monospace] text-xs opacity-70">
            bg-primary publish-colors
          </div>
          <Card level="medium" />
        </div>
      </div>
    </div>
  ),
};
