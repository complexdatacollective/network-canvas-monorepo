import type { Meta, StoryObj } from '@storybook/react-vite';

import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

const Tile = ({
  bg,
  label,
  text = '',
}: {
  bg: string;
  label: string;
  text?: string;
}) => (
  <div
    className={`inset-surface flex h-24 items-center justify-center rounded-lg ${bg} ${text}`}
  >
    <span className="font-[monospace] text-xs">{label}</span>
  </div>
);

const meta = {
  title: 'Design System/Inset Surface',
  parameters: {
    layout: 'padded',
    a11y: { disable: true },
    docs: {
      description: {
        component:
          "The `inset-surface` plugin adds a single utility — `inset-surface` — that draws an inset (pressed-in) shadow plus highlight derived from the element's **own** background color. Shadow strength scales with the background's chroma: vivid colors get pronounced shadows, neutrals stay subtle. Used in Alert, Combobox popovers, ToggleField, and slider tracks.",
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Heading level="h2" margin="none" className="mb-2">
          Basic
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Apply `inset-surface` alongside a `bg-*` utility. The plugin reads the
          same color via `--inset-bg` and tints both shadow and highlight to
          match.
        </Paragraph>
      </div>
      <div className="tablet-landscape:grid-cols-3 grid grid-cols-2 gap-6">
        <Tile bg="bg-surface" label="bg-surface" />
        <Tile bg="bg-surface-1" label="bg-surface-1" />
        <Tile bg="bg-surface-2" label="bg-surface-2" />
      </div>
    </div>
  ),
};

export const ChromaScaling: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Heading level="h2" margin="none" className="mb-2">
          Chroma Scaling
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Shadow opacity is computed as `clamp(0.1, 0.1 + c * 0.4, 0.22)`, so
          fully-saturated brand colors produce visibly stronger shadows than
          neutral surfaces. Highlight opacity scales inversely with chroma,
          brightening light neutrals where a dark shadow alone lacks contrast.
        </Paragraph>
      </div>
      <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6">
        <Tile bg="bg-surface" label="neutral" />
        <Tile bg="bg-primary/10" label="primary/10 (tinted)" />
        <Tile
          bg="bg-primary text-primary-contrast"
          label="primary (saturated)"
        />
        <Tile bg="bg-info text-info-contrast" label="info (saturated)" />
      </div>
    </div>
  ),
};

export const StatusColors: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Heading level="h2" margin="none" className="mb-2">
          Status Colors
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          The Alert component uses `inset-surface` with each status color token.
          The chroma-driven shadow keeps the inset depth consistent across hues.
        </Paragraph>
      </div>
      <div className="tablet-landscape:grid-cols-2 grid grid-cols-1 gap-6">
        <Tile bg="bg-success text-success-contrast" label="bg-success" />
        <Tile bg="bg-info text-info-contrast" label="bg-info" />
        <Tile bg="bg-warning text-warning-contrast" label="bg-warning" />
        <Tile
          bg="bg-destructive text-destructive-contrast"
          label="bg-destructive"
        />
      </div>
    </div>
  ),
};

export const NestedInElevation: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Heading level="h2" margin="none" className="mb-2">
          Nested Inside an Elevated Surface
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          `inset-surface` uses a dedicated `--inset-bg` variable (not the
          elevation plugin&apos;s `--scoped-bg`), so it works correctly even
          when nested inside an element that publishes its color for elevation
          shadows.
        </Paragraph>
      </div>
      <div className="bg-background publish-colors rounded-lg p-8">
        <div className="bg-surface elevation-medium space-y-4 rounded-lg p-6">
          <div className="text-sm opacity-70">A card with elevation-medium</div>
          <div className="inset-surface bg-surface-1 flex h-16 items-center justify-center rounded">
            <span className="font-[monospace] text-xs">
              nested inset-surface inside the card
            </span>
          </div>
        </div>
      </div>
    </div>
  ),
};
