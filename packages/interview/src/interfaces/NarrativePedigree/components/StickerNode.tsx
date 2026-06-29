import Node from '@codaco/fresco-ui/Node';
import type { NodeColorSequence, NodeShape } from '@codaco/fresco-ui/Node';

import { STATUS_LABELS, type Status } from '../genetics/status';
import { StatusMarker } from './StatusMarker';
import { stickerPositions } from './stickerPositions';

export type DiseaseSticker = {
  id: string;
  color: string;
  status: Status;
  atRiskHomozygous?: boolean;
};

/** Maximum number of stickers rendered before showing +N overflow. */
export const STICKER_CAP = 8;

/** Pixel size of the node rendered by <Node size="sm"> (96px = size-24). */
const NODE_SIZE_PX = 96;

/** Pixel size of each sticker marker. */
const STICKER_SIZE_PX = 22;

/** Half-sticker offset so the marker is centred on the perimeter point. */
const STICKER_HALF = STICKER_SIZE_PX / 2;

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
 * parent sticker. Visually signals that a person may be homozygous-affected for
 * this disease — distinct from the primary-status marker shape.
 *
 * Decorative: the status it conveys is announced as text by the per-node
 * summary in NarrativePedigreeView, so the triangle is hidden from assistive
 * technology (its aria-hidden overlay). It is still rendered as a sibling to
 * the sticker overlay so the overflow-hidden / rounded-full clip on the sticker
 * span does not trim the triangle.
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
  const className = STATUS_CLASS[sticker.status];
  const label = STATUS_LABELS[sticker.status];

  const handlePointerClick =
    onSelectDisease !== undefined
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          onSelectDisease(sticker.id);
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
        // The overlay parent is pointer-events-none (so clicks fall through to
        // the focal container); an interactive sticker must re-enable pointer
        // events on itself, or its onClick never fires.
        onSelectDisease !== undefined
          ? 'pointer-events-auto cursor-pointer'
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
  const cappedStickers = diseases.slice(0, STICKER_CAP);
  const rawHiddenCount = diseases.length - cappedStickers.length;

  // For square/diamond, anchor arrays are finite (8 slots). When all 8 are used
  // and there are hidden diseases, stickerPositions(shape, count+1)[count] is
  // undefined because there is no 9th anchor. In that case we reserve the last
  // visible slot for the +N badge so the count is never silently lost.
  const overflowNeedsLastSlot =
    rawHiddenCount > 0 &&
    stickerPositions(shape, cappedStickers.length + 1)[
      cappedStickers.length
    ] === undefined;

  const visibleStickers = overflowNeedsLastSlot
    ? cappedStickers.slice(0, STICKER_CAP - 1)
    : cappedStickers;
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

      {/* At-risk-homozygous markers — decorative (aria-hidden); the status is
          announced as text by the per-node summary in NarrativePedigreeView.
          Kept in their own overlay (not the sticker overlay) so the
          overflow-hidden sticker span does not clip the triangle. */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
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
