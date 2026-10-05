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
export const POPOVER_ARROW_CLASS_NAME =
  'pointer-events-none aspect-square data-[side=bottom]:top-[-13px] data-[side=bottom]:ml-[-2px] data-[side=left]:right-[-13px] data-[side=left]:mt-[-2px] data-[side=left]:rotate-90 data-[side=right]:left-[-13px] data-[side=right]:mt-[-2px] data-[side=right]:-rotate-90 data-[side=top]:bottom-[-13px] data-[side=top]:ml-[-2px] data-[side=top]:rotate-180';
