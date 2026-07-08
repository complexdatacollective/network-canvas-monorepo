import type { NodeShape } from '@codaco/fresco-ui/Node';

import { STATUS_LABELS, type Status } from '../genetics/status';
import { StatusMarker } from './StatusMarker';

export type StickerProps = {
  status: Status;
  color: string;
  shape: NodeShape;
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

/**
 * The universal disease-status symbol: a white-filled shape (circle/square/
 * diamond) carrying the standard pedigree-notation `StatusMarker` glyph drawn in
 * the disease colour.
 *
 * Used both as the small illustrative glyphs in the condition key (`nodeMode`
 * `'perimeter'`, the default) and as the large single-condition pedigree node
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
        <StatusMarker
          status={status}
          color={color}
          shape={shape}
          surfaceColor={surfaceColor}
        />
      </span>
    </span>
  );
}
