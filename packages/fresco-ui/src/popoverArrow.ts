// Keep overlay arrows outside the rounded-corner zone of floating surfaces.
// The default fresco `rounded` token is 28px, while Base UI's default
// arrowPadding is 5px.
export const POPOVER_ARROW_PADDING = 28;

// Seat the arrow's outline on the popup's border so the two read as one line.
// The arrow sits in BaseUISharedPopoverContainer's outer layer, beside the
// surface rather than inside it, so it is positioned against the surface's
// *border* box, which is also the box Base UI measures. 7px is the 8px down to
// ArrowSvg's outline less half the 2px `Surface floating` border.
// `aspect-square` keeps that one number true on all four sides — a square box
// doesn't shift when turned a quarter turn — and lets POPOVER_ARROW_PADDING
// measure the drawing's real span; it also leaves 13px of the box lying over
// the surface, hence `pointer-events-none`.
// Every side here is a physical one: Base UI reports the side the popup ended up
// on and places the arrow by a distance from the left or the top, in either
// writing direction.
export const POPOVER_ARROW_CLASS_NAME =
  // oxlint-disable-next-line tailwindcss/enforce-logical -- sides and offsets follow Base UI's physical placement; see above
  'pointer-events-none aspect-square data-[side=bottom]:top-[-7px] data-[side=left]:right-[-7px] data-[side=left]:rotate-90 data-[side=right]:left-[-7px] data-[side=right]:-rotate-90 data-[side=top]:bottom-[-7px] data-[side=top]:rotate-180';
