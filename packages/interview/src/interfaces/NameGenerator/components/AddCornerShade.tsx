/**
 * Darkens the bottom corner of the stage that the control for adding someone
 * sits in, so the control stands out from the people listed behind it. That
 * is the corner at the end of the line: the right, or the left in a
 * right-to-left interview. A gradient's centre has no logical form, so it is
 * named for each direction.
 */
export default function AddCornerShade() {
  return (
    <div
      data-testid="add-corner-shade"
      className="pointer-events-none absolute inset-e-0 bottom-0 z-10 h-48 w-xl bg-[radial-gradient(ellipse_at_bottom_right,oklch(from_var(--background)_calc(l-0.1)_c_h),transparent_70%)] rtl:bg-[radial-gradient(ellipse_at_bottom_left,oklch(from_var(--background)_calc(l-0.1)_c_h),transparent_70%)]"
    />
  );
}
