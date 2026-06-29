import Node from '@codaco/fresco-ui/Node';
import type { NodeColorSequence, NodeShape } from '@codaco/fresco-ui/Node';

import type { Status } from '../genetics/status';
import { Sticker, STICKER_SIZE_PX } from './Sticker';
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

/** Half-sticker offset so the marker is centred on the perimeter point. */
const STICKER_HALF = STICKER_SIZE_PX / 2;

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

      {/* Sticker overlay — aria-hidden; individual Sticker spans are also
          aria-hidden. Disease selection via sticker click is a pointer
          convenience only; keyboard path is through DiseaseLegend.
          The overlay is pointer-events-none; interactive Sticker chips
          re-enable pointer events on themselves. */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {visibleStickers.map((sticker, i) => {
          const pos = positions[i];
          if (!pos) return null;
          return (
            <span
              key={i}
              className="absolute"
              style={{
                left: pos.x * NODE_SIZE_PX - STICKER_HALF,
                top: pos.y * NODE_SIZE_PX - STICKER_HALF,
              }}
            >
              <Sticker
                status={sticker.status}
                color={sticker.color}
                atRiskHomozygous={sticker.atRiskHomozygous}
                interactive={onSelectDisease !== undefined}
                onClick={
                  onSelectDisease !== undefined
                    ? () => onSelectDisease(sticker.id)
                    : undefined
                }
              />
            </span>
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
