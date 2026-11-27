// The node's corner radius as a share of half its width. Node.tsx rounds a
// square and a diamond by half their half width at every size.
const CORNER_SHARE = 0.5;
// The diamond is the square's shape layer turned 45 degrees and scaled down.
const DIAMOND_SCALE = 0.85;

/**
 * How far a ray from the centre of a square with rounded corners travels
 * before it leaves the square, in the square's own frame. `halfSide` is half
 * the side and `corner` the corner radius.
 */
function roundedSquareDistance(
  halfSide: number,
  corner: number,
  ux: number,
  uy: number,
): number {
  const major = Math.max(Math.abs(ux), Math.abs(uy));
  const minor = Math.min(Math.abs(ux), Math.abs(uy));
  // A ray with no direction is treated as leaving through a side.
  if (major === 0) return halfSide;
  const flat = halfSide / major;
  const inset = halfSide - corner;
  if (flat * minor <= inset) return flat;
  // The ray leaves through a corner arc, centred `inset` in from both sides.
  const sum = major + minor;
  return (
    inset * sum +
    Math.sqrt(inset * inset * sum * sum - 2 * inset * inset + corner * corner)
  );
}

/**
 * The distance from a node's centre to the edge of its shape along the unit
 * direction (`ux`, `uy`), for a node `radius` pixels in half width. A custom
 * shape draws artwork of any outline, so it is treated as the circle it
 * falls back to.
 */
export function nodeBoundaryDistance(
  shape: string | undefined,
  radius: number,
  ux: number,
  uy: number,
): number {
  if (shape === 'square') {
    return roundedSquareDistance(radius, radius * CORNER_SHARE, ux, uy);
  }
  if (shape === 'diamond') {
    const halfSide = radius * DIAMOND_SCALE;
    return roundedSquareDistance(
      halfSide,
      halfSide * CORNER_SHARE,
      (ux + uy) / Math.SQRT2,
      (uy - ux) / Math.SQRT2,
    );
  }
  return radius;
}
