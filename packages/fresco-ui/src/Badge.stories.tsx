import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { Badge, type BadgeColor } from './Badge';
import Surface from './layout/Surface';

const themeColors = [
  'white',
  'black',
  'neon-coral',
  'neon-coral-dark',
  'sea-green',
  'sea-green-dark',
  'slate-blue',
  'slate-blue-dark',
  'navy-taupe',
  'navy-taupe-dark',
  'cyber-grape',
  'cyber-grape-dark',
  'mustard',
  'mustard-dark',
  'rich-black',
  'rich-black-dark',
  'charcoal',
  'charcoal-dark',
  'platinum',
  'platinum-dark',
  'sea-serpent',
  'sea-serpent-dark',
  'paradise-pink',
  'paradise-pink-dark',
  'cerulean-blue',
  'cerulean-blue-dark',
  'neon-carrot',
  'neon-carrot-dark',
  'kiwi',
  'kiwi-dark',
  'tomato',
  'tomato-dark',
  'purple-pizazz',
  'purple-pizazz-dark',
  'barbie-pink',
  'barbie-pink-dark',
] satisfies BadgeColor[];

const meta = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Small status and metadata labels. Use semantic variants for status, or the color prop for named theme colors.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'],
    },
    color: {
      control: 'select',
      options: [undefined, ...themeColors],
    },
  },
  args: {
    children: 'Badge',
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const ThemeColors: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {themeColors.map((color) => (
        <Badge key={color} color={color}>
          {color}
        </Badge>
      ))}
    </div>
  ),
};

export const ThemeColorOutlines: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {themeColors.map((color) => (
        <Badge key={color} color={color} variant="outline">
          {color}
        </Badge>
      ))}
    </div>
  ),
};

/** WCAG AA for text below 18.66px, which every badge label is. */
const AA_NORMAL_TEXT = 4.5;

/**
 * Paints `layers` bottom-first onto a 1×1 canvas over opaque white and reads
 * the sRGB pixel back. Computed colours in these themes are `oklch()` and
 * `oklab()`, so a channel cannot be parsed out of the string; and because the
 * stack ends opaque, `getImageData` returns it without un-premultiply error.
 *
 * Canvas ignores an unparseable `fillStyle` and silently keeps the previous
 * one, which would turn a broken reading into a comparable number, so every
 * layer is checked before it is painted.
 */
function flatten(layers: readonly string[]): readonly [number, number, number] {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('This browser gave no 2D canvas context.');
  context.globalCompositeOperation = 'copy';
  context.fillStyle = 'rgb(255, 255, 255)';
  context.fillRect(0, 0, 1, 1);
  context.globalCompositeOperation = 'source-over';
  for (const layer of layers) {
    if (!CSS.supports('color', layer)) {
      throw new Error(`Not a colour this browser can paint: ${layer}`);
    }
    context.fillStyle = layer;
    context.fillRect(0, 0, 1, 1);
  }
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return [red ?? 0, green ?? 0, blue ?? 0];
}

const relativeLuminance = ([red, green, blue]: readonly [
  number,
  number,
  number,
]) => {
  const [r, g, b] = [red, green, blue]
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
) => {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Every outline badge on a surface that publishes a contrast colour of its
 * own, which is where the variant is actually used: an `ArrayField` row is a
 * `Surface`, and a `Surface` paints a background and publishes the ink that
 * goes with it together.
 *
 * The story exists for its play function rather than its looks. `bg-primary`
 * is a surface whose ink is emphatically not the page's: `--primary-contrast`
 * is white in every theme, while `--text` is near-black on light. A badge that
 * read the page token would be dark-on-dark here — which is what Architect's
 * form-field rows looked like, at 2.69:1, until the variant started following
 * the surface.
 */
export const ThemeColorOutlinesOnAPublishedSurface: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Outline badges on a surface that publishes its own contrast colour. The label follows that colour, not the page’s, so every badge clears WCAG AA against the wash it sits on.',
      },
    },
  },
  render: () => (
    <Surface
      noContainer
      className="bg-primary text-primary-contrast flex flex-wrap gap-3"
    >
      {themeColors.map((color) => (
        <Badge key={color} color={color} variant="outline">
          {color}
        </Badge>
      ))}
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The palette is the test's input; an empty one would assert nothing.
    await expect(themeColors.length).toBeGreaterThan(0);

    const firstBadge = await canvas.findByText(themeColors[0]!);
    const surface = firstBadge.closest('.publish-colors');
    if (!(surface instanceof HTMLElement)) {
      throw new Error('The badges are not mounted on a published surface.');
    }

    const surfaceInk = getComputedStyle(surface).color;
    const surfaceBackground = getComputedStyle(surface).backgroundColor;
    // What the badge would read if it followed the page instead of the
    // surface. Unless the two differ, this story cannot tell them apart.
    const pageInk = getComputedStyle(canvasElement).color;
    await expect(flatten([surfaceInk])).not.toEqual(flatten([pageInk]));

    for (const color of themeColors) {
      const badge = await canvas.findByText(color);

      // The badge's wash is translucent, so the colour behind the label is the
      // wash over the surface — and only over the surface while nothing in
      // between paints. Checked rather than assumed.
      for (
        let between = badge.parentElement;
        between && between !== surface;
        between = between.parentElement
      ) {
        await expect(getComputedStyle(between).backgroundColor).toBe(
          'rgba(0, 0, 0, 0)',
        );
      }

      const style = getComputedStyle(badge);
      await expect(flatten([style.color])).toEqual(flatten([surfaceInk]));

      const behind = flatten([surfaceBackground, style.backgroundColor]);
      const ratio = contrastRatio(flatten([style.color]), behind);
      // Named in the assertion so a failure says which colour, at what ratio.
      await expect({
        color,
        ratio: Number(ratio.toFixed(2)),
        clearsAA: ratio >= AA_NORMAL_TEXT,
      }).toEqual({
        color,
        ratio: Number(ratio.toFixed(2)),
        clearsAA: true,
      });
    }
  },
};
