import { type Elevation, generateShadowLayers } from './jwc.ts';

export type { Elevation };

export type ElevationOptions = {
  oomph?: number; // 0-1, affects shadow intensity/opacity
  crispy?: number; // 0-1, affects blur sharpness (0=softer, 1=crisper)
  lightX?: number; // 0-1, horizontal light position (0=left, 1=right)
  lightY?: number; // 0-1, vertical light position (0=top, 1=bottom)
  resolution?: number; // 0-1, affects detail level of shadow layers
  opacityScaleFactor?: number; // multiplier for overall opacity
};

// The shadow colour when no ancestor publishes its background.
const DEFAULT_SHADOW_COLOR = 'oklch(10% 1 180)';

/**
 * The `box-shadow` value of an `elevation-*` utility. The colour is derived
 * from `--published-bg` when an ancestor sets it, so the value is plain CSS
 * that works outside Tailwind too.
 *
 * Exported to this repository as `@codaco/tailwind-config/elevation`, for
 * code that styles elements without Tailwind: the community forum's Discourse
 * theme gives its buttons the same shadow as the shared Button. It is not
 * published (see `publishConfig.exports`).
 */
export function elevationShadow(
  elevation: Elevation,
  options: ElevationOptions = {},
): string {
  const {
    lightX = 0,
    lightY = -0.5,
    oomph = 0.5,
    crispy = 0.5,
    resolution = 0.5,
    opacityScaleFactor = 0.5,
  } = options;

  return generateShadowLayers(
    elevation,
    oomph,
    crispy,
    { x: lightX, y: lightY },
    resolution,
  )
    .map(({ opacity, blurRadius, spreadRadius, offsetX, offsetY }) => {
      const boostedOpacity = opacity * opacityScaleFactor;
      // Clamp chroma
      return `${offsetX} ${offsetY} ${blurRadius} ${spreadRadius} oklch(from var(--published-bg, ${DEFAULT_SHADOW_COLOR}) clamp(0.025, calc(l - 0.5), 0.1) clamp(0.2, calc(c * 2), 0.5) h / ${boostedOpacity})`;
    })
    .join(', ');
}
