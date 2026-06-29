import type { NodeShape } from '@codaco/fresco-ui/Node';

import { STATUS_LABELS, type Status } from '../genetics/status';
import { StatusMarker } from './StatusMarker';

export type StickerProps = {
  status: Status;
  color: string;
  shape: NodeShape;
  atRiskHomozygous?: boolean;
  /**
   * CSS length for the (square) chip: a px number for a fixed size (key glyphs,
   * stories) or a percentage string like `'100%'` to fill a parent-sized slot
   * (the node-scaled perimeter markers and the single-condition node). Defaults
   * to `STICKER_SIZE_PX`.
   */
  size?: number | string;
  /**
   * Fill of the shape behind the status glyph. Defaults to white so the symbol
   * reads on the dark interview theme. Callers pass a background-blended colour
   * for the dimmed state so the chip recedes with its glyph.
   */
  surfaceColor?: string;
  /**
   * Which data attribute the status hook carries:
   * - `'perimeter'` (default): `data-sticker-status` — small all-conditions
   *   marker placed around a node's edge.
   * - `'single'`: `data-notation-status` — the large single-condition node.
   * Consumers and tests distinguish the two display modes by this attribute.
   */
  nodeMode?: 'perimeter' | 'single';
  onClick?: () => void;
};

/** Default pixel size of a perimeter sticker. Change this to rescale everything. */
export const STICKER_SIZE_PX = 28;

const WHITE_BG = 'white';
const VB = 100;
const R = 48;
const C = VB / 2;

/**
 * White shape matching the node's geometry, drawn behind the status glyph so
 * the disease-coloured notation reads against the dark interview theme.
 */
function ShapeBackground({ fill, shape }: { fill: string; shape: NodeShape }) {
  if (shape === 'circle') {
    return <circle cx={C} cy={C} r={R} fill={fill} />;
  }
  return (
    <rect
      x={C - R}
      y={C - R}
      width={R * 2}
      height={R * 2}
      rx={R * 0.2}
      fill={fill}
      transform={shape === 'diamond' ? `rotate(45, ${C}, ${C})` : undefined}
    />
  );
}

/**
 * Upward-pointing triangle anchored to the bottom-right corner, sized at half
 * the sticker so it stays clearly visible. Signals a person may be homozygous-
 * affected. Decorative (aria-hidden): the status is announced as text by the
 * per-node summary in NarrativePedigreeView.
 *
 * `size` is a CSS length: a px number when the sticker has a fixed size, or a
 * percentage string when the sticker fills a percentage-sized parent.
 */
function AtRiskHomozygousTriangle({
  color,
  size,
}: {
  color: string;
  size: number | string;
}) {
  return (
    <span
      data-atrisk-homozygous-marker
      aria-hidden
      className="pointer-events-none absolute right-0 bottom-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 8 8" aria-hidden className="h-full w-full">
        <polygon points="4,1 7,7 1,7" fill={color} />
      </svg>
    </span>
  );
}

/**
 * The universal disease-status symbol: a white-filled shape (circle/square/
 * diamond) carrying the standard pedigree-notation `StatusMarker` glyph drawn in
 * the disease colour, plus an optional at-risk-homozygous corner triangle.
 *
 * Used both as the small perimeter markers on a `StickerNode` (`nodeMode`
 * `'perimeter'`, the default) and as the large single-condition node
 * (`nodeMode='single'`). `Sticker` is position-agnostic — the caller owns
 * absolute positioning and any participant label.
 *
 * The white background is intrinsic so the symbol is self-contained anywhere it
 * renders. The chip and all SVG content are `aria-hidden`; accessible labels
 * live in the caller's wrapper.
 */
export function Sticker({
  status,
  color,
  shape,
  atRiskHomozygous = false,
  size = STICKER_SIZE_PX,
  surfaceColor,
  nodeMode = 'perimeter',
  onClick,
}: StickerProps) {
  const label = STATUS_LABELS[status];
  const isInteractive = onClick !== undefined;
  const statusAttr =
    nodeMode === 'single'
      ? { 'data-notation-status': status }
      : { 'data-sticker-status': status };

  // The triangle is half the chip. A px size yields px; any non-number length
  // (e.g. '100%') yields '50%' so the triangle scales with the parent.
  const triangleSize =
    typeof size === 'number' ? Math.round(size * 0.5) : '50%';

  const handleClick = isInteractive
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick();
      }
    : undefined;

  return (
    <span
      aria-hidden
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        title={label}
        {...statusAttr}
        className={[
          'absolute inset-0',
          isInteractive
            ? 'pointer-events-auto cursor-pointer'
            : 'pointer-events-none',
        ].join(' ')}
        onClick={handleClick}
      >
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          aria-hidden
          className="absolute inset-0 h-full w-full"
        >
          <ShapeBackground fill={surfaceColor ?? WHITE_BG} shape={shape} />
        </svg>
        <StatusMarker status={status} color={color} shape={shape} />
      </span>
      {atRiskHomozygous && (
        <AtRiskHomozygousTriangle color={color} size={triangleSize} />
      )}
    </span>
  );
}
