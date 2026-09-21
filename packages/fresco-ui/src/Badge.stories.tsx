import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';
import { expect, within } from 'storybook/test';

import { Badge, BADGE_COLORS, type BadgeTone } from './Badge';
import Icon from './Icon';
import Surface from './layout/Surface';

/** Read from the palette, so a colour added to it cannot go unchecked here. */
const themeColors = BADGE_COLORS;

const meta = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
The one label chip. \`tone\` picks a semantic colour pair from the theme and
\`appearance\` paints it as a solid fill or an outline, which becomes a wash of
the colour when one is given; \`color\`
paints a named palette colour instead, for taxonomies rather than status.
\`mono\` sets the label in the monospace face for versions, identifiers and
codes; \`uppercase\` adds the caps tracking; \`icon\` is a leading slot; and
\`render\` swaps the element for a button, a toggle or an animated wrapper.

\`\`\`tsx
import { Badge } from '@codaco/fresco-ui/Badge';

<Badge tone="success">Live</Badge>
<Badge appearance="outline" color="cerulean-blue">Image</Badge>
<Badge mono icon={<Icon name="RefreshCw" />}>v8.0.0</Badge>
\`\`\`
`,
      },
    },
  },
  argTypes: {
    tone: {
      control: 'select',
      options: [
        'neutral',
        'primary',
        'secondary',
        'accent',
        'info',
        'success',
        'warning',
        'destructive',
      ],
    },
    appearance: { control: 'inline-radio', options: ['filled', 'outline'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    mono: { control: 'boolean' },
    uppercase: { control: 'boolean' },
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

const tones = [
  'neutral',
  'primary',
  'secondary',
  'accent',
  'info',
  'success',
  'warning',
  'destructive',
] satisfies BadgeTone[];

export const Tones: Story = {
  render: () => (
    <div className="grid grid-cols-[auto_auto] justify-start justify-items-start gap-3">
      {tones.map((tone) => (
        <React.Fragment key={tone}>
          <Badge tone={tone}>{tone}</Badge>
          <Badge tone={tone} appearance="outline">
            {tone}
          </Badge>
        </React.Fragment>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),
};

export const Mono: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge mono size="sm">
        v8.0.0-beta.3
      </Badge>
      <Badge mono>v8.0.0-beta.3</Badge>
      <Badge mono size="lg">
        v8.0.0-beta.3
      </Badge>
    </div>
  ),
};

export const Uppercase: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge uppercase size="sm">
        News
      </Badge>
      <Badge uppercase>News</Badge>
      <Badge uppercase mono appearance="outline" tone="warning">
        Requires internet
      </Badge>
    </div>
  ),
};

export const WithIcon: Story = {
  args: {
    children: 'v8.0.0-beta.3',
    mono: true,
    appearance: 'outline',
    tone: 'info',
    icon: <Icon name="RefreshCw" className="size-3.5" />,
  },
};

export const SpacingStable: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      <Badge mono appearance="outline" data-spacing="outline">
        v8.0.0-beta.3
      </Badge>
      <Badge mono tone="info" data-spacing="filled">
        v8.0.0-beta.3
      </Badge>
      <Badge mono color="sea-serpent" data-spacing="palette">
        v8.0.0-beta.3
      </Badge>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const boxes = Array.from(
      canvasElement.querySelectorAll<HTMLElement>('[data-spacing]'),
    ).map((badge) => ({
      width: badge.offsetWidth,
      height: badge.offsetHeight,
    }));
    await expect(boxes.length).toBe(3);
    for (const box of boxes) {
      await expect(box).toEqual(boxes[0]);
    }
  },
};

/**
 * Every colour as a filled badge. `contrast-color()` gives the label whichever
 * of black or white contrasts with the fill further, which is not the same as
 * clearing WCAG AA — so the play function measures the ratio colour by colour.
 */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The palette is the test's input; an empty one would assert nothing.
    await expect(themeColors.length).toBeGreaterThan(0);

    for (const color of themeColors) {
      const badge = await canvas.findByText(color);
      const style = getComputedStyle(badge);
      const ink = flatten([style.color]);
      const fill = flatten([style.backgroundColor]);

      // The label is read against the fill alone only while the fill is
      // opaque. A translucent one would let the page behind it in.
      await expect(flatten(['rgb(0, 0, 0)', style.backgroundColor])).toEqual(
        fill,
      );

      // Black or white and nothing else: a dropped `contrast-color()`
      // declaration inherits the page's ink, which on a light page passes the
      // ratio check below while the mechanism under test does nothing.
      await expect({
        color,
        ink: ink.join(),
      }).toEqual({
        color,
        ink: ink[0] < 128 ? '0,0,0' : '255,255,255',
      });

      const ratio = contrastRatio(ink, fill);
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

export const ThemeColorOutlines: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {themeColors.map((color) => (
        <Badge key={color} color={color} appearance="outline">
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
 * the sRGB pixel back: computed colours in these themes are `oklch()`, so a
 * channel cannot be parsed out of the string.
 *
 * Canvas ignores an unparseable `fillStyle` and silently keeps the previous
 * one, so every layer is checked before it is painted.
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
 * Every outline badge on a surface that publishes a contrast colour of its own,
 * which is where the variant is actually used. `bg-primary` is a surface whose
 * ink is not the page's, so a badge reading the page token is dark-on-dark
 * here, at 2.69:1.
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
        <Badge key={color} color={color} appearance="outline">
          {color}
        </Badge>
      ))}
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    await expectSoftBadgesToReadTheSurfaceInk(canvasElement, themeColors);
  },
};

async function expectSoftBadgesToReadTheSurfaceInk(
  canvasElement: HTMLElement,
  labels: readonly string[],
) {
  const canvas = within(canvasElement);

  await expect(labels.length).toBeGreaterThan(0);

  const firstBadge = await canvas.findByText(labels[0]!);
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

  for (const color of labels) {
    const badge = await canvas.findByText(color);

    // The wash is translucent, so the colour behind the label is the wash
    // over the surface — and only while nothing in between paints.
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
}

export const TonesOnAPublishedSurface: Story = {
  render: () => (
    <Surface
      noContainer
      className="bg-primary text-primary-contrast flex flex-wrap gap-3"
    >
      {tones.map((tone) => (
        <Badge key={tone} tone={tone} appearance="outline">
          {tone}
        </Badge>
      ))}
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    await expectSoftBadgesToReadTheSurfaceInk(canvasElement, tones);
  },
};
