import Node from '@codaco/fresco-ui/Node';
import type { NodeColorSequence, NodeShape } from '@codaco/fresco-ui/Node';

import type { Status } from '../genetics/status';
import { StatusMarker } from './StatusMarker';
import { stickerPositions } from './stickerPositions';

export type DiseaseSticker = {
  id: string;
  color: string;
  status: Status;
  atRiskHomozygous?: boolean;
};

/** Maximum number of stickers rendered before showing +N overflow. */
export const STICKER_CAP = 6;

/** Pixel size of the node rendered by <Node size="sm"> (96px = size-24). */
const NODE_SIZE_PX = 96;

/** Pixel size of each sticker marker. */
const STICKER_SIZE_PX = 22;

/** Half-sticker offset so the marker is centred on the perimeter point. */
const STICKER_HALF = STICKER_SIZE_PX / 2;

type StatusStyleInfo = {
  className: string;
  label: string;
};

const STATUS_STYLE: Record<Status, StatusStyleInfo> = {
  affected: { className: 'sticker-solid', label: 'Affected' },
  obligateAffected: {
    className: 'sticker-double-ring',
    label: 'Obligate affected',
  },
  obligateCarrier: { className: 'sticker-ring-dot', label: 'Obligate carrier' },
  atRiskAffected: { className: 'sticker-half', label: 'At risk (affected)' },
  atRiskCarrier: { className: 'sticker-dot', label: 'At risk (carrier)' },
  unknown: { className: 'sticker-question', label: 'Status unknown' },
};

const AT_RISK_LABEL = 'At risk of being affected (homozygous)';

/**
 * Small upward-pointing triangle placed at the bottom-right corner of its
 * parent sticker. Signals that a person may be homozygous-affected for this
 * disease — distinct from the primary-status marker shape.
 *
 * Rendered as a sibling to the sticker overlay (not inside it) so that:
 * - its aria-label is not suppressed by the overlay's aria-hidden ancestor, and
 * - the overflow-hidden / rounded-full clip on the sticker span does not trim it.
 */
function AtRiskHomozygousMarker({
  color,
  x,
  y,
}: {
  color: string;
  x: number;
  y: number;
}) {
  return (
    <span
      aria-label={AT_RISK_LABEL}
      data-atrisk-homozygous-marker
      className="pointer-events-none absolute flex items-center justify-center"
      style={{
        width: 8,
        height: 8,
        left: x - STICKER_HALF + STICKER_SIZE_PX - 8,
        top: y - STICKER_HALF + STICKER_SIZE_PX - 8,
      }}
    >
      <svg viewBox="0 0 8 8" aria-hidden width={8} height={8}>
        <polygon points="4,1 7,7 1,7" fill={color} />
      </svg>
    </span>
  );
}

type StickerMarkerProps = {
  sticker: DiseaseSticker;
  x: number;
  y: number;
  onSelectDisease?: (diseaseId: string) => void;
};

function StickerMarker({ sticker, x, y, onSelectDisease }: StickerMarkerProps) {
  const { className, label } = STATUS_STYLE[sticker.status];

  const { id: stickerId } = sticker;
  const handlePointerClick =
    onSelectDisease !== undefined && stickerId !== undefined
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          onSelectDisease(stickerId);
        }
      : undefined;

  return (
    <span
      aria-hidden
      title={`${label} (${sticker.color})`}
      data-sticker-status={sticker.status}
      className={[
        'absolute rounded-full border-2 border-white overflow-hidden',
        'bg-[var(--surface-1)]',
        className,
        onSelectDisease !== undefined
          ? 'cursor-pointer'
          : 'pointer-events-none',
      ].join(' ')}
      style={{
        width: STICKER_SIZE_PX,
        height: STICKER_SIZE_PX,
        left: x - STICKER_HALF,
        top: y - STICKER_HALF,
      }}
      onClick={handlePointerClick}
    >
      <StatusMarker
        variant="sticker"
        status={sticker.status}
        color={sticker.color}
      />
    </span>
  );
}

type StickerNodeProps = {
  label: string;
  shape: NodeShape;
  diseases: DiseaseSticker[];
  color?: NodeColorSequence;
  selected?: boolean;
  highlighted?: boolean;
  onSelectDisease?: (diseaseId: string) => void;
};

/**
 * Renders a Node with coloured disease-status stickers around its perimeter.
 * Each sticker's colour is the disease colour; its inline SVG encodes the
 * genetic status visually. When more diseases than STICKER_CAP are supplied,
 * the first STICKER_CAP are shown and a +N marker reveals the rest.
 *
 * `onSelectDisease` wires a pointer-only convenience: clicking a sticker
 * selects that disease without disturbing the node-container's focal action.
 * Sticker spans call stopPropagation so the click is not also interpreted as
 * a focal selection. The stickers are aria-hidden; keyboard access for disease
 * selection is through the DiseaseLegend.
 */
export function StickerNode({
  label,
  shape,
  diseases,
  color = 'node-color-seq-1',
  selected,
  highlighted,
  onSelectDisease,
}: StickerNodeProps) {
  const visibleStickers = diseases.slice(0, STICKER_CAP);
  const hiddenCount = diseases.length - visibleStickers.length;
  const stickerCount = visibleStickers.length;

  const positions = stickerPositions(shape, stickerCount);

  // +N count indicator sits at the next perimeter position after the visible stickers.
  // Non-interactive: the DiseaseLegend is the accessible source of truth for all diseases.
  const overflowPositions =
    hiddenCount > 0 ? stickerPositions(shape, stickerCount + 1) : [];
  const overflowPos =
    hiddenCount > 0 ? overflowPositions[stickerCount] : undefined;

  return (
    <div className="relative inline-block">
      <Node
        label={label}
        shape={shape}
        color={color}
        size="sm"
        selected={selected}
        highlighted={highlighted}
      />

      {/* Sticker overlay — aria-hidden; individual StickerMarker spans are
          also aria-hidden. Disease selection via sticker click is a pointer
          convenience only; keyboard path is through DiseaseLegend. */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {visibleStickers.map((sticker, i) => {
          const pos = positions[i];
          if (!pos) return null;
          return (
            <StickerMarker
              key={i}
              sticker={sticker}
              x={pos.x * NODE_SIZE_PX}
              y={pos.y * NODE_SIZE_PX}
              onSelectDisease={onSelectDisease}
            />
          );
        })}
      </span>

      {/* At-risk-homozygous markers — rendered outside the aria-hidden overlay so
          their labels are reachable by assistive technology, and outside the
          overflow-hidden sticker span so the triangle is not clipped. */}
      <span className="pointer-events-none absolute inset-0">
        {visibleStickers.map((sticker, i) => {
          if (sticker.atRiskHomozygous !== true) return null;
          const pos = positions[i];
          if (!pos) return null;
          return (
            <AtRiskHomozygousMarker
              key={i}
              color={sticker.color}
              x={pos.x * NODE_SIZE_PX}
              y={pos.y * NODE_SIZE_PX}
            />
          );
        })}
      </span>

      {/* +N overflow count — non-interactive span (not a button). The legend is
          the accessible surface for selecting a specific disease; nesting a
          button here would create an invalid nested-interactive element inside
          the parent focal container's role="button". */}
      {hiddenCount > 0 && overflowPos && (
        <span
          aria-hidden
          data-overflow-marker
          className="pointer-events-none absolute flex items-center justify-center rounded-full border-2 border-white bg-slate-600 text-[9px] leading-none font-bold text-white"
          style={{
            width: STICKER_SIZE_PX,
            height: STICKER_SIZE_PX,
            left: overflowPos.x * NODE_SIZE_PX - STICKER_HALF,
            top: overflowPos.y * NODE_SIZE_PX - STICKER_HALF,
          }}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}
