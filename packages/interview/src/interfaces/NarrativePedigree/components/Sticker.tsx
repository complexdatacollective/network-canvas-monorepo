import { STATUS_LABELS, type Status } from '../genetics/status';
import { StatusMarker } from './StatusMarker';

export type StickerProps = {
  status: Status;
  color: string;
  atRiskHomozygous?: boolean;
  sizePx?: number;
  /**
   * Fill of the circular chip disc behind the status glyph. Defaults to white.
   * Callers pass a background-blended colour for the dimmed state so the chip
   * recedes with its glyph instead of staying bright white against the theme.
   */
  surfaceColor?: string;
  onClick?: () => void;
};

/** Default pixel diameter of a sticker chip. Change this to rescale everything. */
export const STICKER_SIZE_PX = 28;

const STATUS_CLASS: Record<Status, string> = {
  affected: 'sticker-solid',
  obligateAffected: 'sticker-double-ring',
  obligateCarrier: 'sticker-ring-dot',
  atRiskAffected: 'sticker-half',
  atRiskCarrier: 'sticker-dot',
  unknown: 'sticker-question',
};

/**
 * Small upward-pointing triangle placed at the bottom-right corner of its
 * parent sticker chip. Visually signals a person may be homozygous-affected.
 *
 * Rendered as a sibling of the chip span (not inside it) so the chip's
 * `overflow-hidden rounded-full` clip does not trim the triangle. The wrapper
 * `Sticker` element uses `relative` positioning so this sits correctly.
 *
 * Decorative: the status is announced as text by the per-node summary in
 * NarrativePedigreeView.
 */
function AtRiskHomozygousTriangle({
  color,
  sizePx,
}: {
  color: string;
  sizePx: number;
}) {
  const triangleSize = Math.round(sizePx * 0.36);
  return (
    <span
      data-atrisk-homozygous-marker
      aria-hidden
      className="pointer-events-none absolute flex items-center justify-center"
      style={{
        width: triangleSize,
        height: triangleSize,
        right: 0,
        bottom: 0,
      }}
    >
      <svg
        viewBox="0 0 8 8"
        aria-hidden
        width={triangleSize}
        height={triangleSize}
      >
        <polygon points="4,1 7,7 1,7" fill={color} />
      </svg>
    </span>
  );
}

/**
 * Renders a single disease-status sticker chip: a white circular disc
 * containing the `StatusMarker variant="sticker"` SVG glyph, with an optional
 * at-risk-homozygous triangle positioned at its bottom-right corner.
 *
 * `Sticker` is position-agnostic — the caller (`StickerNode`) is responsible
 * for absolute positioning. `sizePx` defaults to `STICKER_SIZE_PX` and scales
 * the chip diameter and triangle proportionally.
 *
 * The chip and all SVG content are `aria-hidden`; accessible labels live in the
 * caller's wrapper.
 */
export function Sticker({
  status,
  color,
  atRiskHomozygous = false,
  sizePx = STICKER_SIZE_PX,
  surfaceColor,
  onClick,
}: StickerProps) {
  const statusClass = STATUS_CLASS[status];
  const label = STATUS_LABELS[status];
  const isInteractive = onClick !== undefined;

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
      style={{ width: sizePx, height: sizePx }}
    >
      <span
        aria-hidden
        title={`${label} (${color})`}
        data-sticker-status={status}
        className={[
          'absolute inset-0 rounded-full overflow-hidden',
          surfaceColor === undefined ? 'bg-white' : '',
          statusClass,
          isInteractive
            ? 'pointer-events-auto cursor-pointer'
            : 'pointer-events-none',
        ].join(' ')}
        style={
          surfaceColor !== undefined
            ? { backgroundColor: surfaceColor }
            : undefined
        }
        onClick={handleClick}
      >
        <StatusMarker variant="sticker" status={status} color={color} />
      </span>
      {atRiskHomozygous && (
        <AtRiskHomozygousTriangle color={color} sizePx={sizePx} />
      )}
    </span>
  );
}
