import { useDirection } from '@base-ui/react/direction-provider';

// Keep overlay arrows outside the rounded-corner zone of floating surfaces.
// The default fresco `rounded` token is 28px, while Base UI's default
// arrowPadding is 5px.
export const POPOVER_ARROW_PADDING = 28;

// Seat the arrow's outline on the popup's border so the two read as one line.
// Base UI positions the arrow against the popup's *padding* box, so 13px is the
// 12px down to ArrowSvg's outline plus half the 2px `Surface floating` border.
// `aspect-square` keeps that one number true on all four sides — a square box
// doesn't shift when turned a quarter turn — and lets POPOVER_ARROW_PADDING
// measure the drawing's real span; it also leaves the box overhanging the
// padding by 17px, hence `pointer-events-none`. The cross-axis margin corrects
// Base UI centring the arrow against the positioner, which includes the border.
// Every side here is a physical one: Base UI reports the side the popup ended up
// on and places the arrow by a distance from the left or the top, in either
// writing direction.
export const POPOVER_ARROW_CLASS_NAME =
  // oxlint-disable-next-line tailwindcss/enforce-logical -- sides and offsets follow Base UI's physical placement; see above
  'pointer-events-none aspect-square data-[side=bottom]:top-[-13px] data-[side=bottom]:ml-[-2px] data-[side=left]:right-[-13px] data-[side=left]:mt-[-2px] data-[side=left]:rotate-90 data-[side=right]:left-[-13px] data-[side=right]:mt-[-2px] data-[side=right]:-rotate-90 data-[side=top]:bottom-[-13px] data-[side=top]:ml-[-2px] data-[side=top]:rotate-180';

/**
 * Where a popup opens beside its trigger. `inline-start` and `inline-end` are
 * the start and end of the line, so a popup opens on the same side as the text
 * in either writing direction; `left` and `right` stay where they are when the
 * interface mirrors, for a popup that means a physical side.
 */
export type PopupSide =
  | 'top'
  | 'bottom'
  | 'inline-start'
  | 'inline-end'
  | 'left'
  | 'right';

/**
 * The physical side for Base UI's positioner. Base UI accepts the logical
 * sides itself, but then reports them back as `data-side="inline-end"`, which
 * the arrow classes above (placed by distances from the left and the top)
 * cannot follow. Resolving the side here keeps every side the arrow sees a
 * physical one.
 */
export function usePhysicalSide(
  side: PopupSide | undefined,
): 'top' | 'bottom' | 'left' | 'right' | undefined {
  const rightToLeft = useDirection() === 'rtl';
  if (side === 'inline-start') return rightToLeft ? 'right' : 'left';
  if (side === 'inline-end') return rightToLeft ? 'left' : 'right';
  return side;
}
