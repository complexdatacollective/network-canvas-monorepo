import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

/**
 * Swatches read the BARE theme variables (`--primary`), never the `--color-*`
 * aliases. Tailwind declares the aliases once at `:root`, so their computed
 * value is inherited into a themed region rather than re-resolved there — an
 * inline `var(--color-primary)` inside an interview or studio region paints
 * the default theme's colour and the swatch quietly lies about the palette it
 * is standing in. Utilities are safe (`@theme inline` substitutes them at
 * build time); reading a variable by hand is not.
 */
const ColorSwatch = ({
  name,
  cssVar,
  contrastVar,
}: {
  name: string;
  cssVar: string;
  contrastVar?: string;
}) => (
  <div className="flex flex-col gap-2">
    <div
      className="border-outline flex h-24 w-full items-center justify-center rounded-lg border-2 font-medium"
      style={{
        backgroundColor: `var(${cssVar})`,
        color: contrastVar ? `var(${contrastVar})` : 'inherit',
      }}
    >
      {name}
    </div>
    <div className="text-text/70 text-center text-xs">
      <div className="font-[monospace]">{cssVar}</div>
      {contrastVar && (
        <div className="font-[monospace] text-[10px]">{contrastVar}</div>
      )}
    </div>
  </div>
);

const meta = {
  title: 'Design System/Colors',
  parameters: {
    layout: 'padded',
    a11y: { disable: true },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SemanticColors: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Semantic Colors
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Core brand and semantic colors used throughout the application
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6">
          <ColorSwatch
            name="Primary"
            cssVar="--primary"
            contrastVar="--primary-contrast"
          />
          <ColorSwatch
            name="Secondary"
            cssVar="--secondary"
            contrastVar="--secondary-contrast"
          />
          <ColorSwatch
            name="Accent"
            cssVar="--accent"
            contrastVar="--accent-contrast"
          />
          <ColorSwatch
            name="Neutral"
            cssVar="--neutral"
            contrastVar="--neutral-contrast"
          />
        </div>
      </div>

      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Status Colors
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Colors for indicating status, alerts, and user feedback
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6">
          <ColorSwatch
            name="Success"
            cssVar="--success"
            contrastVar="--success-contrast"
          />
          <ColorSwatch
            name="Info"
            cssVar="--info"
            contrastVar="--info-contrast"
          />
          <ColorSwatch
            name="Warning"
            cssVar="--warning"
            contrastVar="--warning-contrast"
          />
          <ColorSwatch
            name="Destructive"
            cssVar="--destructive"
            contrastVar="--destructive-contrast"
          />
        </div>
      </div>

      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Base Colors
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Foundation colors for backgrounds, surfaces, and text
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6">
          <ColorSwatch name="Background" cssVar="--background" />
          <ColorSwatch name="Text" cssVar="--text" contrastVar="--neutral" />
          <ColorSwatch
            name="Surface"
            cssVar="--surface"
            contrastVar="--surface-contrast"
          />
          <ColorSwatch name="Outline" cssVar="--outline" />
        </div>
      </div>

      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Surface Levels
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Layered surfaces for depth and hierarchy
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6">
          <ColorSwatch name="Surface" cssVar="--surface" />
          <ColorSwatch name="Surface 1" cssVar="--surface-1" />
          <ColorSwatch name="Surface 2" cssVar="--surface-2" />
          <ColorSwatch name="Surface 3" cssVar="--surface-3" />
          <ColorSwatch name="Surface 4" cssVar="--surface-4" />
          <ColorSwatch
            name="Popover"
            cssVar="--surface-popover"
            contrastVar="--surface-popover-contrast"
          />
        </div>
      </div>

      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Interactive Colors
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Colors for interactive elements and inputs
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6">
          <ColorSwatch
            name="Input"
            cssVar="--input"
            contrastVar="--input-contrast"
          />
          <ColorSwatch
            name="Selected"
            cssVar="--selected"
            contrastVar="--selected-contrast"
          />
          <ColorSwatch name="Link" cssVar="--link" />
        </div>
      </div>

      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Accent Surface Levels
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Alternate layered surfaces for emphasized collections
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6">
          <ColorSwatch name="Accent Surface" cssVar="--surface-accent" />
          <ColorSwatch name="Accent Surface 1" cssVar="--surface-accent-1" />
          <ColorSwatch name="Accent Surface 2" cssVar="--surface-accent-2" />
          <ColorSwatch name="Accent Surface 3" cssVar="--surface-accent-3" />
          <ColorSwatch name="Accent Surface 4" cssVar="--surface-accent-4" />
        </div>
      </div>
    </div>
  ),
};

export const NodeColors: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Node Colors
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Sequential colors for network nodes (1-8)
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
            <ColorSwatch
              key={num}
              name={`Node ${num}`}
              cssVar={`--node-${num}`}
              contrastVar={`--node-${num}-contrast`}
            />
          ))}
        </div>
      </div>
    </div>
  ),
};

export const EdgeColors: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Edge Colors
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Sequential colors for network edges (1-10)
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 laptop:grid-cols-5 grid grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <ColorSwatch
              key={num}
              name={`Edge ${num}`}
              cssVar={`--edge-${num}`}
              contrastVar="--neutral"
            />
          ))}
        </div>
      </div>
    </div>
  ),
};

export const OrdinalColors: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Ordinal Colors
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Ordinal scale colors (1-8)
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
            <ColorSwatch
              key={num}
              name={`Ordinal ${num}`}
              cssVar={`--ord-${num}`}
            />
          ))}
        </div>
      </div>
    </div>
  ),
};

export const CategoricalColors: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Categorical Colors
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Categorical colors for groups and convex hulls (1-10)
        </Paragraph>
        <div className="tablet-landscape:grid-cols-4 laptop:grid-cols-5 grid grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <ColorSwatch
              key={num}
              name={`Category ${num}`}
              cssVar={`--cat-${num}`}
            />
          ))}
        </div>
      </div>
    </div>
  ),
};

export const AllColors: Story = {
  render: () => (
    <div className="space-y-12">
      <div>
        <Heading level="h1" margin="none" className="mb-2">
          Complete Color System
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-8">
          All colors available in the Fresco design system
        </Paragraph>
      </div>

      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Semantic Colors
        </Heading>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-4">
          <ColorSwatch
            name="Primary"
            cssVar="--primary"
            contrastVar="--primary-contrast"
          />
          <ColorSwatch
            name="Secondary"
            cssVar="--secondary"
            contrastVar="--secondary-contrast"
          />
          <ColorSwatch
            name="Accent"
            cssVar="--accent"
            contrastVar="--accent-contrast"
          />
          <ColorSwatch
            name="Neutral"
            cssVar="--neutral"
            contrastVar="--neutral-contrast"
          />
          <ColorSwatch
            name="Success"
            cssVar="--success"
            contrastVar="--success-contrast"
          />
          <ColorSwatch
            name="Info"
            cssVar="--info"
            contrastVar="--info-contrast"
          />
          <ColorSwatch
            name="Warning"
            cssVar="--warning"
            contrastVar="--warning-contrast"
          />
          <ColorSwatch
            name="Destructive"
            cssVar="--destructive"
            contrastVar="--destructive-contrast"
          />
        </div>
      </div>

      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Node Sequence
        </Heading>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
            <ColorSwatch
              key={num}
              name={`Node ${num}`}
              cssVar={`--node-${num}`}
              contrastVar={`--node-${num}-contrast`}
            />
          ))}
        </div>
      </div>

      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Edge Sequence
        </Heading>
        <div className="tablet-landscape:grid-cols-4 laptop:grid-cols-5 grid grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <ColorSwatch
              key={num}
              name={`Edge ${num}`}
              cssVar={`--edge-${num}`}
            />
          ))}
        </div>
      </div>

      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Ordinal & Categorical
        </Heading>
        <div className="tablet-landscape:grid-cols-4 grid grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
            <ColorSwatch
              key={num}
              name={`Ord ${num}`}
              cssVar={`--ord-${num}`}
            />
          ))}
        </div>
        <div className="tablet-landscape:grid-cols-4 laptop:grid-cols-5 mt-4 grid grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <ColorSwatch
              key={num}
              name={`Cat ${num}`}
              cssVar={`--cat-${num}`}
            />
          ))}
        </div>
      </div>
    </div>
  ),
};

/**
 * The five scopes a theme variable can be declared in. A region carrying both
 * studio and dark resolves to studio's dark block, which is why the pair is
 * listed as one scope rather than two attributes.
 */
const THEME_SCOPES = [
  { name: 'Default', attributes: {} },
  { name: 'Default dark', attributes: { 'data-theme': 'dark' } },
  { name: 'Studio', attributes: { 'data-theme-studio': '' } },
  {
    name: 'Studio dark',
    attributes: { 'data-theme-studio': '', 'data-theme': 'dark' },
  },
  { name: 'Interview', attributes: { 'data-theme-interview': '' } },
] as const;

/**
 * The destructive ink a tinted surface opts into, drawn in every theme.
 *
 * `--destructive-strong` is `--destructive` mixed toward the reader's own text
 * colour until it is legible on a tinted surface, and BOTH of those are
 * per-theme. A derived value like it has to be declared in each theme scope:
 * written once in the `@theme` block its `var()`s are substituted against
 * `:root` — the same trap the swatch component above is documented against —
 * and every dark, studio and interview region inherits the default theme's
 * one answer. It did: on the dark accent surface the error ink landed at
 * 2.04:1, below the 3.44:1 of the plain `--destructive` it exists to improve
 * on, where a mixture made in the dark scope reaches 4.63:1.
 *
 * Read as a swatch pair rather than described: the fill and the ink beside it,
 * on the surface the ink is chosen for.
 */
export const DestructiveInkPerTheme: Story = {
  parameters: { chromatic: { disableSnapshot: true } },
  render: () => (
    <div className="space-y-8">
      <div>
        <Heading level="h2" margin="none" className="mb-4">
          Destructive ink per theme
        </Heading>
        <Paragraph margin="none" className="text-text/70 mb-6 text-sm">
          Each row draws one theme’s <code>--destructive</code> fill and the{' '}
          <code>--destructive-strong</code> ink a tinted surface opts into, both
          on that theme’s accent surface.
        </Paragraph>
        <div className="space-y-4">
          {THEME_SCOPES.map((scope) => (
            <div key={scope.name} {...scope.attributes}>
              <div
                className="border-outline flex flex-col gap-2 rounded-lg border-2 p-4"
                style={{ background: 'var(--surface-accent)' }}
              >
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--surface-accent-contrast)' }}
                >
                  {scope.name}
                </span>
                <span
                  data-testid={`fill-${scope.name}`}
                  style={{ color: 'var(--destructive)' }}
                >
                  --destructive
                </span>
                <span
                  data-testid={`ink-${scope.name}`}
                  style={{ color: 'var(--destructive-strong)' }}
                >
                  --destructive-strong
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const inkOf = (scope: string) =>
      getComputedStyle(canvas.getByTestId(`ink-${scope}`)).color;
    const fillOf = (scope: string) =>
      getComputedStyle(canvas.getByTestId(`fill-${scope}`)).color;

    const defaultInk = inkOf('Default');

    for (const scope of THEME_SCOPES) {
      // The ink is a mixture, not the fill: a scope that lost the declaration
      // altogether would fall back to nothing and paint the inherited colour.
      await expect(inkOf(scope.name)).not.toBe(fillOf(scope.name));
    }

    // Every other scope declares a `--destructive`, a `--text`, or both that
    // the default theme does not, so a mixture made where it is READ can never
    // equal the default theme's. Equality here means the value was made once
    // at `:root` and inherited — the whole failure this pins.
    for (const scope of THEME_SCOPES.slice(1)) {
      await expect(inkOf(scope.name)).not.toBe(defaultInk);
    }
  },
};
